'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Server,
  Wrench,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Settings,
  MousePointerClick,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface MCPServer {
  id: string
  name: string
  command: string
  enabled: boolean
  connected: boolean
  tools: MCPTool[]
  error?: string
}

interface MCPServersResponse {
  servers: MCPServer[]
  activeConnections: number
}

interface ToolCallResult {
  serverId: string
  toolName: string
  result: unknown
  timestamp: number
}

export function MCPToolsPanel() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())
  const [selectedTool, setSelectedTool] = useState<{ serverId: string; tool: MCPTool } | null>(null)
  const [toolArgs, setToolArgs] = useState<string>('{}')
  const [executing, setExecuting] = useState(false)
  const [lastResult, setLastResult] = useState<ToolCallResult | null>(null)

  const fetchServers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mcp')
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch MCP servers')
      }
      const data: MCPServersResponse = await res.json()
      setServers(data.servers)

      const connectedIds = data.servers.filter((s) => s.connected).map((s) => s.id)
      setExpandedServers(new Set(connectedIds))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to load MCP servers: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  const toggleServer = useCallback((serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev)
      if (next.has(serverId)) {
        next.delete(serverId)
      } else {
        next.add(serverId)
      }
      return next
    })
  }, [])

  const selectTool = useCallback((serverId: string, tool: MCPTool) => {
    setSelectedTool({ serverId, tool })
    const defaultArgs: Record<string, unknown> = {}
    const schema = tool.inputSchema as { properties?: Record<string, unknown> }
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        defaultArgs[key] = ''
      }
    }
    setToolArgs(JSON.stringify(defaultArgs, null, 2))
    setLastResult(null)
  }, [])

  const executeTool = useCallback(async () => {
    if (!selectedTool) return

    let parsedArgs: Record<string, unknown>
    try {
      parsedArgs = JSON.parse(toolArgs)
    } catch {
      toast.error('Invalid JSON in arguments')
      return
    }

    setExecuting(true)
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: selectedTool.serverId,
          toolName: selectedTool.tool.name,
          args: parsedArgs,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Tool execution failed')
      }

      const result: ToolCallResult = await res.json()
      setLastResult(result)
      toast.success(`Tool "${selectedTool.tool.name}" executed successfully`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Tool execution failed: ${message}`)
    } finally {
      setExecuting(false)
    }
  }, [selectedTool, toolArgs])

  const copyResult = useCallback(() => {
    if (lastResult) {
      navigator.clipboard.writeText(JSON.stringify(lastResult.result, null, 2))
      toast.success('Result copied to clipboard')
    }
  }, [lastResult])

  const connectedCount = servers.filter((s) => s.connected).length
  const totalTools = servers.reduce((sum, s) => sum + s.tools.length, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium">MCP Tools</span>
          <Badge variant="outline" className="text-xs">
            {connectedCount}/{servers.length} servers
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {totalTools} tools
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchServers}
          disabled={loading}
          className="h-7 px-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r border-border">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {servers.length === 0 && !loading && (
                <div className="px-2 py-8">
                  <EmptyState
                    icon={<Settings />}
                    title="No MCP servers"
                    description="Add servers in Settings to get started"
                    className="h-auto"
                  />
                </div>
              )}

              {servers.map((server) => (
                <div key={server.id} className="space-y-0.5">
                  <button
                    onClick={() => toggleServer(server.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      'hover:bg-accent/50',
                      expandedServers.has(server.id) && 'bg-accent/30'
                    )}
                  >
                    {expandedServers.has(server.id) ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                    )}
                    <div
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        server.connected ? 'bg-green-500' : server.enabled ? 'bg-yellow-500' : 'bg-zinc-500'
                      )}
                    />
                    <span className="truncate flex-1">{server.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {server.tools.length}
                    </Badge>
                  </button>

                  {expandedServers.has(server.id) && (
                    <div className="ml-4 space-y-0.5">
                      {server.error && (
                        <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-destructive">
                          <XCircle className="h-3 w-3" />
                          <span className="truncate">{server.error}</span>
                        </div>
                      )}

                      {server.tools.map((tool) => (
                        <button
                          key={tool.name}
                          onClick={() => selectTool(server.id, tool)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors',
                            'hover:bg-accent/50',
                            selectedTool?.serverId === server.id &&
                              selectedTool?.tool.name === tool.name &&
                              'bg-primary/10 text-primary'
                          )}
                        >
                          <Wrench className="h-3 w-3 shrink-0 text-muted" />
                          <span className="truncate">{tool.name}</span>
                        </button>
                      ))}

                      {server.tools.length === 0 && !server.error && (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          No tools available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedTool ? (
            <>
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{selectedTool.tool.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {servers.find((s) => s.id === selectedTool.serverId)?.name}
                  </Badge>
                </div>
                {selectedTool.tool.description && (
                  <p className="mt-1 text-xs text-muted">{selectedTool.tool.description}</p>
                )}
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted mb-1.5 block">
                    Arguments (JSON)
                  </label>
                  <textarea
                    value={toolArgs}
                    onChange={(e) => setToolArgs(e.target.value)}
                    className={cn(
                      'w-full h-32 rounded-md border border-border bg-background px-3 py-2',
                      'font-mono text-xs resize-none',
                      'focus:outline-none focus:ring-2 focus:ring-primary'
                    )}
                    placeholder="{}"
                  />
                </div>

                <Button
                  onClick={executeTool}
                  disabled={executing}
                  className="w-full gap-2"
                >
                  {executing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {executing ? 'Executing...' : 'Execute Tool'}
                </Button>

                {lastResult && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-xs font-medium">Result</span>
                        <span className="text-xs text-muted">
                          {new Date(lastResult.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={copyResult}
                        className="h-6 px-2"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <pre
                      className={cn(
                        'w-full rounded-md border border-border bg-muted/30 p-3',
                        'font-mono text-xs overflow-auto max-h-64'
                      )}
                    >
                      {typeof lastResult.result === 'string'
                        ? lastResult.result
                        : JSON.stringify(lastResult.result, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedTool.tool.inputSchema && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted">Input Schema</span>
                    <pre
                      className={cn(
                        'w-full rounded-md border border-border bg-muted/30 p-3',
                        'font-mono text-xs overflow-auto max-h-48'
                      )}
                    >
                      {JSON.stringify(selectedTool.tool.inputSchema, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<MousePointerClick />}
              title="Select a tool"
              description="Choose a tool from the sidebar to get started"
              className="flex-1"
            />
          )}
        </div>
      </div>
    </div>
  )
}
