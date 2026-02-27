'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSwarmStore } from '@/lib/store'
import type { AppMode } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Plus,
  Settings,
  MessageCircle,
  Zap,
  FolderKanban,
  LayoutDashboard,
  Code,
  TestTube,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Command,
} from 'lucide-react'
import { useTheme } from 'next-themes'

interface ActionCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CommandAction {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  category: 'navigation' | 'mode' | 'actions' | 'settings'
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

const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Navigation',
  mode: 'Mode',
  actions: 'Actions',
  settings: 'Settings',
}

export function ActionCommandPalette({ open, onOpenChange }: ActionCommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const createSession = useSwarmStore((s) => s.createSession)
  const toggleSettings = useSwarmStore((s) => s.toggleSettings)
  const toggleSidebar = useSwarmStore((s) => s.toggleSidebar)
  const sidebarOpen = useSwarmStore((s) => s.sidebarOpen)
  const setMode = useSwarmStore((s) => s.setMode)
  const mode = useSwarmStore((s) => s.mode)
  const activeTab = useSwarmStore((s) => s.activeTab)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)

  const { theme, setTheme } = useTheme()

  const close = useCallback(() => {
    onOpenChange(false)
    setQuery('')
    setSelectedIndex(0)
  }, [onOpenChange])

  const actions = useMemo((): CommandAction[] => {
    const items: CommandAction[] = [
      {
        id: 'new-chat',
        label: 'New Chat',
        description: 'Start a new conversation',
        icon: <Plus className="h-4 w-4" />,
        shortcut: '⌘N',
        action: () => {
          createSession()
          close()
        },
        category: 'actions',
      },
      {
        id: 'open-settings',
        label: 'Open Settings',
        description: 'Configure application settings',
        icon: <Settings className="h-4 w-4" />,
        shortcut: '⌘,',
        action: () => {
          toggleSettings()
          close()
        },
        category: 'settings',
      },
      {
        id: 'toggle-sidebar',
        label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar',
        description: 'Toggle the sidebar visibility',
        icon: sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />,
        shortcut: '⌘/',
        action: () => {
          toggleSidebar()
          close()
        },
        category: 'navigation',
      },
      {
        id: 'mode-chat',
        label: 'Switch to Chat Mode',
        description: 'Single agent conversation',
        icon: <MessageCircle className="h-4 w-4" />,
        action: () => {
          setMode('chat' as AppMode)
          close()
        },
        category: 'mode',
      },
      {
        id: 'mode-swarm',
        label: 'Switch to Swarm Mode',
        description: 'Multi-agent parallel processing',
        icon: <Zap className="h-4 w-4" />,
        action: () => {
          setMode('swarm' as AppMode)
          close()
        },
        category: 'mode',
      },
      {
        id: 'mode-project',
        label: 'Switch to Project Mode',
        description: 'Project management with tickets',
        icon: <FolderKanban className="h-4 w-4" />,
        action: () => {
          setMode('project' as AppMode)
          close()
        },
        category: 'mode',
      },
      {
        id: 'tab-chat',
        label: 'Go to Chat',
        description: 'View chat interface',
        icon: <MessageCircle className="h-4 w-4" />,
        action: () => {
          setActiveTab('chat')
          close()
        },
        category: 'navigation',
      },
      {
        id: 'tab-dashboard',
        label: 'Go to Dashboard',
        description: 'View agent dashboard',
        icon: <LayoutDashboard className="h-4 w-4" />,
        shortcut: '⇧⌘D',
        action: () => {
          setActiveTab('dashboard')
          close()
        },
        category: 'navigation',
      },
      {
        id: 'tab-ide',
        label: 'Go to IDE',
        description: 'Open code editor',
        icon: <Code className="h-4 w-4" />,
        action: () => {
          setActiveTab('ide')
          close()
        },
        category: 'navigation',
      },
      {
        id: 'tab-testing',
        label: 'Go to Testing',
        description: 'View test dashboard',
        icon: <TestTube className="h-4 w-4" />,
        action: () => {
          setActiveTab('testing')
          close()
        },
        category: 'navigation',
      },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        description: 'Toggle color theme',
        icon: theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        action: () => {
          setTheme(theme === 'dark' ? 'light' : 'dark')
          close()
        },
        category: 'settings',
      },
    ]

    return items.filter((item) => {
      if (item.id === `mode-${mode}`) return false
      if (item.id === `tab-${activeTab}`) return false
      return true
    })
  }, [
    createSession,
    toggleSettings,
    toggleSidebar,
    sidebarOpen,
    setMode,
    mode,
    activeTab,
    setActiveTab,
    theme,
    setTheme,
    close,
  ])

  const filteredActions = useMemo(() => {
    if (!query) return actions
    return actions.filter(
      (action) =>
        fuzzyMatch(query, action.label) ||
        (action.description && fuzzyMatch(query, action.description))
    )
  }, [actions, query])

  const groupedActions = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {}
    for (const action of filteredActions) {
      if (!groups[action.category]) {
        groups[action.category] = []
      }
      groups[action.category].push(action)
    }
    return groups
  }, [filteredActions])

  const flatActions = useMemo(() => {
    const result: CommandAction[] = []
    const categoryOrder = ['actions', 'navigation', 'mode', 'settings']
    for (const category of categoryOrder) {
      if (groupedActions[category]) {
        result.push(...groupedActions[category])
      }
    }
    return result
  }, [groupedActions])

  const handleSelect = useCallback(
    (action: CommandAction) => {
      action.action()
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, flatActions.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatActions[selectedIndex]) {
            handleSelect(flatActions[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          close()
          break
      }
    },
    [flatActions, selectedIndex, handleSelect, close]
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
    if (listRef.current && flatActions.length > 0) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      ) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, flatActions.length])

  if (!open) return null

  let currentIndex = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Command className="h-4 w-4 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
            aria-label="Search commands"
            aria-activedescendant={flatActions[selectedIndex]?.id}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="rounded p-0.5 hover:bg-secondary"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5 text-muted" />
            </button>
          )}
        </div>
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto p-2"
          role="listbox"
          aria-label="Available commands"
        >
          {flatActions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              No matching commands found
            </div>
          ) : (
            Object.entries(groupedActions).map(([category, categoryActions]) => {
              const categoryOrder = ['actions', 'navigation', 'mode', 'settings']
              if (!categoryOrder.includes(category)) return null

              return (
                <div key={category} className="mb-2 last:mb-0">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted uppercase tracking-wider">
                    {CATEGORY_LABELS[category] || category}
                  </div>
                  {categoryActions.map((action) => {
                    const index = currentIndex++
                    return (
                      <button
                        key={action.id}
                        id={action.id}
                        data-index={index}
                        role="option"
                        aria-selected={index === selectedIndex}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          index === selectedIndex
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted hover:bg-secondary hover:text-foreground'
                        )}
                        onClick={() => handleSelect(action)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <span
                          className={cn(
                            'shrink-0',
                            index === selectedIndex ? 'text-primary' : 'text-muted'
                          )}
                          aria-hidden="true"
                        >
                          {action.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {highlightMatch(action.label, query)}
                          </div>
                          {action.description && (
                            <div className="text-xs text-muted truncate">
                              {action.description}
                            </div>
                          )}
                        </div>
                        {action.shortcut && (
                          <kbd className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted">
                            {action.shortcut}
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono">Enter</kbd> Select
            </span>
            <span>
              <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono">Esc</kbd> Close
            </span>
          </div>
          <span>{flatActions.length} commands</span>
        </div>
      </div>
    </div>
  )
}
