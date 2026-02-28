'use client'

import { useState, useEffect, useMemo } from 'react'
import type { AgentInstance, AgentRole } from '@/lib/types'
import { ROLE_LABELS } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Bot, Activity, TrendingUp, Clock, Layers } from 'lucide-react'
import { InfoTooltip, TERM_DEFINITIONS } from '@/components/ui/tooltip'

const PIPELINE_STAGES: AgentRole[] = [
  'researcher',
  'planner',
  'coder',
  'validator',
  'security',
  'synthesizer',
]

interface MonitoringStatsProps {
  agents: AgentInstance[]
  isRunning: boolean
  confidence: number | null
  startedAt: number | null
}

export function MonitoringStats({
  agents,
  isRunning,
  confidence,
  startedAt,
}: MonitoringStatsProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning || startedAt == null) {
      setElapsed(0)
      return
    }
    setElapsed(Date.now() - startedAt)
    const id = setInterval(() => {
      setElapsed(Date.now() - (startedAt ?? Date.now()))
    }, 1000)
    return () => clearInterval(id)
  }, [isRunning, startedAt])

  const activeCount = useMemo(
    () => agents.filter((a) => a.status === 'running' || a.status === 'spawning').length,
    [agents]
  )

  const currentStage = useMemo(() => {
    for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
      const role = PIPELINE_STAGES[i]
      if (agents.some((a) => a.role === role && (a.status === 'running' || a.status === 'spawning'))) {
        return ROLE_LABELS[role]
      }
    }
    for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
      const role = PIPELINE_STAGES[i]
      if (agents.some((a) => a.role === role && a.status === 'completed')) {
        return ROLE_LABELS[role]
      }
    }
    return 'Idle'
  }, [agents])

  const confidenceColor =
    confidence == null
      ? 'text-muted'
      : confidence >= 70
        ? 'text-green-400'
        : confidence >= 40
          ? 'text-yellow-400'
          : 'text-red-400'

  const formatElapsed = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        icon={<Bot className="h-4 w-4 text-primary" />}
        value={String(agents.length)}
        label="Total Agents"
      />
      <StatCard
        icon={<Activity className="h-4 w-4 text-blue-400" />}
        value={String(activeCount)}
        label="Active Now"
        pulse={activeCount > 0}
      />
      <StatCard
        icon={<TrendingUp className={`h-4 w-4 ${confidenceColor}`} />}
        value={confidence != null ? `${confidence}%` : '—'}
        label="Avg Confidence"
        valueClassName={confidenceColor}
        tooltip={TERM_DEFINITIONS.Confidence}
      />
      <StatCard
        icon={<Clock className="h-4 w-4 text-muted" />}
        value={isRunning ? formatElapsed(elapsed) : '—'}
        label="Elapsed Time"
      />
      <StatCard
        icon={<Layers className="h-4 w-4 text-purple-400" />}
        value={currentStage}
        label="Stage"
      />
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  value: string
  label: string
  pulse?: boolean
  valueClassName?: string
  tooltip?: string
}

function StatCard({ icon, value, label, pulse, valueClassName, tooltip }: StatCardProps) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <div className={pulse ? 'animate-pulse' : ''}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-lg font-semibold leading-tight ${valueClassName ?? 'text-foreground'}`}>
          {value}
        </p>
        {tooltip ? (
          <InfoTooltip term={label} description={tooltip} className="text-[11px] text-muted truncate" />
        ) : (
          <p className="text-[11px] text-muted truncate">{label}</p>
        )}
      </div>
    </Card>
  )
}
