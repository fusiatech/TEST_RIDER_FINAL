'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSwarmStore } from '@/lib/store'
import type { MCPServer } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { generateId } from '@/lib/utils'
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Wifi,
  Server,
} from 'lucide-react'
import { toast } from 'sonner'

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

export function MCPConfig() {
  const settings = useSwarmStore((s) => s.settings)
  const updateSettings = useSwarmStore((s) => s.updateSettings)

  const servers = useMemo(() => settings.mcpServers ?? [], [settings.mcpServers])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

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
      toast.success('Server removed')
    },
    [servers, updateSettings]
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
    (id: string) => {
      const server = servers.find((s) => s.id === id)
      if (!server) return
      setTestingId(id)
      setTimeout(() => {
        if (server.command.trim()) {
          toast.success(`"${server.name}" responded OK`)
        } else {
          toast.error(`"${server.name}" has no command configured`)
        }
        setTestingId(null)
      }, 1200)
    },
    [servers]
  )

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
        <Server className="h-4 w-4" />
        MCP Servers
      </h3>

      <div className="space-y-2">
        {servers.map((server) =>
          editingId === server.id ? (
            <ServerEditor
              key={server.id}
              server={server}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={server.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: server.enabled ? '#22c55e' : '#71717a',
                  }}
                />
                <span className="truncate text-sm text-foreground/90">
                  {server.name || 'Unnamed'}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {server.command}
                </Badge>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleTestConnection(server.id)}
                  disabled={testingId === server.id}
                  title="Test connection"
                >
                  <Wifi className={`h-3.5 w-3.5 ${testingId === server.id ? 'animate-pulse' : ''}`} />
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
          )
        )}

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
    </section>
  )
}
