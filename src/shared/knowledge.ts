// Bilgi bankası (kaynaklar) için süreçler arası tipler.

export type SourceKind = 'files' | 'code' | 'web' | 'confluence' | 'notion' | 'faq'

/** Kod reposundaki klasörlerin sınıfı (tasarım: "Klasörler ve sınıflandırma"). */
export type FolderCategory = 'kaynak' | 'dokuman' | 'yapilandirma' | 'test' | 'ci' | 'cikti' | 'diger'

/** Dokümanların konu kategorisi (otomatik atanır, değiştirilebilir). */
export type DocCategory = 'api' | 'mimari' | 'fiyat' | 'guvenlik' | 'sss' | 'genel'

export const FOLDER_CATEGORY_LABEL: Record<FolderCategory, string> = {
  kaynak: 'Kaynak kod',
  dokuman: 'Doküman',
  yapilandirma: 'Yapılandırma',
  test: 'Test',
  ci: 'CI',
  cikti: 'Derleme çıktısı',
  diger: 'Diğer'
}

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  api: 'API dokümanı',
  mimari: 'Mimari',
  fiyat: 'Fiyat ve paket',
  guvenlik: 'Güvenlik',
  sss: 'SSS',
  genel: 'Genel'
}

export type SourceStatus = 'queued' | 'indexing' | 'ready' | 'error'

export interface SourceStats {
  files: number
  chunks: number
  lines: number
  pages: number
  /** Yapay zeka kod/doküman kartı üretilen dosya sayısı. */
  cards: number
}

export interface CodeSourceConfig {
  root: string
  /** Git URL'den eklendiyse kaynak adres ve dal. */
  gitUrl?: string
  branch?: string
  /** Listelenen tüm klasörler (dosyayı en yakın klasöre bağlamak için). */
  listed: string[]
  /** Dahil edilen klasörler (köke göre göreli; "" kök dosyaları). */
  include: string[]
  folderCategories: Record<string, FolderCategory>
  respectGitignore: boolean
  symbolChunking: boolean
  /** Dosya başına Türkçe/İngilizce özet ve anahtar kelime (Türkçe soru → İngilizce kod eşleşmesi). */
  aiCards: boolean
  /** Kartlar için ayrı (ekonomik) model; yoksa etkin model. */
  cardModel?: { providerId: string; id: string }
}

export interface FilesSourceConfig {
  paths: string[]
  categories: Record<string, DocCategory>
  tags: Record<string, string[]>
  language: 'auto' | 'tr' | 'en'
}

export interface WebSourceConfig {
  url: string
  crawlSitemap: boolean
  maxPages: number
}

export interface ConfluenceSourceConfig {
  baseUrl: string
  email: string
  spaceKey: string
  /** Data Center/Server: kişisel erişim jetonu (Bearer); Cloud: e-posta + API jetonu (Basic). */
  deployment: 'cloud' | 'datacenter'
}

export interface NotionSourceConfig {
  /** Boşsa entegrasyonun erişebildiği tüm sayfalar. */
  query: string
  maxPages: number
}

export type SourceConfig =
  | { kind: 'files'; files: FilesSourceConfig }
  | { kind: 'code'; code: CodeSourceConfig }
  | { kind: 'web'; web: WebSourceConfig }
  | { kind: 'confluence'; confluence: ConfluenceSourceConfig }
  | { kind: 'notion'; notion: NotionSourceConfig }
  | { kind: 'faq' }

export interface SourceRecord {
  id: string
  kind: SourceKind
  name: string
  /** Klasör yolu, URL ya da açıklama. */
  location: string
  config: SourceConfig
  /** Kullanıcının kaynak hakkındaki notu (yapay zeka taramayı buna göre yönlendirir). */
  note: string
  /** Yapay zekanın çıkardığı odak özeti. */
  focus: string
  watch: boolean
  /** Aramada öncelik ver. */
  priority: boolean
  status: SourceStatus
  progress: number
  stage: string
  stats: SourceStats
  error: string | null
  warnings: string[]
  lastIndexedAt: number | null
  createdAt: number
}

// ── Tarama (ekleme penceresi önizlemesi) ──────────────────────────────────

export interface FolderScan {
  path: string
  depth: number
  files: number
  lines: number
  category: FolderCategory
  included: boolean
  /** .gitignore ya da derleme çıktısı olduğu için zorunlu hariç. */
  locked: boolean
  reason?: string
}

export interface LanguageShare {
  name: string
  share: number
  color: string
}

export interface CodeScan {
  root: string
  name: string
  branch: string | null
  branches: string[]
  folders: FolderScan[]
  languages: LanguageShare[]
  totals: { files: number; lines: number; chunks: number; seconds: number }
  secretsSkipped: string[]
  readme: string
  manifests: string[]
}

export interface FileScan {
  path: string
  name: string
  ext: string
  sizeBytes: number
  pages: number | null
  pageLabel: string
  category: DocCategory
  tags: string[]
  status: 'ok' | 'warn' | 'error'
  message: string
  chunks: number
}

/** Yapay zekanın klasör notu + ağaçtan çıkardığı tarama planı. */
export interface TriagePlan {
  folders: { path: string; include: boolean; category: FolderCategory; why: string }[]
  focus: string
  keywords: string[]
}

// ── Arama ─────────────────────────────────────────────────────────────────

export interface KnowledgeHit {
  chunkId: number
  sourceId: string
  sourceName: string
  kind: SourceKind
  /** Atıf etiketi: "API-Guide.pdf · s.14" ya da "src/auth/RateLimiter.ts:42". */
  label: string
  title: string
  text: string
  score: number
  /** Sorudaki kavramların bu parçada karşılanan oranı (0–1). */
  coverage?: number
}

export interface FaqEntry {
  id: string
  question: string
  answer: string
  updatedAt: number
}

export interface KnowledgeOverview {
  sources: SourceRecord[]
  totals: { sources: number; chunks: number; files: number }
  lastSyncAt: number | null
}

/** Hızlandırma ve maliyet önerisi. */
export interface Tactic {
  id: string
  title: string
  detail: string
  impact: 'hız' | 'maliyet' | 'isabet'
  state: 'active' | 'available' | 'idea'
  action?: 'enableCards' | 'excludeTests' | 'prebuildFaq' | 'onprem'
}
