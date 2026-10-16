import { useEffect, useState } from 'react'
import type { KnowledgeOverview } from '@shared/knowledge'
import type {
  AudioLevels,
  CaptureStatus,
  IslandSnapshot,
  MeetingPeople,
  PolicyStatus,
  ProviderStatus,
  Settings,
  TtsStatus
} from '@shared/types'

export function useIslandSnapshot(): IslandSnapshot | null {
  const [snapshot, setSnapshot] = useState<IslandSnapshot | null>(null)
  useEffect(() => {
    void window.piqi.island.getSnapshot().then(setSnapshot)
    return window.piqi.island.onSnapshot(setSnapshot)
  }, [])
  return snapshot
}

export function useLevels(): AudioLevels {
  const [levels, setLevels] = useState<AudioLevels>({ me: 0, them: 0 })
  useEffect(() => window.piqi.capture.onLevels(setLevels), [])
  return levels
}

export function useCaptureStatus(): CaptureStatus | null {
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  useEffect(() => {
    void window.piqi.capture.getStatus().then(setStatus)
    return window.piqi.capture.onStatus(setStatus)
  }, [])
  return status
}

export function useSettings(): [Settings | null, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    void window.piqi.settings.get().then(setSettings)
    return window.piqi.settings.onChange(setSettings)
  }, [])
  const update = (patch: Partial<Settings>): void => {
    void window.piqi.settings.update(patch).then(setSettings)
  }
  return [settings, update]
}

/** Tüm sağlayıcıların anahtar durumu. */
export function useProviderStatuses(): [ProviderStatus[], () => void] {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([])
  const refresh = (): void => void window.piqi.provider.getStatus().then(setStatuses)
  useEffect(refresh, [])
  return [statuses, refresh]
}

/**
 * Seçili sağlayıcı kullanıma hazır mı (anahtar gerekiyorsa var mı). Ayarlar yüklenmediyse null.
 */
export function useProviderReady(settings: Settings | null): boolean | null {
  const [statuses] = useProviderStatuses()
  const [policy] = usePolicy()
  if (!settings || statuses.length === 0 || !policy) return null
  const status = statuses.find((s) => s.providerId === settings.model.providerId)
  const keyless = ['ollama', 'onprem'].includes(settings.model.providerId)
  return keyless || Boolean(status?.hasApiKey)
}

export function usePolicy(): [PolicyStatus | null, () => void] {
  const [policy, setPolicy] = useState<PolicyStatus | null>(null)
  const refresh = (): void => void window.piqi.policy.get().then(setPolicy)
  useEffect(() => {
    refresh()
    return window.piqi.settings.onChange(refresh)
  }, [])
  return [policy, refresh]
}

export function useTtsStatus(): TtsStatus | null {
  const [status, setStatus] = useState<TtsStatus | null>(null)
  useEffect(() => {
    void window.piqi.tts.status().then(setStatus)
    return window.piqi.tts.onStatus(setStatus)
  }, [])
  return status
}

export function usePeople(): MeetingPeople | null {
  const [people, setPeople] = useState<MeetingPeople | null>(null)
  useEffect(() => {
    void window.piqi.people.get().then(setPeople)
    return window.piqi.people.onChange(setPeople)
  }, [])
  return people
}


export function useKnowledge(): KnowledgeOverview | null {
  const [overview, setOverview] = useState<KnowledgeOverview | null>(null)
  useEffect(() => {
    void window.piqi.knowledge.overview().then(setOverview)
    return window.piqi.knowledge.onChange(setOverview)
  }, [])
  return overview
}
