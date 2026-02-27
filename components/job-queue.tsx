'use client'

import { useEffect, useRef } from 'react'
import { useSwarmStore } from '@/lib/store'
import type { SwarmJob } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ListTodo,
  X,
  RotateCcw,
  Eye,
  XCircle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
} from 'lucide-react'

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; Icon: typeof Clock }
> = {
  queued: { label: 'Queued', color: '#71717a', bg: 'bg-zinc-500/10', Icon: Clock },
  running: { label: 'Running', color: '#3b82f6', bg: 'bg-blue-500/10', Icon: Loader2 },
  completed: { label: 'Completed', color: '#22c55e', bg: 'bg-green-500/10', Icon: CheckCircle2 },
  failed: { label: 'Failed', color: '#ef4444', bg: 'bg-red-500/10', Icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: '#71717a', bg: 'bg-zinc-500/10', Icon: Ban },
}

const MODE_COLORS: Record<string, string> = {
  chat: '#60a5fa',
  swarm: '#a78bfa',
  project: '#34d399',
}

function formatDuration(start: number, end?: number): string {
  const ms = (end ?? Date.now()) - start
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function JobRow({ job }: { job: SwarmJob }) {
  const cancelJob = useSwarmStore((s) => s.cancelJob)
  const retryJob = useSwarmStore((s) => s.retryJob)
  const sendMessage = useSwarmStore((s) => s.sendMessage)

  const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued
  const StatusIcon = config.Icon
  const canCancel = job.status === 'queued' || job.status === 'running'
  const canRetry = job.status === 'failed'
  const canView = job.status === 'completed'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2.5 transition-colors hover:bg-card"
    >
      <StatusIcon
        className={cn(
          'h-4 w-4 shrink-0',
          job.status === 'running' && 'animate-spin'
        )}
        style={{ color: config.color }}
      />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-medium truncate',
            job.status === 'cancelled' && 'line-through text-muted'
          )}>
            {job.prompt.slice(0, 60)}{job.prompt.length > 60 ? '...' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0"
            style={{ color: MODE_COLORS[job.mode], borderColor: MODE_COLORS[job.mode] }}
          >
            {job.mode}
          </Badge>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0', job.status === 'running' && 'animate-pulse-dot')}
            style={{ color: config.color, borderColor: config.color }}
          >
            {config.label}
          </Badge>
          {job.currentStage && job.status === 'running' && (
            <span className="text-[10px] text-muted">{job.currentStage}</span>
          )}
          <span className="text-[10px] text-muted">{formatTimestamp(job.createdAt)}</span>
          {job.startedAt && (
            <span className="text-[10px] text-muted">
              {formatDuration(job.startedAt, job.completedAt)}
            </span>
          )}
        </div>

        {job.status === 'running' && (
          <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${job.progress}%`,
                backgroundColor: MODE_COLORS[job.mode] ?? '#3b82f6',
              }}
            />
          </div>
        )}

        {job.error && (
          <p className="text-[10px] text-red-400 truncate">{job.error}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {canCancel && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted hover:text-red-400"
            onClick={() => cancelJob(job.id)}
            aria-label="Cancel job"
            title="Cancel job"
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        {canRetry && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted hover:text-yellow-400"
            onClick={() => retryJob(job.id)}
            aria-label="Retry job"
            title="Retry job"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        {canView && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted hover:text-green-400"
            onClick={() => {
              if (job.result?.finalOutput) {
                sendMessage(`Show me the result of: ${job.prompt.slice(0, 100)}`)
              }
            }}
            aria-label="View result"
            title="View result"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </motion.div>
  )
}

export function JobQueue({ onClose }: { onClose: () => void }) {
  const jobs = useSwarmStore((s) => s.jobs)
  const hasRunning = jobs.some((j) => j.status === 'running' || j.status === 'queued')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (hasRunning) {
      intervalRef.current = setInterval(() => {
        useSwarmStore.setState((s) => ({ jobs: [...s.jobs] }))
      }, 2000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [hasRunning])

  const sortedJobs = [...jobs].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="flex h-full flex-col border-l border-border bg-background" style={{ width: 420 }}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Job Queue</h2>
          {jobs.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{jobs.length}</Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close job queue panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        {sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xl" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
                <ListTodo className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h3 className="text-sm font-semibold text-foreground">No jobs in queue</h3>
            <p className="mt-1 max-w-[240px] text-xs text-muted">
              Jobs appear here when you send prompts. Track progress and retry failed jobs.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {sortedJobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
