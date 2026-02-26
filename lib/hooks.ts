'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Auto-scroll to bottom of a container when dependencies change.
 */
export function useAutoScroll<T extends HTMLElement>(deps: unknown[]): React.RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}

/**
 * Debounce a value — returns the value only after it stops changing for `delay` ms.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/**
 * Register a global keyboard shortcut. Cleans up on unmount.
 */
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  modifiers?: { ctrl?: boolean; meta?: boolean; shift?: boolean }
): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (modifiers?.ctrl && !e.ctrlKey) return
      if (modifiers?.meta && !e.metaKey) return
      if (modifiers?.shift && !e.shiftKey) return
      if (e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault()
        callbackRef.current()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, modifiers?.ctrl, modifiers?.meta, modifiers?.shift])
}

/**
 * Relative time formatter — returns strings like "2m ago", "1h ago".
 * Updates every 30 seconds.
 */
export function useRelativeTime(timestamp: number): string {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  return formatRelative(timestamp)
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Interval that auto-cleans up on unmount. Pass `null` for delay to pause.
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return

    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}
