'use client'

import { useEffect, useCallback, useRef } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  handler: (e: KeyboardEvent) => void
  description?: string
  allowInInput?: boolean
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tagName = target.tagName
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true } = options
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      const mac = isMac()
      const isInput = isInputElement(e.target)

      for (const shortcut of shortcutsRef.current) {
        const { key, ctrl, meta, shift, alt, handler, allowInInput } = shortcut

        if (isInput && !allowInInput) continue
        if (!key || typeof key !== 'string') continue
        if (!e.key || typeof e.key !== 'string') continue

        const keyMatch = e.key.toLowerCase() === key.toLowerCase()
        if (!keyMatch) continue

        const ctrlMatch = ctrl ? (mac ? e.metaKey : e.ctrlKey) : true
        const metaMatch = meta ? e.metaKey : true
        const shiftMatch = shift ? e.shiftKey : !e.shiftKey
        const altMatch = alt ? e.altKey : !e.altKey

        const modifiersMatch =
          ctrlMatch &&
          metaMatch &&
          (ctrl || meta ? true : !e.ctrlKey && !e.metaKey) &&
          shiftMatch &&
          altMatch

        if (modifiersMatch) {
          e.preventDefault()
          handler(e)
          return
        }
      }
    },
    [enabled]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export interface GlobalShortcutActions {
  onCommandPalette?: () => void
  onToggleSidebar?: () => void
  onSendMessage?: () => void
  onEscape?: () => void
  onNewChat?: () => void
  onOpenSettings?: () => void
  onToggleDashboard?: () => void
  onShowHelp?: () => void
}

export function useGlobalShortcuts(actions: GlobalShortcutActions) {
  const shortcuts: KeyboardShortcut[] = []

  if (actions.onCommandPalette) {
    shortcuts.push({
      key: 'k',
      ctrl: true,
      handler: actions.onCommandPalette,
      description: 'Open command palette',
    })
  }

  if (actions.onToggleSidebar) {
    shortcuts.push({
      key: '/',
      ctrl: true,
      handler: actions.onToggleSidebar,
      description: 'Toggle sidebar',
    })
  }

  if (actions.onSendMessage) {
    shortcuts.push({
      key: 'Enter',
      ctrl: true,
      handler: actions.onSendMessage,
      description: 'Send message',
      allowInInput: true,
    })
  }

  if (actions.onEscape) {
    shortcuts.push({
      key: 'Escape',
      handler: actions.onEscape,
      description: 'Close modal / Cancel',
      allowInInput: true,
    })
  }

  if (actions.onNewChat) {
    shortcuts.push({
      key: 'n',
      ctrl: true,
      handler: actions.onNewChat,
      description: 'New conversation',
    })
  }

  if (actions.onOpenSettings) {
    shortcuts.push({
      key: ',',
      ctrl: true,
      handler: actions.onOpenSettings,
      description: 'Open settings',
    })
  }

  if (actions.onToggleDashboard) {
    shortcuts.push({
      key: 'd',
      ctrl: true,
      shift: true,
      handler: actions.onToggleDashboard,
      description: 'Toggle dashboard',
    })
  }

  if (actions.onShowHelp) {
    shortcuts.push({
      key: '?',
      handler: actions.onShowHelp,
      description: 'Show keyboard shortcuts help',
    })
  }

  useKeyboardShortcuts(shortcuts)
}

export const SHORTCUT_LABELS = {
  commandPalette: 'Cmd/Ctrl + K',
  toggleSidebar: 'Cmd/Ctrl + /',
  sendMessage: 'Cmd/Ctrl + Enter',
  escape: 'Escape',
  newChat: 'Cmd/Ctrl + N',
  openSettings: 'Cmd/Ctrl + ,',
  toggleDashboard: 'Ctrl + Shift + D',
  showHelp: '?',
  navigate: 'Tab / Shift + Tab',
  arrowKeys: 'Up/Down Arrow keys',
}

