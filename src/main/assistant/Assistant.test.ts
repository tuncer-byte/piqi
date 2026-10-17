import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeHit } from '@shared/knowledge'
import type { ChatView } from '@shared/types'
import { defaultSettings } from '../SettingsStore'
import type { IslandController } from '../island/IslandController'
import type { LlmService } from '../llm/LlmService'
import type { TranscriptStore } from '../speech/TranscriptStore'
import type { VoiceOutput } from '../speech/VoiceOutput'
import { Assistant } from './Assistant'

describe('Assistant repeat-answer cache', () => {
  it('reuses a recent answer for the same question instead of calling the model again', async () => {
    const chats: ChatView[] = []
    const settings = defaultSettings()
    const streamText = vi.fn(async (request: { onText: (delta: string) => void }) => {
      request.onText('Yerel cevap.')
      return 'Yerel cevap.'
    })
    const voice = Object.assign(new EventEmitter(), {
      shouldSpeak: async () => false,
      stop: vi.fn(),
      sentences: vi.fn(() => ({ push: vi.fn(), end: vi.fn(async () => undefined) }))
    })
    const assistant = new Assistant({
      llm: { streamText } as unknown as LlmService,
      island: { setChat: (chat: ChatView) => chats.push(chat) } as unknown as IslandController,
      voice: voice as unknown as VoiceOutput,
      transcripts: { recent: () => '' } as unknown as TranscriptStore,
      settings: () => settings,
      ensureMic: async () => undefined,
      knowledge: { search: () => [] }
    })

    assistant.ask({ text: 'Rate limit kaç?', useMeetingContext: false, detailed: false })
    await vi.waitFor(() => expect(chats.at(-1)?.phase).toBe('done'))
    expect(streamText).toHaveBeenCalledTimes(1)
    expect(streamText.mock.calls[0]?.[0]).toMatchObject({ maxTokens: 512 })

    assistant.ask({ text: 'Rate limit kaç?', useMeetingContext: false, detailed: false })
    expect(chats.at(-1)).toMatchObject({ phase: 'done', reply: 'Yerel cevap.' })
    expect(streamText).toHaveBeenCalledTimes(1)
  })
})

function setup(hits: KnowledgeHit[], reply = 'Cevap [1].') {
  const chats: ChatView[] = []
  const settings = defaultSettings()
  const streamText = vi.fn(async (request: { onText: (delta: string) => void; messages: { content: string }[] }) => {
    request.onText(reply)
    return reply
  })
  const search = vi.fn((_question: string, _limit?: number, _extra?: string[]) => hits)
  const voice = Object.assign(new EventEmitter(), {
    shouldSpeak: async () => false,
    stop: vi.fn(),
    sentences: vi.fn(() => ({ push: vi.fn(), end: vi.fn(async () => undefined) }))
  })
  const assistant = new Assistant({
    llm: { streamText } as unknown as LlmService,
    island: { setChat: (chat: ChatView) => chats.push(chat) } as unknown as IslandController,
    voice: voice as unknown as VoiceOutput,
    transcripts: { recent: () => '' } as unknown as TranscriptStore,
    settings: () => settings,
    ensureMic: async () => undefined,
    knowledge: { search }
  })
  return { assistant, chats, streamText, search }
}

const hit = (text: string, extra: Partial<KnowledgeHit> = {}): KnowledgeHit => ({
  chunkId: 7,
  sourceId: 'docs',
  sourceName: 'Dokümanlar',
  kind: 'files',
  label: 'API-Guide.pdf · s.14',
  title: 'API-Guide.pdf',
  text,
  score: 1,
  ...extra
})

describe('Assistant token ve hız iyileştirmeleri', () => {
  it('onaylı SSS birebir eşleşince modeli çağırmadan cevaplar', async () => {
    const faq = hit('Soru: Enterprise pakette rate limit kaç?\nOnaylı cevap: Dakikada 6000 istek.', {
      kind: 'faq',
      label: 'SSS',
      title: 'Enterprise pakette rate limit kaç?'
    })
    const { assistant, chats, streamText } = setup([faq])
    assistant.ask({ text: 'Enterprise paketinde rate limit kaçtır?', useMeetingContext: false, detailed: false })
    await vi.waitFor(() => expect(chats.at(-1)?.phase).toBe('done'))
    expect(streamText).not.toHaveBeenCalled()
    expect(chats.at(-1)).toMatchObject({ reply: 'Dakikada 6000 istek.', confidence: 'grounded', sources: [{ label: 'SSS' }] })
  })

  it('uzun kaynakları bütçeye göre kırpar', async () => {
    const long = 'Limitler bölümü. '.repeat(400)
    const { assistant, chats, streamText } = setup([hit(long), hit(long, { chunkId: 8 }), hit(long, { chunkId: 9 })])
    assistant.ask({ text: 'Limitler nedir?', useMeetingContext: false, detailed: false })
    await vi.waitFor(() => expect(chats.at(-1)?.phase).toBe('done'))
    const content = streamText.mock.calls[0]![0].messages.at(-1)!.content
    expect(content.length).toBeLessThan(4_000)
    expect(chats.at(-1)?.sources).toEqual([{ id: '7', label: 'API-Guide.pdf · s.14' }])
  })

  it('kısa takip sorusunda aramayı önceki soruyla genişletir ve tarihçedeki cevabı kısaltır', async () => {
    const { assistant, chats, streamText, search } = setup([hit('Dakikada 600 istek.')], `Uzun cevap. ${'ayrıntı '.repeat(200)}`)
    assistant.ask({ text: 'Webhook rate limit kaç?', useMeetingContext: false, detailed: false })
    await vi.waitFor(() => expect(chats.at(-1)?.phase).toBe('done'))
    assistant.ask({ text: 'Peki Enterprise?', useMeetingContext: false, detailed: false })
    await vi.waitFor(() => expect(streamText).toHaveBeenCalledTimes(2))
    expect(search.mock.calls[1]![2]).toEqual(['Webhook rate limit kaç?'])
    const history = streamText.mock.calls[1]![0].messages[1]!.content
    expect(history.length).toBeLessThanOrEqual(601)
  })
})