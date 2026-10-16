import { EventEmitter } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import type { KnowledgeHit } from '@shared/knowledge'
import type { AskRequest, ChatView, Confidence, Settings, SourceRef, TranscriptEvent } from '@shared/types'
import type { IslandController } from '../island/IslandController'
import type { ChatMessage, LlmService } from '../llm/LlmService'
import { assistantSystem } from '../llm/prompts'
import { detectSleep, detectWake } from '../speech/wakeWord'
import type { TranscriptStore } from '../speech/TranscriptStore'
import type { VoiceOutput } from '../speech/VoiceOutput'

const LISTEN_TIMEOUT_MS = 6_000
const FOLLOW_UP_WINDOW_MS = 3 * 60_000
const MEETING_CONTEXT_MS = 2 * 60_000
const MAX_FOLLOW_UP_TURNS = 6
const ANSWER_CACHE_TTL_MS = 90_000
const ANSWER_CACHE_LIMIT = 40

interface Deps {
  llm: LlmService
  island: IslandController
  voice: VoiceOutput
  transcripts: TranscriptStore
  settings: () => Settings
  /** Mikrofon yakalama ve konuşma tanıma açık değilse açar. */
  ensureMic: () => Promise<void>
  knowledge: { search(question: string, limit?: number): KnowledgeHit[] }
}

const SOURCE_CHARS = 1400

/** Bilgi bankası parçalarını numaralı kaynak bloğuna çevirir. */
function sourcesBlock(hits: KnowledgeHit[]): string {
  return hits
    .map((h, i) => `[${i + 1}] ${h.label}${h.kind === 'faq' ? ' (onaylı cevap)' : ''}\n${h.text.slice(0, SOURCE_CHARS)}`)
    .join('\n\n')
}

/** Cevaptaki [n] atıflarını kaynak etiketlerine çevirir; ekranda numaralar gizlenir. */
function citations(reply: string, hits: KnowledgeHit[]): { sources: SourceRef[]; confidence: Confidence } {
  const used = new Set<number>()
  for (const m of reply.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) for (const n of m[1]!.split(',')) used.add(Number(n.trim()) - 1)
  const sources = [...used]
    .filter((i) => hits[i])
    .sort((a, b) => a - b)
    .map((i) => ({ id: String(hits[i]!.chunkId), label: hits[i]!.label }))
  const confidence: Confidence = sources.length ? 'grounded' : hits.length ? 'partial' : 'general'
  return { sources, confidence }
}

export const stripCitations = (text: string): string => text.replace(/\s?\[\d+(?:\s*,\s*\d+)*\]/g, '')

interface AnswerOptions {
  fromVoice: boolean
  useMeetingContext: boolean
  detailed: boolean
}

/**
 * Kullanıcının Piqi'yle konuşması: "Selam Piqi" (sesli) ve ⌘⇧K (yazılı/sesli).
 * Kısa takip soruları için son birkaç turu hatırlar.
 */
interface AssistantEvents {
  /** "Selam Piqi": uygulamayı aç. */
  wake: []
  /** "Görüşürüz Piqi": uygulamayı kapat. */
  sleep: []
}

export class Assistant extends EventEmitter<AssistantEvents> {
  private chat: ChatView | null = null
  private awaiting: { timer: NodeJS.Timeout; wakeSegment: number | null } | null = null
  private abort: AbortController | null = null
  private turns: ChatMessage[] = []
  private lastTurnAt = 0
  private answerCache = new Map<string, { createdAt: number; chat: ChatView }>()

  constructor(private readonly deps: Deps) {
    super()
    deps.voice.on('speaking', (speaking) => {
      if (this.chat) this.setChat({ ...this.chat, speaking })
    })
  }

  /** Mikrofon transkripti. Uyandırma/soru/komut olarak tükettiyse true döner. */
  onMic(event: TranscriptEvent): boolean {
    if (this.awaiting) {
      const wake = this.awaiting.wakeSegment === event.segment ? detectWake(event.text, this.names()) : null
      const text = (wake ? wake.rest : event.text).trim()
      if (this.chat) this.setChat({ ...this.chat, userText: text })
      if (event.final && text) {
        this.stopAwaiting()
        if (detectSleep(text, this.names())) this.goodbye()
        else void this.answer(text, { fromVoice: true, useMeetingContext: true, detailed: false })
      }
      return true
    }

    if (!this.deps.settings().speech.wakeWord) return false
    if (event.final && detectSleep(event.text, this.names())) {
      this.goodbye()
      return true
    }
    const wake = detectWake(event.text, this.names())
    if (!wake) return false

    if (!event.final) {
      // Erken geri bildirim: cümle bitmeden "dinliyorum" göster.
      this.deps.island.setWakeHint(true)
      return true
    }
    this.deps.island.setWakeHint(false)
    this.emit('wake')
    if (wake.rest.length > 2) void this.answer(wake.rest, { fromVoice: true, useMeetingContext: true, detailed: false })
    else this.listen(null)
    return true
  }

  /** ⌘⇧K kutusundan gelen yazılı soru. */
  ask(request: AskRequest): void {
    const text = request.text.trim()
    if (!text) return
    void this.answer(text, { fromVoice: false, useMeetingContext: request.useMeetingContext, detailed: request.detailed })
  }

  /** ⌘⇧K'daki mikrofon butonu: bir sonraki cümleyi soru olarak al. */
  async askByVoice(): Promise<void> {
    await this.deps.ensureMic()
    this.listen(null)
  }

  private goodbye(): void {
    this.cancel()
    this.emit('sleep')
  }

  cancel(): void {
    this.stopAwaiting()
    this.abort?.abort()
    this.abort = null
    this.deps.voice.stop()
    this.chat = null
  }

  /** Yapılandırılmış Piqi karakterinin adı ("Gece"); "Piqi" her zaman da geçerli. */
  private names(): string[] {
    return [this.deps.settings().product.character.name]
  }

  private listen(wakeSegment: number | null): void {
    this.cancel()
    this.setChat({
      id: randomUUID(),
      phase: 'listening',
      userText: '',
      reply: '',
      speaking: false,
      usedMeetingContext: false,
      sources: [],
      confidence: 'general'
    })
    const timer = setTimeout(() => {
      this.awaiting = null
      if (this.chat?.phase === 'listening') {
        this.setChat({ ...this.chat, phase: 'error', error: `Bir şey duyamadım. “Selam ${this.names()[0]}” deyip sorunu sorabilirsin.` })
      }
    }, LISTEN_TIMEOUT_MS)
    this.awaiting = { timer, wakeSegment }
  }

  private stopAwaiting(): void {
    if (this.awaiting) clearTimeout(this.awaiting.timer)
    this.awaiting = null
  }

  private async answer(question: string, options: AnswerOptions): Promise<void> {
    this.cancel()
    const abort = new AbortController()
    this.abort = abort
    const { llm, transcripts, voice } = this.deps
    const settings = this.deps.settings()
    const product = settings.product

    const context = options.useMeetingContext ? transcripts.recent(MEETING_CONTEXT_MS) : ''
    const spoken = options.fromVoice && (await voice.shouldSpeak())
    // Yerel arama (maliyetsiz, ~10 ms): soruya en alakalı 6 parça.
    const hits = this.deps.knowledge.search(question, 6)
    if (Date.now() - this.lastTurnAt > FOLLOW_UP_WINDOW_MS) this.turns = []
    const cacheKey = createHash('sha256')
      .update(
        JSON.stringify([
          settings.model,
          product,
          question.trim().toLocaleLowerCase('tr-TR'),
          options.useMeetingContext,
          options.detailed,
          spoken,
          context,
          hits.map((hit) => [hit.chunkId, hit.text])
        ])
      )
      .digest('hex')
    const cached = this.answerCache.get(cacheKey)
    if (cached && Date.now() - cached.createdAt < ANSWER_CACHE_TTL_MS) {
      const cachedChat = { ...cached.chat, id: randomUUID(), speaking: false }
      this.setChat(cachedChat)
      this.lastTurnAt = Date.now()
      if (spoken) {
        const sink = voice.sentences()
        sink.push(cachedChat.reply)
        await sink.end()
      }
      return
    }
    if (cached) this.answerCache.delete(cacheKey)

    let chat: ChatView = {
      id: randomUUID(),
      phase: 'thinking',
      userText: question,
      reply: '',
      speaking: false,
      usedMeetingContext: Boolean(context),
      sources: [],
      confidence: hits.length ? 'partial' : 'general'
    }
    this.setChat(chat)

    const parts = [
      hits.length ? `Kaynaklar:\n${sourcesBlock(hits)}` : '',
      context ? `Toplantının son iki dakikası:\n${context}` : '',
      `Sorum: ${question}`
    ].filter(Boolean)
    const content = parts.length > 1 ? parts.join('\n\n') : question
    const messages: ChatMessage[] = [...this.turns, { role: 'user', content }]
    const sink = spoken ? voice.sentences() : null
    let raw = ''

    try {
      const reply = await llm.streamText({
        system: assistantSystem(product, { spoken, detailed: options.detailed, grounded: hits.length > 0 }),
        messages,
        purpose: 'assistant',
        maxTokens: options.detailed ? 1_800 : spoken ? 384 : 512,
        signal: abort.signal,
        onText: (delta) => {
          if (abort.signal.aborted) return
          raw += delta
          chat = { ...chat, phase: 'answering', reply: stripCitations(raw) }
          this.setChat(chat)
          sink?.push(delta)
        }
      })
      if (abort.signal.aborted) return
      // Takip soruları için kaynak bloğu tarihçeye girmez (bağlam şişmesin); yalnızca soru ve cevap.
      this.turns = [...this.turns, { role: 'user' as const, content: question }, { role: 'assistant' as const, content: stripCitations(reply) }].slice(
        -MAX_FOLLOW_UP_TURNS * 2
      )
      this.lastTurnAt = Date.now()
      chat = { ...chat, phase: 'done', reply: stripCitations(reply), ...citations(reply, hits) }
      this.setChat(chat)
      if (this.answerCache.size >= ANSWER_CACHE_LIMIT) {
        const oldest = this.answerCache.keys().next().value
        if (oldest) this.answerCache.delete(oldest)
      }
      this.answerCache.set(cacheKey, { createdAt: Date.now(), chat })
      await sink?.end()
    } catch (error) {
      if (abort.signal.aborted) return
      this.setChat({ ...chat, phase: 'error', error: (error as Error).message })
    }
  }

  private setChat(chat: ChatView): void {
    this.chat = chat
    this.deps.island.setChat(chat)
  }
}
