'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSwarmStore } from '@/lib/store'
import { FileBrowser } from '@/components/file-browser'
import { CodeEditor } from '@/components/code-editor'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
  Terminal,
  Save,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface TerminalSession {
  id: string
  cols: number
  rows: number
  createdAt: number
  lastActivityAt: number
  terminated: boolean
  exitCode: number | null
  scrollbackSize: number
}

interface TerminalSessionSnapshot extends TerminalSession {
  scrollback: string
}

const ACTIVE_TERMINAL_KEY = 'swarm.ide.activeTerminalId'

export function DevEnvironment() {
  const settings = useSwarmStore((s) => s.settings)
  const openFiles = useSwarmStore((s) => s.openFiles)
  const activeFilePath = useSwarmStore((s) => s.activeFilePath)
  const setActiveFile = useSwarmStore((s) => s.setActiveFile)
  const closeFile = useSwarmStore((s) => s.closeFile)
  const updateFileContent = useSwarmStore((s) => s.updateFileContent)

  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [terminalVisible, setTerminalVisible] = useState(true)
  const [previewVisible, setPreviewVisible] = useState(false)

  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [terminalHeight, setTerminalHeight] = useState(200)
  const [previewWidth, setPreviewWidth] = useState(350)

  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [activeTerminal, setActiveTerminal] = useState<TerminalSessionSnapshot | null>(null)

  const sidebarDragRef = useRef<boolean>(false)
  const terminalDragRef = useRef<boolean>(false)
  const previewDragRef = useRef<boolean>(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const terminalScrollRef = useRef<HTMLDivElement>(null)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const refreshSessions = useCallback(async () => {
    const res = await fetch('/api/terminal', { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as { sessions: TerminalSession[] }
    setTerminalSessions(data.sessions)

    if (!activeTerminalId && data.sessions.length > 0) {
      const persisted = localStorage.getItem(ACTIVE_TERMINAL_KEY)
      const matched = data.sessions.find((s) => s.id === persisted)
      setActiveTerminalId(matched?.id ?? data.sessions[0].id)
    }
  }, [activeTerminalId])

  const createTerminalSession = useCallback(async () => {
    const res = await fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols: 120, rows: 32 }),
    })
    if (!res.ok) {
      toast.error('Failed to create terminal session')
      return
    }

    const data = (await res.json()) as { session: TerminalSession }
    setActiveTerminalId(data.session.id)
    await refreshSessions()
  }, [refreshSessions])

  const terminateTerminal = useCallback(
    async (id: string) => {
      await fetch(`/api/terminal/${id}/terminate`, { method: 'POST' })
      await refreshSessions()
      if (id === activeTerminalId) {
        const next = terminalSessions.find((s) => s.id !== id && !s.terminated)
        setActiveTerminalId(next?.id ?? null)
      }
    },
    [activeTerminalId, refreshSessions, terminalSessions]
  )

  const sendToTerminal = useCallback(
    async (input: string) => {
      if (!activeTerminalId) return
      await fetch(`/api/terminal/${activeTerminalId}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
    },
    [activeTerminalId]
  )

  const resizeActiveTerminal = useCallback(async () => {
    if (!activeTerminalId || !containerRef.current || !terminalVisible) return
    const width = containerRef.current.clientWidth - (sidebarVisible ? sidebarWidth : 0) - (previewVisible ? previewWidth : 0)
    const cols = Math.max(20, Math.floor(width / 8))
    const rows = Math.max(5, Math.floor((terminalHeight - 28) / 18))

    await fetch(`/api/terminal/${activeTerminalId}/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    })
  }, [activeTerminalId, previewVisible, previewWidth, sidebarVisible, sidebarWidth, terminalHeight, terminalVisible])

  const handleEditorChange = useCallback(
    (value: string) => {
      if (activeFilePath) {
        updateFileContent(activeFilePath, value)
      }
    },
    [activeFilePath, updateFileContent]
  )

  const handleSaveFile = useCallback(async () => {
    if (!activeFile) return
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(activeFile.path)}`, {
        method: 'PUT',
        body: activeFile.content,
      })
      if (res.ok) {
        toast.success('File saved')
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to save')
      }
    } catch {
      toast.error('Failed to save file')
    }
  }, [activeFile])

  useEffect(() => {
    const init = async () => {
      await refreshSessions()
    }
    void init()
  }, [refreshSessions])

  useEffect(() => {
    if (!activeTerminalId) return
    localStorage.setItem(ACTIVE_TERMINAL_KEY, activeTerminalId)
  }, [activeTerminalId])

  useEffect(() => {
    if (!activeTerminalId) {
      setActiveTerminal(null)
      return
    }

    const poll = async () => {
      const res = await fetch(`/api/terminal/${activeTerminalId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { session: TerminalSessionSnapshot }
      setActiveTerminal(data.session)
      if (terminalScrollRef.current) {
        terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight
      }
    }

    void poll()
    const interval = setInterval(() => {
      void poll()
      void refreshSessions()
    }, 700)

    return () => clearInterval(interval)
  }, [activeTerminalId, refreshSessions])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (sidebarDragRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newWidth = Math.max(120, Math.min(400, e.clientX - rect.left))
        setSidebarWidth(newWidth)
      }
      if (terminalDragRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newHeight = Math.max(80, Math.min(500, rect.bottom - e.clientY))
        setTerminalHeight(newHeight)
      }
      if (previewDragRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newWidth = Math.max(200, Math.min(600, rect.right - e.clientX))
        setPreviewWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      sidebarDragRef.current = false
      terminalDragRef.current = false
      previewDragRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      void resizeActiveTerminal()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizeActiveTerminal])

  useEffect(() => {
    const timer = setTimeout(() => {
      void resizeActiveTerminal()
    }, 120)
    return () => clearTimeout(timer)
  }, [resizeActiveTerminal])

  const terminalLabel = useMemo(() => {
    if (!activeTerminal) return 'Terminal'
    if (activeTerminal.terminated) {
      return `Terminal (exited ${activeTerminal.exitCode ?? 'unknown'})`
    }
    return 'Terminal'
  }, [activeTerminal])

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-1 border-b border-border bg-card/50 px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSidebarVisible((v) => !v)}
          title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarVisible ? (
            <PanelLeftClose className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTerminalVisible((v) => !v)}
          title={terminalVisible ? 'Hide terminal' : 'Show terminal'}
        >
          {terminalVisible ? (
            <PanelBottomClose className="h-3.5 w-3.5" />
          ) : (
            <PanelBottomOpen className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setPreviewVisible((v) => !v)}
          title={previewVisible ? 'Hide preview' : 'Show preview'}
        >
          {previewVisible ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRightOpen className="h-3.5 w-3.5" />
          )}
        </Button>
        <div className="flex-1" />
        {activeFile && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleSaveFile}
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {sidebarVisible && (
          <>
            <div
              className="shrink-0 border-r border-border bg-card/30 overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              <FileBrowser rootPath={settings.projectPath} />
            </div>
            <div
              className="w-1 cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                sidebarDragRef.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            />
          </>
        )}

        <div className="flex flex-1 flex-col min-w-0">
          {openFiles.length > 0 && (
            <div className="flex border-b border-border bg-card/30 overflow-x-auto">
              {openFiles.map((file) => (
                <div
                  key={file.path}
                  className={cn(
                    'flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs cursor-pointer shrink-0',
                    file.path === activeFilePath
                      ? 'bg-background text-foreground'
                      : 'bg-card/50 text-muted hover:text-foreground'
                  )}
                  onClick={() => setActiveFile(file.path)}
                >
                  <span className="font-mono truncate max-w-[120px]">
                    {file.path.split('/').pop()}
                  </span>
                  <button
                    className="ml-1 rounded p-0.5 hover:bg-secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeFile(file.path)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0">
            {activeFile ? (
              <CodeEditor
                filePath={activeFile.path}
                content={activeFile.content}
                language={activeFile.language}
                onChange={handleEditorChange}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Open a file from the sidebar to start editing
              </div>
            )}
          </div>

          {terminalVisible && (
            <div
              className="h-1 cursor-row-resize bg-transparent hover:bg-primary/20 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                terminalDragRef.current = true
                document.body.style.cursor = 'row-resize'
                document.body.style.userSelect = 'none'
              }}
            />
          )}

          {terminalVisible && (
            <div
              className="shrink-0 border-t border-border bg-card/30 overflow-hidden"
              style={{ height: terminalHeight }}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-1">
                <Terminal className="h-3.5 w-3.5 text-muted" />
                <span className="text-xs font-medium text-muted">{terminalLabel}</span>
                <div className="mx-2 h-4 w-px bg-border" />
                <div className="flex items-center gap-1 overflow-x-auto">
                  {terminalSessions.map((session, idx) => (
                    <button
                      key={session.id}
                      className={cn(
                        'rounded px-2 py-0.5 text-[11px] font-mono',
                        activeTerminalId === session.id ? 'bg-primary/20 text-foreground' : 'text-muted hover:text-foreground'
                      )}
                      onClick={() => setActiveTerminalId(session.id)}
                    >
                      t{idx + 1}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => void createTerminalSession()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                {activeTerminalId && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void terminateTerminal(activeTerminalId)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[calc(100%-28px)]">
                <div ref={terminalScrollRef} className="h-full overflow-auto">
                  <pre className="p-3 pb-1 text-xs font-mono text-foreground whitespace-pre-wrap">{activeTerminal?.scrollback || 'No terminal output yet.'}</pre>
                  <textarea
                    className="mx-3 mb-3 mt-1 w-[calc(100%-24px)] resize-none rounded border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
                    rows={1}
                    placeholder={activeTerminal?.terminated ? 'Session terminated' : 'Type command and press Enter'}
                    disabled={!activeTerminalId || activeTerminal?.terminated}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        const target = e.currentTarget
                        const input = target.value
                        target.value = ''
                        void sendToTerminal(`${input}\n`)
                      }
                    }}
                  />
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {previewVisible && (
          <>
            <div
              className="w-1 cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                previewDragRef.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            />
            <div
              className="shrink-0 border-l border-border bg-card/30 overflow-hidden"
              style={{ width: previewWidth }}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-xs font-medium text-muted">Preview</span>
              </div>
              <iframe
                src={settings.projectPath ? `http://localhost:3001` : 'about:blank'}
                className="h-[calc(100%-32px)] w-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
