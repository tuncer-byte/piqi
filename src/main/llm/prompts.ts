import type { Product, Sector, Tone } from '@shared/types'

const TONE: Record<Tone, string> = {
  teknik: 'Teknik ve kesin konuş; API adlarını, hata kodlarını ve terimleri olduğu gibi kullan.',
  satis: 'Değer ve fayda odaklı konuş; teknik detayı müşterinin işine bağla.',
  kisa: 'Olabildiğince kısa ve net konuş; gereksiz giriş cümlesi kurma.'
}

/** Bu soruya uyan kaynak parçası bulunamadığında dürüstlük kuralı. */
const KNOWLEDGE_RULE =
  'Bu soru için bilgi bankasında eşleşen kaynak bulunamadı; yalnızca aşağıdaki ürün talimatına ve genel bilgine dayanabilirsin. ' +
  'Ürüne özel bir rakam, limit, fiyat veya davranış talimatta yoksa uydurma: "bunu dokümandan doğrulamak gerekir" de ve genel bilgiyi ayrıca belirt.'

/** Sektöre özgü dil ve uyum kuralları (bankacılık ve katılım bankacılığı). */
const SECTOR: Record<Sector, string> = {
  genel: '',
  bankacilik:
    'Bankacılık bağlamındasın: BDDK ve KVKK yükümlülüklerine aykırı bir öneride bulunma, müşteri verisi ve sır saklama konusunda temkinli konuş; ' +
    'yasal/regülatif kesinlik gerektiren konularda "uyum ekibiyle teyit edilmeli" de. Getiri veya fiyat taahhüdü verme.',
  katilim:
    'Katılım bankacılığı bağlamındasın (faizsiz bankacılık): "faiz" yerine "kâr payı", "mevduat" yerine "katılma hesabı / özel cari hesap" de; ' +
    'murabaha, mudaraba, müşareke, icara, sukuk ve tekafül terimlerini doğru kullan. Ürünün Danışma Komitesi (icazet) uygunluğu hakkında kesin hüküm verme, ' +
    '"Danışma Komitesi onayıyla teyit edilmeli" de. BDDK ve KVKK yükümlülüklerine aykırı öneride bulunma; getiri taahhüdü verme.'
}

function productBlock(product: Product): string {
  const lines = [`Ürün: ${product.name}`]
  if (product.character.instructions.trim()) lines.push(`Ürün talimatı: ${product.character.instructions.trim()}`)
  if (product.character.glossary.length) lines.push(`Ürün terimleri: ${product.character.glossary.join(', ')}`)
  return lines.join('\n')
}

/** Bilgi bankasından parça bulunduğunda: yalnızca onlara dayan ve numarayla atıf ver. */
const GROUNDED_RULE =
  'Kullanıcının mesajındaki numaralı kaynak parçalarına dayan. Kullandığın her bilginin hemen sonuna köşeli parantezle kaynak numarasını yaz, örn. [2]. ' +
  'Kaynaklarda olmayan ürüne özel bir rakam ya da davranışı uydurma: "kaynaklarda bulamadım" de, genel bilgiyi ayrıca belirt. ' +
  'Kod parçalarında gördüğün sabitleri, hata kodlarını ve sınıf adlarını olduğu gibi kullan.'

/** "Selam Piqi" ve ⌘⇧K için asistan sistem istemi. */
export function assistantSystem(product: Product, opts: { spoken: boolean; detailed: boolean; grounded: boolean }): string {
  const c = product.character
  const format = opts.spoken
    ? 'Cevabın sesli okunacak: Markdown, madde işareti, kod bloğu veya emoji kullanma. En fazla üç kısa cümle kur; sayıları ve kısaltmaları okunacak biçimde yaz.'
    : opts.detailed
      ? 'Cevabı okunaklı parçalara ayır: önce tek paragrafta doğrudan sonuç, boş satır, ardından gerekli ayrıntıları kısa maddeler halinde ver. Kaynakta kod varsa ilgili dosya/satır bilgisini ve kısa kod bloğunu ekle; kaynakta olmayan kodu uydurma.'
      : 'Cevabı okunaklı parçalara ayır: önce tek paragrafta kısa ve doğrudan sonuç, boş satır, ardından gerekiyorsa en fazla üç kısa maddeyle önemli koşul, limit veya sonucu açıkla. Kaynakta ilgili kod varsa yalnızca gerekli kısa kod bloğunu ekle; gereksiz detay verme.'
  return [
    `Sen ${c.name}'sin: ${product.name} ürününü anlatan ekibin ${c.role} rolündeki yardımcısısın.`,
    'Kullanıcı bu ekipte çalışıyor; müşteri toplantılarına hazırlanıyor veya toplantıda sana gizlice soru soruyor. Senin cevabını yalnızca kullanıcı görür veya duyar; müşteriye kullanıcı aktarır.',
    TONE[c.tone],
    format,
    'Kullanıcı hangi dilde sorduysa o dilde cevap ver (Türkçe veya İngilizce).',
    opts.grounded ? GROUNDED_RULE : KNOWLEDGE_RULE,
    SECTOR[product.sector],
    productBlock(product)
  ]
    .filter(Boolean)
    .join('\n\n')
}
