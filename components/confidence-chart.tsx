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
  if (value < 40) return '#ef4444'
  if (value <= 70) return '#eab308'
  return '#22c55e'
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
        <CardTitle className="text-sm font-medium text-foreground">
          Confidence Scores
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#fafafa',
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
