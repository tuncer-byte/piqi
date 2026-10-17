import AVFoundation
import AudioToolbox
import CoreAudio

/// Toplantı uygulamalarının sesini ("Karşı taraf" kanalı) Core Audio Process Tap ile yakalar (macOS 14.4+).
/// Sanal ses sürücüsü gerektirmez; kullanıcı aynı anda sesi duymaya devam eder.
final class SystemAudioTap {
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggregateID = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?
    private let ioQueue = DispatchQueue(label: "piqi.systemtap", qos: .userInteractive)
    private let controlQueue = DispatchQueue(label: "piqi.systemtap.control")
    private(set) var isRunning = false
    private var bundleIDs: [String] = []
    private var outputListener: AudioObjectPropertyListenerBlock?
    private var restartingForOutputChange = false

    /// - Parameter bundleIDs: Boşsa tüm sistem sesi dinlenir; doluysa yalnızca bu bundle ID önekleriyle eşleşen süreçler.
    func start(bundleIDs: [String]) throws {
        try controlQueue.sync { try startLocked(bundleIDs: bundleIDs) }
    }

    private func startLocked(bundleIDs: [String]) throws {
        guard !isRunning else { return }
        self.bundleIDs = bundleIDs

        let description: CATapDescription
        if bundleIDs.isEmpty {
            // Piqi'nin kendi sesi (TTS) karşı taraf kanalına karışmasın.
            description = CATapDescription(stereoGlobalTapButExcludeProcesses: AudioProcesses.ownSpeechProcesses())
        } else {
            let processes = try AudioProcesses.list().filter { process in
                bundleIDs.contains { process.bundleID.hasPrefix($0) }
            }
            guard !processes.isEmpty else {
                throw PiqiError("Seçili uygulamalardan ses üreten süreç bulunamadı: \(bundleIDs.joined(separator: ", "))")
            }
            description = CATapDescription(stereoMixdownOfProcesses: processes.map(\.objectID))
        }
        description.uuid = UUID()
        description.name = "Piqi"
        description.isPrivate = true
        description.muteBehavior = .unmuted

        do {
            try check(AudioHardwareCreateProcessTap(description, &tapID), "Process tap oluşturulamadı")

            var streamDescription = try CoreAudio.get(
                tapID, kAudioTapPropertyFormat, default: AudioStreamBasicDescription()
            )
            guard let format = AVAudioFormat(streamDescription: &streamDescription),
                  let converter = PCMConverter(input: format)
            else {
                throw PiqiError("Tap ses formatı desteklenmiyor")
            }

            let outputUID = try CoreAudio.defaultOutputDeviceUID()
            let aggregate: [String: Any] = [
                kAudioAggregateDeviceNameKey: "Piqi Tap",
                kAudioAggregateDeviceUIDKey: UUID().uuidString,
                kAudioAggregateDeviceMainSubDeviceKey: outputUID,
                kAudioAggregateDeviceIsPrivateKey: true,
                kAudioAggregateDeviceIsStackedKey: false,
                kAudioAggregateDeviceTapAutoStartKey: true,
                kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
                kAudioAggregateDeviceTapListKey: [[
                    kAudioSubTapDriftCompensationKey: true,
                    kAudioSubTapUIDKey: description.uuid.uuidString,
                ]],
            ]
            try check(
                AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &aggregateID),
                "Aggregate cihaz oluşturulamadı"
            )

            try check(
                AudioDeviceCreateIOProcIDWithBlock(&procID, aggregateID, ioQueue) { _, inputData, _, _, _ in
                    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: inputData, deallocator: nil),
                          let out = converter.convert(buffer)
                    else { return }
                    AudioRouter.deliver(.them, out)
                },
                "IO proc oluşturulamadı"
            )
            try check(AudioDeviceStart(aggregateID, procID), "Sistem sesi başlatılamadı (izin verilmemiş olabilir)")
            isRunning = true
            installOutputListener()
        } catch {
            teardown()
            throw error
        }
    }

    func stop() {
        controlQueue.sync { stopLocked() }
    }

    private func stopLocked() {
        teardown()
        isRunning = false
    }

    private func teardown() {
        if aggregateID != kAudioObjectUnknown {
            if let procID {
                AudioDeviceStop(aggregateID, procID)
                AudioDeviceDestroyIOProcID(aggregateID, procID)
            }
            AudioHardwareDestroyAggregateDevice(aggregateID)
        }
        if tapID != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(tapID)
        }
        procID = nil
        aggregateID = AudioObjectID(kAudioObjectUnknown)
        tapID = AudioObjectID(kAudioObjectUnknown)
    }

    private func installOutputListener() {
        guard outputListener == nil else { return }
        let system = AudioObjectID(kAudioObjectSystemObject)
        var address = CoreAudio.address(kAudioHardwarePropertyDefaultOutputDevice)
        let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            self?.rebuildForOutputChange()
        }
        guard AudioObjectAddPropertyListenerBlock(system, &address, controlQueue, listener) == noErr else {
            log("Varsayılan ses çıkışı değişiklikleri izlenemedi; sistem sesi yakalama sürdürülecek")
            return
        }
        outputListener = listener
    }

    private func rebuildForOutputChange() {
        guard isRunning, !restartingForOutputChange else { return }
        restartingForOutputChange = true
        defer { restartingForOutputChange = false }
        let selectedBundles = bundleIDs
        log("Varsayılan ses çıkışı değişti; sistem sesi tap'ı yeniden kuruluyor")
        stopLocked()
        do {
            try startLocked(bundleIDs: selectedBundles)
        } catch {
            FrameWriter.shared.writeEvent(["event": "sourceStatus", "channel": "them", "running": false])
            FrameWriter.shared.writeEvent(["event": "error", "source": "system", "message": "Ses çıkışı değiştikten sonra yakalama başlatılamadı: \(error)"])
        }
    }

    deinit {
        if let outputListener {
            var address = CoreAudio.address(kAudioHardwarePropertyDefaultOutputDevice)
            AudioObjectRemovePropertyListenerBlock(
                AudioObjectID(kAudioObjectSystemObject), &address, controlQueue, outputListener
            )
        }
    }
}

struct AudioProcess {
    let objectID: AudioObjectID
    let pid: pid_t
    let bundleID: String
    let isRunningOutput: Bool
    /// Süreç mikrofon (ses girişi) kullanıyor mu; toplantı algılamanın ana sinyali.
    let isRunningInput: Bool

    var json: [String: Any] {
        ["pid": pid, "bundleId": bundleID, "isRunningOutput": isRunningOutput, "isRunningInput": isRunningInput]
    }
}

enum AudioProcesses {
    /// Bu sürecin ve sistem konuşma sentezi servisinin ses nesneleri.
    static func ownSpeechProcesses() -> [AudioObjectID] {
        let pid = ProcessInfo.processInfo.processIdentifier
        let processes = (try? list()) ?? []
        return processes
            .filter { $0.pid == pid || $0.bundleID.contains("speechsynthesis") }
            .map(\.objectID)
    }

    static func list() throws -> [AudioProcess] {
        let ids: [AudioObjectID] = try CoreAudio.getArray(
            AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyProcessObjectList
        )
        return ids.compactMap { id in
            guard let bundleID = try? CoreAudio.getString(id, kAudioProcessPropertyBundleID), !bundleID.isEmpty
            else { return nil }
            let pid = (try? CoreAudio.get(id, kAudioProcessPropertyPID, default: pid_t(-1))) ?? -1
            let output = (try? CoreAudio.get(id, kAudioProcessPropertyIsRunningOutput, default: UInt32(0))) ?? 0
            let input = (try? CoreAudio.get(id, kAudioProcessPropertyIsRunningInput, default: UInt32(0))) ?? 0
            return AudioProcess(objectID: id, pid: pid, bundleID: bundleID, isRunningOutput: output != 0, isRunningInput: input != 0)
        }
    }
}

/// Core Audio özellik okuma yardımcıları.
enum CoreAudio {
    static func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    static func get<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, default value: T) throws -> T {
        var addr = address(selector)
        var result = value
        var size = UInt32(MemoryLayout<T>.size)
        let status = withUnsafeMutableBytes(of: &result) { bytes in
            AudioObjectGetPropertyData(object, &addr, 0, nil, &size, bytes.baseAddress!)
        }
        try check(status, "Özellik okunamadı: \(selector)")
        return result
    }

    static func getArray<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) throws -> [T] {
        var addr = address(selector)
        var size: UInt32 = 0
        try check(AudioObjectGetPropertyDataSize(object, &addr, 0, nil, &size), "Özellik boyutu okunamadı: \(selector)")
        let count = Int(size) / MemoryLayout<T>.stride
        guard count > 0 else { return [] }
        let pointer = UnsafeMutablePointer<T>.allocate(capacity: count)
        defer { pointer.deallocate() }
        try check(AudioObjectGetPropertyData(object, &addr, 0, nil, &size, pointer), "Özellik okunamadı: \(selector)")
        return Array(UnsafeBufferPointer(start: pointer, count: count))
    }

    static func getString(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) throws -> String {
        var addr = address(selector)
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        try check(AudioObjectGetPropertyData(object, &addr, 0, nil, &size, &value), "Metin özelliği okunamadı: \(selector)")
        return value?.takeRetainedValue() as String? ?? ""
    }

    static func defaultOutputDeviceUID() throws -> String {
        let device = try get(
            AudioObjectID(kAudioObjectSystemObject),
            kAudioHardwarePropertyDefaultSystemOutputDevice,
            default: AudioDeviceID(kAudioObjectUnknown)
        )
        return try getString(device, kAudioDevicePropertyDeviceUID)
    }
}

struct PiqiError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func check(_ status: OSStatus, _ message: @autoclosure () -> String) throws {
    guard status == noErr else { throw PiqiError("\(message()) (OSStatus \(status))") }
}
