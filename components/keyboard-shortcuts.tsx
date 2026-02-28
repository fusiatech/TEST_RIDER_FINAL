'use client'

import { useState, useCallback, useEffect } from 'react'
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

interface Shortcut {
  keys: string
  description: string
}

const SHORTCUTS: Shortcut[] = [
  { keys: SHORTCUT_LABELS.commandPalette, description: 'Open command palette' },
  { keys: SHORTCUT_LABELS.toggleSidebar, description: 'Toggle sidebar' },
  { keys: SHORTCUT_LABELS.sendMessage, description: 'Send message' },
  { keys: SHORTCUT_LABELS.newChat, description: 'New conversation' },
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

  const createSession = useSwarmStore((s) => s.createSession)
  const toggleSidebar = useSwarmStore((s) => s.toggleSidebar)
  const activeTab = useSwarmStore((s) => s.activeTab)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const setMode = useSwarmStore((s) => s.setMode)
  const isRunning = useSwarmStore((s) => s.isRunning)
  const cancelSwarm = useSwarmStore((s) => s.cancelSwarm)

  const handleSendMessage = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('#chat-input')
    if (textarea && textarea.value.trim()) {
      const sendButton = document.querySelector<HTMLButtonElement>('[data-action-id="composer-send"]')
      sendButton?.click()
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
    onNewChat: () => {
      setMode('chat')
      setActiveTab('chat')
      createSession()
    },
    onOpenSettings: () => router.push('/settings'),
    onToggleDashboard: () => setActiveTab(activeTab === 'dashboard' ? 'chat' : 'dashboard'),
    onShowHelp: () => setHelpOpen(true),
  })

  useEffect(() => {
    const handler = () => setHelpOpen(true)
    window.addEventListener('fusia:open-keyboard-shortcuts', handler as EventListener)
    return () => {
      window.removeEventListener('fusia:open-keyboard-shortcuts', handler as EventListener)
    }
  }, [])

  return (
    <>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
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
