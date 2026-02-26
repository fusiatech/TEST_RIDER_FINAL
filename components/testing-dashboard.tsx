'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TestTube2, ChevronDown, ChevronRight, AlertTriangle, ExternalLink } from 'lucide-react'

interface TestRun {
  id: string
  timestamp: number
  passed: number
  failed: number
  total: number
  logs: string
}

const PLACEHOLDER_RUNS: TestRun[] = [
  { id: '1', timestamp: Date.now() - 60000, passed: 12, failed: 2, total: 14, logs: 'Placeholder logs...\nnpm run test\n✓ 12 passed\n✗ 2 failed' },
  { id: '2', timestamp: Date.now() - 120000, passed: 14, failed: 0, total: 14, logs: 'Placeholder logs...\nAll tests passed.' },
]

const PLACEHOLDER_FAILURES = [
  { id: 'f1', name: 'Auth flow should validate token', file: 'auth.test.ts', line: 42 },
  { id: 'f2', name: 'API should return 404 for missing resource', file: 'api.test.ts', line: 18 },
]

export function TestingDashboard() {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const runs = PLACEHOLDER_RUNS
  const failures = PLACEHOLDER_FAILURES

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Testing Dashboard</h2>
        <p className="text-sm text-muted mt-1">Test history, failures, and coverage (placeholder)</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TestTube2 className="h-4 w-4 text-primary" />
              Test History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.length === 0 ? (
              <p className="text-sm text-muted py-4">No test runs yet.</p>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}>
                    <div className="flex items-center gap-2">
                      {expandedRunId === run.id ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
                      <span className="text-xs text-muted">{new Date(run.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">{run.passed} passed</Badge>
                      {run.failed > 0 && <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">{run.failed} failed</Badge>}
                    </div>
                  </div>
                  {expandedRunId === run.id && (
                    <pre className="mt-2 rounded bg-secondary/50 p-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">{run.logs}</pre>
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
              Failures
            </CardTitle>
          </CardHeader>
          <CardContent>
            {failures.length === 0 ? (
              <p className="text-sm text-muted py-4">No failures.</p>
            ) : (
              <ul className="space-y-2">
                {failures.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5 hover:bg-secondary/30 transition-colors">
                    <ExternalLink className="h-3.5 w-3.5 text-muted mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground block truncate">{f.name}</span>
                      <span className="text-xs text-muted">{f.file}:{f.line}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
