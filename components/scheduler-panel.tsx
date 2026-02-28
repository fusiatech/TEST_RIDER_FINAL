'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSwarmStore } from '@/lib/store'
import type { ScheduledTask } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { generateId } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarClock,
  X,
  Plus,
  Pencil,
  Trash2,
  Clock,
  MessageCircle,
  Zap,
  FolderKanban,
} from 'lucide-react'

const SCHEDULE_OPTIONS = [
  { value: '0 * * * *', label: 'Every Hour' },
  { value: '0 */6 * * *', label: 'Every 6 Hours' },
  { value: '0 0 * * *', label: 'Daily' },
  { value: '0 0 * * 0', label: 'Weekly' },
] as const

const MODE_ICONS = {
  chat: MessageCircle,
  swarm: Zap,
  project: FolderKanban,
} as const

const MODE_COLORS: Record<string, string> = {
  chat: '#60a5fa',
  swarm: '#a78bfa',
  project: '#34d399',
}

function scheduleLabel(cron: string): string {
  const match = SCHEDULE_OPTIONS.find((o) => o.value === cron)
  return match?.label ?? cron
}

function getNextRunMs(nextRun: number): string {
  const diff = nextRun - Date.now()
  if (diff <= 0) return 'Now'
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

function TaskForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ScheduledTask
  onSave: (task: ScheduledTask) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [mode, setMode] = useState<'chat' | 'swarm' | 'project'>(initial?.mode ?? 'swarm')
  const [cronExpression, setCronExpression] = useState(initial?.cronExpression ?? SCHEDULE_OPTIONS[2].value)
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)

  const handleSubmit = () => {
    if (!name.trim() || !prompt.trim()) return

    const hourMs = 3_600_000
    const cronMs: Record<string, number> = {
      '0 * * * *': hourMs,
      '0 */6 * * *': hourMs * 6,
      '0 0 * * *': hourMs * 24,
      '0 0 * * 0': hourMs * 24 * 7,
    }

    const task: ScheduledTask = {
      id: initial?.id ?? generateId(),
      name: name.trim(),
      cronExpression,
      prompt: prompt.trim(),
      mode,
      enabled,
      lastRun: initial?.lastRun,
      nextRun: Date.now() + (cronMs[cronExpression] ?? hourMs * 24),
      createdAt: initial?.createdAt ?? Date.now(),
    }
    onSave(task)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3 rounded-lg border border-primary/30 bg-card p-3"
    >
      <Input
        placeholder="Task name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="text-sm"
      />
      <textarea
        placeholder="Prompt for the agent..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Mode:</span>
        {(['chat', 'swarm', 'project'] as const).map((m) => {
          const ModeIcon = MODE_ICONS[m]
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <ModeIcon className="h-3 w-3" />
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Schedule:</span>
        <select
          value={cronExpression}
          onChange={(e) => setCronExpression(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {SCHEDULE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-xs text-muted">{enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={!name.trim() || !prompt.trim()}>
            {initial ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function TaskRow({
  task,
  onEdit,
}: {
  task: ScheduledTask
  onEdit: () => void
}) {
  const deleteScheduledTask = useSwarmStore((s) => s.deleteScheduledTask)
  const toggleScheduledTask = useSwarmStore((s) => s.toggleScheduledTask)
  const [countdown, setCountdown] = useState(getNextRunMs(task.nextRun))

  const updateCountdown = useCallback(() => {
    setCountdown(getNextRunMs(task.nextRun))
  }, [task.nextRun])

  useEffect(() => {
    if (!task.enabled) return
    const timer = setInterval(updateCountdown, 60_000)
    return () => clearInterval(timer)
  }, [task.enabled, updateCountdown])

  const ModeIcon = MODE_ICONS[task.mode]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2.5 transition-colors hover:bg-card"
    >
      <Switch
        checked={task.enabled}
        onCheckedChange={() => toggleScheduledTask(task.id)}
      />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{task.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ModeIcon className="h-3 w-3" style={{ color: MODE_COLORS[task.mode] }} />
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {scheduleLabel(task.cronExpression)}
          </Badge>
          {task.lastRun && (
            <span className="text-[10px] text-muted">
              Last: {new Date(task.lastRun).toLocaleDateString()}
            </span>
          )}
          {task.enabled && (
            <span className="text-[10px] text-primary flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {countdown}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted hover:text-foreground"
          onClick={onEdit}
          aria-label={`Edit task "${task.name}"`}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted hover:text-red-400"
          onClick={() => deleteScheduledTask(task.id)}
          aria-label={`Delete task "${task.name}"`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  )
}

export function SchedulerPanel({ onClose }: { onClose: () => void }) {
  const scheduledTasks = useSwarmStore((s) => s.scheduledTasks)
  const addScheduledTask = useSwarmStore((s) => s.addScheduledTask)
  const updateScheduledTask = useSwarmStore((s) => s.updateScheduledTask)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const enabledCount = scheduledTasks.filter((t) => t.enabled).length

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Scheduled Tasks</h2>
          {enabledCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">{enabledCount} active</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => { setShowForm(true); setEditingId(null) }}
          >
            <Plus className="h-3 w-3" />
            New Schedule
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close scheduler panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {showForm && !editingId && (
              <TaskForm
                key="new-form"
                onSave={(task) => {
                  addScheduledTask(task)
                  setShowForm(false)
                }}
                onCancel={() => setShowForm(false)}
              />
            )}

            {scheduledTasks.map((task) =>
              editingId === task.id ? (
                <TaskForm
                  key={`edit-${task.id}`}
                  initial={task}
                  onSave={(updated) => {
                    updateScheduledTask(task.id, updated)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <TaskRow
                  key={task.id}
                  task={task}
                  onEdit={() => setEditingId(task.id)}
                />
              )
            )}
          </AnimatePresence>

          {scheduledTasks.length === 0 && !showForm && (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-xl" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
                  <CalendarClock className="h-7 w-7 text-primary" />
                </div>
              </div>
              <h3 className="text-sm font-semibold text-foreground">No scheduled tasks</h3>
              <p className="mt-1 max-w-[240px] text-xs text-muted">
                Automate recurring prompts on a schedule — from hourly to weekly.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5 text-xs"
                onClick={() => { setShowForm(true); setEditingId(null) }}
              >
                <Plus className="h-3 w-3" />
                New Schedule
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
