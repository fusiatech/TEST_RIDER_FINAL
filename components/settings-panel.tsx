'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useSwarmStore } from '@/lib/store'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import type { AgentRole, CLIProvider, Settings as SettingsType, GitHubConfig, UserRole } from '@/lib/types'
import { ROLE_LABELS, ROLE_COLORS, ROLE_PERMISSIONS } from '@/lib/types'
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
  Brain,
  Video,
  Download,
  Trash2,
  Search,
  X,
  FileJson,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { MCPConfig } from '@/components/mcp-config'
import { useSessionRecorder } from '@/components/providers/session-recorder-provider'
import { UserManagement } from '@/components/user-management'

const DEPTH_OPTIONS = ['shallow', 'medium', 'deep'] as const

const API_PROVIDERS: { id: string; label: string; defaultEndpoint: string }[] = [
  { id: 'openai', label: 'OpenAI', defaultEndpoint: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic (Claude)', defaultEndpoint: 'https://api.anthropic.com/v1' },
  { id: 'google', label: 'Google (Gemini)', defaultEndpoint: 'https://generativelanguage.googleapis.com/v1' },
  { id: 'github', label: 'GitHub (Copilot)', defaultEndpoint: 'https://api.github.com' },
  { id: 'huggingface', label: 'HuggingFace', defaultEndpoint: 'https://api-inference.huggingface.co' },
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
                  aria-label="Refresh GitHub authentication status"
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

interface SettingsSection {
  id: string
  title: string
  keywords: string[]
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'user-management', title: 'User Management', keywords: ['user', 'role', 'admin', 'editor', 'viewer', 'permission', 'rbac'] },
  { id: 'cli-agents', title: 'CLI Agents', keywords: ['cli', 'agent', 'cursor', 'gemini', 'claude', 'copilot', 'codex', 'rovo'] },
  { id: 'api-config', title: 'API Configuration', keywords: ['api', 'key', 'openai', 'anthropic', 'google', 'github', 'huggingface', 'endpoint'] },
  { id: 'chats-per-agent', title: 'Chats per Agent', keywords: ['chat', 'parallel', 'session'] },
  { id: 'parallel-counts', title: 'Parallel Counts', keywords: ['parallel', 'researcher', 'planner', 'coder', 'validator', 'security', 'synthesizer'] },
  { id: 'testing-config', title: 'Testing Configuration', keywords: ['test', 'typescript', 'eslint', 'npm', 'audit'] },
  { id: 'automation', title: 'Automation', keywords: ['automation', 'continuous', 'auto', 'approve', 'background', 'job', 'ideation'] },
  { id: 'guardrails', title: 'Guardrails', keywords: ['guardrail', 'file', 'write', 'confirmation', 'commit', 'safety'] },
  { id: 'worktree', title: 'Worktree Isolation', keywords: ['worktree', 'isolation', 'git', 'branch'] },
  { id: 'max-runtime', title: 'Max Runtime', keywords: ['runtime', 'timeout', 'seconds', 'time'] },
  { id: 'research-depth', title: 'Research Depth', keywords: ['research', 'depth', 'shallow', 'medium', 'deep'] },
  { id: 'auto-rerun', title: 'Auto-Rerun Threshold', keywords: ['rerun', 'threshold', 'confidence', 'validator'] },
  { id: 'semantic', title: 'Semantic Validation', keywords: ['semantic', 'validation', 'embedding', 'openai', 'similarity'] },
  { id: 'custom-cli', title: 'Custom CLI Command', keywords: ['custom', 'cli', 'command'] },
  { id: 'project-path', title: 'Project Path', keywords: ['project', 'path', 'directory', 'folder'] },
  { id: 'github', title: 'GitHub Integration', keywords: ['github', 'pr', 'pull request', 'branch', 'integration'] },
  { id: 'mcp', title: 'MCP Servers', keywords: ['mcp', 'server', 'model', 'context', 'protocol'] },
  { id: 'session-recording', title: 'Session Recording', keywords: ['session', 'recording', 'replay', 'debug'] },
  { id: 'api-docs', title: 'API Documentation', keywords: ['api', 'docs', 'documentation', 'swagger', 'openapi', 'rest'] },
]

function matchesSearch(section: SettingsSection, query: string): boolean {
  if (!query.trim()) return true
  const lowerQuery = query.toLowerCase()
  return (
    section.title.toLowerCase().includes(lowerQuery) ||
    section.keywords.some(k => k.toLowerCase().includes(lowerQuery))
  )
}

export function SettingsPanel() {
  const { data: session } = useSession()
  const settingsOpen = useSwarmStore((s) => s.settingsOpen)
  const toggleSettings = useSwarmStore((s) => s.toggleSettings)
  const settings = useSwarmStore((s) => s.settings)
  const updateSettings = useSwarmStore((s) => s.updateSettings)
  const settingsLoading = useSwarmStore((s) => s.settingsLoading)

  const [apiKeys, setApiKeys] = useState<Record<string, string>>(settings.apiKeys ?? {})
  const [apiEndpoints, setApiEndpoints] = useState<Record<string, string>>(settings.apiEndpoints ?? {})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  const userRole = (session?.user?.role as UserRole) ?? 'viewer'
  const isAdmin = userRole === 'admin'
  const canConfigureSettings = ROLE_PERMISSIONS[userRole]?.canConfigureSettings ?? false
  
  const visibleSections = SETTINGS_SECTIONS.filter(s => {
    if (!matchesSearch(s, searchQuery)) return false
    if (s.id === 'user-management' && !isAdmin) return false
    return true
  })
  const isSectionVisible = (id: string) => visibleSections.some(s => s.id === id)

  useEffect(() => {
    setApiKeys(settings.apiKeys ?? {})
    setApiEndpoints(settings.apiEndpoints ?? {})
  }, [settings.apiKeys, settings.apiEndpoints])

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

  const handleTestConnection = async (providerId: string) => {
    const apiKey = apiKeys[providerId]?.trim()
    if (!apiKey) {
      toast.error(`${providerId}: No API key provided`)
      return
    }

    setTestingProvider(providerId)
    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey }),
      })
      const result = await response.json() as { success: boolean; message: string }
      if (result.success) {
        toast.success(`${providerId}: ${result.message}`)
      } else {
        toast.error(`${providerId}: ${result.message}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`${providerId}: Connection test failed - ${message}`)
    } finally {
      setTestingProvider(null)
    }
  }

  const testingConfig = settings.testingConfig ?? {
    typescript: true,
    eslint: true,
    npmAudit: false,
    customCommand: '',
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => {
      toggleSettings()
      if (!open) setSearchQuery('')
    }}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure CLI agents, API keys, parallel processing, and automation options.
          </DialogDescription>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-muted mt-2">
              Showing {visibleSections.length} of {SETTINGS_SECTIONS.length} sections
            </p>
          )}
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
            {/* View Only Banner for non-admins */}
            {!canConfigureSettings && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <Eye className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-500">
                  View only - You don&apos;t have permission to modify settings
                </span>
              </div>
            )}

            {/* User Management (Admin only) */}
            {isSectionVisible('user-management') && isAdmin && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Users className="h-4 w-4" />
                User Management
              </h3>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm text-muted mb-3">
                  Manage user roles and permissions for the application.
                </p>
                <UserManagement />
              </div>
            </section>
            )}

            {/* CLI Agents */}
            {isSectionVisible('cli-agents') && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Cpu className="h-4 w-4" />
                CLI Agents
              </h3>
              <div className="space-y-2">
                {CLI_REGISTRY.map((cli) => (
                  <div
                    key={cli.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            cli.installed !== false ? '#22c55e' : '#ef4444',
                        }}
                      />
                      <span className="text-sm text-foreground/90">{cli.name}</span>
                      {cli.installed === false && (
                        <Badge variant="outline" className="text-xs text-muted">
                          not installed
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={settings.enabledCLIs.includes(cli.id)}
                      onCheckedChange={() => toggleCLI(cli.id)}
                      disabled={!canConfigureSettings}
                    />
                  </div>
                ))}
              </div>
            </section>
            )}

            {/* API Configuration */}
            {isSectionVisible('api-config') && (
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
                        onChange={(e) => {
                          const newKeys = { ...apiKeys, [provider.id]: e.target.value }
                          setApiKeys(newKeys)
                          updateSettings({ apiKeys: newKeys })
                        }}
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
                      onChange={(e) => {
                        const newEndpoints = { ...apiEndpoints, [provider.id]: e.target.value }
                        setApiEndpoints(newEndpoints)
                        updateSettings({ apiEndpoints: newEndpoints })
                      }}
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
            )}

            {/* Chats per Agent */}
            {isSectionVisible('chats-per-agent') && (
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
            )}

            {/* Parallel Counts */}
            {isSectionVisible('parallel-counts') && (
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
            )}

            {/* Testing Configuration */}
            {isSectionVisible('testing-config') && (
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
            )}

            {/* Automation */}
            {isSectionVisible('automation') && (
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
            )}

            {/* Guardrails */}
            {isSectionVisible('guardrails') && (
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
            )}

            {/* Worktree Isolation */}
            {isSectionVisible('worktree') && (
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
            )}

            {/* Max Runtime */}
            {isSectionVisible('max-runtime') && (
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
            )}

            {/* Research Depth */}
            {isSectionVisible('research-depth') && (
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
            )}

            {/* Auto-Rerun Threshold */}
            {isSectionVisible('auto-rerun') && (
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
            )}

            {/* Semantic Validation */}
            {isSectionVisible('semantic') && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Brain className="h-4 w-4" />
                Semantic Validation
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-muted" />
                    <div>
                      <span className="text-sm text-foreground/90">Use Semantic Validation</span>
                      <p className="text-xs text-muted">
                        Use OpenAI embeddings for semantic similarity scoring (requires OpenAI API key)
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.useSemanticValidation ?? false}
                    onCheckedChange={(v) => updateSettings({ useSemanticValidation: v })}
                    disabled={!apiKeys.openai?.trim()}
                  />
                </div>
                {settings.useSemanticValidation && !apiKeys.openai?.trim() && (
                  <p className="text-xs text-amber-500 pl-6">
                    Add an OpenAI API key above to enable semantic validation
                  </p>
                )}
                {settings.useSemanticValidation && apiKeys.openai?.trim() && (
                  <p className="text-xs text-green-500 pl-6">
                    Semantic validation enabled (30% Jaccard + 70% Semantic hybrid scoring)
                  </p>
                )}
              </div>
            </section>
            )}

            {/* Custom CLI */}
            {isSectionVisible('custom-cli') && (
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
            )}

            {/* Project Path */}
            {isSectionVisible('project-path') && (
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
            )}

            {/* Preview URL */}
            {isSectionVisible('preview-url') && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-foreground/80">
                  Preview URL
                </h3>
                <p className="mb-2 text-xs text-muted">
                  URL to load in the IDE preview panel
                </p>
                <Input
                  placeholder={process.env.NEXT_PUBLIC_PREVIEW_URL || 'http://localhost:3000'}
                  value={settings.previewUrl ?? ''}
                  onChange={(e) =>
                    updateSettings({ previewUrl: e.target.value })
                  }
                />
              </section>
            )}

            {/* GitHub Integration */}
            {isSectionVisible('github') && (
            <GitHubSection settings={settings} updateSettings={updateSettings} />
            )}

            {/* MCP Servers */}
            {isSectionVisible('mcp') && (
            <MCPConfig />
            )}

            {/* Session Recording */}
            {isSectionVisible('session-recording') && (
            <SessionRecordingSection />
            )}

            {/* API Documentation */}
            {isSectionVisible('api-docs') && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <FileJson className="h-4 w-4" />
                API Documentation
              </h3>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm text-muted mb-3">
                  Interactive API documentation powered by OpenAPI 3.0 and Swagger UI.
                </p>
                <div className="flex flex-col gap-2">
                  <Link
                    href="/api-docs"
                    target="_blank"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileJson className="h-4 w-4" />
                    Open Swagger UI
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  <a
                    href="/api/openapi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <FileJson className="h-4 w-4" />
                    Download OpenAPI Spec (JSON)
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </section>
            )}

            {/* No results message */}
            {visibleSections.length === 0 && searchQuery && (
              <div className="py-8 text-center">
                <Search className="h-8 w-8 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted">No settings found for &quot;{searchQuery}&quot;</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-primary hover:underline mt-2"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function SessionRecordingSection() {
  const { 
    isEnabled, 
    setEnabled, 
    getConfig, 
    updateConfig, 
    getSavedSessions, 
    downloadSession, 
    clearSessions,
  } = useSessionRecorder()

  const config = getConfig()
  const sessions = getSavedSessions()

  const handleExportAll = () => {
    downloadSession()
    toast.success('Sessions exported', { description: 'Download started' })
  }

  const handleClearSessions = () => {
    clearSessions()
    toast.success('Sessions cleared', { description: 'All recorded sessions have been deleted' })
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
        <Video className="h-4 w-4" />
        Session Recording
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-muted" />
            <div>
              <span className="text-sm text-foreground/90">Enable Recording</span>
              <p className="text-xs text-muted">Record user interactions for debugging</p>
            </div>
          </div>
          <Switch
            checked={isEnabled()}
            onCheckedChange={setEnabled}
          />
        </div>

        {isEnabled() && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted" />
                <div>
                  <span className="text-sm text-foreground/90">Record Input Values</span>
                  <p className="text-xs text-muted">Store non-sensitive form values (passwords always excluded)</p>
                </div>
              </div>
              <Switch
                checked={config.recordInputValues}
                onCheckedChange={(v) => updateConfig({ recordInputValues: v })}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted">Max Stored Sessions</span>
                <span className="font-mono text-sm text-foreground/90">
                  {config.maxSessions}
                </span>
              </div>
              <Slider
                min={1}
                max={20}
                step={1}
                value={config.maxSessions}
                onValueChange={(v) => updateConfig({ maxSessions: v })}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted">Max Events per Session</span>
                <span className="font-mono text-sm text-foreground/90">
                  {config.maxEventsPerSession}
                </span>
              </div>
              <Slider
                min={100}
                max={5000}
                step={100}
                value={config.maxEventsPerSession}
                onValueChange={(v) => updateConfig({ maxEventsPerSession: v })}
              />
            </div>

            {sessions.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground/90">
                    Stored Sessions ({sessions.length})
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExportAll}
                      className="h-7 gap-1 text-xs"
                    >
                      <Download className="h-3 w-3" />
                      Export All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSessions}
                      className="h-7 gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/30"
                    >
                      <span className="text-muted truncate max-w-[120px]">
                        {formatDate(session.startedAt)}
                      </span>
                      <span className="text-muted">
                        {session.eventCount} events
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          downloadSession(session.id)
                          toast.success('Session exported')
                        }}
                        className="h-5 w-5 p-0"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sessions.length === 0 && (
              <p className="text-xs text-muted text-center py-2">
                No recorded sessions yet. Sessions are saved when you navigate away or close the tab.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
