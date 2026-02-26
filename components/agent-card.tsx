'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { AgentInstance, AgentRole, AgentStatus } from '@/lib/types'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, Bot, Clock, Loader2, Copy, Check, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

interface AgentCardProps {
  agent: AgentInstance
}

const STATUS_STYLES: Record<AgentStatus, string> = {
  pending: 'bg-zinc-600/20 text-zinc-400 border-zinc-600',
  spawning: 'bg-blue-600/20 text-blue-400 border-blue-600',
  running: 'bg-yellow-600/20 text-yellow-400 border-yellow-600 animate-pulse-dot',
  completed: 'bg-green-600/20 text-green-400 border-green-600',
  failed: 'bg-red-600/20 text-red-400 border-red-600',
  cancelled: 'bg-zinc-600/20 text-zinc-400 border-zinc-600',
}

const STAGE_MAP: Record<AgentRole, string> = {
  researcher: 'Research',
  planner: 'Plan',
  coder: 'Code',
  validator: 'Validate',
  security: 'Security',
  synthesizer: 'Synthesize',
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

export function AgentCard({ agent }: AgentCardProps) {
  const [isOpen, setIsOpen] = useState(agent.status === 'running')
  const [copied, setCopied] = useState(false)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (outputRef.current && isOpen) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [agent.output, isOpen])

  useEffect(() => {
    if (agent.status === 'running') {
      setIsOpen(true)
    }
  }, [agent.status])

  const cleanOutput = stripAnsi(agent.output)
  const lineCount = cleanOutput ? cleanOutput.split('\n').length : 0

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(cleanOutput)
      setCopied(true)
      toast.success('Output copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy output')
    }
  }, [cleanOutput])

  const elapsed =
    agent.startedAt != null
      ? formatTime(
          (agent.finishedAt ?? Date.now()) - agent.startedAt
        )
      : null

  const borderColor = ROLE_COLORS[agent.role]
  const isActive = agent.status === 'running' || agent.status === 'spawning'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      layout
      className="hover-lift"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card
          className="overflow-hidden border-border relative"
          style={{ borderLeftColor: borderColor, borderLeftWidth: '3px' }}
        >
          {isActive && (
            <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
              <div
                className="h-full animate-progress-bar"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${borderColor} 50%, transparent 100%)`,
                }}
              />
            </div>
          )}

          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
              )}
              <Bot className="h-4 w-4 shrink-0" style={{ color: borderColor }} />
              <span className="text-sm font-medium text-foreground">
                {agent.label || ROLE_LABELS[agent.role]}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-border/50"
                style={{ color: borderColor }}
              >
                {STAGE_MAP[agent.role]}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                {lineCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted">
                    <FileText className="h-3 w-3" />
                    {lineCount} lines
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-6 w-6 p-0 text-muted hover:text-foreground"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <Badge
                  variant="outline"
                  className={cn('text-xs', STATUS_STYLES[agent.status])}
                >
                  {agent.status === 'running' && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  {agent.status}
                </Badge>
                {elapsed && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="h-3 w-3" />
                    {elapsed}
                  </span>
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <div className="border-t border-border bg-card/50">
                <pre
                  ref={outputRef}
                  className="max-h-64 overflow-auto p-4 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words"
                >
                  {cleanOutput || (
                    <span className="text-muted italic">Waiting for output...</span>
                  )}
                </pre>
              </div>
            </motion.div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </motion.div>
  )
}
