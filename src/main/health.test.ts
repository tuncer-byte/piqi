import { describe, expect, it } from 'vitest'
import type { CaptureStatus } from '@shared/types'
import { healthIssues } from './health'

const running: CaptureStatus = { state: 'running', mic: true, system: false, errors: [], transcribing: ['me'] }
const ok = { mic: 'granted' as const, speech: 'granted' as const, status: running, model: { name: 'Anthropic Claude', ready: true } }

describe('healthIssues', () => {
  it('her şey hazırsa sorun yok', () => {
    expect(healthIssues(ok)).toEqual([])
  })

  it('konuşma tanıma izni verilmemişse izin istemeyi önerir', () => {
    expect(healthIssues({ ...ok, speech: 'undetermined' })).toMatchObject([{ id: 'speech-permission', action: 'requestSpeech' }])
  })

  it('reddedilen izinler için Sistem Ayarları’nı açar', () => {
    const ids = healthIssues({ ...ok, mic: 'denied', speech: 'denied' }).map((i) => [i.id, i.action])
    expect(ids).toEqual([
      ['mic-permission', 'openMicSettings'],
      ['speech-permission', 'openSpeechSettings']
    ])
  })

  it('izin sorunu varken tanıma motoru hatasını ayrıca göstermez', () => {
    const status = { ...running, errors: ['stt: Konuşma tanıma izni henüz verilmedi'] }
    expect(healthIssues({ ...ok, speech: 'undetermined', status }).map((i) => i.id)).toEqual(['speech-permission'])
    expect(healthIssues({ ...ok, status }).map((i) => i.id)).toEqual(['speech-engine'])
  })

  it('sistem sesi hatasını ve eksik model anahtarını bildirir', () => {
    const status = { ...running, errors: ['system: Sistem sesi başlatılamadı (izin verilmemiş olabilir)'] }
    const issues = healthIssues({ ...ok, status, model: { name: 'Anthropic Claude', ready: false } })
    expect(issues.map((i) => [i.id, i.action])).toEqual([
      ['system-audio', 'openAudioCaptureSettings'],
      ['model', 'openModels']
    ])
    expect(issues[0]!.detail).toContain('Sistem sesi başlatılamadı')
  })
})
