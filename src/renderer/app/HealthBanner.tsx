import { useState, type ReactNode } from 'react'
import type { HealthIssue } from '@shared/types'
import { useHealth } from '../shared/hooks'
import { Button } from './ui'

/**
 * Piqi'yi "dinliyor ama duymuyor" durumuna düşüren sorunlar (izin, ses, model) her sayfanın üstünde
 * gösterilir; her birinin tek tıklık çözümü vardır. Sorun yoksa hiçbir şey çizilmez.
 */
export function HealthBanner({ navigate }: { navigate: (page: 'settings/models') => void }): ReactNode {
  const issues = useHealth()
  const [busy, setBusy] = useState<string | null>(null)
  if (!issues?.length) return null

  const run = async (issue: HealthIssue): Promise<void> => {
    setBusy(issue.id)
    try {
      switch (issue.action) {
        case 'requestMic':
          await window.piqi.permissions.requestMicrophone()
          break
        case 'requestSpeech':
          await window.piqi.permissions.requestSpeech()
          break
        case 'openMicSettings':
          window.piqi.permissions.openSystemSettings('microphone')
          break
        case 'openSpeechSettings':
          window.piqi.permissions.openSystemSettings('speech')
          break
        case 'openAudioCaptureSettings':
          window.piqi.permissions.openSystemSettings('audio-capture')
          break
        case 'openModels':
          navigate('settings/models')
          break
      }
    } finally {
      setBusy(null)
    }
  }

  // İzin ve ses sorunları Piqi'yi tamamen işlevsiz bırakır; model sorunu yalnızca yeni cevapları etkiler.
  const blocking = issues.some((i) => i.id !== 'model')
  const deaf = issues.some((i) => i.id === 'mic-permission' || i.id === 'speech-permission' || i.id === 'speech-engine')
  const title = deaf ? 'Piqi şu an seni duyamıyor' : blocking ? 'Piqi toplantı sesini alamıyor' : 'Bir ayar eksik'
  return (
    <div
      role="status"
      className={`flex flex-col gap-2.5 rounded-[14px] px-5 py-4 ${blocking ? 'bg-warn-soft text-warn-ink' : 'border border-line bg-card'}`}
    >
      <div className="text-[14px] font-bold">{title}</div>
      {issues.map((issue) => (
        <div key={issue.id} className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">{issue.title}</div>
            <div className="text-[12.5px] leading-normal opacity-80">{issue.detail}</div>
          </div>
          <Button size="sm" variant="primary" disabled={busy === issue.id} onClick={() => void run(issue)}>
            {issue.actionLabel}
          </Button>
        </div>
      ))}
    </div>
  )
}
