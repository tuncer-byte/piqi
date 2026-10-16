// Buluta giden metindeki kişisel/finansal verileri maskeleyen modül (KVKK, BDDK uyumu).
// Değerler «TÜR-n» belirteçleriyle değiştirilir; model cevabındaki belirteçler yalnızca bu Mac'te
// gerçek değerlere geri çevrilir. Sahte eşleşmeyi önlemek için TCKN, VKN, IBAN ve kart numarası
// sağlama algoritmalarıyla doğrulanır.

export type PiiKind = 'TCKN' | 'VKN' | 'IBAN' | 'KART' | 'TELEFON' | 'EPOSTA'

const digits = (s: string): string => s.replace(/\D/g, '')

export function isTckn(value: string): boolean {
  const d = digits(value)
  if (!/^[1-9]\d{10}$/.test(d)) return false
  const n = d.split('').map(Number)
  const odd = n[0]! + n[2]! + n[4]! + n[6]! + n[8]!
  const even = n[1]! + n[3]! + n[5]! + n[7]!
  const d10 = (((odd * 7 - even) % 10) + 10) % 10
  const d11 = n.slice(0, 10).reduce((a, b) => a + b, 0) % 10
  return n[9] === d10 && n[10] === d11
}

/** Vergi kimlik numarası (10 hane) sağlama algoritması. */
export function isVkn(value: string): boolean {
  const d = digits(value)
  if (!/^\d{10}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const t = (Number(d[i]) + 10 - (i + 1)) % 10
    let p = (t * 2 ** (9 - i)) % 9
    if (t !== 0 && p === 0) p = 9
    sum += p
  }
  return (10 - (sum % 10)) % 10 === Number(d[9])
}

export function isIban(value: string): boolean {
  const v = value.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false
  if (v.startsWith('TR') && v.length !== 26) return false
  const rearranged = v.slice(4) + v.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let mod = 0
  for (const ch of numeric) mod = (mod * 10 + Number(ch)) % 97
  return mod === 1
}

export function isCard(value: string): boolean {
  const d = digits(value)
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

interface Rule {
  kind: PiiKind
  pattern: RegExp
  valid?: (match: string) => boolean
}

// Sıra önemlidir: uzun/özgül kalıplar önce (IBAN içindeki rakamlar kart sanılmasın).
const RULES: Rule[] = [
  { kind: 'EPOSTA', pattern: /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu },
  { kind: 'IBAN', pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi, valid: isIban },
  { kind: 'KART', pattern: /\b\d(?:[ -]?\d){12,18}\b/g, valid: isCard },
  { kind: 'TCKN', pattern: /\b[1-9]\d{10}\b/g, valid: isTckn },
  { kind: 'TELEFON', pattern: /(?:\+90[ ]?|\b0[ ]?)?\(?5\d{2}\)?[ ]?\d{3}[ ]?\d{2}[ ]?\d{2}\b/g },
  { kind: 'VKN', pattern: /\b\d{10}\b/g, valid: isVkn }
]

const TOKEN = /«([A-ZÇĞİÖŞÜ]+)-(\d+)»/g

/**
 * Bir istek boyunca kullanılan maskeleyici: aynı değer her yerde aynı belirtece dönüşür,
 * böylece model bağlamı korur ("«IBAN-1» hesabına…").
 */
export class Masker {
  private byValue = new Map<string, string>()
  private byToken = new Map<string, string>()
  private counters: Partial<Record<PiiKind, number>> = {}

  mask(text: string): string {
    let out = text
    for (const rule of RULES) {
      out = out.replace(rule.pattern, (match) => {
        if (match.startsWith('«')) return match
        if (rule.valid && !rule.valid(match)) return match
        const key = `${rule.kind}:${match.replace(/\s/g, '')}`
        let token = this.byValue.get(key)
        if (!token) {
          const n = (this.counters[rule.kind] ?? 0) + 1
          this.counters[rule.kind] = n
          token = `«${rule.kind}-${n}»`
          this.byValue.set(key, token)
          this.byToken.set(token, match)
        }
        return token
      })
    }
    return out
  }

  unmask(text: string): string {
    return text.replace(TOKEN, (token) => this.byToken.get(token) ?? token)
  }

  /** Maskelenen veri türleri ve adetleri (denetim kaydı için; değerler değil). */
  counts(): Record<string, number> {
    return { ...this.counters }
  }

  get any(): boolean {
    return this.byToken.size > 0
  }
}

/**
 * Akan metinde belirteçler parçalara bölünebilir ("«IB" + "AN-1»"). Bu yardımcı,
 * tamamlanmamış belirteci bekletip yalnızca güvenle geri çevrilebilen kısmı verir.
 */
export class StreamUnmasker {
  private pending = ''

  constructor(private readonly masker: Masker) {}

  push(delta: string): string {
    this.pending += delta
    const open = this.pending.lastIndexOf('«')
    const close = this.pending.lastIndexOf('»')
    const cut = open > close ? open : this.pending.length
    const ready = this.pending.slice(0, cut)
    this.pending = this.pending.slice(cut)
    return this.masker.unmask(ready)
  }

  flush(): string {
    const rest = this.masker.unmask(this.pending)
    this.pending = ''
    return rest
  }
}
