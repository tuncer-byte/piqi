import type { CaptureStatus, HealthIssue, Permission } from '@shared/types'

export interface HealthInput {
  mic: Permission
  speech: Permission
  status: CaptureStatus
  /** Seçili model sağlayıcısının adı ve kullanıma hazır olup olmadığı (anahtar ya da uç nokta). */
  model: { name: string; ready: boolean } | null
}

/**
 * Piqi'yi "dinliyor ama duymuyor" durumuna düşüren sorunlar. Her biri kullanıcının tek tıkla yapabileceği
 * bir çözümle döner; liste boşsa Piqi çalışmaya hazırdır.
 */
export function healthIssues(input: HealthInput): HealthIssue[] {
  const issues: HealthIssue[] = []
  if (input.mic === 'denied') {
    issues.push({
      id: 'mic-permission',
      title: 'Mikrofon izni kapalı',
      detail: 'Piqi seni duyamıyor; “Selam Piqi” ve kendi soruların çalışmaz.',
      action: 'openMicSettings',
      actionLabel: 'Sistem Ayarları’nı aç'
    })
  } else if (input.mic === 'undetermined') {
    issues.push({
      id: 'mic-permission',
      title: 'Mikrofon izni gerekiyor',
      detail: 'Piqi’nin seni duyabilmesi için mikrofona erişim izni ver.',
      action: 'requestMic',
      actionLabel: 'İzin ver'
    })
  }
  if (input.speech === 'denied') {
    issues.push({
      id: 'speech-permission',
      title: 'Konuşma tanıma izni kapalı',
      detail: 'Ses geliyor ama yazıya dökülemiyor; Piqi ne seni ne karşı tarafı anlayabilir.',
      action: 'openSpeechSettings',
      actionLabel: 'Sistem Ayarları’nı aç'
    })
  } else if (input.speech === 'undetermined') {
    issues.push({
      id: 'speech-permission',
      title: 'Konuşma tanıma izni gerekiyor',
      detail: 'Konuşmalar cihaz üzerinde yazıya dökülür; ses Mac’ten çıkmaz.',
      action: 'requestSpeech',
      actionLabel: 'İzin ver'
    })
  }
  const errors = input.status.errors
  const system = errors.find((e) => e.startsWith('system:'))
  if (system) {
    issues.push({
      id: 'system-audio',
      title: 'Toplantı sesi alınamıyor',
      detail: `Karşı tarafın sesi dinlenemiyor. Sistem sesi kaydı iznini kontrol et. (${system.slice(7).trim()})`,
      action: 'openAudioCaptureSettings',
      actionLabel: 'Sistem Ayarları’nı aç'
    })
  }
  // İzin sorunu zaten listelendiyse tanıma motoru hatası tekrar gösterilmez.
  const stt = errors.find((e) => e.startsWith('stt:'))
  if (stt && input.speech === 'granted') {
    issues.push({
      id: 'speech-engine',
      title: 'Konuşma tanıma çalışmıyor',
      detail: `${stt.slice(4).trim()} Sistem Ayarları → Klavye → Dikte’nin açık ve dil modelinin indirilmiş olduğunu kontrol et.`,
      action: 'openSpeechSettings',
      actionLabel: 'Sistem Ayarları’nı aç'
    })
  }
  if (!input.model) {
    issues.push({
      id: 'model',
      title: 'Model sağlayıcısı seçilmedi',
      detail: 'Cevap ve özet üretmek için bir model sağlayıcısı seç.',
      action: 'openModels',
      actionLabel: 'Modelleri aç'
    })
  } else if (!input.model.ready) {
    issues.push({
      id: 'model',
      title: `${input.model.name} için anahtar yok`,
      detail: 'Onaylı cevaplar çalışır, ama yeni cevap ve toplantı özeti üretilemez.',
      action: 'openModels',
      actionLabel: 'Anahtar ekle'
    })
  }
  return issues
}
