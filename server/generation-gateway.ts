import type { ApiKeys, Settings } from '@/lib/types'
import { runAPIAgent, type APIRunnerOptions } from '@/server/api-runner'
import { createLogger } from '@/server/logger'

const logger = createLogger('generation-gateway')

export type ArtifactGenerationMode = 'system' | 'byok_standard' | 'auto_hybrid'
export type GenerationProvider = APIRunnerOptions['provider']
export type GenerationSourceLane = 'system' | 'byok'

export interface RoutingDecision {
  provider: GenerationProvider
  sourceLane: GenerationSourceLane
  routeReason: string
}

export interface GenerationMetadata {
  provider: string
  model: string
  sourceType: ArtifactGenerationMode
  fallbackUsed: boolean
  routeReason: string
  estimatedCost: number
  quotaImpact: {
    requests: number
  }
  latencyMs: number
  placeholder: boolean
}

export interface GenerationGatewayRequest {
  prompt: string
  settings: Settings
  preferredProvider?: GenerationProvider
  model?: string
  artifactType?: string
  deterministicFallback?: () => string
}

export interface GenerationGatewayResult {
  text: string
  metadata: GenerationMetadata
}

interface Candidate {
  provider: GenerationProvider
  apiKey: string
  sourceLane: GenerationSourceLane
  model: string
  routeReason: string
}

const FREE_FIRST_ORDER: GenerationProvider[] = ['gemini-api', 'claude', 'chatgpt']

const PROVIDER_DEFAULT_MODEL: Record<GenerationProvider, string> = {
  'gemini-api': 'gemini-2.5-flash',
  claude: 'claude-sonnet-4',
  chatgpt: 'gpt-4.1-mini',
}

function resolveGenerationMode(settings: Settings): ArtifactGenerationMode {
  const raw = settings.artifactGenerationMode
  if (raw === 'system' || raw === 'byok_standard' || raw === 'auto_hybrid') {
    return raw
  }
  return 'auto_hybrid'
}

function getSystemApiKeys(): ApiKeys {
  return {
    openai: process.env.OPENAI_API_KEY || process.env.CHATGPT || process.env.CODEX,
    codex: process.env.CODEX || process.env.OPENAI_API_KEY || process.env.CHATGPT,
    google: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    claude: process.env.ANTHROPIC_API_KEY,
  }
}

function providerKey(keySource: ApiKeys | undefined, provider: GenerationProvider): string | undefined {
  if (!keySource) return undefined
  if (provider === 'chatgpt') return keySource.codex || keySource.openai
  if (provider === 'gemini-api') return keySource.gemini || keySource.google
  return keySource.claude || keySource.anthropic
}

function listCandidates(
  mode: ArtifactGenerationMode,
  settings: Settings,
  preferredProvider?: GenerationProvider,
): Candidate[] {
  const byokKeys = settings.apiKeys
  const systemKeys = getSystemApiKeys()

  const byok: Candidate[] = []
  for (const provider of FREE_FIRST_ORDER) {
    const key = providerKey(byokKeys, provider)
    if (!key) continue
    byok.push({
      provider,
      apiKey: key,
      sourceLane: 'byok',
      model: PROVIDER_DEFAULT_MODEL[provider],
      routeReason: 'byok_profile_key_available',
    })
  }

  const system: Candidate[] = []
  for (const provider of FREE_FIRST_ORDER) {
    const key = providerKey(systemKeys, provider)
    if (!key) continue
    system.push({
      provider,
      apiKey: key,
      sourceLane: 'system',
      model: PROVIDER_DEFAULT_MODEL[provider],
      routeReason: 'system_platform_key_available',
    })
  }

  let chain: Candidate[] = []
  if (mode === 'system') {
    chain = system
  } else if (mode === 'byok_standard') {
    chain = byok
  } else {
    chain = [...system, ...byok]
  }

  if (preferredProvider) {
    chain = [
      ...chain.filter((candidate) => candidate.provider === preferredProvider),
      ...chain.filter((candidate) => candidate.provider !== preferredProvider),
    ]
  }

  const seen = new Set<string>()
  const deduped: Candidate[] = []
  for (const candidate of chain) {
    const id = `${candidate.sourceLane}:${candidate.provider}:${candidate.apiKey.slice(0, 6)}`
    if (seen.has(id)) continue
    seen.add(id)
    deduped.push(candidate)
  }
  return deduped
}

export interface ResolveGenerationRouteResult {
  mode: ArtifactGenerationMode
  candidates: RoutingDecision[]
}

export function resolveGenerationRoute(
  settings: Settings,
  preferredProvider?: GenerationProvider,
): ResolveGenerationRouteResult {
  const mode = resolveGenerationMode(settings)
  const candidates = listCandidates(mode, settings, preferredProvider).map((candidate) => ({
    provider: candidate.provider,
    sourceLane: candidate.sourceLane,
    routeReason: candidate.routeReason,
  }))
  return { mode, candidates }
}

async function invokeCandidate(
  candidate: Candidate,
  prompt: string,
  forcedModel?: string,
): Promise<{ text: string; latencyMs: number }> {
  const startedAt = Date.now()
  let output = ''
  let runtimeError: Error | null = null

  await runAPIAgent({
    provider: candidate.provider,
    prompt,
    apiKey: candidate.apiKey,
    model: forcedModel || candidate.model,
    onOutput: (chunk) => {
      output += chunk
    },
    onComplete: () => {},
    onError: (error) => {
      runtimeError = new Error(error)
    },
  })

  if (runtimeError) {
    throw runtimeError
  }
  if (!output.trim()) {
    throw new Error('Provider returned empty output')
  }

  return { text: output, latencyMs: Date.now() - startedAt }
}

function buildFallbackMetadata(
  sourceType: ArtifactGenerationMode,
  routeReason: string,
): GenerationMetadata {
  return {
    provider: 'deterministic-fallback',
    model: 'template-v1',
    sourceType,
    fallbackUsed: true,
    routeReason,
    estimatedCost: 0,
    quotaImpact: { requests: 0 },
    latencyMs: 0,
    placeholder: true,
  }
}

export async function runGenerationGateway(
  request: GenerationGatewayRequest,
): Promise<GenerationGatewayResult> {
  const mode = resolveGenerationMode(request.settings)
  const maxPromptChars = request.settings.abusePolicy?.maxPromptChars ?? 20_000
  const prompt =
    request.prompt.length > maxPromptChars
      ? request.prompt.slice(0, maxPromptChars)
      : request.prompt

  const candidates = listCandidates(mode, request.settings, request.preferredProvider)
  const maxFallbackHops = request.settings.modelRoutingPolicy?.maxFallbackHops ?? 4
  const attempts = candidates.slice(0, Math.max(1, maxFallbackHops))
  const errors: string[] = []

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
    const candidate = attempts[attemptIndex]
    try {
      const result = await invokeCandidate(candidate, prompt, request.model)
      const metadata: GenerationMetadata = {
        provider: candidate.provider,
        model: request.model || candidate.model,
        sourceType: mode,
        fallbackUsed: attemptIndex > 0,
        routeReason: candidate.routeReason,
        estimatedCost: 0,
        quotaImpact: { requests: 1 },
        latencyMs: result.latencyMs,
        placeholder: false,
      }
      return { text: result.text, metadata }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${candidate.sourceLane}:${candidate.provider}:${message}`)
      logger.warn('Provider attempt failed', {
        provider: candidate.provider,
        sourceLane: candidate.sourceLane,
        artifactType: request.artifactType,
        error: message,
      })
    }
  }

  if (request.deterministicFallback) {
    const text = request.deterministicFallback()
    return {
      text,
      metadata: buildFallbackMetadata(mode, errors.length > 0 ? errors.join(' | ') : 'no_provider_available'),
    }
  }

  const reason = errors.length > 0 ? errors.join(' | ') : 'no_provider_available'
  throw new Error(`Generation failed: ${reason}`)
}
