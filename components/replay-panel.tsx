'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReplayRun } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

export function ReplayPanel({ runId }: { runId: string }) {
  const [run, setRun] = useState<ReplayRun | null>(null)
  const [idx, setIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRun(null)
    setError(null)
    setIdx(0)
    fetch(`/api/replay/${runId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ReplayRun) => {
        if (!cancelled) setRun(data)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  const current = useMemo(() => {
    if (!run || run.events.length === 0) return null
    return run.events[Math.min(idx, run.events.length - 1)]
  }, [idx, run])

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Replay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!run && !error && <p className="text-xs text-muted">Loading replay…</p>}
        {error && <p className="text-xs text-red-400">Replay unavailable: {error}</p>}
        {run && (
          <>
            <p className="text-xs text-muted">Run {run.id} · {run.status} · {run.events.length} events</p>
            <Slider
              value={Math.min(idx, Math.max(run.events.length - 1, 0))}
              min={0}
              max={Math.max(run.events.length - 1, 0)}
              step={1}
              onValueChange={(v) => setIdx(v)}
            />
            {current && (
              <div className="rounded border border-border p-2 text-xs">
                <div className="font-medium">{current.type}</div>
                <div className="text-muted">{new Date(current.timestamp).toLocaleString()}</div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-secondary/40 p-2">{JSON.stringify(current.payload, null, 2)}</pre>
              </div>
            )}
            <div>
              <Button size="sm" variant="outline" onClick={() => window.open(`/api/replay/${run.id}?export=1`, '_blank')}>
                Download repro bundle
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
