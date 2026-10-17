// Ses yardımcısını (native/piqi-audio) derler ve imzalar. macOS 26 SDK'sı varsa onunla derler: konuşma
// tanıma macOS 26+'da SpeechAnalyzer kullanır (kesintisiz, iki kanal, izin gerektirmez). Varsayılan Xcode
// daha eskiyse /Applications altındaki Xcode 26+ aranır; bulunamazsa yalnızca eski tanıma yolu derlenir.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const sdkMajor = (developerDir) => {
  try {
    const env = developerDir ? { ...process.env, DEVELOPER_DIR: developerDir } : process.env
    return Number(execFileSync('xcrun', ['--show-sdk-version'], { env, encoding: 'utf8' }).trim().split('.')[0])
  } catch {
    return 0
  }
}

let developerDir = process.env.DEVELOPER_DIR
if (!developerDir && sdkMajor() < 26) {
  const candidates = readdirSync('/Applications')
    .filter((name) => /^Xcode.*\.app$/.test(name))
    .map((name) => join('/Applications', name, 'Contents', 'Developer'))
    .filter((dir) => sdkMajor(dir) >= 26)
  developerDir = candidates.sort().at(-1)
  if (developerDir) console.log(`[piqi] macOS 26 SDK için ${developerDir} kullanılıyor`)
  else console.warn('[piqi] macOS 26 SDK bulunamadı; SpeechAnalyzer olmadan derleniyor (Xcode 26 önerilir)')
}

const env = developerDir ? { ...process.env, DEVELOPER_DIR: developerDir } : process.env
const cwd = join(import.meta.dirname, '..', 'native', 'piqi-audio')
execFileSync('swift', ['build', '-c', 'release'], { cwd, env, stdio: 'inherit' })
execFileSync('codesign', ['--force', '--sign', '-', '--identifier', 'io.github.tuncer-byte.piqi.audio', '.build/release/piqi-audio'], { cwd, stdio: 'inherit' })
