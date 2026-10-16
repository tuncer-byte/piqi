import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { TtsStatus } from '@shared/types'

// EMA Lightning (Apache-2.0): açık kaynak, 8,6M parametreli Türkçe TTS. ONNX dosyaları yalnızca bir kez
// indirilir ve SHA-256 ile doğrulanır; seslendirme tamamen bu Mac'te çalışır.
const RELEASE = 'https://github.com/sewox/turkish-neural-tts/releases/download/v0.1.0'
const FILES = [
  { name: 'text.onnx', sha256: 'b832ac6d0a54f822a80765797053b315b31d73f8cfbdaf5347dd1865ff3c47a3', size: 4_804_278 },
  { name: 'sound.onnx', sha256: '679e6c0b35c8407b4c791031aab91383fde03690873f358b1813eee9951d881c', size: 17_927_687 },
  { name: 'decoder.onnx', sha256: '396c06a8e5711fd40bfd2c3f4f33851feb2ad07a86485833844e0ae8ff637b17', size: 12_031_945 }
]

/** EMA modelini yöneten ve piqi-tts yan sürecini çalıştıran seslendirme motoru. */
export class EmaEngine extends EventEmitter<{ status: [TtsStatus] }> {
  private child: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private pending = new Map<string, { resolve: (path: string) => void; reject: (e: Error) => void }>()
  private seq = 0
  private state: TtsStatus

  constructor(
    private readonly binary: string,
    private readonly modelDir: string,
    private readonly tmpDir: string
  ) {
    super()
    this.state = { emaInstalled: this.installed(), downloading: null, error: null }
  }

  status(): TtsStatus {
    return this.state
  }

  installed(): boolean {
    return FILES.every((f) => existsSync(join(this.modelDir, f.name)))
  }

  /** Model dosyalarını indirir (~35 MB) ve doğrular. */
  async install(): Promise<void> {
    if (this.state.downloading != null) return
    mkdirSync(this.modelDir, { recursive: true })
    const total = FILES.reduce((n, f) => n + f.size, 0)
    let done = 0
    this.update({ downloading: 0, error: null })
    try {
      for (const file of FILES) {
        const target = join(this.modelDir, file.name)
        if (existsSync(target) && sha256(readFileSync(target)) === file.sha256) {
          done += file.size
          continue
        }
        const response = await fetch(`${RELEASE}/${file.name}`)
        if (!response.ok || !response.body) throw new Error(`${file.name} indirilemedi (${response.status})`)
        const chunks: Uint8Array[] = []
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          chunks.push(chunk)
          done += chunk.length
          this.update({ downloading: Math.min(0.99, done / total) })
        }
        const data = Buffer.concat(chunks)
        if (sha256(data) !== file.sha256) throw new Error(`${file.name} doğrulanamadı (SHA-256 uyuşmuyor)`)
        writeFileSync(`${target}.part`, data)
        renameSync(`${target}.part`, target)
      }
      this.update({ emaInstalled: true, downloading: null })
    } catch (error) {
      this.update({ downloading: null, error: (error as Error).message })
      throw error
    }
  }

  uninstall(): void {
    this.dispose()
    rmSync(this.modelDir, { recursive: true, force: true })
    this.update({ emaInstalled: false })
  }

  /** Metni WAV dosyasına seslendirir; dosya yolunu döner. */
  async synthesize(text: string, speed: number): Promise<string> {
    await this.ensure()
    mkdirSync(this.tmpDir, { recursive: true })
    const id = `e${++this.seq}`
    const out = join(this.tmpDir, `${id}-${Date.now()}.wav`)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child!.stdin.write(`${JSON.stringify({ id, text, speed, out })}\n`)
    })
  }

  dispose(): void {
    this.child?.stdin.end()
    this.child?.kill()
    this.child = null
    this.ready = null
  }

  private ensure(): Promise<void> {
    if (this.ready) return this.ready
    if (!this.installed()) return Promise.reject(new Error('EMA modeli indirilmemiş'))
    if (!existsSync(this.binary)) return Promise.reject(new Error('piqi-tts bulunamadı (npm run build:tts)'))

    const child = spawn(this.binary, [this.modelDir], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    this.ready = new Promise((resolve, reject) => {
      const lines = createInterface({ input: child.stdout })
      lines.on('line', (line) => {
        let event: { event: string; id?: string; path?: string; message?: string }
        try {
          event = JSON.parse(line)
        } catch {
          return
        }
        if (event.event === 'ready') resolve()
        else if (event.event === 'done' && event.id) {
          this.pending.get(event.id)?.resolve(event.path!)
          this.pending.delete(event.id)
        } else if (event.event === 'error') {
          const error = new Error(event.message ?? 'EMA hatası')
          if (event.id) {
            this.pending.get(event.id)?.reject(error)
            this.pending.delete(event.id)
          } else reject(error)
        }
      })
      child.stderr.on('data', (d: Buffer) => console.log(`[piqi-tts] ${d.toString().trimEnd()}`))
      child.on('exit', () => {
        if (this.child === child) {
          this.child = null
          this.ready = null
        }
        for (const p of this.pending.values()) p.reject(new Error('piqi-tts kapandı'))
        this.pending.clear()
        reject(new Error('piqi-tts başlatılamadı'))
      })
    })
    return this.ready
  }

  private update(patch: Partial<TtsStatus>): void {
    this.state = { ...this.state, ...patch }
    this.emit('status', this.state)
  }
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}
