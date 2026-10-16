// Parçalama: kod fonksiyon/sınıf sınırlarından, dokümanlar başlık ve sayfa sınırlarından bölünür.
// Her parça atıf için satır aralığı ya da sayfa bilgisi taşır.

import type { TextUnit } from './extract'

export interface Chunk {
  text: string
  /** Başlık yolu (doküman) ya da dosya yolu (kod). */
  title: string
  /** Parçadaki sembol adları (fonksiyon, sınıf…), aramada güçlü sinyal. */
  symbols: string[]
  lineStart?: number
  lineEnd?: number
  page?: number
  pageLabel?: string
}

const DECLARATION =
  /^(?:\s{0,4})(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|abstract\s+|final\s+|override\s+|async\s+|open\s+|sealed\s+|data\s+|pub(?:\([^)]*\))?\s+)*(?:function\*?|class|interface|type|enum|struct|trait|impl|object|record|def|fn|fun|func|module|namespace|const\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\b/

// Yalnızca satır başındaki (en fazla 4 boşluk girintili) bildirimler; fonksiyon içi yerel değişkenler sayılmaz.
const SYMBOL =
  /^\s{0,4}(?:[\w@()]+\s+)*?(?:function\*?|class|interface|type|enum|struct|trait|impl|object|record|def|fn|fun|module|namespace)\s+([A-Za-z_$][\w$]*)|^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/

/** Bir metindeki sembol adlarını çıkarır. */
export function symbolsIn(text: string): string[] {
  const out = new Set<string>()
  for (const line of text.split('\n')) {
    const m = SYMBOL.exec(line)
    const name = m && (m[1] ?? m[2] ?? m[3])
    if (name && name.length > 2) out.add(name)
  }
  return [...out].slice(0, 24)
}

const TARGET_LINES = 70
const MAX_LINES = 140

/** Kodu bildirim sınırlarından (fonksiyon, sınıf, tip) ~70 satırlık parçalara böler. */
export function chunkCode(path: string, text: string, symbolChunking = true): Chunk[] {
  const lines = text.split('\n')
  const starts = [0]
  if (symbolChunking) {
    for (let i = 1; i < lines.length; i++) if (DECLARATION.test(lines[i]!)) starts.push(i)
  }
  // Bildirim yoksa ya da bölümleme kapalıysa sabit pencereler.
  if (starts.length === 1) for (let i = TARGET_LINES; i < lines.length; i += TARGET_LINES) starts.push(i)

  const chunks: Chunk[] = []
  let begin = 0
  const flush = (end: number): void => {
    if (end <= begin) return
    // Çok uzun bölüm: 10 satır örtüşmeli pencerelere böl.
    for (let s = begin; s < end; s += MAX_LINES - 10) {
      const e = Math.min(end, s + MAX_LINES)
      const body = lines.slice(s, e).join('\n')
      if (body.trim()) {
        chunks.push({ text: body, title: path, symbols: symbolsIn(body), lineStart: s + 1, lineEnd: e })
      }
      if (e === end) break
    }
    begin = end
  }
  for (const start of starts.slice(1)) {
    // Küçük bildirimleri bir araya topla; hedef boyuta ulaşınca kes.
    if (start - begin >= TARGET_LINES) flush(start)
  }
  flush(lines.length)
  return chunks
}

const TARGET_CHARS = 1200
const OVERLAP_CHARS = 150

/** Dokümanı başlık ve paragraf sınırlarından ~1200 karakterlik parçalara böler. */
export function chunkDocument(name: string, units: TextUnit[]): Chunk[] {
  const chunks: Chunk[] = []
  for (const unit of units) {
    const headings: string[] = []
    let buffer = ''
    let title = name
    const push = (): void => {
      const text = buffer.trim()
      if (text) chunks.push({ text, title, symbols: [], page: unit.page, pageLabel: unit.label })
      buffer = text.length > OVERLAP_CHARS ? text.slice(-OVERLAP_CHARS) : ''
    }
    for (const block of unit.text.split(/\n\s*\n|\n(?=#{1,6} )/)) {
      const heading = /^(#{1,6})\s+(.+)/.exec(block.trim())
      if (heading) {
        if (buffer.trim().length > OVERLAP_CHARS) push()
        buffer = ''
        headings.splice(heading[1]!.length - 1)
        headings[heading[1]!.length - 1] = heading[2]!.trim()
        title = [name, ...headings.filter(Boolean)].join(' › ')
      }
      if (buffer.length + block.length > TARGET_CHARS && buffer.length > OVERLAP_CHARS) push()
      // Tek başına çok uzun paragraf: cümle sınırlarından böl.
      if (block.length > TARGET_CHARS * 1.5) {
        for (const sentence of block.split(/(?<=[.!?])\s+/)) {
          if (buffer.length + sentence.length > TARGET_CHARS) push()
          buffer += `${sentence} `
        }
      } else buffer += `${block}\n\n`
    }
    push()
  }
  return chunks
}
