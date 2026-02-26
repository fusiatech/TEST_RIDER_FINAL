'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSwarmStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { HelpCircle } from 'lucide-react'

interface Shortcut {
  keys: string
  description: string
}

const SHORTCUTS: Shortcut[] = [
  { keys: '⌘/Ctrl + N', description: 'New chat / project' },
  { keys: '⌘/Ctrl + K', description: 'Focus input bar' },
  { keys: 'Ctrl + Shift + D', description: 'Toggle dashboard' },
  { keys: '⌘/Ctrl + ,', description: 'Open settings' },
  { keys: 'Escape', description: 'Cancel running swarm' },
  { keys: '?', description: 'Show this help dialog' },
]

export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false)

  const createSession = useSwarmStore((s) => s.createSession)
  const toggleSettings = useSwarmStore((s) => s.toggleSettings)
  const activeTab = useSwarmStore((s) => s.activeTab)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const isRunning = useSwarmStore((s) => s.isRunning)
  const cancelSwarm = useSwarmStore((s) => s.cancelSwarm)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if (meta && e.key === 'n') {
        e.preventDefault()
        createSession()
      }

      if (meta && e.key === 'k') {
        e.preventDefault()
        const textarea = document.querySelector<HTMLTextAreaElement>(
          'textarea[placeholder="Describe your task..."]'
        )
        textarea?.focus()
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setActiveTab(activeTab === 'dashboard' ? 'chat' : 'dashboard')
      }

      if (meta && e.key === ',') {
        e.preventDefault()
        toggleSettings()
      }

      if (e.key === 'Escape') {
        if (isRunning) {
          cancelSwarm()
        }
      }

      if (e.key === '?' && !isInput && !meta && !e.shiftKey) {
        e.preventDefault()
        setHelpOpen(true)
      }
    },
    [createSession, toggleSettings, activeTab, setActiveTab, isRunning, cancelSwarm]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed bottom-4 right-4 z-40 h-8 w-8 rounded-full bg-secondary/80 text-muted hover:text-foreground shadow-lg"
        onClick={() => setHelpOpen(true)}
        title="Keyboard shortcuts"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted">{s.description}</span>
                <kbd className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-xs font-mono text-foreground">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
