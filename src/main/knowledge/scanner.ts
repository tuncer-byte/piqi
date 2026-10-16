import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import ignore, { type Ignore } from 'ignore'
import type { CodeScan, FolderCategory, FolderScan, LanguageShare } from '@shared/knowledge'

const run = promisify(execFile)

/** İndekslenmeyen derleme çıktıları ve bağımlılık klasörleri (her zaman hariç). */
const BUILD_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', '.next', '.nuxt', '.svelte-kit', 'vendor', 'coverage',
  '.venv', 'venv', '__pycache__', 'bin', 'obj', '.gradle', 'Pods', 'DerivedData', '.turbo', '.cache',
  '.parcel-cache', '.terraform', 'bower_components', '.yarn', '.pnpm-store', 'storybook-static'
])
const HIDDEN_SKIP = new Set(['.git', '.idea', '.vscode', '.DS_Store', '.husky', '.svn', '.hg'])

const CATEGORY_BY_NAME: [RegExp, FolderCategory][] = [
  [/^(tests?|__tests__|specs?|e2e|integration-tests|testdata|test-data|fixtures|mocks?|__mocks__|cypress|playwright)$/i, 'test'],
  [/^(\.github|\.gitlab|\.circleci|\.buildkite|ci|\.ci|jenkins|\.azure-pipelines|pipelines)$/i, 'ci'],
  [/^(docs?|documentation|wiki|adr|adrs|guides?|manual|handbook|rfcs?)$/i, 'dokuman'],
  [/^(config|configs|conf|deploy|deployment|deployments|k8s|kubernetes|helm|charts|infra|infrastructure|terraform|ops|\.config|settings|env|environments)$/i, 'yapilandirma'],
  [/^(src|source|lib|libs|app|apps|packages|pkg|internal|cmd|api|server|client|services?|modules|core|components|web|frontend|backend|handlers|controllers|domain|common|shared|main)$/i, 'kaynak']
]

/** Dil adı, rengi ve kod mu doküman mı. */
const LANGUAGES: Record<string, { name: string; color: string; kind: 'code' | 'doc' | 'config' }> = {
  ts: { name: 'TypeScript', color: '#3178C6', kind: 'code' },
  tsx: { name: 'TypeScript', color: '#3178C6', kind: 'code' },
  js: { name: 'JavaScript', color: '#E6C84C', kind: 'code' },
  jsx: { name: 'JavaScript', color: '#E6C84C', kind: 'code' },
  mjs: { name: 'JavaScript', color: '#E6C84C', kind: 'code' },
  cjs: { name: 'JavaScript', color: '#E6C84C', kind: 'code' },
  go: { name: 'Go', color: '#E8E8EA', kind: 'code' },
  py: { name: 'Python', color: '#4B8BBE', kind: 'code' },
  java: { name: 'Java', color: '#B07219', kind: 'code' },
  kt: { name: 'Kotlin', color: '#A97BFF', kind: 'code' },
  kts: { name: 'Kotlin', color: '#A97BFF', kind: 'code' },
  swift: { name: 'Swift', color: '#F05138', kind: 'code' },
  cs: { name: 'C#', color: '#178600', kind: 'code' },
  rb: { name: 'Ruby', color: '#CC342D', kind: 'code' },
  php: { name: 'PHP', color: '#777BB4', kind: 'code' },
  rs: { name: 'Rust', color: '#DEA584', kind: 'code' },
  scala: { name: 'Scala', color: '#DC322F', kind: 'code' },
  c: { name: 'C/C++', color: '#6E8BB8', kind: 'code' },
  h: { name: 'C/C++', color: '#6E8BB8', kind: 'code' },
  cpp: { name: 'C/C++', color: '#6E8BB8', kind: 'code' },
  hpp: { name: 'C/C++', color: '#6E8BB8', kind: 'code' },
  m: { name: 'Objective-C', color: '#438EFF', kind: 'code' },
  vue: { name: 'Vue', color: '#41B883', kind: 'code' },
  svelte: { name: 'Svelte', color: '#FF3E00', kind: 'code' },
  sql: { name: 'SQL', color: '#E38C00', kind: 'code' },
  sh: { name: 'Shell', color: '#89E051', kind: 'code' },
  proto: { name: 'Protobuf', color: '#9AA3B0', kind: 'code' },
  graphql: { name: 'GraphQL', color: '#E10098', kind: 'code' },
  gql: { name: 'GraphQL', color: '#E10098', kind: 'code' },
  tf: { name: 'Terraform', color: '#844FBA', kind: 'config' },
  yaml: { name: 'YAML', color: '#C9862B', kind: 'config' },
  yml: { name: 'YAML', color: '#C9862B', kind: 'config' },
  json: { name: 'JSON', color: '#9AA3B0', kind: 'config' },
  toml: { name: 'TOML', color: '#9AA3B0', kind: 'config' },
  xml: { name: 'XML', color: '#9AA3B0', kind: 'config' },
  gradle: { name: 'Gradle', color: '#9AA3B0', kind: 'config' },
  properties: { name: 'Properties', color: '#9AA3B0', kind: 'config' },
  md: { name: 'Markdown', color: '#A855F7', kind: 'doc' },
  mdx: { name: 'Markdown', color: '#A855F7', kind: 'doc' },
  rst: { name: 'Markdown', color: '#A855F7', kind: 'doc' },
  txt: { name: 'Metin', color: '#A855F7', kind: 'doc' },
  adoc: { name: 'AsciiDoc', color: '#A855F7', kind: 'doc' },
  html: { name: 'HTML', color: '#E34C26', kind: 'code' },
  css: { name: 'CSS', color: '#563D7C', kind: 'code' },
  scss: { name: 'CSS', color: '#563D7C', kind: 'code' }
}

const SPECIAL_FILES = new Set(['Dockerfile', 'Makefile', 'Jenkinsfile', 'Procfile', 'README', 'LICENSE'])

/** Değeri olmayan ve pahalı dosyalar: kilit dosyaları, sıkıştırılmış/üretilmiş kod. */
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|go\.sum|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|.*\.min\.(js|css)|.*\.map|.*\.snap|.*\.pb\.go|.*_generated\..*|.*\.g\.dart)$/

/** Olası gizli bilgiler: hiçbir koşulda indekslenmez. */
const SECRET_NAME = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.jks|.*\.keystore|id_rsa.*|id_ed25519.*|credentials(\..*)?|secrets?\.(json|ya?ml|toml)|\.npmrc|\.pypirc|.*\.kdbx)$/i
const SECRET_CONTENT = /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|ghp_[0-9A-Za-z]{36}|sk-(ant-)?[A-Za-z0-9_-]{32,}/

export const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES = 40_000

export interface ScannedFile {
  rel: string
  size: number
  lines: number
  lang: string | null
}

export interface ScanOptions {
  respectGitignore: boolean
}

export function languageOf(rel: string): (typeof LANGUAGES)[string] | null {
  const name = basename(rel)
  if (SPECIAL_FILES.has(name)) return { name: 'Diğer', color: '#6B7280', kind: 'config' }
  return LANGUAGES[extname(rel).slice(1).toLowerCase()] ?? null
}

export function isSecretPath(rel: string): boolean {
  return SECRET_NAME.test(rel)
}

export function hasSecretContent(text: string): boolean {
  return SECRET_CONTENT.test(text)
}

export function isNoise(rel: string): boolean {
  return NOISE.test(rel)
}

export function categorize(dir: string, files: ScannedFile[]): FolderCategory {
  const name = basename(dir)
  if (BUILD_DIRS.has(name)) return 'cikti'
  for (const [re, category] of CATEGORY_BY_NAME) if (re.test(name)) return category
  // Klasör adından anlaşılmıyorsa içindeki dosya türlerine bak.
  const counts = { code: 0, doc: 0, config: 0 }
  for (const f of files) {
    const lang = languageOf(f.rel)
    if (lang) counts[lang.kind]++
    if (/(\.|_)(test|spec)\.[a-z]+$/.test(f.rel)) counts.code -= 0.5
  }
  if (counts.code >= counts.doc && counts.code >= counts.config && counts.code > 0) return 'kaynak'
  if (counts.doc > counts.config) return 'dokuman'
  if (counts.config > 0) return 'yapilandirma'
  return 'diger'
}

/** Klasör ağacını gezer; .gitignore, derleme çıktıları ve gizli dosyalar dışarıda kalır. */
export async function walk(root: string, options: ScanOptions): Promise<{ files: ScannedFile[]; ignoredDirs: Map<string, number>; secrets: string[]; truncated: boolean }> {
  const files: ScannedFile[] = []
  const ignoredDirs = new Map<string, number>()
  const secrets: string[] = []
  let truncated = false

  const visit = async (dir: string, rules: { base: string; ig: Ignore }[]): Promise<void> => {
    if (files.length >= MAX_FILES) {
      truncated = true
      return
    }
    let local = rules
    if (options.respectGitignore) {
      const gi = join(dir, '.gitignore')
      if (existsSync(gi)) {
        local = [...rules, { base: relative(root, dir), ig: ignore().add(readFileSync(gi, 'utf8')) }]
      }
    }
    const isIgnored = (rel: string, isDir: boolean): boolean =>
      local.some(({ base, ig }) => {
        const sub = base ? relative(base, rel) : rel
        if (!sub || sub.startsWith('..')) return false
        return ig.ignores(isDir ? `${sub.split(sep).join('/')}/` : sub.split(sep).join('/'))
      })

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      const rel = relative(root, abs).split(sep).join('/')
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (HIDDEN_SKIP.has(entry.name)) continue
        if (BUILD_DIRS.has(entry.name) || isIgnored(rel, true)) {
          ignoredDirs.set(rel, await countFiles(abs))
          continue
        }
        await visit(abs, local)
        continue
      }
      if (!entry.isFile()) continue
      if (isSecretPath(rel)) {
        secrets.push(rel)
        continue
      }
      if (isIgnored(rel, false) || isNoise(rel)) continue
      const lang = languageOf(rel)
      if (!lang) continue
      const info = await stat(abs).catch(() => null)
      if (!info || info.size > MAX_FILE_BYTES || info.size === 0) continue
      const text = await readFile(abs, 'utf8').catch(() => '')
      if (text.includes('\u0000')) continue
      if (hasSecretContent(text)) {
        secrets.push(rel)
        continue
      }
      files.push({ rel, size: info.size, lines: text.split('\n').length, lang: lang.name })
      if (files.length >= MAX_FILES) {
        truncated = true
        return
      }
    }
  }

  await visit(root, [])
  return { files, ignoredDirs, secrets, truncated }
}

/** Hariç tutulan büyük klasörleri saymak için hızlı ve sınırlı sayım. */
async function countFiles(dir: string, limit = 50_000): Promise<number> {
  let count = 0
  const stack = [dir]
  while (stack.length && count < limit) {
    const current = stack.pop()!
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (e.isDirectory()) stack.push(join(current, e.name))
      else count++
    }
  }
  return count
}

/** Dosyanın hangi listelenen klasöre ait olduğu (en uzun önek). */
export function folderOf(rel: string, folders: string[]): string {
  let best = ''
  for (const f of folders) {
    if (f && (rel === f || rel.startsWith(`${f}/`)) && f.length > best.length) best = f
  }
  return best
}

export function estimateChunks(lines: number): number {
  return Math.max(1, Math.ceil(lines / 60))
}

async function gitInfo(root: string): Promise<{ branch: string | null; branches: string[] }> {
  if (!existsSync(join(root, '.git'))) return { branch: null, branches: [] }
  try {
    const [{ stdout: head }, { stdout: refs }] = await Promise.all([
      run('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']),
      run('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    ])
    return { branch: head.trim(), branches: refs.split('\n').map((b) => b.trim()).filter(Boolean) }
  } catch {
    return { branch: null, branches: [] }
  }
}

/** Ekleme penceresi için kod klasörü önizlemesi. */
export async function scanCode(root: string, options: ScanOptions): Promise<CodeScan & { scanned: ScannedFile[] }> {
  const [{ files, ignoredDirs, secrets }, git] = await Promise.all([walk(root, options), gitInfo(root)])

  // Klasör listesi: üst düzey klasörler + büyük kaynak klasörlerinin alt klasörleri (tasarımdaki gibi).
  const top = new Map<string, ScannedFile[]>()
  const rootFiles: ScannedFile[] = []
  for (const f of files) {
    const [head, ...rest] = f.rel.split('/')
    if (rest.length === 0) rootFiles.push(f)
    else top.set(head!, [...(top.get(head!) ?? []), f])
  }

  const folders: FolderScan[] = []
  const add = (path: string, depth: number, list: ScannedFile[]): void => {
    const category = categorize(path, list)
    folders.push({
      path,
      depth,
      files: list.length,
      lines: list.reduce((n, f) => n + f.lines, 0),
      category,
      included: category === 'kaynak' || category === 'dokuman' || category === 'yapilandirma',
      locked: false
    })
  }
  for (const [name, list] of [...top.entries()].sort((a, b) => b[1].length - a[1].length)) {
    add(name, 0, list)
    const parent = folders[folders.length - 1]!
    if (parent.category === 'kaynak' && list.length > 40) {
      const children = new Map<string, ScannedFile[]>()
      for (const f of list) {
        const parts = f.rel.split('/')
        if (parts.length > 2) children.set(`${parts[0]}/${parts[1]}`, [...(children.get(`${parts[0]}/${parts[1]}`) ?? []), f])
      }
      for (const [sub, subList] of [...children.entries()].sort((a, b) => b[1].length - a[1].length)) {
        if (subList.length >= 3) add(sub, 1, subList)
      }
    }
  }
  if (rootFiles.length) {
    folders.push({
      path: '',
      depth: 0,
      files: rootFiles.length,
      lines: rootFiles.reduce((n, f) => n + f.lines, 0),
      category: 'dokuman',
      included: true,
      locked: false,
      reason: 'README, manifest ve kök dosyaları'
    })
  }
  for (const [path, count] of [...ignoredDirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    folders.push({
      path,
      depth: path.split('/').length - 1,
      files: count,
      lines: 0,
      category: BUILD_DIRS.has(basename(path)) ? 'cikti' : 'diger',
      included: false,
      locked: true,
      reason: '.gitignore'
    })
  }

  const byLang = new Map<string, { lines: number; color: string }>()
  for (const f of files) {
    const lang = languageOf(f.rel)!
    const entry = byLang.get(lang.name) ?? { lines: 0, color: lang.color }
    entry.lines += f.lines
    byLang.set(lang.name, entry)
  }
  const totalLines = files.reduce((n, f) => n + f.lines, 0) || 1
  const sorted = [...byLang.entries()].sort((a, b) => b[1].lines - a[1].lines)
  const languages: LanguageShare[] = sorted.slice(0, 3).map(([name, v]) => ({ name, color: v.color, share: v.lines / totalLines }))
  const rest = sorted.slice(3).reduce((n, [, v]) => n + v.lines, 0)
  if (rest > 0) languages.push({ name: 'Diğer', color: '#6B7280', share: rest / totalLines })

  const readmeFile = rootFiles.find((f) => /^readme/i.test(f.rel))
  const readme = readmeFile ? (await readFile(join(root, readmeFile.rel), 'utf8').catch(() => '')).slice(0, 3000) : ''
  const manifests = rootFiles
    .map((f) => f.rel)
    .filter((r) => /^(package\.json|go\.mod|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml|pyproject\.toml|requirements\.txt|composer\.json|Gemfile|.*\.csproj|Package\.swift)$/.test(r))

  const scan: CodeScan & { scanned: ScannedFile[] } = {
    root,
    name: basename(root),
    branch: git.branch,
    branches: git.branches,
    folders,
    languages,
    totals: { files: 0, lines: 0, chunks: 0, seconds: 0 },
    secretsSkipped: secrets,
    readme,
    manifests,
    scanned: files
  }
  scan.totals = totalsFor(scan, scan.folders)
  return scan
}

/** Seçili klasörlere göre dahil edilecek dosya/satır/parça ve süre tahmini. */
export function totalsFor(scan: { scanned: ScannedFile[] }, folders: FolderScan[]): CodeScan['totals'] {
  const listed = folders.filter((f) => !f.locked).map((f) => f.path)
  const included = new Set(folders.filter((f) => f.included && !f.locked).map((f) => f.path))
  let files = 0
  let lines = 0
  let chunks = 0
  for (const f of scan.scanned) {
    if (!included.has(folderOf(f.rel, listed))) continue
    files++
    lines += f.lines
    chunks += estimateChunks(f.lines)
  }
  return { files, lines, chunks, seconds: Math.ceil(files / 250 + chunks / 2000) }
}
