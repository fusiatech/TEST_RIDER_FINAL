/**
 * Scheduled pipeline runner - uses pipeline-engine.runPipeline for deterministic
 * execution. Used by JobQueue when processing scheduler-originated jobs.
 * T2.1: Wire pipeline-engine for scheduler/background jobs.
 */
import { writeFileSync, chmodSync } from 'node:fs'
import type {
  Settings,
  SwarmResult,
  AgentRole,
  AgentInstance,
  CLIProvider,
} from '@/lib/types'
import { ROLE_LABELS } from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { detectInstalledCLIs } from '@/server/cli-detect'
import { computeConfidence, extractSources } from '@/server/confidence'
import { runSecurityChecks } from '@/server/security-checks'
import { TicketManager } from '@/server/ticket-manager'
import {
  evaluateGuardrailPolicy,
  formatRefusalPayload,
  createGuardrailEscalation,
} from '@/server/guardrail-policy'
import {
  buildResearchPrompt,
  buildPlanPrompt,
  buildCodePrompt,
  buildValidatePrompt,
  buildSecurityPrompt,
  buildSynthesizePrompt,
} from '@/server/prompt-builder'
import {
  runStage,
  resetCancellation,
  isCancelled,
  STAGE_NAMES,
  type StageConfig,
  type AgentSpec,
  type StageResult,
  type PipelineCallbacks,
} from '@/server/pipeline-engine'

export interface ScheduledPipelineOptions {
  prompt: string
  settings: Settings
  projectPath: string
  mode: 'chat' | 'swarm' | 'project'
  onAgentOutput: (agentId: string, data: string) => void
  onAgentStatus: (agentId: string, status: string, exitCode?: number) => void
}

const MOCK_AGENT_PATH = '/tmp/mock-agent.sh'

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

async function resolveAvailableCLIs(
  enabledCLIs: CLIProvider[],
): Promise<CLIProvider[]> {
  const detected = await detectInstalledCLIs()
  const installedIds = new Set(
    detected.filter((c) => c.installed).map((c) => c.id),
  )
  const available = enabledCLIs.filter((id) => installedIds.has(id))
  if (available.length > 0) return available
  ensureMockAgent()
  const cursorEntry = CLI_REGISTRY.find((c) => c.id === 'cursor')
  if (cursorEntry) {
    cursorEntry.command = MOCK_AGENT_PATH
    cursorEntry.args = []
  }
  return ['cursor']
}

function getProvider(enabledCLIs: CLIProvider[], index: number): CLIProvider {
  if (enabledCLIs.length === 0) return 'cursor'
  return enabledCLIs[index % enabledCLIs.length]
}

function selectBestOutput(outputs: string[]): string {
  const nonEmpty = outputs.filter((o) => o.length > 0)
  if (nonEmpty.length === 0) return ''
  if (nonEmpty.length === 1) return nonEmpty[0]
  return nonEmpty.reduce((a, b) => (a.length >= b.length ? a : b))
}

/** T2.2: Stage names aligned with pipeline-engine STAGE_NAMES */
const STAGE_IDS: Record<AgentRole, string> = {
  researcher: STAGE_NAMES[0],
  planner: STAGE_NAMES[1],
  coder: STAGE_NAMES[2],
  validator: STAGE_NAMES[3],
  security: STAGE_NAMES[4],
  synthesizer: STAGE_NAMES[5],
}

function buildAgentSpecs(
  role: AgentRole,
  count: number,
  prompt: string | string[],
  enabledCLIs: CLIProvider[],
): AgentSpec[] {
  const prompts = Array.isArray(prompt) ? prompt : Array(count).fill(prompt)
  const stageId = STAGE_IDS[role] ?? role
  const specs: AgentSpec[] = []
  for (let i = 0; i < count; i++) {
    specs.push({
      id: `${stageId}-${i + 1}`,
      role,
      label: `${ROLE_LABELS[role]} #${i + 1}`,
      provider: getProvider(enabledCLIs, i),
      prompt: prompts[i] ?? prompts[0] ?? '',
    })
  }
  return specs
}

function stageResultToAgentInstances(
  stageResult: StageResult,
): AgentInstance[] {
  return stageResult.agents.map((a) => ({
    id: a.agentId,
    role: a.role,
    label: `${ROLE_LABELS[a.role]}`,
    provider: a.provider,
    status: a.exitCode === 0 ? 'completed' : 'failed',
    output: a.output,
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
    exitCode: a.exitCode,
  }))
}

function applyScheduledGuardrail(params: {
  mode: 'chat' | 'swarm' | 'project'
  prompt: string
  settings: Settings
  confidence: number
  sources: string[]
  candidateOutput: string
  upstreamValidationPassed: boolean
  agents: AgentInstance[]
  onAgentOutput: (agentId: string, data: string) => void
}): SwarmResult {
  const policy = evaluateGuardrailPolicy({
    minConfidence: params.settings.autoRerunThreshold,
    minEvidenceCount: 1,
    confidence: params.confidence,
    evidence: params.sources,
    candidateOutput: params.candidateOutput,
    upstreamValidationPassed: params.upstreamValidationPassed,
    context: {
      pipeline: 'scheduled',
      mode: params.mode,
      promptSnippet: params.prompt.slice(0, 200),
    },
  })

  if (policy.passed || !policy.refusalPayload) {
    return {
      finalOutput: params.candidateOutput,
      confidence: params.confidence,
      agents: params.agents,
      sources: params.sources,
      validationPassed: true,
    }
  }

  const refusal = formatRefusalPayload(policy.refusalPayload)
  const escalation = createGuardrailEscalation(
    new TicketManager(),
    refusal,
    policy.refusalPayload.context,
  )
  params.onAgentOutput(
    'system',
    `[scheduled-pipeline] Guardrail refusal. Escalation: ${escalation.id}
${refusal}
`,
  )

  return {
    finalOutput: refusal,
    confidence: params.confidence,
    agents: params.agents,
    sources: params.sources,
    validationPassed: false,
  }
}

/**
 * Run pipeline using pipeline-engine for scheduled/background jobs.
 * Supports chat (1 stage) and swarm (6 stages) modes.
 */
export async function runScheduledPipeline(
  options: ScheduledPipelineOptions,
): Promise<SwarmResult> {
  const { prompt, settings, projectPath, mode, onAgentOutput, onAgentStatus } =
    options

  resetCancellation()

  const resolvedCLIs = await resolveAvailableCLIs(
    settings.enabledCLIs.length > 0 ? settings.enabledCLIs : ['cursor'],
  )
  const enabledCLIs = resolvedCLIs

  const callbacks: PipelineCallbacks = {
    onAgentOutput,
    onAgentStatus: (id, status, exitCode) =>
      onAgentStatus(id, status, exitCode),
  }

  const allAgents: AgentInstance[] = []
  const allOutputs: string[] = []

  if (mode === 'chat') {
    onAgentOutput('system', '[scheduled-pipeline] Running in CHAT mode\n')
    const config: StageConfig = {
      name: 'coder',
      role: 'coder',
      agents: buildAgentSpecs(
        'coder',
        1,
        prompt,
        enabledCLIs,
      ),
    }
    const result = await runStage(config, settings, callbacks)
    allAgents.push(...stageResultToAgentInstances(result))
    allOutputs.push(result.combinedOutput)

    return applyScheduledGuardrail({
      mode: 'chat',
      prompt,
      settings,
      confidence: 50,
      sources: extractSources(result.combinedOutput),
      candidateOutput: result.combinedOutput || 'No output received.',
      upstreamValidationPassed: true,
      agents: allAgents,
      onAgentOutput,
    })
  }

  if (mode === 'swarm') {
    onAgentOutput('system', '[scheduled-pipeline] Running in SWARM mode\n')

    /* Stage 1: RESEARCH */
    if (isCancelled()) {
      return {
        finalOutput: 'Pipeline cancelled.',
        confidence: 0,
        agents: allAgents,
        sources: [],
        validationPassed: false,
      }
    }
    const researchCount = settings.parallelCounts.researcher ?? 1
    const researchPrompt = buildResearchPrompt(prompt, settings.researchDepth)
    const researchConfig: StageConfig = {
      name: 'research',
      role: 'researcher',
      agents: buildAgentSpecs(
        'researcher',
        researchCount,
        researchPrompt,
        enabledCLIs,
      ),
    }
    const researchResult = await runStage(researchConfig, settings, callbacks)
    allAgents.push(...stageResultToAgentInstances(researchResult))
    const combinedResearch = researchResult.combinedOutput
    allOutputs.push(combinedResearch)

    /* Stage 2: PLAN */
    if (isCancelled()) {
      return {
        finalOutput: 'Pipeline cancelled.',
        confidence: 0,
        agents: allAgents,
        sources: [],
        validationPassed: false,
      }
    }
    const planCount = settings.parallelCounts.planner ?? 2
    const planPrompt = buildPlanPrompt(prompt, combinedResearch)
    const planConfig: StageConfig = {
      name: 'plan',
      role: 'planner',
      agents: buildAgentSpecs('planner', planCount, planPrompt, enabledCLIs),
    }
    const planResult = await runStage(planConfig, settings, callbacks)
    allAgents.push(...stageResultToAgentInstances(planResult))
    const bestPlan = selectBestOutput(
      planResult.agents.map((a) => a.output).filter((o) => o.length > 0),
    )
    allOutputs.push(...planResult.agents.map((a) => a.output))

    /* Stage 3: CODE */
    if (isCancelled()) {
      return {
        finalOutput: 'Pipeline cancelled.',
        confidence: 0,
        agents: allAgents,
        sources: [],
        validationPassed: false,
      }
    }
    const coderCount = settings.parallelCounts.coder ?? 3
    const codePrompts = Array.from({ length: coderCount }, (_, i) =>
      buildCodePrompt(prompt, bestPlan, i, coderCount),
    )
    const codeConfig: StageConfig = {
      name: 'code',
      role: 'coder',
      agents: buildAgentSpecs('coder', coderCount, codePrompts, enabledCLIs),
    }
    const codeResult = await runStage(codeConfig, settings, callbacks)
    allAgents.push(...stageResultToAgentInstances(codeResult))
    const codeOutputs = codeResult.agents.map((a) => a.output)
    allOutputs.push(...codeOutputs)
    const combinedCode = codeOutputs.filter((o) => o.length > 0).join('\n\n')

    /* Stage 4: VALIDATE */
    if (isCancelled()) {
      return {
        finalOutput: 'Pipeline cancelled.',
        confidence: 0,
        agents: allAgents,
        sources: [],
        validationPassed: false,
      }
    }
    const validatorCount = settings.parallelCounts.validator ?? 2
    const validatePrompt = buildValidatePrompt(
      prompt,
      codeOutputs.filter((o) => o.length > 0),
    )
    const validateConfig: StageConfig = {
      name: 'validate',
      role: 'validator',
      agents: buildAgentSpecs(
        'validator',
        validatorCount,
        validatePrompt,
        enabledCLIs,
      ),
    }
    const validateResult = await runStage(validateConfig, settings, callbacks)
    allAgents.push(...stageResultToAgentInstances(validateResult))
    const validateOutputs = validateResult.agents.map((a) => a.output)
    allOutputs.push(...validateOutputs)

    /* Stage 5: SECURITY */
    if (isCancelled()) {
      return {
        finalOutput: 'Pipeline cancelled.',
        confidence: 0,
        agents: allAgents,
        sources: [],
        validationPassed: false,
      }
    }
    let securityChecksPassed = true
    try {
      const autoResult = await runSecurityChecks(projectPath)
      securityChecksPassed = autoResult.passed
      for (const check of autoResult.checks) {
        const status = check.passed ? 'PASSED' : 'FAILED'
        onAgentOutput('system', `[security] ${check.name}: ${status}\n`)
      }
    } catch {
      // ignore
    }

    const securityCount = settings.parallelCounts.security ?? 1
    const securityPrompt = buildSecurityPrompt(
      prompt,
      codeOutputs.filter((o) => o.length > 0),
    )
    const securityConfig: StageConfig = {
      name: 'security',
      role: 'security',
      agents: buildAgentSpecs(
        'security',
        securityCount,
        securityPrompt,
        enabledCLIs,
      ),
    }
    const securityResult = await runStage(securityConfig, settings, callbacks)
    allAgents.push(...stageResultToAgentInstances(securityResult))
    const combinedSecurity = securityResult.combinedOutput
    allOutputs.push(combinedSecurity)

    /* Stage 6: SYNTHESIZE */
    if (isCancelled()) {
      return {
        finalOutput: 'Pipeline cancelled.',
        confidence: 0,
        agents: allAgents,
        sources: [],
        validationPassed: false,
      }
    }
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
    const synthConfig: StageConfig = {
      name: 'synthesize',
      role: 'synthesizer',
      agents: buildAgentSpecs(
        'synthesizer',
        1,
        synthesizePrompt,
        enabledCLIs,
      ),
    }
    const synthResult = await runStage(synthConfig, settings, callbacks)
    allAgents.push(...stageResultToAgentInstances(synthResult))
    const synthesizerOutput = synthResult.combinedOutput

    const finalConfidence = computeConfidence(
      allOutputs.filter((o) => o.length > 0),
    )
    const allOutputsJoined = allOutputs
      .filter((o) => o.length > 0)
      .join('\n')
    const sources = extractSources(allOutputsJoined)
    const threshold = settings.autoRerunThreshold

    return applyScheduledGuardrail({
      mode: 'swarm',
      prompt,
      settings,
      confidence: finalConfidence,
      sources,
      candidateOutput:
        synthesizerOutput || combinedCode || 'No output generated.',
      upstreamValidationPassed:
        securityChecksPassed && finalConfidence >= threshold,
      agents: allAgents,
      onAgentOutput,
    })
  }

  /* Project mode: fallback to simple swarm-like flow */
  onAgentOutput('system', '[scheduled-pipeline] PROJECT mode: using swarm flow\n')
  return runScheduledPipeline({
    ...options,
    mode: 'swarm',
  })
}
