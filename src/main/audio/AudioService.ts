import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type {
  AudioChannel,
  AudioLevels,
  AudioProcessInfo,
  CaptureOptions,
  CaptureStatus,
  TranscriptEvent,
  VoiceInfo
} from '@shared/types'
import { FrameParser, type HelperEvent } from './FrameParser'
import { normalizeDb, rmsDb } from './levels'

export interface ScreenInfo {
  width: number
  height: number
  x: number
  y: number
  menuBarHeight: number
  isMain: boolean
  notch?: { width: number; height: number }
}

export interface TranscribeConfig {
  locale: string
  channels: AudioChannel[]
  contextual: string[]
}

export interface SpeakRequest {
  text: string
  language: string
  voice: string | null
  rate: number
}

export type Permission = 'granted' | 'denied' | 'undetermined'

interface AudioServiceEvents {
  status: [CaptureStatus]
  audio: [AudioChannel, Int16Array]
  levels: [AudioLevels]
  transcript: [TranscriptEvent]
  speakStart: [string]
  speakEnd: [string, boolean]
  diarizer: [{ status: 'off' | 'loading' | 'ready' | 'error'; message?: string }]
  speakers: [{ id: number; talkSeconds: number }[]]
}

const LEVEL_INTERVAL_MS = 66
const MAX_RESTARTS = 5

/**
 * piqi-audio yardımcı sürecini yönetir: başlatır, komut gönderir, çerçeveleri ayrıştırır,
 * çökerse yakalamayı otomatik olarak yeniden başlatır.
 */
export class AudioService extends EventEmitter<AudioServiceEvents> {
  private child: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private parser = new FrameParser()
  private waiters = new Map<string, Array<(event: HelperEvent) => void>>()
  private status: CaptureStatus = { state: 'stopped', mic: false, system: false, errors: [], transcribing: [] }
  private transcribe: TranscribeConfig | null = null
  private diarize: { enabled: boolean; cacheDir: string } | null = null
  private speakSeq = 0
  private options: CaptureOptions = { mic: true, system: true, bundleIds: [] }
  private wantRunning = false
  private restarts = 0
  private peaks: Record<AudioChannel, number> = { me: -Infinity, them: -Infinity }
  private levelTimer: NodeJS.Timeout | null = null

  /**
   * @param disclaim Geliştirmede true: yardımcı, macOS izinlerini terminal yerine kendi adına ister
   *   (bkz. native/piqi-audio/Sources/piqi-audio/Responsibility.swift).
   */
  constructor(
    private readonly helperPath: string,
    private readonly disclaim = false
  ) {
    super()
  }

  getStatus(): CaptureStatus {
    return this.status
  }

  async start(options: CaptureOptions): Promise<CaptureStatus> {
    this.options = options
    this.wantRunning = true
    this.setStatus({ state: 'starting', mic: false, system: false, errors: [], transcribing: [] })
    try {
      await this.ensureHelper()
      const started = this.waitFor('started', 10_000)
      this.send({ cmd: 'start', ...options })
      await started
      if (this.transcribe) this.send({ cmd: 'transcribe', ...this.transcribe })
      if (this.diarize) this.send({ cmd: 'diarize', ...this.diarize })
    } catch (error) {
      // Yardımcı başlatma komutuna yanıt vermediyse kapat; çökme kurtarma (handleCrash) yeniden başlatır.
      if (String(error).includes("'started'") && this.child && this.restarts < MAX_RESTARTS) {
        console.warn('[piqi-audio] başlatma yanıtı gelmedi; yardımcı yeniden başlatılıyor')
        this.child.kill()
        return this.status
      }
      this.wantRunning = false
      this.setStatus({ ...this.status, state: 'error', errors: [...this.status.errors, String(error)] })
    }
    return this.status
  }

  async stop(): Promise<CaptureStatus> {
    this.wantRunning = false
    if (this.child && this.status.state !== 'stopped') {
      const stopped = this.waitFor('stopped', 2_000).catch(() => undefined)
      this.send({ cmd: 'stop' })
      await stopped
    }
    this.setStatus({ state: 'stopped', mic: false, system: false, errors: [], transcribing: [] })
    return this.status
  }

  /** Konuşma tanıma ayarını uygular; yakalama çalışmıyorsa bir sonraki başlatmada uygulanır. */
  setTranscription(config: TranscribeConfig): void {
    this.transcribe = config
    if (this.child && this.status.state === 'running') this.send({ cmd: 'transcribe', ...config })
  }

  /** Karşı tarafta konuşmacı ayrımı; model ilk açılışta `cacheDir`'e indirilir. */
  setDiarization(enabled: boolean, cacheDir: string): void {
    this.diarize = { enabled, cacheDir }
    if (this.child && this.status.state === 'running') this.send({ cmd: 'diarize', ...this.diarize })
  }

  /** Hazır ses dosyasını (EMA) Piqi'nin ses kuyruğunda çalar. */
  async play(id: string, path: string): Promise<void> {
    await this.ensureHelper()
    this.send({ cmd: 'play', id, path })
  }

  /** Metni sesli okur; dönen kimlik speakStart/speakEnd olaylarıyla eşleşir. */
  async speak(request: SpeakRequest): Promise<string> {
    await this.ensureHelper()
    const id = `s${++this.speakSeq}`
    this.send({ cmd: 'speak', id, ...request })
    return id
  }

  stopSpeaking(): void {
    this.send({ cmd: 'stopSpeaking' })
  }

  async voices(): Promise<VoiceInfo[]> {
    await this.ensureHelper()
    const result = this.waitFor('voices', 3_000)
    this.send({ cmd: 'voices' })
    return ((await result).items as VoiceInfo[]) ?? []
  }

  /** İzinler, sesi gerçekten yakalayan yardımcı sürecin gözünden. */
  async permissions(): Promise<{ mic: Permission; speech: Permission }> {
    await this.ensureHelper()
    const result = this.waitFor('permissions', 3_000)
    this.send({ cmd: 'permissions' })
    const event = await result
    return { mic: event.mic as Permission, speech: event.speech as Permission }
  }

  async requestMicPermission(): Promise<Permission> {
    await this.ensureHelper()
    const result = this.waitFor('micPermission', 120_000)
    this.send({ cmd: 'requestMicPermission' })
    return (await result).status as Permission
  }

  async requestSpeechPermission(): Promise<Permission> {
    await this.ensureHelper()
    const result = this.waitFor('speechPermission', 120_000)
    this.send({ cmd: 'requestSpeechPermission' })
    return (await result).status as Permission
  }

  async listProcesses(): Promise<AudioProcessInfo[]> {
    await this.ensureHelper()
    const result = this.waitFor('processes', 3_000)
    this.send({ cmd: 'listProcesses' })
    const event = await result
    return (event.items as AudioProcessInfo[]) ?? []
  }

  async screens(): Promise<ScreenInfo[]> {
    await this.ensureHelper()
    const result = this.waitFor('screens', 3_000)
    this.send({ cmd: 'screens' })
    const event = await result
    return (event.items as ScreenInfo[]) ?? []
  }

  dispose(): void {
    this.wantRunning = false
    this.stopLevelTimer()
    this.child?.stdin.end()
    this.child?.kill()
    this.child = null
  }

  private ensureHelper(): Promise<void> {
    if (this.child && this.ready) return this.ready

    const child = spawn(this.helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.disclaim ? { ...process.env, PIQI_DISCLAIM: '1' } : process.env
    })
    this.child = child
    this.parser = new FrameParser()
    this.ready = this.waitFor('ready', 5_000).then((event) => {
      this.status = { ...this.status, helperVersion: String(event.version) }
    })

    child.stdout.on('data', (chunk: Buffer) => {
      for (const frame of this.parser.push(chunk)) {
        if (frame.type === 'audio') this.onAudio(frame.channel, frame.samples)
        else this.onEvent(frame.event)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      console.log(`[piqi-audio] ${chunk.toString('utf8').trimEnd()}`)
    })
    child.on('error', (error) => {
      console.error('[piqi-audio] başlatılamadı:', error)
    })
    child.on('exit', (code, signal) => {
      if (this.child !== child) return
      this.child = null
      this.ready = null
      this.stopLevelTimer()
      console.warn(`[piqi-audio] çıktı (code=${code}, signal=${signal})`)
      this.handleCrash()
    })

    return this.ready
  }

  private handleCrash(): void {
    if (!this.wantRunning) {
      this.setStatus({ state: 'stopped', mic: false, system: false, errors: [], transcribing: [] })
      return
    }
    if (this.restarts >= MAX_RESTARTS) {
      this.wantRunning = false
      this.setStatus({ ...this.status, state: 'error', errors: ['Ses yardımcısı tekrar tekrar kapandı'] })
      return
    }
    const delay = 500 * 2 ** this.restarts
    this.restarts++
    setTimeout(() => {
      if (this.wantRunning) void this.start(this.options)
    }, delay)
  }

  private onEvent(event: HelperEvent): void {
    switch (event.event) {
      case 'error':
        this.setStatus({
          ...this.status,
          errors: [...this.status.errors, `${String(event.source)}: ${String(event.message)}`]
        })
        break
      case 'started': {
        const mic = event.mic === true
        const system = event.system === true
        const running = mic || system
        if (running) {
          this.restarts = 0
          this.startLevelTimer()
        }
        this.setStatus({ ...this.status, state: running ? 'running' : 'error', mic, system })
        break
      }
      case 'stopped':
        this.stopLevelTimer()
        break
      case 'transcribing':
        // Tanıma yeniden kuruldu: önceki tanıma hataları (ör. izin henüz yokken) artık geçerli değil.
        this.setStatus({
          ...this.status,
          transcribing: (event.channels as AudioChannel[]) ?? [],
          errors: this.status.errors.filter((e) => !e.startsWith('stt:'))
        })
        break
      case 'sourceStatus': {
        const channel = event.channel === 'me' ? 'mic' : 'system'
        const mic = channel === 'mic' ? event.running === true : this.status.mic
        const system = channel === 'system' ? event.running === true : this.status.system
        this.setStatus({ ...this.status, state: mic || system ? 'running' : 'error', mic, system })
        break
      }
      case 'transcript':
        this.emit('transcript', event as unknown as TranscriptEvent)
        break
      case 'speakStart':
        this.emit('speakStart', String(event.id))
        break
      case 'speakEnd':
        this.emit('speakEnd', String(event.id), event.cancelled === true)
        break
      case 'diarizer':
        this.emit('diarizer', {
          status: event.status as 'off' | 'loading' | 'ready' | 'error',
          message: event.message as string | undefined
        })
        break
      case 'speakers':
        this.emit('speakers', (event.items as { id: number; talkSeconds: number }[]) ?? [])
        break
    }
    const waiters = this.waiters.get(event.event)
    if (waiters) {
      this.waiters.delete(event.event)
      waiters.forEach((resolve) => resolve(event))
    }
  }

  private onAudio(channel: AudioChannel, samples: Int16Array): void {
    this.peaks[channel] = Math.max(this.peaks[channel], rmsDb(samples))
    this.emit('audio', channel, samples)
  }

  private startLevelTimer(): void {
    this.stopLevelTimer()
    this.levelTimer = setInterval(() => {
      this.emit('levels', { me: normalizeDb(this.peaks.me), them: normalizeDb(this.peaks.them) })
      this.peaks = { me: -Infinity, them: -Infinity }
    }, LEVEL_INTERVAL_MS)
  }

  private stopLevelTimer(): void {
    if (this.levelTimer) clearInterval(this.levelTimer)
    this.levelTimer = null
    this.emit('levels', { me: 0, them: 0 })
  }

  private waitFor(eventName: string, timeoutMs: number): Promise<HelperEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const list = this.waiters.get(eventName)
        if (list) this.waiters.set(eventName, list.filter((fn) => fn !== done))
        reject(new Error(`piqi-audio '${eventName}' olayı ${timeoutMs} ms içinde gelmedi`))
      }, timeoutMs)
      const done = (event: HelperEvent): void => {
        clearTimeout(timer)
        resolve(event)
      }
      this.waiters.set(eventName, [...(this.waiters.get(eventName) ?? []), done])
    })
  }

  private send(command: Record<string, unknown>): void {
    this.child?.stdin.write(`${JSON.stringify(command)}\n`)
  }

  private setStatus(status: CaptureStatus): void {
    this.status = { ...status, helperVersion: status.helperVersion ?? this.status.helperVersion }
    this.emit('status', this.status)
  }
}
