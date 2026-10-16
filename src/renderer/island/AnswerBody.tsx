import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { AnswerCard } from '@shared/types'
import { inline, Markdown } from '../shared/Markdown'
import { ChevronDown, ThumbDown, ThumbUp } from '../shared/icons'
import { act, Caret, Chip, CONFIDENCE, Divider, PillButton, RoundButton, SectionLabel } from './parts'

/** Karşı tarafın sorusuna kısa cevap; genişletilince detay, kod ve kaynaklar. */
export function AnswerBody({ answer, expanded }: { answer: AnswerCard; expanded: boolean }): ReactNode {
  const confidence = CONFIDENCE[answer.confidence]
  const general = answer.confidence === 'general'

  return (
    <div className="px-7 pb-[18px] pt-2.5">
      <div className="mb-2.5 truncate text-[12px] tracking-[0.01em] text-[#8E9199]">
        {answer.askedBy} sordu · “{answer.question}”
      </div>
      {general && <div className="mb-1.5 text-[12px] font-semibold text-[#A3A6AE]">Dokümanda bulunamadı, genel bilgi:</div>}
      <p
        className={`selectable m-0 text-[20px] font-medium leading-[1.38] tracking-[-0.005em] ${
          general ? 'text-[17px] leading-[1.4] text-[#E4E5E8]' : 'text-[#F6F6F4]'
        }`}
      >
        {inline(answer.short, 'font-mono text-[17px] text-lime')}
        {answer.streaming && <Caret />}
      </p>

      <AnimatePresence initial={false}>
        {expanded && (answer.detail || answer.sources.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="max-h-[300px] overflow-y-auto pr-1">
              <div className="mb-2.5 mt-5">
                <Divider />
              </div>
              {answer.detail && (
                <>
                  <SectionLabel>Detay</SectionLabel>
                  <Markdown text={answer.detail} className="flex flex-col gap-4 text-[14px] leading-[1.5] text-[#D5D7DC]" />
                </>
              )}
              {answer.sources.length > 0 && (
                <div className="mt-4 flex flex-col gap-1.5">
                  <SectionLabel>Kaynaklar</SectionLabel>
                  {answer.sources.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 font-mono text-[12.5px] text-[#B9BDC5]">
                      <span className="truncate">{s.label}</span>
                      <span className="shrink-0 font-sans text-[11px] font-semibold" style={{ color: confidence.fg }}>
                        {confidence.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <PillButton variant="lime" onClick={() => undefined} disabled title="Bilgi bankası (M2) ile gelecek">
                SSS’ye ekle
              </PillButton>
              <div className="flex items-center gap-1">
                <PillButton onClick={() => act({ type: 'copy' })}>
                  Kopyala <span className="ml-1 font-mono text-[#7B7E86]">⌘⇧C</span>
                </PillButton>
                <Feedback answer={answer} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!expanded && (
        <div className="mt-[18px] flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 text-[12px] text-[#A3A6AE]">
            <Chip {...confidence}>{confidence.label}</Chip>
            {answer.sources[0] && (
              <span className="truncate font-mono text-[11.5px]">
                {answer.sources[0].label}
                {answer.sources.length > 1 && ` +${answer.sources.length - 1}`}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {general ? (
              <PillButton onClick={() => undefined} disabled title="Doküman eksikleri (M4) ile gelecek">
                Eksikler listesine ekle
              </PillButton>
            ) : (
              (answer.detail || answer.sources.length > 0) && (
                <PillButton label="Detayı aç" onClick={() => act({ type: 'toggleExpand' })}>
                  Detay <ChevronDown size={12} />
                </PillButton>
              )
            )}
            <Feedback answer={answer} />
          </div>
        </div>
      )}
    </div>
  )
}

function Feedback({ answer }: { answer: AnswerCard }): ReactNode {
  return (
    <>
      <RoundButton label="Faydalı" active={answer.feedback === 'up'} onClick={() => act({ type: 'feedback', value: 'up' })}>
        <ThumbUp size={15} />
      </RoundButton>
      <RoundButton label="Faydasız" active={answer.feedback === 'down'} onClick={() => act({ type: 'feedback', value: 'down' })}>
        <ThumbDown size={15} />
      </RoundButton>
    </>
  )
}
