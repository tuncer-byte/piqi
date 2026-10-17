import AVFoundation
import CoreMedia
import Speech

#if compiler(>=6.2)

/// macOS 26+ konuşma tanıma: SpeechAnalyzer + DictationTranscriber, cihaz üzerinde.
///
/// SFSpeechRecognizer'ın aksine uzun konuşmayı tek bir kesintisiz akışta tanır: cümle içindeki duraklamada
/// görev bitmez, kelime düşmez; iki kanal (ben, karşı taraf) aynı anda çalışır ve konuşma tanıma izni gerekmez.
/// Cümle sınırını dikte modeli belirler (duraklamada kesin sonuç verir); kesin sonuç geldiğinde ve `silence`
/// süresince yeni konuşma yoksa cümle tek bir kesin (final) olay olarak yayınlanır. Model kesinleştirmezse
/// yedek zamanlayıcı eldeki metni yayınlar.
@available(macOS 26.0, *)
final class AnalyzerTranscriber: ChannelTranscribing, @unchecked Sendable {
    let channel: Channel
    private let locale: Locale
    private let contextualStrings: [String]
    private let silence: TimeInterval
    private let queue: DispatchQueue

    private var analyzer: SpeechAnalyzer?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var tasks: [Task<Void, Never>] = []
    private var format: AVAudioFormat?
    private var converter: PCMConverter?
    private var converterInputFormat: AVAudioFormat?
    private var timer: DispatchSourceTimer?
    private var isActive = false

    /// Henüz yayınlanmamış cümle: kesinleşmiş parçalar + üzerinde çalışılan (volatile) kısım.
    private var finalized = ""
    private var volatile = ""
    private var segment = 0
    private var lastChange = Date()
    private var utteranceStart = Date()
    /// Yedek zamanlayıcı kesinleşmemiş metni yayınladı; modelin aynı kelimeler için sonradan gelen kesin sonucu atılır.
    private var dropNextFinal = false
    /// Cümle boyunca gelen sesin en yüksek RMS seviyesi; gerçek ses yoksa (tanıyıcı sessizlikte uydurduysa) atılır.
    private var level: Float = 0
    private var span: (start: Double, end: Double)?
    /// Analizöre verilen örnek sayısı (16 kHz); tamponların zaman damgası.
    private var samples: Int64 = 0

    /// ~ -48 dBFS: konuşma bunun çok üstünde, sessizlik ve oda uğultusu altında kalır.
    private static let speechLevel: Float = 0.004
    /// Bir cümle en fazla bu kadar sürer; uzun konuşmada ara kesin sonuç yayınlanır.
    private static let maxUtterance: TimeInterval = 30
    /// Model bu kadar süre yeni sonuç vermez ve kesinleştirmezse eldeki metin yine de yayınlanır.
    private static let fallbackQuiet: TimeInterval = 3

    init(channel: Channel, locale: String, contextualStrings: [String], silence: TimeInterval) {
        self.channel = channel
        self.locale = Locale(identifier: locale)
        self.contextualStrings = contextualStrings
        self.silence = silence
        self.queue = DispatchQueue(label: "piqi.analyzer.\(channel)")
    }

    func start() {
        queue.async {
            guard !self.isActive else { return }
            self.isActive = true
            let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream(bufferingPolicy: .bufferingNewest(400))
            self.input = continuation
            let timer = DispatchSource.makeTimerSource(queue: self.queue)
            timer.schedule(deadline: .now() + 0.2, repeating: 0.2)
            timer.setEventHandler { [weak self] in self?.tick() }
            timer.resume()
            self.timer = timer
            self.tasks.append(Task { [weak self] in await self?.run(stream: stream) })
        }
    }

    func stop() {
        queue.async {
            guard self.isActive else { return }
            self.isActive = false
            self.timer?.cancel()
            self.timer = nil
            self.input?.finish()
            self.input = nil
            let analyzer = self.analyzer
            self.analyzer = nil
            self.tasks.forEach { $0.cancel() }
            self.tasks.removeAll()
            Task { await analyzer?.cancelAndFinishNow() }
        }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        queue.async {
            guard self.isActive, let input = self.input, let format = self.format else { return }
            let converted: AVAudioPCMBuffer?
            if buffer.format == format {
                converted = buffer
            } else {
                if self.converterInputFormat != buffer.format {
                    self.converter = PCMConverter(input: buffer.format, output: format)
                    self.converterInputFormat = buffer.format
                }
                converted = self.converter?.convert(buffer)
            }
            guard let converted else { return }
            self.level = max(self.level, rmsLevel(converted))
            let time = CMTime(value: self.samples, timescale: CMTimeScale(format.sampleRate))
            self.samples += Int64(converted.frameLength)
            input.yield(AnalyzerInput(buffer: converted, bufferStartTime: time))
        }
    }

    // MARK: - Analiz

    private func run(stream: AsyncStream<AnalyzerInput>) async {
        // Kısa dikte: duraklamada cümleyi kendisi kesinleştirir; uzun dikte kesinleştirmeyi geciktirir.
        let transcriber = DictationTranscriber(locale: locale, preset: .progressiveShortDictation)
        do {
            try await ensureAssets(for: transcriber)
            guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
                throw PiqiError("Konuşma tanıma için uygun ses biçimi bulunamadı")
            }
            let analyzer = SpeechAnalyzer(modules: [transcriber])
            if !contextualStrings.isEmpty {
                let context = AnalysisContext()
                context.contextualStrings[.general] = contextualStrings
                try await analyzer.setContext(context)
            }
            let ready: Bool = queue.sync {
                guard self.isActive else { return false }
                self.format = format
                self.analyzer = analyzer
                return true
            }
            guard ready else { return }
            try await analyzer.start(inputSequence: stream)
            for try await result in transcriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                let isFinal = result.isFinal
                queue.async { self.receive(text: text, isFinal: isFinal) }
            }
        } catch is CancellationError {
            return
        } catch {
            let active = queue.sync { isActive }
            guard active else { return }
            writer.writeEvent([
                "event": "error",
                "source": "stt",
                "message": "Konuşma tanıma başlatılamadı (\(channel == .me ? "mikrofon" : "karşı taraf")): \(error.localizedDescription)",
            ])
        }
    }

    /// Dil modeli cihazda yoksa indirir (ilk kullanımda bir kez).
    private func ensureAssets(for transcriber: DictationTranscriber) async throws {
        let installed = await DictationTranscriber.installedLocales.map { $0.identifier(.bcp47) }
        if installed.contains(locale.identifier(.bcp47)) { return }
        guard await DictationTranscriber.supportedLocale(equivalentTo: locale) != nil else {
            throw PiqiError("\(locale.identifier) için cihaz üzerinde konuşma tanıma yok")
        }
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
    }

    // MARK: - Cümleler

    private func receive(text: String, isFinal: Bool) {
        guard isActive else { return }
        if isFinal && dropNextFinal {
            dropNextFinal = false
            volatile = ""
            return
        }
        let before = current
        if isFinal {
            if !text.isEmpty { finalized = finalized.isEmpty ? text : "\(finalized) \(text)" }
            volatile = ""
        } else {
            volatile = text
        }
        let now = current
        if now != before {
            if before.isEmpty {
                utteranceStart = Date()
                if channel == .them { span = (SpeakerDiarizer.shared.now, SpeakerDiarizer.shared.now) }
            }
            // Kesin sonuç yeni konuşma değildir (aynı kelimelerin kesinleşmesidir); sessizlik sayacını sıfırlamaz.
            if !isFinal { lastChange = Date() }
            if channel == .them, let s = span { span = (s.start, SpeakerDiarizer.shared.now) }
            if level >= Self.speechLevel, !now.isEmpty { emit(text: now, final: false) }
        }
        if isFinal { flushIfSettled() }
    }

    private var current: String {
        [finalized, volatile].filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// Kesinleşen cümle sessizlik bekliyorsa yayınla; model kesinleştirmediyse ya da cümle çok uzadıysa yedek
    /// olarak eldeki metni yayınla. (`finalize` çağrılmaz: sonrasında analizör yeni sonuç üretmeyi bırakabiliyor.)
    private func tick() {
        guard isActive, !current.isEmpty else { return }
        let quiet = Date().timeIntervalSince(lastChange)
        if volatile.isEmpty, quiet > silence {
            flush()
        } else if quiet > Self.fallbackQuiet || Date().timeIntervalSince(utteranceStart) > Self.maxUtterance {
            if !volatile.isEmpty { dropNextFinal = true }
            flush()
        }
    }

    /// Bekleyen kısım kalmadıysa ve konuşma durduysa cümleyi yayınla.
    private func flushIfSettled() {
        guard volatile.isEmpty, !finalized.isEmpty, Date().timeIntervalSince(lastChange) > silence else { return }
        flush()
    }

    private func flush() {
        let text = current
        let heard = level >= Self.speechLevel
        let speaker = span.flatMap { SpeakerDiarizer.shared.dominantSpeaker(start: $0.start - 0.5, end: $0.end + 0.3) }
        finalized = ""
        volatile = ""
        level = 0
        span = nil
        guard !text.isEmpty, heard else { return }
        emit(text: text, final: true, speaker: speaker)
        segment += 1
    }

    private func emit(text: String, final: Bool, speaker: Int? = nil) {
        var event: [String: Any] = [
            "event": "transcript",
            "channel": channel == .me ? "me" : "them",
            "segment": segment,
            "text": text,
            "final": final,
            "t": Date().timeIntervalSince1970 * 1000,
        ]
        if let speaker { event["speaker"] = speaker }
        writer.writeEvent(event)
    }
}

/// Tamponun RMS seviyesi (0–1); 16-bit tamsayı ve 32-bit kayan nokta biçimleri.
private func rmsLevel(_ buffer: AVAudioPCMBuffer) -> Float {
    let frames = Int(buffer.frameLength)
    guard frames > 0 else { return 0 }
    var sum: Float = 0
    if let data = buffer.int16ChannelData {
        for i in 0..<frames {
            let v = Float(data[0][i]) / 32_768
            sum += v * v
        }
    } else if let data = buffer.floatChannelData {
        for i in 0..<frames { sum += data[0][i] * data[0][i] }
    } else {
        return 1
    }
    return (sum / Float(frames)).squareRoot()
}

#endif
