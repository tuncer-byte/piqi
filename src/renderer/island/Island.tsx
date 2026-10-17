import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AudioLevels, IslandSnapshot } from '@shared/types'
import { useIslandSnapshot, useLevels } from '../shared/hooks'
import { ChevronLeft, ChevronRight, Close, Pin, Stop } from '../shared/icons'
import { PiqiMark, Wordmark, type MarkState } from '../shared/PiqiMark'
import { AnswerBody } from './AnswerBody'
import { AskBody, ChatBody } from './AskBody'
import { act, formatLatency, GhostIcon, LevelBars, PillButton, ProductTag } from './parts'

const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const
const NO_NOTCH_BAR = 32

export function Island(): ReactNode {
  const snapshot = useIslandSnapshot()
  const levels = useLevels()
  const [hover, setHover] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  // Açılışta Island notch'tan kısa bir "hazır" selamıyla çıkar.
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), 2400)
    return () => clearTimeout(timer)
  }, [])

  if (!snapshot) return null

  const onHover = (value: boolean): void => {
    setHover(value)
    window.piqi.island.setHover(value)
  }

  const { view, geometry } = snapshot
  const notchWidth = geometry.notch?.width ?? 0
  const barHeight = geometry.notch?.height ?? NO_NOTCH_BAR
  const transcriptExpanded = snapshot.expanded && (view.kind === 'listening' || (view.kind === 'idle' && snapshot.wakeHint))
  const hasContent = (view.kind !== 'idle' && view.kind !== 'listening') || transcriptExpanded
  const awake = !hasContent && (hover || snapshot.wakeHint || booting)

  let width: number
  switch (view.kind) {
    case 'ask':
    case 'chat':
      width = 640
      break
    case 'answer':
      width = 600
      break
    case 'question':
      width = 560
      break
    case 'listening':
      width = snapshot.expanded ? 560 : Math.max(notchWidth + 220, 420)
      break
    case 'idle':
      width = transcriptExpanded ? 560 : awake ? Math.max(notchWidth + 220, 420) : geometry.notch ? notchWidth + 32 : 180
      break
    default:
      width = awake ? Math.max(notchWidth + 220, 420) : geometry.notch ? notchWidth + 32 : 180
  }

  const height = hasContent ? barHeight + contentHeight : barHeight
  const radius = hasContent ? 30 : 22
  const ring = view.kind === 'question' ? '0 0 0 1px rgba(200,241,105,0.35), ' : ''
  const contentKey = view.kind === 'answer' ? view.answer.id : view.kind === 'chat' ? `chat-${view.chat.id}` : view.kind

  return (
    <div className="flex h-screen w-screen justify-center">
      <motion.div
        className="relative overflow-hidden bg-island text-[#F2F2F0]"
        initial={false}
        animate={{ width, height, borderBottomLeftRadius: radius, borderBottomRightRadius: radius }}
        transition={SPRING}
        style={{ boxShadow: hasContent ? `${ring}0 18px 50px rgba(0,0,0,0.45)` : 'none' }}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        {view.kind === 'listening' || (view.kind === 'idle' && snapshot.wakeHint) ? (
          <button
            type="button"
            aria-label={snapshot.expanded ? 'Duyulan konuşmayı gizle' : 'Duyulan konuşmayı göster'}
            aria-expanded={snapshot.expanded}
            onClick={() => act({ type: 'toggleExpand' })}
            className="block w-full border-0 bg-transparent p-0 text-left"
          >
            <TopBar snapshot={snapshot} levels={levels} awake={awake} booting={booting} notchWidth={notchWidth} height={barHeight} />
          </button>
        ) : (
          <TopBar snapshot={snapshot} levels={levels} awake={awake} booting={booting} notchWidth={notchWidth} height={barHeight} />
        )}
        <AnimatePresence mode="popLayout">
          {hasContent && (
            <Measured key={contentKey} width={width} onHeight={setContentHeight}>
              <Body snapshot={snapshot} levels={levels} />
            </Measured>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function Body({ snapshot, levels }: { snapshot: IslandSnapshot; levels: AudioLevels }): ReactNode {
  const { view } = snapshot
  switch (view.kind) {
    case 'idle':
      return snapshot.wakeHint && snapshot.expanded ? <TranscriptBody snapshot={snapshot} /> : null
    case 'question':
      return (
        <div className="flex items-center gap-3 px-[26px] pb-5 pt-1.5">
          <motion.span
            className="size-2.5 shrink-0 rounded-full bg-lime"
            style={{ boxShadow: '0 0 0 5px rgba(200,241,105,0.18)' }}
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <div className="text-[17px] font-medium leading-[1.35] text-[#F2F2F0]">“{view.question}”</div>
        </div>
      )
    case 'answer':
      return <AnswerBody answer={view.answer} expanded={snapshot.expanded} />
    case 'listening':
      return snapshot.expanded ? <TranscriptBody snapshot={snapshot} /> : null
    case 'ask':
      return <AskBody listening={snapshot.listening} />
    case 'chat':
      return <ChatBody chat={view.chat} levels={levels} expanded={snapshot.expanded} />
    case 'meetingPrompt':
      return (
        <div className="flex items-center justify-between gap-4 px-[26px] pb-5 pt-1.5">
          <div className="min-w-0">
            <div className="text-[17px] font-medium leading-[1.35] text-[#F2F2F0]">{view.app} görüşmesi algılandı</div>
            <div className="mt-0.5 text-[12.5px] text-[#8E9199]">Dinlersem karşı tarafın sorularına kaynaklı cevap hazırlarım.</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <PillButton onClick={() => act({ type: 'meetingDismiss' })}>Şimdi değil</PillButton>
            <PillButton variant="lime" onClick={() => act({ type: 'meetingStart' })}>
              Dinlemeye başla
            </PillButton>
          </div>
        </div>
      )
    default:
      return null
  }
}

function TranscriptBody({ snapshot }: { snapshot: IslandSnapshot }): ReactNode {
  const transcript = snapshot.lastTranscript
  return (
    <div className="px-7 pb-5 pt-1.5">
      <div className="mb-2 font-mono text-[11px] text-[#7B7E86]">SON DUYULAN · {transcript?.channel === 'me' ? 'BEN' : 'KARŞI TARAF'}</div>
      <p className="m-0 max-h-[180px] overflow-y-auto text-[16px] leading-[1.45] text-[#F2F2F0]">
        {transcript?.text || 'Henüz konuşma algılanmadı.'}
        {transcript && !transcript.final && <span className="ml-1 text-lime">…</span>}
      </p>
    </div>
  )
}

/** Üst şerit: notch'un iki yanındaki "kanatlar". */
function TopBar(props: {
  snapshot: IslandSnapshot
  levels: AudioLevels
  awake: boolean
  booting: boolean
  notchWidth: number
  height: number
}): ReactNode {
  const { snapshot, levels, awake, booting, notchWidth, height } = props
  const { view } = snapshot
  const mono = 'font-mono text-[11px] text-[#7B7E86]'
  const listeningHint = <span className="font-mono text-[11px] text-lime">Dinliyorum…</span>

  let left: ReactNode = null
  let right: ReactNode = null

  switch (view.kind) {
    case 'idle':
      left = booting ? (
        <div className="flex items-center gap-2 text-[#F2F2F0]">
          <PiqiMark size={18} state="intro" tone="lime" />
          <Wordmark size={15} />
        </div>
      ) : awake ? (
        <ProductTag name={snapshot.productName} live={false} state={snapshot.wakeHint ? 'listening' : 'idle'} />
      ) : null
      right = booting ? (
        <span className={mono}>{snapshot.characterName} hazır</span>
      ) : !awake ? (
        <PiqiMark size={14} state="idle" tone="lime" />
      ) : snapshot.wakeHint ? (
        listeningHint
      ) : (
        <span className={mono}>⌘⇧L dinle · ⌘⇧K sor</span>
      )
      break
    case 'listening':
      left = <ProductTag name={snapshot.productName} live state="listening" />
      right = snapshot.wakeHint ? (
        listeningHint
      ) : (
        <div className={`flex items-center gap-2.5 ${mono}`}>
          {snapshot.speakerCount > 0 && <span>{snapshot.speakerCount} kişi</span>}
          <LevelBars levels={levels} />
        </div>
      )
      break
    case 'question':
      left = <ProductTag name={snapshot.productName} live={snapshot.listening} state="thinking" />
      right = <span className="font-mono text-[11px] text-lime">Soru algılandı</span>
      break
    case 'answer':
      left = (
        <ProductTag name={snapshot.productName} live={snapshot.listening} state={view.answer.streaming ? 'thinking' : 'ready'} />
      )
      right = snapshot.expanded ? (
        <div className="flex items-center gap-1.5 text-[#7B7E86]">
          <GhostIcon label="Önceki cevap" disabled={snapshot.historyIndex <= 0} onClick={() => act({ type: 'history', step: -1 })}>
            <ChevronLeft />
          </GhostIcon>
          <span className="font-mono text-[11px]">
            {snapshot.historyIndex + 1} / {snapshot.history.length}
          </span>
          <GhostIcon
            label="Sonraki cevap"
            disabled={snapshot.historyIndex >= snapshot.history.length - 1}
            onClick={() => act({ type: 'history', step: 1 })}
          >
            <ChevronRight />
          </GhostIcon>
          <GhostIcon label="Sabitle" active={snapshot.pinned} onClick={() => act({ type: 'togglePin' })}>
            <Pin />
          </GhostIcon>
          <GhostIcon label="Kapat" onClick={() => act({ type: 'dismiss' })}>
            <Close />
          </GhostIcon>
        </div>
      ) : (
        <div className={`flex items-center gap-2.5 ${mono}`}>
          {view.answer.latencyMs != null && <span>{formatLatency(view.answer.latencyMs)}</span>}
          {snapshot.history.length > 1 && (
            <span className="flex items-center">
              <GhostIcon label="Önceki cevap" disabled={snapshot.historyIndex <= 0} onClick={() => act({ type: 'history', step: -1 })}>
                <ChevronLeft size={12} />
              </GhostIcon>
              {snapshot.historyIndex + 1}/{snapshot.history.length}
            </span>
          )}
          {snapshot.listening && <LevelBars levels={levels} />}
        </div>
      )
      break
    case 'ask':
    case 'chat':
      left = (
        <ProductTag
          name={`${snapshot.characterName} · ${snapshot.productName}`}
          live={snapshot.listening}
          state={view.kind === 'chat' ? chatMark(view.chat.phase) : snapshot.listening ? 'listening' : 'idle'}
        />
      )
      right =
        view.kind === 'chat' && view.chat.speaking ? (
          <button
            type="button"
            onClick={() => act({ type: 'stopSpeaking' })}
            className="inline-flex items-center gap-1.5 border-0 bg-transparent font-mono text-[11px] text-lime"
          >
            <Stop size={11} /> Konuşuyor
          </button>
        ) : (
          <button type="button" onClick={() => act({ type: 'dismiss' })} className={`border-0 bg-transparent ${mono}`}>
            Esc kapat
          </button>
        )
      break
      break
  }

  return (
    <div className="flex items-center justify-between px-[26px]" style={{ height }}>
      <div className="flex min-w-0 flex-1 items-center">{left}</div>
      <div style={{ width: notchWidth }} className="shrink-0" />
      <div className="flex min-w-0 flex-1 items-center justify-end">{right}</div>
    </div>
  )
}

function chatMark(phase: string): MarkState {
  if (phase === 'listening') return 'listening'
  if (phase === 'thinking' || phase === 'answering') return 'thinking'
  return 'ready'
}


/** İçeriğin doğal yüksekliğini ölçer; çıkış animasyonundaki eski içerik ölçüme katılmaz. */
function Measured(props: { width: number; onHeight: (h: number) => void; children: ReactNode }): ReactNode {
  const { width, onHeight, children } = props
  const ref = useRef<HTMLDivElement>(null)
  const isPresent = useIsPresent()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !isPresent) return
    const observer = new ResizeObserver(() => onHeight(el.offsetHeight))
    observer.observe(el)
    onHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [isPresent, onHeight])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.22, delay: 0.06 }}
      style={{ width }}
    >
      {children}
    </motion.div>
  )
}
