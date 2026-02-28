'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSwarmStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Play,
  Pause,
  Square,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  CircleDot,
  ChevronRight,
  ChevronDown,
  Bug,
  Terminal,
  Variable,
  Layers,
  Send,
  Trash2,
  Plus,
  RefreshCw,
} from 'lucide-react'
import type {
  DebugSession,
  Variable as VariableType,
  Scope,
  EvaluateResult,
  DebugConfig,
} from '@/lib/debug-types'

interface ConsoleEntry {
  id: string
  type: 'input' | 'output' | 'error'
  content: string
  timestamp: number
}

export function DebuggerPanel() {
  const settings = useSwarmStore((s) => s.settings)
  const activeFilePath = useSwarmStore((s) => s.activeFilePath)
  
  const [sessions, setSessions] = useState<DebugSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeSession, setActiveSession] = useState<DebugSession | null>(null)
  const [scopes, setScopes] = useState<Scope[]>([])
  const [variables, setVariables] = useState<Map<number, VariableType[]>>(new Map())
  const [expandedScopes, setExpandedScopes] = useState<Set<number>>(new Set([1]))
  const [selectedFrameId, setSelectedFrameId] = useState<number>(0)
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [consoleInput, setConsoleInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const [newSessionType, setNewSessionType] = useState<'node' | 'python'>('node')
  const [newSessionProgram, setNewSessionProgram] = useState('')
  const [showNewSession, setShowNewSession] = useState(false)
  
  const consoleEndRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/debug')
      if (res.ok) {
        const data = await res.json() as { sessions: DebugSession[] }
        setSessions(data.sessions)
      }
    } catch (error) {
      console.error('Failed to fetch debug sessions:', error)
    }
  }, [])

  const setCurrentDebugLine = useSwarmStore((s) => s.setCurrentDebugLine)

  const fetchSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/debug/${sessionId}`)
      if (res.ok) {
        const data = await res.json() as { session: DebugSession }
        setActiveSession(data.session)
        
        if (data.session.status === 'paused' && data.session.callStack.length > 0) {
          await fetchScopes(sessionId, selectedFrameId)
          const topFrame = data.session.callStack[0]
          if (topFrame) {
            setCurrentDebugLine({ file: topFrame.file, line: topFrame.line })
          }
        } else if (data.session.status === 'running' || data.session.status === 'stopped') {
          setCurrentDebugLine(null)
        }
      }
    } catch (error) {
      console.error('Failed to fetch debug session:', error)
    }
  }, [selectedFrameId, setCurrentDebugLine])

  const fetchScopes = useCallback(async (sessionId: string, frameId: number) => {
    try {
      const res = await fetch(`/api/debug/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getScopes', frameId }),
      })
      if (res.ok) {
        const data = await res.json() as { scopes: Scope[] }
        setScopes(data.scopes)
      }
    } catch (error) {
      console.error('Failed to fetch scopes:', error)
    }
  }, [])

  const fetchVariables = useCallback(async (sessionId: string, scopeReference: number) => {
    try {
      const res = await fetch(`/api/debug/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getVariables', frameId: scopeReference }),
      })
      if (res.ok) {
        const data = await res.json() as { variables: VariableType[] }
        setVariables((prev) => new Map(prev).set(scopeReference, data.variables))
      }
    } catch (error) {
      console.error('Failed to fetch variables:', error)
    }
  }, [])

  useEffect(() => {
    void fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (activeSessionId) {
      void fetchSession(activeSessionId)
      
      pollIntervalRef.current = setInterval(() => {
        void fetchSession(activeSessionId)
      }, 1000)
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
        }
      }
    }
  }, [activeSessionId, fetchSession])

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [consoleEntries])

  const storeBreakpoints = useSwarmStore((s) => s.breakpoints)

  const syncBreakpointsToSession = useCallback(async (sessionId: string) => {
    for (const [file, breakpoints] of storeBreakpoints.entries()) {
      for (const bp of breakpoints) {
        if (bp.enabled) {
          try {
            await fetch(`/api/debug/${sessionId}/breakpoint`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file: bp.file, line: bp.line, condition: bp.condition }),
            })
          } catch (error) {
            console.error('Failed to sync breakpoint:', error)
          }
        }
      }
    }
  }, [storeBreakpoints])

  const startSession = useCallback(async () => {
    if (!newSessionProgram) {
      toast.error('Please enter a program path')
      return
    }

    setIsLoading(true)
    try {
      const config: DebugConfig = {
        type: newSessionType,
        program: newSessionProgram,
        cwd: settings.projectPath || undefined,
        stopOnEntry: true,
      }

      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (res.ok) {
        const data = await res.json() as { session: DebugSession }
        setActiveSessionId(data.session.id)
        setShowNewSession(false)
        setNewSessionProgram('')
        toast.success('Debug session started')
        await fetchSessions()
        await syncBreakpointsToSession(data.session.id)
      } else {
        const error = await res.json() as { error: string }
        toast.error(error.error || 'Failed to start debug session')
      }
    } catch (error) {
      toast.error('Failed to start debug session')
    } finally {
      setIsLoading(false)
    }
  }, [newSessionType, newSessionProgram, settings.projectPath, fetchSessions, syncBreakpointsToSession])

  const stopSession = useCallback(async () => {
    if (!activeSessionId) return

    try {
      await fetch(`/api/debug/${activeSessionId}`, { method: 'DELETE' })
      setActiveSessionId(null)
      setActiveSession(null)
      setCurrentDebugLine(null)
      toast.success('Debug session stopped')
      await fetchSessions()
    } catch (error) {
      toast.error('Failed to stop debug session')
    }
  }, [activeSessionId, fetchSessions, setCurrentDebugLine])

  const executeAction = useCallback(async (action: string) => {
    if (!activeSessionId) return

    try {
      const res = await fetch(`/api/debug/${activeSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      if (!res.ok) {
        const error = await res.json() as { error: string }
        toast.error(error.error || `Failed to ${action}`)
      }
    } catch (error) {
      toast.error(`Failed to ${action}`)
    }
  }, [activeSessionId])

  const evaluateExpression = useCallback(async () => {
    if (!activeSessionId || !consoleInput.trim()) return

    const input = consoleInput.trim()
    setConsoleInput('')

    const inputEntry: ConsoleEntry = {
      id: `${Date.now()}-input`,
      type: 'input',
      content: input,
      timestamp: Date.now(),
    }
    setConsoleEntries((prev) => [...prev, inputEntry])

    try {
      const res = await fetch(`/api/debug/${activeSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate', expression: input, frameId: selectedFrameId }),
      })

      if (res.ok) {
        const data = await res.json() as { result: EvaluateResult }
        const outputEntry: ConsoleEntry = {
          id: `${Date.now()}-output`,
          type: data.result.type === 'error' ? 'error' : 'output',
          content: data.result.result,
          timestamp: Date.now(),
        }
        setConsoleEntries((prev) => [...prev, outputEntry])
      }
    } catch (error) {
      const errorEntry: ConsoleEntry = {
        id: `${Date.now()}-error`,
        type: 'error',
        content: 'Failed to evaluate expression',
        timestamp: Date.now(),
      }
      setConsoleEntries((prev) => [...prev, errorEntry])
    }
  }, [activeSessionId, consoleInput, selectedFrameId])

  const toggleScope = useCallback(async (scopeRef: number) => {
    const newExpanded = new Set(expandedScopes)
    if (newExpanded.has(scopeRef)) {
      newExpanded.delete(scopeRef)
    } else {
      newExpanded.add(scopeRef)
      if (activeSessionId && !variables.has(scopeRef)) {
        await fetchVariables(activeSessionId, scopeRef)
      }
    }
    setExpandedScopes(newExpanded)
  }, [expandedScopes, activeSessionId, variables, fetchVariables])

  const selectFrame = useCallback(async (frameId: number) => {
    setSelectedFrameId(frameId)
    if (activeSessionId) {
      await fetchScopes(activeSessionId, frameId)
      setVariables(new Map())
      setExpandedScopes(new Set([1]))
    }
  }, [activeSessionId, fetchScopes])

  const isPaused = activeSession?.status === 'paused'
  const isRunning = activeSession?.status === 'running'
  const isStopped = activeSession?.status === 'stopped' || !activeSession

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeSession) return

      if (e.key === 'F5' && !e.shiftKey) {
        e.preventDefault()
        if (isPaused) {
          void executeAction('continue')
        }
      } else if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault()
        void stopSession()
      } else if (e.key === 'F6') {
        e.preventDefault()
        if (isRunning) {
          void executeAction('pause')
        }
      } else if (e.key === 'F10') {
        e.preventDefault()
        if (isPaused) {
          void executeAction('stepOver')
        }
      } else if (e.key === 'F11' && !e.shiftKey) {
        e.preventDefault()
        if (isPaused) {
          void executeAction('stepInto')
        }
      } else if (e.key === 'F11' && e.shiftKey) {
        e.preventDefault()
        if (isPaused) {
          void executeAction('stepOut')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSession, isPaused, isRunning, executeAction, stopSession])

  return (
    <div className="flex flex-col h-full" data-testid="debugger-panel">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <Bug className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Debugger</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setShowNewSession(!showNewSession)}
          title="New debug session"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => void fetchSessions()}
          title="Refresh sessions"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showNewSession && (
        <div className="p-3 border-b border-border bg-card/50 space-y-2">
          <div className="flex gap-2">
            <Select
              value={newSessionType}
              onValueChange={(v) => setNewSessionType(v as 'node' | 'python')}
            >
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="node">Node.js</SelectItem>
                <SelectItem value="python">Python</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Program path (e.g., ./index.js)"
              value={newSessionProgram}
              onChange={(e) => setNewSessionProgram(e.target.value)}
              className="h-8 text-xs flex-1"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => void startSession()}
              disabled={isLoading}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowNewSession(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="p-2 border-b border-border">
          <Select
            value={activeSessionId || ''}
            onValueChange={(v) => setActiveSessionId(v)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select debug session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        session.status === 'running' && 'bg-green-500',
                        session.status === 'paused' && 'bg-yellow-500',
                        session.status === 'stopped' && 'bg-red-500',
                        session.status === 'idle' && 'bg-gray-500'
                      )}
                    />
                    {session.type} - {session.status}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {activeSession && (
        <>
          <div className="flex items-center gap-1 p-2 border-b border-border bg-card/30">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void executeAction('continue')}
              disabled={!isPaused}
              title="Continue (F5)"
            >
              <Play className="h-4 w-4 text-green-500" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void executeAction('pause')}
              disabled={!isRunning}
              title="Pause (F6)"
            >
              <Pause className="h-4 w-4 text-yellow-500" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void stopSession()}
              disabled={isStopped}
              title="Stop (Shift+F5)"
            >
              <Square className="h-4 w-4 text-red-500" />
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void executeAction('stepOver')}
              disabled={!isPaused}
              title="Step Over (F10)"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void executeAction('stepInto')}
              disabled={!isPaused}
              title="Step Into (F11)"
            >
              <ArrowDownRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void executeAction('stepOut')}
              disabled={!isPaused}
              title="Step Out (Shift+F11)"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-3">
              <Collapsible defaultOpen data-testid="breakpoints-section">
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-xs font-medium text-muted hover:text-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <CircleDot className="h-3 w-3" />
                  Breakpoints ({activeSession.breakpoints.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {activeSession.breakpoints.length === 0 ? (
                    <p className="text-xs text-muted pl-5">No breakpoints set</p>
                  ) : (
                    activeSession.breakpoints.map((bp) => (
                      <div
                        key={bp.id}
                        className="flex items-center gap-2 pl-5 py-1 text-xs hover:bg-card/50 rounded"
                      >
                        <button
                          className={cn(
                            'h-3 w-3 rounded-full border',
                            bp.enabled
                              ? 'bg-red-500 border-red-500'
                              : 'bg-transparent border-muted'
                          )}
                          onClick={() => {
                            void fetch(`/api/debug/${activeSession.id}/breakpoint/${bp.id}`, {
                              method: 'PATCH',
                            }).then(() => fetchSession(activeSession.id))
                          }}
                        />
                        <span className="flex-1 truncate font-mono">
                          {bp.file.split(/[/\\]/).pop()}:{bp.line}
                        </span>
                        <button
                          className="text-muted hover:text-red-500"
                          onClick={() => {
                            void fetch(`/api/debug/${activeSession.id}/breakpoint/${bp.id}`, {
                              method: 'DELETE',
                            }).then(() => fetchSession(activeSession.id))
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible defaultOpen data-testid="call-stack-section">
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-xs font-medium text-muted hover:text-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <Layers className="h-3 w-3" />
                  Call Stack ({activeSession.callStack.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {activeSession.callStack.length === 0 ? (
                    <p className="text-xs text-muted pl-5">
                      {isPaused ? 'No call stack' : 'Not paused'}
                    </p>
                  ) : (
                    activeSession.callStack.map((frame) => (
                      <button
                        key={frame.id}
                        className={cn(
                          'flex items-center gap-2 w-full pl-5 py-1 text-xs text-left hover:bg-card/50 rounded',
                          selectedFrameId === frame.id && 'bg-primary/10'
                        )}
                        onClick={() => void selectFrame(frame.id)}
                      >
                        <span className="text-primary">{frame.name}</span>
                        <span className="text-muted truncate flex-1">
                          {frame.file.split(/[/\\]/).pop()}:{frame.line}
                        </span>
                      </button>
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible defaultOpen data-testid="variables-section">
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-xs font-medium text-muted hover:text-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <Variable className="h-3 w-3" />
                  Variables
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {!isPaused ? (
                    <p className="text-xs text-muted pl-5">Not paused</p>
                  ) : scopes.length === 0 ? (
                    <p className="text-xs text-muted pl-5">No variables</p>
                  ) : (
                    scopes.map((scope) => (
                      <div key={scope.variablesReference}>
                        <button
                          className="flex items-center gap-1 w-full pl-5 py-1 text-xs hover:bg-card/50 rounded"
                          onClick={() => void toggleScope(scope.variablesReference)}
                        >
                          {expandedScopes.has(scope.variablesReference) ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <span className="font-medium">{scope.name}</span>
                        </button>
                        {expandedScopes.has(scope.variablesReference) && (
                          <div className="pl-8 space-y-0.5">
                            {(variables.get(scope.variablesReference) || []).map((v, i) => (
                              <div
                                key={`${v.name}-${i}`}
                                className="flex items-center gap-2 py-0.5 text-xs"
                              >
                                <span className="text-blue-400">{v.name}</span>
                                <span className="text-muted">=</span>
                                <span className="text-green-400 truncate">{v.value}</span>
                                <span className="text-muted text-[10px]">({v.type})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>

          <div className="border-t border-border" data-testid="debug-console">
            <div className="flex items-center gap-2 px-2 py-1 bg-card/30">
              <Terminal className="h-3 w-3 text-muted" />
              <span className="text-xs font-medium text-muted">Debug Console</span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setConsoleEntries([])}
                title="Clear console"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <ScrollArea className="h-32 bg-background/50">
              <div className="p-2 space-y-1 font-mono text-xs">
                {consoleEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      'flex gap-2',
                      entry.type === 'input' && 'text-blue-400',
                      entry.type === 'output' && 'text-foreground',
                      entry.type === 'error' && 'text-red-400'
                    )}
                  >
                    <span className="text-muted shrink-0">
                      {entry.type === 'input' ? '>' : '<'}
                    </span>
                    <span className="break-all">{entry.content}</span>
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
            </ScrollArea>
            <div className="flex items-center gap-2 p-2 border-t border-border">
              <Input
                placeholder="Evaluate expression..."
                value={consoleInput}
                onChange={(e) => setConsoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void evaluateExpression()
                  }
                }}
                className="h-7 text-xs font-mono"
                disabled={!isPaused}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => void evaluateExpression()}
                disabled={!isPaused || !consoleInput.trim()}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {!activeSession && sessions.length === 0 && !showNewSession && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Bug className="h-8 w-8 text-muted mb-3" />
          <p className="text-sm text-muted mb-2">No debug sessions</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewSession(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Start Debug Session
          </Button>
        </div>
      )}
    </div>
  )
}
