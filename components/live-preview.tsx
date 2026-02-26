'use client'

import { useState, useCallback } from 'react'
import { useSwarmStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, ExternalLink, X, Globe } from 'lucide-react'

export function LivePreview() {
  const previewUrl = useSwarmStore((s) => s.previewUrl)
  const setPreviewUrl = useSwarmStore((s) => s.setPreviewUrl)
  const showPreview = useSwarmStore((s) => s.showPreview)
  const togglePreview = useSwarmStore((s) => s.togglePreview)

  const [localUrl, setLocalUrl] = useState(previewUrl)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleUrlSubmit = useCallback(() => {
    const trimmed = localUrl.trim()
    if (trimmed) {
      setPreviewUrl(trimmed)
      setRefreshKey((k) => k + 1)
    }
  }, [localUrl, setPreviewUrl])

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const handleOpenExternal = useCallback(() => {
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }, [previewUrl])

  if (!showPreview) return null

  return (
    <Card className="overflow-hidden border-border">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-3 py-2">
        <Globe className="h-4 w-4 shrink-0 text-muted" />
        <Input
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUrlSubmit()
          }}
          placeholder="http://localhost:3001"
          className="h-7 flex-1 text-xs bg-background"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleRefresh}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleOpenExternal}
          title="Open in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={togglePreview}
          title="Close preview"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="relative" style={{ minHeight: '400px' }}>
        {previewUrl.trim() ? (
          <iframe
            key={refreshKey}
            src={previewUrl}
            className="h-full w-full border-0"
            style={{ minHeight: '400px' }}
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-muted">
            Set a preview URL in the toolbar to see your app live
          </div>
        )}
      </div>
    </Card>
  )
}
