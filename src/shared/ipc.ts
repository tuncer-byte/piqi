import type {
  CodeScan,
  FaqEntry,
  KnowledgeGap,
  FileScan,
  FolderScan,
  KnowledgeHit,
  KnowledgeOverview,
  SourceConfig,
  SourceKind,
  SourceRecord,
  Tactic,
  TriagePlan
} from './knowledge'
import type { MeetingListItem, MeetingRecord } from './meetings'
import type {
  AskRequest,
  AuditEntry,
  MeetingPeople,
  ModelInfo,
  PolicyStatus,
  TtsStatus,
  AudioLevels,
  AudioProcessInfo,
  CaptureStatus,
  IslandAction,
  IslandSnapshot,
  PermissionStatus,
  ProviderStatus,
  Settings,
  TranscriptEvent,
  VoiceInfo
} from './types'

/** Tüm IPC kanal adları tek yerde; main ve preload buradan okur. */
export const IPC = {
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureGetStatus: 'capture:get-status',
  captureStatus: 'capture:status',
  captureListProcesses: 'capture:list-processes',
  audioLevels: 'audio:levels',
  transcript: 'audio:transcript',

  islandGetSnapshot: 'island:get-snapshot',
  islandSnapshot: 'island:snapshot',
  islandSetHover: 'island:set-hover',
  islandAction: 'island:action',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',

  permissionsGet: 'permissions:get',
  permissionsRequestMic: 'permissions:request-mic',
  permissionsRequestSpeech: 'permissions:request-speech',
  permissionsOpenSystemSettings: 'permissions:open-system-settings',

  providerGetStatus: 'provider:get-status',
  providerSetApiKey: 'provider:set-api-key',
  providerTest: 'provider:test',
  providerListModels: 'provider:list-models',

  policyGet: 'policy:get',
  auditRecent: 'audit:recent',
  auditReveal: 'audit:reveal',

  ttsStatus: 'tts:status',
  ttsStatusChanged: 'tts:status-changed',
  ttsInstallEma: 'tts:install-ema',

  peopleGet: 'people:get',
  peopleChanged: 'people:changed',
  peopleRename: 'people:rename',

  voiceList: 'voice:list',
  voicePreview: 'voice:preview',

  assistantAsk: 'assistant:ask',


  knowledgeOverview: 'knowledge:overview',
  knowledgeChanged: 'knowledge:changed',
  knowledgeScanCode: 'knowledge:scan-code',
  knowledgeGitBranches: 'knowledge:git-branches',
  knowledgeTotals: 'knowledge:totals',
  knowledgeTriage: 'knowledge:triage',
  knowledgeCardEstimate: 'knowledge:card-estimate',
  knowledgeScanFiles: 'knowledge:scan-files',
  knowledgeAdd: 'knowledge:add',
  knowledgeUpdate: 'knowledge:update',
  knowledgeReindex: 'knowledge:reindex',
  knowledgeRemove: 'knowledge:remove',
  knowledgeSearch: 'knowledge:search',
  knowledgeTactics: 'knowledge:tactics',
  knowledgeApplyTactic: 'knowledge:apply-tactic',
  faqList: 'faq:list',
  faqSave: 'faq:save',
  faqDelete: 'faq:delete',
  meetingsList: 'meetings:list',
  meetingsChanged: 'meetings:changed',
  meetingGet: 'meetings:get',
  meetingDelete: 'meetings:delete',
  meetingResummarize: 'meetings:resummarize',
  gapsList: 'gaps:list',
  gapsChanged: 'gaps:changed',
  gapsRemove: 'gaps:remove',
  dialogPick: 'dialog:pick',

  navigate: 'app:navigate'
} as const

export type Unsubscribe = () => void

/** Ekleme penceresinden gelen kaynak (ürün main tarafında eklenir). */
export interface NewSource {
  kind: SourceKind
  name: string
  location: string
  config: SourceConfig
  note: string
  focus: string
  watch: boolean
  priority: boolean
  token?: string
}

export type SystemSettingsPane = 'microphone' | 'audio-capture' | 'speech'

/** Renderer'a `window.piqi` olarak açılan API. */
export interface PiqiApi {
  capture: {
    start(): Promise<CaptureStatus>
    stop(): Promise<CaptureStatus>
    getStatus(): Promise<CaptureStatus>
    listProcesses(): Promise<AudioProcessInfo[]>
    onStatus(cb: (status: CaptureStatus) => void): Unsubscribe
    onLevels(cb: (levels: AudioLevels) => void): Unsubscribe
    onTranscript(cb: (event: TranscriptEvent) => void): Unsubscribe
  }
  island: {
    getSnapshot(): Promise<IslandSnapshot>
    onSnapshot(cb: (snapshot: IslandSnapshot) => void): Unsubscribe
    /** İmleç Island üzerindeyken true: pencere tıklamaları yakalar ve otomatik kapanma durur. */
    setHover(hovering: boolean): void
    action(action: IslandAction): void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
    onChange(cb: (settings: Settings) => void): Unsubscribe
  }
  permissions: {
    get(): Promise<PermissionStatus>
    requestMicrophone(): Promise<PermissionStatus['microphone']>
    requestSpeech(): Promise<PermissionStatus['speech']>
    openSystemSettings(pane: SystemSettingsPane): void
  }
  provider: {
    /** Tüm sağlayıcıların anahtar durumu. */
    getStatus(): Promise<ProviderStatus[]>
    setApiKey(providerId: string, key: string | null): Promise<ProviderStatus[]>
    /** Seçili sağlayıcı ve modeli kısa bir istekle doğrular; hata varsa mesajını döner. */
    test(): Promise<{ ok: boolean; message: string }>
    listModels(providerId: string): Promise<ModelInfo[]>
  }
  policy: {
    get(): Promise<PolicyStatus>
    recentAudit(): Promise<AuditEntry[]>
    revealAudit(): void
  }
  tts: {
    status(): Promise<TtsStatus>
    installEma(): Promise<TtsStatus>
    onStatus(cb: (status: TtsStatus) => void): Unsubscribe
  }
  people: {
    get(): Promise<MeetingPeople>
    rename(id: number, name: string): void
    onChange(cb: (people: MeetingPeople) => void): Unsubscribe
  }
  voice: {
    list(): Promise<VoiceInfo[]>
    preview(text: string): void
  }
  assistant: {
    ask(request: AskRequest): void
  }
  app: {
    onNavigate(cb: (page: string) => void): Unsubscribe
  }
  meetings: {
    /** Geçmiş toplantılar, en yeni önce. */
    list(): Promise<MeetingListItem[]>
    get(id: string): Promise<MeetingRecord | null>
    remove(id: string): Promise<MeetingListItem[]>
    resummarize(id: string): void
    onChange(cb: (meetings: MeetingListItem[]) => void): Unsubscribe
  }
  knowledge: {
    /** Tek ürün bilgi havuzundaki kaynaklar ve toplamlar. */
    overview(): Promise<KnowledgeOverview>
    onChange(cb: (overview: KnowledgeOverview) => void): Unsubscribe
    scanCode(input: { root?: string; gitUrl?: string; branch?: string; respectGitignore: boolean }): Promise<CodeScan>
    gitBranches(url: string): Promise<string[]>
    totals(root: string, folders: FolderScan[]): Promise<CodeScan['totals']>
    triage(root: string, note: string): Promise<TriagePlan>
    cardEstimate(files: number): Promise<{ tokens: number; seconds: number }>
    scanFiles(paths: string[]): Promise<FileScan[]>
    add(request: NewSource): Promise<SourceRecord>
    update(id: string, patch: Partial<Pick<SourceRecord, 'watch' | 'priority' | 'name' | 'note'>>): void
    reindex(id: string): void
    remove(id: string): void
    search(question: string): Promise<KnowledgeHit[]>
    tactics(): Promise<Tactic[]>
    applyTactic(action: NonNullable<Tactic['action']>): void
    faq(): Promise<FaqEntry[]>
    saveFaq(entry: { id?: string; question: string; answer: string }): Promise<FaqEntry[]>
    deleteFaq(id: string): Promise<FaqEntry[]>
    /** Doküman eksikleri: cevaplanamayan sorular (en sık sorulan önce). */
    gaps(): Promise<KnowledgeGap[]>
    removeGap(id: string): Promise<KnowledgeGap[]>
    onGapsChange(cb: (gaps: KnowledgeGap[]) => void): Unsubscribe
    pick(kind: 'files' | 'folder'): Promise<string[]>
    /** Sürükle-bırak ile gelen dosyanın diskteki yolu. */
    pathForFile(file: File): string
  }
}
