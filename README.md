<div align="center">
	<img src="resources/icon.png" alt="Piqi simgesi" width="112" height="112" />
	<h1>Piqi</h1>
	<p><strong>Toplantıda doğru cevabı, doğru kaynaktan bul.</strong></p>
	<p>macOS için toplantı asistanı · Canlı transkript · Kurum içi bilgi havuzu · Kaynaklı yanıtlar</p>
</div>

Piqi, toplantı sırasında konuşmayı dinler, soruları kurumun dokümanları ve kod tabanında arar, kaynak gösteren kısa yanıtları ekranda sunar. Ses yakalama ve konuşma tanıma cihaz üzerinde çalışır; bulut model kullanımı sağlayıcı ve gizlilik politikasına göre yapılandırılır.

## Özellikler

- Mikrofon ve toplantı uygulamalarının sistem sesini ayrı kanallar olarak yakalama
- Türkçe uyandırma sözcüğü, canlı transkript ve konuşmacı ayrımı
- PDF, Office belgeleri, metin dosyaları, kod depoları, web, Confluence ve Notion kaynakları
- Hibrit bilgi araması, kaynak atıfları ve onaylı soru-cevap kayıtları
- Anthropic, Gemini ve OpenAI uyumlu sağlayıcılar
- PII maskeleme, yerel veri politikası ve içerik kaydetmeyen denetim kayıtları
- macOS seslendirmesi ve isteğe bağlı yerel EMA TTS

## Gereksinimler

- macOS 14.4 veya üzeri
- Node.js 23 veya üzeri
- Xcode ve Swift 6.1 veya üzeri
- Rust toolchain (TTS için; sürüm `native/piqi-tts/rust-toolchain.toml` içinde sabitlenir)

## Geliştirme

```sh
npm install
npm run dev
```

Yararlı komutlar:

```sh
npm test
npm run typecheck
npm run build
npm run dist
```

İlk çalıştırmada macOS mikrofon, konuşma tanıma ve sistem sesi izinleri istenir. Bulut sağlayıcıları için ilgili API anahtarını uygulamanın ayarlarından ekleyin.

## Proje yapısı

| Yol | İçerik |
|---|---|
| `src/main` | Electron ana süreci, ses, toplantı, asistan ve bilgi bankası servisleri |
| `src/renderer` | Ana pencere, Kaynaklar ekranı ve Island arayüzü |
| `src/preload` | Renderer ile ana süreç arasındaki tipli API köprüsü |
| `src/shared` | Süreçler arası tipler, ürün profili ve marka geometrisi |
| `native/piqi-audio` | Swift ses yakalama ve cihaz üzerinde konuşma tanıma yardımcısı |
| `native/piqi-tts` | Rust tabanlı yerel EMA TTS süreci |
| `docs/PRD.md` | Ürün gereksinimleri ve tasarım bağlamı |

## Durum

Piqi aktif geliştirme aşamasındadır. Paketli dağıtım ve imzalama akışı henüz tamamlanmamıştır.
