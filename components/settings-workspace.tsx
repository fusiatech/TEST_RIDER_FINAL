'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useSwarmStore } from '@/lib/store'
import type { ApiKeys, CLIProvider, Settings } from '@/lib/types'
import { ROLE_PERMISSIONS } from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ArrowLeft,
  Cpu,
  KeyRound,
  Network,
  Shield,
  SlidersHorizontal,
  Workflow,
  Eye,
  EyeOff,
  Wifi,
  ExternalLink,
  Loader2,
} from 'lucide-react'

type SettingsSectionId = 'providers' | 'routing' | 'runtime' | 'guardrails' | 'integrations'

interface ProviderMeta {
  id: CLIProvider
  label: string
  description: string
  keyField: keyof ApiKeys
  testProvider: string
  endpointDefault: string
}

const SECTION_ITEMS: Array<{ id: SettingsSectionId; label: string; icon: React.ElementType; description: string }> = [
  { id: 'providers', label: 'Providers & Keys', icon: KeyRound, description: 'Per-agent key management and validation' },
  { id: 'routing', label: 'Routing', icon: Workflow, description: 'Selection mode, priority, and failover' },
  { id: 'runtime', label: 'Runtime', icon: Cpu, description: 'Execution controls and limits' },
  { id: 'guardrails', label: 'Guardrails', icon: Shield, description: 'Safety, quality, and confidence controls' },
  { id: 'integrations', label: 'Integrations', icon: Network, description: 'GitHub and API docs' },
]

const PROVIDER_META: ProviderMeta[] = [
  {
    id: 'codex',
    label: 'OpenAI (Codex)',
    description: 'Primary in-app OpenAI provider for coding and orchestration',
    keyField: 'openai',
    testProvider: 'openai',
    endpointDefault: 'https://api.openai.com/v1',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini model provider',
    keyField: 'gemini',
    testProvider: 'gemini',
    endpointDefault: 'https://generativelanguage.googleapis.com/v1',
  },
  {
    id: 'claude',
    label: 'Claude',
    description: 'Anthropic Claude coding/reasoning provider',
    keyField: 'claude',
    testProvider: 'claude',
    endpointDefault: 'https://api.anthropic.com/v1',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    description: 'Cursor account/CLI key (optional integration, not required for in-app OpenAI calls)',
    keyField: 'cursor',
    testProvider: 'cursor',
    endpointDefault: 'local-cli',
  },
  {
    id: 'copilot',
    label: 'Copilot',
    description: 'GitHub token for Copilot/GitHub flows',
    keyField: 'copilot',
    testProvider: 'copilot',
    endpointDefault: 'https://api.github.com',
  },
  {
    id: 'rovo',
    label: 'Rovo',
    description: 'Atlassian Rovo profile key (CLI readiness check)',
    keyField: 'rovo',
    testProvider: 'rovo',
    endpointDefault: 'local-cli',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Custom provider key for bespoke integrations',
    keyField: 'custom',
    testProvider: 'custom',
    endpointDefault: 'custom-endpoint',
  },
]

function normalizeApiKeys(keys: Settings['apiKeys']): Record<string, string> {
  return { ...(keys ?? {}) } as Record<string, string>
}

function getProviderMode(settings: Settings, providerId: CLIProvider): 'disabled' | 'enabled' | 'preferred' {
  if (!settings.enabledCLIs.includes(providerId)) return 'disabled'
  const priority = settings.providerPriority ?? settings.enabledCLIs
  return priority[0] === providerId ? 'preferred' : 'enabled'
}

function applyProviderMode(
  settings: Settings,
  providerId: CLIProvider,
  mode: 'disabled' | 'enabled' | 'preferred',
): Pick<Settings, 'enabledCLIs' | 'providerPriority'> {
  const enabled = new Set(settings.enabledCLIs)
  if (mode === 'disabled') {
    enabled.delete(providerId)
  } else {
    enabled.add(providerId)
  }

  const baseOrder = settings.providerPriority && settings.providerPriority.length > 0
    ? settings.providerPriority
    : settings.enabledCLIs
  const deduped = [...new Set(baseOrder)].filter((id) => enabled.has(id))
  const withoutCurrent = deduped.filter((id) => id !== providerId)

  let nextPriority = withoutCurrent
  if (enabled.has(providerId)) {
    nextPriority =
      mode === 'preferred'
        ? [providerId, ...withoutCurrent]
        : [...withoutCurrent, providerId]
  }

  return {
    enabledCLIs: [...enabled],
    providerPriority: nextPriority,
  }
}

export function SettingsWorkspace() {
  const router = useRouter()
  const { data: session } = useSession()
  const settings = useSwarmStore((s) => s.settings)
  const settingsLoading = useSwarmStore((s) => s.settingsLoading)
  const loadSettings = useSwarmStore((s) => s.loadSettings)
  const updateSettings = useSwarmStore((s) => s.updateSettings)

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('providers')
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(normalizeApiKeys(settings.apiKeys))
  const [apiEndpoints, setApiEndpoints] = useState<Record<string, string>>(settings.apiEndpoints ?? {})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [testingProvider, setTestingProvider] = useState<CLIProvider | null>(null)
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({})

  const userRole = (session?.user?.role ?? 'viewer') as 'admin' | 'editor' | 'viewer'
  const canConfigureSettings = ROLE_PERMISSIONS[userRole]?.canConfigureSettings ?? false

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    setApiKeys(normalizeApiKeys(settings.apiKeys))
    setApiEndpoints(settings.apiEndpoints ?? {})
  }, [settings.apiKeys, settings.apiEndpoints])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/cli-detect')
        if (!res.ok) return
        const data = await res.json() as Array<{ id: string; installed?: boolean }>
        if (cancelled || !Array.isArray(data)) return
        const next: Record<string, boolean> = {}
        for (const entry of data) {
          next[entry.id] = Boolean(entry.installed)
        }
        setInstalledMap(next)
      } catch {
        // no-op
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const providerRows = useMemo(() => {
    const byId = new Map(CLI_REGISTRY.map((c) => [c.id, c]))
    return PROVIDER_META.map((meta) => ({
      ...meta,
      registry: byId.get(meta.id),
    }))
  }, [])

  const handleProviderModeChange = (providerId: CLIProvider, mode: 'disabled' | 'enabled' | 'preferred') => {
    const patch = applyProviderMode(settings, providerId, mode)
    updateSettings(patch)
  }

  const handleApiKeyChange = (keyField: keyof ApiKeys, value: string) => {
    const next = { ...apiKeys, [keyField]: value }
    setApiKeys(next)
    updateSettings({ apiKeys: next })
  }

  const handleEndpointChange = (providerId: CLIProvider, value: string) => {
    const next = { ...apiEndpoints, [providerId]: value }
    setApiEndpoints(next)
    updateSettings({ apiEndpoints: next })
  }

  const handleTestConnection = async (provider: ProviderMeta) => {
    const keyValue = (apiKeys[provider.keyField] ?? '').trim()
    if (!keyValue) {
      toast.error(`${provider.label}: API key is required`)
      return
    }

    setTestingProvider(provider.id)
    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.testProvider, apiKey: keyValue }),
      })
      const result = await response.json() as { success: boolean; message: string }
      if (result.success) {
        toast.success(`${provider.label}: ${result.message}`)
      } else {
        toast.error(`${provider.label}: ${result.message}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`${provider.label}: Connection test failed - ${message}`)
    } finally {
      setTestingProvider(null)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-5 md:px-6">
        <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/app')} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back to App
            </Button>
            <Badge variant="secondary">Profile Settings</Badge>
          </div>
          <div className="text-sm text-muted">
            Signed in as <span className="font-medium text-foreground">{session?.user?.email ?? 'Unknown user'}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border bg-card p-3">
            <nav className="space-y-1">
              {SECTION_ITEMS.map((section) => {
                const Icon = section.icon
                const active = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-primary/15 text-primary' : 'hover:bg-secondary/70 text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{section.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{section.description}</p>
                  </button>
                )
              })}
            </nav>
          </aside>

          <ScrollArea className="h-[calc(100vh-170px)] rounded-xl border border-border bg-card">
            <div className="space-y-6 p-4 md:p-6">
              {settingsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading profile settings...
                </div>
              )}

              {activeSection === 'providers' && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Providers & API Keys</h2>
                      <p className="text-sm text-muted">
                        Per-agent dropdown control, profile-only keys, and direct connection checks.
                      </p>
                    </div>
                    {!canConfigureSettings && (
                      <Badge variant="outline">Read only</Badge>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted">
                    Active provider order: {settings.providerPriority?.length ? settings.providerPriority.join(' → ') : settings.enabledCLIs.join(' → ')}
                  </div>
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
                    Self-contained mode uses direct model providers (OpenAI, Gemini, Claude). Cursor CLI is optional and only needed for local CLI workflows.
                  </div>

                  <div className="space-y-3">
                    {providerRows.map((provider) => {
                      const providerMode = getProviderMode(settings, provider.id)
                      const keyValue = apiKeys[provider.keyField] ?? ''
                      const isInstalled = installedMap[provider.id]
                      return (
                        <div key={provider.id} className="rounded-lg border border-border p-4">
                          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-semibold">{provider.label}</p>
                              <p className="text-xs text-muted">{provider.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {provider.registry && (
                                <Badge variant="outline" className="text-xs">
                                  {provider.registry.supportsAPI ? 'API' : 'CLI'}
                                </Badge>
                              )}
                              {typeof isInstalled === 'boolean' && (
                                <Badge variant={isInstalled ? 'default' : 'secondary'} className="text-xs">
                                  {isInstalled ? 'CLI detected' : 'CLI not detected'}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto]">
                            <div>
                              <label className="mb-1 block text-xs text-muted">Mode</label>
                              <select
                                value={providerMode}
                                onChange={(e) => handleProviderModeChange(provider.id, e.target.value as 'disabled' | 'enabled' | 'preferred')}
                                disabled={!canConfigureSettings}
                                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                              >
                                <option value="disabled">Disabled</option>
                                <option value="enabled">Enabled</option>
                                <option value="preferred">Preferred</option>
                              </select>
                            </div>

                            <div className="relative">
                              <label className="mb-1 block text-xs text-muted">Profile API Key</label>
                              <Input
                                type={showKey[provider.id] ? 'text' : 'password'}
                                value={keyValue}
                                onChange={(e) => handleApiKeyChange(provider.keyField, e.target.value)}
                                placeholder={`${provider.label} API key`}
                                disabled={!canConfigureSettings}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                                className="absolute right-2 top-[31px] text-muted hover:text-foreground"
                                aria-label={showKey[provider.id] ? 'Hide key' : 'Show key'}
                              >
                                {showKey[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>

                            <div className="flex items-end">
                              <Button
                                variant="outline"
                                onClick={() => void handleTestConnection(provider)}
                                disabled={testingProvider === provider.id || !canConfigureSettings}
                                className="gap-2"
                              >
                                {testingProvider === provider.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Wifi className="h-4 w-4" />
                                )}
                                {testingProvider === provider.id ? 'Testing...' : 'Test'}
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3">
                            <label className="mb-1 block text-xs text-muted">Endpoint</label>
                            <Input
                              value={apiEndpoints[provider.id] ?? ''}
                              onChange={(e) => handleEndpointChange(provider.id, e.target.value)}
                              placeholder={provider.endpointDefault}
                              disabled={!canConfigureSettings}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {activeSection === 'routing' && (
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">Routing & Failover</h2>
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm">Free-only mode</span>
                      <Switch
                        checked={settings.freeOnlyMode ?? false}
                        onCheckedChange={(v) => updateSettings({ freeOnlyMode: v })}
                        disabled={!canConfigureSettings}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="mb-1 block text-xs text-muted">Subscription Tier</label>
                      <select
                        value={settings.subscriptionTier ?? 'free'}
                        onChange={(e) => updateSettings({ subscriptionTier: e.target.value as 'free' | 'pro' | 'team' })}
                        disabled={!canConfigureSettings}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                        <option value="team">Team</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted">Failover enabled</label>
                        <Switch
                          checked={settings.providerFailoverPolicy?.enabled ?? true}
                          onCheckedChange={(v) =>
                            updateSettings({
                              providerFailoverPolicy: {
                                enabled: v,
                                cooldownMs: settings.providerFailoverPolicy?.cooldownMs ?? 30000,
                                maxSwitchesPerRun: settings.providerFailoverPolicy?.maxSwitchesPerRun ?? 6,
                              },
                            })
                          }
                          disabled={!canConfigureSettings}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Cooldown (ms)</label>
                        <Input
                          type="number"
                          value={settings.providerFailoverPolicy?.cooldownMs ?? 30000}
                          onChange={(e) =>
                            updateSettings({
                              providerFailoverPolicy: {
                                enabled: settings.providerFailoverPolicy?.enabled ?? true,
                                cooldownMs: Number(e.target.value || 30000),
                                maxSwitchesPerRun: settings.providerFailoverPolicy?.maxSwitchesPerRun ?? 6,
                              },
                            })
                          }
                          disabled={!canConfigureSettings}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Max switches/run</label>
                        <Input
                          type="number"
                          value={settings.providerFailoverPolicy?.maxSwitchesPerRun ?? 6}
                          onChange={(e) =>
                            updateSettings({
                              providerFailoverPolicy: {
                                enabled: settings.providerFailoverPolicy?.enabled ?? true,
                                cooldownMs: settings.providerFailoverPolicy?.cooldownMs ?? 30000,
                                maxSwitchesPerRun: Number(e.target.value || 6),
                              },
                            })
                          }
                          disabled={!canConfigureSettings}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeSection === 'runtime' && (
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">Runtime Controls</h2>
                  <div className="rounded-lg border border-border p-4">
                    <div className="space-y-5">
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm">Max runtime (seconds)</span>
                          <span className="font-mono text-sm">{settings.maxRuntimeSeconds}</span>
                        </div>
                        <Slider
                          min={10}
                          max={600}
                          step={10}
                          value={settings.maxRuntimeSeconds}
                          onValueChange={(v) => updateSettings({ maxRuntimeSeconds: v })}
                          disabled={!canConfigureSettings}
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm">Chats per agent</span>
                          <span className="font-mono text-sm">{settings.chatsPerAgent ?? 1}</span>
                        </div>
                        <Slider
                          min={1}
                          max={20}
                          step={1}
                          value={settings.chatsPerAgent ?? 1}
                          onValueChange={(v) => updateSettings({ chatsPerAgent: v })}
                          disabled={!canConfigureSettings}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span className="text-sm">Worktree isolation</span>
                          <Switch
                            checked={settings.worktreeIsolation}
                            onCheckedChange={(v) => updateSettings({ worktreeIsolation: v })}
                            disabled={!canConfigureSettings}
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span className="text-sm">Continuous mode</span>
                          <Switch
                            checked={settings.continuousMode ?? false}
                            onCheckedChange={(v) => updateSettings({ continuousMode: v })}
                            disabled={!canConfigureSettings}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeSection === 'guardrails' && (
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">Guardrails</h2>
                  <div className="rounded-lg border border-border p-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">File write confirmation</span>
                        <Switch
                          checked={settings.fileWriteConfirmation ?? true}
                          onCheckedChange={(v) => updateSettings({ fileWriteConfirmation: v })}
                          disabled={!canConfigureSettings}
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm">Max files per commit</span>
                          <span className="font-mono text-sm">{settings.maxFilesPerCommit ?? 10}</span>
                        </div>
                        <Slider
                          min={1}
                          max={50}
                          step={1}
                          value={settings.maxFilesPerCommit ?? 10}
                          onValueChange={(v) => updateSettings({ maxFilesPerCommit: v })}
                          disabled={!canConfigureSettings}
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm">Auto-rerun threshold (%)</span>
                          <span className="font-mono text-sm">{settings.autoRerunThreshold}</span>
                        </div>
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={settings.autoRerunThreshold}
                          onValueChange={(v) => updateSettings({ autoRerunThreshold: v })}
                          disabled={!canConfigureSettings}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeSection === 'integrations' && (
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">Integrations</h2>
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm">GitHub integration</span>
                      <Switch
                        checked={settings.githubConfig?.enabled ?? false}
                        onCheckedChange={(v) =>
                          updateSettings({
                            githubConfig: {
                              enabled: v,
                              autoCreatePR: settings.githubConfig?.autoCreatePR ?? false,
                              baseBranch: settings.githubConfig?.baseBranch ?? 'main',
                              branchPrefix: settings.githubConfig?.branchPrefix ?? 'swarm',
                            },
                          })
                        }
                        disabled={!canConfigureSettings}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-muted">Base branch</label>
                        <Input
                          value={settings.githubConfig?.baseBranch ?? 'main'}
                          onChange={(e) =>
                            updateSettings({
                              githubConfig: {
                                enabled: settings.githubConfig?.enabled ?? false,
                                autoCreatePR: settings.githubConfig?.autoCreatePR ?? false,
                                baseBranch: e.target.value,
                                branchPrefix: settings.githubConfig?.branchPrefix ?? 'swarm',
                              },
                            })
                          }
                          disabled={!canConfigureSettings}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Branch prefix</label>
                        <Input
                          value={settings.githubConfig?.branchPrefix ?? 'swarm'}
                          onChange={(e) =>
                            updateSettings({
                              githubConfig: {
                                enabled: settings.githubConfig?.enabled ?? false,
                                autoCreatePR: settings.githubConfig?.autoCreatePR ?? false,
                                baseBranch: settings.githubConfig?.baseBranch ?? 'main',
                                branchPrefix: e.target.value,
                              },
                            })
                          }
                          disabled={!canConfigureSettings}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <SlidersHorizontal className="h-4 w-4" />
                      API Documentation
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => window.open('/api-docs', '_blank')}>
                        Swagger UI <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open('/api/openapi', '_blank')}>
                        OpenAPI JSON <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              {!canConfigureSettings && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                  Your role is currently read-only for workspace settings.
                </div>
              )}

              {canConfigureSettings && (
                <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">
                  Changes are saved live to your profile and linked runtime settings.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
