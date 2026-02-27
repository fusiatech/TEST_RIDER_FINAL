'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSwarmStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Folder, FolderOpen, ChevronRight, Home, RefreshCw, Loader2, FolderX } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface DirectoryEntry {
  name: string
  type: 'file' | 'directory'
  path: string
}

interface FolderPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPath?: string
}

export function FolderPicker({ open, onOpenChange, initialPath = '' }: FolderPickerProps) {
  const updateSettings = useSwarmStore((s) => s.updateSettings)
  
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [inputPath, setInputPath] = useState(initialPath)
  const [directories, setDirectories] = useState<DirectoryEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDirectories = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (path) {
        params.set('path', path)
      }
      const res = await fetch(`/api/files?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch directories')
      }
      const entries: DirectoryEntry[] = await res.json()
      const dirs = entries.filter((e) => e.type === 'directory')
      setDirectories(dirs)
      setCurrentPath(path)
      setInputPath(path)
      setSelectedPath(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch directories'
      setError(message)
      setDirectories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void fetchDirectories(initialPath)
    }
  }, [open, initialPath, fetchDirectories])

  const handleNavigate = useCallback((path: string) => {
    void fetchDirectories(path)
  }, [fetchDirectories])

  const handleBreadcrumbClick = useCallback((index: number) => {
    const parts = currentPath.split('/').filter(Boolean)
    const newPath = parts.slice(0, index + 1).join('/')
    void fetchDirectories(newPath)
  }, [currentPath, fetchDirectories])

  const handleGoToRoot = useCallback(() => {
    void fetchDirectories('')
  }, [fetchDirectories])

  const handleInputSubmit = useCallback(() => {
    void fetchDirectories(inputPath)
  }, [inputPath, fetchDirectories])

  const handleSelect = useCallback(() => {
    const pathToSelect = selectedPath ?? currentPath
    updateSettings({ projectPath: pathToSelect || '.' })
    toast.success('Project folder updated', {
      description: pathToSelect || 'Root directory',
    })
    onOpenChange(false)
  }, [selectedPath, currentPath, updateSettings, onOpenChange])

  const handleDirectoryClick = useCallback((dir: DirectoryEntry) => {
    setSelectedPath(dir.path)
  }, [])

  const handleDirectoryDoubleClick = useCallback((dir: DirectoryEntry) => {
    handleNavigate(dir.path)
  }, [handleNavigate])

  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Select Project Folder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleInputSubmit()
                }
              }}
              placeholder="Enter path or browse below..."
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleInputSubmit}
              className="shrink-0"
            >
              Go
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void fetchDirectories(currentPath)}
              disabled={loading}
              className="shrink-0"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border bg-card/50 px-2 py-1.5 overflow-x-auto">
            <button
              onClick={handleGoToRoot}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-secondary hover:text-foreground transition-colors shrink-0"
            >
              <Home className="h-3 w-3" />
              Root
            </button>
            {breadcrumbs.map((part, index) => (
              <div key={index} className="flex items-center shrink-0">
                <ChevronRight className="h-3 w-3 text-muted" />
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs transition-colors',
                    index === breadcrumbs.length - 1
                      ? 'text-foreground font-medium'
                      : 'text-muted hover:bg-secondary hover:text-foreground'
                  )}
                >
                  {part}
                </button>
              </div>
            ))}
          </div>

          <ScrollArea className="h-64 rounded-md border border-border">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted" />
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center p-4">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : directories.length === 0 ? (
              <EmptyState
                icon={<FolderX />}
                title="No subdirectories"
                description="This folder has no subdirectories"
                className="h-full p-4"
              />
            ) : (
              <div className="p-2">
                {directories.map((dir) => (
                  <button
                    key={dir.path}
                    onClick={() => handleDirectoryClick(dir)}
                    onDoubleClick={() => handleDirectoryDoubleClick(dir)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      selectedPath === dir.path
                        ? 'bg-primary/20 text-foreground'
                        : 'hover:bg-secondary text-muted hover:text-foreground'
                    )}
                  >
                    <Folder className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{dir.name}</span>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {selectedPath && (
            <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate">{selectedPath}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelect}>
            {selectedPath ? 'Select Folder' : 'Select Current'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
