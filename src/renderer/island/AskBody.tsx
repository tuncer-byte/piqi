import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AudioLevels, ChatView } from '@shared/types'
import { inline, Markdown } from '../shared/Markdown'
import { ChevronDown, Mic, Search, Stop } from '../shared/icons'
import { act, Caret, Chip, CONFIDENCE, Divider, LevelBars, PillButton, Shimmer } from './parts'

/** ⌘⇧K: Piqi'ye yazılı veya sesli soru. */
export function AskBody({ listening }: { listening: boolean }): ReactNode {
  const [text, setText] = useState('')
  const [useContext, setUseContext] = useState(listening)
  const [detailed, setDetailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Pencere odak aldıktan sonra kutuya odaklan.
    const timer = setTimeout(() => input.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [])

  const submit = (): void => {
    if (!text.trim()) return
    act({ type: 'askSubmit', request: { text, useMeetingContext: useContext, detailed } })
  }

  return (
    <div className="px-6 pb-5 pt-2.5">
      <form
        className="flex h-[52px] items-center gap-2.5 rounded-2xl bg-island-field pl-4 pr-2"
        style={{ boxShadow: '0 0 0 1.5px rgba(200,241,105,0.55)' }}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Search size={18} className="shrink-0 text-lime" />
        <label htmlFor="piqi-ask" className="sr-only">
          Piqi’ye sor
        </label>
        <input
          id="piqi-ask"
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && act({ type: 'dismiss' })}
          placeholder="Ürün, kod veya toplantı hakkında sor…"
          className="selectable min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#F2F2F0] outline-none placeholder:text-[#6F727A] focus-visible:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          aria-label="Sesle sor"
          title="Sesle sor"
          onClick={() => act({ type: 'askVoice' })}
          className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-xl border-0 bg-[#26272C] text-[#D7D9DE] hover:bg-[#303137]"
        >
          <Mic size={17} />
        </button>
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-[38px] shrink-0 rounded-xl border-0 bg-lime px-3.5 text-[13px] font-bold text-on-lime disabled:opacity-50"
        >
          Sor <span className="ml-1 font-mono font-medium opacity-70">↵</span>
        </button>
      </form>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[#8E9199]">
        <div className="flex gap-2">
          <Toggle on={useContext} onClick={() => setUseContext(!useContext)}>
            Toplantı bağlamı: son 2 dk
          </Toggle>
          <Toggle on={detailed} onClick={() => setDetailed(!detailed)}>
            Detaylı cevap
          </Toggle>
        </div>
        <span className="truncate">Karşı tarafa gitmez, yalnızca sen görürsün</span>
      </div>
    </div>
  )
}

function Toggle(props: { on: boolean; onClick: () => void; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border-0 px-[11px] py-[5px] text-[12px] font-semibold ${
        props.on ? 'bg-island-btn text-[#D7D9DE]' : 'bg-transparent text-[#7B7E86] ring-1 ring-[#2A2B30] ring-inset'
      }`}
    >
      {props.on && <span className="size-1.5 rounded-full bg-lime" />}
      {props.children}
    </button>
  )
}

/** "Selam Piqi" ve ⌘⇧K konuşması: soru, akan cevap, sesli okuma durumu. */
export function ChatBody({ chat, levels, expanded }: { chat: ChatView; levels: AudioLevels; expanded: boolean }): ReactNode {
  const { lead, rest } = splitReply(chat.reply)
  const listening = chat.phase === 'listening'

  return (
    <div className="pb-5 pt-2.5">
      <div className="px-6">
        <div className="flex min-h-[52px] items-center gap-2.5 rounded-2xl bg-island-field py-2.5 pl-4 pr-2">
          {listening ? <Mic size={18} className="shrink-0 text-lime" /> : <Search size={18} className="shrink-0 text-lime" />}
          <div className="selectable min-w-0 flex-1 text-[16px] leading-snug text-[#F2F2F0]">
            {chat.userText || <span className="text-[#6F727A]">{listening ? 'Dinliyorum…' : ''}</span>}
            {listening && <Caret />}
          </div>
          {listening ? (
            <span className="pr-2">
              <LevelBars levels={levels} source="me" />
            </span>
          ) : (
            <PillButton onClick={() => act({ type: 'openAsk' })}>Yeni soru</PillButton>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[#8E9199]">
          <div className="flex gap-2">
            {chat.usedMeetingContext && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-island-btn px-[11px] py-[5px] font-semibold text-[#D7D9DE]">
                <span className="size-1.5 rounded-full bg-lime" />
                Toplantı bağlamı: son 2 dk
              </span>
            )}
          </div>
          <span>Karşı tarafa gitmez, yalnızca sen görürsün</span>
        </div>
      </div>

      {!listening && (
        <>
          <div className="mx-6 mt-[18px]">
            <Divider />
          </div>
          <div className="px-7 pt-4">
            {chat.phase === 'thinking' && <Shimmer label="Düşünüyor" />}
            {chat.phase === 'error' && <p className="m-0 text-[15px] leading-normal text-[#F6A39B]">{chat.error}</p>}
            {lead && (
              <div className="selectable max-h-[260px] overflow-y-auto pr-1">
                <div className="text-[20px] font-medium leading-[1.4] text-[#F6F6F4]">
                  {inline(lead, 'font-mono text-[17px] text-lime')}
                  {chat.phase === 'answering' && !rest && <Caret />}
                </div>
                {expanded && rest && <Markdown text={rest} className="mt-3.5 flex flex-col gap-3 text-[14px] leading-[1.5] text-[#D5D7DC]" />}
                {chat.phase === 'answering' && !expanded && rest && <Caret />}
              </div>
            )}
            {(chat.phase === 'done' || chat.speaking) && (
              <div className="mt-4 flex flex-col gap-3">
                {expanded && chat.sources.length > 0 && (
                  <div className="border-t border-island-line pt-3">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B7E86]">Kaynaklar</div>
                    <div className="flex flex-col gap-1">
                      {chat.sources.map((source) => (
                        <div key={source.id} className="flex items-center justify-between gap-3 py-1 font-mono text-[12px] text-[#B9BDC5]">
                          <span className="truncate" title={source.label}>{source.label}</span>
                          <span className="shrink-0 font-sans text-[11px] font-semibold text-lime">Kaynakta</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-[12px] text-[#A3A6AE]">
                  {chat.speaking ? (
                    <span className="text-[#7B7E86]">Sesli okunuyor</span>
                  ) : (
                    <>
                      <Chip {...CONFIDENCE[chat.confidence]}>{CONFIDENCE[chat.confidence].label}</Chip>
                      {chat.sources[0] && (
                        <span className="truncate font-mono text-[11.5px]" title={chat.sources.map((s) => s.label).join('\n')}>
                          {chat.sources[0].label}
                          {chat.sources.length > 1 && ` +${chat.sources.length - 1}`}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!chat.speaking && (rest || chat.sources.length > 0) && (
                    <PillButton label={expanded ? 'Detayı kapat' : 'Detayı aç'} onClick={() => act({ type: 'toggleExpand' })}>
                      {expanded ? 'Daha az' : 'Detay'} <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} />
                    </PillButton>
                  )}
                  {chat.speaking && (
                    <PillButton onClick={() => act({ type: 'stopSpeaking' })}>
                      <Stop size={12} /> Durdur
                    </PillButton>
                  )}
                  {!chat.speaking && !chat.sources.some((s) => s.label === 'SSS') && (
                    <PillButton
                      onClick={() => act({ type: 'saveFaq' })}
                      disabled={chat.savedFaq}
                      title="Bu soru tekrar gelince model çağrılmadan bu cevap gösterilir"
                    >
                      {chat.savedFaq ? 'SSS’ye eklendi' : 'SSS’ye ekle'}
                    </PillButton>
                  )}
                  <PillButton onClick={() => act({ type: 'copy' })}>Kopyala</PillButton>
                  <PillButton onClick={() => act({ type: 'openAsk' })}>Yeni soru</PillButton>
                </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** İlk paragrafı büyük puntoyla, kalanını detay olarak göstermek için böler. */
function splitReply(reply: string): { lead: string; rest: string } {
  const text = reply.trim()
  if (!text) return { lead: '', rest: '' }
  const breakAt = text.search(/\n\s*\n|\n\s*[-*•] |\n```/)
  if (breakAt === -1) return { lead: text, rest: '' }
  return { lead: text.slice(0, breakAt).trim(), rest: text.slice(breakAt).trim() }
}
