'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSwarmStore } from '@/lib/store'
import type { MCPServer } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { generateId } from '@/lib/utils'
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Wifi,
  WifiOff,
  Server,
  RefreshCw,
  Wrench,
  FileText,
  ScrollText,
  ChevronDown,
  ChevronRight,
  Play,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Activity,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting'

interface MCPConnectionLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: unknown
}

interface MCPServerHealth {
  status: MCPConnectionStatus
  lastConnected?: number
  lastError?: string
  reconnectAttempts: number
  uptime?: number
  latency?: number
}

interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

interface ServerWithTools {
  id: string
  name: string
  command: string
  enabled: boolean
  connected: boolean
  status: MCPConnectionStatus
  health?: MCPServerHealth
  tools: MCPTool[]
  resources: MCPResource[]
  logs?: MCPConnectionLog[]
  capabilities?: Record<string, unknown>
  error?: string
}

interface TestResult {
  success: boolean
  serverId: string
  latency?: number
  toolCount?: number
  resourceCount?: number
  error?: string
}

function createEmptyServer(): MCPServer {
  return {
    id: generateId(),
    name: '',
    command: '',
    args: [],
    env: {},
    enabled: true,
  }
}

function getStatusColor(status: MCPConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '#22c55e'
    case 'connecting':
    case 'reconnecting':
      return '#f59e0b'
    case 'error':
      return '#ef4444'
    default:
      return '#71717a'
  }
}

function getStatusIcon(status: MCPConnectionStatus) {
  switch (status) {
    case 'connected':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    case 'connecting':
    case 'reconnecting':
      return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
    default:
      return <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

interface ServerEditorProps {
  server: MCPServer
  onSave: (server: MCPServer) => void
  onCancel: () => void
}

function ServerEditor({ server, onSave, onCancel }: ServerEditorProps) {
  const [name, setName] = useState(server.name)
  const [command, setCommand] = useState(server.command)
  const [argsStr, setArgsStr] = useState(server.args.join(', '))
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>(
    Object.entries(server.env).map(([key, value]) => ({ key, value }))
  )

  const handleSave = useCallback(() => {
    if (!name.trim() || !command.trim()) {
      toast.error('Name and command are required')
      return
    }
    const env: Record<string, string> = {}
    for (const pair of envPairs) {
      if (pair.key.trim()) {
        env[pair.key.trim()] = pair.value
      }
    }
    onSave({
      ...server,
      name: name.trim(),
      command: command.trim(),
      args: argsStr
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      env,
    })
  }, [name, command, argsStr, envPairs, server, onSave])

  const addEnvPair = useCallback(() => {
    setEnvPairs((prev) => [...prev, { key: '', value: '' }])
  }, [])

  const updateEnvPair = useCallback(
    (index: number, field: 'key' | 'value', val: string) => {
      setEnvPairs((prev) =>
        prev.map((p, i) => (i === index ? { ...p, [field]: val } : p))
      )
    },
    []
  )

  const removeEnvPair = useCallback((index: number) => {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <Input
        placeholder="Server name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Command (e.g. npx, node)"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
      />
      <Input
        placeholder="Args (comma-separated)"
        value={argsStr}
        onChange={(e) => setArgsStr(e.target.value)}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Environment variables</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={addEnvPair}>
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
        {envPairs.map((pair, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              placeholder="KEY"
              value={pair.key}
              onChange={(e) => updateEnvPair(idx, 'key', e.target.value)}
              className="flex-1 font-mono text-xs"
            />
            <Input
              placeholder="value"
              value={pair.value}
              onChange={(e) => updateEnvPair(idx, 'value', e.target.value)}
              className="flex-1 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => removeEnvPair(idx)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" />
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave}>
          <Check className="mr-1 h-3 w-3" />
          Save
        </Button>
      </div>
    </div>
  )
}

interface ToolListProps {
  tools: MCPTool[]
  serverId: string
  onCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) => void
}

function ToolList({ tools, serverId, onCallTool }: ToolListProps) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({})

  if (tools.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        No tools available
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <div key={tool.name} className="border border-border rounded-lg">
          <button
            className="w-full flex items-center justify-between p-2 hover:bg-muted/50 transition-colors"
            onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
          >
            <div className="flex items-center gap-2">
              {expandedTool === tool.name ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Wrench className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-sm">{tool.name}</span>
            </div>
          </button>
          {expandedTool === tool.name && (
            <div className="px-3 pb-3 space-y-2 border-t border-border">
              <p className="text-xs text-muted-foreground pt-2">{tool.description}</p>
              {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium">Input Schema:</span>
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder='Args JSON (e.g. {"key": "value"})'
                  value={toolArgs[tool.name] || ''}
                  onChange={(e) => setToolArgs((prev) => ({ ...prev, [tool.name]: e.target.value }))}
                  className="flex-1 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    try {
                      const args = toolArgs[tool.name] ? JSON.parse(toolArgs[tool.name]) : {}
                      onCallTool(serverId, tool.name, args)
                    } catch {
                      toast.error('Invalid JSON arguments')
                    }
                  }}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Call
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface ResourceBrowserProps {
  resources: MCPResource[]
  serverId: string
  onReadResource: (serverId: string, uri: string) => void
}

function ResourceBrowser({ resources, serverId, onReadResource }: ResourceBrowserProps) {
  if (resources.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        No resources available
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {resources.map((resource) => (
        <div
          key={resource.uri}
          className="flex items-center justify-between p-2 border border-border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-sm truncate">{resource.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{resource.uri}</div>
              {resource.description && (
                <div className="text-xs text-muted-foreground">{resource.description}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {resource.mimeType && (
              <Badge variant="outline" className="text-[10px]">
                {resource.mimeType}
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onReadResource(serverId, resource.uri)}
            >
              <FileText className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

interface ConnectionLogsProps {
  logs: MCPConnectionLog[]
}

function ConnectionLogs({ logs }: ConnectionLogsProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        No logs available
      </div>
    )
  }

  const getLevelColor = (level: MCPConnectionLog['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-500'
      case 'warn':
        return 'text-amber-500'
      case 'info':
        return 'text-blue-500'
      case 'debug':
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {logs.map((log, idx) => (
        <div key={idx} className="flex items-start gap-2 text-xs font-mono">
          <span className="text-muted-foreground shrink-0">
            {formatTimestamp(log.timestamp)}
          </span>
          <span className={`uppercase shrink-0 w-12 ${getLevelColor(log.level)}`}>
            [{log.level}]
          </span>
          <span className="break-all">{log.message}</span>
        </div>
      ))}
    </div>
  )
}

interface ServerDetailPanelProps {
  server: ServerWithTools
  onCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) => void
  onReadResource: (serverId: string, uri: string) => void
  onRefresh: () => void
}

function ServerDetailPanel({ server, onCallTool, onReadResource, onRefresh }: ServerDetailPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon(server.status)}
          <span className="font-medium">{server.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {server.status}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {server.health && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          {server.health.latency !== undefined && (
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-500" />
              <span>{server.health.latency}ms</span>
            </div>
          )}
          {server.health.uptime !== undefined && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-blue-500" />
              <span>{formatUptime(server.health.uptime)}</span>
            </div>
          )}
          {server.health.reconnectAttempts > 0 && (
            <div className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3 text-orange-500" />
              <span>{server.health.reconnectAttempts} retries</span>
            </div>
          )}
        </div>
      )}

      {server.error && (
        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-500">
          {server.error}
        </div>
      )}

      <Tabs defaultValue="tools" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tools" className="text-xs">
            <Wrench className="h-3 w-3 mr-1" />
            Tools ({server.tools.length})
          </TabsTrigger>
          <TabsTrigger value="resources" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Resources ({server.resources.length})
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            <ScrollText className="h-3 w-3 mr-1" />
            Logs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tools" className="mt-2">
          <ToolList tools={server.tools} serverId={server.id} onCallTool={onCallTool} />
        </TabsContent>
        <TabsContent value="resources" className="mt-2">
          <ResourceBrowser
            resources={server.resources}
            serverId={server.id}
            onReadResource={onReadResource}
          />
        </TabsContent>
        <TabsContent value="logs" className="mt-2">
          <ConnectionLogs logs={server.logs ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function MCPConfig() {
  const settings = useSwarmStore((s) => s.settings)
  const updateSettings = useSwarmStore((s) => s.updateSettings)

  const servers = useMemo(() => settings.mcpServers ?? [], [settings.mcpServers])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [serverStatuses, setServerStatuses] = useState<Map<string, ServerWithTools>>(new Map())
  const [loading, setLoading] = useState(false)
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map())

  const fetchServerStatuses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mcp?logs=true')
      if (res.ok) {
        const data = await res.json()
        const statusMap = new Map<string, ServerWithTools>()
        for (const server of data.servers) {
          statusMap.set(server.id, server)
        }
        setServerStatuses(statusMap)
      }
    } catch (err) {
      console.error('Failed to fetch MCP server statuses:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (servers.length > 0) {
      fetchServerStatuses()
    }
  }, [servers.length, fetchServerStatuses])

  const handleSave = useCallback(
    (server: MCPServer) => {
      const updated = servers.some((s) => s.id === server.id)
        ? servers.map((s) => (s.id === server.id ? server : s))
        : [...servers, server]
      updateSettings({ mcpServers: updated })
      setEditingId(null)
      setAdding(false)
      toast.success(`MCP server "${server.name}" saved`)
    },
    [servers, updateSettings]
  )

  const handleDelete = useCallback(
    (id: string) => {
      updateSettings({ mcpServers: servers.filter((s) => s.id !== id) })
      if (selectedServerId === id) {
        setSelectedServerId(null)
      }
      toast.success('Server removed')
    },
    [servers, updateSettings, selectedServerId]
  )

  const handleToggle = useCallback(
    (id: string) => {
      updateSettings({
        mcpServers: servers.map((s) =>
          s.id === id ? { ...s, enabled: !s.enabled } : s
        ),
      })
    },
    [servers, updateSettings]
  )

  const handleTestConnection = useCallback(
    async (id: string) => {
      const server = servers.find((s) => s.id === id)
      if (!server) return
      
      setTestingId(id)
      try {
        const res = await fetch('/api/mcp?action=test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId: id }),
        })
        const result: TestResult = await res.json()
        setTestResults((prev) => new Map(prev).set(id, result))
        
        if (result.success) {
          toast.success(
            `"${server.name}" connected (${result.latency}ms, ${result.toolCount} tools, ${result.resourceCount} resources)`
          )
        } else {
          toast.error(`"${server.name}" failed: ${result.error}`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error(`Test failed: ${message}`)
      } finally {
        setTestingId(null)
        fetchServerStatuses()
      }
    },
    [servers, fetchServerStatuses]
  )

  const handleCallTool = useCallback(
    async (serverId: string, toolName: string, args: Record<string, unknown>) => {
      try {
        const res = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId, toolName, args }),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success(`Tool "${toolName}" executed successfully`)
          console.log('Tool result:', data.result)
        } else {
          toast.error(`Tool call failed: ${data.error}`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error(`Tool call failed: ${message}`)
      }
    },
    []
  )

  const handleReadResource = useCallback(
    async (serverId: string, uri: string) => {
      try {
        const res = await fetch('/api/mcp?action=read-resource', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId, uri }),
        })
        const data = await res.json()
        if (res.ok) {
          toast.success('Resource loaded')
          console.log('Resource content:', data.content)
        } else {
          toast.error(`Failed to read resource: ${data.error}`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error(`Failed to read resource: ${message}`)
      }
    },
    []
  )

  const selectedServer = selectedServerId ? serverStatuses.get(selectedServerId) : null

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Server className="h-4 w-4" />
          MCP Servers
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchServerStatuses}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {servers.map((server) => {
            const status = serverStatuses.get(server.id)
            const testResult = testResults.get(server.id)
            
            return editingId === server.id ? (
              <ServerEditor
                key={server.id}
                server={server}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={server.id}
                className={`rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
                  selectedServerId === server.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedServerId(server.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-2 w-2 shrink-0 rounded-full transition-colors"
                      style={{
                        backgroundColor: getStatusColor(status?.status ?? 'disconnected'),
                      }}
                    />
                    <span className="truncate text-sm text-foreground/90">
                      {server.name || 'Unnamed'}
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {server.command}
                    </Badge>
                    {status?.status && status.status !== 'disconnected' && (
                      <Badge
                        variant={status.status === 'connected' ? 'default' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {status.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleTestConnection(server.id)}
                      disabled={testingId === server.id}
                      title="Test connection"
                    >
                      {testingId === server.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Activity className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingId(server.id)}
                      title="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(server.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Switch
                      checked={server.enabled}
                      onCheckedChange={() => handleToggle(server.id)}
                    />
                  </div>
                </div>
                {status?.health && (
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    {status.tools.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {status.tools.length} tools
                      </span>
                    )}
                    {status.resources.length > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {status.resources.length} resources
                      </span>
                    )}
                    {status.health.latency !== undefined && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {status.health.latency}ms
                      </span>
                    )}
                    {status.health.uptime !== undefined && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatUptime(status.health.uptime)}
                      </span>
                    )}
                  </div>
                )}
                {testResult && !testResult.success && (
                  <div className="mt-1 text-[10px] text-red-500 truncate">
                    {testResult.error}
                  </div>
                )}
              </div>
            )
          })}

          {adding && (
            <ServerEditor
              server={createEmptyServer()}
              onSave={handleSave}
              onCancel={() => setAdding(false)}
            />
          )}

          {!adding && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add MCP Server
            </Button>
          )}
        </div>

        <div className="border border-border rounded-lg p-3 min-h-[200px]">
          {selectedServer ? (
            <ServerDetailPanel
              server={selectedServer}
              onCallTool={handleCallTool}
              onReadResource={handleReadResource}
              onRefresh={fetchServerStatuses}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a server to view details
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
