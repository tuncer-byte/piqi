import { EventEmitter } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import type { KnowledgeHit } from '@shared/knowledge'
import type { AskRequest, ChatView, Confidence, Settings, SourceRef, TranscriptEvent } from '@shared/types'
import type { IslandController } from '../island/IslandController'
import { queryConcepts } from '../knowledge/query'
import { faqAnswer, sourcesBlock, type ContextBudget } from '../knowledge/snippet'
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
/** Takip sorusu tarihçesinde bir cevaptan saklanan en fazla karakter (her turda yeniden gönderilir). */
const HISTORY_REPLY_CHARS = 600
/** Bu kadar az kavram taşıyan soru önceki soruya bağlı sayılır ("peki Enterprise'da?"); arama onunla genişletilir. */
const FOLLOW_UP_CONCEPTS = 3
/** Hazır cevaplar (SSS, önbellek) bir anda belirmesin: kısa düşünme anı, ardından kelime kelime akış. */
const REVEAL_THINK_MS = 180
const REVEAL_TICK_MS = 30
const REVEAL_MS_PER_WORD = 40
const REVEAL_MIN_MS = 300
const REVEAL_MAX_MS = 900

/** Cevap türüne göre aranan parça sayısı, kaynak bloğu bütçesi ve toplantı bağlamı üst sınırı (karakter). */
const MODES: Record<'spoken' | 'quick' | 'detailed', { hits: number; budget: ContextBudget; meetingChars: number }> = {
  spoken: { hits: 4, budget: { total: 2_400, perHit: 900 }, meetingChars: 1_200 },
  quick: { hits: 5, budget: { total: 3_600, perHit: 1_100 }, meetingChars: 1_500 },
  detailed: { hits: 8, budget: { total: 8_000, perHit: 1_800 }, meetingChars: 3_000 }
}

interface Deps {
  llm: LlmService
  island: IslandController
  voice: VoiceOutput
  transcripts: TranscriptStore
  settings: () => Settings
  /** Mikrofon yakalama ve konuşma tanıma açık değilse açar. */
  ensureMic: () => Promise<void>
  knowledge: { search(question: string, limit?: number, extra?: string[]): KnowledgeHit[] }
}

/** Metnin son `max` karakteri; satır ortasından başlamaz. */
function tail(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(-max)
  const newline = cut.indexOf('\n')
  return newline >= 0 && newline < cut.length - 1 ? cut.slice(newline + 1) : cut
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

    const spoken = options.fromVoice && (await voice.shouldSpeak())
    const mode = MODES[options.detailed ? 'detailed' : spoken ? 'spoken' : 'quick']
    const context = options.useMeetingContext ? tail(transcripts.recent(MEETING_CONTEXT_MS), mode.meetingChars) : ''
    if (Date.now() - this.lastTurnAt > FOLLOW_UP_WINDOW_MS) this.turns = []
    // Kısa takip sorusu: bir önceki soru aramayı genişletir (sıralamayı yine bu soru belirler).
    const previous = this.turns.findLast((t) => t.role === 'user')?.content
    const extra = previous && queryConcepts(question).length <= FOLLOW_UP_CONCEPTS ? [previous] : undefined
    // Yerel arama (maliyetsiz, ~10 ms); zayıf eşleşmeler arama katmanında elenir.
    const hits = this.deps.knowledge.search(question, mode.hits, extra)
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
      this.lastTurnAt = Date.now()
      await this.reveal({ ...cached.chat, id: randomUUID(), speaking: false }, abort.signal, spoken)
      return
    }
    if (cached) this.answerCache.delete(cacheKey)

    // Onaylı SSS birebir karşılıyorsa model çağrılmaz: anında ve token harcamadan.
    const approved = options.detailed ? null : faqAnswer(question, hits[0])
    if (approved) {
      this.remember(question, approved)
      const chat: ChatView = {
        id: randomUUID(),
        phase: 'done',
        userText: question,
        reply: approved,
        speaking: false,
        usedMeetingContext: false,
        sources: [{ id: String(hits[0]!.chunkId), label: hits[0]!.label }],
        confidence: 'grounded'
      }
      await this.reveal(chat, abort.signal, spoken)
      return
    }

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

    const sources = sourcesBlock(question, hits, mode.budget)
    const parts = [
      sources.used.length ? `Kaynaklar:\n${sources.text}` : '',
      context ? `Toplantının son iki dakikası:\n${context}` : '',
      `Sorum: ${question}`
    ].filter(Boolean)
    const content = parts.length > 1 ? parts.join('\n\n') : question
    const messages: ChatMessage[] = [...this.turns, { role: 'user', content }]
    const sink = spoken ? voice.sentences() : null
    let raw = ''

    try {
      const reply = await llm.streamText({
        system: assistantSystem(product, { spoken, detailed: options.detailed, grounded: sources.used.length > 0 }),
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
      this.remember(question, stripCitations(reply))
      chat = { ...chat, phase: 'done', reply: stripCitations(reply), ...citations(reply, sources.used) }
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

  /**
   * Hazır bir cevabı model akışı gibi gösterir: kısa "düşünüyor" anı, ardından kelime grupları.
   * Toplam süre cevap uzunluğuyla ölçeklenir ve sınırlıdır; yeni soru gelirse (`signal`) akış durur.
   * Sesli cevapta seslendirme akışla birlikte başlar.
   */
  private async reveal(done: ChatView, signal: AbortSignal, spoken: boolean): Promise<void> {
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    const sink = spoken ? this.deps.voice.sentences() : null
    sink?.push(done.reply)
    this.setChat({ ...done, phase: 'thinking', reply: '', sources: [] })
    await wait(REVEAL_THINK_MS)

    const words = done.reply.split(/(?<=\s)/)
    const duration = Math.min(REVEAL_MAX_MS, Math.max(REVEAL_MIN_MS, words.length * REVEAL_MS_PER_WORD))
    const perTick = Math.max(1, Math.ceil(words.length / (duration / REVEAL_TICK_MS)))
    for (let shown = perTick; shown < words.length; shown += perTick) {
      if (signal.aborted) return
      this.setChat({ ...done, phase: 'answering', reply: words.slice(0, shown).join(''), sources: [] })
      await wait(REVEAL_TICK_MS)
    }
    if (signal.aborted) return
    this.setChat(done)
    await sink?.end()
  }

  /**
   * Takip soruları için turu saklar. Kaynak bloğu tarihçeye girmez ve cevap kısaltılır: tarihçe her
   * istekte yeniden gönderildiğinden bağlam ve token şişmesin.
   */
  private remember(question: string, reply: string): void {
    const short = reply.length > HISTORY_REPLY_CHARS ? `${reply.slice(0, HISTORY_REPLY_CHARS).trimEnd()}…` : reply
    this.turns = [...this.turns, { role: 'user' as const, content: question }, { role: 'assistant' as const, content: short }].slice(
      -MAX_FOLLOW_UP_TURNS * 2
    )
    this.lastTurnAt = Date.now()
  }

  private setChat(chat: ChatView): void {
    this.chat = chat
    this.deps.island.setChat(chat)
  }
}
