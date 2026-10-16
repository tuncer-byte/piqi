import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { promisify } from 'node:util'
import { htmlToText } from './extract'

const run = promisify(execFile)

export interface RemotePage {
  /** Kalıcı kimlik (URL ya da sayfa kimliği) — artımlı güncelleme için. */
  id: string
  title: string
  url: string
  text: string
}

// ── Git ───────────────────────────────────────────────────────────────────

/** Uzak repodaki dallar (git ls-remote). */
export async function gitBranches(url: string): Promise<string[]> {
  const { stdout } = await run('git', ['ls-remote', '--heads', url], { timeout: 20_000 })
  return stdout
    .split('\n')
    .map((l) => l.split('refs/heads/')[1]?.trim())
    .filter((b): b is string => Boolean(b))
}

/** Sığ klonlar (yalnızca son commit) ya da var olan klonu günceller. */
export async function gitSync(url: string, branch: string | undefined, dir: string): Promise<void> {
  if (existsSync(`${dir}/.git`)) {
    await run('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', branch ?? 'HEAD'], { timeout: 120_000 })
    await run('git', ['-C', dir, 'reset', '--hard', 'FETCH_HEAD'], { timeout: 60_000 })
    return
  }
  mkdirSync(dir, { recursive: true })
  const args = ['clone', '--depth', '1', '--single-branch', ...(branch ? ['--branch', branch] : []), url, dir]
  await run('git', args, { timeout: 300_000 })
}

// ── Web ───────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<{ html: string; type: string }> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Piqi/0.3 (+bilgi bankası)' }, redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} alınamadı (${response.status})`)
  return { html: await response.text(), type: response.headers.get('content-type') ?? '' }
}

/** Tek sayfa ya da site haritasından en fazla `maxPages` sayfa (aynı alan adı). */
export async function crawlWeb(url: string, crawlSitemap: boolean, maxPages: number, onProgress: (n: number) => void): Promise<RemotePage[]> {
  const origin = new URL(url).origin
  let urls = [url]
  if (crawlSitemap) {
    try {
      const { html } = await fetchText(`${origin}/sitemap.xml`)
      const found = [...html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.trim()).filter((u) => u.startsWith(origin))
      urls = [...new Set([url, ...found])]
    } catch {
      // site haritası yok: yalnızca verilen sayfa
    }
  }
  const pages: RemotePage[] = []
  for (const u of urls.slice(0, maxPages)) {
    try {
      const { html, type } = await fetchText(u)
      if (!type.includes('html') && !type.includes('text')) continue
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || u
      const main = /<(main|article)[^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2] ?? html
      pages.push({ id: u, title, url: u, text: htmlToText(main) })
    } catch {
      // erişilemeyen sayfayı atla
    }
    onProgress(pages.length)
  }
  return pages
}

// ── Confluence ────────────────────────────────────────────────────────────

/** Bir space'teki tüm sayfalar (Cloud: e-posta + API jetonu, Data Center: kişisel erişim jetonu). */
export async function confluencePages(
  config: { baseUrl: string; email: string; spaceKey: string; deployment: 'cloud' | 'datacenter' },
  token: string,
  onProgress: (n: number) => void
): Promise<RemotePage[]> {
  const base = config.baseUrl.replace(/\/+$/, '')
  const api = config.deployment === 'cloud' && !base.endsWith('/wiki') ? `${base}/wiki` : base
  const auth = config.deployment === 'cloud' ? `Basic ${Buffer.from(`${config.email}:${token}`).toString('base64')}` : `Bearer ${token}`
  const pages: RemotePage[] = []
  let next: string | null = `${api}/rest/api/content?spaceKey=${encodeURIComponent(config.spaceKey)}&type=page&expand=body.storage,version&limit=50`
  while (next && pages.length < 2000) {
    const response = await fetch(next, { headers: { Authorization: auth, Accept: 'application/json' } })
    if (response.status === 401 || response.status === 403) throw new Error('Confluence erişimi reddedildi: e-posta/jeton ve yetkileri kontrol edin')
    if (!response.ok) throw new Error(`Confluence hatası (${response.status})`)
    const data = (await response.json()) as {
      results: { id: string; title: string; body?: { storage?: { value?: string } }; _links?: { webui?: string } }[]
      _links?: { next?: string; base?: string }
    }
    for (const page of data.results) {
      pages.push({
        id: page.id,
        title: page.title,
        url: `${data._links?.base ?? api}${page._links?.webui ?? ''}`,
        text: htmlToText(page.body?.storage?.value ?? '')
      })
    }
    onProgress(pages.length)
    next = data._links?.next ? `${api}${data._links.next.replace(/^\/wiki/, '')}` : null
  }
  return pages
}

// ── Notion ────────────────────────────────────────────────────────────────

const NOTION_VERSION = '2022-06-28'

async function notion<T>(path: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  if (response.status === 401) throw new Error('Notion jetonu geçersiz')
  if (!response.ok) throw new Error(`Notion hatası (${response.status})`)
  return (await response.json()) as T
}

interface NotionBlock {
  id: string
  type: string
  has_children: boolean
  [key: string]: unknown
}

function blockText(block: NotionBlock): string {
  const content = block[block.type] as { rich_text?: { plain_text: string }[] } | undefined
  const text = content?.rich_text?.map((t) => t.plain_text).join('') ?? ''
  if (block.type.startsWith('heading_')) return `${'#'.repeat(Number(block.type.slice(-1)))} ${text}`
  if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item' || block.type === 'to_do') return `- ${text}`
  if (block.type === 'code') return `\`\`\`\n${text}\n\`\`\``
  return text
}

async function pageText(id: string, token: string, depth = 0): Promise<string> {
  const lines: string[] = []
  let cursor: string | undefined
  do {
    const data = await notion<{ results: NotionBlock[]; next_cursor: string | null; has_more: boolean }>(
      `blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
      token
    )
    for (const block of data.results) {
      lines.push(blockText(block))
      if (block.has_children && depth < 2 && block.type !== 'child_page') lines.push(await pageText(block.id, token, depth + 1))
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined
  } while (cursor)
  return lines.filter(Boolean).join('\n')
}

/** Entegrasyonun erişebildiği sayfalar (isteğe bağlı arama terimiyle). */
export async function notionPages(query: string, maxPages: number, token: string, onProgress: (n: number) => void): Promise<RemotePage[]> {
  const pages: RemotePage[] = []
  let cursor: string | undefined
  do {
    const data = await notion<{
      results: { id: string; url: string; properties: Record<string, { type: string; title?: { plain_text: string }[] }> }[]
      next_cursor: string | null
      has_more: boolean
    }>('search', token, { query, filter: { property: 'object', value: 'page' }, page_size: 50, start_cursor: cursor })
    for (const page of data.results) {
      if (pages.length >= maxPages) break
      const titleProp = Object.values(page.properties).find((p) => p.type === 'title')
      const title = titleProp?.title?.map((t) => t.plain_text).join('') || 'Adsız sayfa'
      pages.push({ id: page.id, title, url: page.url, text: await pageText(page.id, token) })
      onProgress(pages.length)
    }
    cursor = data.has_more && pages.length < maxPages ? (data.next_cursor ?? undefined) : undefined
  } while (cursor)
  return pages
}
