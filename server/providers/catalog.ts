import { CLI_REGISTRY } from '@/lib/cli-registry'
import type { ProviderCatalogEntry, ProviderModelEntry } from '@/lib/contracts/backend'
import { getUserApiKeys, getSettings } from '@/server/storage'
import { detectInstalledCLIs } from '@/server/cli-detect'

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000
const modelCache = new Map<string, { expiresAt: number; value: ProviderModelEntry[] }>()

const FALLBACK_MODELS: Record<string, string[]> = {
  codex: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
  gemini: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  claude: ['claude-sonnet-4.5', 'claude-opus-4.1', 'claude-haiku-3.5'],
  cursor: ['cursor-local-runtime'],
  copilot: ['copilot-gpt-4o'],
  rovo: ['rovo-dev-default'],
  custom: ['custom-runtime-model'],
}

function hasKeyForProvider(provider: string, apiKeys: Record<string, string | undefined>): boolean {
  if (provider === 'codex') return Boolean(apiKeys.openai || apiKeys.codex)
  if (provider === 'gemini') return Boolean(apiKeys.gemini || apiKeys.google)
  if (provider === 'claude') return Boolean(apiKeys.claude || apiKeys.anthropic)
  if (provider === 'copilot') return Boolean(apiKeys.copilot || apiKeys.github)
  if (provider === 'cursor') return Boolean(apiKeys.cursor)
  if (provider === 'rovo') return Boolean(apiKeys.rovo)
  return Boolean(apiKeys.custom)
}

async function discoverOpenAIModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  if (!res.ok) {
    throw new Error(`OpenAI model listing failed (${res.status})`)
  }
  const payload = (await res.json()) as { data?: Array<{ id: string }> }
  return (payload.data ?? []).map((item) => item.id).filter(Boolean)
}

async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
  )
  if (!res.ok) {
    throw new Error(`Gemini model listing failed (${res.status})`)
  }
  const payload = (await res.json()) as { models?: Array<{ name?: string }> }
  return (payload.models ?? [])
    .map((item) => (item.name ?? '').replace(/^models\//, ''))
    .filter(Boolean)
}

async function discoverProviderModels(provider: string, apiKeys: Record<string, string | undefined>): Promise<ProviderModelEntry[]> {
  const cacheKey = `${provider}:${Object.keys(apiKeys)
    .filter((key) => apiKeys[key])
    .join(',')}`
  const cached = modelCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const fallback = (FALLBACK_MODELS[provider] ?? []).map((modelId) => ({
    provider,
    modelId,
    displayName: modelId,
    source: 'fallback' as const,
  }))

  try {
    let models: string[] = []
    if (provider === 'codex' && (apiKeys.openai || apiKeys.codex)) {
      models = await discoverOpenAIModels(apiKeys.openai ?? apiKeys.codex ?? '')
    } else if (provider === 'gemini' && (apiKeys.gemini || apiKeys.google)) {
      models = await discoverGeminiModels(apiKeys.gemini ?? apiKeys.google ?? '')
    } else if (provider === 'claude') {
      models = FALLBACK_MODELS.claude ?? []
    } else {
      models = FALLBACK_MODELS[provider] ?? []
    }

    const entries = (models.length > 0 ? models : fallback.map((item) => item.modelId)).map((modelId) => ({
      provider,
      modelId,
      displayName: modelId,
      source: models.length > 0 ? ('api' as const) : ('fallback' as const),
    }))

    modelCache.set(cacheKey, {
      expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
      value: entries,
    })

    return entries
  } catch {
    modelCache.set(cacheKey, {
      expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
      value: fallback,
    })
    return fallback
  }
}

export async function getProviderCatalogForUser(userId: string): Promise<ProviderCatalogEntry[]> {
  const [settings, apiKeys, detected] = await Promise.all([
    getSettings(),
    getUserApiKeys(userId),
    detectInstalledCLIs(),
  ])

  const installedMap = new Map(detected.map((cli) => [cli.id, Boolean(cli.installed)]))
  const keys = (apiKeys ?? {}) as Record<string, string | undefined>

  return CLI_REGISTRY.map((cli) => ({
    provider: cli.id,
    label: cli.name,
    supportsApi: Boolean(cli.supportsAPI),
    isEnabledByUser: settings.enabledCLIs.includes(cli.id),
    isConfiguredByUser: hasKeyForProvider(cli.id, keys),
    runtimeAvailable: Boolean(installedMap.get(cli.id)),
  }))
}

export async function getProviderModelsForUser(userId: string): Promise<ProviderModelEntry[]> {
  const apiKeys = (await getUserApiKeys(userId)) ?? {}
  const providers = CLI_REGISTRY.map((cli) => cli.id)
  const entries = await Promise.all(
    providers.map((provider) => discoverProviderModels(provider, apiKeys as Record<string, string | undefined>))
  )
  return entries.flat()
}
