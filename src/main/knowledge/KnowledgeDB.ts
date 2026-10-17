import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import type { FaqEntry, KnowledgeHit, SourceKind, SourceRecord } from '@shared/knowledge'
import type { Chunk } from './chunker'
import { buildFtsQuery, coverage, identifierWords, queryConcepts, wordSet } from './query'

/** FTS5'ten yeniden sıralama için alınan aday parça sayısı. */
const CANDIDATES = 60
/** En iyi sonucun bu oranının altında kalan parçalar modele gönderilmez. */
const MIN_RELATIVE_SCORE = 0.3
const MIN_RELATIVE_COVERAGE = 0.5
/** Kapsamanın BM25'e etkisi: puan × (taban + kapsama). Taban büyüdükçe BM25 sırası daha az değişir. */
const COVERAGE_BASE = 0.5

export interface DocumentRow {
  id: number
  sourceId: string
  path: string
  hash: string
}

/**
 * Yerel bilgi bankası: Node'un yerleşik SQLite'ı + FTS5 tam metin indeksi. Ağ veya gömme modeli gerekmez.
 */
export class KnowledgeDB {
  private db: DatabaseSync
  private stmts: Record<string, StatementSync> = {}
  private meta: { names: Map<string, string>; priority: Set<string> } | null = null

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, path TEXT NOT NULL,
        title TEXT, hash TEXT, card TEXT, keywords TEXT, UNIQUE(source_id, path)
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL, source_id TEXT NOT NULL,
        kind TEXT NOT NULL, label TEXT NOT NULL, title TEXT, text TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text, title, symbols, keywords, tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TABLE IF NOT EXISTS faq (id TEXT PRIMARY KEY, question TEXT, answer TEXT, updated_at INTEGER);
    `)
    this.migrateSinglePoolSchema()
  }

  private stmt(sql: string): StatementSync {
    return (this.stmts[sql] ??= this.db.prepare(sql))
  }

  // ── Kaynaklar ──────────────────────────────────────────────────────────

  saveSource(source: SourceRecord): void {
    this.meta = null
    this.stmt('INSERT INTO sources (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(source.id, JSON.stringify(source))
  }

  sources(): SourceRecord[] {
    const rows = this.stmt('SELECT data FROM sources').all() as { data: string }[]
    return rows
      .map((r) => {
        const { productId: _legacy, ...source } = JSON.parse(r.data) as SourceRecord & { productId?: string }
        return source
      })
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  source(id: string): SourceRecord | null {
    const row = this.stmt('SELECT data FROM sources WHERE id = ?').get(id) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as SourceRecord) : null
  }

  deleteSource(id: string): void {
    this.meta = null
    this.transaction(() => {
      for (const doc of this.documents(id)) this.deleteDocument(doc.id)
      this.stmt('DELETE FROM sources WHERE id = ?').run(id)
    })
  }

  // ── Belgeler ve parçalar ───────────────────────────────────────────────

  documents(sourceId: string): DocumentRow[] {
    return (this.stmt('SELECT id, source_id, path, hash FROM documents WHERE source_id = ?').all(sourceId) as {
      id: number
      source_id: string
      path: string
      hash: string
    }[]).map((r) => ({ id: r.id, sourceId: r.source_id, path: r.path, hash: r.hash }))
  }

  /** Belgeyi ve parçalarını yazar (varsa eskisinin yerine). */
  writeDocument(input: {
    sourceId: string
    kind: SourceKind
    path: string
    title: string
    hash: string
    labelFor: (chunk: Chunk) => string
    chunks: Chunk[]
    keywords?: string
    card?: string
  }): number {
    let docId = 0
    this.transaction(() => {
      const existing = this.stmt('SELECT id FROM documents WHERE source_id = ? AND path = ?').get(input.sourceId, input.path) as
        | { id: number }
        | undefined
      if (existing) this.deleteChunks(existing.id)
      this.stmt(
        `INSERT INTO documents (source_id, path, title, hash, card, keywords) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, path) DO UPDATE SET title = excluded.title, hash = excluded.hash,
           card = COALESCE(excluded.card, CASE WHEN documents.hash = excluded.hash THEN documents.card END),
           keywords = COALESCE(excluded.keywords, CASE WHEN documents.hash = excluded.hash THEN documents.keywords END)`
      ).run(input.sourceId, input.path, input.title, input.hash, input.card ?? null, input.keywords ?? null)
      docId = (this.stmt('SELECT id FROM documents WHERE source_id = ? AND path = ?').get(input.sourceId, input.path) as { id: number }).id
      const card = (this.stmt('SELECT card, keywords FROM documents WHERE id = ?').get(docId) as { card: string | null; keywords: string | null })
      for (const chunk of input.chunks) {
        const result = this.stmt(
          'INSERT INTO chunks (doc_id, source_id, kind, label, title, text) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(docId, input.sourceId, input.kind, input.labelFor(chunk), chunk.title, chunk.text)
        const id = Number(result.lastInsertRowid)
        const symbols = chunk.symbols.join(' ')
        const keywords = [card.keywords ?? '', card.card ?? '', input.kind === 'code' ? identifierWords(chunk.text) : ''].join(' ')
        this.stmt('INSERT INTO chunks_fts (rowid, text, title, symbols, keywords) VALUES (?, ?, ?, ?, ?)').run(
          id,
          chunk.text,
          chunk.title,
          `${symbols} ${symbols.replace(/([a-z0-9])([A-Z])/g, '$1 $2')}`,
          keywords
        )
      }
    })
    return docId
  }

  /** Yapay zeka kartını (özet + anahtar kelimeler) belgeye ve parçalarının arama alanına yazar. */
  setCard(sourceId: string, path: string, card: string, keywords: string): void {
    this.transaction(() => {
      const doc = this.stmt('SELECT id FROM documents WHERE source_id = ? AND path = ?').get(sourceId, path) as { id: number } | undefined
      if (!doc) return
      this.stmt('UPDATE documents SET card = ?, keywords = ? WHERE id = ?').run(card, keywords, doc.id)
      for (const row of this.stmt('SELECT id FROM chunks WHERE doc_id = ?').all(doc.id) as { id: number }[]) {
        const fts = this.stmt('SELECT keywords FROM chunks_fts WHERE rowid = ?').get(row.id) as { keywords: string } | undefined
        this.stmt('UPDATE chunks_fts SET keywords = ? WHERE rowid = ?').run(`${keywords} ${card} ${fts?.keywords ?? ''}`, row.id)
      }
    })
  }

  /** Kartı olmayan belgeler (yeni ya da değişmiş). */
  pathsWithoutCard(sourceId: string): string[] {
    return (this.stmt('SELECT path FROM documents WHERE source_id = ? AND card IS NULL').all(sourceId) as { path: string }[]).map((r) => r.path)
  }

  hasCard(sourceId: string, path: string): boolean {
    const row = this.stmt('SELECT card FROM documents WHERE source_id = ? AND path = ?').get(sourceId, path) as { card: string | null } | undefined
    return Boolean(row?.card)
  }

  deleteDocument(docId: number): void {
    this.deleteChunks(docId)
    this.stmt('DELETE FROM documents WHERE id = ?').run(docId)
  }

  private deleteChunks(docId: number): void {
    for (const row of this.stmt('SELECT id FROM chunks WHERE doc_id = ?').all(docId) as { id: number }[]) {
      this.stmt('DELETE FROM chunks_fts WHERE rowid = ?').run(row.id)
    }
    this.stmt('DELETE FROM chunks WHERE doc_id = ?').run(docId)
  }

  counts(sourceId: string): { files: number; chunks: number; cards: number } {
    const files = (this.stmt('SELECT COUNT(*) n FROM documents WHERE source_id = ?').get(sourceId) as { n: number }).n
    const chunks = (this.stmt('SELECT COUNT(*) n FROM chunks WHERE source_id = ?').get(sourceId) as { n: number }).n
    const cards = (this.stmt('SELECT COUNT(*) n FROM documents WHERE source_id = ? AND card IS NOT NULL').get(sourceId) as { n: number }).n
    return { files, chunks, cards }
  }

  // ── Arama ──────────────────────────────────────────────────────────────

  /**
   * BM25 sıralı arama, ardından kavram kapsamasıyla yeniden sıralama: sorudaki kavramların çoğunu karşılayan
   * parça, tek bir kelimesi çok geçen parçanın önüne geçer. En iyi sonuca göre zayıf kalan parçalar elenir;
   * böylece modele alakasız bağlam gitmez. Aynı belgeden en fazla 2 parça döner; öncelikli kaynaklar ve SSS öne alınır.
   */
  search(question: string, options: { limit?: number; extra?: string[]; priority?: Set<string> } = {}): KnowledgeHit[] {
    const query = buildFtsQuery(question, options.extra)
    if (!query) return []
    const limit = options.limit ?? 6
    let rows: { id: number; doc_id: number; source_id: string; kind: SourceKind; label: string; title: string; text: string; score: number }[]
    try {
      rows = this.stmt(
        `SELECT c.id, c.doc_id, c.source_id, c.kind, c.label, c.title, c.text, bm25(chunks_fts, 1.0, 1.6, 3.0, 2.2) AS score
         FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
        WHERE chunks_fts MATCH ?
         ORDER BY score LIMIT ${CANDIDATES}`
      ).all(query) as typeof rows
    } catch {
      return []
    }
    if (!rows.length) return []
    const meta = this.sourceMeta()
    const priority = options.priority ?? meta.priority
    const concepts = queryConcepts(question)
    const ranked = rows
      .map((r) => {
        const covered = coverage(concepts, wordSet(`${r.title} ${r.text}`))
        const boost = r.kind === 'faq' ? 1.6 : priority.has(r.source_id) ? 1.3 : 1
        // bm25 negatiftir (küçük = iyi); pozitif alaka puanına çevrilir.
        return { ...r, covered, relevance: -r.score * boost * (COVERAGE_BASE + covered) }
      })
      .sort((a, b) => b.relevance - a.relevance)
    const best = ranked[0]!
    const perDoc = new Map<number, number>()
    const hits: KnowledgeHit[] = []
    for (const r of ranked) {
      if (r.relevance < best.relevance * MIN_RELATIVE_SCORE || r.covered < best.covered * MIN_RELATIVE_COVERAGE) continue
      const n = perDoc.get(r.doc_id) ?? 0
      if (n >= 2) continue
      perDoc.set(r.doc_id, n + 1)
      hits.push({
        chunkId: r.id,
        sourceId: r.source_id,
        sourceName: meta.names.get(r.source_id) ?? '',
        kind: r.kind,
        label: r.label,
        title: r.title,
        text: r.text,
        score: r.relevance,
        coverage: r.covered
      })
      if (hits.length >= limit) break
    }
    return hits
  }

  /** Aramada her sorguda kaynak JSON'larını çözmemek için ad ve öncelik bilgisi önbelleklenir. */
  private sourceMeta(): { names: Map<string, string>; priority: Set<string> } {
    if (!this.meta) {
      const sources = this.sources()
      this.meta = {
        names: new Map(sources.map((s) => [s.id, s.name])),
        priority: new Set(sources.filter((s) => s.priority).map((s) => s.id))
      }
    }
    return this.meta
  }

  // ── SSS ────────────────────────────────────────────────────────────────

  faq(): FaqEntry[] {
    return (this.stmt('SELECT id, question, answer, updated_at FROM faq ORDER BY updated_at DESC').all() as {
      id: string
      question: string
      answer: string
      updated_at: number
    }[]).map((r) => ({ id: r.id, question: r.question, answer: r.answer, updatedAt: r.updated_at }))
  }

  saveFaq(entry: FaqEntry): void {
    this.stmt(
      'INSERT INTO faq (id, question, answer, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET question = excluded.question, answer = excluded.answer, updated_at = excluded.updated_at'
    ).run(entry.id, entry.question, entry.answer, entry.updatedAt)
  }

  deleteFaq(id: string): void {
    this.stmt('DELETE FROM faq WHERE id = ?').run(id)
  }

  /** Eski çoklu ürün verisini tek havuzda birleştirir ve sahiplik sütunlarını kaldırır. */
  private migrateSinglePoolSchema(): void {
    const version = (this.stmt('PRAGMA user_version').get() as { user_version: number }).user_version
    if (version >= 1) return
    this.transaction(() => {
      for (const source of this.sources()) {
        if (source.kind === 'faq') {
          for (const doc of this.documents(source.id)) {
            this.deleteChunks(doc.id)
            this.stmt('DELETE FROM documents WHERE id = ?').run(doc.id)
          }
          this.stmt('DELETE FROM sources WHERE id = ?').run(source.id)
          continue
        }
        const { productId: _legacy, ...singleSource } = source as SourceRecord & { productId?: string }
        this.stmt('UPDATE sources SET data = ? WHERE id = ?').run(JSON.stringify(singleSource), source.id)
      }
      this.stmt('DROP INDEX IF EXISTS chunks_product').run()
      for (const table of ['sources', 'documents', 'chunks', 'faq']) {
        const columns = this.stmt(`PRAGMA table_info(${table})`).all() as { name: string }[]
        if (columns.some((column) => column.name === 'product_id')) {
          this.stmt(`ALTER TABLE ${table} DROP COLUMN product_id`).run()
        }
      }
      this.db.exec('PRAGMA user_version = 1')
    })
  }

  transaction(fn: () => void): void {
    this.db.exec('BEGIN')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}
