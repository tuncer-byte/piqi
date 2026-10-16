import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditEntry } from '@shared/types'

/**
 * LLM çağrılarının içeriksiz denetim kaydı: kim, ne zaman, hangi sağlayıcı/model, kaç karakter,
 * hangi veri türleri maskelendi. Soru ve cevap metni asla yazılmaz. Aylık JSONL dosyaları.
 */
export class AuditLog {
  constructor(private readonly dir: string) {}

  append(entry: AuditEntry): void {
    mkdirSync(this.dir, { recursive: true })
    const month = new Date(entry.ts).toISOString().slice(0, 7)
    appendFileSync(join(this.dir, `audit-${month}.jsonl`), `${JSON.stringify(entry)}\n`)
  }

  recent(limit = 50): AuditEntry[] {
    if (!existsSync(this.dir)) return []
    const files = readdirSync(this.dir).filter((f) => f.endsWith('.jsonl')).sort().reverse()
    const entries: AuditEntry[] = []
    for (const file of files) {
      const lines = readFileSync(join(this.dir, file), 'utf8').trim().split('\n').reverse()
      for (const line of lines) {
        if (!line) continue
        try {
          entries.push(JSON.parse(line) as AuditEntry)
        } catch {
          // bozuk satırı atla
        }
        if (entries.length >= limit) return entries
      }
    }
    return entries
  }
}
