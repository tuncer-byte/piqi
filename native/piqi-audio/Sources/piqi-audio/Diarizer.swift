import AVFoundation
import FluidAudio

/// Karşı taraf kanalında "kim konuşuyor" ayrımı (FluidAudio LS-EEND, cihaz üzerinde).
/// Konuşmacılar yalnızca bu oturumda numaralanır (1, 2, 3…); ses izi/biyometrik veri saklanmaz
/// ve dışarı verilmez. Oturum (dinleme) bitince her şey sıfırlanır.
final class SpeakerDiarizer: @unchecked Sendable {
    static let shared = SpeakerDiarizer()

    private struct Segment {
        let speaker: Int
        let start: Double
        let end: Double
    }

    private struct LoadedDiarizer: @unchecked Sendable {
        let model: LSEENDModel
        let diarizer: LSEENDDiarizer
    }

    private let queue = DispatchQueue(label: "piqi.diarizer")
    private var diarizer: LSEENDDiarizer?
    /// İndirilmiş model; yeni oturumda diyarizör bundan yeniden kurulur (tekrar indirme yok).
    private var model: LSEENDModel?
    private var loading = false
    private(set) var enabled = false
    /// Kanaldan gelen toplam örnek (16 kHz); akış zamanının kaynağı.
    private var samples = 0
    /// Diyarizör hazır olduğunda akış zamanı (sn): segment zamanları buna göre kaydırılır.
    private var origin: Double = 0
    private var finalized: [Segment] = []
    private var tentative: [Segment] = []
    private var talk: [Int: Double] = [:]
    private var lastReport = Date.distantPast

    /// Model varyantı. Varsayılan dihard3 (toplantı/çok konuşmacı, en fazla 10 kişi).
    static var variant: LSEENDVariant {
        switch ProcessInfo.processInfo.environment["PIQI_DIARIZER_VARIANT"] {
        case "ami": return .ami
        case "callhome": return .callhome
        case "dihard2": return .dihard2
        default: return .dihard3
        }
    }

    var isReady: Bool { queue.sync { diarizer != nil } }

    /// Akış zamanı (sn).
    var now: Double { queue.sync { Double(samples) / 16_000 } }

    func setEnabled(_ on: Bool, cacheDirectory: URL?) {
        queue.async {
            self.enabled = on
            if !on {
                self.resetLocked()
                self.diarizer = nil
                FrameWriter.shared.writeEvent(["event": "diarizer", "status": "off"])
                return
            }
            guard self.diarizer == nil, !self.loading else { return }
            self.loading = true
            FrameWriter.shared.writeEvent(["event": "diarizer", "status": "loading"])
            Task {
                do {
                    // İlk kullanımda model (≈ birkaç MB) indirilir ve önbelleğe alınır.
                    let model = try await LSEENDModel.loadFromHuggingFace(variant: Self.variant, cacheDirectory: cacheDirectory)
                    let diarizer = try LSEENDDiarizer(model: model)
                    let loaded = LoadedDiarizer(model: model, diarizer: diarizer)
                    self.queue.async {
                        self.loading = false
                        self.model = loaded.model
                        guard self.enabled else { return }
                        self.diarizer = loaded.diarizer
                        self.origin = Double(self.samples) / 16_000
                        FrameWriter.shared.writeEvent([
                            "event": "diarizer", "status": "ready", "maxSpeakers": loaded.diarizer.numSpeakers ?? 0,
                        ])
                    }
                } catch {
                    self.queue.async { self.loading = false }
                    FrameWriter.shared.writeEvent(["event": "diarizer", "status": "error", "message": "\(error)"])
                }
            }
        }
    }

    /// Yeni dinleme oturumu: konuşmacı numaraları sıfırlanır.
    func reset() {
        queue.async { self.resetLocked() }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        guard let data = buffer.int16ChannelData else { return }
        let count = Int(buffer.frameLength)
        let floats = (0..<count).map { Float(data[0][$0]) / 32_768 }
        queue.async {
            self.samples += count
            guard self.enabled, let diarizer = self.diarizer else { return }
            do {
                try diarizer.addAudio(floats, sourceSampleRate: 16_000)
                if let update = try diarizer.process() { self.apply(update) }
            } catch {
                FrameWriter.shared.writeEvent(["event": "diarizer", "status": "error", "message": "\(error)"])
                self.diarizer = nil
            }
        }
    }

    /// [start, end] aralığında en çok konuşan kişi (1'den başlayan numara).
    func dominantSpeaker(start: Double, end: Double) -> Int? {
        queue.sync {
            var overlap: [Int: Double] = [:]
            for s in finalized + tentative {
                let o = min(end, s.end) - max(start, s.start)
                if o > 0 { overlap[s.speaker, default: 0] += o }
            }
            return overlap.max { $0.value < $1.value }.map { $0.key + 1 }
        }
    }

    private func apply(_ update: DiarizerTimelineUpdate) {
        for s in update.finalizedSegments {
            let segment = Segment(speaker: s.speakerIndex, start: origin + Double(s.startTime), end: origin + Double(s.endTime))
            finalized.append(segment)
            talk[s.speakerIndex, default: 0] += Double(s.duration)
        }
        tentative = update.tentativeSegments.map {
            Segment(speaker: $0.speakerIndex, start: origin + Double($0.startTime), end: origin + Double($0.endTime))
        }
        // Bellek: yalnızca son 10 dakikanın segmentleri tutulur.
        let cutoff = Double(samples) / 16_000 - 600
        finalized.removeAll { $0.end < cutoff }
        report()
    }

    private func report() {
        guard Date().timeIntervalSince(lastReport) > 1 else { return }
        lastReport = Date()
        // 2 sn'den az konuşan "konuşmacılar" genelde gürültü/ses efektidir; sayılmaz.
        let speakers = talk.filter { $0.value >= 2 }.map { ["id": $0.key + 1, "talkSeconds": $0.value] }
        FrameWriter.shared.writeEvent(["event": "speakers", "items": speakers])
    }

    private func resetLocked() {
        samples = 0
        origin = 0
        finalized = []
        tentative = []
        talk = [:]
        // LS-EEND akış durumu taşır; yeni oturum için aynı modelden temiz bir örnek kur.
        if enabled, let model { diarizer = try? LSEENDDiarizer(model: model) }
    }
}
