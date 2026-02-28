'use client'

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalEmulatorProps {
  sessionId: string | null
  terminated?: boolean
  onResize?: (cols: number, rows: number) => void
  onInput?: (data: string) => void
  className?: string
}

export interface TerminalEmulatorRef {
  clear: () => void
}

export const TerminalEmulator = forwardRef<TerminalEmulatorRef, TerminalEmulatorProps>(function TerminalEmulator({
  sessionId,
  terminated = false,
  onResize,
  onInput,
  className = '',
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastScrollbackLengthRef = useRef(0)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [lastOutputLines, setLastOutputLines] = useState<string>('')

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (terminalRef.current) {
        terminalRef.current.clear()
        lastScrollbackLengthRef.current = 0
      }
    },
  }), [])

  const initTerminal = useCallback(() => {
    if (!containerRef.current || terminalRef.current) return

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
      lineHeight: 1.2,
      scrollback: 10000,
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#e5e5e5',
        cursorAccent: '#0a0a0a',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#bfbfbf',
        brightBlack: '#4d4d4d',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminal.onData((data: string) => {
      if (!terminated && onInput) {
        onInput(data)
      }
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    setIsInitialized(true)

    if (onResize) {
      onResize(terminal.cols, terminal.rows)
    }
  }, [terminated, onInput, onResize])

  useEffect(() => {
    initTerminal()

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (terminalRef.current) {
        terminalRef.current.dispose()
        terminalRef.current = null
      }
      fitAddonRef.current = null
      setIsInitialized(false)
    }
  }, [initTerminal])

  useEffect(() => {
    if (!isInitialized || !sessionId) return

    lastScrollbackLengthRef.current = 0
    terminalRef.current?.clear()

    const fetchScrollback = async () => {
      if (!sessionId || !terminalRef.current) return

      try {
        const res = await fetch(`/api/terminal/${sessionId}`, { cache: 'no-store' })
        if (!res.ok) return

        const data = await res.json()
        const scrollback = data.session?.scrollback || ''

        if (scrollback.length > lastScrollbackLengthRef.current) {
          const newContent = scrollback.slice(lastScrollbackLengthRef.current)
          terminalRef.current.write(newContent)
          lastScrollbackLengthRef.current = scrollback.length
          
          const lines = newContent.replace(/\x1b\[[0-9;]*m/g, '').split('\n')
          const recentLines = lines.slice(-3).join(' ').trim()
          if (recentLines) {
            setLastOutputLines(recentLines)
          }
        }
      } catch {
        // Ignore fetch errors
      }
    }

    void fetchScrollback()

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    pollIntervalRef.current = setInterval(() => {
      void fetchScrollback()
    }, 300)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [sessionId, isInitialized])

  useEffect(() => {
    if (!isInitialized) return

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        if (onResize) {
          onResize(terminalRef.current.cols, terminalRef.current.rows)
        }
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(handleResize)
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [isInitialized, onResize])

  useEffect(() => {
    if (terminated && terminalRef.current) {
      terminalRef.current.write('\r\n\x1b[90m[Session terminated]\x1b[0m\r\n')
    }
  }, [terminated])

  const handlePaste = useCallback(async () => {
    if (terminated || !onInput) return
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        onInput(text)
      }
    } catch {
      // Clipboard access denied
    }
  }, [terminated, onInput])

  const handleCopy = useCallback(() => {
    if (!terminalRef.current) return
    const selection = terminalRef.current.getSelection()
    if (selection) {
      void navigator.clipboard.writeText(selection)
    }
  }, [])

  return (
    <>
      {/* Visually hidden keyboard instructions for screen readers */}
      <div id="terminal-keyboard-instructions" className="sr-only">
        This is an interactive terminal. Type commands and press Enter to execute.
        Use Ctrl+C (or Cmd+C on Mac) to copy selected text.
        Use Ctrl+V (or Cmd+V on Mac) to paste from clipboard.
        Right-click to copy selection or paste if no selection.
      </div>
      {/* G-A11Y-03: aria-live region for screen reader announcements */}
      <div 
        aria-live="polite" 
        aria-atomic="false"
        className="sr-only"
        id="terminal-announcer"
      >
        {lastOutputLines}
      </div>
      <div
        ref={containerRef}
        className={`h-full w-full overflow-hidden ${className}`}
        role="application"
        aria-label="Terminal emulator"
        aria-describedby="terminal-keyboard-instructions"
        onContextMenu={(e) => {
          e.preventDefault()
          const selection = terminalRef.current?.getSelection()
          if (selection) {
            handleCopy()
          } else {
            void handlePaste()
          }
        }}
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'c' && terminalRef.current?.hasSelection()) {
            e.preventDefault()
            handleCopy()
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            e.preventDefault()
            void handlePaste()
          }
        }}
      />
    </>
  )
})
