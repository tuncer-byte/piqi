import type { DocCategory } from '@shared/knowledge'

// Dosya adı ve içeriğin başından konu kategorisi ve etiket çıkarımı (yerel, maliyetsiz).

const RULES: [DocCategory, RegExp][] = [
  ['sss', /\b(sss|faq|s\.s\.s|sık sorulan|q&a|soru[- ]?cevap)\b/i],
  ['fiyat', /\b(fiyat|price|pricing|paket|plan|tarife|lisans|license|teklif|quote|ücret|maliyet|matris)/i],
  ['guvenlik', /\b(güvenlik|guvenlik|security|sso|saml|oauth|oidc|kvkk|gdpr|iso ?27001|pentest|şifreleme|encryption|soc ?2|bddk)/i],
  ['api', /\b(api|endpoint|rest|graphql|swagger|openapi|sdk|webhook|postman|rate limit|http)\b/i],
  ['mimari', /\b(mimari|architecture|tasarım|design|diagram|diyagram|altyapı|infrastructure|entegrasyon|integration|sunum|topoloji)/i]
]

export function categorizeDocument(name: string, sample: string): DocCategory {
  for (const [category, re] of RULES) if (re.test(name)) return category
  const head = sample.slice(0, 3000)
  let best: DocCategory = 'genel'
  let bestCount = 0
  for (const [category, re] of RULES) {
    const count = head.match(new RegExp(re.source, 'gi'))?.length ?? 0
    if (count > bestCount) {
      best = category
      bestCount = count
    }
  }
  return bestCount >= 2 ? best : 'genel'
}

const ACRONYMS = ['SSO', 'SAML', 'OIDC', 'OAuth', 'REST', 'GraphQL', 'SDK', 'KVKK', 'GDPR', 'BDDK', 'SLA', 'SCIM', 'MFA', 'PCI', 'ISO']

/** Görünür etiketler: sürüm (v3), yıl (2026) ve sık geçen kısaltmalar (SSO, SAML…). En fazla 3. */
export function tagsFor(name: string, sample: string): string[] {
  const tags: string[] = []
  const version = /\bv(\d+(?:\.\d+)?)\b/i.exec(name) ?? /\b(?:version|sürüm)\s*(\d+(?:\.\d+)?)\b/i.exec(sample.slice(0, 2000))
  if (version) tags.push(`v${version[1]}`)
  const year = /\b(20[2-3]\d)\b/.exec(name)
  if (year) tags.push(year[1]!)
  const head = sample.slice(0, 4000)
  const scored = ACRONYMS.map((a) => ({ a, n: head.match(new RegExp(`\\b${a}\\b`, 'g'))?.length ?? 0 }))
    .filter((x) => x.n >= 2 || new RegExp(`\\b${x.a}\\b`, 'i').test(name))
    .sort((x, y) => y.n - x.n)
  for (const { a } of scored) if (tags.length < 3 && !tags.includes(a)) tags.push(a)
  return tags
}
