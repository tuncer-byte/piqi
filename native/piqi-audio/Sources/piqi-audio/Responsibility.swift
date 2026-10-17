import Foundation

// macOS gizlilik izinlerini (TCC) "sorumlu süreç" adına ister. Geliştirme sırasında Electron bir terminalden
// (VS Code, iTerm…) başlatıldığı için sorumlu süreç terminal olur; onun Info.plist'inde konuşma tanıma açıklaması
// yoksa TCC yardımcıyı sonlandırır. PIQI_DISCLAIM=1 ile yardımcı kendini sorumluluğu reddederek yeniden çalıştırır;
// böylece izinler gömülü Info.plist'iyle (io.github.tuncer-byte.piqi.audio) istenir. Paketli uygulamada gerekmez:
// sorumlu süreç Piqi.app'tir ve izin metinleri onun Info.plist'indedir.

@_silgen_name("responsibility_spawnattrs_setdisclaim")
private func responsibility_spawnattrs_setdisclaim(_ attrs: UnsafeMutablePointer<posix_spawnattr_t?>, _ disclaim: Int32) -> Int32

enum Responsibility {
    private static let marker = "PIQI_DISCLAIMED"

    /// Gerekirse aynı süreci (exec) sorumluluğu reddedilmiş olarak yeniden başlatır; dönmez.
    static func disclaimIfRequested() {
        let env = ProcessInfo.processInfo.environment
        guard env["PIQI_DISCLAIM"] == "1", env[marker] == nil else { return }

        var attrs: posix_spawnattr_t?
        guard posix_spawnattr_init(&attrs) == 0 else { return }
        defer { posix_spawnattr_destroy(&attrs) }
        // SETEXEC: posix_spawn, execve gibi mevcut süreci değiştirir (aynı pid, aynı stdin/stdout).
        guard posix_spawnattr_setflags(&attrs, Int16(POSIX_SPAWN_SETEXEC)) == 0,
              responsibility_spawnattrs_setdisclaim(&attrs, 1) == 0
        else { return }

        let path = Bundle.main.executablePath ?? CommandLine.arguments[0]
        let args: [UnsafeMutablePointer<CChar>?] = CommandLine.arguments.map { strdup($0) } + [nil]
        let pairs: [String] = env.map { "\($0.key)=\($0.value)" } + ["\(marker)=1"]
        let envp: [UnsafeMutablePointer<CChar>?] = pairs.map { strdup($0) } + [nil]
        var pid: pid_t = 0
        let status = posix_spawn(&pid, path, nil, &attrs, args, envp)
        // Buraya yalnızca exec başarısız olursa gelinir; normal (sorumluluk reddedilmeden) devam et.
        log("Sorumluluk reddi başarısız (\(status)); izinler üst süreç adına istenecek")
    }
}
