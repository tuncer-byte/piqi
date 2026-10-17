import AVFoundation
import Speech

/// Bir ses kanalını Apple'ın cihaz üzerindeki konuşma tanımasıyla yazıya döker.
/// Konuşma, sessizlikle bölünmüş "segment"lere ayrılır: her segment için ara (partial) sonuçlar ve
/// tek bir kesin (final) sonuç olayı yayınlanır. Ses cihazdan çıkmaz (requiresOnDeviceRecognition).
/// Bir ses kanalını yazıya döken motor. macOS 26+ SpeechAnalyzer, öncesi SFSpeechRecognizer kullanır.
protocol ChannelTranscribing: AnyObject {
    func start()
    func stop()
    func append(_ buffer: AVAudioPCMBuffer)
}

/// macOS 14–15 için SFSpeechRecognizer tabanlı tanıma (macOS 26+ AnalyzerTranscriber kullanır).
final class ChannelTranscriber: ChannelTranscribing {
    let channel: Channel
    private let recognizer: SFSpeechRecognizer
    private let silence: TimeInterval
    private let queue: DispatchQueue
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var tasks: [Int: SFSpeechRecognitionTask] = [:]
    private var segment = 0
    private var segmentStart = Date()
    private var lastChange = Date()
    private var texts: [Int: String] = [:]
    /// Segmentin akış zamanındaki başlangıcı ve son konuşma anı (konuşmacı eşleştirmesi için).
    private var spans: [Int: (start: Double, end: Double)] = [:]
    private var converter: PCMConverter?
    private var converterInputFormat: AVAudioFormat?
    private var timer: DispatchSourceTimer?
    private var contextualStrings: [String]
    private var isActive = false

    init(channel: Channel, locale: String, contextualStrings: [String], silence: TimeInterval) throws {
        // İzin yokken her tanıma görevi anında hata verir; sessizce döngüye girmek yerine baştan bildir.
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: break
        case .notDetermined: throw PiqiError("Konuşma tanıma izni henüz verilmedi")
        default: throw PiqiError("Konuşma tanıma izni reddedildi; Sistem Ayarları → Gizlilik ve Güvenlik → Konuşma Tanıma")
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) else {
            throw PiqiError("Konuşma tanıma bu dili desteklemiyor: \(locale)")
        }
        guard recognizer.supportsOnDeviceRecognition else {
            throw PiqiError("\(locale) için cihaz üzerinde konuşma tanıma yok")
        }
        self.channel = channel
        self.recognizer = recognizer
        self.silence = silence
        self.contextualStrings = contextualStrings
        self.queue = DispatchQueue(label: "piqi.stt.\(channel)")
    }

    func start() {
        queue.async {
            guard !self.isActive else { return }
            self.isActive = true
            self.beginSegment()
            let timer = DispatchSource.makeTimerSource(queue: self.queue)
            timer.schedule(deadline: .now() + 0.2, repeating: 0.2)
            timer.setEventHandler { [weak self] in self?.tick() }
            timer.resume()
            self.timer = timer
        }
    }

    func stop() {
        queue.async {
            self.isActive = false
            self.timer?.cancel()
            self.timer = nil
            self.request?.endAudio()
            self.request = nil
            self.tasks.values.forEach { $0.cancel() }
            self.tasks.removeAll()
        }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        queue.async {
            guard self.isActive, let request = self.request else { return }
            let format = request.nativeAudioFormat
            if buffer.format == format {
                request.append(buffer)
                return
            }
            if self.converterInputFormat != buffer.format {
                self.converter = PCMConverter(input: buffer.format, output: format)
                self.converterInputFormat = buffer.format
            }
            if let converted = self.converter?.convert(buffer) { request.append(converted) }
        }
    }

    /// Konuşma bittiyse (sessizlik) veya segment çok uzadıysa segmenti kapatıp yenisini başlatır.
    private func tick() {
        guard isActive else { return }
        let text = texts[segment] ?? ""
        let quiet = Date().timeIntervalSince(lastChange)
        let long = Date().timeIntervalSince(segmentStart) > 45
        if (!text.isEmpty && quiet > silence) || long {
            finishSegment()
        }
    }

    private func finishSegment() {
        guard isActive else { return }
        request?.endAudio()
        beginSegment()
    }

    private func beginSegment() {
        guard isActive else { return }
        segment += 1
        let id = segment
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        request.addsPunctuation = true
        request.taskHint = .dictation
        request.contextualStrings = contextualStrings
        self.request = request
        segmentStart = Date()
        lastChange = Date()
        if channel == .them { spans[id] = (SpeakerDiarizer.shared.now, SpeakerDiarizer.shared.now) }

        tasks[id] = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            self.queue.async { self.handle(id: id, result: result, error: error) }
        }
    }

    private func handle(id: Int, result: SFSpeechRecognitionResult?, error: Error?) {
        guard isActive else { return }
        if let result {
            let text = result.bestTranscription.formattedString
            if text != texts[id] {
                texts[id] = text
                if id == segment { lastChange = Date() }
                if channel == .them, let span = spans[id] { spans[id] = (span.start, SpeakerDiarizer.shared.now) }
                if !result.isFinal { emit(id: id, text: text, final: false) }
            }
            if result.isFinal {
                complete(id: id)
                return
            }
        }
        if error != nil {
            // "Konuşma algılanmadı" gibi hatalar olağan; segmentte metin varsa kesinleştir.
            complete(id: id)
            if id == segment, isActive { beginSegment() }
        }
    }

    private func complete(id: Int) {
        guard tasks.removeValue(forKey: id) != nil else { return }
        let span = spans.removeValue(forKey: id)
        if let text = texts.removeValue(forKey: id), !text.isEmpty {
            // Cümle, söylendiği aralıkta en çok konuşan kişiye atanır.
            let speaker = span.flatMap { SpeakerDiarizer.shared.dominantSpeaker(start: $0.start - 0.5, end: $0.end + 0.3) }
            emit(id: id, text: text, final: true, speaker: speaker)
        }
    }

    private func emit(id: Int, text: String, final: Bool, speaker: Int? = nil) {
        var event: [String: Any] = [
            "event": "transcript",
            "channel": channel == .me ? "me" : "them",
            "segment": id,
            "text": text,
            "final": final,
            "t": Date().timeIntervalSince1970 * 1000,
        ]
        if let speaker { event["speaker"] = speaker }
        FrameWriter.shared.writeEvent(event)
    }

    static func requestPermission(_ done: @escaping (String) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            done(permissionName(status))
        }
    }

    static var permission: String { permissionName(SFSpeechRecognizer.authorizationStatus()) }

    private static func permissionName(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "undetermined"
        @unknown default: return "undetermined"
        }
    }
}

/// Ses kanallarını hem stdout'a hem (açıksa) konuşma tanımaya dağıtır.
enum AudioRouter {
    private static let lock = NSLock()
    private static var transcribers: [Channel: any ChannelTranscribing] = [:]
    /// Piqi konuşurken mikrofon tanıması duraklatılır (yankı koruması).
    static var micMuted = false

    static func deliver(_ channel: Channel, _ buffer: AVAudioPCMBuffer) {
        guard let samples = buffer.int16Samples else { return }
        FrameWriter.shared.writeAudio(channel, samples: samples)
        lock.lock()
        let transcriber = transcribers[channel]
        lock.unlock()
        if channel == .them && SpeakerDiarizer.shared.enabled { SpeakerDiarizer.shared.append(buffer) }
        if channel == .me && micMuted { return }
        transcriber?.append(buffer)
    }

    static func configure(locale: String, channels: [Channel], contextualStrings: [String]) throws {
        stopAll()
        var created: [Channel: any ChannelTranscribing] = [:]
        for channel in channels {
            // Kendi konuşmamızda daha kısa sessizlik yeterli: komutlar ve prova cevapları çabuk kesinleşsin.
            let silence: TimeInterval = channel == .me ? 1.2 : 0.9
            let t = try makeTranscriber(channel: channel, locale: locale, contextualStrings: contextualStrings, silence: silence)
            t.start()
            created[channel] = t
        }
        lock.lock()
        transcribers = created
        lock.unlock()
    }

    /// macOS 26+ SpeechAnalyzer: uzun konuşmayı kesintisiz akışla tanır, iki kanal aynı anda çalışır ve
    /// konuşma tanıma izni gerektirmez. Öncesinde SFSpeechRecognizer.
    private static func makeTranscriber(channel: Channel, locale: String, contextualStrings: [String], silence: TimeInterval) throws -> any ChannelTranscribing {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            return AnalyzerTranscriber(channel: channel, locale: locale, contextualStrings: contextualStrings, silence: silence)
        }
        #endif
        return try ChannelTranscriber(channel: channel, locale: locale, contextualStrings: contextualStrings, silence: silence)
    }

    static func stopAll() {
        lock.lock()
        let current = transcribers
        transcribers = [:]
        lock.unlock()
        current.values.forEach { $0.stop() }
    }
}
