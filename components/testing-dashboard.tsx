'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TestTube2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  FileText,
  TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { TestRun } from '@/lib/types'

export function TestingDashboard() {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const { data: runs = [], isLoading, isError } = useQuery<TestRun[]>({
    queryKey: ['test-runs'],
    queryFn: async () => {
      const res = await fetch('/api/tests')
      if (!res.ok) throw new Error('Failed to load test runs')
      return res.json()
    },
    staleTime: 10_000,
  })

  const latestRun = runs[0]
  const failures = latestRun?.failures ?? []

  const trendData = useMemo(() => {
    return [...runs]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20)
      .map((run) => ({
        id: run.id.slice(-6),
        passRate: run.total > 0 ? Math.round((run.passed / run.total) * 100) : 100,
        failed: run.failed,
      }))
  }, [runs])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Testing Dashboard</h2>
        <p className="text-sm text-muted mt-1">Persisted test history, failure drill-down, and run quality trends.</p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Pass-rate Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <p className="text-sm text-muted py-4">No trend data yet.</p>
          ) : (
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="id" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip />
                  <Line type="monotone" dataKey="passRate" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TestTube2 className="h-4 w-4 text-primary" />
              Test Run History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted py-4">Loading test runs…</p>
            ) : isError ? (
              <p className="text-sm text-red-500 py-4">Failed to load test runs.</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted py-4">No test runs yet.</p>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}>
                    <div className="flex items-center gap-2 min-w-0">
                      {expandedRunId === run.id ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
                      <span className="text-xs text-muted truncate">{new Date(run.timestamp).toLocaleString()} • {run.source}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">{run.passed} passed</Badge>
                      {run.failed > 0 && <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">{run.failed} failed</Badge>}
                    </div>
                  </div>
                  {expandedRunId === run.id && (
                    <div className="space-y-2">
                      <div className="text-xs text-muted">{run.total} checks • status: {run.status}</div>
                      <pre className="mt-2 rounded bg-secondary/50 p-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{run.logs}</pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Latest Run Failures
            </CardTitle>
          </CardHeader>
          <CardContent>
            {failures.length === 0 ? (
              <p className="text-sm text-muted py-4">No failures in latest run.</p>
            ) : (
              <ul className="space-y-2">
                {failures.map((f) => (
                  <li key={f.id} className="rounded-lg border border-border p-2.5 hover:bg-secondary/30 transition-colors space-y-1">
                    <div className="flex items-start gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-muted mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground block truncate">{f.testName}</span>
                        {f.file ? (
                          <a
                            className="text-xs text-primary hover:underline"
                            href={`/api/files/${f.file}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {f.file}{f.line ? `:${f.line}` : ''}
                          </a>
                        ) : (
                          <span className="text-xs text-muted">File location unavailable</span>
                        )}
                      </div>
                    </div>
                    {f.message && <p className="text-xs text-muted whitespace-pre-wrap">{f.message}</p>}
                  </li>
                ))}
              </ul>
            )}

            {latestRun && (
              <a
                className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(latestRun.logs)}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="h-3.5 w-3.5" />
                Open raw logs
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
