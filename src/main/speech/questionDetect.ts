// Karşı tarafın cümlesinin bir ürün sorusu olup olmadığını yerelde (model çağrısı olmadan) ayırt eder.
// Amaç sessiz kalmak: emin olunmayan cümle soru sayılmaz; böylece token harcanmaz ve panel boşuna açılmaz.

import { trLower } from '../knowledge/query'

const TR_PARTICLE = /(?:^|\s)m[ıiuü](?:y[ıiuü]m|s[ıiuü]n|y[ıiuü]z|s[ıiuü]n[ıiuü]z|d[ıiuü]r|l[ae]r)?(?=$|[\s?.,!])/u
const TR_WORDS = /(?:^|\s)(?:nasıl|neden|niye|niçin|nerede|nereye|nereden|hangi(?:si|leri)?|kaç|kim|nedir|ne(?:\s+zaman|\s+kadar|ler)?|acaba)(?=$|[\s?.,!])/u
const EN_START = /^(?:what|how|why|when|where|which|who|whose|can|could|does|do|did|is|are|was|were|will|would|should|have|has)\b/

/** Toplantı lojistiği ve hal hatır: soru biçiminde ama ürünle ilgisiz. */
const SMALL_TALK = [
  /duy(?:uyor|abiliyor|ul)/u,
  /gör(?:üyor|ebiliyor|ün)/u,
  /ses(?:im)?\s+(?:geliyor|gidiyor|var)/u,
  /ekran(?:ı|ımı)?\s+(?:paylaş|görüyor)/u,
  /nasılsın|naber|iyi\s+misin/u,
  /başla(?:yalım|yabilir)|hazır\s+m[ıi]/u,
  /bağlant[ıi]/u,
  /\b(?:can you (?:hear|see)|is my (?:screen|audio)|are you there|how are you|shall we start)\b/
]

const MIN_WORDS = 3

/** Soruysa temizlenmiş metnini, değilse null döner. */
export function detectQuestion(text: string): string | null {
  const clean = text.trim().replace(/\s+/g, ' ')
  const lower = trLower(clean)
  if (lower.split(' ').length < MIN_WORDS) return null
  if (SMALL_TALK.some((re) => re.test(lower))) return null
  const asked = clean.endsWith('?') || TR_PARTICLE.test(lower) || TR_WORDS.test(lower) || EN_START.test(lower)
  return asked ? clean : null
}
