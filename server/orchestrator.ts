import { writeFileSync, chmodSync } from 'node:fs'
import { getTempFile } from '@/lib/paths'
import { createLogger } from '@/server/logger'
import {
  createSpan,
  withSpan,
  setSpanError,
  setSpanSuccess,
  addSpanEvent,
} from '@/lib/telemetry'

const logger = createLogger('orchestrator')
import type { Span } from '@opentelemetry/api'
import type {
  Settings,
  SwarmResult,
  AgentRole,
  AgentInstance,
  CLIProvider,
  AgentSelectionMode,
  Ticket,
  ChatIntent,
} from '@/lib/types'
import {
  SwarmError,
  TimeoutError,
  NetworkError,
  ValidationError,
  ResourceError,
  wrapError,
  withRetry,
  isSwarmError,
} from '@/lib/errors'
import { scanAndMaskAgentOutput } from '@/server/secrets-scanner'
import {
  agentResponseTime,
  confidenceScore,
  agentSpawnsTotal,
  agentFailuresTotal,
  cacheHitsTotal,
  cacheMissesTotal,
} from '@/lib/metrics'
import { ROLE_LABELS } from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { spawnCLI } from '@/server/cli-runner'
import type { CLIRunnerHandle } from '@/server/cli-runner'
import { runAPIAgent } from '@/server/api-runner'
import { detectInstalledCLIs } from '@/server/cli-detect'
import { computeConfidence, extractSources } from '@/server/confidence'
import { runSecurityChecks } from '@/server/security-checks'
import {
  createWorktree,
  cleanupWorktree,
  cleanupAllWorktrees,
  isGitRepo,
} from '@/server/worktree-manager'
import {
  buildResearchPrompt,
  buildPlanPrompt,
  buildCodePrompt,
  buildValidatePrompt,
  buildSecurityPrompt,
  buildSynthesizePrompt,
  buildMCPToolContext,
} from '@/server/prompt-builder'
import { TicketManager } from '@/server/ticket-manager'
import {
  isGitHubAuthenticated,
  createBranch,
  commitChanges,
  createPullRequest,
} from '@/server/github-integration'
import {
  getCachedOutput,
  setCachedOutput,
} from '@/server/output-cache'
import {
  createPipelineEvidence,
  appendCliExcerpt,
  appendDiffSummary,
  linkTicketToEvidence,
} from '@/server/evidence'
import {
  selectBestOutput as selectBestOutputAH,
  analyzeStageOutputs,
  shouldRerunValidation,
  evaluateEvidenceSufficiency,
} from '@/server/anti-hallucination'
import type { AgentOutput } from '@/server/anti-hallucination'
import { runPipeline, cancelAll } from '@/server/pipeline-engine'
import { validateCode } from '@/server/code-validator'
import type { CodeValidationResult } from '@/server/code-validator'
import {
  parseToolCallsFromOutput,
  executeToolCalls,
  type MCPServerConfig,
} from '@/server/mcp-client'
import {
  validateAgentOutput,
  getValidationErrorSummary,
  type OutputValidationResult,
} from '@/server/output-schemas'
import { getEvidence } from '@/server/storage'
export { runPipeline, cancelAll }

/* ── GAP-015: Confidence Gates Configuration ──────────────────────── */

export interface StageConfidenceThresholds {
  researcher: number
  planner: number
  coder: number
  validator: number
  security: number
  synthesizer: number
}

export const DEFAULT_STAGE_CONFIDENCE_THRESHOLDS: StageConfidenceThresholds = {
  researcher: 40,
  planner: 50,
  coder: 60,
  validator: 70,
  security: 80,
  synthesizer: 50,
}

export interface ConfidenceGateResult {
  stage: AgentRole
  confidence: number
  threshold: number
  passed: boolean
  breakdown: {
    outputLength: number
    validOutputs: number
    totalOutputs: number
    schemaValid: boolean
    schemaErrors: string[]
  }
}

/* ── Public types ──────────────────────────────────────────────── */

export type PipelineMode = 'chat' | 'swarm' | 'project'

export interface SwarmPipelineOptions {
  prompt: string
  intent?: ChatIntent
  agentSelectionMode?: AgentSelectionMode
  preferredAgent?: CLIProvider
  settings: Settings
  projectPath: string
  mode?: PipelineMode
  onAgentOutput: (agentId: string, data: string) => void
  onAgentStatus: (agentId: string, status: string, exitCode?: number) => void
  /** Callback for MCP tool call results */
  onMCPToolResult?: (serverId: string, toolName: string, result: unknown, error?: string) => void
  /** Set by pipeline at start for evidence ledger (T8). */
  evidenceId?: string
}

/* ── Module-level state ───────────────────────────────────────── */

let cancelled = false
const activeProcesses: CLIRunnerHandle[] = []
let lastPipelineRunTime: number | null = null

export function getLastPipelineRunTime(): number | null {
  return lastPipelineRunTime
}

/** T2.3: Unified cancellation - stops both orchestrator (user jobs) and pipeline-engine (scheduler jobs) */
export function cancelSwarm(): void {
  cancelled = true
  for (const handle of activeProcesses) {
    try {
      handle.kill()
    } catch (err) {
      logger.debug('Process kill during cancelSwarm failed (may have already exited)', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  activeProcesses.length = 0
  cancelAll()
}

/* ── Mock agent fallback ──────────────────────────────────────── */

const MOCK_AGENT_PATH = getTempFile('mock-agent.sh')

function ensureMockAgent(): void {
  const script = `#!/bin/bash
echo "[mock-agent] No CLI agents are installed."
echo "[mock-agent] Prompt received: \${1:0:200}"
echo "[mock-agent] To use real agents, install cursor, gemini, claude, or copilot CLI."
echo "[mock-agent] For now, returning a placeholder response."
echo ""
echo "This is a mock response. Please install a real CLI agent."
`
  writeFileSync(MOCK_AGENT_PATH, script, 'utf-8')
  chmodSync(MOCK_AGENT_PATH, 0o755)
}

/**
 * Filter settings.enabledCLIs to only those actually installed on the system.
 * If none are installed, register a mock agent in the CLI_REGISTRY and return
 * ['cursor'] so the pipeline can still run end-to-end.
 */
async function resolveAvailableCLIs(
  enabledCLIs: CLIProvider[],
  settings: Settings,
  agentSelectionMode?: AgentSelectionMode,
  preferredAgent?: CLIProvider,
): Promise<CLIProvider[]> {
  const executionRuntime = settings.executionRuntime ?? 'server_managed'
  const systemCLIsEnabled =
    process.env.SWARM_ENABLE_SYSTEM_CLIS === '1' ||
    process.env.SWARM_ENABLE_SYSTEM_CLIS === 'true'
  const localRuntimeAllowed =
    executionRuntime === 'local_dev' && systemCLIsEnabled
  const forceMockAgents =
    process.env.SWARM_FORCE_MOCK_AGENTS === '1' ||
    process.env.SWARM_FORCE_MOCK_AGENTS === 'true'
  if (forceMockAgents) {
    ensureMockAgent()
    const cursorEntry = CLI_REGISTRY.find((c) => c.id === 'cursor')
    if (cursorEntry) {
      cursorEntry.command = MOCK_AGENT_PATH
      cursorEntry.args = []
    }
    return ['cursor']
  }

  // In normal app mode we force server-managed providers and avoid local CLI execution.
  if (!localRuntimeAllowed) {
    const inAppProviders = enabledCLIs.filter((id) => {
      const apiProvider = mapProviderToAPI(id)
      if (!apiProvider) return false
      const apiKey = getAPIKeyForProvider(id, settings)
      return Boolean(apiKey && apiKey.trim().length > 0)
    })
    const freeEligible = settings.freeOnlyMode
      ? inAppProviders.filter((id) => id === 'gemini')
      : inAppProviders
    const priority = settings.providerPriority ?? enabledCLIs
    const ordered = [
      ...priority.filter((id): id is CLIProvider => freeEligible.includes(id)),
      ...freeEligible.filter((id) => !priority.includes(id)),
    ]

    if (agentSelectionMode === 'manual' && preferredAgent) {
      if (ordered.includes(preferredAgent)) return [preferredAgent]
      throw new ValidationError(
        `Preferred agent '${preferredAgent}' is unavailable in server-managed mode. Configure a valid key or choose another provider.`
      )
    }

    if (ordered.length > 0) return ordered

    throw new ValidationError(
      'No server-managed AI provider is configured for this user profile. Add API keys in Settings > API Keys and enable codex/gemini/claude providers.'
    )
  }

  const detected = await detectInstalledCLIs()
  const installedIds = new Set(
    detected.filter((c) => c.installed).map((c) => c.id),
  )

  const initiallyAvailable = enabledCLIs.filter((id) => installedIds.has(id))
  const freeEligible = settings.freeOnlyMode
    ? initiallyAvailable.filter((id) => id === 'gemini' || id === 'cursor' || id === 'custom')
    : initiallyAvailable

  const priority = settings.providerPriority ?? enabledCLIs
  const ordered = [
    ...priority.filter((id): id is CLIProvider => freeEligible.includes(id)),
    ...freeEligible.filter((id) => !priority.includes(id)),
  ]

  if (agentSelectionMode === 'manual' && preferredAgent && ordered.includes(preferredAgent)) {
    return [preferredAgent]
  }

  if (ordered.length > 0) return ordered

  ensureMockAgent()
  const cursorEntry = CLI_REGISTRY.find((c) => c.id === 'cursor')
  if (cursorEntry) {
    cursorEntry.command = MOCK_AGENT_PATH
    cursorEntry.args = []
  }
  return ['cursor']
}

/* ── Mode auto-detection ──────────────────────────────────────── */

function detectMode(prompt: string): PipelineMode {
  const lower = prompt.toLowerCase()
  const projectKeywords = [
    'build',
    'create app',
    'full project',
    'application',
    'implement system',
  ]
  const swarmKeywords = [
    'refactor',
    'review',
    'fix',
    'optimize',
    'test',
    'security audit',
    'code',
  ]

  if (projectKeywords.some((k) => lower.includes(k)) && prompt.length > 200) {
    return 'project'
  }
  if (swarmKeywords.some((k) => lower.includes(k))) {
    return 'swarm'
  }
  return 'chat'
}

function applyIntentToPrompt(prompt: string, intent: ChatIntent | undefined): string {
  switch (intent ?? 'auto') {
    case 'one_line_fix':
      return `${prompt}\n\nOutput policy: Provide a single concise fix line and no extra commentary.`
    case 'plan':
      return `${prompt}\n\nOutput policy: Provide a structured implementation plan with clear phases and acceptance criteria.`
    case 'code_review':
      return `${prompt}\n\nOutput policy: Return findings-first code review output ordered by severity, then brief recommendations.`
    case 'explain':
      return `${prompt}\n\nOutput policy: Explain clearly with short rationale and practical examples.`
    case 'debug':
      return `${prompt}\n\nOutput policy: Focus on root cause, minimal reproduction hints, and exact fix steps.`
    case 'code_implementation':
      return `${prompt}\n\nOutput policy: Prioritize implementation-ready code and concrete file-level changes.`
    case 'auto':
    default:
      return prompt
  }
}

/* ── Helpers ───────────────────────────────────────────────────── */

function getProvider(enabledCLIs: CLIProvider[], index: number): CLIProvider {
  if (enabledCLIs.length === 0) return 'cursor'
  return enabledCLIs[index % enabledCLIs.length]
}

/**
 * Map CLI provider names to API runner provider names.
 * Returns null if the provider doesn't have an API equivalent.
 */
function mapProviderToAPI(
  provider: CLIProvider,
): 'chatgpt' | 'gemini-api' | 'claude' | null {
  switch (provider) {
    case 'codex':
    case 'cursor':
      return 'chatgpt'
    case 'gemini':
      return 'gemini-api'
    case 'claude':
      return 'claude'
    default:
      return null
  }
}

/**
 * Get the API key for a provider from settings.
 * Returns null if no key is configured.
 */
function getAPIKeyForProvider(
  provider: CLIProvider,
  settings: Settings,
): string | null {
  const apiKeys = settings.apiKeys
  if (!apiKeys) return null

  switch (provider) {
    case 'codex':
      return apiKeys.codex ?? apiKeys.openai ?? null
    case 'cursor':
      return apiKeys.openai ?? apiKeys.codex ?? null
    case 'gemini':
      return apiKeys.gemini ?? apiKeys.google ?? null
    case 'claude':
      return apiKeys.claude ?? apiKeys.anthropic ?? null
    case 'copilot':
      return apiKeys.copilot ?? apiKeys.github ?? null
    default:
      return null
  }
}

/**
 * Check if a provider should use API mode (has API key configured).
 */
function shouldUseAPIMode(provider: CLIProvider, settings: Settings): boolean {
  const apiProvider = mapProviderToAPI(provider)
  if (!apiProvider) return false
  const apiKey = getAPIKeyForProvider(provider, settings)
  return !!apiKey && apiKey.length > 0
}

/** T3.2: Use anti-hallucination selectBestOutput for synthesis */
function toAgentOutputs(
  outputs: string[],
  agents?: AgentInstance[],
): AgentOutput[] {
  if (agents && agents.length === outputs.length) {
    return agents.map((a) => ({
      agentId: a.id,
      output: a.output,
      exitCode: a.exitCode ?? 0,
    }))
  }
  return outputs.map((o, i) => ({
    agentId: `agent-${i}`,
    output: o,
    exitCode: 0,
  }))
}

function selectBestOutput(outputs: string[], agents?: AgentInstance[]): string {
  const agentOutputs = toAgentOutputs(outputs, agents)
  return selectBestOutputAH(agentOutputs)
}

function buildCancelledResult(agents: AgentInstance[]): SwarmResult {
  return {
    finalOutput: 'Swarm cancelled.',
    confidence: 0,
    agents,
    sources: [],
    validationPassed: false,
  }
}

async function enforceEvidenceGuardrails(
  result: SwarmResult,
  evidenceId: string | undefined,
  onAgentOutput: (agentId: string, data: string) => void,
): Promise<SwarmResult> {
  if (result.finalOutput === 'Swarm cancelled.') {
    return result
  }

  if (!evidenceId) {
    return result
  }

  const evidence = await getEvidence(evidenceId)
  const decision = evaluateEvidenceSufficiency({
    confidence: result.confidence,
    sourceCount: result.sources.length,
    evidence,
  })

  const evidenceStatus = {
    sufficient: !decision.refuse,
    traceId: decision.traceId,
    references: decision.references,
  }

  if (!decision.refuse) {
    return {
      ...result,
      evidenceStatus,
    }
  }

  onAgentOutput(
    'system',
    `[orchestrator] Refusal triggered: ${decision.reason ?? 'insufficient evidence'} (trace: ${decision.traceId ?? 'n/a'})\n`,
  )

  return {
    ...result,
    finalOutput: `Refusal: insufficient evidence to provide a reliable result.\nReason: ${decision.reason ?? 'insufficient evidence'}\nRequired evidence: ${decision.requiredEvidence.join(', ')}\nTrace ID: ${decision.traceId ?? 'n/a'}`,
    validationPassed: false,
    refusal: {
      reason: decision.reason ?? 'Insufficient evidence for a reliable response',
      requiredEvidence: decision.requiredEvidence,
      traceId: decision.traceId,
    },
    evidenceStatus,
  }
}

/**
 * GAP-015: Check confidence gate for a stage.
 * Returns detailed breakdown of confidence factors.
 */
function checkConfidenceGate(
  role: AgentRole,
  outputs: string[],
  validationResults: OutputValidationResult[],
  thresholds: StageConfidenceThresholds = DEFAULT_STAGE_CONFIDENCE_THRESHOLDS,
): ConfidenceGateResult {
  const threshold = thresholds[role]
  const validOutputs = outputs.filter((o) => o.length > 20)
  const totalLength = validOutputs.reduce((sum, o) => sum + o.length, 0)
  
  const schemaValid = validationResults.every((r) => r.isValid)
  const schemaErrors = validationResults
    .filter((r) => !r.isValid)
    .flatMap((r) => r.errors)
  
  let confidence = 0
  
  if (validOutputs.length > 0) {
    const lengthScore = Math.min(100, (totalLength / (validOutputs.length * 500)) * 100)
    const validityScore = (validOutputs.length / outputs.length) * 100
    const schemaScore = schemaValid ? 100 : 50
    
    confidence = Math.round(
      (lengthScore * 0.3) + (validityScore * 0.4) + (schemaScore * 0.3)
    )
  }
  
  return {
    stage: role,
    confidence,
    threshold,
    passed: confidence >= threshold,
    breakdown: {
      outputLength: totalLength,
      validOutputs: validOutputs.length,
      totalOutputs: outputs.length,
      schemaValid,
      schemaErrors,
    },
  }
}

/**
 * Process MCP tool calls found in agent output.
 * Parses tool call patterns, executes them, and returns results.
 */
async function processMCPToolCalls(
  output: string,
  settings: Settings,
  onAgentOutput: (agentId: string, data: string) => void,
  onMCPToolResult?: (serverId: string, toolName: string, result: unknown, error?: string) => void,
): Promise<string> {
  const mcpServers = settings.mcpServers ?? []
  if (mcpServers.length === 0) return output

  const enabledServers = mcpServers.filter((s) => s.enabled)
  if (enabledServers.length === 0) return output

  const toolCalls = parseToolCallsFromOutput(output)
  if (toolCalls.length === 0) return output

  onAgentOutput('system', `[mcp] Found ${toolCalls.length} MCP tool call(s) in agent output\n`)

  const serverConfigs: MCPServerConfig[] = enabledServers.map((s) => ({
    id: s.id,
    name: s.name,
    command: s.command,
    args: s.args,
    env: s.env,
  }))

  const results = await executeToolCalls(toolCalls, serverConfigs)

  let enrichedOutput = output
  for (const [key, result] of results) {
    const [serverId, toolName] = key.split(':')
    const isError = typeof result === 'object' && result !== null && 'error' in result
    
    if (isError) {
      const errorMsg = (result as { error: string }).error
      onAgentOutput('system', `[mcp] Tool ${toolName} failed: ${errorMsg}\n`)
      onMCPToolResult?.(serverId, toolName, null, errorMsg)
    } else {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      onAgentOutput('system', `[mcp] Tool ${toolName} result: ${resultStr.slice(0, 200)}${resultStr.length > 200 ? '...' : ''}\n`)
      onMCPToolResult?.(serverId, toolName, result)
      
      enrichedOutput += `\n\n[MCP_TOOL_RESULT] server=${serverId} tool=${toolName}\n${resultStr}`
    }
  }

  return enrichedOutput
}

/* ── Core: spawn a group of agents with 200ms stagger ──────────── */

const STAGGER_MS = 200

interface StageRunResult {
  outputs: string[]
  agents: AgentInstance[]
  validationResults?: OutputValidationResult[]
  confidenceGate?: ConfidenceGateResult
}

async function runStage(
  role: AgentRole,
  count: number,
  prompt: string,
  settings: Settings,
  projectPath: string,
  options: SwarmPipelineOptions,
  useWorktrees: boolean,
  parentSpan?: Span,
): Promise<StageRunResult> {
  const stageSpan = createSpan(`stage.${role}`, {
    attributes: {
      'swarm.stage': role,
      'swarm.agent_count': count,
      'swarm.use_worktrees': useWorktrees,
    },
    parentSpan,
  })
  const enabledCLIs: CLIProvider[] =
    settings.enabledCLIs.length > 0 ? settings.enabledCLIs : ['cursor']
  const chatsPerAgent: number = Math.max(1, Math.min(settings.chatsPerAgent ?? 1, 2))
  const agents: AgentInstance[] = []

  for (let i = 0; i < count; i++) {
    const provider = getProvider(enabledCLIs, i)
    const agentId = `${role}-${i + 1}`
    const agent: AgentInstance = {
      id: agentId,
      role,
      label: `${ROLE_LABELS[role]} #${i + 1}`,
      provider,
      status: 'spawning',
      output: '',
      startedAt: Date.now(),
    }
    agents.push(agent)
    options.onAgentStatus(agentId, 'spawning')
  }

  const promises = agents.map((agent, i) => {
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        if (cancelled) {
          agent.status = 'cancelled'
          options.onAgentStatus(agent.id, 'cancelled')
          resolve('')
          return
        }

        const cached = getCachedOutput(prompt, agent.provider)
        if (cached && cached.confidence > 70) {
          cacheHitsTotal.inc()
          options.onAgentOutput(
            agent.id,
            `[orchestrator] Cache hit for ${agent.provider} (confidence ${cached.confidence}%), using cached output\n`,
          )
          agent.status = 'completed'
          agent.output = cached.output
          agent.exitCode = 0
          agent.finishedAt = Date.now()
          options.onAgentStatus(agent.id, 'completed', 0)
          resolve(cached.output)
          return
        }
        cacheMissesTotal.inc()

        let workdir = projectPath
        if (useWorktrees && isGitRepo(projectPath)) {
          try {
            workdir = createWorktree(projectPath, agent.id)
            agent.worktree = workdir
          } catch (err) {
            logger.warn('Failed to create worktree, falling back to projectPath', { error: err instanceof Error ? err.message : String(err), agentId: agent.id, projectPath })
          }
        }

        options.onAgentStatus(agent.id, 'running')
        agent.status = 'running'
        agentSpawnsTotal.inc({ provider: agent.provider, role })

        const useAPI = shouldUseAPIMode(agent.provider, settings)
        const apiProvider = mapProviderToAPI(agent.provider)
        const apiKey = getAPIKeyForProvider(agent.provider, settings)

        if (useAPI && apiProvider && apiKey) {
          options.onAgentOutput(
            agent.id,
            `[orchestrator] Using API mode for ${agent.provider} (${apiProvider})\n`,
          )

          const chatOutputs: string[] = new Array<string>(chatsPerAgent).fill('')
          let completedChats = 0
          let hasFailure = false

          for (let c = 0; c < chatsPerAgent; c++) {
            const chatIndex = c
            runAPIAgent({
              provider: apiProvider,
              prompt,
              apiKey,
              onOutput: (data: string) => {
                chatOutputs[chatIndex] += data
                options.onAgentOutput(agent.id, data)
              },
              onComplete: (fullOutput: string) => {
                completedChats++

                if (completedChats === chatsPerAgent) {
                  const merged =
                    chatsPerAgent === 1
                      ? chatOutputs[0]
                      : chatOutputs
                          .map(
                            (o, idx) =>
                              `--- chat ${idx + 1}/${chatsPerAgent} ---\n${o}`,
                          )
                          .join('\n\n')

                  agent.finishedAt = Date.now()
                  agent.exitCode = hasFailure ? 1 : 0
                  agent.output = merged
                  agent.status = hasFailure ? 'failed' : 'completed'
                  options.onAgentStatus(agent.id, agent.status, agent.exitCode)

                  if (agent.startedAt) {
                    const durationSec = (agent.finishedAt - agent.startedAt) / 1000
                    agentResponseTime.observe({ agent: agent.provider, stage: role }, durationSec)
                  }
                  if (hasFailure) {
                    agentFailuresTotal.inc({ provider: agent.provider, role })
                  }

                  if (!hasFailure && merged.length > 0) {
                    const conf = computeConfidence([merged])
                    setCachedOutput(prompt, agent.provider, merged, conf)
                  }

                  resolve(merged)
                }
              },
              onError: (error: string) => {
                options.onAgentOutput(agent.id, `[api-runner] Error: ${error}\n`)
                hasFailure = true
                completedChats++

                if (completedChats === chatsPerAgent) {
                  const merged =
                    chatsPerAgent === 1
                      ? chatOutputs[0]
                      : chatOutputs
                          .map(
                            (o, idx) =>
                              `--- chat ${idx + 1}/${chatsPerAgent} ---\n${o}`,
                          )
                          .join('\n\n')

                  agent.finishedAt = Date.now()
                  agent.exitCode = 1
                  agent.output = merged
                  agent.status = 'failed'
                  options.onAgentStatus(agent.id, 'failed', 1)
                  if (agent.startedAt) {
                    const durationSec = (agent.finishedAt - agent.startedAt) / 1000
                    agentResponseTime.observe({ agent: agent.provider, stage: role }, durationSec)
                  }
                  agentFailuresTotal.inc({ provider: agent.provider, role })
                  resolve(merged)
                }
              },
            }).catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err)
              options.onAgentOutput(
                agent.id,
                `[orchestrator] API call failed for ${agent.id}: ${message}\n`,
              )
            })
          }
        } else {
          const chatOutputs: string[] = new Array<string>(chatsPerAgent).fill('')
          let completedChats = 0
          let hasFailure = false

          for (let c = 0; c < chatsPerAgent; c++) {
            try {
              const chatIndex = c
              const handle = spawnCLI({
                provider: agent.provider,
                prompt,
                workdir,
                maxRuntimeMs: settings.maxRuntimeSeconds * 1000,
                customTemplate: settings.customCLICommand,
                env: {
                  OPENAI_API_KEY: settings.apiKeys?.openai ?? settings.apiKeys?.codex ?? settings.apiKeys?.cursor,
                  GOOGLE_API_KEY: settings.apiKeys?.google ?? settings.apiKeys?.gemini,
                  ANTHROPIC_API_KEY: settings.apiKeys?.anthropic ?? settings.apiKeys?.claude,
                  GITHUB_TOKEN: settings.apiKeys?.github ?? settings.apiKeys?.copilot,
                  CURSOR_API_KEY: settings.apiKeys?.cursor,
                },
                onOutput: (data: string) => {
                  chatOutputs[chatIndex] += data
                  options.onAgentOutput(agent.id, data)
                },
                onExit: (code: number) => {
                  if (code !== 0) hasFailure = true
                  completedChats++

                  const handleIdx = activeProcesses.indexOf(handle)
                  if (handleIdx >= 0) activeProcesses.splice(handleIdx, 1)

                  if (completedChats === chatsPerAgent) {
                    const merged =
                      chatsPerAgent === 1
                        ? chatOutputs[0]
                        : chatOutputs
                            .map(
                              (o, idx) =>
                                `--- chat ${idx + 1}/${chatsPerAgent} ---\n${o}`,
                            )
                            .join('\n\n')

                    agent.finishedAt = Date.now()
                    agent.exitCode = hasFailure ? 1 : 0
                    agent.output = merged
                    agent.status = hasFailure ? 'failed' : 'completed'
                    options.onAgentStatus(agent.id, agent.status, agent.exitCode)

                    if (agent.startedAt) {
                      const durationSec = (agent.finishedAt - agent.startedAt) / 1000
                      agentResponseTime.observe({ agent: agent.provider, stage: role }, durationSec)
                    }
                    if (hasFailure) {
                      agentFailuresTotal.inc({ provider: agent.provider, role })
                    }

                    if (!hasFailure && merged.length > 0) {
                      const conf = computeConfidence([merged])
                      setCachedOutput(prompt, agent.provider, merged, conf)
                    }

                    resolve(merged)
                  }
                },
              })

              activeProcesses.push(handle)
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err)
              options.onAgentOutput(
                agent.id,
                `[orchestrator] Spawn failed for ${agent.id} chat ${c + 1}: ${message}\n`,
              )
              hasFailure = true
              completedChats++

              if (completedChats === chatsPerAgent) {
                const merged =
                  chatsPerAgent === 1
                    ? chatOutputs[0]
                    : chatOutputs
                        .map(
                          (o, idx) =>
                            `--- chat ${idx + 1}/${chatsPerAgent} ---\n${o}`,
                        )
                        .join('\n\n')

                agent.finishedAt = Date.now()
                agent.exitCode = 1
                agent.output = merged
                agent.status = 'failed'
                options.onAgentStatus(agent.id, 'failed', 1)
                if (agent.startedAt) {
                  const durationSec = (agent.finishedAt - agent.startedAt) / 1000
                  agentResponseTime.observe({ agent: agent.provider, stage: role }, durationSec)
                }
                agentFailuresTotal.inc({ provider: agent.provider, role })
                resolve(merged)
              }
            }
          }
        }
      }, i * STAGGER_MS)
    })
  })

  const results = await Promise.allSettled(promises)
  let successOutputs = results
    .filter(
      (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
    )
    .map((r) => r.value)

  // Scan and mask secrets in agent outputs
  for (let i = 0; i < successOutputs.length; i++) {
    if (successOutputs[i].length > 0 && agents[i]) {
      const { maskedOutput, validation } = scanAndMaskAgentOutput(
        agents[i].id,
        successOutputs[i],
      )
      if (!validation.isValid) {
        options.onAgentOutput(
          'system',
          `[security] Masked ${validation.summary.totalSecrets} potential secret(s) in ${agents[i].id} output\n`,
        )
      }
      successOutputs[i] = maskedOutput
      agents[i].output = maskedOutput
    }
  }

  // Process MCP tool calls in agent outputs
  const processedOutputs: string[] = []
  for (let i = 0; i < successOutputs.length; i++) {
    const output = successOutputs[i]
    if (output.length > 0) {
      const processed = await processMCPToolCalls(
        output,
        settings,
        options.onAgentOutput,
        options.onMCPToolResult,
      )
      processedOutputs.push(processed)
      if (agents[i]) {
        agents[i].output = processed
      }
    } else {
      processedOutputs.push(output)
    }
  }
  successOutputs = processedOutputs

  if (useWorktrees) {
    for (const agent of agents) {
      try {
        cleanupWorktree(projectPath, agent.id)
      } catch (err) {
        logger.debug('Worktree cleanup failed (best-effort)', { error: err instanceof Error ? err.message : String(err), agentId: agent.id })
      }
    }
  }

  if (options.evidenceId) {
    for (const agent of agents) {
      if (agent.output) {
        await appendCliExcerpt(options.evidenceId, agent.id, agent.output)
      }
    }
  }

  // GAP-012: Validate agent outputs against role-specific schemas
  const validationResults = successOutputs.map((output) =>
    validateAgentOutput(role, output)
  )
  
  const invalidCount = validationResults.filter((r) => !r.isValid).length
  if (invalidCount > 0) {
    const summary = getValidationErrorSummary(validationResults)
    options.onAgentOutput(
      'system',
      `[orchestrator] Schema validation: ${invalidCount}/${validationResults.length} outputs invalid - ${summary}\n`,
    )
  }

  // GAP-015: Check confidence gate for this stage
  const confidenceGate = checkConfidenceGate(role, successOutputs, validationResults)
  
  if (!confidenceGate.passed) {
    options.onAgentOutput(
      'system',
      `[orchestrator] Confidence gate: ${role} stage at ${confidenceGate.confidence}% (threshold: ${confidenceGate.threshold}%)\n`,
    )
  }

  const completedCount = agents.filter(a => a.status === 'completed').length
  const failedCount = agents.filter(a => a.status === 'failed').length
  stageSpan.setAttributes({
    'swarm.completed_count': completedCount,
    'swarm.failed_count': failedCount,
    'swarm.confidence_gate_passed': confidenceGate.passed,
    'swarm.stage_confidence': confidenceGate.confidence,
  })

  if (failedCount > 0 && completedCount === 0) {
    setSpanError(stageSpan, `All ${count} agents failed`)
  } else {
    setSpanSuccess(stageSpan)
  }
  stageSpan.end()

  return { 
    outputs: successOutputs, 
    agents,
    validationResults,
    confidenceGate,
  }
}

/* ── Chat Mode ─────────────────────────────────────────────────── */

async function runChatMode(
  options: SwarmPipelineOptions,
): Promise<SwarmResult> {
  options.onAgentOutput('system', '[orchestrator] Running in CHAT mode\n')
  options.onAgentStatus('system', 'running')

  const chatSettings = { ...options.settings, chatsPerAgent: 1 }
  const { outputs, agents } = await runStage(
    'coder',
    1,
    options.prompt,
    chatSettings,
    options.projectPath,
    options,
    false,
  )

  options.onAgentStatus('system', 'completed', 0)

  if (options.evidenceId) {
    await appendDiffSummary(options.evidenceId, options.projectPath)
  }

  return {
    finalOutput: outputs[0] ?? 'No output received.',
    confidence: 50,
    agents,
    sources: extractSources(outputs[0] ?? ''),
    validationPassed: true,
  }
}

/* ── Swarm Mode (full 6-stage pipeline) ────────────────────────── */

async function runSwarmMode(
  options: SwarmPipelineOptions,
): Promise<SwarmResult> {
  const { prompt, settings, projectPath, onAgentOutput, onAgentStatus } =
    options
  const maxAttempts = 3
  const allAgents: AgentInstance[] = []
  const allOutputs: string[] = []
  let useWorktrees = false

  try {
    onAgentStatus('system', 'running')
    onAgentOutput(
      'system',
      `[orchestrator] Starting SWARM pipeline for: ${prompt.slice(0, 80)}...\n`,
    )

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      onAgentOutput(
        'system',
        `[orchestrator] Continuous mode: re-running full pipeline (attempt ${attempt}/${maxAttempts})\n`,
      )
    }

    /* ── Stage 1: RESEARCH ────────────────────────────────────── */
    if (cancelled) return buildCancelledResult(allAgents)
    onAgentOutput('system', '[orchestrator] Stage 1/6: RESEARCH\n')

    const researchCount: number = settings.parallelCounts.researcher ?? 1
    if (researchCount > 0) {
      const researchPrompt = buildResearchPrompt(
        prompt,
        settings.researchDepth,
      )
      const researchResult = await runStage(
        'researcher',
        researchCount,
        researchPrompt,
        settings,
        projectPath,
        options,
        false,
      )
      allAgents.push(...researchResult.agents)
      allOutputs.push(...researchResult.outputs)
    }
    const combinedResearch = allOutputs
      .filter((o) => o.length > 0)
      .join('\n\n')

    /* ── Stage 2: PLAN ────────────────────────────────────────── */
    if (cancelled) return buildCancelledResult(allAgents)
    onAgentOutput('system', '[orchestrator] Stage 2/6: PLAN\n')

    const planCount: number = settings.parallelCounts.planner ?? 2
    let bestPlan = ''
    if (planCount > 0) {
      const planPrompt = buildPlanPrompt(prompt, combinedResearch)
      const planResult = await runStage(
        'planner',
        planCount,
        planPrompt,
        settings,
        projectPath,
        options,
        false,
      )
      allAgents.push(...planResult.agents)
      allOutputs.push(...planResult.outputs)

      const planAgentOutputs = toAgentOutputs(planResult.outputs, planResult.agents)
      const planAnalysis = analyzeStageOutputs(planAgentOutputs, settings.autoRerunThreshold)
      onAgentOutput(
        'system',
        `[orchestrator] Plan confidence: ${planAnalysis.confidence}%\n`,
      )
      bestPlan = planAnalysis.bestOutput
    }

    /* ── Stage 3: CODE ────────────────────────────────────────── */
    if (cancelled) return buildCancelledResult(allAgents)
    onAgentOutput('system', '[orchestrator] Stage 3/6: CODE\n')

    const coderCount: number = settings.parallelCounts.coder ?? 3
    useWorktrees = settings.worktreeIsolation && isGitRepo(projectPath)
    const codeOutputs: string[] = []
    let codeStageAgents: AgentInstance[] = []

    if (coderCount > 0) {
      const mcpToolContext = buildMCPToolContext(settings.mcpServers ?? [])
      const codePrompt = buildCodePrompt(prompt, bestPlan, 0, coderCount, mcpToolContext || undefined)
      const codeResult = await runStage(
        'coder',
        coderCount,
        codePrompt,
        settings,
        projectPath,
        options,
        useWorktrees,
      )
      allAgents.push(...codeResult.agents)
      allOutputs.push(...codeResult.outputs)
      codeOutputs.push(...codeResult.outputs)
      codeStageAgents = codeResult.agents
    }
    const combinedCode = codeOutputs
      .filter((o) => o.length > 0)
      .join('\n\n')

    /* ── Code Validation (TypeScript + ESLint) ────────────────── */
    let codeValidationResult: CodeValidationResult | null = null
    const codeValidationConfig = settings.codeValidation
    if (codeValidationConfig?.enabled && !cancelled) {
      onAgentOutput('system', '[orchestrator] Running code validation (TypeScript + ESLint)...\n')
      try {
        codeValidationResult = await validateCode(projectPath)
        onAgentOutput(
          'system',
          `[orchestrator] Code validation score: ${codeValidationResult.score}/100\n`,
        )
        if (codeValidationResult.typeErrors.length > 0) {
          onAgentOutput(
            'system',
            `[orchestrator] TypeScript errors: ${codeValidationResult.typeErrors.length}\n`,
          )
          for (const err of codeValidationResult.typeErrors.slice(0, 5)) {
            onAgentOutput('system', `  ${err.file}:${err.line}:${err.column} - ${err.code}: ${err.message}\n`)
          }
          if (codeValidationResult.typeErrors.length > 5) {
            onAgentOutput('system', `  ... and ${codeValidationResult.typeErrors.length - 5} more\n`)
          }
        }
        if (codeValidationResult.lintErrors.length > 0) {
          const lintErrorCount = codeValidationResult.lintErrors.filter(e => e.severity === 'error').length
          const lintWarningCount = codeValidationResult.lintErrors.filter(e => e.severity === 'warning').length
          onAgentOutput(
            'system',
            `[orchestrator] Lint issues: ${lintErrorCount} errors, ${lintWarningCount} warnings\n`,
          )
          for (const err of codeValidationResult.lintErrors.filter(e => e.severity === 'error').slice(0, 5)) {
            onAgentOutput('system', `  ${err.file}:${err.line}:${err.column} - ${err.rule}: ${err.message}\n`)
          }
        }

        if (codeValidationConfig.blockOnErrors && !codeValidationResult.isValid) {
          const minScore = codeValidationConfig.minScore ?? 70
          if (codeValidationResult.score < minScore) {
            onAgentOutput(
              'system',
              `[orchestrator] Code validation failed (score ${codeValidationResult.score} < ${minScore}). Blocking acceptance.\n`,
            )
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        onAgentOutput('system', `[orchestrator] Code validation error: ${msg}\n`)
      }
    }

    /* ── Stage 4: VALIDATE ────────────────────────────────────── */
    if (cancelled) return buildCancelledResult(allAgents)
    onAgentOutput('system', '[orchestrator] Stage 4/6: VALIDATE\n')

    const validatorCount: number = settings.parallelCounts.validator ?? 2
    let validateOutputs: string[] = []
    if (validatorCount > 0) {
      const validatePrompt = buildValidatePrompt(
        prompt,
        codeOutputs.filter((o) => o.length > 0),
      )
      const validateResult = await runStage(
        'validator',
        validatorCount,
        validatePrompt,
        settings,
        projectPath,
        options,
        false,
      )
      allAgents.push(...validateResult.agents)
      allOutputs.push(...validateResult.outputs)
      validateOutputs = validateResult.outputs

      const validateAgentOutputs = toAgentOutputs(
        validateResult.outputs,
        validateResult.agents,
      )
      const validateAnalysis = analyzeStageOutputs(
        validateAgentOutputs,
        settings.autoRerunThreshold,
      )
      onAgentOutput(
        'system',
        `[orchestrator] Validation confidence: ${validateAnalysis.confidence}%\n`,
      )

      if (
        shouldRerunValidation(validateAnalysis, settings.autoRerunThreshold) &&
        !cancelled
      ) {
        onAgentOutput(
          'system',
          `[orchestrator] Re-running validation (confidence ${validateAnalysis.confidence}% < ${settings.autoRerunThreshold}% threshold)\n`,
        )
        const rerunResult = await runStage(
          'validator',
          validatorCount,
          validatePrompt,
          settings,
          projectPath,
          options,
          false,
        )
        for (const agent of rerunResult.agents) {
          agent.id = `${agent.id}-rerun`
          agent.label = `${agent.label} (rerun)`
        }
        allAgents.push(...rerunResult.agents)
        allOutputs.push(...rerunResult.outputs)
        validateOutputs = rerunResult.outputs

        const rerunConfidence = computeConfidence(
          rerunResult.outputs.filter((o) => o.length > 0),
        )
        onAgentOutput(
          'system',
          `[orchestrator] Re-run validation confidence: ${rerunConfidence}%\n`,
        )
      }
    }

    /* ── Stage 5: SECURITY ────────────────────────────────────── */
    if (cancelled) return buildCancelledResult(allAgents)
    onAgentOutput('system', '[orchestrator] Stage 5/6: SECURITY\n')

    let securityChecksPassed = true
    onAgentOutput(
      'system',
      '[orchestrator] Running automated security checks...\n',
    )
    try {
      const autoResult = await runSecurityChecks(projectPath, settings.testingConfig)
      securityChecksPassed = autoResult.passed
      for (const check of autoResult.checks) {
        const status = check.passed ? 'PASSED' : 'FAILED'
        onAgentOutput('system', `[security] ${check.name}: ${status}\n`)
        if (!check.passed) {
          onAgentOutput(
            'system',
            `[security] ${check.output.slice(0, 500)}\n`,
          )
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      onAgentOutput('system', `[security] Automated checks error: ${msg}\n`)
    }

    const securityCount: number = settings.parallelCounts.security ?? 1
    let combinedSecurity = ''
    if (securityCount > 0) {
      const securityPrompt = buildSecurityPrompt(
        prompt,
        codeOutputs.filter((o) => o.length > 0),
      )
      const securityResult = await runStage(
        'security',
        securityCount,
        securityPrompt,
        settings,
        projectPath,
        options,
        false,
      )
      allAgents.push(...securityResult.agents)
      allOutputs.push(...securityResult.outputs)
      combinedSecurity = securityResult.outputs
        .filter((o) => o.length > 0)
        .join('\n\n')
    }

    /* ── Stage 6: SYNTHESIZE ──────────────────────────────────── */
    if (cancelled) return buildCancelledResult(allAgents)
    onAgentOutput('system', '[orchestrator] Stage 6/6: SYNTHESIZE\n')

    const overallConfidence = computeConfidence(
      allOutputs.filter((o) => o.length > 0),
    )
    const synthesizePrompt = buildSynthesizePrompt(
      prompt,
      [
        combinedResearch,
        bestPlan,
        combinedCode,
        validateOutputs.filter((o) => o.length > 0).join('\n\n'),
        combinedSecurity,
      ].filter((s) => s.length > 0),
      overallConfidence,
    )

    const synthResult = await runStage(
      'synthesizer',
      1,
      synthesizePrompt,
      settings,
      projectPath,
      options,
      false,
    )
    allAgents.push(...synthResult.agents)
    allOutputs.push(...synthResult.outputs)
    const synthesizerOutput = synthResult.outputs
      .filter((o) => o.length > 0)
      .join('\n\n')

    /* ── Build final result ───────────────────────────────────── */
    const finalConfidence = computeConfidence(
      allOutputs.filter((o) => o.length > 0),
    )
    confidenceScore.observe({ stage: 'final' }, finalConfidence)
    const allOutputsJoined = allOutputs
      .filter((o) => o.length > 0)
      .join('\n')
    const sources = extractSources(allOutputsJoined)
    const threshold = settings.autoRerunThreshold

    onAgentOutput(
      'system',
      `[orchestrator] Pipeline complete. Confidence: ${finalConfidence}%\n`,
    )

    if (
      settings.continuousMode &&
      finalConfidence < threshold &&
      attempt < maxAttempts
    ) {
      onAgentOutput(
        'system',
        `[orchestrator] Continuous mode: confidence ${finalConfidence}% < ${threshold}%, re-running full pipeline (attempt ${attempt}/${maxAttempts})\n`,
      )
      continue
    }

    onAgentStatus('system', 'completed', 0)
    if (options.evidenceId) {
      await appendDiffSummary(options.evidenceId, projectPath)
    }

    /* T3.2: Use selectBestOutput for synthesis fallback when synthesizer empty */
    const bestCodeOutput = selectBestOutput(codeOutputs, codeStageAgents)

    const codeValidationPassed = !codeValidationConfig?.blockOnErrors ||
      !codeValidationResult ||
      codeValidationResult.isValid ||
      codeValidationResult.score >= (codeValidationConfig.minScore ?? 70)

    return {
      finalOutput:
        synthesizerOutput || bestCodeOutput || combinedCode || 'No output generated.',
      confidence: finalConfidence,
      agents: allAgents,
      sources,
      validationPassed:
        securityChecksPassed && codeValidationPassed && finalConfidence >= threshold,
    }
  } // end for loop

  onAgentStatus('system', 'completed', 0)
  if (options.evidenceId) {
    await appendDiffSummary(options.evidenceId, projectPath)
  }
  onAgentOutput(
    'system',
    `[orchestrator] Continuous mode: max attempts (${maxAttempts}) reached\n`,
  )

  const fallbackConfidence = computeConfidence(
    allOutputs.filter((o) => o.length > 0),
  )
  return {
    finalOutput: allOutputs.filter((o) => o.length > 0).pop() || 'No output generated.',
    confidence: fallbackConfidence,
    agents: allAgents,
    sources: extractSources(allOutputs.filter((o) => o.length > 0).join('\n')),
    validationPassed: fallbackConfidence >= settings.autoRerunThreshold,
  }

  } catch (err: unknown) {
    const swarmError = wrapError(err, { stage: 'swarm-pipeline' })
    const message = swarmError.message
    
    onAgentOutput('system', `[orchestrator] Pipeline error: ${message}\n`)
    onAgentOutput('system', `[orchestrator] Error code: ${swarmError.code}, Category: ${swarmError.category}\n`)
    
    if (swarmError.recoverable) {
      onAgentOutput('system', `[orchestrator] This error is recoverable. ${swarmError.recovery?.message ?? ''}\n`)
    }
    if (swarmError.retryable) {
      onAgentOutput('system', `[orchestrator] This error is retryable.\n`)
    }
    
    onAgentStatus('system', 'failed', 1)

    return {
      finalOutput: `Pipeline failed: ${message}`,
      confidence: 0,
      agents: allAgents,
      sources: [],
      validationPassed: false,
    }
  } finally {
    if (useWorktrees) {
      try {
        cleanupAllWorktrees(projectPath)
      } catch (err) {
        logger.debug('cleanupAllWorktrees failed in swarm mode (best-effort)', { error: err instanceof Error ? err.message : String(err), projectPath })
      }
    }
  }
}

/* ── GitHub integration on ticket approval ─────────────────────── */

async function handleTicketApproval(
  ticket: Ticket,
  settings: Settings,
  projectPath: string,
  onAgentOutput: (agentId: string, data: string) => void,
): Promise<void> {
  const ghConfig = settings.githubConfig
  if (!ghConfig?.enabled || !ghConfig.autoCreatePR) return

  const authenticated = await isGitHubAuthenticated()
  if (!authenticated) {
    onAgentOutput('system', '[github] GitHub CLI not authenticated — skipping PR creation\n')
    return
  }

  const branchName = `${ghConfig.branchPrefix || 'swarm/'}${ticket.id}`
  try {
    await createBranch(branchName, ghConfig.baseBranch || 'main')
    onAgentOutput('system', `[github] Created branch ${branchName}\n`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    onAgentOutput('system', `[github] Branch creation failed: ${msg}\n`)
    return
  }

  try {
    await commitChanges(`feat: ${ticket.title}`, ['.'])
    onAgentOutput('system', `[github] Committed changes for ticket ${ticket.id}\n`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    onAgentOutput('system', `[github] Commit failed: ${msg}\n`)
    return
  }

  try {
    const prUrl = await createPullRequest(
      ticket.title,
      ticket.description,
      ghConfig.baseBranch || 'main',
    )
    onAgentOutput('system', `[github] PR created: ${prUrl}\n`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    onAgentOutput('system', `[github] PR creation failed: ${msg}\n`)
  }
}

/* ── Project Mode (MVP — plan then execute sequentially) ───────── */

async function runProjectMode(
  options: SwarmPipelineOptions,
): Promise<SwarmResult> {
  const { prompt, settings, projectPath, onAgentOutput, onAgentStatus } =
    options
  const allAgents: AgentInstance[] = []
  const allOutputs: string[] = []
  const ticketManager = new TicketManager()

  try {
    onAgentStatus('system', 'running')
    onAgentOutput('system', '[orchestrator] Running in PROJECT mode\n')

    /* ── Phase 1: Generate structured plan ────────────────────── */
    onAgentOutput(
      'system',
      '[orchestrator] Phase 1: Generating project breakdown...\n',
    )
    const planPrompt = buildPlanPrompt(prompt, '')
    const planResult = await runStage(
      'planner',
      1,
      planPrompt,
      settings,
      projectPath,
      options,
      false,
    )
    allAgents.push(...planResult.agents)
    const plan = selectBestOutput(planResult.outputs, planResult.agents)
    allOutputs.push(plan)

    /* ── Phase 2: Decompose into tickets ──────────────────────── */
    if (cancelled) return buildCancelledResult(allAgents)
    onAgentOutput(
      'system',
      '[orchestrator] Phase 2: Decomposing into tickets...\n',
    )
    const tickets = ticketManager.decomposeTask(prompt, settings)
    const coderTickets = tickets.filter((t) => t.assignedRole === 'coder')
    onAgentOutput(
      'system',
      `[orchestrator] Created ${tickets.length} tickets (${coderTickets.length} coder tasks)\n`,
    )

    /* ── Phase 3: Execute coder tickets sequentially ──────────── */
    onAgentOutput(
      'system',
      '[orchestrator] Phase 3: Executing tickets sequentially...\n',
    )
    const useWorktrees = settings.worktreeIsolation && isGitRepo(projectPath)

    for (let i = 0; i < coderTickets.length; i++) {
      if (cancelled) break
      const ticket = coderTickets[i]
      ticketManager.updateTicket(ticket.id, { status: 'in_progress' })
      onAgentOutput(
        'system',
        `[orchestrator] Ticket ${i + 1}/${coderTickets.length}: ${ticket.title}\n`,
      )

      const mcpToolContextProject = buildMCPToolContext(settings.mcpServers ?? [])
      const codePrompt = buildCodePrompt(
        prompt,
        plan,
        i,
        coderTickets.length,
        mcpToolContextProject || undefined,
      )
      const result = await runStage(
        'coder',
        1,
        codePrompt,
        settings,
        projectPath,
        options,
        useWorktrees,
      )

      for (const agent of result.agents) {
        agent.id = `coder-ticket-${i + 1}`
        agent.label = `${ROLE_LABELS.coder} (Ticket ${i + 1})`
      }
      allAgents.push(...result.agents)

      const output = result.outputs[0] ?? ''
      allOutputs.push(output)

      if (output.length > 0) {
        ticketManager.completeTicket(ticket.id, output)
        if (options.evidenceId) {
          await linkTicketToEvidence(options.evidenceId, ticket.id)
          ticketManager.updateTicket(ticket.id, {
            evidenceIds: [...(ticket.evidenceIds ?? []), options.evidenceId],
          })
        }
        if (settings.githubConfig?.enabled) {
          const completedTicket = ticketManager.getTicket(ticket.id)
          if (completedTicket) {
            await handleTicketApproval(completedTicket, settings, projectPath, onAgentOutput)
          }
        }
      } else {
        if (options.evidenceId) {
          await linkTicketToEvidence(options.evidenceId, ticket.id)
          ticketManager.updateTicket(ticket.id, {
            evidenceIds: [...(ticket.evidenceIds ?? []), options.evidenceId],
          })
        }
        ticketManager.failTicket(ticket.id, 'No output produced')
        const updatedTicket = ticketManager.getTicket(ticket.id)
        if (updatedTicket && (updatedTicket.retryCount ?? 0) >= 3) {
          const logs = allOutputs.filter((o) => o?.length).join('\n\n') || 'No logs'
          const reproSteps = `Prompt: ${prompt.slice(0, 500)}\nTicket: ${ticket.title}\n${ticket.description?.slice(0, 300) ?? ''}`
          ticketManager.createEscalationTicket(updatedTicket, logs, reproSteps)
        }
      }
    }

    /* ── Phase 4: Validate combined output ────────────────────── */
    if (!cancelled) {
      onAgentOutput(
        'system',
        '[orchestrator] Phase 4: Validating results...\n',
      )
      const validatePrompt = buildValidatePrompt(
        prompt,
        allOutputs.filter((o) => o.length > 0),
      )
      const validateResult = await runStage(
        'validator',
        1,
        validatePrompt,
        settings,
        projectPath,
        options,
        false,
      )
      allAgents.push(...validateResult.agents)
      allOutputs.push(...validateResult.outputs)
    }

    /* ── Phase 5: Security checks ─────────────────────────────── */
    let securityPassed = true
    if (!cancelled) {
      onAgentOutput(
        'system',
        '[orchestrator] Phase 5: Running security checks...\n',
      )
      try {
        const secResult = await runSecurityChecks(projectPath, settings.testingConfig)
        securityPassed = secResult.passed
        for (const check of secResult.checks) {
          const status = check.passed ? 'PASSED' : 'FAILED'
          onAgentOutput('system', `[security] ${check.name}: ${status}\n`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        onAgentOutput('system', `[security] Error: ${msg}\n`)
      }
    }

    /* ── Build final result ───────────────────────────────────── */
    const confidence = computeConfidence(
      allOutputs.filter((o) => o.length > 0),
    )
    const allJoined = allOutputs.filter((o) => o.length > 0).join('\n')

    onAgentStatus('system', 'completed', 0)
    if (options.evidenceId) {
      await appendDiffSummary(options.evidenceId, projectPath)
    }
    onAgentOutput(
      'system',
      `[orchestrator] Project complete. Confidence: ${confidence}%\n`,
    )

    return {
      finalOutput: selectBestOutput(allOutputs) || 'No output generated.',
      confidence,
      agents: allAgents,
      sources: extractSources(allJoined),
      validationPassed:
        securityPassed && confidence >= settings.autoRerunThreshold,
    }
  } catch (err: unknown) {
    const swarmError = wrapError(err, { stage: 'project-pipeline' })
    const message = swarmError.message
    
    onAgentOutput('system', `[orchestrator] Project error: ${message}\n`)
    onAgentOutput('system', `[orchestrator] Error code: ${swarmError.code}, Category: ${swarmError.category}\n`)
    
    if (swarmError.recoverable) {
      onAgentOutput('system', `[orchestrator] This error is recoverable. ${swarmError.recovery?.message ?? ''}\n`)
    }
    
    onAgentStatus('system', 'failed', 1)

    return {
      finalOutput: `Project failed: ${message}`,
      confidence: 0,
      agents: allAgents,
      sources: [],
      validationPassed: false,
    }
  } finally {
    if (settings.worktreeIsolation) {
      try {
        cleanupAllWorktrees(projectPath)
      } catch (err) {
        logger.debug('cleanupAllWorktrees failed in project mode (best-effort)', { error: err instanceof Error ? err.message : String(err), projectPath })
      }
    }
  }
}

/* ── Main entry point ──────────────────────────────────────────── */

export async function runSwarmPipeline(
  options: SwarmPipelineOptions,
): Promise<SwarmResult> {
  return withSpan(
    'swarm.pipeline',
    async (pipelineSpan) => {
      cancelled = false
      activeProcesses.length = 0
      const effectivePrompt = applyIntentToPrompt(options.prompt, options.intent)
      const effectiveOptions: SwarmPipelineOptions = { ...options, prompt: effectivePrompt }

      const resolvedCLIs = await resolveAvailableCLIs(
        effectiveOptions.settings.enabledCLIs.length > 0
          ? effectiveOptions.settings.enabledCLIs
          : ['cursor'],
        effectiveOptions.settings,
        effectiveOptions.agentSelectionMode,
        effectiveOptions.preferredAgent,
      )
      effectiveOptions.settings = { ...effectiveOptions.settings, enabledCLIs: resolvedCLIs }
      effectiveOptions.onAgentOutput(
        'system',
        `[orchestrator] Resolved CLIs: ${resolvedCLIs.join(', ')}\n`,
      )
      if (resolvedCLIs.length === 1) {
        effectiveOptions.onAgentOutput(
          'system',
          '[orchestrator] Degraded mode: only one real provider available.\n',
        )
      }
      if (effectiveOptions.settings.freeOnlyMode) {
        effectiveOptions.onAgentOutput(
          'system',
          '[orchestrator] Free-only mode enabled; paid-only providers excluded.\n',
        )
      }

      const mode = effectiveOptions.mode ?? detectMode(options.prompt)
      effectiveOptions.onAgentOutput('system', `[orchestrator] Mode: ${mode}\n`)

      pipelineSpan.setAttributes({
        'swarm.mode': mode,
        'swarm.intent': options.intent ?? 'auto',
        'swarm.enabled_clis': resolvedCLIs.join(','),
        'swarm.project_path': effectiveOptions.projectPath,
        'swarm.prompt_length': options.prompt.length,
      })

      addSpanEvent('pipeline.started', { mode })

      effectiveOptions.evidenceId = await createPipelineEvidence(effectiveOptions.projectPath)

      const pipelineTimeoutMs = Math.max(
        15_000,
        Math.min(120_000, (effectiveOptions.settings.maxRuntimeSeconds ?? 120) * 1000 + 10_000),
      )
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new TimeoutError(
              `Pipeline timed out after ${pipelineTimeoutMs}ms (mode=${mode})`,
              {
                timeoutMs: pipelineTimeoutMs,
                operation: `pipeline:${mode}`,
              },
            ),
          )
        }, pipelineTimeoutMs)
      })

      const runByMode = async (): Promise<SwarmResult> => {
        switch (mode) {
          case 'chat':
            return await runChatMode(effectiveOptions)
          case 'swarm':
            return await runSwarmMode(effectiveOptions)
          case 'project':
            return await runProjectMode(effectiveOptions)
        }
      }

      let result: SwarmResult
      try {
        result = await Promise.race([runByMode(), timeoutPromise])
      } catch (error) {
        if (error instanceof TimeoutError) {
          cancelSwarm()
          effectiveOptions.onAgentOutput('system', `[orchestrator] ${error.message}\n`)
        }
        throw error
      }

        result = await enforceEvidenceGuardrails(
          result,
          effectiveOptions.evidenceId,
          effectiveOptions.onAgentOutput,
        )

        pipelineSpan.setAttributes({
          'swarm.confidence': result.confidence,
          'swarm.validation_passed': result.validationPassed,
        'swarm.agent_count': result.agents.length,
        'swarm.sources_count': result.sources.length,
      })

      addSpanEvent('pipeline.completed', {
        confidence: result.confidence,
        validation_passed: result.validationPassed,
      })

      lastPipelineRunTime = Date.now()
      return result
    },
    {
      attributes: {
        'swarm.service': 'orchestrator',
      },
    },
  )
}
