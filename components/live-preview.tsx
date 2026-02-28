'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSwarmStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, ExternalLink, Globe, AlertTriangle } from 'lucide-react'
import { NoDataState } from '@/components/ui/no-data-state'
import { ErrorState } from '@/components/ui/error-state'

function isSelfPreviewTarget(value: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const target = new URL(value)
    const current = new URL(window.location.href)
    if (target.origin !== current.origin) return false
    const path = target.pathname.toLowerCase()
    return path === '/' || path.startsWith('/app') || path.startsWith('/settings')
  } catch {
    return false
  }
}

export function LivePreview() {
  const previewUrl = useSwarmStore((s) => s.previewUrl)
  const setPreviewUrl = useSwarmStore((s) => s.setPreviewUrl)
  const showPreview = useSwarmStore((s) => s.showPreview)

  const [localUrl, setLocalUrl] = useState(previewUrl)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [blockedTarget, setBlockedTarget] = useState<string | null>(null)

  const validateUrl = useCallback((value: string): string | null => {
    if (!value.trim()) return null
    try {
      const parsed = new URL(value)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return 'Use an http or https URL'
      }
      if (isSelfPreviewTarget(value)) {
        setBlockedTarget(value)
        return 'Preview target points to the Fusia AI shell. Use your app URL instead.'
      }
      return null
    } catch {
      return 'Enter a valid URL (example: http://localhost:5173)'
    }
  }, [])

  const handleUrlSubmit = useCallback(() => {
    const trimmed = localUrl.trim()
    const validationError = validateUrl(trimmed)
    setError(validationError)
    if (validationError) return
    setBlockedTarget(null)
    setPreviewUrl(trimmed)
    setRefreshKey((k) => k + 1)
  }, [localUrl, setPreviewUrl, validateUrl])

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const handleOpenExternal = useCallback(() => {
    if (!previewUrl.trim()) return
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }, [previewUrl])

  const handleOpenBlockedOnce = useCallback(() => {
    if (!blockedTarget) return
    setError(null)
    setPreviewUrl(blockedTarget)
    setRefreshKey((k) => k + 1)
  }, [blockedTarget, setPreviewUrl])

  useEffect(() => {
    setLocalUrl(previewUrl)
  }, [previewUrl])

  if (!showPreview) return null

  return (
    <Card className="h-full overflow-hidden border-border bg-card/70">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/20 px-3 py-2">
        <Globe className="h-4 w-4 shrink-0 text-muted" />
        <Input
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUrlSubmit()
          }}
          placeholder={process.env.NEXT_PUBLIC_PREVIEW_URL || 'http://localhost:5173'}
          className="h-8 flex-1 text-xs bg-background"
          data-action-id="preview-url-input"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={handleUrlSubmit}
          title="Apply preview URL"
          data-action-id="preview-apply"
        >
          Apply
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleRefresh}
          title="Refresh preview"
          data-action-id="preview-refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleOpenExternal}
          title="Open preview in new tab"
          data-action-id="preview-open-external"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="relative h-[calc(100%-49px)] min-h-[360px]">
        {error ? (
          <div className="h-full">
            <ErrorState
              title="Preview target is invalid"
              description={error}
              onRetry={handleUrlSubmit}
              retryLabel="Validate URL"
              className="min-h-[320px]"
            />
            {blockedTarget ? (
              <div className="mx-4 -mt-10 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="mb-2 inline-flex items-center gap-1 text-xs text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  This can recurse into the Fusia shell and break preview clarity.
                </p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleOpenBlockedOnce}>
                  Open anyway once
                </Button>
              </div>
            ) : null}
          </div>
        ) : previewUrl.trim() ? (
          <iframe
            key={refreshKey}
            src={previewUrl}
            className="h-full w-full border-0"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <NoDataState
            title="No preview target configured"
            description="Add a local or deployed app URL above to open live preview."
            className="min-h-[320px]"
          />
        )}
      </div>
    </Card>
  )
}
