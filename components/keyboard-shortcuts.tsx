'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSwarmStore } from '@/lib/store'
import { useGlobalShortcuts, SHORTCUT_LABELS } from '@/hooks/use-keyboard-shortcuts'
import { ActionCommandPalette } from '@/components/action-command-palette'
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
  { keys: SHORTCUT_LABELS.commandPalette, description: 'Open command palette' },
  { keys: SHORTCUT_LABELS.toggleSidebar, description: 'Toggle sidebar' },
  { keys: SHORTCUT_LABELS.sendMessage, description: 'Send message' },
  { keys: SHORTCUT_LABELS.newChat, description: 'New chat / project' },
  { keys: SHORTCUT_LABELS.openSettings, description: 'Open settings' },
  { keys: SHORTCUT_LABELS.toggleDashboard, description: 'Toggle dashboard' },
  { keys: SHORTCUT_LABELS.escape, description: 'Cancel swarm / Close dialogs' },
  { keys: SHORTCUT_LABELS.showHelp, description: 'Show this help dialog' },
  { keys: SHORTCUT_LABELS.navigate, description: 'Navigate between elements' },
  { keys: SHORTCUT_LABELS.arrowKeys, description: 'Navigate within menus' },
]

export function KeyboardShortcuts() {
  const router = useRouter()
  const [helpOpen, setHelpOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const createSession = useSwarmStore((s) => s.createSession)
  const toggleSidebar = useSwarmStore((s) => s.toggleSidebar)
  const activeTab = useSwarmStore((s) => s.activeTab)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const isRunning = useSwarmStore((s) => s.isRunning)
  const cancelSwarm = useSwarmStore((s) => s.cancelSwarm)

  const handleSendMessage = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="Describe your task..."]'
    )
    if (textarea && textarea.value.trim()) {
      const form = textarea.closest('form')
      if (form) {
        form.requestSubmit()
      }
    }
  }, [])

  const handleEscape = useCallback(() => {
    if (commandPaletteOpen) {
      setCommandPaletteOpen(false)
      return
    }
    if (helpOpen) {
      setHelpOpen(false)
      return
    }
    if (isRunning) {
      cancelSwarm()
    }
  }, [commandPaletteOpen, helpOpen, isRunning, cancelSwarm])

  useGlobalShortcuts({
    onCommandPalette: () => setCommandPaletteOpen(true),
    onToggleSidebar: toggleSidebar,
    onSendMessage: handleSendMessage,
    onEscape: handleEscape,
    onNewChat: createSession,
    onOpenSettings: () => router.push('/settings'),
    onToggleDashboard: () => setActiveTab(activeTab === 'dashboard' ? 'chat' : 'dashboard'),
    onShowHelp: () => setHelpOpen(true),
  })

  const handleOpenChange = useCallback((open: boolean) => {
    setHelpOpen(open)
    if (!open) {
      setTimeout(() => triggerRef.current?.focus(), 0)
    }
  }, [])

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="fixed bottom-4 right-4 z-40 h-10 w-10 rounded-full bg-secondary/80 text-muted hover:text-foreground shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        onClick={() => setHelpOpen(true)}
        aria-label="Keyboard shortcuts help (press ? key)"
        aria-haspopup="dialog"
        aria-expanded={helpOpen}
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
      </Button>

      <Dialog open={helpOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm" aria-describedby="shortcuts-description">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <p id="shortcuts-description" className="sr-only">
            List of available keyboard shortcuts for navigating and using the application
          </p>
          <div className="space-y-2" role="list" aria-label="Keyboard shortcuts list">
            {SHORTCUTS.map((s) => (
              <div
                key={s.keys}
                className="flex items-center justify-between py-1.5"
                role="listitem"
              >
                <span className="text-sm text-muted">{s.description}</span>
                <kbd
                  className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-xs font-mono text-foreground"
                  aria-label={`Keyboard shortcut: ${s.keys}`}
                >
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ActionCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </>
  )
}
