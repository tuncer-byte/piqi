// Geliştirme ortamında node_modules içindeki Electron.app'e sistem sesi kaydı izin metnini ekler.
// macOS, Core Audio Process Tap için "sorumlu" uygulamanın Info.plist'inde NSAudioCaptureUsageDescription arar;
// dev modda bu uygulama Electron.app'tir. Paketlenmiş sürümde aynı anahtar electron-builder.yml'den gelir.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

if (process.platform !== 'darwin') process.exit(0)

const require = createRequire(import.meta.url)
let electronBinary
try {
  electronBinary = require('electron')
} catch {
  process.exit(0)
}

const appBundle = join(dirname(electronBinary), '..', '..')
const plist = join(appBundle, 'Contents', 'Info.plist')
if (!existsSync(plist)) process.exit(0)

const entries = {
  NSAudioCaptureUsageDescription: 'Piqi, toplantıdaki soruları algılamak için toplantı uygulamasının sesini dinler.',
  NSMicrophoneUsageDescription: 'Piqi, konuşmanızı karşı tarafın sorularından ayırmak için mikrofonu dinler.',
  NSSpeechRecognitionUsageDescription: 'Piqi, konuşmaları cihaz üzerinde yazıya döker; ses Mac’inizden çıkmaz.'
}

for (const [key, value] of Object.entries(entries)) {
  execFileSync('plutil', ['-replace', key, '-string', value, plist])
}
// Info.plist değişince imza bozulur; ad-hoc olarak yeniden imzala.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', appBundle], { stdio: 'ignore' })
console.log('[piqi] Electron.app Info.plist ses izin metinleriyle güncellendi.')
