import { describe, expect, it } from 'vitest'
import { ThinkFilter } from './openaiCompatible'

describe('ThinkFilter', () => {
  it('bölünmüş <think> etiketlerini gizler', () => {
    const f = new ThinkFilter()
    const out = ['<thi', 'nk>plan', ' yapıyorum</th', 'ink>\n', 'Cevap: ', '600 ', 'istek.'].map((d) => f.push(d)).join('')
    expect(out).toBe('Cevap: 600 istek.')
  })
  it('etiket yoksa metni aynen geçirir', () => {
    const f = new ThinkFilter()
    expect(['a < b', ' ve c'].map((d) => f.push(d)).join('')).toBe('a < b ve c')
  })
})
