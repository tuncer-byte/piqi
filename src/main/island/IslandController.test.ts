import { describe, expect, it } from 'vitest'
import { IslandController } from './IslandController'

describe('Island transcript reveal', () => {
  it('dinleme durumunda son duyulan cümleyi açar ve kapatır', () => {
    const island = new IslandController({ notch: null, menuBarHeight: 24 }, { productName: 'Demo', characterName: 'Piqi' }, () => undefined)
    island.setListening(true)
    island.setTranscript({ channel: 'me', segment: 1, text: 'Rate limit kaç?', final: false, t: Date.now() })

    island.handle({ type: 'toggleExpand' })
    expect(island.get()).toMatchObject({ expanded: true, lastTranscript: { channel: 'me', text: 'Rate limit kaç?' } })

    island.handle({ type: 'toggleExpand' })
    expect(island.get().expanded).toBe(false)
  })

  it('uyandırma ipucunda da mikrofon transkriptini açar', () => {
    const island = new IslandController({ notch: null, menuBarHeight: 24 }, { productName: 'Demo', characterName: 'Piqi' }, () => undefined)
    island.setTranscript({ channel: 'me', segment: 2, text: 'Selam Piqi', final: false, t: Date.now() })
    island.setWakeHint(true)

    island.handle({ type: 'toggleExpand' })
    expect(island.get()).toMatchObject({ expanded: true, wakeHint: true, lastTranscript: { text: 'Selam Piqi' } })
  })
})