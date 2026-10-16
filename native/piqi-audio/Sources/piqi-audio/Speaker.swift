import AVFoundation

/// Piqi'nin sesli cevapları: macOS'un yerleşik konuşma sentezi veya hazır ses dosyaları (EMA Lightning).
/// Çalma bu süreçte yapıldığı için Piqi'nin sesi sistem sesi yakalamasından hariç tutulur.
final class Speaker: NSObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate, @unchecked Sendable {
    private let synthesizer = AVSpeechSynthesizer()
    private var ids: [ObjectIdentifier: String] = [:]
    /// Sırayla çalınacak ses dosyaları (cümle cümle seslendirme).
    private var fileQueue: [(id: String, url: URL)] = []
    private var player: AVAudioPlayer?
    private var playerID: String?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(id: String, text: String, language: String, voiceID: String?, rate: Float?) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voiceID.flatMap(AVSpeechSynthesisVoice.init(identifier:))
            ?? AVSpeechSynthesisVoice(language: language)
        if let rate { utterance.rate = rate }
        ids[ObjectIdentifier(utterance)] = id
        synthesizer.speak(utterance)
    }

    func play(id: String, path: String) {
        fileQueue.append((id, URL(fileURLWithPath: path)))
        if player == nil { playNext() }
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        let pending = fileQueue
        fileQueue.removeAll()
        player?.stop()
        if let current = playerID { finishedFile(current, cancelled: true) }
        pending.forEach { finishedFile($0.id, cancelled: true) }
    }

    private func playNext() {
        guard !fileQueue.isEmpty else { return }
        let next = fileQueue.removeFirst()
        do {
            let player = try AVAudioPlayer(contentsOf: next.url)
            player.delegate = self
            self.player = player
            playerID = next.id
            AudioRouter.micMuted = true
            FrameWriter.shared.writeEvent(["event": "speakStart", "id": next.id])
            player.play()
        } catch {
            FrameWriter.shared.writeEvent(["event": "error", "source": "tts", "message": "\(error)"])
            finishedFile(next.id, cancelled: true)
            playNext()
        }
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        guard let id = playerID else { return }
        finishedFile(id, cancelled: !flag)
        playNext()
    }

    private func finishedFile(_ id: String, cancelled: Bool) {
        if playerID == id {
            player = nil
            playerID = nil
        }
        if fileQueue.isEmpty && player == nil { unmuteSoon() }
        FrameWriter.shared.writeEvent(["event": "speakEnd", "id": id, "cancelled": cancelled])
    }

    private func unmuteSoon() {
        // Hoparlördeki son yankının mikrofona karışmaması için kısa bir bekleme.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            if !self.synthesizer.isSpeaking && self.player == nil { AudioRouter.micMuted = false }
        }
    }

    static func voices() -> [[String: Any]] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("tr") || $0.language.hasPrefix("en") }
            .map { ["id": $0.identifier, "name": $0.name, "language": $0.language, "quality": $0.quality.rawValue] }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        AudioRouter.micMuted = true
        FrameWriter.shared.writeEvent(["event": "speakStart", "id": ids[ObjectIdentifier(utterance)] ?? ""])
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finished(utterance, cancelled: false)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finished(utterance, cancelled: true)
    }

    private func finished(_ utterance: AVSpeechUtterance, cancelled: Bool) {
        let id = ids.removeValue(forKey: ObjectIdentifier(utterance)) ?? ""
        unmuteSoon()
        FrameWriter.shared.writeEvent(["event": "speakEnd", "id": id, "cancelled": cancelled])
    }
}
