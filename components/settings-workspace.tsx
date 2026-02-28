'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useSwarmStore } from '@/lib/store'
import type { ApiKeys, CLIProvider, Settings } from '@/lib/types'
import { ROLE_PERMISSIONS } from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { MODEL_CATALOG, getDefaultModelForProvider } from '@/lib/model-catalog'
import { apiJson } from '@/lib/client-api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RulesEngineSettings } from '@/components/rules-engine-settings'
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
  UserCog,
} from 'lucide-react'

type SettingsSectionId = 'personalization' | 'providers' | 'routing' | 'runtime' | 'guardrails' | 'integrations'

interface ProviderMeta {
  id: CLIProvider
  label: string
  description: string
  keyField: keyof ApiKeys
  testProvider: string
  endpointDefault: string
}

interface CatalogProviderEntry {
  provider: string
  label: string
  supportsApi: boolean
  isEnabledByUser: boolean
  isConfiguredByUser: boolean
  runtimeAvailable: boolean
}

interface CatalogModelEntry {
  provider: string
  modelId: string
  displayName: string
  source: 'api' | 'fallback'
}

interface ModelCatalogResponse {
  providers: CatalogProviderEntry[]
  models: CatalogModelEntry[]
  updatedAt: number
}

interface IntegrationProviderEntry {
  provider: string
  label: string
  connected: boolean
  status: 'disconnected' | 'pending' | 'connected' | 'error'
  count: number
  entries: Array<{
    id: string
    provider: string
    status: 'disconnected' | 'pending' | 'connected' | 'error'
    displayName?: string
    error?: string
    metadata?: Record<string, unknown>
    scopes?: string[]
    updatedAt: number
  }>
}

interface MeIntegrationsResponse {
  userId: string
  providers: IntegrationProviderEntry[]
  runtimeProviders: Array<{ id: string; name: string; supportsApi: boolean }>
}

interface MeProfileResponse {
  profile: {
    userId: string
    activePlan: 'free' | 'pro' | 'team' | 'enterprise'
    billingStatus: 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'
    displayName?: string
    entitlementVersion: number
  }
}

interface BillingSubscriptionResponse {
  subscription: {
    plan: 'free' | 'pro' | 'team' | 'enterprise'
    status: string
    cancelAtPeriodEnd?: boolean
    currentPeriodEnd?: number
  } | null
}

interface BillingEntitlementsResponse {
  entitlements: Array<{ key: string; enabled: boolean; limit?: number }>
}

interface IntegrationStatusNote {
  kind: 'success' | 'error'
  message: string
  updatedAt: number
}

interface UIModelOption {
  id: string
  label: string
  supportsDeepReasoning: boolean
}

interface UIProviderOption {
  id: CLIProvider
  label: string
}

const DEEP_REASONING_HINTS = ['gpt-5', 'o1', 'o3', 'pro', 'sonnet', 'opus', 'reason']
const INTEGRATION_DOCS: Record<'github' | 'figma' | 'slack' | 'linear' | 'billing', string> = {
  github: 'https://docs.github.com/en/apps',
  figma: 'https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Dev-Mode-MCP-Server',
  slack: 'https://api.slack.com/authentication/oauth-v2',
  linear: 'https://developers.linear.app/docs/oauth/authentication',
  billing: 'https://docs.stripe.com/billing/subscriptions/webhooks',
}

const SECTION_ITEMS: Array<{ id: SettingsSectionId; label: string; icon: React.ElementType; description: string }> = [
  { id: 'personalization', label: 'Personalization', icon: UserCog, description: 'Per-profile adaptive shell behavior' },
  { id: 'providers', label: 'Providers & Runtimes', icon: KeyRound, description: 'Model provider keys and optional local runtime connectors' },
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
    description: 'Gemini API (in-app model provider)',
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
    description: 'Cursor local runtime connector (optional for local runtime workflows)',
    keyField: 'cursor',
    testProvider: 'cursor',
    endpointDefault: 'local-runtime',
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
    description: 'Rovo local runtime connector (optional)',
    keyField: 'rovo',
    testProvider: 'rovo',
    endpointDefault: 'local-runtime',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Custom provider or runtime connector',
    keyField: 'custom',
    testProvider: 'custom',
    endpointDefault: 'custom-endpoint',
  },
]

function normalizeApiKeys(keys: Settings['apiKeys']): Record<string, string> {
  return { ...(keys ?? {}) } as Record<string, string>
}

function isCLIProvider(value: string): value is CLIProvider {
  return MODEL_CATALOG.some((provider) => provider.id === value)
}

function hasDeepReasoningCapability(providerId: CLIProvider, modelId: string): boolean {
  const knownProvider = MODEL_CATALOG.find((provider) => provider.id === providerId)
  const knownModel = knownProvider?.models.find((model) => model.id === modelId)
  if (knownModel) return knownModel.capability.supportsDeepReasoning
  const lowered = modelId.toLowerCase()
  return DEEP_REASONING_HINTS.some((hint) => lowered.includes(hint))
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
  const uiPreferences = useSwarmStore((s) => s.uiPreferences)
  const settingsLoading = useSwarmStore((s) => s.settingsLoading)
  const uiPreferencesLoading = useSwarmStore((s) => s.uiPreferencesLoading)
  const loadSettings = useSwarmStore((s) => s.loadSettings)
  const loadUIPreferences = useSwarmStore((s) => s.loadUIPreferences)
  const updateSettings = useSwarmStore((s) => s.updateSettings)
  const updateUIPreferences = useSwarmStore((s) => s.updateUIPreferences)

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('personalization')
  const [settingsLevel, setSettingsLevel] = useState<'basic' | 'advanced'>(
    uiPreferences.showAdvancedSettings ? 'advanced' : 'basic'
  )
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(normalizeApiKeys(settings.apiKeys))
  const [apiEndpoints, setApiEndpoints] = useState<Record<string, string>>(settings.apiEndpoints ?? {})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [testingProvider, setTestingProvider] = useState<CLIProvider | null>(null)
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({})
  const [rawSettingsDraft, setRawSettingsDraft] = useState('')
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResponse | null>(null)
  const [integrationsSnapshot, setIntegrationsSnapshot] = useState<MeIntegrationsResponse | null>(null)
  const [profileSnapshot, setProfileSnapshot] = useState<MeProfileResponse['profile'] | null>(null)
  const [billingSubscription, setBillingSubscription] = useState<BillingSubscriptionResponse['subscription']>(null)
  const [billingEntitlements, setBillingEntitlements] = useState<BillingEntitlementsResponse['entitlements']>([])
  const [integrationLoading, setIntegrationLoading] = useState(false)
  const [integrationSnapshotLoadedAt, setIntegrationSnapshotLoadedAt] = useState<number | null>(null)
  const [integrationBusy, setIntegrationBusy] = useState<Record<string, boolean>>({})
  const [integrationStatusNotes, setIntegrationStatusNotes] = useState<Record<string, IntegrationStatusNote>>({})
  const [integrationAnnouncement, setIntegrationAnnouncement] = useState('')
  const [figmaAccessTokenDraft, setFigmaAccessTokenDraft] = useState('')
  const [figmaTeamIdDraft, setFigmaTeamIdDraft] = useState('')
  const [showFigmaAccessToken, setShowFigmaAccessToken] = useState(false)
  const [clearFigmaTokenAfterConnect, setClearFigmaTokenAfterConnect] = useState(true)
  const integrationActionRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const userRole = (session?.user?.role ?? 'viewer') as 'admin' | 'editor' | 'viewer'
  const userId = session?.user?.id
  const shortUserId = userId ? `usr_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}` : null
  const canConfigureSettings = ROLE_PERMISSIONS[userRole]?.canConfigureSettings ?? false

  useEffect(() => {
    void loadSettings()
    void loadUIPreferences()
  }, [loadSettings, loadUIPreferences])

  useEffect(() => {
    setSettingsLevel(uiPreferences.showAdvancedSettings ? 'advanced' : 'basic')
  }, [uiPreferences.showAdvancedSettings])

  useEffect(() => {
    document.documentElement.dataset.themePreset = uiPreferences.themePreset
  }, [uiPreferences.themePreset])

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get('section')
    if (section && SECTION_ITEMS.some((item) => item.id === section)) {
      setActiveSection(section as SettingsSectionId)
    }
  }, [])

  useEffect(() => {
    setApiKeys(normalizeApiKeys(settings.apiKeys))
    setApiEndpoints(settings.apiEndpoints ?? {})
    setRawSettingsDraft(JSON.stringify(settings, null, 2))
  }, [settings])

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

  const loadModelCatalog = useCallback(async () => {
    try {
      const data = await apiJson<ModelCatalogResponse>('/api/models/catalog')
      setModelCatalog(data)
    } catch {
      setModelCatalog(null)
    }
  }, [])

  const loadIntegrationSnapshot = useCallback(async () => {
    setIntegrationLoading(true)
    try {
      const [integrationsResult, profileResult, subscriptionResult, entitlementsResult] = await Promise.allSettled([
        apiJson<MeIntegrationsResponse>('/api/me/integrations'),
        apiJson<MeProfileResponse>('/api/me/profile'),
        apiJson<BillingSubscriptionResponse>('/api/billing/subscription'),
        apiJson<BillingEntitlementsResponse>('/api/billing/entitlements'),
      ])

      if (integrationsResult.status === 'fulfilled') {
        setIntegrationsSnapshot(integrationsResult.value)
      }
      if (profileResult.status === 'fulfilled') {
        setProfileSnapshot(profileResult.value.profile)
      }
      if (subscriptionResult.status === 'fulfilled') {
        setBillingSubscription(subscriptionResult.value.subscription)
      } else {
        setBillingSubscription(null)
      }
      if (entitlementsResult.status === 'fulfilled') {
        setBillingEntitlements(entitlementsResult.value.entitlements)
      } else {
        setBillingEntitlements([])
      }
      setIntegrationSnapshotLoadedAt(Date.now())
    } finally {
      setIntegrationLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadModelCatalog()
  }, [loadModelCatalog])

  useEffect(() => {
    if (activeSection === 'integrations') {
      void loadIntegrationSnapshot()
    }
  }, [activeSection, loadIntegrationSnapshot])

  const formatTimestamp = useCallback((value?: number | null) => {
    if (!value) return 'never'
    return new Date(value).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
  }, [])

  const setStatusNote = useCallback((key: string, kind: IntegrationStatusNote['kind'], message: string) => {
    setIntegrationStatusNotes((prev) => ({
      ...prev,
      [key]: {
        kind,
        message,
        updatedAt: Date.now(),
      },
    }))
  }, [])

  const runIntegrationAction = useCallback(
    async (
      busyKey: string,
      action: () => Promise<string | void>,
      options?: { noteKey?: string; successMessage?: string; focusKey?: string; skipRefresh?: boolean }
    ) => {
      setIntegrationBusy((prev) => ({ ...prev, [busyKey]: true }))
      const noteKey = options?.noteKey ?? busyKey
      try {
        const resultMessage = await action()
        const message = resultMessage || options?.successMessage || 'Completed successfully.'
        setStatusNote(noteKey, 'success', message)
        setIntegrationAnnouncement(message)
        if (!options?.skipRefresh) {
          await loadIntegrationSnapshot()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Integration action failed.'
        setStatusNote(noteKey, 'error', message)
        setIntegrationAnnouncement(message)
        toast.error(message)
      } finally {
        const focusKey = options?.focusKey ?? busyKey
        setIntegrationBusy((prev) => ({ ...prev, [busyKey]: false }))
        requestAnimationFrame(() => {
          integrationActionRefs.current[focusKey]?.focus()
        })
      }
    },
    [loadIntegrationSnapshot, setStatusNote]
  )

  const providerRows = useMemo(() => {
    const byId = new Map(CLI_REGISTRY.map((c) => [c.id, c]))
    return PROVIDER_META.map((meta) => ({
      ...meta,
      registry: byId.get(meta.id),
    }))
  }, [])

  const providerOptions = useMemo<UIProviderOption[]>(() => {
    const fallback: UIProviderOption[] = MODEL_CATALOG.map((provider) => ({
      id: provider.id,
      label: provider.label,
    }))
    if (!modelCatalog) return fallback
    const fromApi = modelCatalog.providers
      .filter((provider): provider is CatalogProviderEntry & { provider: CLIProvider } => isCLIProvider(provider.provider))
      .map((provider) => ({
        id: provider.provider,
        label: provider.label || provider.provider,
      }))
    return fromApi.length > 0 ? fromApi : fallback
  }, [modelCatalog])

  const modelsByProvider = useMemo(() => {
    const map: Record<string, UIModelOption[]> = {}
    for (const provider of MODEL_CATALOG) {
      map[provider.id] = provider.models.map((model) => ({
        id: model.id,
        label: model.label,
        supportsDeepReasoning: model.capability.supportsDeepReasoning,
      }))
    }
    if (modelCatalog) {
      for (const provider of providerOptions) {
        const dynamicModels = modelCatalog.models
          .filter((model) => model.provider === provider.id)
          .map((model) => ({
            id: model.modelId,
            label: model.displayName || model.modelId,
            supportsDeepReasoning: hasDeepReasoningCapability(provider.id, model.modelId),
          }))
        if (dynamicModels.length > 0) {
          map[provider.id] = dynamicModels
        }
      }
    }
    return map
  }, [modelCatalog, providerOptions])

  const composerProvider = useMemo(
    () => providerOptions.find((provider) => provider.id === uiPreferences.composer.defaultProvider) ?? providerOptions[0] ?? {
      id: MODEL_CATALOG[0].id,
      label: MODEL_CATALOG[0].label,
    },
    [providerOptions, uiPreferences.composer.defaultProvider]
  )
  const composerModels = useMemo(
    () => modelsByProvider[composerProvider.id] ?? [],
    [composerProvider.id, modelsByProvider]
  )
  const selectedComposerModel = useMemo(
    () => composerModels.find((model) => model.id === uiPreferences.composer.defaultModelId) ?? composerModels[0] ?? null,
    [composerModels, uiPreferences.composer.defaultModelId]
  )

  const visibleSections = settingsLevel === 'basic'
    ? SECTION_ITEMS.filter((section) => section.id === 'personalization' || section.id === 'providers' || section.id === 'runtime')
    : SECTION_ITEMS

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

  const handleApplyRawSettings = () => {
    if (!canConfigureSettings) return
    try {
      const parsed = JSON.parse(rawSettingsDraft) as Partial<Settings>
      updateSettings(parsed)
      toast.success('Advanced settings applied')
    } catch (err) {
      toast.error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const integrationById = useMemo(
    () => new Map((integrationsSnapshot?.providers ?? []).map((provider) => [provider.provider, provider])),
    [integrationsSnapshot?.providers]
  )

  const connectOAuthIntegration = useCallback(async (provider: 'github' | 'slack' | 'linear') => {
    const callbackUrl = `${window.location.origin}/api/integrations/${provider}/callback`
    const payload = await apiJson<{ url?: string; mode?: string }>(`/api/integrations/${provider}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackUrl }),
    })
    if (payload.url) {
      window.location.href = payload.url
      return `Redirecting to ${provider} authorization...`
    }
    return `${provider} connection prepared.`
  }, [])

  const disconnectIntegration = useCallback(async (provider: 'github' | 'figma' | 'slack' | 'linear') => {
    await apiJson<{ ok: boolean }>(`/api/integrations/${provider}/disconnect`, {
      method: 'DELETE',
    })
    return `${provider} disconnected.`
  }, [])

  const connectFigma = useCallback(async () => {
    const token = figmaAccessTokenDraft.trim()
    if (!token) {
      throw new Error('Figma token is required.')
    }
    await apiJson<{ connected: boolean }>('/api/integrations/figma/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: token,
        teamId: figmaTeamIdDraft.trim() || undefined,
      }),
    })
    if (clearFigmaTokenAfterConnect) {
      setFigmaAccessTokenDraft('')
    }
    return 'Figma connected.'
  }, [clearFigmaTokenAfterConnect, figmaAccessTokenDraft, figmaTeamIdDraft])

  const startBillingCheckout = useCallback(async (plan: 'pro' | 'team' | 'enterprise') => {
    const payload = await apiJson<{ url: string | null; sessionId: string }>('/api/billing/checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan,
        successUrl: `${window.location.origin}/settings?section=integrations`,
        cancelUrl: `${window.location.origin}/settings?section=integrations`,
      }),
    })
    if (!payload.url) {
      throw new Error('Checkout session did not return a redirect URL')
    }
    window.location.href = payload.url
    return `Redirecting to ${plan} checkout...`
  }, [])

  const openBillingPortal = useCallback(async () => {
    const payload = await apiJson<{ url: string }>('/api/billing/portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnUrl: `${window.location.origin}/settings?section=integrations`,
      }),
    })
    window.location.href = payload.url
    return 'Opening billing portal...'
  }, [])

  const integrationLastRefreshedLabel = useMemo(
    () => formatTimestamp(integrationSnapshotLoadedAt),
    [formatTimestamp, integrationSnapshotLoadedAt]
  )

  const figmaSnapshot = integrationById.get('figma')
  const figmaConnected = figmaSnapshot?.connected ?? false
  const figmaTokenDraftPresent = figmaAccessTokenDraft.trim().length > 0

  const openIntegrationDocs = useCallback((provider: keyof typeof INTEGRATION_DOCS) => {
    window.open(INTEGRATION_DOCS[provider], '_blank')
  }, [])

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-density={uiPreferences.density}
      data-font-scale={uiPreferences.fontScale}
      data-experience-level={uiPreferences.experienceLevel}
      data-theme-preset={uiPreferences.themePreset}
    >
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-5 md:px-6">
        <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/app')}
              className="gap-1.5"
              data-action-id="settings-back-to-app"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to App
            </Button>
            <Badge variant="secondary">Profile Settings</Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              <button
                type="button"
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  settingsLevel === 'basic' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
                )}
                onClick={() => {
                  setSettingsLevel('basic')
                  void updateUIPreferences({ showAdvancedSettings: false })
                  if (!(activeSection === 'personalization' || activeSection === 'providers')) {
                    setActiveSection('personalization')
                  }
                }}
              >
                Basic
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  settingsLevel === 'advanced' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
                )}
                onClick={() => {
                  setSettingsLevel('advanced')
                  void updateUIPreferences({ showAdvancedSettings: true })
                }}
              >
                Advanced
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>
                Signed in as <span className="font-medium text-foreground">{session?.user?.email ?? 'Unknown user'}</span>
              </span>
              {uiPreferences.showAccountId && shortUserId && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {shortUserId}
                </Badge>
              )}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border bg-card p-3">
            <nav className="space-y-1">
              {visibleSections.map((section) => {
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

              {activeSection === 'personalization' && (
                <section id="personalization" className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">Profile Personalization</h2>
                    <p className="text-sm text-muted">
                      Adaptive UI behavior saved per account across sessions and devices.
                    </p>
                  </div>

                  {uiPreferencesLoading ? (
                    <div className="rounded-lg border border-border bg-background/50 p-4 text-sm text-muted">
                      Loading personalization preferences...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3 rounded-xl border border-border p-4">
                        <h3 className="text-sm font-semibold">Shell Defaults</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs text-muted">
                            Experience Level
                            <select
                              value={uiPreferences.experienceLevel}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  experienceLevel: event.target.value as 'guided' | 'expert',
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="guided">Guided</option>
                              <option value="expert">Expert</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Theme Preset
                            <select
                              value={uiPreferences.themePreset}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  themePreset: event.target.value as 'fusia' | 'graphite' | 'atlas',
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="fusia">Fusia</option>
                              <option value="graphite">Graphite</option>
                              <option value="atlas">Atlas</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Default Mode
                            <select
                              value={uiPreferences.defaultMode}
                              onChange={(event) => void updateUIPreferences({ defaultMode: event.target.value as 'chat' | 'swarm' | 'project' })}
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="chat">Chat</option>
                              <option value="swarm">Swarm</option>
                              <option value="project">Project</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Default Tab
                            <select
                              value={uiPreferences.defaultTab}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  defaultTab: event.target.value as 'chat' | 'dashboard' | 'ide' | 'observability',
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="chat">Chat</option>
                              <option value="dashboard">Dashboard</option>
                              <option value="ide">IDE</option>
                              <option value="observability">Observability</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Density
                            <select
                              value={uiPreferences.density}
                              onChange={(event) => void updateUIPreferences({ density: event.target.value as 'comfortable' | 'compact' })}
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="comfortable">Comfortable</option>
                              <option value="compact">Compact</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Font Scale
                            <select
                              value={uiPreferences.fontScale}
                              onChange={(event) => void updateUIPreferences({ fontScale: event.target.value as 'sm' | 'md' | 'lg' })}
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="sm">Small</option>
                              <option value="md">Medium</option>
                              <option value="lg">Large</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Response Style
                            <select
                              value={uiPreferences.responseStyle}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  responseStyle: event.target.value as 'non_technical' | 'balanced' | 'technical' | 'adaptive',
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="adaptive">Adaptive</option>
                              <option value="non_technical">Non-technical</option>
                              <option value="balanced">Balanced</option>
                              <option value="technical">Technical</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Code Snippet Policy
                            <select
                              value={uiPreferences.codeSnippetPolicy}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  codeSnippetPolicy: event.target.value as 'adaptive' | 'always' | 'on_demand',
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="adaptive">Adaptive</option>
                              <option value="always">Always show</option>
                              <option value="on_demand">On demand</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Composer Provider
                            <select
                              value={uiPreferences.composer.defaultProvider}
                              onChange={(event) => {
                                const provider = event.target.value as CLIProvider
                                const defaultModelId = (modelsByProvider[provider]?.[0]?.id ?? getDefaultModelForProvider(provider)) ?? uiPreferences.composer.defaultModelId
                                void updateUIPreferences({
                                  composer: {
                                    ...uiPreferences.composer,
                                    defaultProvider: provider,
                                    defaultModelId,
                                  },
                                })
                              }}
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              {providerOptions.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                  {provider.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Composer Model
                            <select
                              value={selectedComposerModel?.id ?? ''}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  composer: {
                                    ...uiPreferences.composer,
                                    defaultModelId: event.target.value,
                                  },
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              {composerModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {selectedComposerModel?.supportsDeepReasoning ? (
                          <label className="block text-xs text-muted">
                            Default Reasoning for Selected Model
                            <select
                              value={uiPreferences.composer.reasoningByModel[selectedComposerModel.id] ?? 'standard'}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  composer: {
                                    ...uiPreferences.composer,
                                    reasoningByModel: {
                                      ...uiPreferences.composer.reasoningByModel,
                                      [selectedComposerModel.id]: event.target.value as 'standard' | 'deep',
                                    },
                                  },
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="standard">Standard</option>
                              <option value="deep">Deep</option>
                            </select>
                          </label>
                        ) : null}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                            <span className="text-sm">Collapse left rail by default</span>
                            <Switch
                              checked={uiPreferences.leftRailCollapsed}
                              onCheckedChange={(value) => void updateUIPreferences({ leftRailCollapsed: value })}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                            <span className="text-sm">Show keyboard helper in top bar</span>
                            <Switch
                              checked={uiPreferences.keyboardHelpVisible}
                              onCheckedChange={(value) => void updateUIPreferences({ keyboardHelpVisible: value })}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                            <span className="text-sm">Show account ID in profile menus</span>
                            <Switch
                              checked={uiPreferences.showAccountId}
                              onCheckedChange={(value) => void updateUIPreferences({ showAccountId: value })}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                            <span className="text-sm">Reduced motion override</span>
                            <Switch
                              checked={uiPreferences.reducedMotion === true}
                              onCheckedChange={(value) => void updateUIPreferences({ reducedMotion: value })}
                            />
                          </div>
                        </div>
                        </div>

                        <div className="space-y-3 rounded-xl border border-border p-4">
                        <h3 className="text-sm font-semibold">Preview & Observability</h3>
                        <label className="text-xs text-muted">
                          Default Preview URL
                          <Input
                            value={uiPreferences.preview.defaultUrl}
                            onChange={(event) =>
                              void updateUIPreferences({
                                preview: { ...uiPreferences.preview, defaultUrl: event.target.value },
                              })
                            }
                            className="mt-1"
                            placeholder="http://localhost:5173"
                          />
                        </label>
                        <label className="text-xs text-muted">
                          Pinned Quick Actions (comma-separated)
                          <Input
                            value={uiPreferences.pinnedQuickActions.join(', ')}
                            onChange={(event) =>
                              void updateUIPreferences({
                                pinnedQuickActions: event.target.value
                                  .split(',')
                                  .map((entry) => entry.trim())
                                  .filter(Boolean),
                              })
                            }
                            className="mt-1"
                            placeholder="new-chat, queue, schedule"
                          />
                        </label>
                        <label className="text-xs text-muted">
                          Preferred Widgets (comma-separated)
                          <Input
                            value={uiPreferences.preferredDashboardWidgets.join(', ')}
                            onChange={(event) =>
                              void updateUIPreferences({
                                preferredDashboardWidgets: event.target.value
                                  .split(',')
                                  .map((entry) => entry.trim())
                                  .filter(Boolean),
                              })
                            }
                            className="mt-1"
                            placeholder="request-rate, jobs, agents"
                          />
                        </label>
                        <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                          <span className="text-sm">Block self preview (recommended)</span>
                          <Switch
                            checked={uiPreferences.preview.blockSelfPreview}
                            onCheckedChange={(value) =>
                              void updateUIPreferences({
                                preview: { ...uiPreferences.preview, blockSelfPreview: value },
                              })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                          <span className="text-sm">Open preview panel by default</span>
                          <Switch
                            checked={uiPreferences.preview.openByDefault}
                            onCheckedChange={(value) =>
                              void updateUIPreferences({
                                preview: { ...uiPreferences.preview, openByDefault: value },
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs text-muted">
                            Observability Refresh
                            <select
                              value={uiPreferences.observability.refreshIntervalSec}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  observability: {
                                    ...uiPreferences.observability,
                                    refreshIntervalSec: Number(event.target.value),
                                  },
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value={10}>10s</option>
                              <option value={15}>15s</option>
                              <option value={30}>30s</option>
                              <option value={60}>60s</option>
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Observability Range
                            <select
                              value={uiPreferences.observability.defaultTimeRange}
                              onChange={(event) =>
                                void updateUIPreferences({
                                  observability: {
                                    ...uiPreferences.observability,
                                    defaultTimeRange: event.target.value as '15m' | '1h' | '6h' | '24h',
                                  },
                                })
                              }
                              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="15m">15m</option>
                              <option value="1h">1h</option>
                              <option value="6h">6h</option>
                              <option value="24h">24h</option>
                            </select>
                          </label>
                        </div>
                        </div>
                      </div>
                      <RulesEngineSettings canConfigureSettings={canConfigureSettings} />
                    </div>
                  )}
                </section>
              )}

              {activeSection === 'providers' && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Providers & Runtime Connectors</h2>
                      <p className="text-sm text-muted">
                        Configure in-app model providers and optional local runtime connectors.
                      </p>
                    </div>
                    {!canConfigureSettings && (
                      <Badge variant="outline">Read only</Badge>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted">
                    Active provider order: {settings.providerPriority?.length ? settings.providerPriority.join(' -> ') : settings.enabledCLIs.join(' -> ')}
                  </div>
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
                    Self-contained mode runs on direct model APIs (OpenAI, Gemini, Claude). Local runtime connectors are optional for workstation-based flows.
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
                              {provider.id === 'gemini' && (
                                <p className="mt-1 text-[11px] text-muted">
                                  API key powers in-app Gemini usage. Local runtime connector is optional.
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {provider.registry && (
                                <Badge variant="outline" className="text-xs">
                                  {provider.registry.supportsAPI ? 'API' : 'Local runtime'}
                                </Badge>
                              )}
                              {typeof isInstalled === 'boolean' && (
                                <Badge variant={isInstalled ? 'default' : 'secondary'} className="text-xs">
                                  {isInstalled ? 'Runtime detected' : 'Runtime not detected'}
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
                  <div className="sr-only" role="status" aria-live="polite">
                    {integrationAnnouncement}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Billing & Entitlements</h3>
                        <p className="text-xs text-muted">
                          Active plan: <span className="font-medium text-foreground">{profileSnapshot?.activePlan ?? 'free'}</span> |
                          Billing status: <span className="font-medium text-foreground">{profileSnapshot?.billingStatus ?? 'inactive'}</span>
                        </p>
                        <p className="mt-1 text-[11px] text-muted">Last refreshed: {integrationLastRefreshedLabel}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadIntegrationSnapshot()}
                        disabled={integrationLoading}
                      >
                        {integrationLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Refresh
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted">Current plan</label>
                        <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                          {billingSubscription?.plan ?? profileSnapshot?.activePlan ?? 'free'}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Subscription status</label>
                        <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                          {billingSubscription?.status ?? profileSnapshot?.billingStatus ?? 'inactive'}
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          ref={(node) => {
                            integrationActionRefs.current['billing-portal'] = node
                          }}
                          variant="outline"
                          size="sm"
                          disabled={Boolean(integrationBusy['billing-portal']) || integrationLoading}
                          aria-busy={Boolean(integrationBusy['billing-portal'])}
                          onClick={() =>
                            void runIntegrationAction(
                              'billing-portal',
                              () => openBillingPortal(),
                              { noteKey: 'billing', focusKey: 'billing-portal', skipRefresh: true }
                            )
                          }
                        >
                          {integrationBusy['billing-portal'] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                          Manage Billing
                        </Button>
                        <Button
                          ref={(node) => {
                            integrationActionRefs.current['billing-pro'] = node
                          }}
                          size="sm"
                          disabled={Boolean(integrationBusy['billing-pro']) || integrationLoading}
                          aria-busy={Boolean(integrationBusy['billing-pro'])}
                          onClick={() =>
                            void runIntegrationAction(
                              'billing-pro',
                              () => startBillingCheckout('pro'),
                              { noteKey: 'billing', focusKey: 'billing-pro', skipRefresh: true }
                            )
                          }
                        >
                          {integrationBusy['billing-pro'] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                          Upgrade Pro
                        </Button>
                      </div>
                    </div>
                    {integrationStatusNotes.billing ? (
                      <div
                        className={cn(
                          'mt-3 rounded-md border px-3 py-2',
                          integrationStatusNotes.billing.kind === 'error'
                            ? 'border-destructive/40 bg-destructive/10'
                            : 'border-green-500/30 bg-green-500/10'
                        )}
                      >
                        <p className="text-xs font-medium">{integrationStatusNotes.billing.message}</p>
                        <p className="mt-1 text-[11px] text-muted">Updated {formatTimestamp(integrationStatusNotes.billing.updatedAt)}</p>
                        {integrationStatusNotes.billing.kind === 'error' ? (
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              ref={(node) => {
                                integrationActionRefs.current['billing-retry'] = node
                              }}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={Boolean(integrationBusy['billing-retry'])}
                              aria-busy={Boolean(integrationBusy['billing-retry'])}
                              onClick={() =>
                                void runIntegrationAction(
                                  'billing-retry',
                                  () => openBillingPortal(),
                                  { noteKey: 'billing', focusKey: 'billing-retry', skipRefresh: true }
                                )
                              }
                            >
                              {integrationBusy['billing-retry'] ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              Retry
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => openIntegrationDocs('billing')}
                            >
                              Docs
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {billingEntitlements.length > 0 && (
                      <div className="mt-3 rounded-md border border-border bg-background/50 p-3">
                        <p className="mb-2 text-xs font-medium text-muted">Entitlements</p>
                        <div className="flex flex-wrap gap-2">
                          {billingEntitlements.map((entitlement) => (
                            <Badge key={entitlement.key} variant={entitlement.enabled ? 'default' : 'outline'} className="text-[10px]">
                              {entitlement.key}{entitlement.limit !== undefined ? `:${entitlement.limit}` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {(['github', 'slack', 'linear'] as const).map((provider) => {
                      const snapshot = integrationById.get(provider)
                      const note = integrationStatusNotes[provider]
                      const connected = snapshot?.connected ?? false
                      const busyKey = `${provider}-${connected ? 'disconnect' : 'connect'}`
                      const latestUpdate = snapshot?.entries?.[0]?.updatedAt ?? note?.updatedAt ?? integrationSnapshotLoadedAt
                      return (
                        <div key={provider} className="rounded-lg border border-border p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-semibold capitalize">{provider}</span>
                            <Badge variant={connected ? 'default' : 'outline'}>{snapshot?.status ?? 'disconnected'}</Badge>
                          </div>
                          <p className="text-xs text-muted">
                            {connected
                              ? `Connected (${snapshot?.entries?.[0]?.displayName ?? 'account linked'})`
                              : 'Not connected'}
                          </p>
                          <p className="mb-3 text-[11px] text-muted">
                            Last update: {formatTimestamp(latestUpdate)}
                          </p>
                          <Button
                            ref={(node) => {
                              integrationActionRefs.current[busyKey] = node
                            }}
                            size="sm"
                            variant={connected ? 'outline' : 'default'}
                            disabled={Boolean(integrationBusy[busyKey]) || integrationLoading}
                            aria-busy={Boolean(integrationBusy[busyKey])}
                            onClick={() =>
                              void runIntegrationAction(
                                busyKey,
                                async () => (connected ? disconnectIntegration(provider) : connectOAuthIntegration(provider)),
                                { noteKey: provider, focusKey: busyKey, skipRefresh: !connected }
                              )
                            }
                          >
                            {integrationBusy[busyKey] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                            {connected ? 'Disconnect' : 'Connect'}
                          </Button>
                          {note ? (
                            <div
                              className={cn(
                                'mt-3 rounded-md border px-3 py-2',
                                note.kind === 'error' ? 'border-destructive/40 bg-destructive/10' : 'border-green-500/30 bg-green-500/10'
                              )}
                            >
                              <p className="text-xs">{note.message}</p>
                              <p className="mt-1 text-[11px] text-muted">Updated {formatTimestamp(note.updatedAt)}</p>
                              {note.kind === 'error' ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <Button
                                    ref={(node) => {
                                      integrationActionRefs.current[`${provider}-retry`] = node
                                    }}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[11px]"
                                    disabled={Boolean(integrationBusy[`${provider}-retry`])}
                                    aria-busy={Boolean(integrationBusy[`${provider}-retry`])}
                                    onClick={() =>
                                      void runIntegrationAction(
                                        `${provider}-retry`,
                                        async () => (connected ? disconnectIntegration(provider) : connectOAuthIntegration(provider)),
                                        { noteKey: provider, focusKey: `${provider}-retry`, skipRefresh: !connected }
                                      )
                                    }
                                  >
                                    {integrationBusy[`${provider}-retry`] ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                    Retry
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => openIntegrationDocs(provider)}
                                  >
                                    Docs
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold">Figma</span>
                      <Badge variant={figmaConnected ? 'default' : 'outline'}>
                        {figmaSnapshot?.status ?? 'disconnected'}
                      </Badge>
                    </div>
                    <p className="mb-2 text-[11px] text-muted">
                      {figmaConnected ? 'Credential is saved server-side.' : 'Credential not connected.'} |
                      Draft token: {figmaTokenDraftPresent ? 'present (not saved)' : 'empty'}
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto_auto_auto]">
                      <Input
                        value={figmaAccessTokenDraft}
                        onChange={(event) => setFigmaAccessTokenDraft(event.target.value)}
                        placeholder="Figma access token"
                        type={showFigmaAccessToken ? 'text' : 'password'}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <Input
                        value={figmaTeamIdDraft}
                        onChange={(event) => setFigmaTeamIdDraft(event.target.value)}
                        placeholder="Team ID (optional)"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowFigmaAccessToken((prev) => !prev)}
                        aria-label={showFigmaAccessToken ? 'Hide Figma token' : 'Show Figma token'}
                      >
                        {showFigmaAccessToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span className="ml-1">{showFigmaAccessToken ? 'Hide' : 'Show'}</span>
                      </Button>
                      <Button
                        ref={(node) => {
                          integrationActionRefs.current['figma-connect'] = node
                        }}
                        size="sm"
                        disabled={Boolean(integrationBusy['figma-connect']) || integrationLoading}
                        aria-busy={Boolean(integrationBusy['figma-connect'])}
                        onClick={() =>
                          void runIntegrationAction('figma-connect', connectFigma, { noteKey: 'figma', focusKey: 'figma-connect' })
                        }
                      >
                        {integrationBusy['figma-connect'] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Connect
                      </Button>
                      <Button
                        ref={(node) => {
                          integrationActionRefs.current['figma-disconnect'] = node
                        }}
                        size="sm"
                        variant="outline"
                        disabled={Boolean(integrationBusy['figma-disconnect']) || !figmaConnected || integrationLoading}
                        aria-busy={Boolean(integrationBusy['figma-disconnect'])}
                        onClick={() =>
                          void runIntegrationAction('figma-disconnect', () => disconnectIntegration('figma'), {
                            noteKey: 'figma',
                            focusKey: 'figma-disconnect',
                          })
                        }
                      >
                        {integrationBusy['figma-disconnect'] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Disconnect
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-xs text-muted">
                        <Switch
                          checked={clearFigmaTokenAfterConnect}
                          onCheckedChange={setClearFigmaTokenAfterConnect}
                        />
                        Clear draft token after connect
                      </label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setFigmaAccessTokenDraft('')}
                          disabled={!figmaTokenDraftPresent}
                        >
                          Clear draft
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => openIntegrationDocs('figma')}
                        >
                          Docs
                        </Button>
                      </div>
                    </div>
                    {integrationStatusNotes.figma ? (
                      <div
                        className={cn(
                          'mt-3 rounded-md border px-3 py-2',
                          integrationStatusNotes.figma.kind === 'error'
                            ? 'border-destructive/40 bg-destructive/10'
                            : 'border-green-500/30 bg-green-500/10'
                        )}
                      >
                        <p className="text-xs">{integrationStatusNotes.figma.message}</p>
                        <p className="mt-1 text-[11px] text-muted">Updated {formatTimestamp(integrationStatusNotes.figma.updatedAt)}</p>
                        {integrationStatusNotes.figma.kind === 'error' ? (
                          <Button
                            ref={(node) => {
                              integrationActionRefs.current['figma-retry'] = node
                            }}
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 px-2 text-[11px]"
                            disabled={Boolean(integrationBusy['figma-retry'])}
                            aria-busy={Boolean(integrationBusy['figma-retry'])}
                            onClick={() =>
                              void runIntegrationAction('figma-retry', connectFigma, {
                                noteKey: 'figma',
                                focusKey: 'figma-retry',
                              })
                            }
                          >
                            {integrationBusy['figma-retry'] ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <h3 className="mb-2 text-sm font-semibold">Provider Catalog (Live)</h3>
                    <p className="mb-3 text-xs text-muted">
                      Backed by `/api/providers/catalog` and `/api/providers/models`; shows the full runtime/model visibility.
                    </p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {(modelCatalog?.providers ?? []).filter((provider) => isCLIProvider(provider.provider)).map((provider) => {
                        const modelCount = (modelCatalog?.models ?? []).filter((model) => model.provider === provider.provider).length
                        return (
                          <div key={provider.provider} className="rounded-md border border-border bg-background/50 px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{provider.label}</span>
                              <Badge variant={provider.runtimeAvailable ? 'default' : 'outline'} className="text-[10px]">
                                {provider.runtimeAvailable ? 'Runtime ready' : 'Runtime unavailable'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted">
                              {modelCount} models | {provider.isConfiguredByUser ? 'API configured' : 'No API key'}
                            </p>
                          </div>
                        )
                      })}
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

              {settingsLevel === 'advanced' && (
                <section className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Advanced Settings JSON</h3>
                      <p className="text-xs text-muted">
                        Full schema-backed fallback editor for fields not shown in simplified controls.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleApplyRawSettings}
                      disabled={!canConfigureSettings}
                    >
                      Apply JSON
                    </Button>
                  </div>
                  <textarea
                    value={rawSettingsDraft}
                    onChange={(event) => setRawSettingsDraft(event.target.value)}
                    className="min-h-[220px] w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground"
                    spellCheck={false}
                  />
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

