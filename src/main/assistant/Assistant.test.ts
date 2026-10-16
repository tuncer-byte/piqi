import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
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