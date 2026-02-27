'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSwarmStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Search, File, X, Loader2, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface SearchResult {
  filePath: string
  fileName: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

interface GroupedResults {
  filePath: string
  fileName: string
  matches: SearchResult[]
  expanded: boolean
}

function highlightMatch(text: string, start: number, end: number): React.ReactNode {
  if (start < 0 || end > text.length || start >= end) return text
  
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-yellow-500/30 text-foreground rounded px-0.5">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  )
}

interface FileSearchPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FileSearchPanel({ open, onOpenChange }: FileSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const settings = useSwarmStore((s) => s.settings)
  const openFileInIde = useSwarmStore((s) => s.openFileInIde)

  const groupedResults = useMemo((): GroupedResults[] => {
    const groups = new Map<string, SearchResult[]>()
    
    for (const result of results) {
      const existing = groups.get(result.filePath)
      if (existing) {
        existing.push(result)
      } else {
        groups.set(result.filePath, [result])
      }
    }
    
    return Array.from(groups.entries()).map(([filePath, matches]) => ({
      filePath,
      fileName: filePath.split(/[/\\]/).pop() || filePath,
      matches,
      expanded: expandedFiles.has(filePath),
    }))
  }, [results, expandedFiles])

  const flatResults = useMemo(() => {
    const flat: { type: 'file' | 'match'; filePath: string; result?: SearchResult }[] = []
    for (const group of groupedResults) {
      flat.push({ type: 'file', filePath: group.filePath })
      if (group.expanded) {
        for (const match of group.matches) {
          flat.push({ type: 'match', filePath: group.filePath, result: match })
        }
      }
    }
    return flat
  }, [groupedResults])

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !settings.projectPath) {
      setResults([])
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/files/search?q=${encodeURIComponent(searchQuery)}&path=${encodeURIComponent(settings.projectPath)}`)
      if (!res.ok) {
        setResults([])
        return
      }
      const data = await res.json() as { results: SearchResult[] }
      setResults(data.results || [])
      
      const filePaths = new Set(data.results?.map((r: SearchResult) => r.filePath) || [])
      setExpandedFiles(filePaths)
      setSelectedIndex(0)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [settings.projectPath])

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    debounceRef.current = setTimeout(() => {
      void performSearch(value)
    }, 300)
  }, [performSearch])

  const toggleFileExpanded = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }, [])

  const handleOpenFile = useCallback(async (result: SearchResult) => {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(result.filePath)}`)
      if (!res.ok) return
      
      const content = await res.text()
      const ext = result.filePath.split('.').pop() || ''
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        rs: 'rust',
        go: 'go',
        java: 'java',
        css: 'css',
        scss: 'scss',
        html: 'html',
        json: 'json',
        md: 'markdown',
        yaml: 'yaml',
        yml: 'yaml',
      }
      const language = languageMap[ext] || 'plaintext'
      
      openFileInIde(result.filePath, content, language)
      onOpenChange(false)
    } catch {
      // Failed to open file
    }
  }, [openFileInIde, onOpenChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        const selected = flatResults[selectedIndex]
        if (selected) {
          if (selected.type === 'file') {
            toggleFileExpanded(selected.filePath)
          } else if (selected.result) {
            void handleOpenFile(selected.result)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        onOpenChange(false)
        break
    }
  }, [flatResults, selectedIndex, toggleFileExpanded, handleOpenFile, onOpenChange])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (listRef.current && flatResults.length > 0) {
      const items = listRef.current.querySelectorAll('[data-search-item]')
      const selectedElement = items[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, flatResults.length])

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (modKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open, onOpenChange])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search in files..."
            className="flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted outline-none focus-visible:ring-0 shadow-none"
          />
          {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
          {query && !isSearching && (
            <button
              onClick={() => {
                setQuery('')
                setResults([])
              }}
              className="rounded p-0.5 hover:bg-secondary"
            >
              <X className="h-3.5 w-3.5 text-muted" />
            </button>
          )}
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div ref={listRef} className="p-2">
            {!settings.projectPath ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <FolderOpen className="h-8 w-8 text-muted" />
                <p className="text-sm text-muted">Open a project folder to search files</p>
              </div>
            ) : results.length === 0 && query && !isSearching ? (
              <div className="py-8 text-center text-sm text-muted">
                No results found for &quot;{query}&quot;
              </div>
            ) : results.length === 0 && !query ? (
              <div className="py-8 text-center text-sm text-muted">
                Type to search across all project files
              </div>
            ) : (
              <>
                {groupedResults.map((group, groupIndex) => {
                  const fileItemIndex = flatResults.findIndex(
                    (f) => f.type === 'file' && f.filePath === group.filePath
                  )
                  
                  return (
                    <div key={group.filePath} className="mb-2">
                      <button
                        data-search-item
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                          fileItemIndex === selectedIndex
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted hover:bg-secondary hover:text-foreground'
                        )}
                        onClick={() => toggleFileExpanded(group.filePath)}
                      >
                        {group.expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <File className="h-4 w-4 shrink-0 text-muted" />
                        <span className="flex-1 text-sm font-medium truncate">
                          {group.fileName}
                        </span>
                        <span className="text-xs text-muted">
                          {group.matches.length} match{group.matches.length !== 1 ? 'es' : ''}
                        </span>
                      </button>
                      
                      {group.expanded && (
                        <div className="ml-6 mt-1 space-y-1">
                          {group.matches.map((result, matchIndex) => {
                            const matchItemIndex = flatResults.findIndex(
                              (f) =>
                                f.type === 'match' &&
                                f.result?.filePath === result.filePath &&
                                f.result?.lineNumber === result.lineNumber
                            )
                            
                            return (
                              <button
                                key={`${result.filePath}:${result.lineNumber}:${matchIndex}`}
                                data-search-item
                                className={cn(
                                  'flex w-full items-start gap-2 rounded-lg px-3 py-1.5 text-left transition-colors',
                                  matchItemIndex === selectedIndex
                                    ? 'bg-primary/10 text-foreground'
                                    : 'text-muted hover:bg-secondary hover:text-foreground'
                                )}
                                onClick={() => void handleOpenFile(result)}
                              >
                                <span className="shrink-0 text-xs font-mono text-muted w-8 text-right">
                                  {result.lineNumber}
                                </span>
                                <span className="flex-1 text-xs font-mono truncate">
                                  {highlightMatch(
                                    result.lineContent.trim(),
                                    result.matchStart - (result.lineContent.length - result.lineContent.trimStart().length),
                                    result.matchEnd - (result.lineContent.length - result.lineContent.trimStart().length)
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono">Enter</kbd> Open
            </span>
            <span>
              <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono">Esc</kbd> Close
            </span>
          </div>
          <span>{results.length} results in {groupedResults.length} files</span>
        </div>
      </div>
    </div>
  )
}
