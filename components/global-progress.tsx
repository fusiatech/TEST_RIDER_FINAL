'use client'

import { useSwarmStore } from '@/lib/store'
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function GlobalProgress() {
  const agents = useSwarmStore((s) => s.agents)
  const isRunning = useSwarmStore((s) => s.isRunning)

  const progress = useMemo(() => {
    if (agents.length === 0) return 0
    const completed = agents.filter(
      (a) => a.status === 'completed' || a.status === 'failed'
    ).length
    return Math.round((completed / agents.length) * 100)
  }, [agents])

  return (
    <AnimatePresence>
      {isRunning && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 3, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="relative w-full overflow-hidden bg-secondary/50"
        >
          <motion.div
            className="absolute inset-y-0 left-0"
            style={{
              background:
                'linear-gradient(90deg, var(--color-primary), #c084fc, var(--color-primary))',
            }}
            initial={{ width: '0%' }}
            animate={{ width: `${Math.max(progress, 5)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          {progress < 100 && (
            <div
              className="absolute inset-y-0 animate-global-progress"
              style={{
                width: '30%',
                background:
                  'linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.4), transparent)',
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
