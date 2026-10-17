# Piqi — Ürün Gereksinim Dokümanı (PRD)

| | |
|---|---|
| **Sürüm** | 0.3 (taslak) |
| **Tarih** | 2026-10-16 |
| **Sahip** | Tuncer Bağcabaşı |
| **Durum** | İnceleme bekliyor |

---

## 1. Özet

Piqi, macOS üzerinde çalışan bir **canlı toplantı asistanıdır**. Teams, Zoom, Meet gibi toplantılarda karşı tarafın konuşmasını dinler. Sorulan bir soruyu algıladığında, kullanıcının önceden yüklediği ürün dokümanları, teknik bilgiler ve kod tabanı üzerinden **1–3 saniye içinde** kısa ve doğru bir cevap üretir. Cevabı ekranın üst ortasında, MacBook notch'unun altında Dynamic Island tarzı bir panelde gösterir. Kullanıcı bu cevabı okuyup müşteriye kendi cümleleriyle aktarır.

**Tek cümlelik değer önerisi:** _"Müşteri sorduğunda cevabı aramazsın; cevap zaten gözünün önündedir."_

---

## 2. Problem ve Hedefler

### 2.1 Problem
- Müşteri toplantılarında teknik veya ürüne özel sorular (konfigürasyon, API davranışı, limitler, mimari, fiyat ve paket detayı) anlık cevap bekler.
- Cevap genelde bir dokümanda, Confluence sayfasında ya da kodda vardır. Ama toplantı sırasında aramak hem zaman alır hem de profesyonel görünmez.
- "Dönüş yaparız" demek satış ve destek süreçlerini uzatır, güveni zedeler.

### 2.2 Hedefler (v1)
| # | Hedef | Ölçüt |
|---|---|---|
| H1 | Soruya hızlı cevap | Soru bitişinden ilk kelimenin görünmesine kadar **p50 ≤ 1,5 sn, p95 ≤ 3 sn** |
| H2 | Doğru ve kaynaklı cevap | Cevapların ≥ %85'i kullanıcı tarafından "doğru/kullanılabilir" olarak işaretlenir. Her cevap kaynak referansı taşır |
| H3 | Dikkati dağıtmayan arayüz | Panel tek bakışta okunur, ekran paylaşımında görünmez, toplantı uygulamasının önüne geçmez |
| H4 | Gizlilik | Ses varsayılan olarak cihazda işlenir. Ham ses kaydedilmez. API anahtarları Keychain'de tutulur |
| H5 | Sürdürülebilir mimari | Modüler yapı: STT, LLM, embedding ve konektör sağlayıcıları arayüz arkasında değiştirilebilir. Ekip sürümüne geçişte çekirdek yeniden yazılmaz |

### 2.3 Kapsam dışı (v1)
- Windows ve Linux desteği (mimari engellemez ama v1'de yok)
- Toplantıya bot olarak katılma (Piqi yalnızca yerel sesi dinler)
- Cevabı müşteriye otomatik söyleme veya yazma
- Ekip ve şirket özellikleri: ortak bilgi bankası, kullanıcı yönetimi, admin paneli (v2)
- Video ve ekran içeriği analizi

---

## 3. Kullanıcılar ve Senaryolar

### 3.1 Persona
**Çözüm Mimarı / Pre-sales / Teknik Danışman.** Haftada 5–15 müşteri toplantısına girer. Birden fazla ürün ve müşteri projesiyle çalışır. Hem Türkçe hem İngilizce toplantı yapar. Ekran paylaşımını sık kullanır.

### 3.2 Ana senaryolar
1. **Canlı soru-cevap:** Müşteri "Bu API'de rate limit kaç, aşınca ne oluyor?" diye sorar. Piqi soruyu algılar, workspace'teki API dokümanından ve koddaki `RateLimiter` sınıfından cevabı derler, notch'ta gösterir.
2. **Elle tetikleme:** Soru dolaylı sorulduğu için otomatik algılanmaz ("şu entegrasyon tarafı biraz kafamda oturmadı"). Kullanıcı `⌘⇧Space`'e basar, Piqi son 30 saniyelik konuşmaya göre cevap üretir.
3. **Toplantı öncesi hazırlık:** Kullanıcı "ACME Bank" workspace'ini seçer, Teams toplantısına girer, Piqi'yi başlatır.
4. **Toplantı sonrası:** Piqi otomatik özet ve aksiyon listesi çıkarır. Cevaplanamayan 3 soruyu listeler, kullanıcı bunları dokümana ekler.
5. **Ekran paylaşımı:** Kullanıcı ekranını paylaşırken panel ona görünmeye devam eder, müşteriye görünmez.

---

## 4. Ürün Prensipleri
1. **Bir bakışta okunur:** Kısa cevap en fazla 2 cümle ya da 3 madde olur. Detay istenirse açılır.
2. **Kaynak yoksa uydurma yok:** Bilgi bankasında karşılık yoksa Piqi bunu açıkça söyler ("Dokümanda bulunamadı, genel bilgi:" etiketiyle ayrıştırır).
3. **Sessiz varsayılan:** Gereksiz pop-up, ses veya animasyon yoktur. Panel yalnızca gerektiğinde genişler.
4. **Gizlilik önce gelir:** Cihaz dışına neyin çıktığı her an görünür ve ayarlanabilir.
5. **Değiştirilebilir parçalar:** Hiçbir sağlayıcıya (STT, LLM, vektör DB) kilitlenilmez.

---

## 5. Fonksiyonel Gereksinimler

Öncelik: **P0** = v1 için zorunlu, **P1** = v1'de olmalı, **P2** = sonraki sürüm.

### 5.1 Ses yakalama
| ID | Gereksinim | Öncelik |
|---|---|---|
| A-1 | Sistem sesini (karşı taraf) ve mikrofonu (kullanıcı) **iki ayrı kanal** olarak yakalama | P0 |
| A-2 | Kanal bazlı konuşmacı etiketi: mikrofon = "Ben", sistem sesi = "Karşı taraf". Soru algılama yalnızca karşı taraf kanalında çalışır | P0 |
| A-3 | Uygulama bazlı yakalama: yalnızca seçili uygulamaların (Teams, Zoom, Chrome/Meet) sesi dinlenir. Spotify gibi diğer sesler dahil edilmez | P1 |
| A-4 | Toplantı uygulaması açıldığında "Dinlemeye başlayayım mı?" önerisi | P1 |
| A-5 | Ham ses diske yazılmaz, yalnızca bellekte akış olarak işlenir | P0 |
| A-6 | Karşı taraf kanalında konuşmacı ayrımı (diarization: Konuşmacı 1, 2…) | P2 |

### 5.2 Konuşmayı metne çevirme (STT)
| ID | Gereksinim | Öncelik |
|---|---|---|
| S-1 | Gerçek zamanlı akış transkripsiyonu: ara sonuçlar ve kesinleşmiş sonuçlar ayrı ayrı | P0 |
| S-2 | Hibrit motor: **lokal** (varsayılan) ve **bulut** (opsiyonel) arasında ayarlardan geçiş | P0 |
| S-3 | TR ve EN otomatik dil algılama, cümle içinde dil karışımına (code-switching) tolerans | P0 |
| S-4 | Workspace bazlı özel sözlük: ürün adları ve teknik terimler STT'ye ipucu olarak verilir | P1 |
| S-5 | Bulut motoru hata verirse otomatik olarak lokale düşme | P1 |

### 5.3 Soru algılama
| ID | Gereksinim | Öncelik |
|---|---|---|
| Q-1 | Otomatik algılama: karşı taraf konuşması bittiğinde (sessizlik/VAD ile cümle sonu) sorunun algılanması | P0 |
| Q-2 | İki aşamalı algılama: (1) kural tabanlı ön filtre: `?`, TR soru ekleri `mı/mi/mu/mü`, soru kelimeleri `nasıl, neden, ne zaman, hangi, kaç`, EN `what/how/why/can/does/is…`, rica kalıpları `anlatır mısınız, could you`; (2) hızlı bir LLM sınıflandırıcı: "bu cevap bekleyen, bilgi bankasıyla ilgili bir soru mu?" | P0 |
| Q-3 | Elle tetikleme: global kısayol `⌘⇧Space` ile son N saniyelik konuşma (varsayılan 30 sn) üzerinden cevap | P0 |
| Q-4 | Hassasiyet ayarı: Düşük / Orta / Yüksek | P1 |
| Q-5 | Aynı veya benzer soru kısa sürede tekrar sorulursa yeni cevap üretilmez, önceki cevap öne çıkarılır | P1 |
| Q-6 | Kullanıcının kendi sorduğu sorular cevaplanmaz (mikrofon kanalı hariç tutulur) | P0 |

### 5.4 Bilgi bankası (Workspace ve Kaynaklar)
| ID | Gereksinim | Öncelik |
|---|---|---|
| K-1 | Workspace oluşturma, düzenleme, silme. Her workspace'in kendi kaynakları, sistem talimatı ("Biz X firmasıyız, ürünümüz…"), sözlüğü ve dil tercihi olur | P0 |
| K-2 | Aktif workspace seçimi: menü çubuğundan ve notch panelinden hızlı geçiş | P0 |
| K-3 | **Dosya kaynakları:** PDF, DOCX, PPTX, XLSX, MD, TXT, HTML. Sürükle-bırak ile ekleme | P0 |
| K-4 | **Kod reposu:** yerel klasör veya Git URL. `.gitignore`'a uyulur. Dil farkındalıklı parçalama (fonksiyon/sınıf bazlı, tree-sitter) | P0 |
| K-5 | **Serbest notlar ve SSS:** uygulama içi editörle "soru → onaylı cevap" çiftleri. Arama sonuçlarında en yüksek önceliği alır | P0 |
| K-6 | **Web URL:** tek sayfa veya site haritası üzerinden içerik çekme | P1 |
| K-7 | **Confluence** (Cloud ve Data Center) ve **Notion** konektörleri: space/sayfa seçimi, token ile kimlik doğrulama | P1 |
| K-8 | Artımlı indeksleme: dosya izleme (watcher) ve periyodik senkron. Yalnızca değişen parçalar yeniden işlenir | P1 |
| K-9 | İndeksleme durumu: kaynak başına parça sayısı, son senkron zamanı, hata listesi | P0 |
| K-10 | "Bilgi bankasına sor" test ekranı: toplantı olmadan soru sorup cevap kalitesini deneme | P0 |

### 5.5 Cevap üretme
| ID | Gereksinim | Öncelik |
|---|---|---|
| R-1 | **Katmanlı cevap:** (a) Kısa cevap: 1–2 cümle, akışla (streaming) gelir; (b) Detay: madde madde açıklama, varsa kod örneği, kaynak referansları. Detay arka planda hazırlanır, panel genişletilince gösterilir | P0 |
| R-2 | Hibrit arama: vektör (anlamsal) ve anahtar kelime (BM25/FTS) birlikte, sonra yeniden sıralama (rerank) | P0 |
| R-3 | Bağlam: soru, son 2–3 dakikalık transkript, workspace talimatı ve en alakalı parçalar | P0 |
| R-4 | Cevap dili, sorunun sorulduğu dille aynıdır. Teknik terimler çevrilmez | P0 |
| R-5 | Kaynak referansları: `dosya.pdf · s.12`, `src/auth/RateLimiter.ts:42`, Confluence sayfa adı. Tıklanınca kaynak açılır | P0 |
| R-6 | Güven göstergesi: "Kaynaktan" (yeşil), "Kısmen kaynaktan" (sarı), "Genel bilgi, kaynakta yok" (gri) | P0 |
| R-7 | Model kademelendirme: kısa cevap ve sınıflandırma hızlı/ucuz modelle, detay güçlü modelle yapılır. Her ikisi ayarlanabilir | P0 |
| R-8 | Geri bildirim: 👍 / 👎 / "Bunu SSS'ye ekle" (cevabı düzenleyip onaylı cevaba çevirme) | P1 |
| R-9 | Cevabı panoya kopyalama (`⌘⇧C`) | P1 |

### 5.6 Toplantı geçmişi ve sonrası
| ID | Gereksinim | Öncelik |
|---|---|---|
| M-1 | Her toplantı kaydı: tarih, süre, workspace, konuşmacı etiketli transkript | P0 |
| M-2 | Soru/Cevap zaman çizelgesi: algılanan soru, üretilen cevap, kaynaklar, geri bildirim | P0 |
| M-3 | Toplantı bitiminde otomatik özet: konuşulan konular, kararlar, aksiyonlar (sorumlu ve tarih varsa) | P0 |
| M-4 | **Cevaplanamayan sorular** listesi (güven seviyesi gri veya 👎 alanlar). Workspace bazında toplanır ve "doküman eksikleri" panosu oluşur | P0 |
| M-5 | Toplantılar arasında tam metin arama | P1 |
| M-6 | Özet ve aksiyonları Markdown olarak dışa aktarma ve kopyalama | P1 |
| M-7 | Saklama politikası: transkriptler X gün sonra silinsin (varsayılan: süresiz, ayarlanabilir) | P1 |

### 5.7 Sesli asistan: "Selam Piqi"
Piqi yalnızca karşı tarafın sorularına cevap vermez; kullanıcı da Piqi'yle sesli veya yazılı konuşabilir.

| ID | Gereksinim | Öncelik |
|---|---|---|
| V-1 | Uyandırma ifadesi: mikrofon kanalında "Selam Piqi" (varyantlar: "Hey Piqi", "Merhaba Piqi") cihaz üzerinde algılanır. Karşı taraf kanalında asla tetiklenmez | P0 |
| V-2 | Uyandırma ifadesinden sonraki cümle soru/komut olarak alınır. Cümle aynı nefeste gelmezse Piqi 6 sn dinler | P0 |
| V-3 | Cevap Island'da yazılı akar. Sesli okuma kuralı: **Otomatik** (toplantı uygulaması ses üretirken sessiz, değilse sesli) / Her zaman / Asla | P0 |
| V-4 | Piqi'nin kendi sesi sistem sesi yakalamasından hariç tutulur. Piqi konuşurken mikrofon transkripti yok sayılır (yankı koruması) | P0 |
| V-5 | `⌘⇧K` ile yazılı sor: Island içinde arama kutusu, mikrofon butonu, "Toplantı bağlamı: son 2 dk" ve "Detaylı cevap" seçenekleri. Esc kapatır | P0 |
| V-6 | Sesli komutlar: "dur" / "tamam" (konuşmayı keser), "prova yapalım" (prova modunu başlatır) | P1 |
| V-7 | Konuşma tanıma: varsayılan Apple cihaz üzerinde tanıma (tr-TR, en-US). Ses cihazdan çıkmaz | P0 |

### 5.8 Prova modu (toplantı öncesi alıştırma)
Kullanıcı toplantıdan önce müşteri rolündeki Piqi'yle sesli prova yapar.

| ID | Gereksinim | Öncelik |
|---|---|---|
| P-1 | Başlatma: "Selam Piqi, prova yapalım", Island'dan veya ana penceredeki **Prova** sayfasından | P0 |
| P-2 | Müşteri personası ürün bazında tanımlanır: ad, rol, tarz (ör. "Elif Kaya, ACME Bank BT müdürü, teknik ve şüpheci") ve odak konuları | P0 |
| P-3 | Döngü: persona tek soru sorar (sesli) → kullanıcı sesli cevaplar (1,5 sn sessizlikte cevap biter) → Piqi kısa geri bildirim verir (doğruluk, eksik nokta, sunum ipucu) → sonraki soru | P0 |
| P-4 | "Bitir" denince veya soru sayısı dolunca karne: genel puan, güçlü yönler, geliştirilecek noktalar, soru bazında değerlendirme | P0 |
| P-5 | Prova geçmişi ürün bazında saklanır, ürünler arası paylaşılmaz (izole hafıza) | P1 |
| P-6 | Zorluk: Kolay / Gerçekçi / Zorlayıcı | P1 |
| P-7 | Bilgi bankası (M2) hazır olduğunda sorular ve değerlendirme kaynaklara dayanır; o zamana kadar ürün talimatı ve genel bilgi kullanılır ve bu durum arayüzde belirtilir | P0 |

### 5.9 Ürünler ve karakterler
Workspace kavramı arayüzde **ürün** olarak geçer. Her ürünün kendine ait şunları vardır: bir **karakteri** (Piqi'nin o üründeki adı ve tonu, ör. "Gece, teknik mimar"), talimatı, konuşma tanıma sözlüğü, prova personası, kaynakları ve **izole hafızası** (SSS, toplantılar, provalar, geri bildirimler). Toplantıda yalnızca aktif ürünün hafızası kullanılır.

### 5.10 Çoklu model sağlayıcı
| ID | Gereksinim | Öncelik |
|---|---|---|
| L-1 | Üç adaptör tüm sağlayıcıları kapsar: **Anthropic** (Claude Opus/Sonnet/Haiku), **Google Gemini** (4 Argon, 3.8 Flash, 3.6 Flash, 3.5/3.1 Flash-Lite, önizlemeler) ve **OpenAI uyumlu** (OpenAI, Qwen/QwenCloud, DeepSeek, Mistral, Ollama, kurum içi vLLM/LM Studio) | P0 |
| L-2 | Model listesi sağlayıcının API'sinden canlı çekilir (Gemini alt modelleri dahil). Liste alınamazsa önerilen modeller gösterilir, model kimliği elle de girilebilir | P0 |
| L-3 | Yapılandırılmış çıktı (prova değerlendirmesi, karne) her sağlayıcıda JSON Schema ile istenir ve zod ile doğrulanır. Desteklemeyen sunucularda `json_object`'e düşülür | P0 |
| L-4 | Qwen3 gibi modellerin `<think>` bölümleri akış sırasında gizlenir | P1 |
| L-5 | Her sağlayıcının anahtarı ayrı ayrı Keychain'de şifreli saklanır. Ortam değişkeniyle de verilebilir | P0 |

### 5.11 Bankacılık uyumu
| ID | Gereksinim | Öncelik |
|---|---|---|
| B-1 | **Veri politikası:** bulut modellerine izin, kişisel veri maskeleme, denetim kaydı. Varsayılan: bulut açık, maskeleme açık, denetim açık | P0 |
| B-2 | **MDM ile yönetilen politika:** `/Library/Application Support/Piqi/policy.json` (Jamf/Intune ile dağıtılır). Ayarları ezer ve kilitler; izinli sağlayıcılar listesi ve varsayılan kurum içi sunucu tanımlanabilir. Dosya bozuksa en kısıtlayıcı politika uygulanır | P0 |
| B-3 | **Maskeleme (DLP):** buluta giden her metinde TCKN, VKN, IBAN, kart numarası, telefon ve e-posta, sağlama algoritmalarıyla doğrulanarak «TÜR-n» belirteçlerine çevrilir. Cevaptaki belirteçler yalnızca cihazda geri çevrilir. Kurum içi sağlayıcılarda maskeleme gerekmez | P0 |
| B-4 | **Denetim kaydı:** her model çağrısı içeriksiz olarak aylık JSONL dosyalarına yazılır: zaman, amaç, ürün, sağlayıcı, model, konum, karakter sayıları, maskelenen veri türleri, süre ve sonuç. SIEM'e aktarılabilir | P0 |
| B-5 | **Sektör ayarı (ürün bazında):** Genel / Bankacılık / Katılım bankacılığı. Katılım modunda "faiz" yerine "kâr payı" denir; murabaha, mudaraba, icara, sukuk vb. doğru kullanılır ve konuşma tanımaya ipucu olarak verilir. Danışma Komitesi, BDDK ve KVKK konularında kesin hüküm verilmez | P0 |
| B-6 | BDDK'nın birincil/ikincil sistemlerin yurt içinde tutulması beklentisi için önerilen kurulum: kurum içi vLLM/Ollama üzerinde açık ağırlıklı model (ör. Qwen) ve bulutun politika ile kapatılması | P0 |

### 5.12 Toplantıdaki kişiler (konuşmacı ayrımı)
| ID | Gereksinim | Öncelik |
|---|---|---|
| D-1 | Karşı taraf kanalında kaç farklı kişinin konuştuğu cihaz üzerinde ayırt edilir (FluidAudio LS-EEND, en fazla 10 kişi). Tanınmayan kişiler "Konuşmacı N" olarak gösterilir | P0 |
| D-2 | Her transkript cümlesi, söylendiği aralıkta en çok konuşan kişiye atanır. Toplantı bağlamı "Konuşmacı 2: …" / "Elif: …" biçiminde modele verilir | P0 |
| D-3 | Kullanıcı toplantı sırasında konuşmacılara ad verebilir. Adlar ve numaralar yalnızca o dinleme oturumunda yaşar | P0 |
| D-4 | **KVKK:** ses izi (biyometrik veri) saklanmaz ve dışarı verilmez. Kalıcı ses profili v1 kapsamı dışındadır; ileride yalnızca açık rızayla eklenebilir | P0 |
| D-5 | Bilinen kısıt: birbirine çok benzeyen sesler aynı kişi sanılabilir (sentetik seslerle yapılan testte 5 cümlenin 4'ü doğru atandı). Ad verme ile düzeltilir | — |

### 5.13 Seslendirme motorları
| ID | Gereksinim | Öncelik |
|---|---|---|
| T-1 | **EMA Lightning** (Apache-2.0, 8,6M parametre, Türkçe): ONNX Runtime üzerinde çalışan `piqi-tts` yan süreciyle cihaz üzerinde. Model (~35 MB) ilk kullanımda indirilir ve SHA-256 ile doğrulanır. Ölçüm: M serisi CPU'da 7,7 sn ses 0,24 sn'de üretiliyor | P0 |
| T-2 | **Apple** (sistem sesleri): İngilizce cümlelerde ve yedek olarak | P0 |
| T-3 | Üretilen ses yardımcı süreçte çalınır. Böylece Piqi'nin sesi sistem sesi yakalamasından hariç tutulur ve mikrofon susturulur | P0 |

### 5.14 Marka ve hareket
- **Simge:** "Dinleyen sekiz nokta, ortada cevap veren bir nokta." Geometri tek kaynaktan (`src/shared/brand.ts`) üretilir: arayüz SVG'si, menü çubuğu ikonu ve uygulama ikonu (.icns).
- **Canlı durumlar:** boşta (gri, nefes alır), dinliyor (halkada dalga dolaşır), düşünüyor (parlaklık döner), cevap hazır (merkez belirir). Menü çubuğunda dinlerken kırmızı nokta görünür.
- **Açılış:** ana pencerede noktalar merkezden halkaya dağılır, ardından "piqi" yazısı ve slogan gelir. Island notch'tan "piqi · <ad> hazır" selamıyla çıkar.
- **Geçişler:** sayfa değişimleri, açılır paneller ve Island boyutları yay (spring) animasyonludur. "Hareketi azalt" sistem ayarına uyulur.
- **Ürün bazlı isim:** her ürünün Piqi'sinin kendi adı vardır ("Selam Gece"). Yeni ürünlere kullanılmamış bir ad önerilir; "Selam Piqi" her zaman çalışır.

---

## 6. Kullanıcı Arayüzü

### 6.0 Tasarım sistemi
Kaynak: Claude Design'daki "Piqi — Uygulama Tasarımı" canvas'ı.

| Token | Açık | Koyu |
|---|---|---|
| Zemin | `#F6F5F1` | `#131316` |
| Kenar çubuğu / başlık çubuğu | `#EDECE7` | `#0E0E10` |
| Kart | `#FFFFFF` | `#1C1C20` |
| Çizgi | `#DAD8D1` | `#2C2C32` |
| Metin / ikincil | `#16161A` / `#6A6A72` | `#F2F2F0` / `#9A9AA2` |
| Birincil buton | `#16161A` zemin, beyaz metin | `#F2F2F0` zemin, koyu metin |
| Vurgu (lime) | `#C8F169` (metin `#11130A`) | aynı |
| Canlı | `#FF5A4F` | aynı |
| Güven: kaynaktan / kısmen / genel | `#17632F` on `#DDF5E4` · `#6B4E00` on `#FFF0C2` · gri | `#6EE79A` · `#F0C94A` · `#B4BAC4` |
| Island | `#0E0E10` gövde, notch `#000`, düğmeler `#1E1F23` | — |

Tipografi: **DM Sans** (arayüz), **JetBrains Mono** (kod, kısayol, kaynak yolu, süre). Başlık 28/700, gövde 14–15, Island kısa cevap 20/500. Köşe yarıçapları: buton 10, kart 12–14, Island alt köşeler 22–30.

### 6.1 Bileşenler
1. **Notch paneli (Island):** Ana canlı arayüz. Ekranın üst ortasında, notch'un hemen altına yapışık duran, şeffaf ve çerçevesiz bir pencere. Notch'suz ekranlarda menü çubuğunun altında aynı konumda durur.
2. **Menü çubuğu ikonu (Tray):** Dinlemeyi başlatma/durdurma, aktif workspace, son cevaplar, ana pencereyi açma.
3. **Ana pencere:** Workspace'ler, Kaynaklar, Toplantılar, Ayarlar.
4. **İlk kurulum sihirbazı (Onboarding):** İzinler, model/sağlayıcı seçimi, ilk workspace ve ilk kaynak.

### 6.2 Notch paneli durumları
```
Boşta           ╭──────────────╮            (notch genişliğinde ince hap; çoğu zaman görünmez)
                ╰──────────────╯

Dinliyor        ╭─● ACME ─────── ▁▃▅▃▁ ─╮   (kırmızı nokta + workspace adı + ses dalgası)
                ╰────────────────────────╯

Soru algılandı  ╭─ ◌ "Rate limit kaç ve aşılırsa ne olur?" ─╮   (hafif nabız animasyonu)
                ╰───────────────────────────────────────────╯

Kısa cevap      ╭──────────────────────────────────────────────────╮
                │ ❓ Rate limit kaç ve aşılırsa ne olur?             │
                │                                                  │
                │ Dakikada 600 istek/API key. Aşılırsa 429 döner,  │
                │ Retry-After header'ı ile bekleme süresi verilir. │
                │                                                  │
                │ ● Kaynaktan · API-Guide.pdf s.14  ⌄ Detay  👍 👎 │
                ╰──────────────────────────────────────────────────╯

Detay (genişlemiş) → maddeler, kod bloğu, kaynak listesi; en fazla ~%45 ekran yüksekliği, kaydırılabilir
```

### 6.3 Etkileşim kuralları
- Panel **odak çalmaz**: açılınca toplantı uygulamasından klavye odağını almaz (non-activating panel).
- Fare üzerine gelince genişler, ayrılınca 8 sn sonra kısa cevaba döner, 60 sn sonra "Dinliyor" durumuna küçülür. Sabitle (📌) seçeneği vardır.
- Yeni bir soru gelirse önceki cevap panel içindeki küçük bir geçmiş şeridine (◀ ▶) itilir.
- Tüm Space'lerde ve tam ekran uygulamaların üstünde görünür.
- **Ekran paylaşımında gizli:** varsayılan açık, ayarlardan kapatılabilir.
- Açık ve koyu tema. Panel her zaman koyu "island" görünümündedir, ana pencere sistem temasını izler.
- Erişilebilirlik: yazı boyutu ayarı (S/M/L), yüksek kontrast, animasyonu azalt ayarına uyum.

### 6.4 Klavye kısayolları (global, değiştirilebilir)
| Kısayol | İşlev |
|---|---|
| `⌘⇧Space` | Şimdi cevapla (son 30 sn) |
| `⌘⇧L` | Dinlemeyi başlat/durdur |
| `⌘⇧E` | Paneli genişlet/daralt |
| `⌘⇧C` | Son cevabı kopyala |
| `⌘⇧H` | Paneli gizle/göster |
| `⌘⇧K` | Piqi'ye sor (yazılı/sesli) |
| `⌘⇧P` | Prova başlat/bitir |
| `⌘⇧W` | Workspace değiştir |

### 6.5 Ana pencere ekranları
- **Workspace'ler:** liste, oluştur, talimat ve sözlük düzenle, aktif yap.
- **Kaynaklar:** workspace içindeki kaynak kartları (tür, durum, parça sayısı, son senkron), ekle, yeniden indeksle, sil. "Bilgi bankasına sor" test alanı.
- **Toplantılar:** liste → detay (transkript | S/C zaman çizelgesi | özet ve aksiyonlar | cevaplanamayanlar).
- **Doküman eksikleri:** workspace bazında cevaplanamayan sorular → "SSS'ye cevap yaz" akışı.
- **Ayarlar:** Genel, Ses (cihazlar, dinlenecek uygulamalar), STT, Modeller ve Sağlayıcılar, Gizlilik, Kısayollar, Hakkında/Güncellemeler.

---

## 7. Teknik Mimari

### 7.1 Teknoloji yığını
| Katman | Seçim | Gerekçe |
|---|---|---|
| Uygulama kabuğu | **Electron** (güncel kararlı sürüm) + **electron-vite** | Hızlı geliştirme, web UI, geniş ekosistem |
| Dil | **TypeScript** (strict) | Tip güvenliği, sürdürülebilirlik |
| UI | **React** + **Tailwind CSS** + **Radix UI** primitive'leri + **Framer Motion** | Erişilebilir bileşenler, island animasyonları |
| Durum yönetimi | **Zustand** (UI), main process'te servis katmanı | Basit, test edilebilir |
| Ses yakalama | **Swift yardımcı süreç (`piqi-audio`)**: Core Audio Process Tap (macOS 14.4+) / ScreenCaptureKit + AVAudioEngine (mic) | Uygulama bazlı sistem sesi yakalama, sanal ses sürücüsü gerektirmez |
| Lokal STT | **whisper.cpp** (Metal hızlandırmalı, sidecar) — alternatif: Apple SpeechAnalyzer (macOS 26+, Swift helper içinde) | Türkçe desteği, cihaz üzerinde |
| Bulut STT | Deepgram (varsayılan bulut seçeneği), Azure Speech, AssemblyAI — adaptör ile | Düşük gecikme, çok dilli akış |
| VAD | Silero VAD (ONNX) | Cümle sonu ve sessizlik tespiti |
| LLM | **Vercel AI SDK (`ai`)** üzerinden: Anthropic Claude, OpenAI, Azure OpenAI, Ollama (lokal) | Tek arayüz, sağlayıcıdan bağımsız, streaming |
| Embedding | Adaptör: lokal `bge-m3` / `multilingual-e5` (ONNX, transformers.js) veya bulut (Voyage, OpenAI) | TR+EN çok dilli kalite |
| Rerank | Opsiyonel: lokal cross-encoder veya bulut (Cohere/Voyage rerank) | İsabet artışı |
| Veritabanı | **SQLite** (`better-sqlite3`) + **sqlite-vec** (vektör) + **FTS5** (tam metin) | Tek dosya, gömülü, hibrit arama |
| Doküman ayrıştırma | `pdfjs-dist`, `mammoth` (DOCX), `officeparser` (PPTX/XLSX), `@mozilla/readability` (web) | Saf JS, sidecar gerektirmez |
| Kod ayrıştırma | **tree-sitter** (`web-tree-sitter` + dil gramerleri) | Fonksiyon/sınıf bazlı parçalama |
| Gizli anahtarlar | Electron `safeStorage` (macOS Keychain) | Anahtarlar düz metin olarak tutulmaz |
| Paketleme | **electron-builder**, Developer ID imzalama + notarization, `electron-updater` | Dağıtım ve otomatik güncelleme |
| Test | Vitest (birim), Playwright for Electron (E2E), RAG değerlendirme seti | Kalite güvencesi |

### 7.2 Süreç mimarisi
```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Electron Main Process                          │
│                                                                          │
│  SessionOrchestrator ── AudioService ── TranscriptionService ──┐         │
│         │                    │                 │               │         │
│         │            piqi-audio (Swift)   STT Adapters         ▼         │
│         │            stdout: PCM 16kHz    (whisper.cpp |  QuestionDetector│
│         │            2 kanal (me/them)     Deepgram | …)       │         │
│         ▼                                                      ▼         │
│   MeetingRepository ◄──────────────────────────────────── AnswerEngine   │
│         │                                                 │   │          │
│         ▼                                     Retriever ◄─┘   └► LLM     │
│   SQLite (+vec, FTS5) ◄── IndexingService (utilityProcess)       Adapters│
│                               │                                          │
│                     Connectors: Files | Code | Web | Confluence | Notion │
│                                                                          │
│  WindowManager ── IslandWindow (notch) · MainWindow · Tray · Shortcuts   │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ typed IPC (contextBridge, zod doğrulamalı)
     ┌─────────┴──────────┐
     │ Renderer: Island   │   Renderer: Main (Workspace, Kaynaklar, Toplantılar, Ayarlar)
     └────────────────────┘
```

- **Main process** yalnızca orkestrasyon yapar. Ağır işler (indeksleme, embedding, parse) `utilityProcess` içinde çalışır, böylece UI takılmaz.
- **piqi-audio** bağımsız, imzalı bir Swift CLI'dır. JSON kontrol komutlarını stdin'den alır, kanal etiketli PCM çerçevelerini stdout'tan akıtır. İleride Windows için aynı protokolü konuşan bir `piqi-audio.exe` yazılabilir.
- Renderer'lar `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` ile çalışır. Tüm IPC kanalları tek bir şemadan üretilir.

### 7.3 Canlı akış (pipeline) ve gecikme bütçesi
```
Karşı taraf konuşur
  → piqi-audio (20 ms çerçeveler)
  → VAD: konuşma bitti (sessizlik ≥ 600 ms)                       ~600 ms
  → STT final segment                                             ~200–500 ms
  → QuestionDetector: kural filtresi (<5 ms) + hızlı LLM sınıflandırma ~300 ms
  → Retriever: sorgu yeniden yazma (konuşma bağlamıyla) + hibrit arama + rerank  ~150–300 ms
  → AnswerEngine: hızlı model, kısa cevap stream → ilk token      ~400 ms
  → Island'da görünür
                                         Toplam ilk token hedefi: p50 ≤ 1,5 sn (soru bitişinden)
  ∥ paralel: güçlü model → detay cevap (panel genişletildiğinde hazır)
```
**Optimizasyonlar**
- Spekülatif başlatma: kural filtresi güçlü bir soru sinyali verirse retrieval, sınıflandırma sonucu beklenmeden başlar.
- Workspace talimatı ve SSS içeriği için LLM prompt caching (sağlayıcı destekliyorsa).
- Embedding modeli ve vektör indeksi uygulama açılışında belleğe ısıtılır.

### 7.4 Retrieval (RAG) tasarımı
- **Parçalama:**
  - Dokümanlar: başlık hiyerarşisine saygılı, ~500–800 token, %10–15 örtüşme.
  - Kod: tree-sitter ile fonksiyon/sınıf/metot birimleri. Dosya yolu, sembol adı, imza ve docstring metaveri olarak tutulur. Büyük birimler alt parçalara bölünür.
  - SSS: her soru-cevap çifti tek parçadır ve sıralamada `boost` alır.
- **Sorgu:** soru + son konuşma bağlamı → bağımsız bir arama sorgusuna yeniden yazılır (TR/EN çift sorgu opsiyonel).
- **Arama:** vektör top-k=20 ∪ FTS5 top-k=20 → Reciprocal Rank Fusion → (opsiyonel rerank) → top 6–8 parça.
- **Cevap promptu:** yalnızca verilen kaynaklarla cevap ver; kaynak yoksa açıkça belirt; kısa formatta 2 cümle; kaynak ID'lerini işaretle → UI'da referansa dönüştür.
- **Değerlendirme:** her workspace için "altın soru seti" (soru → beklenen kaynak/cevap). Recall@k ve cevap doğruluğu CI'da ve uygulama içinden ölçülebilir.

### 7.5 Veri modeli (özet)
```
workspaces(id, name, instructions, glossary_json, language_pref, created_at, updated_at)
sources(id, workspace_id, type[file|code|web|confluence|notion|note], config_json,
        status, last_synced_at, error)
documents(id, source_id, uri, title, hash, mime, updated_at)
chunks(id, document_id, ordinal, text, meta_json[page|path|line_start|line_end|symbol], token_count)
chunk_vectors  -- sqlite-vec sanal tablo (chunk_id, embedding)
chunks_fts     -- FTS5 sanal tablo (text, title)
faq(id, workspace_id, question, answer, created_from_meeting_id, updated_at)
meetings(id, workspace_id, title, app, started_at, ended_at, summary_md, actions_json)
transcript_segments(id, meeting_id, channel[me|them], speaker, text, lang, t_start, t_end)
qa_events(id, meeting_id, segment_id, question, short_answer, detail_answer, sources_json,
          confidence[grounded|partial|general], trigger[auto|manual], latency_ms, feedback)
settings(key, value_json)
```
- Embedding modeli değişirse workspace yeniden indekslenir. Hangi modelle üretildiği her vektör tablosunda tutulur.
- Şema göçleri (migration) sürümlü ve ileri yönlüdür.

### 7.6 Sağlayıcı soyutlamaları (genişletilebilirlik)
```ts
interface SttProvider      { start(opts): AsyncIterable<TranscriptEvent>; stop(): Promise<void> }
interface LlmProvider      { stream(req): AsyncIterable<Token>; complete(req): Promise<string> }
interface EmbeddingProvider{ embed(texts: string[]): Promise<Float32Array[]>; dims: number; id: string }
interface Connector        { id; list(cfg): AsyncIterable<DocRef>; fetch(ref): Promise<RawDoc>; watch?(cfg, cb) }
interface Reranker         { rerank(query, chunks): Promise<ScoredChunk[]> }
```
Yeni bir sağlayıcı veya konektör eklemek, çekirdeğe dokunmadan bir adaptör yazıp registry'ye kaydetmekle yapılır.

### 7.7 Ekip sürümüne hazırlık (v2 için şimdiden alınan kararlar)
- Tüm veri erişimi **Repository arayüzleri** üzerinden yapılır (v1: SQLite. v2: uzak API veya senkron).
- Kayıtlarda `id` için UUIDv7 ve `updated_at` alanları kullanılır: ileride senkron ve çakışma çözümüne uygun.
- Workspace'lerde `owner` ve `visibility` alanları için yer ayrılır (v1'de tek değer).
- Konektör kimlik bilgileri kullanıcı bazlıdır. Ortak workspace'te bile token paylaşılmaz.

---

## 8. Gizlilik, Güvenlik ve Uyumluluk
| Konu | Karar |
|---|---|
| Ham ses | Diske yazılmaz. Lokal STT'de cihazdan çıkmaz |
| Bulut kullanımı | Hangi verinin hangi sağlayıcıya gittiği Ayarlar > Gizlilik'te açıkça listelenir. "Tam lokal mod" tek tuşla açılır (lokal STT + Ollama + lokal embedding) |
| Anahtarlar | `safeStorage` / Keychain. Loglarda maskelenir |
| Veri konumu | `~/Library/Application Support/Piqi/` (SQLite + indeks). Opsiyonel FileVault uyarısı |
| Ekran paylaşımı | Panel penceresi içerik korumalıdır (`setContentProtection(true)`). Bazı macOS sürümleri ve yakalama yöntemleri bunu yok sayabilir; test matrisi ve kullanıcıya uyarı gerekir (bkz. Riskler) |
| Yasal | KVKK/GDPR: toplantıyı dinlemek ve yazıya dökmek katılımcıların bilgilendirilmesini gerektirebilir. Onboarding'de bilgilendirme ve sorumluluk metni, toplantı başlarken opsiyonel hatırlatma |
| Telemetri | Varsayılan kapalı. Açılırsa yalnızca anonim performans metrikleri (gecikme, hata kodları) gönderilir, içerik asla |
| Electron güvenliği | contextIsolation, sandbox, CSP, uzaktan içerik yüklenmez, `will-navigate` engellenir, imzalı ve notarize dağıtım |

---

## 9. macOS İzinleri
| İzin | Neden | Ne zaman istenir |
|---|---|---|
| Mikrofon | Kullanıcının sesi ("Ben" kanalı) | Onboarding |
| Sistem Sesi Kaydı / Ekran Kaydı | Toplantı uygulamasının sesi | Onboarding (macOS sürümüne göre hangisi gerekiyorsa) |
| Erişilebilirlik (opsiyonel) | Aktif toplantı uygulamasını algılama | İlk otomatik algılama özelliği açıldığında |

İzin reddedilirse ilgili ekranda nedeni ve "Sistem Ayarları'nı aç" butonu gösterilir.

---

## 10. Fonksiyonel Olmayan Gereksinimler
| Alan | Hedef |
|---|---|
| Gecikme | İlk token p50 ≤ 1,5 sn, p95 ≤ 3 sn (bulut LLM, iyi bağlantı) |
| Kaynak kullanımı | Dinleme sırasında ortalama CPU ≤ %15 (Apple Silicon, lokal STT hariç), RAM ≤ 600 MB |
| İndeksleme | 1.000 sayfalık PDF ≤ 3 dk. 100k satırlık repo ≤ 5 dk (lokal embedding, M-serisi) |
| Kararlılık | 2 saatlik toplantıda çökme ve bellek sızıntısı olmaz. Helper süreç çökerse otomatik yeniden başlatılır |
| Çevrimdışı | Tam lokal mod internetsiz çalışır |
| Desteklenen sistemler | macOS 14.4+ (Apple Silicon öncelikli, Intel en iyi çaba) |

---

## 11. Başarı Metrikleri
- **Cevap kullanılabilirlik oranı:** 👍 / (👍 + 👎) ≥ %85
- **Kaynaklı cevap oranı:** "Kaynaktan" etiketli cevaplar ≥ %70
- **Yanlış alarm oranı:** otomatik algılanıp kullanıcının kapattığı/görmezden geldiği cevaplar ≤ %20
- **Gecikme:** bkz. §10
- **Doküman eksikleri kapanma oranı:** cevaplanamayan soruların SSS'ye dönüşme oranı (ürünün zamanla iyileştiğini gösterir)

---

## 12. Yol Haritası

| Faz | İçerik | Çıkış kriteri |
|---|---|---|
| **M0 — Teknik spike** | Electron iskeleti, notch penceresi (konum, şeffaflık, içerik koruma), `piqi-audio` ile Teams/Zoom ses yakalama (2 kanal) | Teams toplantısının sesi kanal ayrımıyla yakalanıyor; panel paylaşımda görünmüyor |
| **M1 — Canlı transkript** | STT adaptörleri (whisper.cpp + Deepgram), VAD, Island'da canlı altyazı (debug modu) | TR/EN karışık konuşma ≤ 1 sn gecikmeyle yazıya dökülüyor |
| **M2 — Bilgi bankası** | Workspace, dosya/kod/SSS kaynakları, indeksleme, hibrit arama, "Bilgi bankasına sor" ekranı | Altın soru setinde Recall@8 ≥ %85 |
| **M3 — Canlı cevap** | Soru algılama, AnswerEngine, katmanlı cevap, kaynaklar, kısayollar, geri bildirim | Uçtan uca hedef gecikme sağlanıyor; gerçek toplantıda dogfooding |
| **M4 — Toplantı sonrası** | Geçmiş, özet ve aksiyonlar, cevaplanamayanlar, arama | 1 hafta gerçek kullanım |
| **M1.5 — Sesli asistan ve prova** | Apple cihaz üzerinde konuşma tanıma (iki kanal), "Selam Piqi", `⌘⇧K` sor, TTS, prova modu ve karne, ürün/karakter yönetimi, yeni tasarım | Prova akışı baştan sona sesli çalışıyor |
| **M1.6 — Kurumsal ve çok modelli** | Çoklu sağlayıcı (Claude, Gemini, Qwen, OpenAI uyumlu, kurum içi), veri politikası ve MDM, PII maskeleme, denetim kaydı, katılım bankacılığı modu, konuşmacı ayrımı, EMA Lightning TTS, marka ve animasyonlar | Kurum içi bir model ve bulut kapalıyken uçtan uca çalışıyor |
| **M5 — Konektörler ve cila** | Web, Confluence, Notion; onboarding; ayarlar; imzalama, notarization, otomatik güncelleme | v1.0 sürümü |
| **v2** | Ekip: ortak workspace, backend senkron, admin, SSO; Windows; diarization | — |

---

## 13. Riskler ve Önlemler
| Risk | Etki | Önlem |
|---|---|---|
| Electron'da sistem sesi yakalama kısıtları | Yüksek | Native Swift helper ile ayrıştırıldı. Electron loopback API'si yedek yol olarak tutulur |
| İçerik korumasının (ekran paylaşımında gizleme) bazı macOS/paylaşım yöntemlerinde çalışmaması | Yüksek | M0'da test matrisi (Teams, Zoom, Meet × tam ekran/pencere paylaşımı × macOS 14/15/26). Çalışmayan durumlarda kullanıcıya uyarı ve "paylaşımda paneli otomatik gizle" seçeneği |
| Türkçe STT doğruluğu (teknik terimler) | Orta | Workspace sözlüğü ve ipuçları, bulut STT seçeneği, LLM ile sorgu düzeltme |
| Yanlış soru algılama (gürültü) | Orta | İki aşamalı algılama, hassasiyet ayarı, Q-5 tekrar bastırma |
| Halüsinasyon | Yüksek | Kaynak zorunlu prompt, güven etiketi, "kaynakta yok" açıklığı, değerlendirme seti |
| Gecikme hedefinin kaçması | Orta | Spekülatif retrieval, hızlı model, prompt caching, ısıtılmış indeks |
| Native modüllerin (better-sqlite3, sqlite-vec, tree-sitter) Electron ile derlenmesi | Düşük | `electron-rebuild`, CI'da arm64 ve x64 build |

---

## 14. Açık Sorular
1. Varsayılan LLM sağlayıcısı ve modeli ne olacak? (Öneri: Claude — kısa cevap için hızlı model, detay için güçlü model.)
2. Bulut STT seçeneği eklenecekse hangi sağlayıcı varsayılan olmalı?
3. İmzalı dağıtım ve otomatik güncelleme hangi kanaldan yapılacak (GitHub Releases, Homebrew cask)?

---

## 15. Sözlük
- **Island / Notch paneli:** Ekranın üst ortasında duran, Dynamic Island benzeri canlı panel.
- **Workspace:** Bir müşteri veya ürüne ait kaynaklar, talimatlar ve sözlük kümesi.
- **RAG:** Retrieval-Augmented Generation; cevabın bilgi bankasından getirilen parçalarla üretilmesi.
- **VAD:** Voice Activity Detection; konuşmanın başlangıç ve bitişini algılama.
- **STT:** Speech-to-Text; konuşmayı metne çevirme.
