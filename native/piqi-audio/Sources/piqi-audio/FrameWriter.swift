import Foundation

/// stdout çerçeve protokolü (little-endian):
///   [type: u8][channel: u8][length: u32][payload: length bayt]
/// type 1 = audio  → payload: Int16 PCM, 16 kHz, mono
/// type 2 = event  → payload: UTF-8 JSON
enum FrameType: UInt8 {
    case audio = 1
    case event = 2
}

enum Channel: UInt8 {
    case me = 0
    case them = 1
    case none = 255
}

final class FrameWriter {
    static let shared = FrameWriter()

    /// true ise ses çerçeveleri stdout'a yazılmaz; kanal başına seviye stderr'e basılır (--selftest).
    var selfTest = false

    private let queue = DispatchQueue(label: "piqi.framewriter")
    private let out = FileHandle.standardOutput
    private var sumSquares: [Channel: Double] = [:]
    private var sampleCounts: [Channel: Int] = [:]

    func writeAudio(_ channel: Channel, samples: UnsafeBufferPointer<Int16>) {
        guard samples.count > 0 else { return }
        if selfTest {
            accumulateLevel(channel, samples: samples)
            return
        }
        var data = Data(capacity: 6 + samples.count * 2)
        data.append(FrameType.audio.rawValue)
        data.append(channel.rawValue)
        appendLength(&data, UInt32(samples.count * 2))
        data.append(Data(buffer: samples))
        write(data)
    }

    func writeEvent(_ payload: [String: Any]) {
        guard let json = try? JSONSerialization.data(withJSONObject: payload) else { return }
        if selfTest {
            log(String(decoding: json, as: UTF8.self))
            return
        }
        var data = Data(capacity: 6 + json.count)
        data.append(FrameType.event.rawValue)
        data.append(Channel.none.rawValue)
        appendLength(&data, UInt32(json.count))
        data.append(json)
        write(data)
    }

    /// Self-test modunda son ölçümden bu yana kanal başına RMS değerini (dBFS) basar.
    func flushLevels() {
        queue.sync {
            let line = [Channel.me, Channel.them].map { ch -> String in
                let n = sampleCounts[ch] ?? 0
                guard n > 0 else { return "\(ch): —" }
                let rms = (sumSquares[ch] ?? 0) / Double(n)
                let db = 10 * log10(max(rms, 1e-12))
                return "\(ch): \(String(format: "%6.1f", db)) dBFS"
            }.joined(separator: "   ")
            log(line)
            sumSquares.removeAll()
            sampleCounts.removeAll()
        }
    }

    private func accumulateLevel(_ channel: Channel, samples: UnsafeBufferPointer<Int16>) {
        var sum = 0.0
        for s in samples {
            let v = Double(s) / 32768.0
            sum += v * v
        }
        queue.async {
            self.sumSquares[channel, default: 0] += sum
            self.sampleCounts[channel, default: 0] += samples.count
        }
    }

    private func appendLength(_ data: inout Data, _ value: UInt32) {
        var le = value.littleEndian
        withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
    }

    private func write(_ data: Data) {
        queue.async {
            do {
                try self.out.write(contentsOf: data)
            } catch {
                // Üst süreç (Electron) kapandı; sessizce çık.
                exit(0)
            }
        }
    }
}

func log(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}
