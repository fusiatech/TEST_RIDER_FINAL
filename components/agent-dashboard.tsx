'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useSwarmStore } from '@/lib/store'
import { AgentCard } from '@/components/agent-card'
import { MonitoringStats } from '@/components/monitoring-stats'
import { ConfidenceChart } from '@/components/confidence-chart'
import { ErrorPanel } from '@/components/error-panel'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/types'
import type { AgentRole, AgentInstance } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Zap, ChevronDown, ChevronUp, Terminal, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

const PIPELINE_STAGES: { role: AgentRole; label: string }[] = [
  { role: 'researcher', label: 'Research' },
  { role: 'planner', label: 'Plan' },
  { role: 'coder', label: 'Code' },
  { role: 'validator', label: 'Validate' },
  { role: 'security', label: 'Security' },
  { role: 'synthesizer', label: 'Synthesize' },
]

function getActiveStage(agents: { role: AgentRole; status: string }[]): number {
  for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
    const stage = PIPELINE_STAGES[i]
    const hasActive = agents.some(
      (a) => a.role === stage.role && (a.status === 'running' || a.status === 'spawning')
    )
    if (hasActive) return i
  }
  for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
    const stage = PIPELINE_STAGES[i]
    const hasCompleted = agents.some(
      (a) => a.role === stage.role && a.status === 'completed'
    )
    if (hasCompleted) return i
  }
  return 0
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
}

interface LogEntry {
  id: string
  agentName: string
  roleColor: string
  text: string
  timestamp: number
}

const MAX_LOG_LINES = 200

interface StatsRingDatum {
  name: string
  value: number
  color: string
}

function StatsRing({ agents }: { agents: AgentInstance[] }) {
  const data = useMemo<StatsRingDatum[]>(() => {
    const completed = agents.filter((a) => a.status === 'completed').length
    const running = agents.filter(
      (a) => a.status === 'running' || a.status === 'spawning'
    ).length
    const failed = agents.filter((a) => a.status === 'failed').length
    const pending = agents.filter(
      (a) => a.status === 'pending' || a.status === 'cancelled'
    ).length

    const entries: StatsRingDatum[] = []
    if (completed > 0) entries.push({ name: 'Completed', value: completed, color: '#22c55e' })
    if (running > 0) entries.push({ name: 'Running', value: running, color: '#3b82f6' })
    if (failed > 0) entries.push({ name: 'Failed', value: failed, color: '#ef4444' })
    if (pending > 0) entries.push({ name: 'Pending', value: pending, color: '#71717a' })
    if (entries.length === 0) entries.push({ name: 'None', value: 1, color: '#27272a' })
    return entries
  }, [agents])

  const completed = agents.filter((a) => a.status === 'completed').length

  return (
    <Card className="flex flex-col items-center justify-center p-4">
      <CardHeader className="px-0 py-0 pb-1">
        <CardTitle className="text-sm font-medium text-foreground">Agent Status</CardTitle>
      </CardHeader>
      <div className="relative h-[140px] w-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={60}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">{completed}</span>
          <span className="text-[10px] text-muted">/ {agents.length}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.filter((d) => d.name !== 'None').map((d) => (
          <div key={d.name} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-[10px] text-muted">{d.name}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PipelineProgress({
  agents,
  isRunning,
}: {
  agents: AgentInstance[]
  isRunning: boolean
}) {
  const activeStageIdx = useMemo(() => getActiveStage(agents), [agents])
  const activeStage = PIPELINE_STAGES[activeStageIdx]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">
            Stage {activeStageIdx + 1}/{PIPELINE_STAGES.length}: {activeStage.label}
          </span>
        </div>
        <span className="text-xs text-muted">
          {agents.filter((a) => a.status === 'completed').length}/{agents.length} agents
          completed
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
        {PIPELINE_STAGES.map((stage, i) => {
          const stageAgents = agents.filter((a) => a.role === stage.role)
          const completed =
            stageAgents.length > 0 &&
            stageAgents.every(
              (a) => a.status === 'completed' || a.status === 'failed'
            )
          const active = stageAgents.some(
            (a) => a.status === 'running' || a.status === 'spawning'
          )
          const width = 100 / PIPELINE_STAGES.length

          return (
            <div
              key={stage.role}
              className="absolute top-0 h-full transition-all duration-500"
              style={{
                left: `${i * width}%`,
                width: `${width}%`,
                backgroundColor:
                  completed || active ? ROLE_COLORS[stage.role] : 'transparent',
                opacity: completed ? 1 : active ? 0.5 : 0,
              }}
            />
          )
        })}
        {isRunning && (
          <div
            className="absolute top-0 h-full animate-gradient-pulse"
            style={{
              left: `${(activeStageIdx / PIPELINE_STAGES.length) * 100}%`,
              width: `${100 / PIPELINE_STAGES.length}%`,
              background: `linear-gradient(90deg, transparent, ${ROLE_COLORS[activeStage.role]}60, transparent)`,
            }}
          />
        )}
      </div>
      <div className="flex justify-between">
        {PIPELINE_STAGES.map((stage, i) => (
          <span
            key={stage.role}
            className="text-[10px] font-medium transition-colors"
            style={{
              color:
                i <= activeStageIdx ? ROLE_COLORS[stage.role] : '#71717a',
            }}
          >
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function LiveLogFeed({ agents }: { agents: AgentInstance[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const prevOutputsRef = useRef<Map<string, number>>(new Map())

  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLogs = useCallback((newEntries: LogEntry[]) => {
    setLogs((prev) => {
      const combined = [...prev, ...newEntries]
      if (combined.length > MAX_LOG_LINES) {
        return combined.slice(combined.length - MAX_LOG_LINES)
      }
      return combined
    })
  }, [])

  useEffect(() => {
    const newEntries: LogEntry[] = []
    for (const agent of agents) {
      const prevLen = prevOutputsRef.current.get(agent.id) ?? 0
      const raw = agent.output
      if (raw.length > prevLen) {
        const newText = raw.slice(prevLen)
        const lines = stripAnsi(newText)
          .split('\n')
          .filter((l) => l.trim().length > 0)

        for (const line of lines) {
          newEntries.push({
            id: `${agent.id}-${Date.now()}-${Math.random()}`,
            agentName: agent.label || ROLE_LABELS[agent.role],
            roleColor: ROLE_COLORS[agent.role],
            text: line,
            timestamp: Date.now(),
          })
        }
        prevOutputsRef.current.set(agent.id, raw.length)
      }
    }
    if (newEntries.length > 0) {
      addLogs(newEntries)
    }
  }, [agents, addLogs])

  useEffect(() => {
    if (logRef.current && isOpen) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, isOpen])

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <Card className="overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 rounded-none"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Live Log Feed</span>
          <span className="text-[10px] text-muted">({logs.length} lines)</span>
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
            key="log-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              ref={logRef}
              className="max-h-60 overflow-auto border-t border-border bg-[#0d0d0d] p-3 font-mono text-xs leading-relaxed"
            >
              {logs.length === 0 ? (
                <span className="text-muted italic">No output yet...</span>
              ) : (
                logs.map((entry) => (
                  <div key={entry.id} className="flex gap-2">
                    <span className="shrink-0 text-muted">
                      {formatTime(entry.timestamp)}
                    </span>
                    <span
                      className="shrink-0 font-semibold"
                      style={{ color: entry.roleColor }}
                    >
                      [{entry.agentName}]
                    </span>
                    <span className="text-muted break-all">{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export function AgentDashboard() {
  const agents = useSwarmStore((s) => s.agents)
  const isRunning = useSwarmStore((s) => s.isRunning)
  const confidence = useSwarmStore((s) => s.confidence)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const uiPreferences = useSwarmStore((s) => s.uiPreferences)
  const updateUIPreferences = useSwarmStore((s) => s.updateUIPreferences)

  const swarmStartedAt = useMemo(() => {
    if (agents.length === 0) return null
    const timestamps = agents
      .map((a) => a.startedAt)
      .filter((t): t is number => t != null)
    return timestamps.length > 0 ? Math.min(...timestamps) : null
  }, [agents])

  const activeCount = agents.filter((a) => a.status === 'running' || a.status === 'spawning').length
  const failedCount = agents.filter((a) => a.status === 'failed').length
  const completedCount = agents.filter((a) => a.status === 'completed').length
  const successRate = agents.length > 0 ? Math.round((completedCount / agents.length) * 100) : 0
  const experienceLabel = uiPreferences.experienceLevel === 'expert' ? 'Expert' : 'Guided'

  if (agents.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-3xl bg-primary/5 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <Bot className="h-10 w-10 text-primary" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No active agents
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Start in Chat to plan, build, test, and validate with adaptive multi-agent execution.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setActiveTab('chat')}
          >
            <MessageCircle className="h-4 w-4" />
            Go to Chat
          </Button>
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() =>
              void updateUIPreferences({
                experienceLevel: uiPreferences.experienceLevel === 'expert' ? 'guided' : 'expert',
              })
            }
          >
            {experienceLabel} Mode
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <Card className="border-border bg-card/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Mission Control</p>
            <h2 className="text-xl font-semibold text-foreground">Main Dashboard</h2>
            <p className="text-sm text-muted">
              {uiPreferences.experienceLevel === 'guided'
                ? 'Follow the next actions to move from plan to shipped output with fewer decisions.'
                : 'Inspect execution telemetry, compare outcomes, and drive fast iteration loops.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{experienceLabel} Experience</Badge>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setActiveTab('chat')}>
              <MessageCircle className="h-4 w-4" />
              Prompt Agents
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setActiveTab('observability')}>
              <Terminal className="h-4 w-4" />
              Open Observability
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void updateUIPreferences({
                  experienceLevel: uiPreferences.experienceLevel === 'expert' ? 'guided' : 'expert',
                })
              }
            >
              Switch to {uiPreferences.experienceLevel === 'expert' ? 'Guided' : 'Expert'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="border-border p-3">
          <p className="text-xs text-muted">Active</p>
          <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
        </Card>
        <Card className="border-border p-3">
          <p className="text-xs text-muted">Completed</p>
          <p className="text-2xl font-semibold text-foreground">{completedCount}</p>
        </Card>
        <Card className="border-border p-3">
          <p className="text-xs text-muted">Failures</p>
          <p className="text-2xl font-semibold text-foreground">{failedCount}</p>
        </Card>
        <Card className="border-border p-3">
          <p className="text-xs text-muted">Success Rate</p>
          <p className="text-2xl font-semibold text-foreground">{successRate}%</p>
        </Card>
        <Card className="border-border p-3">
          <p className="text-xs text-muted">Confidence</p>
          <p className="text-2xl font-semibold text-foreground">{confidence ?? 0}%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_200px]">
        <Card className="border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Execution Lane</h3>
            <span className="text-xs text-muted">{isRunning ? 'Run in progress' : 'Idle'}</span>
          </div>
          <PipelineProgress agents={agents} isRunning={isRunning} />
        </Card>
        <StatsRing agents={agents} />
      </div>

      <MonitoringStats
        agents={agents}
        isRunning={isRunning}
        confidence={confidence}
        startedAt={swarmStartedAt}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </AnimatePresence>
      </div>

      {(confidence != null || agents.some((a) => a.status === 'completed')) && (
        <ConfidenceChart agents={agents} confidence={confidence} />
      )}

      {uiPreferences.experienceLevel === 'expert' ? (
        <>
          <LiveLogFeed agents={agents} />
          <ErrorPanel />
        </>
      ) : (
        <Card className="border-border p-4">
          <CardHeader className="px-0 pb-2 pt-0">
            <CardTitle className="text-sm font-semibold">Diagnostics</CardTitle>
          </CardHeader>
          <p className="text-sm text-muted">
            Expert diagnostics are hidden in Guided mode. Switch to Expert for raw logs and detailed failure traces.
          </p>
        </Card>
      )}
    </div>
  )
}
