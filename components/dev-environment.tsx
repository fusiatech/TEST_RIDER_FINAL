'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function DevEnvironment() {
  const settings = useSwarmStore((s) => s.settings)
  const openFiles = useSwarmStore((s) => s.openFiles)
  const activeFilePath = useSwarmStore((s) => s.activeFilePath)
  const setActiveFile = useSwarmStore((s) => s.setActiveFile)
  const closeFile = useSwarmStore((s) => s.closeFile)
  const updateFileContent = useSwarmStore((s) => s.updateFileContent)
  const agents = useSwarmStore((s) => s.agents)

  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [terminalVisible, setTerminalVisible] = useState(true)
  const [previewVisible, setPreviewVisible] = useState(false)

  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [terminalHeight, setTerminalHeight] = useState(200)
  const [previewWidth, setPreviewWidth] = useState(350)

  const sidebarDragRef = useRef<boolean>(false)
  const terminalDragRef = useRef<boolean>(false)
  const previewDragRef = useRef<boolean>(false)

  const containerRef = useRef<HTMLDivElement>(null)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const latestOutput = agents
    .filter((a) => a.output.trim().length > 0)
    .slice(-1)[0]?.output ?? ''

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
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden bg-background">
      {/* Toolbar */}
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

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* File sidebar */}
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

        {/* Center (editor + terminal) */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Tab bar */}
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

          {/* Editor area */}
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

          {/* Terminal drag handle */}
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

          {/* Terminal panel */}
          {terminalVisible && (
            <div
              className="shrink-0 border-t border-border bg-card/30 overflow-hidden"
              style={{ height: terminalHeight }}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-1">
                <Terminal className="h-3.5 w-3.5 text-muted" />
                <span className="text-xs font-medium text-muted">Output</span>
              </div>
              <ScrollArea className="h-[calc(100%-28px)]">
                <pre className="p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap">
                  {latestOutput || 'No agent output yet.'}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Preview sidebar */}
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
