'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, RefreshCw, Copy, Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface AISummaryProps {
  type: 'ticket' | 'project'
  id: string
  initialSummary?: string
  onSummaryGenerated?: (summary: string) => void
}

export function AISummary({
  type,
  id,
  initialSummary,
  onSummaryGenerated,
}: AISummaryProps) {
  const [summary, setSummary] = useState(initialSummary || '')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const generateSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate summary')
      }

      setSummary(data.summary)
      onSummaryGenerated?.(data.summary)
      toast.success('Summary generated')
    } catch (err) {
      toast.error('Failed to generate summary', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }, [type, id, onSummaryGenerated])

  const handleCopy = useCallback(async () => {
    if (!summary) return
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }, [summary])

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Summary
          </div>
          <div className="flex items-center gap-1">
            {summary && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={generateSummary}
              disabled={loading}
              title="Generate summary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : summary ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground italic">
              Click the refresh button to generate an AI summary
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-2"
              onClick={generateSummary}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate Summary
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface CompactAISummaryProps {
  type: 'ticket' | 'project'
  id: string
  summary?: string
  onSummaryGenerated?: (summary: string) => void
}

export function CompactAISummary({
  type,
  id,
  summary: initialSummary,
  onSummaryGenerated,
}: CompactAISummaryProps) {
  const [summary, setSummary] = useState(initialSummary || '')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const generateSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate summary')
      }

      setSummary(data.summary)
      setExpanded(true)
      onSummaryGenerated?.(data.summary)
    } catch (err) {
      toast.error('Failed to generate summary', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }, [type, id, onSummaryGenerated])

  if (!summary && !loading) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-purple-500 hover:text-purple-400"
        onClick={generateSummary}
      >
        <Sparkles className="h-3 w-3" />
        AI Summary
      </Button>
    )
  }

  return (
    <div className="rounded-md bg-purple-500/5 border border-purple-500/20 p-2">
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" />
        {loading ? (
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : (
          <p
            className={`text-xs text-muted-foreground flex-1 ${
              expanded ? '' : 'line-clamp-2'
            }`}
            onClick={() => setExpanded(!expanded)}
          >
            {summary}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 shrink-0"
          onClick={generateSummary}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  )
}
