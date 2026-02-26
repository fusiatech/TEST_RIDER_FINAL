import type { AgentRole, AgentStatus, Settings, CLIProvider } from '@/lib/types'
import { spawnCLI } from '@/server/cli-runner'
import type { CLIRunnerHandle } from '@/server/cli-runner'

/* ── T2.2: Canonical stage names aligned with orchestrator roles ───────── */

/** Stage names matching orchestrator pipeline: research, plan, code, validate, security, synthesize */
export const STAGE_NAMES = [
  'research',
  'plan',
  'code',
  'validate',
  'security',
  'synthesize',
] as const
export type StageName = (typeof STAGE_NAMES)[number]

/** Map stage name to AgentRole for alignment with orchestrator */
export const STAGE_TO_ROLE: Record<StageName, AgentRole> = {
  research: 'researcher',
  plan: 'planner',
  code: 'coder',
  validate: 'validator',
  security: 'security',
  synthesize: 'synthesizer',
}

/* ── Types ────────────────────────────────────────────────────────── */

/** A single agent to be spawned within a stage */
export interface AgentSpec {
  id: string
  role: AgentRole
  label: string
  provider: CLIProvider
  prompt: string
  workdir?: string
}

/** Configuration for a pipeline stage. name should match STAGE_NAMES; role should match STAGE_TO_ROLE[name]. */
export interface StageConfig {
  /** Canonical stage name: research | plan | code | validate | security | synthesize */
  name: StageName | string
  role: AgentRole
  agents: AgentSpec[]
}

/** Callbacks the pipeline emits events through */
export interface PipelineCallbacks {
  onAgentOutput: (agentId: string, data: string) => void
  onAgentStatus: (agentId: string, status: AgentStatus, exitCode?: number) => void
}

/** Result from running a single agent */
export interface AgentResult {
  agentId: string
  role: AgentRole
  provider: CLIProvider
  output: string
  exitCode: number
  startedAt: number
  finishedAt: number
}

/** Result from running an entire stage */
export interface StageResult {
  stageName: string
  agents: AgentResult[]
  combinedOutput: string
}

/* ── Cancellation state ───────────────────────────────────────────── */

const activeHandles = new Map<string, CLIRunnerHandle>()
let cancelled = false

export function cancelAll(): void {
  cancelled = true
  for (const [, handle] of activeHandles) {
    try {
      handle.kill()
    } catch {
      // Process may have already exited
    }
  }
  activeHandles.clear()
}

export function isCancelled(): boolean {
  return cancelled
}

export function resetCancellation(): void {
  cancelled = false
  activeHandles.clear()
}

/* ── Core functions ───────────────────────────────────────────────── */

/**
 * Run a single agent by spawning its CLI process and collecting output.
 */
export function runAgent(
  spec: AgentSpec,
  settings: Settings,
  callbacks: PipelineCallbacks
): Promise<AgentResult> {
  return new Promise<AgentResult>((resolve, reject) => {
    try {
      const startedAt = Date.now()
      let output = ''

      callbacks.onAgentStatus(spec.id, 'spawning')

      setTimeout(() => {
        try {
          if (cancelled) {
            callbacks.onAgentStatus(spec.id, 'cancelled')
            resolve({
              agentId: spec.id,
              role: spec.role,
              provider: spec.provider,
              output: '',
              exitCode: -1,
              startedAt,
              finishedAt: Date.now()
            })
            return
          }

          callbacks.onAgentStatus(spec.id, 'running')

          const handle = spawnCLI({
            provider: spec.provider,
            prompt: spec.prompt,
            workdir: spec.workdir,
            maxRuntimeMs: settings.maxRuntimeSeconds * 1000,
            onOutput: (data: string) => {
              try {
                output += data
                callbacks.onAgentOutput(spec.id, data)
              } catch {
                // Swallow callback errors
              }
            },
            onExit: (code: number) => {
              try {
                activeHandles.delete(spec.id)
                const finishedAt = Date.now()
                const status: AgentStatus = code === 0 ? 'completed' : 'failed'
                callbacks.onAgentStatus(spec.id, status, code)

                resolve({
                  agentId: spec.id,
                  role: spec.role,
                  provider: spec.provider,
                  output,
                  exitCode: code,
                  startedAt,
                  finishedAt
                })
              } catch (err) {
                reject(err)
              }
            },
            customTemplate: settings.customCLICommand
          })

          activeHandles.set(spec.id, handle)
        } catch {
          callbacks.onAgentStatus(spec.id, 'failed')
          resolve({
            agentId: spec.id,
            role: spec.role,
            provider: spec.provider,
            output: '',
            exitCode: 1,
            startedAt,
            finishedAt: Date.now()
          })
        }
      }, 50)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Run all agents in a stage with staggered parallel starts.
 */
export async function runStage(
  config: StageConfig,
  settings: Settings,
  callbacks: PipelineCallbacks,
  staggerDelayMs: number = 200
): Promise<StageResult> {
  try {
    const promises = config.agents.map((spec, index) =>
      new Promise<AgentResult>((resolve) => {
        setTimeout(() => {
          runAgent(spec, settings, callbacks).then(resolve).catch(() => {
            resolve({
              agentId: spec.id,
              role: spec.role,
              provider: spec.provider,
              output: '',
              exitCode: 1,
              startedAt: Date.now(),
              finishedAt: Date.now()
            })
          })
        }, index * staggerDelayMs)
      })
    )

    const results = await Promise.all(promises)

    const combinedOutput = results.map((r) => r.output).join('\n')

    return {
      stageName: config.name,
      agents: results,
      combinedOutput
    }
  } catch {
    return {
      stageName: config.name,
      agents: [],
      combinedOutput: ''
    }
  }
}

/**
 * Run pipeline stages sequentially, each stage's agents in parallel.
 */
export async function runPipeline(
  stages: StageConfig[],
  settings: Settings,
  callbacks: PipelineCallbacks
): Promise<StageResult[]> {
  const results: StageResult[] = []

  try {
    for (const stage of stages) {
      if (cancelled) {
        break
      }

      const stageResult = await runStage(stage, settings, callbacks)
      results.push(stageResult)
    }
  } catch {
    // Pipeline-level errors are caught; return whatever results we have
  }

  return results
}
