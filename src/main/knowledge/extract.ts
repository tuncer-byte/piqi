import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'

/** Alıntılanabilir metin birimi: PDF sayfası, slayt, sayfa (sheet) ya da tüm belge. */
export interface TextUnit {
  /** Atıf etiketi: "s.14", "slayt 3", "Fiyatlar" (sheet adı). Tek birimli belgelerde yok. */
  label?: string
  page?: number
  text: string
}

export interface Extracted {
  units: TextUnit[]
  /** "48 sayfa", "31 slayt", "4 sayfa" (çalışma sayfası). */
  pageLabel: string
  pages: number | null
  warnings: string[]
}

export const OFFICE_EXT = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'epub'])
export const TEXT_EXT = new Set(['md', 'mdx', 'txt', 'rst', 'adoc', 'csv', 'json', 'yaml', 'yml', 'xml', 'log'])
export const HTML_EXT = new Set(['html', 'htm'])

export function isSupportedDocument(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase()
  return OFFICE_EXT.has(ext) || TEXT_EXT.has(ext) || HTML_EXT.has(ext)
}

const clean = (text: string): string =>
  text
    .replace(/ /g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** Belgeyi atıf birimlerine ayrılmış düz metne çevirir. */
export async function extract(path: string): Promise<Extracted> {
  const ext = extname(path).slice(1).toLowerCase()
  if (OFFICE_EXT.has(ext)) return extractOffice(path, ext)
  const raw = await readFile(path, 'utf8')
  const text = HTML_EXT.has(ext) ? htmlToText(raw) : raw
  return { units: [{ text: clean(text) }], pageLabel: sizeLabel((await stat(path)).size), pages: null, warnings: [] }
}

interface OfficeNode {
  type: string
  text?: string
  children?: OfficeNode[]
  metadata?: Record<string, unknown>
}

async function extractOffice(path: string, ext: string): Promise<Extracted> {
  const { OfficeParser } = await import('officeparser')
  const warnings: string[] = []
  const ast = (await OfficeParser.parseOffice(path)) as unknown as { content: OfficeNode[]; warnings?: { message?: string }[] }
  const units: TextUnit[] = []
  const loose: string[] = []

  const textOf = (node: OfficeNode): string => {
    if (node.type === 'heading') {
      const level = Number(node.metadata?.['level'] ?? 1)
      return `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${node.text ?? ''}`
    }
    if (node.children?.length && (node.type === 'table' || node.type === 'list' || node.type === 'row')) {
      return node.children.map(textOf).join(node.type === 'row' ? ' | ' : '\n')
    }
    return node.text ?? node.children?.map(textOf).join(' ') ?? ''
  }

  for (const node of ast.content ?? []) {
    const meta = node.metadata ?? {}
    if (node.type === 'page' || node.type === 'slide' || node.type === 'sheet') {
      const text = clean((node.children ?? []).map(textOf).join('\n') || node.text || '')
      if (node.type === 'page') units.push({ label: `s.${meta['pageNumber']}`, page: Number(meta['pageNumber']), text })
      else if (node.type === 'slide') units.push({ label: `slayt ${meta['slideNumber']}`, page: Number(meta['slideNumber']), text })
      else units.push({ label: String(meta['sheetName'] ?? 'Sayfa'), page: units.length + 1, text })
    } else {
      loose.push(textOf(node))
    }
  }
  if (loose.length) units.push({ text: clean(loose.join('\n')) })
  for (const w of ast.warnings ?? []) if (w.message) warnings.push(w.message)

  const empty = units.filter((u) => u.page != null && !u.text.trim())
  if (empty.length && ext === 'xlsx') warnings.push(`${empty.map((u) => u.label).join(', ')} okunamadı`)
  else if (empty.length > units.length / 2 && ext === 'pdf') warnings.push('Taranmış (görüntü) PDF olabilir; metin bulunamadı')

  const paged = units.filter((u) => u.page != null)
  const pages = paged.length || null
  const noun = ext === 'pptx' || ext === 'odp' ? 'slayt' : 'sayfa'
  const pageLabel = pages ? `${pages} ${noun}` : sizeLabel((await stat(path)).size)
  return { units: units.filter((u) => u.text.trim()), pageLabel, pages, warnings }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<h([1-6])[^>]*>/gi, (_, n: string) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|pre|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
}

export function displayName(path: string): string {
  return basename(path)
}
