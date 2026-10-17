import { z } from 'zod'
import type { MeetingRecord, MeetingSummary } from '@shared/meetings'
import type { Product } from '@shared/types'
import type { LlmService } from '../llm/LlmService'

/** Bundan kısa konuşmada özet çıkarmak anlamsız; model çağrılmaz. */
export const MIN_TRANSCRIPT_CHARS = 400
/** Modele giden transkript üst sınırı; uzun toplantıda başı ve sonu korunur, ortası kısaltılır. */
const MAX_TRANSCRIPT_CHARS = 60_000
const HEAD_CHARS = 15_000

const Summary = z.object({
  title: z.string().describe('Toplantının konusunu anlatan kısa başlık, en fazla 8 kelime'),
  overview: z.string().describe('Ne konuşuldu ve hangi sonuca varıldı, 2-4 cümle'),
  decisions: z.array(z.string()).describe('Alınan kararlar; yoksa boş'),
  actions: z
    .array(z.object({ owner: z.string().nullable().describe('Sorumlu kişi; anlaşılmıyorsa null'), text: z.string() }))
    .describe('Yapılacak işler; kim ne yapacak'),
  openQuestions: z.array(z.string()).describe('Cevaplanamayan ya da sonraya bırakılan sorular'),
  followUpEmail: z.string().describe('Karşı tarafa gönderilecek kısa takip e-postası taslağı; selamlama, özet, aksiyonlar, açık sorular')
})

const time = (t: number): string => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

/** Transkripti "14:05 Konuşmacı 2: …" satırlarına çevirir; çok uzunsa ortayı kısaltır. */
export function transcriptText(record: MeetingRecord): string {
  const text = record.lines.map((l) => `${time(l.t)} ${l.speaker}: ${l.text}`).join('\n')
  if (text.length <= MAX_TRANSCRIPT_CHARS) return text
  const tail = MAX_TRANSCRIPT_CHARS - HEAD_CHARS
  return `${text.slice(0, HEAD_CHARS)}\n… (toplantının ortası kısaltıldı) …\n${text.slice(-tail)}`
}

/**
 * Toplantı özetini, kararları, aksiyonları, açık soruları ve takip e-postasını üretir. Konuşma çok kısaysa
 * model çağrılmaz ve null döner. Buluta gidiyorsa kişisel veriler LlmService içinde maskelenir.
 */
export async function summarizeMeeting(llm: LlmService, record: MeetingRecord, product: Product): Promise<MeetingSummary | null> {
  const transcript = transcriptText(record)
  if (transcript.length < MIN_TRANSCRIPT_CHARS) return null
  const answers = record.answers.map((a) => `- ${a.askedBy}: ${a.question}\n  Piqi: ${a.answer.slice(0, 400)}`).join('\n')
  const content = [
    `Ürün: ${product.name}`,
    record.app ? `Toplantı uygulaması: ${record.app}` : '',
    `Transkript ("Ben" kullanıcının kendisi, diğerleri karşı taraf):\n${transcript}`,
    answers ? `Toplantıda Piqi'nin kullanıcıya hazırladığı cevaplar:\n${answers}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
  return llm.json({
    system:
      `Sen ${product.name} ürününü anlatan ekibin toplantı asistanısın. Toplantı transkriptinden kullanıcı için özet çıkarıyorsun. ` +
      'Yalnızca transkriptte geçenleri yaz; söylenmemiş karar, tarih ya da taahhüt ekleme. Konuşma tanıma hatalarını bağlamdan düzelt. ' +
      'Kullanıcının üstlendiği işlerde sorumlu olarak "Ben" yaz. Toplantının dilinde yaz.',
    messages: [{ role: 'user', content }],
    purpose: 'summary',
    schema: Summary,
    name: 'meeting_summary',
    maxTokens: 4_000
  })
}
