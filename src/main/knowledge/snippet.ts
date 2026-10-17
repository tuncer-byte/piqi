// Modele giden bağlamı küçültür: her parçanın baştan ilk N karakteri yerine soruyla en çok örtüşen kesiti
// gönderilir ve toplam bağlam bir karakter bütçesiyle sınırlanır. Daha az token, daha isabetli kaynak.

import type { KnowledgeHit } from '@shared/knowledge'
import { coverage, matches, queryConcepts, wordSet } from './query'

/** Kırpılmış kesitin başına/sonuna konan işaret. */
const GAP = '…'
/** Bundan kısa kesit anlam taşımaz; bütçe bu kadar kalmadıysa parça eklenmez. */
const MIN_SNIPPET = 240
/** SSS'nin doğrudan gösterilmesi için iki yönlü kavram örtüşmesi eşiği. */
const FAQ_MATCH = 0.8

/** Kod satırlara, doküman cümlelere bölünür; birimler birleştirildiğinde metin aynen geri gelir. */
function units(text: string, kind: KnowledgeHit['kind']): string[] {
  if (kind === 'code') return text.split(/(?<=\n)/)
  return text.split(/(?<=[.!?…:;]\s+|\n)/)
}

/**
 * Metnin soruyla en yoğun örtüşen, `maxChars`'ı aşmayan kesintisiz kesitini döner; eşleşen kısım
 * kesitin ortasına alınır. Kodda kesit başa denk gelmezse parçanın ilk satırı (sınıf/fonksiyon imzası) da eklenir.
 */
export function focusText(text: string, kind: KnowledgeHit['kind'], concepts: string[][], maxChars: number): string {
  if (text.length <= maxChars) return text
  const parts = units(text, kind)
  const scores = parts.map((p) => {
    const words = wordSet(p)
    return concepts.filter((c) => matches(c, words)).length
  })
  const signature = kind === 'code' ? parts[0]!.trimEnd() : ''
  // İmza ve kırpma işaretleri için yer ayrılır.
  const room = maxChars - (signature.length < maxChars / 3 ? signature.length + 1 : 0) - 2 * (GAP.length + 1)

  // Kayan pencere: uzunluğu bütçeyi aşmayan, puan toplamı en yüksek ardışık birimler.
  let best = { from: 0, to: 0, score: 0 }
  let from = 0
  let length = 0
  let score = 0
  for (let to = 0; to < parts.length; to++) {
    length += parts[to]!.length
    score += scores[to]!
    while (length > room && from < to) {
      length -= parts[from]!.length
      score -= scores[from]!
      from++
    }
    if (length <= room && score > best.score) best = { from, to: to + 1, score }
  }
  if (best.score === 0) return `${text.slice(0, maxChars - GAP.length).trimEnd()}${GAP}`

  // Pencereyi eşleşen birimlere daraltıp iki yana dönüşümlü genişlet: eşleşme ortada kalsın.
  let lo = best.from
  let hi = best.to
  while (lo < hi - 1 && scores[lo] === 0) lo++
  while (hi > lo + 1 && scores[hi - 1] === 0) hi--
  let size = parts.slice(lo, hi).reduce((n, p) => n + p.length, 0)
  for (let grew = true; grew; ) {
    grew = false
    if (hi < parts.length && size + parts[hi]!.length <= room) {
      size += parts[hi++]!.length
      grew = true
    }
    if (lo > 0 && size + parts[lo - 1]!.length <= room) {
      size += parts[--lo]!.length
      grew = true
    }
  }

  const body = parts.slice(lo, hi).join('').trim().slice(0, room)
  let head = lo > 0 ? `${GAP}\n` : ''
  if (lo > 0 && signature && signature.length < maxChars / 3) head = `${signature}\n${GAP}\n`
  const tail = hi < parts.length ? `\n${GAP}` : ''
  return `${head}${body}${tail}`
}

export interface ContextBudget {
  /** Tüm kaynak bloğu için üst sınır (karakter). */
  total: number
  /** Tek bir parçaya ayrılabilecek en fazla karakter. */
  perHit: number
}

/**
 * Numaralı kaynak bloğu. Bütçe sıraya göre dağıtılır: üstteki parçalar tam paylarını alır,
 * kalan bütçe yetmeyen alt sıradaki zayıf parçalar hiç gönderilmez (numaralar `hits` sırasını korur).
 */
export function sourcesBlock(question: string, hits: KnowledgeHit[], budget: ContextBudget): { text: string; used: KnowledgeHit[] } {
  const concepts = queryConcepts(question)
  const blocks: string[] = []
  const used: KnowledgeHit[] = []
  let remaining = budget.total
  for (const hit of hits) {
    const room = Math.min(budget.perHit, remaining)
    if (room < MIN_SNIPPET) break
    const body = focusText(hit.text, hit.kind, concepts, room)
    used.push(hit)
    blocks.push(`[${used.length}] ${hit.label}${hit.kind === 'faq' ? ' (onaylı cevap)' : ''}\n${body}`)
    remaining -= body.length
  }
  return { text: blocks.join('\n\n'), used }
}

/**
 * Soru, onaylı bir SSS sorusuyla iki yönlü neredeyse aynı kavramları taşıyorsa onaylı cevabı döner;
 * model çağrısı yapılmadan anında ve token harcamadan gösterilebilir.
 */
export function faqAnswer(question: string, hit: KnowledgeHit | undefined): string | null {
  if (!hit || hit.kind !== 'faq') return null
  const answer = /\nOnaylı cevap: ([\s\S]+)$/.exec(hit.text)?.[1]?.trim()
  if (!answer) return null
  const asked = queryConcepts(question)
  const approved = queryConcepts(hit.title)
  if (asked.length < 2 || approved.length < 2) return null
  const forward = coverage(asked, wordSet(hit.title))
  const backward = coverage(approved, wordSet(question))
  return forward >= FAQ_MATCH && backward >= FAQ_MATCH ? answer : null
}
