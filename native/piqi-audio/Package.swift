// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "piqi-audio",
    platforms: [.macOS("14.4")],
    dependencies: [
        // Cihaz üzerinde konuşmacı ayrımı (LS-EEND, CoreML/Neural Engine). Ses izi saklanmaz.
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.17.7")
    ],
    targets: [
        .executableTarget(
            name: "piqi-audio",
            dependencies: [.product(name: "FluidAudio", package: "FluidAudio")],
            path: "Sources/piqi-audio",
            linkerSettings: [
                // macOS gizlilik izinleri (mikrofon, sistem sesi, konuşma tanıma) isteyen ikilinin kendi
                // Info.plist'inde açıklama metni olmalı; yoksa TCC süreci sonlandırır. CLI olduğu için gömüyoruz.
                .unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", "Info.plist"])
            ]
        )
    ]
)
