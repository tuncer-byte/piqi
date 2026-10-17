import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { KnowledgeGap } from '@shared/knowledge'
import { stem, tokens } from './query'

const LIMIT = 200

/** Aynı sorunun farklı söylenişlerini birleştirmek için kökler kümesi ("limitler kaç" ≈ "limit kaçtır"). */
export function gapKey(question: string): string {
  return [...new Set(tokens(question).map(stem))].sort().join(' ')
}

/**
 * Doküman eksikleri: cevaplanamayan sorular. Aynı soru tekrar gelirse sayaç artar.
 * userData altındaki gaps.json'a atomik yazılır; içerik bu Mac'te kalır.
 */
export class GapStore extends EventEmitter<{ change: [KnowledgeGap[]] }> {
  private gaps: KnowledgeGap[]

  constructor(private readonly file: string) {
    super()
    this.gaps = this.load()
  }

  list(): KnowledgeGap[] {
    return [...this.gaps].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
  }

  add(input: Pick<KnowledgeGap, 'question' | 'askedBy' | 'reason'>): KnowledgeGap {
    const key = gapKey(input.question)
    const now = Date.now()
    const existing = this.gaps.find((g) => gapKey(g.question) === key)
    let gap: KnowledgeGap
    if (existing) {
      // Olumsuz geri bildirim en güçlü sinyaldir; nedeni ona yükseltilir.
      gap = { ...existing, count: existing.count + 1, lastAt: now, reason: input.reason === 'negative' ? 'negative' : existing.reason }
      this.gaps = this.gaps.map((g) => (g.id === existing.id ? gap : g))
    } else {
      gap = { id: randomUUID(), ...input, question: input.question.trim(), count: 1, firstAt: now, lastAt: now }
      this.gaps = [...this.gaps, gap].sort((a, b) => b.lastAt - a.lastAt).slice(0, LIMIT)
    }
    this.save()
    return gap
  }

  remove(id: string): void {
    this.gaps = this.gaps.filter((g) => g.id !== id)
    this.save()
  }

  /** Bu soru SSS'ye eklendiyse eksik kapanır. */
  resolveByQuestion(question: string): void {
    const key = gapKey(question)
    const before = this.gaps.length
    this.gaps = this.gaps.filter((g) => gapKey(g.question) !== key)
    if (this.gaps.length !== before) this.save()
  }

  private load(): KnowledgeGap[] {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as KnowledgeGap[]
    } catch {
      return []
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.gaps, null, 2))
    renameSync(`${this.file}.tmp`, this.file)
    this.emit('change', this.list())
  }
}
