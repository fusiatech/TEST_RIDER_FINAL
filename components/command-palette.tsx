'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSwarmStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Search, File, Clock, X } from 'lucide-react'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FileItem {
  path: string
  name: string
  isRecent?: boolean
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  
  let queryIndex = 0
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === lowerQuery.length
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  const result: React.ReactNode[] = []
  let queryIndex = 0
  let lastMatchEnd = 0
  
  for (let i = 0; i < text.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      if (i > lastMatchEnd) {
        result.push(text.slice(lastMatchEnd, i))
      }
      result.push(
        <span key={i} className="text-primary font-semibold">
          {text[i]}
        </span>
      )
      lastMatchEnd = i + 1
      queryIndex++
    }
  }
  
  if (lastMatchEnd < text.length) {
    result.push(text.slice(lastMatchEnd))
  }
  
  return result
}

const RECENT_FILES_KEY = 'swarm.ide.recentFiles'
const MAX_RECENT_FILES = 10

function getRecentFiles(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const openFiles = useSwarmStore((s) => s.openFiles)
  const setActiveFile = useSwarmStore((s) => s.setActiveFile)

  const recentFiles = useMemo(() => getRecentFiles(), [])

  const items = useMemo((): FileItem[] => {
    const openFileItems: FileItem[] = openFiles.map((f) => ({
      path: f.path,
      name: f.path.split(/[/\\]/).pop() || f.path,
      isRecent: false,
    }))

    const recentFileItems: FileItem[] = recentFiles
      .filter((path) => !openFiles.some((f) => f.path === path))
      .map((path) => ({
        path,
        name: path.split(/[/\\]/).pop() || path,
        isRecent: true,
      }))

    const allItems = [...openFileItems, ...recentFileItems]

    if (!query) return allItems

    return allItems.filter((item) => fuzzyMatch(query, item.name))
  }, [openFiles, recentFiles, query])

  const handleSelect = useCallback(
    (item: FileItem) => {
      if (openFiles.some((f) => f.path === item.path)) {
        setActiveFile(item.path)
      }
      onOpenChange(false)
      setQuery('')
      setSelectedIndex(0)
    },
    [openFiles, setActiveFile, onOpenChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (items[selectedIndex]) {
            handleSelect(items[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          setQuery('')
          setSelectedIndex(0)
          break
      }
    },
    [items, selectedIndex, handleSelect, onOpenChange]
  )

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (listRef.current && items.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, items.length])

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (modKey && e.key === 'p') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          onOpenChange(false)
          setQuery('')
          setSelectedIndex(0)
        }}
      />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="rounded p-0.5 hover:bg-secondary"
            >
              <X className="h-3.5 w-3.5 text-muted" />
            </button>
          )}
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              {query ? 'No matching files found' : 'No open files'}
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.path}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  index === selectedIndex
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted hover:bg-secondary hover:text-foreground'
                )}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {item.isRecent ? (
                  <Clock className="h-4 w-4 shrink-0 text-muted" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {highlightMatch(item.name, query)}
                  </div>
                  <div className="text-xs text-muted truncate">{item.path}</div>
                </div>
                {item.isRecent && (
                  <span className="text-[10px] text-muted">Recent</span>
                )}
              </button>
            ))
          )}
        </div>
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
          <span>{items.length} files</span>
        </div>
      </div>
    </div>
  )
}
