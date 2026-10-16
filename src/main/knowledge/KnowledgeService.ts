import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type {
  CodeScan,
  FaqEntry,
  FileScan,
  FolderScan,
  KnowledgeHit,
  KnowledgeOverview,
  SourceConfig,
  SourceKind,
  SourceRecord,
  Tactic,
  TriagePlan
} from '@shared/knowledge'
import { DOC_CATEGORY_LABEL } from '@shared/knowledge'
import type { Settings } from '@shared/types'
import { presetById } from '@shared/providers'
import type { LlmService } from '../llm/LlmService'
import type { SecretStore } from '../SecretStore'
import { buildCards, cardEstimate, cardPreview, triage } from './ai'
import { categorizeDocument, tagsFor } from './categorize'
import { chunkCode, chunkDocument, type Chunk } from './chunker'
import { confluencePages, crawlWeb, gitBranches, gitSync, notionPages, type RemotePage } from './connectors'
import { extract, isSupportedDocument } from './extract'
import { KnowledgeDB } from './KnowledgeDB'
import { folderOf, scanCode, totalsFor, walk, type ScannedFile } from './scanner'

export interface AddSourceRequest {
  kind: SourceKind
  name: string
  location: string
  config: SourceConfig
  note: string
  focus: string
  watch: boolean
  priority: boolean
  /** Confluence/Notion jetonu: Keychain'e yazılır, kayıtta tutulmaz. */
  token?: string
}

const sha1 = (text: string | Buffer): string => createHash('sha1').update(text).digest('hex')

/**
 * Bilgi bankasının tek kapısı: tarama önizlemesi, yapay zeka tarama planı, indeksleme kuyruğu,
 * değişiklik izleme, SSS ve arama. Tek ürünün kaynak havuzunu yönetir.
 */
export class KnowledgeService extends EventEmitter<{ changed: [] }> {
  private scans = new Map<string, CodeScan & { scanned: ScannedFile[] }>()
  private queue: Promise<void> = Promise.resolve()
  private aborts = new Map<string, AbortController>()
  private watchers = new Map<string, FSWatcher>()
  private emitTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly db: KnowledgeDB,
    private readonly llm: LlmService,
    private readonly secrets: SecretStore,
    private readonly settings: () => Settings,
    private readonly reposDir: string
  ) {
    super()
    if (db.faq().length > 0) this.indexFaq()
    // Uygulama kapanırken yarım kalan indekslemeler yeniden kuyruğa.
    for (const source of db.sources()) {
      if (source.status === 'indexing' || source.status === 'queued') this.enqueue(source.id)
      if (source.watch) this.startWatch(source)
    }
  }

  // ── Okuma ──────────────────────────────────────────────────────────────

  overview(): KnowledgeOverview {
    const sources = this.db.sources().filter((s) => s.kind !== 'faq')
    return {
      sources,
      totals: {
        sources: sources.length,
        chunks: sources.reduce((n, s) => n + s.stats.chunks, 0),
        files: sources.reduce((n, s) => n + s.stats.files, 0)
      },
      lastSyncAt: sources.reduce<number | null>((t, s) => (s.lastIndexedAt && (!t || s.lastIndexedAt > t) ? s.lastIndexedAt : t), null)
    }
  }

  search(question: string, limit = 6): KnowledgeHit[] {
    const sources = this.db.sources()
    const priority = new Set(sources.filter((s) => s.priority).map((s) => s.id))
    return this.db.search(question, { limit, priority })
  }

  // ── Ekleme penceresi: önizleme ─────────────────────────────────────────

  async scanCode(input: { root?: string; gitUrl?: string; branch?: string }, respectGitignore = true): Promise<CodeScan> {
    let root = input.root
    if (input.gitUrl) {
      root = join(this.reposDir, sha1(input.gitUrl).slice(0, 12))
      await gitSync(input.gitUrl, input.branch, root)
    }
    if (!root || !existsSync(root)) throw new Error('Klasör bulunamadı')
    const scan = await scanCode(root, { respectGitignore })
    if (input.gitUrl) {
      scan.name = basename(input.gitUrl).replace(/\.git$/, '')
      scan.branches = await gitBranches(input.gitUrl).catch(() => scan.branches)
      scan.branch = input.branch ?? scan.branch
    }
    this.scans.set(root, scan)
    const { scanned: _scanned, ...publicScan } = scan
    return publicScan
  }

  async gitBranches(url: string): Promise<string[]> {
    return gitBranches(url)
  }

  /** Klasör seçimi değişince toplamları yeniden hesaplar. */
  totals(root: string, folders: FolderScan[]): CodeScan['totals'] {
    const scan = this.scans.get(root)
    return scan ? totalsFor(scan, folders) : { files: 0, lines: 0, chunks: 0, seconds: 0 }
  }

  /** Kullanıcı notu + klasör ağacından yapay zeka tarama planı. */
  async triage(root: string, note: string): Promise<TriagePlan> {
    const scan = this.scans.get(root)
    if (!scan) throw new Error('Önce klasörü tarayın')
    return triage(this.llm, scan, note)
  }

  cardEstimate(files: number): { tokens: number; seconds: number } {
    return cardEstimate(files)
  }

  /** Seçilen dosya ve klasörlerin önizlemesi: tür, sayfa, kategori, etiket ve okunabilirlik. */
  async scanFiles(paths: string[]): Promise<FileScan[]> {
    const files = await expandDocuments(paths)
    const out: FileScan[] = []
    for (const path of files.slice(0, 500)) {
      const name = basename(path)
      const ext = extname(path).slice(1).toLowerCase()
      const size = (await stat(path).catch(() => null))?.size ?? 0
      try {
        const extracted = await extract(path)
        const sample = extracted.units.map((u) => u.text).join('\n').slice(0, 6000)
        const chunks = chunkDocument(name, extracted.units).length
        out.push({
          path,
          name,
          ext,
          sizeBytes: size,
          pages: extracted.pages,
          pageLabel: extracted.pageLabel,
          category: categorizeDocument(name, sample),
          tags: tagsFor(name, sample),
          status: extracted.warnings.length ? 'warn' : chunks ? 'ok' : 'error',
          message: extracted.warnings[0] ?? (chunks ? 'Okundu' : 'Metin bulunamadı'),
          chunks
        })
      } catch (error) {
        out.push({
          path,
          name,
          ext,
          sizeBytes: size,
          pages: null,
          pageLabel: '',
          category: 'genel',
          tags: [],
          status: 'error',
          message: `Okunamadı: ${(error as Error).message.slice(0, 80)}`,
          chunks: 0
        })
      }
    }
    return out
  }

  // ── Kaynak yönetimi ────────────────────────────────────────────────────

  add(request: AddSourceRequest): SourceRecord {
    const source: SourceRecord = {
      id: randomUUID(),
      kind: request.kind,
      name: request.name,
      location: request.location,
      config: request.config,
      note: request.note,
      focus: request.focus,
      watch: request.watch,
      priority: request.priority,
      status: 'queued',
      progress: 0,
      stage: 'Sırada',
      stats: { files: 0, chunks: 0, lines: 0, pages: 0, cards: 0 },
      error: null,
      warnings: [],
      lastIndexedAt: null,
      createdAt: Date.now()
    }
    if (request.token) this.secrets.setApiKey(`source:${source.id}`, request.token)
    this.db.saveSource(source)
    this.enqueue(source.id)
    if (source.watch) this.startWatch(source)
    this.changed()
    return source
  }

  update(id: string, patch: Partial<Pick<SourceRecord, 'watch' | 'priority' | 'name' | 'note'>>): void {
    const source = this.db.source(id)
    if (!source) return
    const next = { ...source, ...patch }
    this.db.saveSource(next)
    if (patch.watch === true) this.startWatch(next)
    if (patch.watch === false) this.stopWatch(id)
    this.changed()
  }

  reindex(id: string): void {
    const source = this.db.source(id)
    if (!source) return
    this.patch(source, { status: 'queued', stage: 'Sırada', progress: 0, error: null })
    this.enqueue(id)
  }

  async remove(id: string): Promise<void> {
    const source = this.db.source(id)
    if (!source) return
    this.aborts.get(id)?.abort()
    this.stopWatch(id)
    this.db.deleteSource(id)
    this.secrets.setApiKey(`source:${id}`, null)
    if (source.kind === 'code' && source.config.kind === 'code' && source.config.code.gitUrl) {
      await rm(source.config.code.root, { recursive: true, force: true }).catch(() => undefined)
    }
    this.changed()
  }

  // ── SSS ve notlar ──────────────────────────────────────────────────────

  faq(): FaqEntry[] {
    return this.db.faq()
  }

  saveFaq(entry: Omit<FaqEntry, 'id' | 'updatedAt'> & { id?: string }): FaqEntry {
    const saved: FaqEntry = { ...entry, id: entry.id ?? randomUUID(), updatedAt: Date.now() }
    this.db.saveFaq(saved)
    this.indexFaq()
    return saved
  }

  deleteFaq(id: string): void {
    this.db.deleteFaq(id)
    this.indexFaq()
  }

  /** SSS, tek havuzda öncelikli bir kaynak olarak indekslenir. */
  private indexFaq(): void {
    const id = 'faq:all'
    let source = this.db.source(id)
    if (!source) {
      source = {
        id,
        kind: 'faq',
        name: 'SSS ve notlar',
        location: '',
        config: { kind: 'faq' },
        note: '',
        focus: '',
        watch: false,
        priority: true,
        status: 'ready',
        progress: 1,
        stage: '',
        stats: { files: 0, chunks: 0, lines: 0, pages: 0, cards: 0 },
        error: null,
        warnings: [],
        lastIndexedAt: null,
        createdAt: Date.now()
      }
    }
    const entries = this.db.faq()
    const keep = new Set(entries.map((e) => e.id))
    for (const doc of this.db.documents(id)) if (!keep.has(doc.path)) this.db.deleteDocument(doc.id)
    for (const e of entries) {
      this.db.writeDocument({
        sourceId: id,
        kind: 'faq',
        path: e.id,
        title: e.question,
        hash: sha1(e.question + e.answer),
        chunks: [{ text: `Soru: ${e.question}\nOnaylı cevap: ${e.answer}`, title: e.question, symbols: [] }],
        labelFor: () => 'SSS'
      })
    }
    this.db.saveSource({ ...source, stats: { ...source.stats, files: entries.length, chunks: entries.length }, lastIndexedAt: Date.now() })
    this.changed()
  }

  // ── Hızlandırma ve maliyet önerileri ───────────────────────────────────

  /** Önerinin tek tıkla uygulanması (kodu yeniden indeksler; değişmeyen dosyalar atlanır). */
  applyTactic(action: 'enableCards' | 'excludeTests' | 'prebuildFaq'): void {
    for (const source of this.db.sources()) {
      if (source.config.kind !== 'code') continue
      const code = source.config.code
      if (action === 'enableCards' && !code.aiCards) {
        this.db.saveSource({ ...source, config: { kind: 'code', code: { ...code, aiCards: true } } })
        this.reindex(source.id)
      }
      if (action === 'excludeTests') {
        const include = code.include.filter((p) => !/(^|\/)(tests?|__tests__|specs?|e2e)$/.test(p))
        if (include.length !== code.include.length) {
          this.db.saveSource({ ...source, config: { kind: 'code', code: { ...code, include } } })
          this.reindex(source.id)
        }
      }
    }
  }

  tactics(): Tactic[] {
    const sources = this.db.sources()
    const code = sources.filter((s) => s.config.kind === 'code')
    const settings = this.settings()
    const cloud = presetById(settings.model.providerId)?.location === 'cloud'
    const tactics: Tactic[] = [
      {
        id: 'bm25',
        title: 'Yerel tam metin indeksi',
        detail: 'Arama bu Mac’te SQLite FTS5 ile yapılır: soru başına 0 maliyet, ~10 ms. Modele yalnızca en alakalı 6 parça gider.',
        impact: 'maliyet',
        state: 'active'
      },
      {
        id: 'tr-en',
        title: 'Türkçe kök + TR↔EN teknik sözlük',
        detail: '“limitleri aşılırsa” → limit*, rate limit, throttle. Türkçe sorular İngilizce kodu model çağrısı olmadan bulur.',
        impact: 'isabet',
        state: 'active'
      },
      {
        id: 'incremental',
        title: 'Yalnızca değişeni yeniden indeksle',
        detail: 'Dosya içeriği değişmediyse yeniden okunmaz, parçalanmaz ve kartı yeniden üretilmez.',
        impact: 'hız',
        state: 'active'
      }
    ]
    const withoutCards = code.filter((s) => s.config.kind === 'code' && !s.config.code.aiCards)
    tactics.push({
      id: 'cards',
      title: 'Yapay zeka kod kartları',
      detail:
        'Dosya başına bir kez üretilen Türkçe özet ve TR/EN anahtar kelimeler. Toplantıda “ödeme iadesi nerede?” sorusu `RefundService.ts`’i bulur. ' +
        'Ekonomik bir modelle (Flash-Lite, Haiku, yerel Qwen) 1.000 dosya ≈ 450 bin token.',
      impact: 'isabet',
      state: code.length === 0 ? 'idea' : withoutCards.length ? 'available' : 'active',
      action: withoutCards.length ? 'enableCards' : undefined
    })
    const withTests = code.filter((s) => s.config.kind === 'code' && s.config.code.include.some((p) => /(^|\/)(tests?|__tests__|specs?|e2e)$/.test(p)))
    if (withTests.length) {
      tactics.push({
        id: 'tests',
        title: 'Testleri hariç tut',
        detail: 'Test klasörleri müşteri sorularına nadiren cevap verir ama indeksi ve kart maliyetini büyütür.',
        impact: 'maliyet',
        state: 'available',
        action: 'excludeTests'
      })
    }
    tactics.push(
      {
        id: 'cache',
        title: 'İstem önbelleği',
        detail:
          settings.model.providerId === 'anthropic'
            ? 'Ürün talimatı ve sabit bağlam önbelleğe alınır; tekrar eden kısım ~%90 daha ucuz ve daha hızlı.'
            : 'Claude’da sabit bağlam önbelleğe alınır (~%90 indirim). Diğer sağlayıcılarda sağlayıcının otomatik önbelleği kullanılır.',
        impact: 'maliyet',
        state: settings.model.providerId === 'anthropic' ? 'active' : 'available'
      },
      {
        id: 'onprem',
        title: 'Kurum içi model',
        detail: 'Bankanın sunucusundaki Qwen (vLLM/Ollama) ile soru başına bulut maliyeti sıfır, veri ağ dışına çıkmaz.',
        impact: 'maliyet',
        state: cloud ? 'available' : 'active',
        action: cloud ? 'onprem' : undefined
      },
      {
        id: 'faq-first',
        title: 'Önce SSS',
        detail: 'Onaylı cevaplar aramada 1,6 kat öne alınır; aynı soru tekrar geldiğinde kısa ve kesin cevap gelir.',
        impact: 'isabet',
        state: 'active'
      },
      {
        id: 'prebuild',
        title: 'Toplantı öncesi hazır cevaplar',
        detail: 'Kaynaklardan müşterinin soracağı 20–30 soruyu önceden çıkarıp SSS’ye yaz; toplantıda model çağrısı olmadan anında cevap.',
        impact: 'hız',
        state: 'idea'
      },
      {
        id: 'semantic',
        title: 'Yerel anlamsal arama',
        detail: 'Apple’ın cihaz üzerindeki gömme modeliyle (NLContextualEmbedding) eş anlamlı soruları da yakala; maliyetsiz.',
        impact: 'isabet',
        state: 'idea'
      },
      {
        id: 'graph',
        title: 'Kod grafiği',
        detail: 'Bulunan fonksiyonun çağırdığı/çağrıldığı yerleri de getir; “bu akış nasıl çalışıyor?” sorularında tek çağrıda bütünlüklü cevap.',
        impact: 'isabet',
        state: 'idea'
      }
    )
    return tactics
  }

  // ── İndeksleme ─────────────────────────────────────────────────────────

  private enqueue(id: string): void {
    this.queue = this.queue.then(() => this.index(id)).catch((error) => console.error('[piqi] indeksleme:', error))
  }

  private async index(id: string): Promise<void> {
    const source = this.db.source(id)
    if (!source || source.kind === 'faq') return
    const abort = new AbortController()
    this.aborts.set(id, abort)
    this.patch(source, { status: 'indexing', progress: 0.02, stage: 'Hazırlanıyor', error: null, warnings: [] })
    try {
      const config = source.config
      if (config.kind === 'code') await this.indexCode(source, config.code, abort.signal)
      else if (config.kind === 'files') await this.indexFiles(source, config.files.paths, abort.signal)
      else if (config.kind === 'web') {
        const pages = await crawlWeb(config.web.url, config.web.crawlSitemap, config.web.maxPages, (n) =>
          this.patch(source, { stage: `${n} sayfa alındı`, progress: Math.min(0.9, n / config.web.maxPages) })
        )
        await this.indexPages(source, pages, abort.signal)
      } else if (config.kind === 'confluence') {
        const token = this.secrets.getApiKey(`source:${id}`)
        if (!token) throw new Error('Confluence jetonu yok')
        const pages = await confluencePages(config.confluence, token, (n) => this.patch(source, { stage: `${n} sayfa alındı`, progress: 0.4 }))
        await this.indexPages(source, pages, abort.signal)
      } else if (config.kind === 'notion') {
        const token = this.secrets.getApiKey(`source:${id}`)
        if (!token) throw new Error('Notion jetonu yok')
        const pages = await notionPages(config.notion.query, config.notion.maxPages, token, (n) =>
          this.patch(source, { stage: `${n} sayfa alındı`, progress: Math.min(0.8, n / config.notion.maxPages) })
        )
        await this.indexPages(source, pages, abort.signal)
      }
      if (abort.signal.aborted) return
      const latest = this.db.source(id)!
      const counts = this.db.counts(id)
      this.patch(latest, {
        status: 'ready',
        progress: 1,
        stage: '',
        lastIndexedAt: Date.now(),
        stats: { ...latest.stats, files: counts.files, chunks: counts.chunks, cards: counts.cards }
      })
    } catch (error) {
      if (abort.signal.aborted) return
      const latest = this.db.source(id)
      if (latest) this.patch(latest, { status: 'error', stage: '', error: (error as Error).message })
    } finally {
      this.aborts.delete(id)
    }
  }

  private async indexCode(source: SourceRecord, config: Extract<SourceConfig, { kind: 'code' }>['code'], signal: AbortSignal): Promise<void> {
    if (config.gitUrl) {
      this.patch(source, { stage: 'Git deposu güncelleniyor', progress: 0.05 })
      await gitSync(config.gitUrl, config.branch, config.root)
    }
    this.patch(source, { stage: 'Taranıyor', progress: 0.08 })
    const { files, secrets } = await walk(config.root, { respectGitignore: config.respectGitignore })
    const include = new Set(config.include)
    const selected = files.filter((f) => include.has(folderOf(f.rel, config.listed)))
    const existing = new Map(this.db.documents(source.id).map((d) => [d.path, d]))
    const seen = new Set<string>()
    let lines = 0

    for (let i = 0; i < selected.length; i++) {
      if (signal.aborted) return
      const file = selected[i]!
      seen.add(file.rel)
      const text = await readFile(join(config.root, file.rel), 'utf8').catch(() => null)
      if (text == null) continue
      lines += file.lines
      const hash = sha1(text)
      if (existing.get(file.rel)?.hash === hash) continue
      const chunks = chunkCode(file.rel, text, config.symbolChunking)
      this.db.writeDocument({
        sourceId: source.id,
        kind: 'code',
        path: file.rel,
        title: file.rel,
        hash,
        chunks,
        labelFor: (c) => `${file.rel}:${c.lineStart}`
      })
      if (i % 25 === 0) {
        this.patch(source, { stage: `Kod parçalanıyor · ${i + 1}/${selected.length}`, progress: 0.1 + 0.5 * (i / Math.max(1, selected.length)) })
        await new Promise((r) => setImmediate(r))
      }
    }
    for (const [path, doc] of existing) if (!seen.has(path)) this.db.deleteDocument(doc.id)
    this.patch(source, {
      stats: { ...source.stats, lines },
      warnings: secrets.length ? [`${secrets.length} olası gizli dosya atlandı: ${secrets.slice(0, 3).join(', ')}`] : []
    })

    if (config.aiCards) await this.buildCards(source, config, signal)
  }

  /** Kartı olmayan (yeni/değişmiş) dosyalar için 12'li gruplar hâlinde, 3 paralel istekle kart üretir. */
  private async buildCards(source: SourceRecord, config: Extract<SourceConfig, { kind: 'code' }>['code'], signal: AbortSignal): Promise<void> {
    const pending = this.db.pathsWithoutCard(source.id)
    if (!pending.length) return
    const batches: string[][] = []
    for (let i = 0; i < pending.length; i += 12) batches.push(pending.slice(i, i + 12))
    let done = 0
    const failures: string[] = []
    const worker = async (): Promise<void> => {
      for (;;) {
        const batch = batches.shift()
        if (!batch || signal.aborted) return
        try {
          const inputs = await Promise.all(
            batch.map(async (path) => ({ path, preview: cardPreview(await readFile(join(config.root, path), 'utf8').catch(() => '')) }))
          )
          const cards = await buildCards(this.llm, inputs, source.focus, config.cardModel)
          for (const card of cards) this.db.setCard(source.id, card.path, card.summary, card.keywords.join(' '))
        } catch (error) {
          failures.push((error as Error).message)
          // Politika, anahtar ya da bağlantı hatasında diğer grupları boşuna deneme.
          if (/anahtar|politika|bağlan|geçersiz/i.test((error as Error).message)) batches.length = 0
        }
        done += batch.length
        const latest = this.db.source(source.id)!
        this.patch(latest, { stage: `Yapay zeka kartları · ${done}/${pending.length}`, progress: 0.6 + 0.38 * (done / pending.length) })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    if (failures.length) {
      const latest = this.db.source(source.id)!
      this.patch(latest, { warnings: [...latest.warnings, `Kartların bir kısmı üretilemedi: ${failures[0]}`] })
    }
  }

  private async indexFiles(source: SourceRecord, paths: string[], signal: AbortSignal): Promise<void> {
    const config = source.config.kind === 'files' ? source.config.files : null
    const files = await expandDocuments(paths)
    const existing = new Map(this.db.documents(source.id).map((d) => [d.path, d]))
    const seen = new Set<string>()
    const warnings: string[] = []
    let pages = 0
    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) return
      const path = files[i]!
      seen.add(path)
      const name = basename(path)
      this.patch(source, { stage: `${name} okunuyor · ${i + 1}/${files.length}`, progress: 0.05 + 0.9 * (i / Math.max(1, files.length)) })
      const info = await stat(path).catch(() => null)
      if (!info) continue
      const hash = sha1(`${info.size}:${info.mtimeMs}`)
      if (existing.get(path)?.hash === hash) continue
      try {
        const extracted = await extract(path)
        pages += extracted.pages ?? 0
        if (extracted.warnings.length) warnings.push(`${name}: ${extracted.warnings[0]}`)
        const sample = extracted.units.map((u) => u.text).join('\n').slice(0, 6000)
        const category = config?.categories[path] ?? categorizeDocument(name, sample)
        const tags = config?.tags[path] ?? tagsFor(name, sample)
        this.db.writeDocument({
          sourceId: source.id,
          kind: 'files',
          path,
          title: name,
          hash,
          chunks: chunkDocument(name, extracted.units),
          labelFor: (c: Chunk) => (c.pageLabel ? `${name} · ${c.pageLabel}` : name),
          keywords: `${DOC_CATEGORY_LABEL[category]} ${tags.join(' ')}`
        })
      } catch (error) {
        warnings.push(`${name}: okunamadı (${(error as Error).message.slice(0, 60)})`)
      }
      await new Promise((r) => setImmediate(r))
    }
    for (const [path, doc] of existing) if (!seen.has(path)) this.db.deleteDocument(doc.id)
    const latest = this.db.source(source.id)!
    this.patch(latest, { warnings, stats: { ...latest.stats, pages } })
  }

  private async indexPages(source: SourceRecord, pages: RemotePage[], signal: AbortSignal): Promise<void> {
    const existing = new Map(this.db.documents(source.id).map((d) => [d.path, d]))
    const seen = new Set<string>()
    for (let i = 0; i < pages.length; i++) {
      if (signal.aborted) return
      const page = pages[i]!
      seen.add(page.id)
      const hash = sha1(page.text)
      if (existing.get(page.id)?.hash !== hash) {
        this.db.writeDocument({
          sourceId: source.id,
          kind: source.kind,
          path: page.id,
          title: page.title,
          hash,
          chunks: chunkDocument(page.title, [{ text: page.text }]),
          labelFor: () => page.title
        })
      }
      if (i % 10 === 0) this.patch(source, { stage: `İndeksleniyor · ${i + 1}/${pages.length}`, progress: 0.8 + 0.18 * (i / pages.length) })
    }
    for (const [path, doc] of existing) if (!seen.has(path)) this.db.deleteDocument(doc.id)
  }

  // ── Değişiklik izleme ──────────────────────────────────────────────────

  private startWatch(source: SourceRecord): void {
    this.stopWatch(source.id)
    const root =
      source.config.kind === 'code' ? source.config.code.root : source.config.kind === 'files' ? source.config.files.paths[0] : null
    if (!root || !existsSync(root) || (source.config.kind === 'code' && source.config.code.gitUrl)) return
    let timer: NodeJS.Timeout | null = null
    try {
      const watcher = watch(root, { recursive: true }, (_event, file) => {
        if (file && /(^|\/)(\.git|node_modules|dist|build)(\/|$)/.test(String(file))) return
        if (timer) clearTimeout(timer)
        // Kaydetme fırtınalarını birleştir; yalnızca değişen dosyalar yeniden işlenir.
        timer = setTimeout(() => this.reindex(source.id), 4_000)
      })
      this.watchers.set(source.id, watcher)
    } catch (error) {
      console.warn('[piqi] izleme başlatılamadı:', error)
    }
  }

  private stopWatch(id: string): void {
    this.watchers.get(id)?.close()
    this.watchers.delete(id)
  }

  dispose(): void {
    for (const id of [...this.watchers.keys()]) this.stopWatch(id)
    for (const a of this.aborts.values()) a.abort()
    if (this.emitTimer) clearTimeout(this.emitTimer)
    this.db.close()
  }

  private patch(source: SourceRecord, patch: Partial<SourceRecord>): void {
    const latest = this.db.source(source.id)
    if (!latest) return
    const next = { ...latest, ...patch, stats: { ...latest.stats, ...patch.stats } }
    this.db.saveSource(next)
    this.changed()
  }

  /** Arayüze değişiklik bildirimi (ilerleme olaylarını 250 ms'de bir birleştirir). */
  private changed(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('changed')
    }, 250)
  }
}

/** Dosya ve klasör yollarını desteklenen belge dosyalarına açar (klasörler özyinelemeli). */
async function expandDocuments(paths: string[]): Promise<string[]> {
  const out: string[] = []
  const visit = async (path: string, depth: number): Promise<void> => {
    const info = await stat(path).catch(() => null)
    if (!info) return
    if (info.isDirectory()) {
      if (depth > 6 || /(^|\/)(\.|node_modules|dist|build)/.test(basename(path))) return
      for (const entry of await readdir(path).catch(() => [])) await visit(join(path, entry), depth + 1)
    } else if (isSupportedDocument(path) && info.size <= 80 * 1024 * 1024) out.push(path)
  }
  for (const p of paths) await visit(p, 0)
  return [...new Set(out)]
}
