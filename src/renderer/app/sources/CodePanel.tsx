import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CodeScan, FolderScan } from '@shared/knowledge'
import { presetById } from '@shared/providers'
import { usePolicy, useProviderStatuses } from '../../shared/hooks'
import { PiqiMark } from '../../shared/PiqiMark'
import { Button, Switch } from '../ui'
import type { PanelProps } from './AddSourceDialog'
import { Checkbox, CategorySelect, DialogFooter, folderSelect, formatCount, formatDuration, SectionTitle } from './common'

type Mode = 'local' | 'git'

/** Kod kartları için ekonomik model seçenekleri (anahtarı olan ve politikaya uyanlar gösterilir). */
const CARD_MODELS = [
  { providerId: 'gemini', id: 'gemini-3.5-flash-lite' },
  { providerId: 'anthropic', id: 'claude-haiku-4-5' },
  { providerId: 'qwen', id: 'qwen3.6-flash' },
  { providerId: 'ollama', id: 'qwen3:8b' }
]

export function CodePanel({ close }: PanelProps): ReactNode {
  const [statuses] = useProviderStatuses()
  const [policy] = usePolicy()
  const [mode, setMode] = useState<Mode>('local')
  const [root, setRoot] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [scan, setScan] = useState<CodeScan | null>(null)
  const [folders, setFolders] = useState<FolderScan[]>([])
  const [totals, setTotals] = useState<CodeScan['totals'] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [symbolChunking, setSymbolChunking] = useState(true)
  const [gitignore, setGitignore] = useState(true)
  const [watch, setWatch] = useState(true)
  const [busy, setBusy] = useState(false)

  const runScan = async (input: { root?: string; gitUrl?: string; branch?: string }, respectGitignore = gitignore): Promise<void> => {
    setScanning(true)
    setError(null)
    try {
      const result = await window.piqi.knowledge.scanCode({ ...input, respectGitignore })
      setScan(result)
      setFolders(result.folders)
      setTotals(result.totals)
      setBranch(result.branch ?? '')
      setRoot(result.root)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setScanning(false)
    }
  }

  // Seçim değişince toplamları main'de yeniden hesapla (dosya listesi orada).
  useEffect(() => {
    if (!scan) return
    void window.piqi.knowledge.totals(scan.root, folders).then(setTotals)
  }, [scan, folders])

  const cardOptions = useMemo(() => {
    const ok = (providerId: string): boolean => {
      const preset = presetById(providerId)
      if (!preset) return false
      if (preset.location === 'cloud' && policy && !policy.effective.allowCloud) return false
      return !preset.keyRequired || Boolean(statuses.find((s) => s.providerId === providerId)?.hasApiKey)
    }
    return CARD_MODELS.filter((m) => ok(m.providerId))
  }, [statuses, policy])

  const pick = async (): Promise<void> => {
    const [path] = await window.piqi.knowledge.pick('folder')
    if (path) {
      setMode('local')
      await runScan({ root: path })
    }
  }

  const setFolder = (path: string, patch: Partial<FolderScan>): void =>
    setFolders((fs) =>
      fs.map((f) => {
        if (f.path === path) return { ...f, ...patch }
        // Üst klasör seçimi alt klasörlere de uygulanır.
        if (patch.included !== undefined && path && f.path.startsWith(`${path}/`) && !f.locked) return { ...f, included: patch.included }
        return f
      })
    )

  const recommended = (): void => setFolders(scan?.folders ?? [])
  const includeAll = (): void => setFolders((fs) => fs.map((f) => (f.locked ? f : { ...f, included: true })))

  const submit = async (): Promise<void> => {
    if (!scan) return
    setBusy(true)
    const model = statuses.length > 0 ? cardOptions[0] : undefined
    await window.piqi.knowledge.add({
      kind: 'code',
      name: scan.name,
      location: mode === 'git' ? gitUrl : scan.root,
      config: {
        kind: 'code',
        code: {
          root: scan.root,
          gitUrl: mode === 'git' ? gitUrl : undefined,
          branch: mode === 'git' ? branch || undefined : scan.branch ?? undefined,
          listed: folders.filter((f) => !f.locked).map((f) => f.path),
          include: folders.filter((f) => f.included && !f.locked).map((f) => f.path),
          folderCategories: Object.fromEntries(folders.map((f) => [f.path, f.category])),
          respectGitignore: gitignore,
          symbolChunking,
          aiCards: true,
          cardModel: model ? { providerId: model.providerId, id: model.id } : undefined
        }
      },
      note: '',
      focus: '',
      watch: mode === 'local' && watch,
      priority: false
    })
    close()
  }

  return (
    <>
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-2 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 shrink-0 rounded-[10px] bg-fill p-1">
            {(['local', 'git'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3.5 text-[13px] font-semibold ${mode === m ? 'bg-card text-ink shadow-sm' : 'bg-transparent text-muted'}`}
              >
                {m === 'local' ? 'Yerel klasör' : 'Git URL'}
              </button>
            ))}
          </div>
          {mode === 'local' ? (
            <button
              type="button"
              onClick={() => void pick()}
              className="flex h-10 min-w-0 flex-1 items-center rounded-[10px] border border-line-2 bg-card px-4 text-left font-mono text-[13px] text-ink"
            >
              <span className="truncate">{root ? root.replace(/^\/Users\/[^/]+/, '~') : <span className="text-muted">Klasör seçin…</span>}</span>
            </button>
          ) : (
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (gitUrl.trim()) void runScan({ gitUrl: gitUrl.trim(), branch: branch || undefined })
              }}
            >
              <label htmlFor="git-url" className="sr-only">
                Git URL
              </label>
              <input
                id="git-url"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/acme/gateway.git"
                className="selectable h-10 min-w-0 flex-1 rounded-[10px] border border-line-2 bg-card px-4 font-mono text-[13px] text-ink outline-none"
              />
              <Button size="lg" type="submit" className="h-10 px-4" disabled={!gitUrl.trim() || scanning}>
                Getir
              </Button>
            </form>
          )}
          <label className="relative flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-line-2 bg-card px-3 font-mono text-[13px]">
            {branch || 'dal'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
            <select
              aria-label="Dal"
              value={branch}
              disabled={mode === 'local' || !scan}
              onChange={(e) => {
                setBranch(e.target.value)
                if (mode === 'git' && gitUrl) void runScan({ gitUrl, branch: e.target.value })
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {(scan?.branches.length ? scan.branches : [branch || '—']).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <Button size="lg" className="h-10 px-4" onClick={() => void pick()}>
            Klasör seç
          </Button>
        </div>

        {error && <div className="rounded-[14px] bg-err-bg px-5 py-3.5 text-[14px] text-err">{error}</div>}

        {scanning && (
          <div className="flex items-center gap-3 py-10 text-[15px] text-muted">
            <PiqiMark size={26} state="thinking" tone="lime" />
            {mode === 'git' ? 'Repo klonlanıyor ve taranıyor…' : 'Klasör taranıyor…'}
          </div>
        )}

        {!scan && !scanning && (
          <div className="flex flex-col items-start gap-3 rounded-[18px] border-[1.5px] border-dashed border-line-2 px-8 py-10">
            <div className="text-[17px] font-bold">Bir kod klasörü seçin ya da Git adresi verin</div>
            <div className="max-w-[640px] text-[14px] leading-normal text-muted">
              Piqi klasörü tarar, klasörleri kaynak kod / doküman / yapılandırma / test olarak sınıflar ve gizli dosyaları atlar. Klasör hakkında
              bir not yazarsan yapay zeka hangi kısmın taranması gerektiğine yalnızca klasör ağacına bakarak karar verir; kod içeriği gönderilmez.
            </div>
          </div>
        )}

        {scan && !scanning && (
          <div className="flex gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <SectionTitle
                right={
                  <div className="flex gap-1">
                    <button type="button" onClick={recommended} className="h-8 rounded-lg border border-line-2 bg-card px-3 text-[12px] font-semibold">
                      Önerilen
                    </button>
                    <button type="button" onClick={includeAll} className="h-8 rounded-lg border-0 bg-transparent px-3 text-[12px] text-muted hover:text-ink">
                      Hepsini dahil et
                    </button>
                  </div>
                }
              >
                Klasörler ve sınıflandırma
              </SectionTitle>

              <div className="overflow-hidden rounded-[18px] border border-line">
                {folders.map((f) => (
                  <div
                    key={f.path || '(kök)'}
                    className={`flex items-center gap-3 border-b border-line py-2 pr-4 last:border-b-0 ${f.locked ? 'opacity-55' : ''}`}
                    style={{ paddingLeft: 18 + f.depth * 24 }}
                    title={f.reason}
                  >
                    <Checkbox
                      label={f.path || 'kök dosyaları'}
                      checked={f.included}
                      disabled={f.locked}
                      onChange={(included) => setFolder(f.path, { included })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[13px]">{f.path ? `${f.path.split('/').pop()}/` : '(kök dosyaları)'}</div>
                      {f.reason && !f.locked && <div className="truncate text-[12px] text-muted">{f.reason}</div>}
                    </div>
                    <CategorySelect
                      {...folderSelect}
                      value={f.category}
                      disabled={f.locked}
                      onChange={(category) => setFolder(f.path, { category })}
                    />
                    <span className="w-12 text-right font-mono text-[12px] text-muted">{f.files.toLocaleString('tr-TR')}</span>
                    <span
                      className={`w-14 text-right text-[12px] font-semibold ${
                        f.locked ? 'font-normal text-muted' : f.included ? 'text-ok' : 'text-muted'
                      }`}
                    >
                      {f.locked ? '.gitignore' : f.included ? 'Dahil' : 'Hariç'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-[310px] shrink-0 flex-col gap-3">
              <div className="rounded-[14px] bg-panel p-4 text-[#F2F2F0]">
                <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8E9199]">Algılanan</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat value={formatCount(totals?.files ?? 0)} label="dosya dahil" />
                  <Stat value={formatCount(totals?.lines ?? 0)} label="satır" />
                  <Stat value={formatCount(totals?.chunks ?? 0)} label="parça" />
                </div>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-[#26262B]">
                  {scan.languages.map((l) => (
                    <div key={l.name} style={{ width: `${l.share * 100}%`, background: l.color }} />
                  ))}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                  {scan.languages.map((l) => (
                    <span key={l.name} className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-[3px]" style={{ background: l.color }} />
                      {l.name} <span className="font-mono text-[12.5px] text-[#9A9AA2]">{Math.round(l.share * 100)}%</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col rounded-[14px] border border-line bg-card px-4">
                <ToggleRow title="Fonksiyon ve sınıf bazlı parçalama" sub="Parçalar fonksiyon ve sınıf sınırlarından bölünür" checked={symbolChunking} onChange={setSymbolChunking} />
                <ToggleRow
                  title=".gitignore’a uy"
                  checked={gitignore}
                  onChange={(v) => {
                    setGitignore(v)
                    void runScan(mode === 'git' ? { gitUrl, branch } : { root: scan.root }, v)
                  }}
                />
                <ToggleRow title="Değişiklikleri izle" checked={watch && mode === 'local'} onChange={setWatch} last />
              </div>

              {scan.secretsSkipped.length > 0 && (
                <div className="rounded-[18px] bg-warn-bg px-5 py-4 text-[14px] leading-normal text-warn">
                  <b>{scan.secretsSkipped.length} olası gizli dosya atlandı:</b>{' '}
                  {scan.secretsSkipped.slice(0, 3).map((s, i) => (
                    <span key={s}>
                      {i > 0 && ' ve '}
                      <code className="font-mono">{s}</code>
                    </span>
                  ))}
                  {scan.secretsSkipped.length > 3 && ` ve ${scan.secretsSkipped.length - 3} dosya daha`} indekslenmez.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <DialogFooter
        summary={
          totals && scan ? (
            <>
              <b className="text-ink">{totals.files.toLocaleString('tr-TR')} dosya</b> dahil · tahmini {totals.chunks.toLocaleString('tr-TR')} parça ·
              yaklaşık {formatDuration(totals.seconds)}
            </>
          ) : (
            'Klasör seçin'
          )
        }
        canSubmit={Boolean(scan && totals && totals.files > 0)}
        busy={busy}
        onCancel={close}
        onSubmit={() => void submit()}
      />
    </>
  )
}

function Stat({ value, label }: { value: string; label: string }): ReactNode {
  return (
    <div>
      <div className="text-[34px] font-bold leading-none tracking-[-0.02em]">{value}</div>
      <div className="mt-1.5 text-[14px] text-[#A9ACB3]">{label}</div>
    </div>
  )
}

function ToggleRow(props: { title: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean }): ReactNode {
  return (
    <div className={`flex items-center gap-4 py-4 ${props.last ? '' : 'border-b border-line'}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">{props.title}</div>
        {props.sub && <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{props.sub}</div>}
      </div>
      <Switch compact label={props.title} checked={props.checked} onChange={props.onChange} />
    </div>
  )
}
