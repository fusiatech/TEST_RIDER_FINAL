'use client'

import { useState } from 'react'
import { useSwarmStore } from '@/lib/store'
import { ROLE_LABELS } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

function inferAgentName(agentId: string): string {
  const lower = agentId.toLowerCase()
  if (lower.includes('researcher')) return ROLE_LABELS.researcher
  if (lower.includes('planner')) return ROLE_LABELS.planner
  if (lower.includes('coder')) return ROLE_LABELS.coder
  if (lower.includes('validator')) return ROLE_LABELS.validator
  if (lower.includes('security')) return ROLE_LABELS.security
  if (lower.includes('synthesizer')) return ROLE_LABELS.synthesizer
  return agentId
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ErrorPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const errors = useSwarmStore((s) => s.errors)
  const clearErrors = useSwarmStore((s) => s.clearErrors)

  return (
    <Card className="overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 rounded-none"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium">Errors</span>
          {errors.length > 0 && (
            <Badge className="bg-red-500/90 text-white text-[10px] px-1.5 py-0">
              {errors.length}
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted" />
        )}
      </Button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="error-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border">
              {errors.length > 0 && (
                <div className="flex justify-end px-4 py-2 border-b border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearErrors}
                    className="text-xs text-muted hover:text-foreground gap-1.5"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear All
                  </Button>
                </div>
              )}
              <div className="max-h-60 overflow-auto p-3 space-y-1.5">
                {errors.length === 0 ? (
                  <span className="text-sm text-muted italic">No errors detected</span>
                ) : (
                  errors.map((err) => (
                    <div
                      key={err.id}
                      className="flex items-start gap-2 rounded-md bg-red-500/5 border border-red-500/10 px-3 py-2"
                    >
                      <span className="shrink-0 text-[10px] text-muted tabular-nums pt-0.5">
                        {formatTimestamp(err.timestamp)}
                      </span>
                      <span className="shrink-0 text-[10px] font-medium text-muted pt-0.5">
                        [{inferAgentName(err.agentId)}]
                      </span>
                      <span className="font-mono text-xs text-red-400 break-all leading-relaxed">
                        {err.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
