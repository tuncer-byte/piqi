// "Selam Piqi" uyandırma ifadesi algılama. Konuşma tanıma "Piqi"yi çoğu zaman
// "Piki", "Pikî", "Pi ki", "Picky", "Pixie" gibi yazar; hepsini kabul ediyoruz.

const GREETINGS = ['selam', 'merhaba', 'hey', 'hi', 'hello', 'heyy', 'alo']
const NAME = String.raw`p[iı](?:\s|-)?(?:q|k|kk|c|ck|x)(?:i|ı|y|ie|ey|ee|si)?`

/** Karakter adını (ör. "Gece", "Poyraz") konuşma tanımanın yazabileceği biçimlere esnetir. */
function namePattern(name: string): string | null {
  const n = normalize(name).replace(/[^\p{L}\d ]/gu, '')
  if (n.length < 2 || n === 'piqi') return null
  return n
    .split('')
    .map((c) => (c === ' ' ? '\\s?' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
}

const FAREWELLS = ['görüşürüz', 'görüşmek üzere', 'hoşça kal', 'hoşçakal', 'güle güle', 'iyi geceler', 'kendine iyi bak', 'bye', 'goodbye', 'see you']

const cache = new Map<string, RegExp>()

function names(extra: string[]): string {
  return [NAME, ...extra.map(namePattern).filter((p): p is string => p != null)].join('|')
}

function wakePattern(extra: string[]): RegExp {
  const key = `wake|${extra.join('|')}`
  let re = cache.get(key)
  if (!re) {
    re = new RegExp(String.raw`(?:^|\s)(?:${GREETINGS.join('|')})[\s,]+(${names(extra)})(?=$|[\s,.!?:;])`, 'iu')
    cache.set(key, re)
  }
  return re
}

/** "Görüşürüz Piqi", "Hoşça kal Gece", "Piqi kapan" ve "Bye Piqi". */
function sleepPattern(extra: string[]): RegExp {
  const key = `sleep|${extra.join('|')}`
  let re = cache.get(key)
  if (!re) {
    const n = names(extra)
    re = new RegExp(
      String.raw`(?:^|\s)(?:(?:${FAREWELLS.join('|')})[\s,]+(?:${n})|(?:${n})[\s,]+(?:kapan|kapat|uyu|görüşürüz))(?=$|[\s,.!?:;])`,
      'iu'
    )
    cache.set(key, re)
  }
  return re
}

/** "Görüşürüz Piqi" gibi kapanış ifadesi. */
export function detectSleep(text: string, extra: string[] = []): boolean {
  return sleepPattern(extra).test(normalize(text))
}

export interface WakeMatch {
  /** Uyandırma ifadesinden sonra aynı cümlede söylenen kısım. */
  rest: string
}

export function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[’'`"“”]/g, '')
    .replace(/î/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * "Selam Piqi" veya "Selam <karakter adı>". `names` yapılandırılmış Piqi karakter adlarıdır.
 */
export function detectWake(text: string, names: string[] = []): WakeMatch | null {
  const normalized = normalize(text)
  const match = wakePattern(names).exec(normalized)
  if (!match) return null
  const rest = normalized
    .slice(match.index + match[0].length)
    .replace(/^[\s,.!?:;]+/, '')
    .trim()
  return { rest }
}

/** Prova başlatma / durdurma ve konuşmayı kesme komutları. */
/** Konuşmayı kesme komutu. */
export function detectCommand(text: string): 'stop' | null {
  return /^(dur|sus|tamam|kes|yeter|stop)[.!]?$/.test(normalize(text)) ? 'stop' : null
}
