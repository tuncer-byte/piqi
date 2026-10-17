import { describe, expect, it } from 'vitest'
import { detectQuestion } from './questionDetect'

describe('detectQuestion', () => {
  it.each([
    'Rate limit aşılırsa ne oluyor',
    'API anahtarı başına limit var mı',
    'Bu ürün hangi bölgelerde barındırılıyor?',
    'Kişisel veriler buluta gönderiliyor mu',
    'Kaç kullanıcıya kadar destekliyorsunuz',
    'How do you handle webhook retries',
    'Is the data encrypted at rest?'
  ])('ürün sorusunu yakalar: %s', (text) => {
    expect(detectQuestion(text)).toBe(text)
  })

  it.each([
    'Beni duyuyor musunuz?',
    'Ekranımı görebiliyor musunuz',
    'Başlayalım mı artık',
    'Nasılsınız bugün?',
    'Can you hear me now?',
    'Tamam teşekkürler.',
    'Bu konuyu sonra konuşuruz.',
    'Peki ya?'
  ])('soru olmayanı veya lojistiği atlar: %s', (text) => {
    expect(detectQuestion(text)).toBeNull()
  })

  it('"mi" ekinin kelime içindeki geçişini soru sanmaz', () => {
    expect(detectQuestion('Bu entegrasyon minimum iki gün sürer.')).toBeNull()
  })
})
