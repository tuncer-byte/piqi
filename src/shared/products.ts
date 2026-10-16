import type { Product, Settings } from './types'

export function newProduct(name: string, characterName = 'Piqi'): Product {
  return {
    name,
    sector: 'genel',
    character: {
      name: characterName,
      role: 'teknik danışman',
      tone: 'teknik',
      instructions: '',
      glossary: []
    }
  }
}

/** Katılım bankacılığı terimleri: konuşma tanımaya ipucu ve istemde doğru terminoloji için. */
export const PARTICIPATION_GLOSSARY = [
  'kâr payı',
  'katılma hesabı',
  'özel cari hesap',
  'murabaha',
  'mudaraba',
  'müşareke',
  'icara',
  'sukuk',
  'kira sertifikası',
  'tekafül',
  'TKBB',
  'BDDK',
  'KVKK',
  'Danışma Komitesi'
]
