import { describe, expect, it } from 'vitest'
import type { KnowledgeHit } from '@shared/knowledge'
import { chunkDocument } from './chunker'
import { KnowledgeDB } from './KnowledgeDB'
import { queryConcepts } from './query'
import { faqAnswer, focusText, sourcesBlock } from './snippet'

function hit(text: string, kind: KnowledgeHit['kind'] = 'files', extra: Partial<KnowledgeHit> = {}): KnowledgeHit {
  return { chunkId: 1, sourceId: 's', sourceName: 'S', kind, label: 'doc', title: 'doc', text, score: 1, ...extra }
}

describe('queryConcepts', () => {
  it('Türkçe ifadeyi sözlükteki İngilizce karşılıklarıyla tek kavram sayar', () => {
    const concepts = queryConcepts('Hız sınırı aşılırsa ne olur?')
    const rate = concepts.find((c) => c.includes('rate'))!
    expect(rate).toEqual(expect.arrayContaining(['hız', 'sınırı', 'limit']))
    expect(concepts.filter((c) => c.includes('sınırı'))).toHaveLength(1)
  })
})

describe('focusText', () => {
  const filler = Array.from({ length: 60 }, (_, i) => `  const value${i} = compute(${i})\n`).join('')
  const code = `export class Gateway {\n${filler}  retryAfter(key: string) { return this.limiter.wait(key) }\n${filler}}\n`

  it('uzun koddan soruyla ilgili satırları seçer ve imzayı korur', () => {
    const out = focusText(code, 'code', queryConcepts('retryAfter limiter nasıl çalışıyor'), 400)
    expect(out.length).toBeLessThanOrEqual(400)
    expect(out).toContain('retryAfter(key: string)')
    expect(out.startsWith('export class Gateway {')).toBe(true)
  })

  it('bütçeye sığan metni olduğu gibi bırakır', () => {
    expect(focusText('kısa metin', 'files', [], 100)).toBe('kısa metin')
  })
})

describe('sourcesBlock', () => {
  it('toplam bütçeyi aşmaz, sığmayan alt sıradaki parçaları göndermez', () => {
    const long = 'Lorem ipsum dolor sit amet. '.repeat(80)
    const hits = [hit(long), hit(long, 'files', { label: 'b' }), hit(long, 'files', { label: 'c' })]
    const { text, used } = sourcesBlock('lorem ipsum', hits, { total: 1_500, perHit: 1_000 })
    expect(used.map((h) => h.label)).toEqual(['doc', 'b'])
    expect(text.length).toBeLessThan(1_600)
    expect(text).toContain('[2]')
  })
})

describe('faqAnswer', () => {
  const faq = hit('Soru: Enterprise pakette rate limit kaç?\nOnaylı cevap: Dakikada 6000 istek.', 'faq', {
    title: 'Enterprise pakette rate limit kaç?'
  })

  it('aynı anlamdaki soruya onaylı cevabı döner', () => {
    expect(faqAnswer('Enterprise paketinde rate limit kaçtır?', faq)).toBe('Dakikada 6000 istek.')
  })

  it('yalnızca kısmen örtüşen soruda model çağrısına bırakır', () => {
    expect(faqAnswer('Rate limit kaç?', faq)).toBeNull()
    expect(faqAnswer('Enterprise pakette fiyat ne kadar?', faq)).toBeNull()
  })
})

describe('KnowledgeDB.search alaka eşiği', () => {
  function db(): KnowledgeDB {
    const db = new KnowledgeDB(':memory:')
    const write = (path: string, text: string): void => {
      db.writeDocument({
        sourceId: 'docs',
        kind: 'files',
        path,
        title: path,
        hash: path,
        chunks: chunkDocument(path, [{ text }]),
        labelFor: () => path
      })
    }
    write('limits.md', 'Webhook teslimatı başarısız olursa 5 kez yeniden denenir; her deneme arasında üstel bekleme uygulanır.')
    write('noise.md', 'Webhook webhook webhook ekranı. Webhook listesi. Webhook ayarları ve webhook adları.')
    write('other.md', 'Kullanıcı arayüzünde tema seçimi yapılır.')
    return db
  }

  it('sorudaki kavramların çoğunu karşılayan parçayı tek kelimeyi tekrarlayanın önüne alır', () => {
    const hits = db().search('Webhook başarısız olursa kaç kez yeniden denenir?')
    expect(hits[0]!.label).toBe('limits.md')
  })

  it('en iyi sonuca göre zayıf kalan parçaları modele göndermez', () => {
    const hits = db().search('Webhook başarısız olursa kaç kez yeniden denenir?')
    expect(hits.map((h) => h.label)).not.toContain('other.md')
    expect(hits[0]!.coverage).toBeGreaterThan(0.5)
  })
})
