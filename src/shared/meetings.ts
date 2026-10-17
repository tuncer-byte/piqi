import type { AudioChannel, Confidence, SourceRef } from './types'

/** Toplantı transkriptinin kesinleşmiş bir cümlesi. */
export interface MeetingLine {
  t: number
  channel: AudioChannel
  /** "Ben", "Konuşmacı 2", "Elif". */
  speaker: string
  text: string
}

/** Toplantı sırasında Piqi'nin verdiği cevap (karşı tarafın sorusu ya da kullanıcının kendi sorusu). */
export interface MeetingAnswer {
  t: number
  question: string
  askedBy: string
  answer: string
  sources: SourceRef[]
  confidence: Confidence
}

export interface MeetingAction {
  /** Sorumlu kişi; transkriptten anlaşılmıyorsa null. */
  owner: string | null
  text: string
}

export interface MeetingSummary {
  title: string
  overview: string
  decisions: string[]
  actions: MeetingAction[]
  /** Toplantıda cevaplanamayan ya da sonraya bırakılan sorular. */
  openQuestions: string[]
  /** Karşı tarafa gönderilebilecek takip e-postası taslağı. */
  followUpEmail: string
}

/** live: kayıt sürüyor · summarizing: özet hazırlanıyor · ready: tamam · error: özet üretilemedi. */
export type MeetingStatus = 'live' | 'summarizing' | 'ready' | 'error'

export interface MeetingRecord {
  id: string
  /** Algılanan uygulama ("Zoom"); elle başlatılan dinlemede null. */
  app: string | null
  startedAt: number
  endedAt: number | null
  status: MeetingStatus
  /** Özet üretilmediyse nedeni (hata ya da "yeterli konuşma yok"). */
  note: string | null
  lines: MeetingLine[]
  answers: MeetingAnswer[]
  summary: MeetingSummary | null
}

/** Liste görünümü için hafif kayıt. */
export type MeetingListItem = Omit<MeetingRecord, 'lines' | 'answers' | 'summary'> & {
  title: string | null
  overview: string | null
  lineCount: number
  answerCount: number
  actionCount: number
}

export function listItem(record: MeetingRecord): MeetingListItem {
  const { lines, answers, summary, ...rest } = record
  return {
    ...rest,
    title: summary?.title ?? null,
    overview: summary?.overview ?? null,
    lineCount: lines.length,
    answerCount: answers.length,
    actionCount: summary?.actions.length ?? 0
  }
}
