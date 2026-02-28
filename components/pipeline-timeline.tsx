'use client'

import { useMemo } from 'react'
import { useSwarmStore } from '@/lib/store'
import { ROLE_COLORS } from '@/lib/types'
import type { AgentRole, AgentInstance } from '@/lib/types'
import { formatTime } from '@/lib/utils'
import {
  Search,
  ClipboardList,
  Code2,
  TestTube2,
  Shield,
  Sparkles,
  ChevronRight,
} from 'lucide-react'

const STAGE_ICONS: Record<AgentRole, typeof Search> = {
  researcher: Search,
  planner: ClipboardList,
  coder: Code2,
  validator: TestTube2,
  security: Shield,
  synthesizer: Sparkles,
}

const PIPELINE_STAGES: AgentRole[] = [
  'researcher',
  'planner',
  'coder',
  'validator',
  'security',
  'synthesizer',
]

const STAGE_LABELS: Record<AgentRole, string> = {
  researcher: 'Research',
  planner: 'Plan',
  coder: 'Code',
  validator: 'Validate',
  security: 'Security',
  synthesizer: 'Synthesize',
}

type StageStatus = 'pending' | 'active' | 'completed' | 'failed'

interface StageInfo {
  role: AgentRole
  label: string
  status: StageStatus
  agentCount: number
  elapsed: number | null
  progress: number
}

function computeStages(agents: AgentInstance[]): StageInfo[] {
  return PIPELINE_STAGES.map((role) => {
    const stageAgents = agents.filter((a) => a.role === role)
    const hasRunning = stageAgents.some(
      (a) => a.status === 'running' || a.status === 'spawning'
    )
    const allCompleted =
      stageAgents.length > 0 &&
      stageAgents.every((a) => a.status === 'completed')
    const hasFailed = stageAgents.some((a) => a.status === 'failed')

    let status: StageStatus = 'pending'
    if (hasRunning) status = 'active'
    else if (hasFailed) status = 'failed'
    else if (allCompleted) status = 'completed'

    const completedCount = stageAgents.filter(
      (a) => a.status === 'completed' || a.status === 'failed'
    ).length
    const progress =
      stageAgents.length > 0
        ? Math.round((completedCount / stageAgents.length) * 100)
        : 0

    let elapsed: number | null = null
    if (stageAgents.length > 0) {
      const starts = stageAgents
        .filter((a) => a.startedAt != null)
        .map((a) => a.startedAt as number)
      const ends = stageAgents
        .filter((a) => a.finishedAt != null)
        .map((a) => a.finishedAt as number)
      if (starts.length > 0) {
        const earliest = Math.min(...starts)
        const latest =
          ends.length === stageAgents.length && !hasRunning
            ? Math.max(...ends)
            : Date.now()
        elapsed = latest - earliest
      }
    }

    return {
      role,
      label: STAGE_LABELS[role],
      status,
      agentCount: stageAgents.length,
      elapsed,
      progress,
    }
  })
}

const STATUS_BG: Record<StageStatus, string> = {
  pending: 'bg-zinc-800/50',
  active: 'bg-blue-950/50',
  completed: 'bg-emerald-950/40',
  failed: 'bg-red-950/40',
}

export function PipelineTimeline() {
  const agents = useSwarmStore((s) => s.agents)
  const stages = useMemo(() => computeStages(agents), [agents])

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center gap-1 min-w-[700px] p-2">
        {stages.map((stage, idx) => {
          const Icon = STAGE_ICONS[stage.role]
          const color = ROLE_COLORS[stage.role]
          const isActive = stage.status === 'active'
          const isCompleted = stage.status === 'completed'
          const isFailed = stage.status === 'failed'

          return (
            <div key={stage.role} className="flex items-center flex-1 min-w-0">
              <div
                className={`relative flex-1 rounded-lg border p-3 transition-all duration-300 ${STATUS_BG[stage.status]} ${
                  isActive
                    ? 'border-blue-500/50 shadow-lg shadow-blue-500/10 animate-gradient-shift'
                    : isCompleted
                      ? 'border-emerald-500/30'
                      : isFailed
                        ? 'border-red-500/30'
                        : 'border-zinc-700/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color }}
                  />
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: isActive || isCompleted || isFailed ? color : '#a1a1aa' }}
                  >
                    {stage.label}
                  </span>
                  {stage.agentCount > 0 && (
                    <span
                      className="ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5"
                      style={{
                        backgroundColor: `${color}20`,
                        color,
                      }}
                    >
                      &times;{stage.agentCount}
                    </span>
                  )}
                </div>

                <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${isCompleted ? 100 : stage.progress}%`,
                      backgroundColor: isFailed ? '#ef4444' : color,
                      opacity: stage.status === 'pending' ? 0 : 1,
                    }}
                  />
                </div>

                {stage.elapsed != null && (
                  <span className="text-[10px] text-muted mt-1 block">
                    {formatTime(stage.elapsed)}
                  </span>
                )}

                {isActive && (
                  <div
                    className="absolute inset-0 rounded-lg pointer-events-none"
                    style={{
                      background: `linear-gradient(135deg, ${color}08 0%, transparent 60%)`,
                    }}
                  />
                )}
              </div>

              {idx < stages.length - 1 && (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted mx-0.5" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
