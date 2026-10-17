// Main, preload ve renderer süreçlerinin paylaştığı veri tipleri.

export type AudioChannel = 'me' | 'them'

export type CaptureState = 'stopped' | 'starting' | 'running' | 'error'

export interface CaptureOptions {
  mic: boolean
  system: boolean
  /** Boşsa tüm sistem sesi; doluysa yalnızca bu bundle ID önekleriyle eşleşen uygulamalar. */
  bundleIds: string[]
}

export interface CaptureStatus {
  state: CaptureState
  mic: boolean
  system: boolean
  errors: string[]
  helperVersion?: string
  /** Konuşma tanımanın açık olduğu kanallar. */
  transcribing: AudioChannel[]
  /** Toplantı dinlemesi açık mı (false: yalnızca "Selam Piqi" uyandırma dinlemesi). */
  meeting?: boolean
  /** Algılanan görüşme ("Microsoft Teams"); görüşme yoksa null. */
  detectedMeeting?: string | null
}

/** 0..1 aralığında normalize edilmiş anlık ses seviyeleri. */
export interface AudioLevels {
  me: number
  them: number
}

export interface AudioProcessInfo {
  pid: number
  bundleId: string
  isRunningOutput: boolean
  /** Süreç mikrofonu kullanıyor (toplantı algılamanın sinyali). */
  isRunningInput: boolean
}

/** Toplantı algılandığında: hiçbir şey yapma, Island'da sor ya da dinlemeyi kendiliğinden başlat. */
export type MeetingDetection = 'off' | 'ask' | 'auto'

export interface TranscriptEvent {
  channel: AudioChannel
  segment: number
  text: string
  final: boolean
  /** epoch ms */
  t: number
  /** Karşı taraf kanalında konuşmacı numarası (1'den başlar); belirlenemediyse yok. */
  speaker?: number
}

/** Toplantıdaki bir konuşmacı. Ses izi saklanmaz; numara yalnızca bu oturumda geçerlidir. */
export interface Speaker {
  id: number
  /** Kullanıcının verdiği ad ("Elif"); yoksa "Konuşmacı N". */
  name: string | null
  /** Toplam konuşma süresi (sn). */
  talkSeconds: number
  lastHeardAt: number
}

export interface MeetingPeople {
  speakers: Speaker[]
  /** Konuşmacı ayrımı çalışıyor mu (model indirildi ve dinleme açık). */
  active: boolean
  status: 'off' | 'loading' | 'ready' | 'error'
  error?: string
}

export interface VoiceInfo {
  id: string
  name: string
  language: string
  quality: number
}

// ── Ürünler ve karakterler ────────────────────────────────────────────────

export type Tone = 'teknik' | 'satis' | 'kisa'
/** Sektör: katılım bankacılığında faiz yerine kâr payı vb. terminoloji uygulanır. */
export type Sector = 'genel' | 'bankacilik' | 'katilim'

export interface Product {
  name: string
  /** Piqi'nin bu üründeki karakteri. */
  character: {
    name: string
    role: string
    tone: Tone
    instructions: string
    /** Konuşma tanımaya ipucu olarak verilen terimler. */
    glossary: string[]
  }
  sector: Sector
}

export type VoiceReplies = 'auto' | 'always' | 'never'
export type Effort = 'low' | 'medium' | 'high'

/** Bir sağlayıcının bu Mac'teki bağlantı ayarı (anahtar ayrıca Keychain'de). */
export interface ProviderSettings {
  /** Kurum içi sunucular için uç nokta (hazır ayarı ezer). */
  baseUrl?: string
}

/** Kurumsal veri politikası. MDM ile dağıtılan politika dosyası bu ayarları ezer ve kilitler. */
export interface DataPolicy {
  /** Bulut LLM sağlayıcılarına (Claude, Gemini, Qwen Cloud…) veri gidebilir mi. */
  allowCloud: boolean
  /** Buluta giden metinde TCKN, IBAN, kart no, telefon, e-posta maskelenir. */
  maskPII: boolean
  /** Her LLM çağrısı içeriksiz olarak denetim kaydına yazılır. */
  audit: boolean
}

export interface Settings {
  capture: CaptureOptions
  /** Ekran paylaşımında Island panelini gizle (içerik koruması). */
  hideInScreenShare: boolean
  /** Teams, Zoom vb. görüşmeye girildiğinde ne yapılacağı. */
  meetingDetection: MeetingDetection
  product: Product
  speech: {
    locale: 'tr-TR' | 'en-US'
    /** Karşı tarafın sesini de yazıya dök (toplantı transkripti). */
    transcribeThem: boolean
    /** "Selam Piqi" ile uyandırma. */
    wakeWord: boolean
    /** Uygulama açıkken her zaman "Selam Piqi"yi dinle (yalnızca mikrofon, cihaz üzerinde). */
    alwaysListen: boolean
    /** Karşı tarafta kaç kişi konuştuğunu ayırt et (cihaz üzerinde, kalıcı ses izi yok). */
    diarization: boolean
    /** Karşı tarafın ürün sorusunu algılayıp kaynak varsa Island'da cevapla. */
    autoAnswer: boolean
  }
  voice: {
    /** Seslendirme motoru: Apple (sistem) veya EMA Lightning (açık kaynak Türkçe, cihazda). */
    engine: 'apple' | 'ema'
    replies: VoiceReplies
    voiceId: string | null
    /** AVSpeechUtterance hızı (0..1, varsayılan 0.5). */
    rate: number
  }
  providers: Record<string, ProviderSettings>
  model: {
    /** Sağlayıcı hazır ayar kimliği (bkz. shared/providers.ts). */
    providerId: string
    id: string
    effort: Effort
  }
  policy: DataPolicy
  onboarded: boolean
}

export type Permission = 'granted' | 'denied' | 'undetermined'

export interface PermissionStatus {
  microphone: Permission
  speech: Permission
}

export interface ProviderStatus {
  providerId: string
  hasApiKey: boolean
  /** Anahtarın kaynağı: uygulamada kayıtlı mı, ortam değişkeni mi. */
  source: 'keychain' | 'env' | null
}

export interface TtsStatus {
  emaInstalled: boolean
  /** İndirme sürüyorsa 0..1 ilerleme. */
  downloading: number | null
  error: string | null
}

export interface ModelInfo {
  id: string
  label: string
  note?: string
}

/** Etkin politika ve kaynağı (kurum tarafından kilitli mi). */
export interface PolicyStatus {
  effective: DataPolicy
  /** MDM politika dosyası varsa yolu; ayarlar kilitlidir. */
  managedBy: string | null
  /** Politika dosyası izin verilen sağlayıcıları sınırlıyorsa. */
  allowedProviders: string[] | null
}

export interface AuditEntry {
  ts: number
  purpose: 'assistant' | 'knowledge' | 'test'
  provider: string
  model: string
  location: 'cloud' | 'onprem'
  inputChars: number
  outputChars: number
  /** Maskelenen veri türleri ve adetleri. */
  masked: Record<string, number>
  /** İstekle gönderilen görsel sayısı (görsel içeriği maskelenemez). */
  images?: number
  ms: number
  ok: boolean
  error?: string
}

// ── Island ─────────────────────────────────────────────────────────────────

export type Confidence = 'grounded' | 'partial' | 'general'

export interface SourceRef {
  id: string
  label: string
  uri?: string
}

export interface AnswerCard {
  id: string
  question: string
  /** Soruyu kimin sorduğu ("Karşı taraf", "Sen" …). */
  askedBy: string
  short: string
  detail?: string
  sources: SourceRef[]
  confidence: Confidence
  /** Kısa cevap hâlâ akıyorsa true. */
  streaming: boolean
  feedback?: 'up' | 'down'
  latencyMs?: number
  createdAt: number
  /** Bu cevap onaylı cevaplara (SSS) eklendi. */
  savedFaq?: boolean
}

export type ChatPhase = 'listening' | 'thinking' | 'answering' | 'done' | 'error'

/** "Selam Piqi" veya ⌘⇧K ile başlayan kullanıcı–Piqi konuşması. */
export interface ChatView {
  id: string
  phase: ChatPhase
  /** Kullanıcının sorusu (dinlerken canlı güncellenir). */
  userText: string
  reply: string
  /** Cevap sesli okunuyor mu. */
  speaking: boolean
  usedMeetingContext: boolean
  /** Cevabın dayandığı bilgi bankası parçaları. */
  sources: SourceRef[]
  confidence: Confidence
  error?: string
  /** Bu cevap onaylı cevaplara (SSS) eklendi. */
  savedFaq?: boolean
}

export type IslandView =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'question'; question: string; askedBy: string }
  | { kind: 'answer'; answer: AnswerCard }
  | { kind: 'ask' }
  | { kind: 'chat'; chat: ChatView }
  /** Toplantı algılandı; kullanıcıya dinlemeyi başlatmak isteyip istemediği sorulur. */
  | { kind: 'meetingPrompt'; app: string }

export interface NotchGeometry {
  /** Notch varsa genişliği ve yüksekliği (pt); yoksa null. */
  notch: { width: number; height: number } | null
  menuBarHeight: number
}

export interface IslandSnapshot {
  view: IslandView
  /** Island'da geçici olarak gösterilen en son duyulan cümle; diske yazılmaz. */
  lastTranscript: TranscriptEvent | null
  /** Bu toplantıda ayırt edilen konuşmacı sayısı. */
  speakerCount: number
  listening: boolean
  expanded: boolean
  pinned: boolean
  productName: string
  characterName: string
  geometry: NotchGeometry
  /** Eski → yeni sıralı cevaplar; gezinme için. */
  history: AnswerCard[]
  /** Island'da şu an gösterilen cevabın history içindeki sırası. */
  historyIndex: number
  /** Son mikrofon cümlesi (canlı altyazı / "Selam Piqi" geri bildirimi için). */
  wakeHint: boolean
}

export interface AskRequest {
  text: string
  useMeetingContext: boolean
  detailed: boolean
}

export type IslandAction =
  | { type: 'toggleExpand' }
  | { type: 'togglePin' }
  | { type: 'dismiss' }
  | { type: 'copy' }
  | { type: 'feedback'; value: 'up' | 'down' }
  | { type: 'history'; step: -1 | 1 }
  | { type: 'toggleListening' }
  | { type: 'openMain'; page?: string }
  | { type: 'openAsk' }
  | { type: 'askSubmit'; request: AskRequest }
  | { type: 'askVoice' }
  | { type: 'stopSpeaking' }
  | { type: 'saveFaq' }
  | { type: 'meetingStart' }
  | { type: 'meetingDismiss' }
