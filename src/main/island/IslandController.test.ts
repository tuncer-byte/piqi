import { describe, expect, it } from 'vitest'
import { IslandController } from './IslandController'

describe('Island transcript reveal', () => {
  it('dinleme durumunda son duyulan cümleyi açar ve kapatır', () => {
    const island = new IslandController({ notch: null, menuBarHeight: 24 }, { productName: 'Ürün', characterName: 'Piqi' }, () => undefined)
    island.setListening(true)
    island.setTranscript({ channel: 'me', segment: 1, text: 'Rate limit kaç?', final: false, t: Date.now() })

    island.handle({ type: 'toggleExpand' })
    expect(island.get()).toMatchObject({ expanded: true, lastTranscript: { channel: 'me', text: 'Rate limit kaç?' } })

    island.handle({ type: 'toggleExpand' })
    expect(island.get().expanded).toBe(false)
  })

  it('uyandırma ipucunda da mikrofon transkriptini açar', () => {
    const island = new IslandController({ notch: null, menuBarHeight: 24 }, { productName: 'Ürün', characterName: 'Piqi' }, () => undefined)
    island.setTranscript({ channel: 'me', segment: 2, text: 'Selam Piqi', final: false, t: Date.now() })
    island.setWakeHint(true)

    island.handle({ type: 'toggleExpand' })
    expect(island.get()).toMatchObject({ expanded: true, wakeHint: true, lastTranscript: { text: 'Selam Piqi' } })
  })
})
describe('Island SSS’ye ekle', () => {
  const make = (): IslandController =>
    new IslandController({ notch: null, menuBarHeight: 24 }, { productName: 'Ürün', characterName: 'Piqi' }, () => undefined)

  it('tamamlanan cevap kartını kısa cevap ve detayla bir kez ekler', () => {
    const island = make()
    const saved: { question: string; answer: string }[] = []
    island.on('saveFaq', (entry) => saved.push(entry))
    const id = island.beginAnswer({ question: 'Rate limit kaç?', askedBy: 'Elif', short: '', sources: [], confidence: 'grounded' })
    island.handle({ type: 'saveFaq' })
    expect(saved).toEqual([])

    island.completeAnswer(id, { short: 'Dakikada 600 istek.', detail: '- API anahtarı başınadır.' })
    island.handle({ type: 'saveFaq' })
    island.handle({ type: 'saveFaq' })
    expect(saved).toEqual([{ question: 'Rate limit kaç?', answer: 'Dakikada 600 istek.\n\n- API anahtarı başınadır.' }])
    expect(island.currentAnswer?.savedFaq).toBe(true)
  })

  it('sohbet cevabını ekler ve işareti sohbet yeniden yazılsa da korur', () => {
    const island = make()
    const saved: { question: string; answer: string }[] = []
    island.on('saveFaq', (entry) => saved.push(entry))
    const chat = {
      id: 'c1',
      phase: 'done' as const,
      userText: 'Veriler nerede tutuluyor?',
      reply: 'Seçtiğin bölgede.',
      speaking: false,
      usedMeetingContext: false,
      sources: [],
      confidence: 'grounded' as const
    }
    island.setChat(chat)
    island.handle({ type: 'saveFaq' })
    island.setChat({ ...chat, speaking: false })
    expect(saved).toEqual([{ question: 'Veriler nerede tutuluyor?', answer: 'Seçtiğin bölgede.' }])
    expect(island.view).toMatchObject({ kind: 'chat', chat: { savedFaq: true } })
  })
})

describe('Island toplantı algılandı', () => {
  const make = (): IslandController =>
    new IslandController({ notch: null, menuBarHeight: 24 }, { productName: 'Ürün', characterName: 'Piqi' }, () => undefined)

  it('görüşmeyi sorar; "Dinlemeye başla" kartı kapatır ve eylemi iletir', () => {
    const island = make()
    const actions: string[] = []
    island.on('action', (a) => actions.push(a.type))
    island.showMeetingPrompt('Zoom')
    expect(island.view).toEqual({ kind: 'meetingPrompt', app: 'Zoom' })
    island.handle({ type: 'meetingStart' })
    expect(island.view.kind).toBe('idle')
    expect(actions).toEqual(['meetingStart'])
  })

  it('kullanıcı Piqi’ye soru sorarken araya girmez', () => {
    const island = make()
    island.showAsk()
    island.showMeetingPrompt('Teams')
    expect(island.view.kind).toBe('ask')
  })
})
