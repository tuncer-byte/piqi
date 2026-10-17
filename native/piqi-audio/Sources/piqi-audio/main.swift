import AVFoundation
import Foundation

// piqi-audio — Piqi'nin ses yakalama yardımcısı.
//
// Kontrol: stdin'den satır satır JSON komutlar
//   {"cmd":"start","mic":true,"system":true,"bundleIds":["com.microsoft.teams2","us.zoom.xos"]}
//   {"cmd":"stop"}
//   {"cmd":"listProcesses"}
//   {"cmd":"permissions"}
//   {"cmd":"requestMicPermission"}
//   {"cmd":"requestSpeechPermission"}
//   {"cmd":"screens"}
//   {"cmd":"transcribe","locale":"tr-TR","channels":["me","them"],"contextual":["Retry-After"]}
//   {"cmd":"transcribe","channels":[]}                       → konuşma tanımayı kapatır
//   {"cmd":"speak","id":"a1","text":"Merhaba","language":"tr-TR","voice":null,"rate":0.5}
//   {"cmd":"diarize","enabled":true,"cacheDir":"…/models"}  → karşı tarafta konuşmacı ayrımı (FluidAudio)
//   {"cmd":"play","id":"a2","path":"/tmp/a2.wav"}            → hazır ses dosyasını kuyrukta çalar (EMA)
//   {"cmd":"stopSpeaking"}
//   {"cmd":"voices"}
// Çıktı: stdout'a ikili çerçeveler (bkz. FrameWriter). Loglar stderr'e.
//
// Elle test: `piqi-audio --selftest 10` → 10 sn boyunca iki kanalın seviyelerini stderr'e basar.

Responsibility.disclaimIfRequested()

let version = "0.3.0"
let mic = MicCapture()
let systemTap = SystemAudioTap()
let writer = FrameWriter.shared
let speaker = Speaker()

signal(SIGPIPE, SIG_IGN)

func startCapture(mic useMic: Bool, system useSystem: Bool, bundleIDs: [String]) {
    // Her dinleme oturumu yeni bir toplantıdır: konuşmacı numaraları sıfırdan başlar.
    SpeakerDiarizer.shared.reset()
    var micOK = false
    var systemOK = false
    if useMic {
        do {
            try mic.start()
            micOK = true
        } catch {
            writer.writeEvent(["event": "error", "source": "mic", "message": "\(error)"])
        }
    }
    if useSystem {
        do {
            try systemTap.start(bundleIDs: bundleIDs)
            systemOK = true
        } catch {
            writer.writeEvent(["event": "error", "source": "system", "message": "\(error)"])
        }
    }
    writer.writeEvent(["event": "started", "mic": micOK, "system": systemOK])
}

func stopCapture() {
    AudioRouter.stopAll()
    mic.stop()
    systemTap.stop()
    writer.writeEvent(["event": "stopped"])
}

func handle(command line: String) {
    guard let data = line.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let cmd = json["cmd"] as? String
    else {
        writer.writeEvent(["event": "error", "source": "control", "message": "Geçersiz komut: \(line)"])
        return
    }

    switch cmd {
    case "start":
        startCapture(
            mic: json["mic"] as? Bool ?? true,
            system: json["system"] as? Bool ?? true,
            bundleIDs: json["bundleIds"] as? [String] ?? []
        )
    case "stop":
        stopCapture()
    case "listProcesses":
        do {
            writer.writeEvent(["event": "processes", "items": try AudioProcesses.list().map(\.json)])
        } catch {
            writer.writeEvent(["event": "error", "source": "control", "message": "\(error)"])
        }
    case "permissions":
        writer.writeEvent(["event": "permissions", "mic": MicCapture.permission, "speech": ChannelTranscriber.permission])
    case "requestMicPermission":
        AVCaptureDevice.requestAccess(for: .audio) { _ in
            writer.writeEvent(["event": "micPermission", "status": MicCapture.permission])
        }
    case "requestSpeechPermission":
        ChannelTranscriber.requestPermission { status in
            writer.writeEvent(["event": "speechPermission", "status": status])
        }
    case "transcribe":
        let channels = (json["channels"] as? [String] ?? []).compactMap { $0 == "me" ? Channel.me : $0 == "them" ? Channel.them : nil }
        do {
            try AudioRouter.configure(
                locale: json["locale"] as? String ?? "tr-TR",
                channels: channels,
                contextualStrings: json["contextual"] as? [String] ?? []
            )
            writer.writeEvent(["event": "transcribing", "channels": channels.map { $0 == .me ? "me" : "them" }])
        } catch {
            writer.writeEvent(["event": "error", "source": "stt", "message": "\(error)"])
        }
    case "speak":
        speaker.speak(
            id: json["id"] as? String ?? "",
            text: json["text"] as? String ?? "",
            language: json["language"] as? String ?? "tr-TR",
            voiceID: json["voice"] as? String,
            rate: (json["rate"] as? NSNumber)?.floatValue
        )
    case "diarize":
        let dir = (json["cacheDir"] as? String).map { URL(fileURLWithPath: $0, isDirectory: true) }
        SpeakerDiarizer.shared.setEnabled(json["enabled"] as? Bool ?? true, cacheDirectory: dir)
    case "play":
        speaker.play(id: json["id"] as? String ?? "", path: json["path"] as? String ?? "")
    case "stopSpeaking":
        speaker.stop()
    case "voices":
        writer.writeEvent(["event": "voices", "items": Speaker.voices()])
    case "screens":
        writer.writeEvent(["event": "screens", "items": Screens.describe()])
    default:
        writer.writeEvent(["event": "error", "source": "control", "message": "Bilinmeyen komut: \(cmd)"])
    }
}

let arguments = CommandLine.arguments

// Geliştirici testi: `piqi-audio --diarize-files <model klasörü> a.aiff b.aiff …`
// Dosyaları art arda karşı taraf kanalına verir ve her dosyanın kime atandığını basar.
if let index = arguments.firstIndex(of: "--diarize-files"), arguments.count > index + 2 {
    writer.selfTest = true
    let cache = URL(fileURLWithPath: arguments[index + 1], isDirectory: true)
    let files = Array(arguments[(index + 2)...])
    SpeakerDiarizer.shared.setEnabled(true, cacheDirectory: cache)
    Thread {
        while SpeakerDiarizer.shared.now == 0 && !SpeakerDiarizer.shared.isReady { Thread.sleep(forTimeInterval: 0.2) }
        var ranges: [(String, Double, Double)] = []
        for path in files {
            guard let file = try? AVAudioFile(forReading: URL(fileURLWithPath: path)),
                  let converter = PCMConverter(input: file.processingFormat)
            else { log("okunamadı: \(path)"); continue }
            let start = SpeakerDiarizer.shared.now
            while file.framePosition < file.length {
                guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096),
                      (try? file.read(into: buffer, frameCount: 4096)) != nil,
                      let out = converter.convert(buffer)
                else { break }
                SpeakerDiarizer.shared.append(out)
            }
            // Dosyalar arasında yarım saniye sessizlik.
            if let silence = AVAudioPCMBuffer(pcmFormat: PCMConverter.outputFormat, frameCapacity: 8000) {
                silence.frameLength = 8000
                memset(silence.int16ChannelData![0], 0, 16000)
                SpeakerDiarizer.shared.append(silence)
            }
            ranges.append(((path as NSString).lastPathComponent, start, SpeakerDiarizer.shared.now))
        }
        Thread.sleep(forTimeInterval: 1)
        for (name, start, end) in ranges {
            let speaker = SpeakerDiarizer.shared.dominantSpeaker(start: start, end: end).map(String.init) ?? "?"
            log("\(name): \(String(format: "%.1f–%.1f sn", start, end)) → Konuşmacı \(speaker)")
        }
        exit(0)
    }.start()
    RunLoop.main.run()
}

if let index = arguments.firstIndex(of: "--selftest") {
    let seconds = arguments.count > index + 1 ? Int(arguments[index + 1]) ?? 10 : 10
    writer.selfTest = true
    log("piqi-audio \(version) self-test: \(seconds) sn. Bir toplantı veya video sesi açın, mikrofona konuşun.")
    log("Mikrofon izni: \(MicCapture.permission)")
    DispatchQueue.main.async {
        let begin = Date()
        startCapture(mic: true, system: true, bundleIDs: [])
        log(String(format: "Başlatma süresi: %.2f sn", Date().timeIntervalSince(begin)))
        if arguments.contains("--stt") {
            do { try AudioRouter.configure(locale: "tr-TR", channels: [.me, .them], contextualStrings: ["Piqi"]) }
            catch { log("STT: \(error)") }
        }
        writer.flushLevels()
        for second in 1...seconds {
            DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(second)) {
                writer.flushLevels()
                if second == seconds {
                    stopCapture()
                    exit(0)
                }
            }
        }
    }
    RunLoop.main.run()
}

// stdin okuyucu: üst süreç stdin'i kapatırsa (çökme/kapanma) yakalamayı durdurup çıkarız.
Thread {
    while let line = readLine(strippingNewline: true) {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { continue }
        DispatchQueue.main.async { handle(command: trimmed) }
    }
    DispatchQueue.main.async {
        AudioRouter.stopAll()
        mic.stop()
        systemTap.stop()
        exit(0)
    }
}.start()

writer.writeEvent(["event": "ready", "version": version, "pid": ProcessInfo.processInfo.processIdentifier])
// AVSpeechSynthesizer ve Speech framework'ü CFRunLoop gerektirir; dispatchMain yerine RunLoop.
RunLoop.main.run()
