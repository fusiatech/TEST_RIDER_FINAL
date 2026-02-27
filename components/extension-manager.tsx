'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Trash2,
  Settings,
  Search,
  Package,
  Palette,
  Code,
  Wrench,
  Plug,
  RefreshCw,
  FolderOpen,
  Download,
  X,
  Check,
  Play,
  Square,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from 'sonner'
import type { Extension, ExtensionCategory, ExtensionActivationStatus } from '@/lib/extensions'

interface ExtensionWithStatus extends Extension {
  activationStatus?: ExtensionActivationStatus
  activationError?: string
}

const ACTIVATION_STATUS_COLORS: Record<ExtensionActivationStatus, string> = {
  inactive: '#6b7280',
  activating: '#f59e0b',
  active: '#22c55e',
  error: '#ef4444',
}

const ACTIVATION_STATUS_LABELS: Record<ExtensionActivationStatus, string> = {
  inactive: 'Inactive',
  activating: 'Activating...',
  active: 'Active',
  error: 'Error',
}

const CATEGORY_ICONS: Record<ExtensionCategory, typeof Package> = {
  theme: Palette,
  language: Code,
  tool: Wrench,
  integration: Plug,
}

const CATEGORY_LABELS: Record<ExtensionCategory, string> = {
  theme: 'Theme',
  language: 'Language',
  tool: 'Tool',
  integration: 'Integration',
}

const CATEGORY_COLORS: Record<ExtensionCategory, string> = {
  theme: '#a78bfa',
  language: '#60a5fa',
  tool: '#34d399',
  integration: '#fbbf24',
}

interface ExtensionCardProps {
  extension: ExtensionWithStatus
  onToggle: (id: string) => void
  onUninstall: (id: string) => void
  onConfigure: (id: string) => void
  onActivate: (id: string) => void
  onDeactivate: (id: string) => void
  activating?: boolean
}

function ExtensionCard({
  extension,
  onToggle,
  onUninstall,
  onConfigure,
  onActivate,
  onDeactivate,
  activating,
}: ExtensionCardProps) {
  const CategoryIcon = CATEGORY_ICONS[extension.category]
  const status = extension.activationStatus ?? 'inactive'
  const isActive = status === 'active'
  const isActivating = status === 'activating' || activating

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${CATEGORY_COLORS[extension.category]}20` }}
          >
            <CategoryIcon
              className="h-5 w-5"
              style={{ color: CATEGORY_COLORS[extension.category] }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="truncate font-medium text-foreground">
                {extension.name}
              </h4>
              <Badge variant="outline" className="text-[10px] shrink-0">
                v{extension.version}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 flex items-center gap-1"
                style={{
                  borderColor: ACTIVATION_STATUS_COLORS[status],
                  color: ACTIVATION_STATUS_COLORS[status],
                }}
              >
                {status === 'activating' && (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                )}
                {status === 'error' && <AlertCircle className="h-2.5 w-2.5" />}
                {status === 'active' && (
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                )}
                {ACTIVATION_STATUS_LABELS[status]}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {extension.description}
            </p>
            {status === 'error' && extension.activationError && (
              <p className="mt-1 text-[10px] text-destructive line-clamp-1">
                {extension.activationError}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{
                  backgroundColor: `${CATEGORY_COLORS[extension.category]}20`,
                  color: CATEGORY_COLORS[extension.category],
                }}
              >
                {CATEGORY_LABELS[extension.category]}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                by {extension.author}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {extension.enabled && (
            isActive ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-amber-500"
                onClick={() => onDeactivate(extension.id)}
                disabled={isActivating}
                title="Deactivate"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-500"
                onClick={() => onActivate(extension.id)}
                disabled={isActivating}
                title="Activate"
              >
                {isActivating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            )
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onConfigure(extension.id)}
            title="Configure"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => onUninstall(extension.id)}
            title="Uninstall"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Switch
            checked={extension.enabled}
            onCheckedChange={() => onToggle(extension.id)}
          />
        </div>
      </div>
    </div>
  )
}

interface InstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstall: (source: 'local' | 'url', value: string) => void
}

function InstallDialog({ open, onOpenChange, onInstall }: InstallDialogProps) {
  const [source, setSource] = useState<'local' | 'url'>('local')
  const [value, setValue] = useState('')

  const handleInstall = useCallback(() => {
    if (!value.trim()) {
      toast.error('Please enter a path or URL')
      return
    }
    onInstall(source, value.trim())
    setValue('')
    onOpenChange(false)
  }, [source, value, onInstall, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install Extension</DialogTitle>
          <DialogDescription>
            Install an extension from a local path or URL.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Source</label>
            <Select
              value={source}
              onValueChange={(v: string) => setSource(v as 'local' | 'url')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Local Path
                  </div>
                </SelectItem>
                <SelectItem value="url">
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    URL
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {source === 'local' ? 'Extension Path' : 'Extension URL'}
            </label>
            <Input
              placeholder={
                source === 'local'
                  ? 'C:\\path\\to\\extension'
                  : 'https://github.com/user/extension-repo'
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {source === 'url' && (
              <p className="text-xs text-muted-foreground">
                Currently only GitHub URLs are supported. The repository must contain a valid manifest.json file.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleInstall}>
            <Check className="mr-1 h-4 w-4" />
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ConfigDialogProps {
  extension: Extension | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (id: string, config: Record<string, unknown>) => void
}

function ConfigDialog({
  extension,
  open,
  onOpenChange,
  onSave,
}: ConfigDialogProps) {
  const [configPairs, setConfigPairs] = useState<
    Array<{ key: string; value: string }>
  >([])

  useEffect(() => {
    if (extension?.config) {
      setConfigPairs(
        Object.entries(extension.config).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        }))
      )
    } else {
      setConfigPairs([])
    }
  }, [extension])

  const handleSave = useCallback(() => {
    if (!extension) return
    const config: Record<string, unknown> = {}
    for (const pair of configPairs) {
      if (pair.key.trim()) {
        try {
          config[pair.key.trim()] = JSON.parse(pair.value)
        } catch {
          config[pair.key.trim()] = pair.value
        }
      }
    }
    onSave(extension.id, config)
    onOpenChange(false)
  }, [extension, configPairs, onSave, onOpenChange])

  const addPair = useCallback(() => {
    setConfigPairs((prev) => [...prev, { key: '', value: '' }])
  }, [])

  const updatePair = useCallback(
    (index: number, field: 'key' | 'value', val: string) => {
      setConfigPairs((prev) =>
        prev.map((p, i) => (i === index ? { ...p, [field]: val } : p))
      )
    },
    []
  )

  const removePair = useCallback((index: number) => {
    setConfigPairs((prev) => prev.filter((_, i) => i !== index))
  }, [])

  if (!extension) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {extension.name}</DialogTitle>
          <DialogDescription>
            Customize extension settings and behavior.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Configuration</span>
            <Button variant="ghost" size="sm" onClick={addPair}>
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>
          {configPairs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No configuration options. Click &quot;Add&quot; to add custom settings.
            </p>
          ) : (
            <div className="space-y-2">
              {configPairs.map((pair, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder="key"
                    value={pair.key}
                    onChange={(e) => updatePair(idx, 'key', e.target.value)}
                    className="flex-1 font-mono text-xs"
                  />
                  <Input
                    placeholder="value"
                    value={pair.value}
                    onChange={(e) => updatePair(idx, 'value', e.target.value)}
                    className="flex-1 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removePair(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExtensionManager() {
  const [extensions, setExtensions] = useState<ExtensionWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ExtensionCategory | 'all'>(
    'all'
  )
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [selectedExtension, setSelectedExtension] = useState<ExtensionWithStatus | null>(
    null
  )
  const [activatingIds, setActivatingIds] = useState<Set<string>>(new Set())
  const [installUrl, setInstallUrl] = useState('')
  const [installing, setInstalling] = useState(false)

  const fetchExtensions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/extensions')
      if (!res.ok) throw new Error('Failed to fetch extensions')
      const data = await res.json()
      setExtensions(data.extensions || [])
    } catch (err) {
      console.error('Failed to load extensions:', err)
      toast.error('Failed to load extensions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExtensions()
  }, [fetchExtensions])

  const filteredExtensions = useMemo(() => {
    return extensions.filter((ext) => {
      const matchesSearch =
        searchQuery === '' ||
        ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext.author.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory =
        categoryFilter === 'all' || ext.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [extensions, searchQuery, categoryFilter])

  const handleToggle = useCallback(async (id: string) => {
    const ext = extensions.find((e) => e.id === id)
    if (!ext) return

    try {
      // If disabling and currently active, deactivate first
      if (ext.enabled && ext.activationStatus === 'active') {
        await fetch(`/api/extensions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deactivate' }),
        })
      }

      const res = await fetch(`/api/extensions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !ext.enabled }),
      })
      if (!res.ok) throw new Error('Failed to update extension')
      const data = await res.json()
      setExtensions((prev) =>
        prev.map((e) => (e.id === id ? { ...data.extension, activationStatus: data.activationStatus, activationError: data.activationError } : e))
      )
      toast.success(
        `${ext.name} ${!ext.enabled ? 'enabled' : 'disabled'}`
      )
    } catch (err) {
      console.error('Failed to toggle extension:', err)
      toast.error('Failed to update extension')
    }
  }, [extensions])

  const handleUninstall = useCallback(async (id: string) => {
    const ext = extensions.find((e) => e.id === id)
    if (!ext) return

    try {
      const res = await fetch(`/api/extensions?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to uninstall extension')
      setExtensions((prev) => prev.filter((e) => e.id !== id))
      toast.success(`${ext.name} uninstalled`)
    } catch (err) {
      console.error('Failed to uninstall extension:', err)
      toast.error('Failed to uninstall extension')
    }
  }, [extensions])

  const handleConfigure = useCallback(
    (id: string) => {
      const ext = extensions.find((e) => e.id === id)
      if (ext) {
        setSelectedExtension(ext)
        setConfigDialogOpen(true)
      }
    },
    [extensions]
  )

  const handleInstall = useCallback(
    async (source: 'local' | 'url', value: string) => {
      try {
        const res = await fetch('/api/extensions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source,
            [source === 'local' ? 'path' : 'url']: value,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to install extension')
        }
        const data = await res.json()
        setExtensions((prev) => [...prev, data.extension])
        toast.success(`${data.extension.name} installed`)
      } catch (err) {
        console.error('Failed to install extension:', err)
        toast.error(
          err instanceof Error ? err.message : 'Failed to install extension'
        )
      }
    },
    []
  )

  const handleUrlInstall = useCallback(async () => {
    if (!installUrl.trim()) return
    setInstalling(true)
    try {
      const res = await fetch('/api/extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'url', url: installUrl.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setExtensions((prev) => [...prev, data.extension])
        toast.success(`${data.extension.name} installed successfully`)
        setInstallUrl('')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to install extension')
      }
    } catch (error) {
      console.error('Failed to install extension:', error)
      toast.error('Failed to install extension')
    } finally {
      setInstalling(false)
    }
  }, [installUrl])

  const handleSaveConfig = useCallback(
    async (id: string, config: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/extensions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        })
        if (!res.ok) throw new Error('Failed to save configuration')
        const data = await res.json()
        setExtensions((prev) =>
          prev.map((e) => (e.id === id ? { ...data.extension, activationStatus: data.activationStatus, activationError: data.activationError } : e))
        )
        toast.success('Configuration saved')
      } catch (err) {
        console.error('Failed to save config:', err)
        toast.error('Failed to save configuration')
      }
    },
    []
  )

  const handleActivate = useCallback(async (id: string) => {
    const ext = extensions.find((e) => e.id === id)
    if (!ext) return

    setActivatingIds((prev) => new Set(prev).add(id))

    try {
      const res = await fetch(`/api/extensions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      })
      if (!res.ok) throw new Error('Failed to activate extension')
      const data = await res.json()
      
      if (data.success) {
        setExtensions((prev) =>
          prev.map((e) =>
            e.id === id
              ? { ...e, activationStatus: data.activationStatus, activationError: data.activationError }
              : e
          )
        )
        toast.success(`${ext.name} activated`)
      } else {
        setExtensions((prev) =>
          prev.map((e) =>
            e.id === id
              ? { ...e, activationStatus: data.activationStatus, activationError: data.activationError }
              : e
          )
        )
        toast.error(`Failed to activate: ${data.error}`)
      }
    } catch (err) {
      console.error('Failed to activate extension:', err)
      toast.error('Failed to activate extension')
    } finally {
      setActivatingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [extensions])

  const handleDeactivate = useCallback(async (id: string) => {
    const ext = extensions.find((e) => e.id === id)
    if (!ext) return

    setActivatingIds((prev) => new Set(prev).add(id))

    try {
      const res = await fetch(`/api/extensions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      })
      if (!res.ok) throw new Error('Failed to deactivate extension')
      const data = await res.json()
      
      setExtensions((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, activationStatus: data.activationStatus, activationError: data.activationError }
            : e
        )
      )
      toast.success(`${ext.name} deactivated`)
    } catch (err) {
      console.error('Failed to deactivate extension:', err)
      toast.error('Failed to deactivate extension')
    } finally {
      setActivatingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [extensions])

  const stats = useMemo(() => {
    const enabled = extensions.filter((e) => e.enabled).length
    const active = extensions.filter((e) => e.activationStatus === 'active').length
    const byCategory = {
      theme: extensions.filter((e) => e.category === 'theme').length,
      language: extensions.filter((e) => e.category === 'language').length,
      tool: extensions.filter((e) => e.category === 'tool').length,
      integration: extensions.filter((e) => e.category === 'integration').length,
    }
    return { total: extensions.length, enabled, active, byCategory }
  }, [extensions])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Extensions</h2>
          <Badge variant="secondary" className="text-xs">
            {stats.total} installed
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchExtensions}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button size="sm" onClick={() => setInstallDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Install
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search extensions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(v: string) =>
            setCategoryFilter(v as ExtensionCategory | 'all')
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="theme">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Themes
              </div>
            </SelectItem>
            <SelectItem value="language">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Languages
              </div>
            </SelectItem>
            <SelectItem value="tool">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Tools
              </div>
            </SelectItem>
            <SelectItem value="integration">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4" />
                Integrations
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick URL Install */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-muted/20">
        <Download className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Install from GitHub URL (e.g., https://github.com/user/extension)"
          value={installUrl}
          onChange={(e) => setInstallUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && installUrl.trim() && !installing) {
              handleUrlInstall()
            }
          }}
          className="flex-1"
          disabled={installing}
        />
        <Button
          size="sm"
          onClick={handleUrlInstall}
          disabled={!installUrl.trim() || installing}
        >
          {installing ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Download className="mr-1 h-4 w-4" />
              Install
            </>
          )}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 border-b border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          {stats.enabled} enabled
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          {stats.active} active
        </div>
        <div className="h-3 w-px bg-border" />
        {Object.entries(stats.byCategory).map(([cat, count]) => {
          const Icon = CATEGORY_ICONS[cat as ExtensionCategory]
          return (
            <div
              key={cat}
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <Icon
                className="h-3 w-3"
                style={{ color: CATEGORY_COLORS[cat as ExtensionCategory] }}
              />
              {count}
            </div>
          )
        })}
      </div>

      {/* Extension Grid */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredExtensions.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="No extensions found"
            description={
              searchQuery || categoryFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Install an extension to get started'
            }
            action={
              !searchQuery && categoryFilter === 'all'
                ? {
                    label: 'Install Extension',
                    onClick: () => setInstallDialogOpen(true),
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {filteredExtensions.map((ext) => (
              <ExtensionCard
                key={ext.id}
                extension={ext}
                onToggle={handleToggle}
                onUninstall={handleUninstall}
                onConfigure={handleConfigure}
                onActivate={handleActivate}
                onDeactivate={handleDeactivate}
                activating={activatingIds.has(ext.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <InstallDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        onInstall={handleInstall}
      />
      <ConfigDialog
        extension={selectedExtension}
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleSaveConfig}
      />
    </div>
  )
}
