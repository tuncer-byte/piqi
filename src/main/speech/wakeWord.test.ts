import { describe, expect, it } from 'vitest'
import { detectCommand, detectSleep, detectWake } from './wakeWord'

describe('detectWake', () => {
  it.each([
    'Selam Piqi',
    'selam piki',
    'Selam, Pikî!',
    'Merhaba Piki nasılsın',
    'Hey Picky',
    'selam pi ki',
    'Selam Pixie'
  ])('"%s" uyandırır', (text) => {
    expect(detectWake(text)).not.toBeNull()
  })

  it.each(['Selam arkadaşlar', 'piki piki', 'Selam Pınar', 'Bu API kimin', 'selam pilot ekibi'])(
    '"%s" uyandırmaz',
    (text) => {
      expect(detectWake(text)).toBeNull()
    }
  )

  it('uyandırma ifadesinden sonraki soruyu ayırır', () => {
    expect(detectWake('Selam Piki, rate limit kaçtı?')?.rest).toBe('rate limit kaçtı?')
    expect(detectWake('selam piqi')?.rest).toBe('')
  })
})

describe('ürün bazlı isim', () => {
  it('karakter adıyla uyanır', () => {
    expect(detectWake('Selam Gece, rate limit kaç?', ['Gece'])?.rest).toBe('rate limit kaç?')
    expect(detectWake('Merhaba Poyraz', ['Poyraz'])).not.toBeNull()
    expect(detectWake('Hey Ada Nur', ['Ada Nur'])).not.toBeNull()
  })
  it('“Selam Piqi” her zaman çalışır, başka isimler çalışmaz', () => {
    expect(detectWake('Selam Piqi', ['Gece'])).not.toBeNull()
    expect(detectWake('Selam Poyraz', ['Gece'])).toBeNull()
  })
})

describe('detectCommand', () => {
  it('kesme komutunu tanır', () => {
    expect(detectCommand('dur')).toBe('stop')
    expect(detectCommand('rate limit kaç')).toBeNull()
  })
})

describe('detectSleep', () => {
  it.each(['Görüşürüz Piqi', 'görüşürüz piki.', 'Hoşça kal Piqi', 'Piqi kapan', 'Bye Piqi', 'Tamam, görüşürüz Gece!'])('"%s" kapatır', (text) => {
    expect(detectSleep(text, ['Gece'])).toBe(true)
  })
  it.each(['Görüşürüz arkadaşlar', 'Selam Piqi', 'Yarın görüşürüz'])('"%s" kapatmaz', (text) => {
    expect(detectSleep(text, ['Gece'])).toBe(false)
  })

  it('Apple’ın Türkçe tanıyıcısının yazdığı "Selam peki" ile uyanır', () => {
    expect(detectWake('Selam peki, rate limit kaç?')?.rest).toBe('rate limit kaç?')
    expect(detectWake('Merhaba peki')).not.toBeNull()
  })

  it('"peki" ile başlayan sıradan cümleler Piqi’yi kapatmaz', () => {
    expect(detectSleep('Peki kapat şunu')).toBe(false)
    expect(detectSleep('Tamam, görüşürüz peki')).toBe(false)
    expect(detectWake('Peki, rate limit kaç?')).toBeNull()
  })
})
