import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GapStore } from './GapStore'

const dirs: string[] = []
function store(): { gaps: GapStore; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'piqi-gaps-'))
  dirs.push(dir)
  const file = join(dir, 'gaps.json')
  return { gaps: new GapStore(file), file }
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('GapStore', () => {
  it('aynı sorunun farklı söylenişlerini tek kayıtta sayar ve kalıcı tutar', () => {
    const { gaps, file } = store()
    gaps.add({ question: 'SLA oranı nedir?', askedBy: 'Elif', reason: 'no-source' })
    gaps.add({ question: 'SLA oranları nedir', askedBy: 'Karşı taraf', reason: 'negative' })
    gaps.add({ question: 'Fiyatlandırma nasıl?', askedBy: 'Sen', reason: 'general' })
    const reloaded = new GapStore(file).list()
    expect(reloaded).toHaveLength(2)
    expect(reloaded[0]).toMatchObject({ question: 'SLA oranı nedir?', count: 2, reason: 'negative' })
  })

  it('SSS’ye eklenen soru eksiklerden düşer', () => {
    const { gaps } = store()
    gaps.add({ question: 'SLA oranı nedir?', askedBy: 'Elif', reason: 'no-source' })
    gaps.resolveByQuestion('SLA oranları nedir?')
    expect(gaps.list()).toEqual([])
  })
})
