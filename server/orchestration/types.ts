import type { Settings, SwarmResult, JobType } from '@/lib/types'

export interface OrchestratorRunOptions {
  prompt: string
  settings: Settings
  projectPath: string
  mode: 'chat' | 'swarm' | 'project'
  onAgentOutput: (agentId: string, data: string) => void
  onAgentStatus: (agentId: string, status: string, exitCode?: number) => void
  jobType?: JobType
}

export interface Orchestrator {
  readonly id: 'agentic' | 'deterministic'
  run(options: OrchestratorRunOptions): Promise<SwarmResult>
}

export interface RoutingDecision {
  jobType: JobType
  resolvedOrchestrator: 'agentic' | 'deterministic'
  reason: string
}
