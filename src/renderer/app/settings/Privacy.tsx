import { useEffect, useState, type ReactNode } from 'react'
import type { AuditEntry, DataPolicy } from '@shared/types'
import { presetById } from '@shared/providers'
import { usePolicy } from '../../shared/hooks'
import { Lock } from '../../shared/icons'
import type { PageProps } from '../App'
import { Badge, Button, Card, Label, PageHeader, Segmented, SettingRow, Switch } from '../ui'

export function PrivacyPage({ settings, update }: PageProps): ReactNode {
  const [policy, refresh] = usePolicy()
  const [audit, setAudit] = useState<AuditEntry[]>([])
  useEffect(() => void window.piqi.policy.recentAudit().then(setAudit), [])
  const managed = Boolean(policy?.managedBy)
  const effective = policy?.effective ?? settings.policy
  const provider = presetById(settings.model.providerId)
  const cloud = provider?.location === 'cloud'

  const setPolicy = (patch: Partial<DataPolicy>): void => {
    update({ policy: { ...settings.policy, ...patch } })
    setTimeout(refresh, 50)
  }

  const rows: { data: string; where: string; tone: 'ok' | 'warn' | 'neutral'; status: string }[] = [
    { data: 'Ham ses', where: 'Cihazdan çıkmaz, diske yazılmaz', tone: 'ok', status: 'Lokal' },
    { data: 'Konuşma tanıma', where: 'Apple, cihaz üzerinde', tone: 'ok', status: 'Lokal' },
    { data: 'Konuşmacı ayrımı', where: 'FluidAudio, cihaz üzerinde; ses izi saklanmaz', tone: 'ok', status: 'Lokal' },
    {
      data: 'Seslendirme',
      where: settings.voice.engine === 'ema' ? 'EMA Lightning, cihaz üzerinde' : 'Apple, cihaz üzerinde',
      tone: 'ok',
      status: 'Lokal'
    },
    {
      data: 'Sorular, toplantı bağlamı, prova',
      where: `${provider?.name ?? '—'} (${settings.model.id})${cloud && effective.maskPII ? ' · kişisel veriler maskeli' : ''}`,
      tone: cloud ? 'warn' : 'ok',
      status: cloud ? 'Buluta gider' : 'Kurum içi'
    },
    { data: 'Bilgi bankası indeksi, ayarlar, denetim kaydı', where: 'Bu Mac’te (SQLite)', tone: 'ok', status: 'Lokal' },
    {
      data: 'Kaynak tarama planı ve kod kartları',
      where: `Yalnızca klasör ağacı ve dosya önizlemeleri · ${provider?.name ?? '—'}`,
      tone: cloud ? 'warn' : 'ok',
      status: cloud ? 'Buluta gider' : 'Kurum içi'
    },
    { data: 'Telemetri', where: 'Kapalı, içerik hiçbir zaman gönderilmez', tone: 'neutral', status: 'Kapalı' }
  ]

  return (
    <>
      <PageHeader title="Gizlilik ve uyum" subtitle="Cihazdan neyin çıktığını her an gör ve değiştir. KVKK ve BDDK beklentilerine göre tasarlandı." />

      <Card tone="dark" className="flex flex-col gap-5 px-[22px] py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[17px] font-bold">Veri politikası</div>
          {managed ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#C8C8CE]">
              <Lock size={13} className="text-lime" /> Kurum tarafından yönetiliyor
            </span>
          ) : (
            <span className="text-[12px] text-[#8E9199]">MDM ile kilitlenebilir</span>
          )}
        </div>
        <DarkRow
          title="Bulut modellerine izin ver"
          text="Kapalıyken yalnızca kurum içi sunucular (vLLM, Ollama) kullanılabilir; hiçbir metin bankanın ağı dışına çıkmaz."
          checked={effective.allowCloud}
          disabled={managed}
          onChange={(allowCloud) => setPolicy({ allowCloud })}
        />
        <DarkRow
          title="Kişisel verileri maskele"
          text="Buluta gitmeden önce TCKN, VKN, IBAN, kart numarası, telefon ve e-posta «TCKN-1» gibi belirteçlerle değiştirilir; cevaplar yalnızca bu Mac’te geri çevrilir."
          checked={effective.maskPII}
          disabled={managed}
          onChange={(maskPII) => setPolicy({ maskPII })}
        />
        <DarkRow
          title="Denetim kaydı"
          text="Her model çağrısı içeriksiz kaydedilir: zaman, sağlayıcı, model, karakter sayısı, maskelenen veri türleri."
          checked={effective.audit}
          disabled={managed}
          onChange={(audit) => setPolicy({ audit })}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4 text-[15px] font-bold">Hangi veri nereye gidiyor</div>
        <div className="grid grid-cols-[1.2fr_1.6fr_0.7fr] bg-fill-2 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-label">
          <span>Veri</span>
          <span>Gittiği yer</span>
          <span>Durum</span>
        </div>
        {rows.map((r) => (
          <div key={r.data} className="grid grid-cols-[1.2fr_1.6fr_0.7fr] items-center gap-3 border-t border-line px-5 py-3.5 text-[14px]">
            <span>{r.data}</span>
            <span className="text-ink-2">{r.where}</span>
            <span>
              <Badge tone={r.tone}>{r.status}</Badge>
            </span>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-3 px-5 py-[18px]">
        <div className="flex items-center justify-between">
          <Label>Denetim kaydı · son çağrılar</Label>
          <Button size="sm" onClick={() => window.piqi.policy.revealAudit()}>
            Klasörü aç
          </Button>
        </div>
        {audit.length === 0 ? (
          <div className="text-[13.5px] text-muted">Henüz model çağrısı yok.</div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-[0.06em] text-label">
                <tr>
                  <th className="py-1.5 font-semibold">Zaman</th>
                  <th className="font-semibold">Amaç</th>
                  <th className="font-semibold">Model</th>
                  <th className="font-semibold">Konum</th>
                  <th className="font-semibold">Maskelenen</th>
                  <th className="font-semibold">Sonuç</th>
                </tr>
              </thead>
              <tbody className="selectable">
                {audit.map((e, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2 font-mono text-[11.5px]">
                      {new Date(e.ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>{{ assistant: 'Asistan', knowledge: 'Bilgi bankası', test: 'Test' }[e.purpose]}</td>
                    <td className="font-mono text-[11.5px]">{e.model}</td>
                    <td>{e.location === 'cloud' ? 'Bulut' : 'Kurum içi'}</td>
                    <td>
                      {Object.entries(e.masked)
                        .map(([k, v]) => `${k}×${v}`)
                        .join(', ') || '—'}
                    </td>
                    <td className={e.ok ? 'text-ok' : 'text-err'}>{e.ok ? `${(e.ms / 1000).toFixed(1)} sn` : 'Hata'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[12px] text-muted">Soru ve cevap metinleri kayda yazılmaz. Kayıtlar aylık JSONL dosyalarıdır; SIEM’e aktarılabilir.</div>
      </Card>

      <Card className="flex flex-col gap-3.5 px-5 py-[18px]">
        <SettingRow title="Ekran paylaşımında paneli gizle" description="Panel içerik korumalıdır, karşı tarafa görünmez.">
          <Switch label="Ekran paylaşımında paneli gizle" checked={settings.hideInScreenShare} onChange={(hideInScreenShare) => update({ hideInScreenShare })} />
        </SettingRow>
        <div className="rounded-[10px] bg-warn-soft px-3.5 py-3 text-[13px] leading-normal text-warn-ink">
          Bazı macOS sürümleri ve yakalama yöntemleri içerik korumasını yok sayabilir. Önemli bir paylaşımdan önce bir test kaydıyla kontrol
          etmeni öneririz.
        </div>
      </Card>
      <Card className="px-5 py-[18px]">
        <SettingRow title="Transkript saklama süresi" description="Toplantı geçmişi (M4) ile gelecek. Şu an transkript yalnızca bellekte, son 15 dakika tutulur.">
          <Segmented value="none" options={[{ value: 'none', label: 'Saklanmıyor' }]} onChange={() => undefined} />
        </SettingRow>
      </Card>
    </>
  )
}

function DarkRow(props: { title: string; text: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }): ReactNode {
  return (
    <div className={`flex items-center gap-5 ${props.disabled ? 'opacity-70' : ''}`}>
      <div className="flex-1">
        <div className="text-[15px] font-bold">{props.title}</div>
        <div className="mt-1 text-[13px] leading-normal text-[#A9ACB3]">{props.text}</div>
      </div>
      <Switch label={props.title} dark checked={props.checked} onChange={(v) => !props.disabled && props.onChange(v)} />
    </div>
  )
}
