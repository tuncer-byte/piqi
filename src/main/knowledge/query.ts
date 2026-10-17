// Sorguyu yerel tam metin aramasına (FTS5) çevirir. Maliyetsizdir: model çağrısı yoktur.
// Türkçe ekler için kök araması, Türkçe↔İngilizce teknik sözlük ve camelCase ayrıştırma yapılır.

const STOPWORDS = new Set(
  (
    've ile bir bu şu o ne mi mı mu mü nasıl nedir neden niye için gibi daha çok var yok olan olarak de da ki kaç hangi ' +
    'hangisi ise ama fakat veya ya şey bize size bizim sizin acaba peki tamam evet hayır mısınız misiniz musunuz müsünüz ' +
    'oluyor olur oldu olursa yapılır yapıyor yapabilir edilir ediliyor eder biz siz onlar the a an is are was were what how why ' +
    'which who of to in on for and or do does did can could should would will with by from at as be it this that'
  ).split(' ')
)

/** Toplantıda Türkçe sorulan kavramların kodda/İngilizce dokümanda geçen karşılıkları. */
const GLOSSARY: [RegExp, string[]][] = [
  [/hız\s*sınır|istek\s*sınır|oran\s*sınır|limit/, ['rate', 'limit', 'throttle', 'quota']],
  [/yeniden\s*dene|tekrar\s*dene/, ['retry', 'backoff']],
  [/kimlik\s*doğrula|oturum\s*aç|giriş/, ['auth', 'authentication', 'login', 'token']],
  [/yetkilendir|yetki|izin/, ['authorization', 'permission', 'role', 'scope']],
  [/şifrele/, ['encryption', 'encrypt', 'tls', 'aes']],
  [/şifre|parola/, ['password', 'secret']],
  [/ödeme|tahsilat/, ['payment', 'charge', 'transaction']],
  [/fatura/, ['invoice', 'billing']],
  [/fiyat|ücret|paket|tarife/, ['price', 'pricing', 'plan', 'tier', 'fee']],
  [/kullanıcı/, ['user', 'account']],
  [/hesap/, ['account']],
  [/müşteri/, ['customer', 'client', 'tenant']],
  [/günlük|log|kayıt/, ['log', 'logging', 'audit']],
  [/hata/, ['error', 'exception', 'failure']],
  [/istek/, ['request']],
  [/yanıt|cevap/, ['response']],
  [/bildirim|olay/, ['notification', 'webhook', 'event']],
  [/yapılandır|ayar/, ['config', 'configuration', 'settings']],
  [/veri\s*taban/, ['database', 'db', 'sql']],
  [/oturum/, ['session']],
  [/anahtar/, ['key', 'apikey']],
  [/kuyruk/, ['queue']],
  [/önbellek/, ['cache']],
  [/zaman\s*aşım/, ['timeout']],
  [/sürüm|versiyon/, ['version']],
  [/entegrasyon/, ['integration']],
  [/rapor/, ['report']],
  [/zamanla|cron|periyodik/, ['schedule', 'cron', 'job']],
  [/dosya\s*yükle|yükleme/, ['upload', 'file']],
  [/arama/, ['search', 'query']],
  [/yedek/, ['backup', 'replica']],
  [/ölçekle/, ['scale', 'scaling', 'autoscaling']],
  [/kesinti|erişilebilir|uptime/, ['availability', 'sla', 'uptime']],
  [/veri\s*merkez|bölge|lokasyon/, ['region', 'datacenter', 'residency']],
  [/sertifika/, ['certificate', 'cert', 'tls']],
  [/denetim|iz\s*kaydı/, ['audit']],
  [/kâr\s*pay|kar\s*pay/, ['profit', 'share']]
]

export function trLower(text: string): string {
  return text.toLocaleLowerCase('tr-TR')
}

/** "RateLimiter" → "rate limiter", "retry_after" → "retry after". */
export function splitIdentifier(id: string): string[] {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1)
}

/** Kod parçasındaki tanımlayıcıları kelimelerine ayırıp anahtar kelime alanı için verir. */
export function identifierWords(text: string, limit = 60): string {
  const counts = new Map<string, number>()
  for (const id of text.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? []) {
    if (!/[a-z][A-Z]|_/.test(id)) continue
    for (const w of splitIdentifier(id)) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w)
    .join(' ')
}

export function tokens(text: string): string[] {
  return trLower(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

// Türkçe çekim ekleri (uzundan kısaya). Kök en az 4 harf kalacak şekilde en fazla iki ek soyulur.
const SUFFIXES = [
  'lerinden', 'larından', 'lerinde', 'larında', 'lerden', 'lardan', 'lerine', 'larına', 'ların', 'lerin', 'larda', 'lerde',
  'ından', 'inden', 'undan', 'ünden', 'ları', 'leri', 'ında', 'inde', 'unda', 'ünde', 'ının', 'inin', 'unun', 'ünün',
  'ırsa', 'irse', 'ursa', 'ürse', 'arsa', 'erse', 'ıyor', 'iyor', 'uyor', 'üyor', 'ılır', 'ilir', 'ulur', 'ülür',
  'lar', 'ler', 'dan', 'den', 'tan', 'ten', 'nın', 'nin', 'nun', 'nün', 'yla', 'yle', 'mak', 'mek', 'sını', 'sini',
  'da', 'de', 'ta', 'te', 'ya', 'ye', 'sı', 'si', 'su', 'sü', 'ın', 'in', 'un', 'ün', 'sa', 'se', 'ı', 'i', 'u', 'ü'
]

/** Hafif Türkçe kök bulucu: "limitleri" → "limit", "aşılırsa" → "aşıl". */
export function stem(word: string): string {
  let w = word
  for (let round = 0; round < 2; round++) {
    const suffix = SUFFIXES.find((s) => w.endsWith(s) && w.length - s.length >= 4)
    if (!suffix) break
    w = w.slice(0, -suffix.length)
  }
  return w
}

/**
 * Sorudaki kavramlar: her biri, metinde geçerse kavramı karşılayan biçimlerin kümesidir (kelime, Türkçe kökü
 * ve sözlükteki İngilizce karşılıklar). "Hız sınırı" ve "rate/limit" tek kavram sayılır; böylece İngilizce
 * bir parça Türkçe soruyu tam karşılayabilir. Sıralama ve parça kırpma için kullanılır.
 */
export function queryConcepts(question: string): string[][] {
  const lower = trLower(question)
  const all = [...new Set(tokens(question))]
  const concepts: string[][] = []
  const covered = new Set<string>()
  for (const [re, words] of GLOSSARY) {
    const match = re.exec(lower)
    if (!match) continue
    // Eşleşme kelime ortasında bitebilir ("hız sınır|ı"); dokunduğu kelimelerin tamamı bu kavrama aittir.
    const own = all.filter((t) => tokens(match[0]).some((m) => t.startsWith(m) || m.startsWith(t)))
    own.forEach((t) => covered.add(t))
    concepts.push([...new Set([...own.flatMap((t) => [t, stem(t)]), ...words])])
  }
  for (const t of all) if (!covered.has(t)) concepts.push([...new Set([t, stem(t)])])
  return concepts
}

/** Metnin kelimeleri (camelCase/snake_case parçaları dahil); `matches` ile kavram karşılığı aranır. */
export function wordSet(text: string): Set<string> {
  const words = new Set<string>()
  for (const w of trLower(text).split(/[^\p{L}\p{N}]+/u)) if (w.length > 1) words.add(w)
  for (const id of text.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? []) {
    if (/[a-z][A-Z]|_/.test(id)) splitIdentifier(id).forEach((w) => words.add(w))
  }
  return words
}

/** Kavramın biçimlerinden biri metinde geçiyor mu? Kökler önek olarak eşleşir ("limit" ↔ "limitleri"). */
export function matches(concept: string[], words: Set<string>): boolean {
  for (const form of concept) if (words.has(form)) return true
  const prefixes = concept.filter((form) => form.length >= 4)
  if (!prefixes.length) return false
  for (const w of words) for (const form of prefixes) if (w.length > form.length && w.startsWith(form)) return true
  return false
}

/** Kavramların metinde karşılanan oranı (0–1). Kavram yoksa 1. */
export function coverage(concepts: string[][], words: Set<string>): number {
  if (!concepts.length) return 1
  return concepts.filter((c) => matches(c, words)).length / concepts.length
}

/** FTS5 için kaçışlı terim. */
const quote = (t: string): string => `"${t.replace(/"/g, '""')}"`

/**
 * Doğal dil sorusunu FTS5 sorgusuna çevirir. Her kelime kendisi VEYA kökü (Türkçe ekler) ile aranır;
 * sözlükteki İngilizce karşılıklar da eklenir. Terimler OR ile bağlanır; sıralamayı BM25 yapar.
 */
export function buildFtsQuery(question: string, extra: string[] = []): string | null {
  const lower = trLower(question)
  const terms = new Set<string>()
  for (const t of [...tokens(question), ...extra.flatMap(tokens)]) {
    terms.add(quote(t))
    // Kök: Türkçe çekim ekleri ("limitleri", "aşılırsa") için önek araması.
    const root = stem(t)
    if (root !== t && /\p{L}/u.test(root)) terms.add(`${quote(root)}*`)
  }
  for (const [re, words] of GLOSSARY) if (re.test(lower)) words.forEach((w) => terms.add(quote(w)))
  // Soruda kod adı geçiyorsa ("RateLimiter") parçaları da ara.
  for (const id of question.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? []) {
    if (/[a-z][A-Z]|_/.test(id)) splitIdentifier(id).forEach((w) => terms.add(quote(w)))
  }
  if (terms.size === 0) return null
  return [...terms].slice(0, 48).join(' OR ')
}
