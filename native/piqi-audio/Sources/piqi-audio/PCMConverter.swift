import AVFoundation

/// PCM formatları arasında dönüştürür. Varsayılan çıktı 16 kHz, mono, Int16'dır (STT motorlarının ortak girdisi).
final class PCMConverter {
    static let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true
    )!

    private let converter: AVAudioConverter
    private let output: AVAudioFormat
    private let ratio: Double

    init?(input: AVAudioFormat, output: AVAudioFormat = PCMConverter.outputFormat) {
        guard let converter = AVAudioConverter(from: input, to: output) else { return nil }
        converter.downmix = true
        self.converter = converter
        self.output = output
        self.ratio = output.sampleRate / input.sampleRate
    }

    func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let result = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: capacity) else {
            return nil
        }
        var consumed = false
        var error: NSError?
        let status = converter.convert(to: result, error: &error) { _, inputStatus in
            if consumed {
                inputStatus.pointee = .noDataNow
                return nil
            }
            consumed = true
            inputStatus.pointee = .haveData
            return buffer
        }
        guard status != .error, result.frameLength > 0 else { return nil }
        return result
    }
}

extension AVAudioPCMBuffer {
    var int16Samples: UnsafeBufferPointer<Int16>? {
        guard let data = int16ChannelData else { return nil }
        return UnsafeBufferPointer(start: data[0], count: Int(frameLength))
    }
}
