import { describe, expect, it } from 'vitest'
import { chunkCode, chunkDocument, symbolsIn } from './chunker'

describe('chunkCode', () => {
  it('bildirim sınırlarından böler ve sembolleri çıkarır', () => {
    const fn = (name: string, body: number): string =>
      [`export function ${name}(req: Request) {`, ...Array.from({ length: body }, (_, i) => `  const v${i} = ${i}`), '}'].join('\n')
    const text = [`import x from 'y'`, fn('checkLimit', 50), `export class RateLimiter {`, ...Array(60).fill('  x()'), '}', fn('retryAfter', 30)].join('\n')
    const chunks = chunkCode('src/auth/RateLimiter.ts', text)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0]).toMatchObject({ lineStart: 1, title: 'src/auth/RateLimiter.ts' })
    expect(chunks.flatMap((c) => c.symbols)).toEqual(expect.arrayContaining(['checkLimit', 'RateLimiter', 'retryAfter']))
    // Satırlar kesintisiz ve sıralı
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]!.lineStart).toBe(chunks[i - 1]!.lineEnd! + 1)
  })

  it('Go ve Python sembollerini tanır', () => {
    expect(symbolsIn('func (s *Server) HandleWebhook(w http.ResponseWriter) {}\ntype Config struct {}')).toEqual(['HandleWebhook', 'Config'])
    expect(symbolsIn('class Retry:\n    def backoff(self): pass')).toEqual(['Retry', 'backoff'])
  })
})

describe('chunkDocument', () => {
  it('başlık yolunu ve sayfa etiketini korur', () => {
    const chunks = chunkDocument('API-Guide.pdf', [
      { label: 's.14', page: 14, text: '# Limitler\n\n## Rate limit\n\nDakikada 600 istek. Aşılırsa 429 döner.' },
      { label: 's.15', page: 15, text: 'Webhook yeniden deneme 5 kez.' }
    ])
    expect(chunks[0]).toMatchObject({ title: 'API-Guide.pdf › Limitler › Rate limit', page: 14, pageLabel: 's.14' })
    expect(chunks[0]!.text).toContain('600 istek')
    expect(chunks.at(-1)).toMatchObject({ page: 15 })
  })

  it('uzun metni ~1200 karakterlik parçalara böler', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Cümle ${i} burada biraz uzunca bir açıklama içeriyor.`).join(' ')
    const chunks = chunkDocument('notlar.md', [{ text: long }])
    expect(chunks.length).toBeGreaterThan(1)
    expect(Math.max(...chunks.map((c) => c.text.length))).toBeLessThan(1600)
  })
})
