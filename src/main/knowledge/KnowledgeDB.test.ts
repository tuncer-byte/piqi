import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SourceRecord } from '@shared/knowledge'
import { chunkCode, chunkDocument } from './chunker'
import { KnowledgeDB } from './KnowledgeDB'
import { buildFtsQuery } from './query'

function source(id: string, kind: SourceRecord['kind'], name: string): SourceRecord {
  return {
    id,
    kind,
    name,
    location: '',
    config: { kind: 'faq' },
    note: '',
    focus: '',
    watch: false,
    priority: false,
    status: 'ready',
    progress: 1,
    stage: '',
    stats: { files: 0, chunks: 0, lines: 0, pages: 0, cards: 0 },
    error: null,
    warnings: [],
    lastIndexedAt: null,
    createdAt: 0
  }
}

function seed(): KnowledgeDB {
  const db = new KnowledgeDB(':memory:')
  db.saveSource(source('code', 'code', 'acme-gateway'))
  db.saveSource(source('docs', 'files', 'Dokümanlar'))
  db.saveSource(source('other', 'files', 'Başka ürün'))

  const code = [
    'export class RateLimiter {',
    '  private readonly limitPerMinute = 600',
    '  check(key: string) {',
    '    if (this.count(key) > this.limitPerMinute) throw new TooManyRequests(this.retryAfter(key))',
    '  }',
    '}',
    'export function verifyWebhookSignature(payload: string, signature: string) {',
    '  return hmac(payload) === signature',
    '}'
  ].join('\n')
  db.writeDocument({
    sourceId: 'code',
    kind: 'code',
    path: 'src/auth/RateLimiter.ts',
    title: 'src/auth/RateLimiter.ts',
    hash: 'h1',
    chunks: chunkCode('src/auth/RateLimiter.ts', code),
    labelFor: (c) => `src/auth/RateLimiter.ts:${c.lineStart}`
  })
  db.writeDocument({
    sourceId: 'docs',
    kind: 'files',
    path: '/docs/API-Guide.pdf',
    title: 'API-Guide.pdf',
    hash: 'h2',
    chunks: chunkDocument('API-Guide.pdf', [
      { label: 's.14', page: 14, text: '# Limitler\n\nAPI anahtarı başına dakikada 600 istek. Sınır aşılırsa 429 döner ve Retry-After başlığı bekleme süresini verir.' },
      { label: 's.31', page: 31, text: '# Webhooklar\n\nBaşarısız webhooklar 5 kez üstel bekleme ile yeniden denenir.' }
    ]),
    labelFor: (c) => `API-Guide.pdf · ${c.pageLabel}`
  })
  db.writeDocument({
    sourceId: 'other',
    kind: 'files',
    path: '/x.md',
    title: 'x.md',
    hash: 'h3',
    chunks: chunkDocument('x.md', [{ text: 'Rate limit başka üründe 100 istek.' }]),
    labelFor: () => 'x.md'
  })
  return db
}

describe('buildFtsQuery', () => {
  it('Türkçe ekler için kök ve sözlük karşılıklarını ekler', () => {
    const q = buildFtsQuery('Limitleri aşılırsa ne olur?')!
    expect(q).toContain('"limit"*')
    expect(q).toContain('"rate"')
    expect(q).not.toContain('"ne"')
  })
})

describe('KnowledgeDB.search', () => {
  it('Türkçe soruyla Türkçe dokümanı sayfa atfıyla bulur', () => {
    const hits = seed().search('Limit aşılırsa ne oluyor?')
    expect(hits[0]!.label).toBe('API-Guide.pdf · s.14')
  })

  it('Türkçe soruyla İngilizce kodu bulur (sözlük + camelCase)', () => {
    const hits = seed().search('Webhook imzası nasıl doğrulanıyor, hız sınırı sınıfı nerede?')
    const labels = hits.map((h) => h.label)
    expect(labels).toContain('src/auth/RateLimiter.ts:1')
  })

  it('tek bilgi havuzundaki tüm kaynakları arar', () => {
    const hits = seed().search('başka ürün 100 istek')
    expect(hits.some((h) => h.sourceId === 'other')).toBe(true)
  })

  it('kaynak silinince parçaları da silinir', () => {
    const db = seed()
    db.deleteSource('docs')
    expect(db.search('webhook yeniden deneme').every((h) => h.sourceId !== 'docs')).toBe(true)
    expect(db.counts('docs')).toEqual({ files: 0, chunks: 0, cards: 0 })
  })
})

describe('KnowledgeDB single-pool migration', () => {
  it('merges old product-owned sources and FAQs, then drops product columns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'piqi-knowledge-'))
    const file = join(dir, 'knowledge.db')
    const legacy = new DatabaseSync(file)
    legacy.exec(`
      CREATE TABLE sources (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, product_id TEXT NOT NULL, path TEXT NOT NULL,
        title TEXT, hash TEXT, card TEXT, keywords TEXT, UNIQUE(source_id, path)
      );
      CREATE TABLE chunks (
        id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL, source_id TEXT NOT NULL, product_id TEXT NOT NULL,
        kind TEXT NOT NULL, label TEXT NOT NULL, title TEXT, text TEXT NOT NULL
      );
      CREATE INDEX chunks_product ON chunks(product_id);
      CREATE VIRTUAL TABLE chunks_fts USING fts5(text, title, symbols, keywords);
      CREATE TABLE faq (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, question TEXT, answer TEXT, updated_at INTEGER);
    `)
    const legacySource = { ...source('old-source', 'files', 'old source'), productId: 'old-product' }
    legacy.prepare('INSERT INTO sources VALUES (?, ?, ?)').run(legacySource.id, 'old-product', JSON.stringify(legacySource))
    legacy.prepare('INSERT INTO documents (source_id, product_id, path, title) VALUES (?, ?, ?, ?)').run('old-source', 'old-product', 'old.md', 'Old')
    legacy.prepare('INSERT INTO chunks (doc_id, source_id, product_id, kind, label, title, text) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      1, 'old-source', 'old-product', 'files', 'old.md', 'Old', 'Legacy pooled search phrase'
    )
    legacy.prepare('INSERT INTO chunks_fts (rowid, text, title, symbols, keywords) VALUES (?, ?, ?, ?, ?)').run(
      1, 'Legacy pooled search phrase', 'Old', '', ''
    )
    legacy.prepare('INSERT INTO faq VALUES (?, ?, ?, ?, ?)').run('faq-1', 'another-product', 'Question', 'Answer', 1)
    legacy.close()

    try {
      const db = new KnowledgeDB(file)
      expect(db.sources()).toHaveLength(1)
      expect(db.sources()[0]).not.toHaveProperty('productId')
      expect(db.search('legacy pooled search')).toHaveLength(1)
      expect(db.faq()).toEqual([{ id: 'faq-1', question: 'Question', answer: 'Answer', updatedAt: 1 }])
      db.close()

      const migrated = new DatabaseSync(file)
      for (const table of ['sources', 'documents', 'chunks', 'faq']) {
        const columns = migrated.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
        expect(columns.some((column) => column.name === 'product_id')).toBe(false)
      }
      migrated.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
