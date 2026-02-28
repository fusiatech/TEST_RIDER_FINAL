'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import { useSwarmStore } from '@/lib/store'
import type { Attachment, CLIProvider, ReasoningMode } from '@/lib/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageBubble } from '@/components/message-bubble'
import { FileUpload } from '@/components/file-upload'
import { VoiceInputButton, VoiceInputIndicator } from '@/components/voice-input-button'
import { SpellCheckInput } from '@/components/spell-check-input'
import { ErrorBoundary } from '@/components/error-boundary'
import { MinimalErrorFallback } from '@/components/error-fallback'
import { ROLE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadingState } from '@/components/ui/loading-state'
import { apiJson } from '@/lib/client-api'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Send,
  Square,
  Sparkles,
  Code2,
  TestTube2,
  Bug,
  Shield,
  Zap,
  FolderKanban,
  Globe,
  Hammer,
  Rocket,
  CircleHelp,
  ChevronDown,
  Activity,
  ListTree,
  ListPlus,
  X,
} from 'lucide-react'
import type { AppMode } from '@/lib/store'
import { MODEL_CATALOG } from '@/lib/model-catalog'

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

interface CatalogResponse {
  providers: CatalogProviderEntry[]
  models: CatalogModelEntry[]
  updatedAt: number
}

interface UIModelOption {
  id: string
  label: string
  capability: {
    supportsDeepReasoning: boolean
    supportsStreaming: boolean
    supportsTools: boolean
  }
}

interface UIProviderOption {
  id: CLIProvider
  label: string
  models: UIModelOption[]
}

const DEEP_REASONING_HINTS = ['gpt-5', 'o1', 'o3', 'pro', 'sonnet', 'opus', 'reason']

function resolveModelCapability(providerId: CLIProvider, modelId: string): UIModelOption['capability'] {
  const provider = MODEL_CATALOG.find((entry) => entry.id === providerId)
  const exact = provider?.models.find((model) => model.id === modelId)
  if (exact) {
    return exact.capability
  }

  const lowered = modelId.toLowerCase()
  const supportsDeepReasoning = DEEP_REASONING_HINTS.some((hint) => lowered.includes(hint))
  return {
    supportsDeepReasoning,
    supportsStreaming: true,
    supportsTools: true,
  }
}

function isCLIProvider(value: string): value is CLIProvider {
  return MODEL_CATALOG.some((provider) => provider.id === value)
}

function TabLoadingSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

const ControlCenterDashboard = dynamic(
  () => import('@/components/control-center-dashboard').then((mod) => ({ default: mod.ControlCenterDashboard })),
  { loading: () => <TabLoadingSkeleton />, ssr: false }
)

const ObservabilityDashboard = dynamic(
  () => import('@/components/observability-dashboard').then((mod) => ({ default: mod.ObservabilityDashboard })),
  { loading: () => <TabLoadingSkeleton />, ssr: false }
)

const DevEnvironment = dynamic(
  () => import('@/components/dev-environment').then((mod) => ({ default: mod.DevEnvironment })),
  { loading: () => <TabLoadingSkeleton />, ssr: false }
)

const CHAT_PROMPTS = [
  { icon: Globe, text: 'Plan a rollout for a zero-downtime auth migration', color: 'var(--color-role-researcher)' },
  { icon: Bug, text: 'Debug this failing endpoint and propose a fix', color: 'var(--color-role-validator)' },
  { icon: Code2, text: 'Implement a typed API client with retries and tests', color: 'var(--color-role-coder)' },
  { icon: Shield, text: 'Validate security controls before production deploy', color: 'var(--color-role-security)' },
]

const SWARM_PROMPTS = [
  { icon: Code2, text: 'Plan, build, and validate a production-ready auth refactor', color: 'var(--color-role-coder)' },
  { icon: TestTube2, text: 'Build test strategy, implement coverage, and ship reports', color: 'var(--color-role-researcher)' },
  { icon: Bug, text: 'Investigate latency regression and execute a full fix pipeline', color: 'var(--color-role-validator)' },
  { icon: Shield, text: 'Run a full security validation and remediation pass', color: 'var(--color-role-security)' },
]

const PROJECT_PROMPTS = [
  { icon: Rocket, text: 'Design and execute a full MVP delivery plan', color: 'var(--color-role-planner)' },
  { icon: Hammer, text: 'Ideate features, prioritize, and implement the first milestone', color: 'var(--color-role-coder)' },
  { icon: Zap, text: 'Build and validate a realtime event platform', color: 'var(--color-role-validator)' },
  { icon: FolderKanban, text: 'Create a roadmap and ticket architecture for a new product', color: 'var(--color-role-researcher)' },
]

const MODE_PROMPTS: Record<AppMode, typeof CHAT_PROMPTS> = {
  chat: CHAT_PROMPTS,
  swarm: SWARM_PROMPTS,
  project: PROJECT_PROMPTS,
}

const MODE_LABELS: Record<AppMode, string> = {
  chat: 'Chat',
  swarm: 'Swarm',
  project: 'Project',
}

function buildFollowUpPrompts(mode: AppMode, lastAssistantText: string): string[] {
  const lower = lastAssistantText.toLowerCase()
  if (lower.includes('test') || lower.includes('failing')) {
    return [
      'Create a focused fix plan for the failing area',
      'Generate targeted tests for the failure paths',
      'Summarize what changed and what to verify next',
    ]
  }
  if (lower.includes('plan') || lower.includes('roadmap')) {
    return [
      'Turn this plan into executable tasks',
      'Identify the top 3 risks and mitigations',
      'Generate a delivery timeline with checkpoints',
    ]
  }
  if (mode === 'project') {
    return [
      'Break this into project tickets and priorities',
      'Create the first milestone implementation checklist',
      'Open a conversation focused on technical execution',
    ]
  }
  if (mode === 'swarm') {
    return [
      'Run a deeper multi-agent validation pass',
      'Expand this into implementation plus testing steps',
      'Produce a concise executive summary and action list',
    ]
  }
  return [
    'Implement this now with production-safe changes',
    'Refine this with clearer architecture decisions',
    'Explain the tradeoffs and best next step',
  ]
}

function extractAssistantSuggestions(content: string): string[] {
  const lines = content.split('\n').map((line) => line.trim())
  const headingPattern = /^(#+\s*)?(recommended prompts?|suggested prompts?|continue with|next actions?|next prompts?)\s*:?\s*$/i
  const bulletPattern = /^[-*]\s+(.+)$|^\d+\.\s+(.+)$/

  const suggestions: string[] = []
  let capture = false

  for (const line of lines) {
    if (!line) {
      if (capture && suggestions.length > 0) break
      continue
    }
    if (line.startsWith('```')) {
      if (capture) break
      continue
    }
    if (headingPattern.test(line)) {
      capture = true
      continue
    }
    if (!capture) continue
    const match = line.match(bulletPattern)
    if (!match) {
      if (suggestions.length > 0) break
      continue
    }
    const candidate = (match[1] ?? match[2] ?? '').trim().replace(/^["'`]|["'`]$/g, '')
    if (candidate.length < 12 || candidate.length > 140) continue
    suggestions.push(candidate)
    if (suggestions.length >= 5) break
  }

  return suggestions
}

function dedupePrompts(items: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of items) {
    const normalized = item.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(item)
  }
  return output
}

const VALID_TABS = ['chat', 'dashboard', 'ide', 'observability'] as const
type TabType = typeof VALID_TABS[number]

function isValidTab(tab: string | null): tab is TabType {
  return tab !== null && VALID_TABS.includes(tab as TabType)
}

function CompactRunTimeline({
  agents,
  isRunning,
}: {
  agents: Array<{ id: string; role: string; status: string; output: string }>
  isRunning: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!isRunning && agents.length === 0) return null

  const statusCounts = {
    running: agents.filter((agent) => agent.status === 'running' || agent.status === 'spawning').length,
    completed: agents.filter((agent) => agent.status === 'completed').length,
    failed: agents.filter((agent) => agent.status === 'failed').length,
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border/80 bg-background/60 p-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Run Timeline</p>
            <p className="text-[11px] text-muted">
              {statusCounts.running} running | {statusCounts.completed} completed | {statusCounts.failed} failed
            </p>
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{ROLE_LABELS[agent.role as keyof typeof ROLE_LABELS] ?? agent.role}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {agent.status}
                </Badge>
              </div>
              {agent.output.trim() ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-muted">{agent.output.trim()}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChatResponseLoading({
  queuedCount,
  agentCount,
  activeStep,
}: {
  queuedCount: number
  agentCount: number
  activeStep: number
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-3 md:p-4" data-action-id="chat-response-loading">
      <LoadingState
        variant="workflow"
        size="md"
        text="Fusia is building your response..."
        steps={['Queued', 'Planning', 'Running', 'Review']}
        activeStep={activeStep}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Queued</p>
          <p className="mt-1 text-xs font-medium text-foreground">{queuedCount}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Active agents</p>
          <p className="mt-1 text-xs font-medium text-foreground">{agentCount}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/70 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Output</p>
          <p className="mt-1 text-xs font-medium text-foreground">Streaming with pacing</p>
        </div>
      </div>
    </div>
  )
}

export function ChatView() {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [followOutput, setFollowOutput] = useState(false)
  const [catalogData, setCatalogData] = useState<CatalogResponse | null>(null)
  const [catalogSource, setCatalogSource] = useState<'loading' | 'live' | 'fallback'>('loading')
  const [catalogStatusMessage, setCatalogStatusMessage] = useState('Loading live model catalog...')
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null)
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState<number | null>(null)
  const [srAnnouncement, setSrAnnouncement] = useState('')
  const [providerHighlightedIndex, setProviderHighlightedIndex] = useState(0)
  const [modelHighlightedIndex, setModelHighlightedIndex] = useState(0)

  const providerTriggerRef = useRef<HTMLButtonElement>(null)
  const modelTriggerRef = useRef<HTMLButtonElement>(null)
  const providerMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const providerOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const modelOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = useSwarmStore((s) => s.messages)
  const agents = useSwarmStore((s) => s.agents)
  const isRunning = useSwarmStore((s) => s.isRunning)
  const sendMessage = useSwarmStore((s) => s.sendMessage)
  const cancelSwarm = useSwarmStore((s) => s.cancelSwarm)
  const activeTab = useSwarmStore((s) => s.activeTab)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const mode = useSwarmStore((s) => s.mode)
  const settings = useSwarmStore((s) => s.settings)
  const queuedMessages = useSwarmStore((s) => s.queuedMessages)
  const uiPreferences = useSwarmStore((s) => s.uiPreferences)
  const updateUIPreferences = useSwarmStore((s) => s.updateUIPreferences)
  const queueMessage = useSwarmStore((s) => s.queueMessage)
  const removeQueuedMessage = useSwarmStore((s) => s.removeQueuedMessage)
  const clearQueuedMessages = useSwarmStore((s) => s.clearQueuedMessages)
  const selectedProvider = useSwarmStore((s) => s.selectedAgent)
  const setSelectedProvider = useSwarmStore((s) => s.setSelectedAgent)
  const selectedModelId = useSwarmStore((s) => s.selectedModelId)
  const setSelectedModelId = useSwarmStore((s) => s.setSelectedModelId)
  const reasoningMode = useSwarmStore((s) => s.reasoningMode)
  const setReasoningMode = useSwarmStore((s) => s.setReasoningMode)

  const loadCatalog = useCallback(async () => {
    setCatalogSource('loading')
    setCatalogStatusMessage('Loading live model catalog...')
    setCatalogLoadError(null)
    try {
      const data = await apiJson<CatalogResponse>('/api/models/catalog')
      setCatalogData(data)
      const hasLiveEntries = data.providers.length > 0 || data.models.length > 0
      if (hasLiveEntries) {
        setCatalogSource('live')
        setCatalogStatusMessage('Live catalog loaded.')
        setCatalogUpdatedAt(data.updatedAt || Date.now())
        setSrAnnouncement('Live model catalog loaded.')
      } else {
        setCatalogSource('fallback')
        setCatalogStatusMessage('Live catalog returned no models. Using fallback catalog.')
        setCatalogLoadError('No live models returned')
        setSrAnnouncement('Live catalog returned no models. Fallback catalog in use.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load catalog'
      setCatalogData(null)
      setCatalogSource('fallback')
      setCatalogStatusMessage('Live catalog unavailable. Using fallback catalog.')
      setCatalogLoadError(message)
      setSrAnnouncement('Live catalog unavailable. Fallback catalog in use.')
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab')
    if (isValidTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
    // Resolve query tab once on mount; do not override user tab interactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveTab])

  const hideLocalConnectors = settings.executionRuntime === 'server_managed'
  const localConnectorIds = useMemo(() => new Set<CLIProvider>(['cursor', 'copilot', 'rovo', 'custom']), [])
  const staticProviderMap = useMemo(
    () => new Map<CLIProvider, (typeof MODEL_CATALOG)[number]>(MODEL_CATALOG.map((provider) => [provider.id, provider])),
    []
  )
  const enabledProviders = useMemo<UIProviderOption[]>(() => {
    const fallback = MODEL_CATALOG
      .filter((provider) => settings.enabledCLIs.includes(provider.id))
      .filter((provider) => !hideLocalConnectors || !localConnectorIds.has(provider.id))
      .map((provider) => ({
        id: provider.id,
        label: provider.label,
        models: provider.models.map((model) => ({
          id: model.id,
          label: model.label,
          capability: model.capability,
        })),
      }))

    if (!catalogData) return fallback

    const modelGroups = new Map<string, UIModelOption[]>()
    for (const model of catalogData.models) {
      if (!isCLIProvider(model.provider)) continue
      const list = modelGroups.get(model.provider) ?? []
      list.push({
        id: model.modelId,
        label: model.displayName,
        capability: resolveModelCapability(model.provider, model.modelId),
      })
      modelGroups.set(model.provider, list)
    }

    const catalogProviders = catalogData.providers
      .filter((provider): provider is CatalogProviderEntry & { provider: CLIProvider } => isCLIProvider(provider.provider))
    const fromCatalog = catalogProviders
      .filter((provider) => settings.enabledCLIs.includes(provider.provider))
      .filter((provider) => !hideLocalConnectors || !localConnectorIds.has(provider.provider))
      .map((provider) => {
        const fallbackProvider = staticProviderMap.get(provider.provider)
        const models = modelGroups.get(provider.provider)
        const safeModels = (models && models.length > 0)
          ? models
          : (fallbackProvider?.models.map((model) => ({
              id: model.id,
              label: model.label,
              capability: model.capability,
            })) ?? [])
        return {
          id: provider.provider,
          label: provider.label || fallbackProvider?.label || provider.provider,
          models: safeModels,
        }
      })

    return fromCatalog.length > 0 ? fromCatalog : fallback
  }, [catalogData, hideLocalConnectors, localConnectorIds, settings.enabledCLIs, staticProviderMap])

  const fallbackCurrentProvider: UIProviderOption = {
    id: MODEL_CATALOG[0].id,
    label: MODEL_CATALOG[0].label,
    models: MODEL_CATALOG[0].models.map((model) => ({
      id: model.id,
      label: model.label,
      capability: model.capability,
    })),
  }
  const currentProvider = enabledProviders.find((provider) => provider.id === selectedProvider) ?? enabledProviders[0] ?? fallbackCurrentProvider
  const availableModels = currentProvider.models
  const effectiveModelId = selectedModelId && availableModels.some((model) => model.id === selectedModelId)
    ? selectedModelId
    : (availableModels[0]?.id ?? null)
  const effectiveModel = availableModels.find((model) => model.id === effectiveModelId) ?? null
  const reasoningSupported = Boolean(effectiveModel?.capability.supportsDeepReasoning)
  const catalogUpdatedLabel = useMemo(
    () => (catalogUpdatedAt ? new Date(catalogUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null),
    [catalogUpdatedAt]
  )
  const catalogBadgeLabel = catalogSource === 'live'
    ? 'Catalog: Live'
    : catalogSource === 'fallback'
      ? 'Catalog: Fallback'
      : 'Catalog: Loading'

  useEffect(() => {
    if (selectedProvider === currentProvider.id) return
    setSelectedProvider(currentProvider.id)
  }, [selectedProvider, currentProvider.id, setSelectedProvider])

  useEffect(() => {
    if (!effectiveModelId) return
    if (selectedModelId === effectiveModelId) return
    setSelectedModelId(effectiveModelId)
  }, [effectiveModelId, selectedModelId, setSelectedModelId])

  useEffect(() => {
    if (!providerMenuOpen) return
    const selectedIndex = Math.max(enabledProviders.findIndex((provider) => provider.id === currentProvider.id), 0)
    setProviderHighlightedIndex(selectedIndex)
    requestAnimationFrame(() => {
      providerOptionRefs.current[selectedIndex]?.focus()
    })
  }, [providerMenuOpen, enabledProviders, currentProvider.id])

  useEffect(() => {
    if (!modelMenuOpen) return
    const selectedIndex = Math.max(availableModels.findIndex((model) => model.id === effectiveModelId), 0)
    setModelHighlightedIndex(selectedIndex)
    requestAnimationFrame(() => {
      modelOptionRefs.current[selectedIndex]?.focus()
    })
  }, [modelMenuOpen, availableModels, effectiveModelId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setProviderMenuOpen(false)
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  useEffect(() => {
    if (followOutput) {
      scrollToBottom()
    }
  }, [messages, agents, followOutput, scrollToBottom])

  useEffect(() => {
    const focusComposer = () => {
      const element =
        document.querySelector<HTMLTextAreaElement>('textarea#chat-input') ??
        document.querySelector<HTMLTextAreaElement>('#chat-input textarea')
      if (element) {
        element.focus()
      }
    }
    window.addEventListener('fusia:focus-composer', focusComposer as EventListener)
    return () => {
      window.removeEventListener('fusia:focus-composer', focusComposer as EventListener)
    }
  }, [])

  const handleProviderSelect = useCallback((providerId: CLIProvider) => {
    const nextProvider = enabledProviders.find((provider) => provider.id === providerId)
    const nextModel = nextProvider?.models[0]?.id ?? null
    setSelectedProvider(providerId)
    setSelectedModelId(nextModel)
    setProviderMenuOpen(false)
    setSrAnnouncement(`Provider set to ${nextProvider?.label ?? providerId}.`)
    requestAnimationFrame(() => {
      providerTriggerRef.current?.focus()
    })

    void updateUIPreferences({
      composer: {
        ...uiPreferences.composer,
        defaultProvider: providerId,
        defaultModelId: nextModel ?? uiPreferences.composer.defaultModelId,
      },
    })
  }, [enabledProviders, setSelectedProvider, setSelectedModelId, updateUIPreferences, uiPreferences.composer])

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModelId(modelId)
    const nextReasoning = uiPreferences.composer.reasoningByModel[modelId] ?? 'standard'
    setReasoningMode(nextReasoning)
    setModelMenuOpen(false)
    const selected = availableModels.find((model) => model.id === modelId)
    setSrAnnouncement(`Model set to ${selected?.label ?? modelId}.`)
    requestAnimationFrame(() => {
      modelTriggerRef.current?.focus()
    })

    void updateUIPreferences({
      composer: {
        ...uiPreferences.composer,
        defaultModelId: modelId,
      },
    })
  }, [setSelectedModelId, uiPreferences.composer, updateUIPreferences, setReasoningMode, availableModels])

  const handleProviderTriggerKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const selectedIndex = Math.max(enabledProviders.findIndex((provider) => provider.id === currentProvider.id), 0)
      setProviderHighlightedIndex(selectedIndex)
      setProviderMenuOpen(true)
    }
  }, [enabledProviders, currentProvider.id])

  const handleModelTriggerKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const selectedIndex = Math.max(availableModels.findIndex((model) => model.id === effectiveModelId), 0)
      setModelHighlightedIndex(selectedIndex)
      setModelMenuOpen(true)
    }
  }, [availableModels, effectiveModelId])

  const handleProviderOptionKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setProviderMenuOpen(false)
      providerTriggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = Math.min(index + 1, Math.max(enabledProviders.length - 1, 0))
      setProviderHighlightedIndex(next)
      providerOptionRefs.current[next]?.focus()
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.max(index - 1, 0)
      setProviderHighlightedIndex(next)
      providerOptionRefs.current[next]?.focus()
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setProviderHighlightedIndex(0)
      providerOptionRefs.current[0]?.focus()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      const last = Math.max(enabledProviders.length - 1, 0)
      setProviderHighlightedIndex(last)
      providerOptionRefs.current[last]?.focus()
      return
    }
    if (event.key === 'Tab') {
      setProviderMenuOpen(false)
    }
  }, [enabledProviders.length])

  const handleModelOptionKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setModelMenuOpen(false)
      modelTriggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = Math.min(index + 1, Math.max(availableModels.length - 1, 0))
      setModelHighlightedIndex(next)
      modelOptionRefs.current[next]?.focus()
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.max(index - 1, 0)
      setModelHighlightedIndex(next)
      modelOptionRefs.current[next]?.focus()
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setModelHighlightedIndex(0)
      modelOptionRefs.current[0]?.focus()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      const last = Math.max(availableModels.length - 1, 0)
      setModelHighlightedIndex(last)
      modelOptionRefs.current[last]?.focus()
      return
    }
    if (event.key === 'Tab') {
      setModelMenuOpen(false)
    }
  }, [availableModels.length])

  const handleReasoningChange = useCallback((value: ReasoningMode) => {
    if (!effectiveModelId) return
    setReasoningMode(value)
    void updateUIPreferences({
      composer: {
        ...uiPreferences.composer,
        reasoningByModel: {
          ...uiPreferences.composer.reasoningByModel,
          [effectiveModelId]: value,
        },
      },
    })
  }, [effectiveModelId, setReasoningMode, uiPreferences.composer, updateUIPreferences])

  const handleSend = (text?: string) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || isRunning) return
    sendMessage(trimmed, attachments)
    setInput('')
    setAttachments([])
  }

  const handleQueue = (text?: string) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed) return
    queueMessage(trimmed, attachments)
    setInput('')
    setAttachments([])
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setInput((prev) => (prev ? `${prev}\n${transcript}` : transcript))
  }, [])

  const handleVoiceListeningChange = useCallback((listening: boolean) => {
    setIsVoiceListening(listening)
  }, [])

  const currentPrompts = MODE_PROMPTS[mode]
  const experienceLabel = uiPreferences.experienceLevel === 'expert' ? 'Expert' : 'Guided'
  const responseStyleLabel = uiPreferences.responseStyle.replace('_', ' ')
  const activeRunAgents = agents
    .filter((agent) => agent.status === 'running' || agent.status === 'spawning' || agent.status === 'completed' || agent.status === 'failed')
    .slice(-8)
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant')
  const followUpPrompts = useMemo(() => {
    if (!latestAssistantMessage) return []
    const generated = buildFollowUpPrompts(mode, latestAssistantMessage.content)
    const extracted = extractAssistantSuggestions(latestAssistantMessage.content)
    return dedupePrompts([...generated, ...extracted]).slice(0, 4)
  }, [latestAssistantMessage, mode])
  const loadingStep = useMemo(() => {
    if (queuedMessages.length > 0) return 0
    if (activeRunAgents.length === 0) return 1
    if (activeRunAgents.some((agent) => agent.status === 'running' || agent.status === 'spawning')) return 2
    return 3
  }, [activeRunAgents, queuedMessages.length])

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="border-b border-border bg-card/30 px-4 py-2">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{MODE_LABELS[mode]} Mode</Badge>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                {experienceLabel}
              </Badge>
              <Badge variant="outline" className="hidden text-[10px] uppercase tracking-wide md:inline-flex">
                {responseStyleLabel}
              </Badge>
              {queuedMessages.length > 0 ? (
                <Badge variant="outline" className="text-[10px]">
                  Queue {queuedMessages.length}
                </Badge>
              ) : null}
            </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setFollowOutput((value) => !value)}
            data-action-id="chat-follow-output-toggle"
          >
            <ListTree className="h-3.5 w-3.5" />
            {followOutput ? 'Following output' : 'Follow paused'}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'ide' ? (
          <motion.div key="ide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0">
            <ErrorBoundary fallback={(props) => <div className="flex h-full items-center justify-center p-8"><MinimalErrorFallback {...props} /></div>}>
              <DevEnvironment />
            </ErrorBoundary>
          </motion.div>
        ) : activeTab === 'observability' ? (
          <motion.div key="observability" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0 overflow-auto">
            <ObservabilityDashboard />
          </motion.div>
        ) : activeTab === 'dashboard' ? (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0 overflow-auto">
            <ControlCenterDashboard />
          </motion.div>
        ) : (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0">
            <ErrorBoundary fallback={(props) => <div className="flex h-full items-center justify-center p-8"><MinimalErrorFallback {...props} /></div>}>
              <ScrollArea className="h-full">
                <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
                      <div className="relative mb-6">
                        <div className="absolute inset-0 rounded-3xl bg-primary/5 blur-2xl" />
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/20 to-primary/5">
                          <Sparkles className="h-10 w-10 text-primary" />
                        </div>
                      </div>
                      <h2 className="text-xl font-bold text-foreground">
                        Build The Future with Fusia AI
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm text-muted">
                        Plan, build, test, validate, execute, and ideate in one adaptive workspace.
                      </p>
                      <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                        {currentPrompts.map((prompt) => (
                          <button
                            key={prompt.text}
                            onClick={() => handleSend(prompt.text)}
                            className="group flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4 text-left transition-all hover:border-primary/30 hover:bg-card"
                          >
                            <prompt.icon className="mt-0.5 h-4 w-4 shrink-0 transition-colors" style={{ color: prompt.color }} />
                            <span className="text-sm text-muted transition-colors group-hover:text-foreground">
                              {prompt.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <CompactRunTimeline
                    agents={activeRunAgents}
                    isRunning={isRunning}
                  />

                  <AnimatePresence mode="popLayout">
                    {messages.map((message) => (
                      <motion.div key={message.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
                        <MessageBubble message={message} />
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {isRunning ? (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      <ChatResponseLoading
                        queuedCount={queuedMessages.length}
                        agentCount={activeRunAgents.length}
                        activeStep={loadingStep}
                      />
                    </motion.div>
                  ) : null}

                  {followUpPrompts.length > 0 && !isRunning && (
                    <section className="rounded-xl border border-border/70 bg-card/40 p-3">
                      <p className="mb-2 text-xs font-medium text-muted">Continue with</p>
                      <div className="flex flex-wrap gap-2">
                        {followUpPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
                            onClick={() => handleSend(prompt)}
                            data-action-id="chat-followup-prompt"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'chat' && (
      <div className="border-t border-border p-3 md:p-4">
        <div className="mx-auto max-w-5xl space-y-2">
          <div className="sr-only" role="status" aria-live="polite">
            {srAnnouncement}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-1">
            <Badge variant={catalogSource === 'live' ? 'default' : 'outline'} className="text-[10px] uppercase tracking-wide">
              {catalogBadgeLabel}
            </Badge>
            <span className="text-[11px] text-muted">
              {catalogStatusMessage}
              {catalogUpdatedLabel ? ` Updated ${catalogUpdatedLabel}.` : ''}
              {catalogSource === 'fallback' && catalogLoadError ? ` (${catalogLoadError})` : ''}
            </span>
            {catalogSource === 'fallback' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => void loadCatalog()}
                data-action-id="composer-catalog-retry"
              >
                Retry live sync
              </Button>
            ) : null}
          </div>

          {queuedMessages.length > 0 ? (
            <div className="rounded-xl border border-border/70 bg-card/40 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">Queued prompts</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={clearQueuedMessages}
                  data-action-id="chat-queue-clear"
                >
                  Clear queue
                </Button>
              </div>
              <div className="space-y-1.5">
                {queuedMessages.slice(0, 4).map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-2.5 py-1.5"
                  >
                    <span className="text-[10px] text-muted">#{index + 1}</span>
                    <span className="line-clamp-1 flex-1 text-xs text-foreground">{entry.prompt}</span>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-primary/10 hover:text-foreground"
                      onClick={() => removeQueuedMessage(entry.id)}
                      data-action-id="chat-queue-remove"
                      aria-label="Remove queued prompt"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {queuedMessages.length > 4 ? (
                  <p className="text-[10px] text-muted">+{queuedMessages.length - 4} more in queue</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {(input.length > 500 || isVoiceListening) && (
            <div className="flex items-center justify-between px-1">
              {isVoiceListening ? (
                <VoiceInputIndicator isListening={isVoiceListening} />
              ) : (
                <span />
              )}
              {input.length > 500 && (
                <span className={cn('text-[10px] tabular-nums', input.length > 4000 ? 'text-destructive' : 'text-muted')}>
                  {input.length.toLocaleString()} characters
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/80 bg-card/60 p-2">
            <div className="group relative" title="Attach file">
              <FileUpload attachments={attachments} onAttachmentsChange={setAttachments} />
            </div>

            <div ref={providerMenuRef} className="relative">
              <button
                ref={providerTriggerRef}
                type="button"
                onClick={() => setProviderMenuOpen((value) => !value)}
                onKeyDown={handleProviderTriggerKeyDown}
                aria-label={`Select provider: ${currentProvider.label}`}
                aria-expanded={providerMenuOpen}
                aria-haspopup="listbox"
                aria-controls="provider-selector-listbox"
                className={cn(
                  'flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-medium transition-all',
                  providerMenuOpen
                    ? 'border-primary/50 text-foreground ring-2 ring-primary/20'
                    : 'border-border text-muted hover:border-primary/40 hover:text-foreground'
                )}
                data-action-id="composer-provider-select"
              >
                <span className="max-w-[120px] truncate">{currentProvider.label}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', providerMenuOpen && 'rotate-180')} />
              </button>
              {providerMenuOpen && (
                <div
                  id="provider-selector-listbox"
                  role="listbox"
                  aria-label="Provider selector"
                  className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl transition-all duration-150"
                >
                  {enabledProviders.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted">No providers enabled. Enable one in Settings.</p>
                  ) : (
                    enabledProviders.map((provider, index) => (
                      <button
                        key={provider.id}
                        ref={(element) => {
                          providerOptionRefs.current[index] = element
                        }}
                        role="option"
                        tabIndex={providerHighlightedIndex === index ? 0 : -1}
                        aria-selected={currentProvider.id === provider.id}
                        onClick={() => handleProviderSelect(provider.id)}
                        onKeyDown={(event) => handleProviderOptionKeyDown(event, index)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          currentProvider.id === provider.id
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted hover:bg-primary/10 hover:text-foreground'
                        )}
                      >
                        <span className="flex-1 text-left">{provider.label}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div ref={modelMenuRef} className="relative">
              <button
                ref={modelTriggerRef}
                type="button"
                onClick={() => setModelMenuOpen((value) => !value)}
                onKeyDown={handleModelTriggerKeyDown}
                aria-label={`Select model: ${effectiveModel?.label ?? 'None'}`}
                aria-expanded={modelMenuOpen}
                aria-haspopup="listbox"
                aria-controls="model-selector-listbox"
                className={cn(
                  'flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-medium transition-all',
                  modelMenuOpen
                    ? 'border-primary/50 text-foreground ring-2 ring-primary/20'
                    : 'border-border text-muted hover:border-primary/40 hover:text-foreground'
                )}
                data-action-id="composer-model-select"
              >
                <span className="max-w-[150px] truncate">{effectiveModel?.label ?? 'Select model'}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', modelMenuOpen && 'rotate-180')} />
              </button>
              {modelMenuOpen && (
                <div
                  id="model-selector-listbox"
                  role="listbox"
                  aria-label="Model selector"
                  className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border bg-card p-1.5 shadow-xl transition-all duration-150"
                >
                  {availableModels.length === 0 ? (
                    <div className="space-y-1 px-3 py-2">
                      <p className="text-xs text-muted">No models available for this provider.</p>
                      {catalogSource === 'loading' ? <p className="text-[11px] text-muted">Catalog is still loading.</p> : null}
                      {catalogSource === 'fallback' ? <p className="text-[11px] text-muted">Fallback catalog is active.</p> : null}
                    </div>
                  ) : (
                    availableModels.map((model, index) => (
                      <button
                        key={model.id}
                        ref={(element) => {
                          modelOptionRefs.current[index] = element
                        }}
                        role="option"
                        tabIndex={modelHighlightedIndex === index ? 0 : -1}
                        aria-selected={effectiveModelId === model.id}
                        onClick={() => handleModelSelect(model.id)}
                        onKeyDown={(event) => handleModelOptionKeyDown(event, index)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          effectiveModelId === model.id
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted hover:bg-primary/10 hover:text-foreground'
                        )}
                      >
                        <span className="truncate">{model.label}</span>
                        {model.capability.supportsDeepReasoning ? (
                          <Badge variant="outline" className="text-[10px]">Deep</Badge>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {reasoningSupported && (
              <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs text-foreground">
                <span>Reasoning</span>
                <select
                  value={reasoningMode}
                  onChange={(e) => handleReasoningChange(e.target.value as ReasoningMode)}
                  className="h-11 bg-transparent text-xs focus:outline-none"
                  data-action-id="composer-reasoning-select"
                >
                  <option value="standard">Standard</option>
                  <option value="deep">Deep</option>
                </select>
              </label>
            )}

            <div className="relative min-w-[240px] flex-1">
              <label className="sr-only" htmlFor="chat-input">Message input</label>
              <SpellCheckInput
                id="chat-input"
                value={input}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'project' ? 'Describe a feature or task for this project...' : 'Describe your task...'}
                rows={1}
                autoResize
                maxHeight={220}
                minHeight={44}
                showInlineErrors={true}
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow [&_textarea]:bg-transparent [&_textarea]:border-0 [&_textarea]:p-0 [&_textarea]:focus:ring-0 [&_textarea]:focus:ring-offset-0"
                data-testid="chat-input"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl text-muted hover:text-foreground"
              onClick={() => window.dispatchEvent(new CustomEvent('fusia:open-keyboard-shortcuts'))}
              aria-label="Help and keyboard shortcuts"
              data-action-id="composer-help"
            >
              <CircleHelp className="h-4 w-4" />
            </Button>

            <VoiceInputButton
              onTranscript={handleVoiceTranscript}
              onListeningChange={handleVoiceListeningChange}
              disabled={isRunning}
              showSettings={false}
              appendMode={true}
            />

            <Button
              variant="outline"
              size="icon"
              onClick={() => handleQueue()}
              disabled={!input.trim()}
              className="h-11 w-11 shrink-0 rounded-xl"
              aria-label="Queue prompt"
              data-action-id="composer-queue"
            >
              <ListPlus className="h-4 w-4" />
            </Button>

            {isRunning ? (
              <Button
                variant="destructive"
                size="icon"
                onClick={cancelSwarm}
                className="h-11 w-11 shrink-0 rounded-xl"
                aria-label="Cancel running run"
                data-action-id="composer-stop"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={cn('h-11 w-11 shrink-0 rounded-xl transition-colors btn-press', input.trim() ? 'bg-primary hover:bg-primary/90' : 'bg-muted/50')}
                aria-label="Send message"
                data-testid="send-button"
                data-action-id="composer-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      )}

    </div>
  )
}
