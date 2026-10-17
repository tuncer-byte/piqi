import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type {
  AnswerCard,
  ChatView,
  IslandAction,
  IslandSnapshot,
  IslandView,
  NotchGeometry
} from '@shared/types'

const COLLAPSE_AFTER_LEAVE_MS = 8_000
const DISMISS_ANSWER_MS = 60_000
const DISMISS_CHAT_MS = 30_000
const HISTORY_LIMIT = 20
/** Yanıtlanmayan "toplantı algılandı" sorusu bu süre sonra kapanır. */
const DISMISS_PROMPT_MS = 45_000

interface IslandControllerEvents {
  snapshot: [IslandSnapshot]
  /** Controller'ın kendisinin işlemediği, uygulama düzeyindeki eylemler. */
  action: [IslandAction]
  /** "SSS'ye ekle": gösterilen soru ve cevap onaylı cevaplara eklenecek. */
  saveFaq: [{ question: string; answer: string }]
}

/**
 * Island panelinin tek doğruluk kaynağı. Diğer servisler yalnızca bu sınıfın metodlarıyla
 * paneli değiştirir; renderer her değişiklikte tam snapshot alır.
 */
export class IslandController extends EventEmitter<IslandControllerEvents> {
  private snapshot: IslandSnapshot
  private hovering = false
  private collapseTimer: NodeJS.Timeout | null = null
  private dismissTimer: NodeJS.Timeout | null = null
  /** SSS'ye eklenen sohbet cevapları; Assistant sohbeti yeniden yazsa da işaret korunur. */
  private savedChats = new Set<string>()

  constructor(
    geometry: NotchGeometry,
    product: { productName: string; characterName: string },
    private readonly copy: (text: string) => void
  ) {
    super()
    this.snapshot = {
      view: { kind: 'idle' },
      lastTranscript: null,
      listening: false,
      expanded: false,
      pinned: false,
      ...product,
      geometry,
      history: [],
      historyIndex: -1,
      wakeHint: false,
      speakerCount: 0
    }
  }

  get(): IslandSnapshot {
    return this.snapshot
  }

  get view(): IslandView {
    return this.snapshot.view
  }

  get currentAnswer(): AnswerCard | null {
    return this.snapshot.view.kind === 'answer' ? this.snapshot.view.answer : null
  }

  setGeometry(geometry: NotchGeometry): void {
    this.update({ geometry })
  }

  setProduct(productName: string, characterName: string): void {
    this.update({ productName, characterName })
  }

  setListening(listening: boolean): void {
    this.update({
      listening,
      lastTranscript: listening ? this.snapshot.lastTranscript : null,
      view: this.isResting() ? this.restingView(listening) : this.snapshot.view
    })
  }

  setTranscript(event: IslandSnapshot['lastTranscript']): void {
    if (!event?.text.trim()) return
    this.update({ lastTranscript: event })
  }

  setSpeakerCount(speakerCount: number): void {
    if (this.snapshot.speakerCount !== speakerCount) this.update({ speakerCount })
  }

  setWakeHint(wakeHint: boolean): void {
    if (this.snapshot.wakeHint !== wakeHint) this.update({ wakeHint })
  }

  // ── Karşı tarafın sorusu ve cevap kartları ──────────────────────────────

  showQuestion(question: string, askedBy = 'Karşı taraf'): void {
    this.clearTimers()
    this.update({ view: { kind: 'question', question, askedBy }, expanded: false })
  }

  beginAnswer(answer: Omit<AnswerCard, 'id' | 'createdAt' | 'streaming'>): string {
    this.clearTimers()
    const card: AnswerCard = { ...answer, id: randomUUID(), createdAt: Date.now(), streaming: true }
    const history = [...this.snapshot.history, card].slice(-HISTORY_LIMIT)
    this.update({ view: { kind: 'answer', answer: card }, history, historyIndex: history.length - 1 })
    return card.id
  }

  appendAnswer(id: string, text: string): void {
    this.patchAnswer(id, (a) => ({ ...a, short: a.short + text }))
  }

  /** Akan cevabın metnini yerinde değiştirir (atıf numaraları ayıklanmış görünür metin). */
  setAnswerText(id: string, short: string): void {
    this.patchAnswer(id, (a) => ({ ...a, short }))
  }

  completeAnswer(id: string, patch: Partial<Pick<AnswerCard, 'short' | 'detail' | 'sources' | 'confidence' | 'latencyMs'>> = {}): void {
    this.patchAnswer(id, (a) => ({ ...a, ...patch, streaming: false }))
    this.scheduleDismiss()
  }

  // ── Toplantı algılama ──────────────────────────────────────────────────

  /** "Teams toplantısı algılandı · Dinlemeye başla?" Kullanıcı Piqi'yle konuşuyorsa araya girmez. */
  showMeetingPrompt(app: string): void {
    const kind = this.snapshot.view.kind
    if (kind === 'ask' || kind === 'chat' || kind === 'answer' || kind === 'question') return
    this.clearTimers()
    this.update({ view: { kind: 'meetingPrompt', app }, expanded: false })
    this.dismissTimer = setTimeout(() => this.clearMeetingPrompt(), DISMISS_PROMPT_MS)
  }

  clearMeetingPrompt(): void {
    if (this.snapshot.view.kind === 'meetingPrompt') this.rest()
  }

  // ── Kullanıcı–Piqi konuşması ve prova ──────────────────────────────────

  showAsk(): void {
    this.clearTimers()
    this.update({ view: { kind: 'ask' }, expanded: false, wakeHint: false })
  }

  setChat(chat: ChatView): void {
    this.clearTimers()
    const saved = this.savedChats.has(chat.id) ? { ...chat, savedFaq: true } : chat
    this.update({ view: { kind: 'chat', chat: saved }, wakeHint: false })
    if (chat.phase === 'done' || chat.phase === 'error') this.scheduleDismiss()
  }

  /** Paneli dinlenme hâline döndürür (sohbet/prova bittiğinde). */
  rest(): void {
    this.clearTimers()
    this.update({ view: this.restingView(this.snapshot.listening), expanded: false, pinned: false })
  }

  setHover(hovering: boolean): void {
    this.hovering = hovering
    if (hovering) {
      this.clearTimers()
      return
    }
    if (this.snapshot.expanded && !this.snapshot.pinned) {
      this.collapseTimer = setTimeout(() => this.update({ expanded: false }), COLLAPSE_AFTER_LEAVE_MS)
    }
    this.scheduleDismiss()
  }

  handle(action: IslandAction): void {
    switch (action.type) {
      case 'toggleExpand':
        if (
          this.snapshot.view.kind === 'answer' ||
          this.snapshot.view.kind === 'chat' ||
          this.snapshot.view.kind === 'listening' ||
          (this.snapshot.view.kind === 'idle' && this.snapshot.wakeHint)
        ) {
          this.update({ expanded: !this.snapshot.expanded })
        }
        break
      case 'togglePin':
        this.update({ pinned: !this.snapshot.pinned })
        this.scheduleDismiss()
        break
      case 'dismiss':
        this.rest()
        this.emit('action', action)
        break
      case 'copy': {
        const text = this.copyText()
        if (text) this.copy(text)
        break
      }
      case 'feedback': {
        const answer = this.currentAnswer
        if (answer) this.patchAnswer(answer.id, (a) => ({ ...a, feedback: action.value }))
        this.emit('action', action)
        break
      }
      case 'meetingStart':
      case 'meetingDismiss':
        this.clearMeetingPrompt()
        this.emit('action', action)
        break
      case 'saveFaq': {
        const view = this.snapshot.view
        if (view.kind === 'answer' && !view.answer.streaming && !view.answer.savedFaq) {
          const { answer } = view
          this.emit('saveFaq', { question: answer.question, answer: answer.detail ? `${answer.short}\n\n${answer.detail}` : answer.short })
          this.patchAnswer(answer.id, (a) => ({ ...a, savedFaq: true }))
        } else if (view.kind === 'chat' && view.chat.phase === 'done' && !view.chat.savedFaq && view.chat.reply) {
          this.emit('saveFaq', { question: view.chat.userText, answer: view.chat.reply })
          this.savedChats.add(view.chat.id)
          this.update({ view: { kind: 'chat', chat: { ...view.chat, savedFaq: true } } })
        }
        break
      }
      case 'history': {
        const index = this.snapshot.historyIndex + action.step
        const target = this.snapshot.history[index]
        if (target) this.update({ view: { kind: 'answer', answer: target }, historyIndex: index, expanded: false })
        break
      }
      default:
        this.emit('action', action)
    }
  }

  private copyText(): string | null {
    const view = this.snapshot.view
    if (view.kind === 'answer') return view.answer.detail ? `${view.answer.short}\n\n${view.answer.detail}` : view.answer.short
    if (view.kind === 'chat') return view.chat.reply || null
    return null
  }

  private isResting(): boolean {
    return this.snapshot.view.kind === 'idle' || this.snapshot.view.kind === 'listening'
  }

  private restingView(listening: boolean): IslandView {
    return { kind: listening ? 'listening' : 'idle' }
  }

  private scheduleDismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer)
    this.dismissTimer = null
    if (this.hovering || this.snapshot.pinned) return
    const view = this.snapshot.view
    let delay: number | null = null
    if (view.kind === 'answer' && !view.answer.streaming) delay = DISMISS_ANSWER_MS
    if (view.kind === 'chat' && (view.chat.phase === 'done' || view.chat.phase === 'error') && !view.chat.speaking) {
      delay = DISMISS_CHAT_MS
    }
    if (delay != null) this.dismissTimer = setTimeout(() => this.rest(), delay)
  }

  private patchAnswer(id: string, fn: (answer: AnswerCard) => AnswerCard): void {
    const history = this.snapshot.history.map((a) => (a.id === id ? fn(a) : a))
    const view = this.snapshot.view
    const patched = history.find((a) => a.id === id)
    this.update({
      history,
      view: view.kind === 'answer' && view.answer.id === id && patched ? { kind: 'answer', answer: patched } : view
    })
  }

  private clearTimers(): void {
    if (this.collapseTimer) clearTimeout(this.collapseTimer)
    if (this.dismissTimer) clearTimeout(this.dismissTimer)
    this.collapseTimer = null
    this.dismissTimer = null
  }

  private update(patch: Partial<IslandSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.emit('snapshot', this.snapshot)
  }
}
