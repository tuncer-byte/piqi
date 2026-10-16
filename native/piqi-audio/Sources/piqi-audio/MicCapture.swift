import AVFoundation

/// Kullanıcının mikrofonunu ("Ben" kanalı) yakalar.
final class MicCapture {
    private let engine = AVAudioEngine()
    private var converter: PCMConverter?
    private var configObserver: NSObjectProtocol?
    private(set) var isRunning = false

    init() {
        // Cihaz değişince (kulaklık takıldı, aggregate cihaz oluşturuldu vb.) motor durur; yeniden kur.
        configObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
        ) { [weak self] _ in
            guard let self, self.isRunning else { return }
            log("Mikrofon yapılandırması değişti, yeniden başlatılıyor")
            self.stop()
            do {
                try self.start()
            } catch {
                FrameWriter.shared.writeEvent(["event": "error", "source": "mic", "message": "\(error)"])
            }
        }
    }

    static var permission: String {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "undetermined"
        @unknown default: return "undetermined"
        }
    }

    func start() throws {
        guard !isRunning else { return }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw PiqiError("Mikrofon bulunamadı")
        }
        guard let converter = PCMConverter(input: format) else {
            throw PiqiError("Mikrofon formatı dönüştürülemiyor: \(format)")
        }
        self.converter = converter

        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            guard let out = converter.convert(buffer) else { return }
            AudioRouter.deliver(.me, out)
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw PiqiError("Mikrofon başlatılamadı: \(error.localizedDescription)")
        }
        isRunning = true
    }

    func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRunning = false
    }
}
