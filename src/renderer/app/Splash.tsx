import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { PiqiMark, Wordmark } from '../shared/PiqiMark'

const DURATION_MS = 1900

/** Pencere açılışında simgenin kurulduğu kısa animasyon; sonra içerik görünür. */
export function Splash({ children }: { children: ReactNode }): ReactNode {
  const [visible, setVisible] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), DURATION_MS)
    return () => clearTimeout(timer)
  }, [visible])

  return (
    <>
      <motion.div
        className="h-full"
        initial={visible ? { opacity: 0, scale: 0.985 } : false}
        animate={visible ? { opacity: 0 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="splash"
            className="drag fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg"
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            onClick={() => setVisible(false)}
          >
            <motion.div
              className="flex size-[148px] items-center justify-center rounded-[34px] bg-[#0E0E10]"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.25)' }}
            >
              <PiqiMark size={104} state="intro" tone="lime" />
            </motion.div>
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.45 }}
            >
              <Wordmark size={40} />
              <span className="text-[14px] text-muted">Dinleyen sekiz nokta, ortada cevap veren bir nokta.</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
