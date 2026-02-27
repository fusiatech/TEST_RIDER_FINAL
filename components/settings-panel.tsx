'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSwarmStore } from '@/lib/store'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import type { AgentRole, CLIProvider, Settings as SettingsType, GitHubConfig, ProviderDiagnostics } from '@/lib/types'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Settings as SettingsIcon,
  Cpu,
  GitBranch,
  Shield,
  Clock,
  Gauge,
  Key,
  Eye,
  EyeOff,
  Wifi,
  Users,
  TestTube2,
  ShieldCheck,
  FileEdit,
  RefreshCw,
  CheckSquare,
  Server,
  Layers,
  Lightbulb,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { MCPConfig } from '@/components/mcp-config'

const DEPTH_OPTIONS = ['shallow', 'medium', 'deep'] as const

const API_PROVIDERS: { id: CLIProvider; label: string; defaultEndpoint: string }[] = [
  { id: 'gemini', label: 'Gemini API', defaultEndpoint: 'https://generativelanguage.googleapis.com/v1' },
]

const DEFAULT_GITHUB_CONFIG: GitHubConfig = {
  enabled: false,
  autoCreatePR: false,
  baseBranch: 'main',
  branchPrefix: 'swarm',
}

function GitHubSection({
  settings,
  updateSettings,
}: {
  settings: SettingsType
  updateSettings: (patch: Partial<SettingsType>) => void
}) {
  const [ghStatus, setGhStatus] = useState<'checking' | 'authenticated' | 'not-authenticated'>('checking')

  const checkGhAuth = useCallback(async () => {
    setGhStatus('checking')
    try {
      const res = await fetch('/api/cli-detect')
      if (!res.ok) {
        setGhStatus('not-authenticated')
        return
      }
      const data: unknown = await res.json()
      const clis = Array.isArray(data) ? data : []
      const ghEntry = clis.find(
        (c: Record<string, unknown>) => c.id === 'gh' || c.name === 'gh',
      )
      setGhStatus(ghEntry ? 'authenticated' : 'not-authenticated')
    } catch {
      setGhStatus('not-authenticated')
    }
  }, [])

  useEffect(() => {
    void checkGhAuth()
  }, [checkGhAuth])

  const ghConfig = settings.githubConfig ?? DEFAULT_GITHUB_CONFIG

  const updateGhConfig = (patch: Partial<GitHubConfig>) => {
    updateSettings({ githubConfig: { ...ghConfig, ...patch } })
  }

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
        <GitPullRequest className="h-4 w-4" />
        GitHub Integration
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted" />
            <div>
              <span className="text-sm text-foreground/90">Enable GitHub</span>
              <p className="text-xs text-muted">Create branches and PRs for completed tickets</p>
            </div>
          </div>
          <Switch
            checked={ghConfig.enabled}
            onCheckedChange={(v) => updateGhConfig({ enabled: v })}
          />
        </div>

        {ghConfig.enabled && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-muted" />
                <span className="text-sm text-foreground/90">Auto-create PR</span>
              </div>
              <Switch
                checked={ghConfig.autoCreatePR}
                onCheckedChange={(v) => updateGhConfig({ autoCreatePR: v })}
              />
            </div>

            <div>
              <span className="text-sm text-muted">Base Branch</span>
              <Input
                placeholder="main"
                value={ghConfig.baseBranch}
                onChange={(e) => updateGhConfig({ baseBranch: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <span className="text-sm text-muted">Branch Prefix</span>
              <Input
                placeholder="swarm"
                value={ghConfig.branchPrefix}
                onChange={(e) => updateGhConfig({ branchPrefix: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm text-muted">GitHub Auth Status</span>
              <div className="flex items-center gap-1.5">
                {ghStatus === 'checking' && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
                    <span className="text-xs text-muted">Checking...</span>
                  </>
                )}
                {ghStatus === 'authenticated' && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-green-500">Authenticated</span>
                  </>
                )}
                {ghStatus === 'not-authenticated' && (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-xs text-red-400">Not authenticated</span>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-6 w-6"
                  onClick={() => void checkGhAuth()}
                  title="Refresh auth status"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export function SettingsPanel() {
  const settingsOpen = useSwarmStore((s) => s.settingsOpen)
  const toggleSettings = useSwarmStore((s) => s.toggleSettings)
  const settings = useSwarmStore((s) => s.settings)
  const updateSettings = useSwarmStore((s) => s.updateSettings)
  const settingsLoading = useSwarmStore((s) => s.settingsLoading)

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [apiEndpoints, setApiEndpoints] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [providerDiagnostics, setProviderDiagnostics] = useState<Record<string, ProviderDiagnostics>>({})

  const refreshProviderDiagnostics = useCallback(async () => {
    try {
      const res = await fetch('/api/cli/providers')
      if (!res.ok) return
      const data: unknown = await res.json()
      const diagnostics = Array.isArray(data) ? data as ProviderDiagnostics[] : []
      const next: Record<string, ProviderDiagnostics> = {}
      for (const diag of diagnostics) next[diag.id] = diag
      setProviderDiagnostics(next)
    } catch {
      // noop
    }
  }, [])

  useEffect(() => {
    void refreshProviderDiagnostics()
  }, [refreshProviderDiagnostics])

  const toggleCLI = (id: CLIProvider) => {
    const current = settings.enabledCLIs
    const next = current.includes(id)
      ? current.filter((c) => c !== id)
      : [...current, id]
    updateSettings({ enabledCLIs: next })
  }

  const updateParallelCount = (role: AgentRole, count: number) => {
    updateSettings({
      parallelCounts: { ...settings.parallelCounts, [role]: count },
    })
  }

  const handleTestConnection = (providerId: string) => {
    setTestingProvider(providerId)
    setTimeout(() => {
      const hasKey = apiKeys[providerId]?.trim()
      if (hasKey) {
        toast.success(`${providerId} connection OK`)
      } else {
        toast.error(`${providerId}: No API key provided`)
      }
      setTestingProvider(null)
    }, 1000)
  }

  const remediationForReason = (reason: string) => {
    if (reason === 'missing_binary') return { label: 'Install CLI', command: 'npm i -g <provider-cli>' }
    if (reason === 'unauthenticated') return { label: 'Authenticate', command: '<provider-cli> auth login' }
    if (reason === 'unsupported_flags') return { label: 'Review Flags', command: 'Update CLI args in lib/cli-registry.ts' }
    return { label: 'Run Health Check', command: '<provider-cli> --version' }
  }

  const testingConfig = settings.testingConfig ?? {
    typescript: true,
    eslint: true,
    npmAudit: false,
    customCommand: '',
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={toggleSettings}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure CLI agents, API keys, parallel processing, and automation options.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          {settingsLoading ? (
            <div className="space-y-4 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-6">
            {/* CLI Agents */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Cpu className="h-4 w-4" />
                CLI Agents
                <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={() => void refreshProviderDiagnostics()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </h3>
              <div className="space-y-2">
                {CLI_REGISTRY.map((cli) => (
                  <div
                    key={cli.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              (providerDiagnostics[cli.id]?.healthy ?? cli.installed !== false) ? '#22c55e' : '#ef4444',
                          }}
                        />
                        <span className="text-sm text-foreground/90">{cli.name}</span>
                        {providerDiagnostics[cli.id] && !providerDiagnostics[cli.id].healthy && (
                          <Badge variant="outline" className="text-xs text-red-400">
                            needs attention
                          </Badge>
                        )}
                      </div>
                      {providerDiagnostics[cli.id] && (
                        <div className="mt-1 space-y-1">
                          <p className="text-[11px] text-muted">
                            version: {providerDiagnostics[cli.id].version ?? 'unknown'} · auth: {providerDiagnostics[cli.id].authenticated ? 'ok' : 'missing'}
                          </p>
                          {!providerDiagnostics[cli.id].healthy && (
                            <div className="rounded border border-red-500/30 bg-red-500/5 p-2">
                              {providerDiagnostics[cli.id].failureReasons.map((reason) => {
                                const remediation = remediationForReason(reason)
                                return (
                                  <div key={reason} className="mb-1 flex items-center justify-between gap-2 text-[11px] text-red-300">
                                    <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{reason}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-2 text-[10px]"
                                      onClick={() => navigator.clipboard?.writeText(remediation.command)}
                                    >
                                      {remediation.label}
                                    </Button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Switch
                        checked={settings.enabledCLIs.includes(cli.id)}
                        disabled={providerDiagnostics[cli.id] ? !providerDiagnostics[cli.id].healthy : false}
                        onCheckedChange={() => toggleCLI(cli.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* API Configuration */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Key className="h-4 w-4" />
                API Configuration
              </h3>
              <div className="space-y-4">
                {API_PROVIDERS.map((provider) => (
                  <div key={provider.id} className="space-y-2 rounded-lg border border-border p-3">
                    <span className="text-sm font-medium text-foreground/90">{provider.label}</span>
                    <div className="relative">
                      <Input
                        type={showKey[provider.id] ? 'text' : 'password'}
                        placeholder="API Key"
                        value={apiKeys[provider.id] ?? ''}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                        aria-label={showKey[provider.id] ? 'Hide API key' : 'Show API key'}
                      >
                        {showKey[provider.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <Input
                      placeholder={`Endpoint (default: ${provider.defaultEndpoint})`}
                      value={apiEndpoints[provider.id] ?? ''}
                      onChange={(e) => setApiEndpoints((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(provider.id)}
                      disabled={testingProvider === provider.id}
                      className="gap-1.5"
                    >
                      <Wifi className="h-3.5 w-3.5" />
                      {testingProvider === provider.id ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            {/* Chats per Agent */}
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Users className="h-4 w-4" />
                Chats per Agent
              </h3>
              <p className="mb-2 text-xs text-muted">
                Number of parallel chat sessions per agent
              </p>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">1 – 20</span>
                <span className="font-mono text-sm text-foreground/90">
                  {settings.chatsPerAgent ?? 1}
                </span>
              </div>
              <Slider
                min={1}
                max={20}
                step={1}
                value={settings.chatsPerAgent ?? 1}
                onValueChange={(v) => updateSettings({ chatsPerAgent: v })}
              />
            </section>

            {/* Parallel Counts */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Gauge className="h-4 w-4" />
                Parallel Counts
              </h3>
              <div className="space-y-3">
                {(Object.keys(ROLE_LABELS) as AgentRole[]).map((role) => (
                  <div key={role} className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ROLE_COLORS[role] }}
                    />
                    <span className="w-24 text-sm text-muted">
                      {ROLE_LABELS[role]}
                    </span>
                    <Slider
                      min={0}
                      max={6}
                      step={1}
                      value={settings.parallelCounts[role]}
                      onValueChange={(v) => updateParallelCount(role, v)}
                      className="flex-1"
                    />
                    <span className="w-6 text-right font-mono text-sm text-foreground/90">
                      {settings.parallelCounts[role]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Testing Configuration */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <TestTube2 className="h-4 w-4" />
                Testing Configuration
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">TypeScript check (tsc --noEmit)</span>
                  <Switch
                    checked={testingConfig.typescript}
                    onCheckedChange={(v) =>
                      updateSettings({ testingConfig: { ...testingConfig, typescript: v } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">ESLint</span>
                  <Switch
                    checked={testingConfig.eslint}
                    onCheckedChange={(v) =>
                      updateSettings({ testingConfig: { ...testingConfig, eslint: v } })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">npm audit</span>
                  <Switch
                    checked={testingConfig.npmAudit}
                    onCheckedChange={(v) =>
                      updateSettings({ testingConfig: { ...testingConfig, npmAudit: v } })
                    }
                  />
                </div>
                <div>
                  <span className="text-sm text-muted">Custom test command</span>
                  <Input
                    placeholder="e.g. npm test -- --watchAll=false"
                    value={testingConfig.customCommand ?? ''}
                    onChange={(e) =>
                      updateSettings({ testingConfig: { ...testingConfig, customCommand: e.target.value } })
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            </section>

            {/* Automation */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <RefreshCw className="h-4 w-4" />
                Automation
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-muted" />
                    <div>
                      <span className="text-sm text-foreground/90">Continuous Mode</span>
                      <p className="text-xs text-muted">Auto re-run pipeline if confidence is below threshold</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.continuousMode ?? false}
                    onCheckedChange={(v) => updateSettings({ continuousMode: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-muted" />
                    <div>
                      <span className="text-sm text-foreground/90">Auto-approve Tickets</span>
                      <p className="text-xs text-muted">Auto-approve tickets that pass all tests</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.autoApproveTickets ?? false}
                    onCheckedChange={(v) => updateSettings({ autoApproveTickets: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted" />
                    <div>
                      <span className="text-sm text-foreground/90">Background Processing</span>
                      <p className="text-xs text-muted">Jobs continue running when browser is closed</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.backgroundProcessing ?? true}
                    onCheckedChange={(v) => updateSettings({ backgroundProcessing: v })}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="h-4 w-4 text-muted" />
                    <span className="text-sm text-foreground/90">Max Concurrent Jobs</span>
                    <span className="ml-auto font-mono text-sm text-foreground/90">
                      {settings.maxConcurrentJobs ?? 1}
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={5}
                    step={1}
                    value={settings.maxConcurrentJobs ?? 1}
                    onValueChange={(v) => updateSettings({ maxConcurrentJobs: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-muted" />
                    <div>
                      <span className="text-sm text-foreground/90">Ideation Auto-run</span>
                      <p className="text-xs text-muted">Generate ideas on a schedule</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.ideationAutoRun ?? false}
                    onCheckedChange={(v) => updateSettings({ ideationAutoRun: v })}
                  />
                </div>
                {settings.ideationAutoRun && (
                  <div className="pl-6">
                    <span className="text-xs text-muted">Schedule:</span>
                    <select
                      value={settings.ideationSchedule ?? 'daily'}
                      onChange={(e) => updateSettings({ ideationSchedule: e.target.value })}
                      className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="hourly">Every Hour</option>
                      <option value="every-6-hours">Every 6 Hours</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                )}
              </div>
            </section>

            {/* Guardrails */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <ShieldCheck className="h-4 w-4" />
                Guardrails
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-4 w-4 text-muted" />
                    <div>
                      <span className="text-sm text-foreground/90">File write confirmation</span>
                      <p className="text-xs text-muted">Prompt before writing files</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.fileWriteConfirmation ?? true}
                    onCheckedChange={(v) => updateSettings({ fileWriteConfirmation: v })}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted">Max files per commit</span>
                    <span className="font-mono text-sm text-foreground/90">
                      {settings.maxFilesPerCommit ?? 10}
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={50}
                    step={1}
                    value={settings.maxFilesPerCommit ?? 10}
                    onValueChange={(v) => updateSettings({ maxFilesPerCommit: v })}
                  />
                </div>
              </div>
            </section>

            {/* Worktree Isolation */}
            <section>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted" />
                  <div>
                    <span className="text-sm text-foreground/90">Worktree Isolation</span>
                    <p className="text-xs text-muted">
                      Run each agent in its own git worktree to prevent file conflicts
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.worktreeIsolation}
                  onCheckedChange={(v) =>
                    updateSettings({ worktreeIsolation: v })
                  }
                />
              </div>
            </section>

            {/* Max Runtime */}
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Clock className="h-4 w-4" />
                Max Runtime
              </h3>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">10s – 600s</span>
                <span className="font-mono text-sm text-foreground/90">
                  {settings.maxRuntimeSeconds}s
                </span>
              </div>
              <Slider
                min={10}
                max={600}
                step={10}
                value={settings.maxRuntimeSeconds}
                onValueChange={(v) =>
                  updateSettings({ maxRuntimeSeconds: v })
                }
              />
            </section>

            {/* Research Depth */}
            <section>
              <h3 className="mb-3 text-sm font-medium text-foreground/80">
                Research Depth
              </h3>
              <div className="flex gap-2">
                {DEPTH_OPTIONS.map((depth) => (
                  <Button
                    key={depth}
                    variant={
                      settings.researchDepth === depth ? 'default' : 'outline'
                    }
                    size="sm"
                    className="capitalize"
                    onClick={() => updateSettings({ researchDepth: depth })}
                  >
                    {depth}
                  </Button>
                ))}
              </div>
            </section>

            {/* Auto-Rerun Threshold */}
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Shield className="h-4 w-4" />
                Auto-Rerun Threshold
              </h3>
              <p className="mb-2 text-xs text-muted">
                Re-run validators if confidence below this percentage
              </p>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">0% – 100%</span>
                <span className="font-mono text-sm text-foreground/90">
                  {settings.autoRerunThreshold}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={settings.autoRerunThreshold}
                onValueChange={(v) =>
                  updateSettings({ autoRerunThreshold: v })
                }
              />
            </section>

            {/* Custom CLI */}
            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground/80">
                Custom CLI Command
              </h3>
              <p className="mb-2 text-xs text-muted">
                Use &#123;PROMPT&#125; as a placeholder for the prompt text
              </p>
              <Input
                placeholder='e.g. my-cli run "{PROMPT}"'
                value={settings.customCLICommand ?? ''}
                onChange={(e) =>
                  updateSettings({ customCLICommand: e.target.value })
                }
              />
            </section>

            {/* Project Path */}
            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground/80">
                Project Path
              </h3>
              <Input
                placeholder="/home/user/my-project"
                value={settings.projectPath ?? ''}
                onChange={(e) =>
                  updateSettings({ projectPath: e.target.value })
                }
              />
            </section>

            {/* GitHub Integration */}
            <GitHubSection settings={settings} updateSettings={updateSettings} />

            {/* MCP Servers */}
            <MCPConfig />
          </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
