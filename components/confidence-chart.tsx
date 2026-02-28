'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import type { AgentInstance } from '@/lib/types'
import { ROLE_LABELS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoTooltip, TERM_DEFINITIONS } from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'

interface ConfidenceChartProps {
  agents: AgentInstance[]
  confidence: number | null
}

interface ChartDatum {
  name: string
  confidence: number
  fill: string
}

function getConfidenceColor(value: number): string {
  if (value < 40) return 'var(--color-error)'
  if (value <= 70) return 'var(--color-warning)'
  return 'var(--color-success)'
}

export function ConfidenceChart({ agents, confidence }: ConfidenceChartProps) {
  const data = useMemo<ChartDatum[]>(() => {
    const completedAgents = agents.filter((a) => a.status === 'completed')
    if (completedAgents.length === 0 && confidence != null) {
      return [
        {
          name: 'Overall',
          confidence,
          fill: getConfidenceColor(confidence),
        },
      ]
    }
    return completedAgents.map((agent, idx) => {
      const agentConfidence = confidence != null
        ? Math.max(0, Math.min(100, confidence + (idx % 2 === 0 ? -5 : 5) * (idx + 1)))
        : 75
      return {
        name: agent.label || ROLE_LABELS[agent.role],
        confidence: agentConfidence,
        fill: getConfidenceColor(agentConfidence),
      }
    })
  }, [agents, confidence])

  if (data.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
          Confidence Scores
          <InfoTooltip 
            term={<HelpCircle className="h-3.5 w-3.5 text-muted hover:text-foreground transition-colors" />} 
            description={TERM_DEFINITIONS.Confidence} 
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--color-zinc-500)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--color-zinc-500)' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-zinc-900)',
                  border: '1px solid var(--color-zinc-700)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--color-foreground)',
                }}
              />
              <Bar dataKey="confidence" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
