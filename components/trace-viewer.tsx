'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Clock, Activity, ChevronRight, ChevronDown, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpanTag {
  key: string
  value: string
}

interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  operationName: string
  serviceName: string
  duration: number
  startTime: number
  tags: SpanTag[]
  status?: 'ok' | 'error' | 'unset'
  children: Span[]
}

interface TraceResponse {
  traceId: string
  rootSpan: Span
  spanCount: number
  duration: number
  services: string[]
}

function formatDuration(microseconds: number): string {
  if (microseconds < 1000) {
    return `${microseconds}μs`
  } else if (microseconds < 1000000) {
    return `${(microseconds / 1000).toFixed(2)}ms`
  } else {
    return `${(microseconds / 1000000).toFixed(2)}s`
  }
}

function SpanTree({ 
  span, 
  depth = 0, 
  totalDuration,
  expanded,
  onToggle 
}: { 
  span: Span
  depth?: number
  totalDuration: number
  expanded: Set<string>
  onToggle: (spanId: string) => void
}) {
  const hasChildren = span.children && span.children.length > 0
  const isExpanded = expanded.has(span.spanId)
  const widthPercent = totalDuration > 0 ? (span.duration / totalDuration) * 100 : 0
  const isError = span.status === 'error' || span.tags.some(t => t.key === 'error' && t.value === 'true')

  return (
    <div className="font-mono text-sm">
      <div 
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors',
          isError && 'bg-destructive/10'
        )}
        style={{ paddingLeft: depth * 20 + 8 }}
        onClick={() => hasChildren && onToggle(span.spanId)}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted shrink-0" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'font-medium truncate',
              isError && 'text-destructive'
            )}>
              {span.operationName}
            </span>
            {isError && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="truncate">{span.serviceName}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(span.duration)}
            </span>
          </div>
        </div>

        <div className="w-32 shrink-0">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full rounded-full',
                isError ? 'bg-destructive' : 'bg-primary'
              )}
              style={{ width: `${Math.max(widthPercent, 2)}%` }}
            />
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="border-l border-border ml-4">
          {span.children.map((child) => (
            <SpanTree 
              key={child.spanId} 
              span={child} 
              depth={depth + 1}
              totalDuration={totalDuration}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TraceStats({ trace }: { trace: TraceResponse }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-4">
      <div className="p-3 bg-secondary/30 rounded-lg">
        <div className="text-xs text-muted mb-1">Trace ID</div>
        <div className="font-mono text-sm truncate" title={trace.traceId}>
          {trace.traceId.slice(0, 16)}...
        </div>
      </div>
      <div className="p-3 bg-secondary/30 rounded-lg">
        <div className="text-xs text-muted mb-1">Duration</div>
        <div className="font-medium">{formatDuration(trace.duration)}</div>
      </div>
      <div className="p-3 bg-secondary/30 rounded-lg">
        <div className="text-xs text-muted mb-1">Spans</div>
        <div className="font-medium">{trace.spanCount}</div>
      </div>
      <div className="p-3 bg-secondary/30 rounded-lg">
        <div className="text-xs text-muted mb-1">Services</div>
        <div className="font-medium">{trace.services.length}</div>
      </div>
    </div>
  )
}

export function TraceViewer() {
  const [traceId, setTraceId] = useState('')
  const [trace, setTrace] = useState<TraceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchTrace = useCallback(async () => {
    if (!traceId.trim()) {
      setError('Please enter a trace ID')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/traces/${traceId.trim()}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Trace not found. Make sure the trace ID is correct and Tempo is running.')
        } else {
          const data = await res.json().catch(() => ({}))
          setError(data.error || `Failed to fetch trace (${res.status})`)
        }
        setTrace(null)
        return
      }
      
      const data = await res.json()
      setTrace(data)
      
      // Expand root span by default
      if (data.rootSpan) {
        setExpanded(new Set([data.rootSpan.spanId]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trace')
      setTrace(null)
    } finally {
      setLoading(false)
    }
  }, [traceId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      fetchTrace()
    }
  }

  const toggleSpan = useCallback((spanId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(spanId)) {
        next.delete(spanId)
      } else {
        next.add(spanId)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    if (!trace?.rootSpan) return
    
    const allIds = new Set<string>()
    const collectIds = (span: Span) => {
      allIds.add(span.spanId)
      span.children?.forEach(collectIds)
    }
    collectIds(trace.rootSpan)
    setExpanded(allIds)
  }, [trace])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Trace Viewer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Enter trace ID (e.g., abc123def456...)"
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono"
          />
          <Button onClick={fetchTrace} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Search
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {trace && (
          <>
            <TraceStats trace={trace} />
            
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted">Span Hierarchy</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll}>
                  Expand All
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  Collapse All
                </Button>
              </div>
            </div>
            
            <div className="border border-border rounded-lg overflow-hidden">
              <SpanTree 
                span={trace.rootSpan} 
                totalDuration={trace.duration}
                expanded={expanded}
                onToggle={toggleSpan}
              />
            </div>
          </>
        )}

        {!trace && !error && !loading && (
          <div className="text-center py-8 text-muted">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Enter a trace ID to view the distributed trace</p>
            <p className="text-xs mt-2">
              Trace IDs can be found in log entries or the Grafana Tempo UI
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
