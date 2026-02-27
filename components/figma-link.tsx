'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Figma, Plus, ExternalLink, Trash2, Loader2, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { FigmaLink } from '@/lib/types'

interface FigmaLinksProps {
  links: FigmaLink[]
  onAdd: (link: FigmaLink) => void
  onRemove: (id: string) => void
  disabled?: boolean
}

export function FigmaLinks({ links, onAdd, onRemove, disabled }: FigmaLinksProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAdd = useCallback(async () => {
    if (!url.trim()) return

    setLoading(true)
    try {
      const res = await fetch(`/api/figma?url=${encodeURIComponent(url)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch Figma data')
      }

      onAdd({
        id: crypto.randomUUID(),
        url,
        fileKey: data.fileKey,
        nodeId: data.nodeId,
        name: data.name,
        thumbnailUrl: data.thumbnailUrl,
        lastModified: data.lastModified,
      })
      setUrl('')
      toast.success('Figma link added')
    } catch (err) {
      toast.error('Failed to add Figma link', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }, [url, onAdd])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading && url.trim()) {
        handleAdd()
      }
    },
    [handleAdd, loading, url]
  )

  return (
    <div className="space-y-3">
      {!disabled && (
        <div className="flex gap-2">
          <Input
            placeholder="Paste Figma URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={handleAdd} disabled={loading || !url.trim()} size="icon">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      {links.length === 0 ? (
        <div className="text-center py-6 text-muted">
          <Figma className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No Figma links yet</p>
          {!disabled && (
            <p className="text-xs mt-1">Paste a Figma URL above to link a design</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <Card key={link.id} className="border-border">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  {link.thumbnailUrl ? (
                    <img
                      src={link.thumbnailUrl}
                      alt={link.name}
                      className="w-16 h-12 object-cover rounded border border-border"
                    />
                  ) : (
                    <div className="w-16 h-12 rounded border border-border bg-secondary/50 flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Figma className="h-4 w-4 text-purple-500 shrink-0" />
                      <span className="text-sm font-medium truncate">{link.name}</span>
                    </div>
                    {link.lastModified && (
                      <p className="text-xs text-muted mt-0.5">
                        Modified {new Date(link.lastModified).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    {!disabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                        onClick={() => onRemove(link.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
