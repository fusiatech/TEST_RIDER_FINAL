import type { Orchestrator, OrchestratorRunOptions } from '@/server/orchestration/types'
import { runSwarmPipeline } from '@/server/orchestrator'

export class AgenticOrchestrator implements Orchestrator {
  readonly id = 'agentic' as const

  async run(options: OrchestratorRunOptions) {
    return runSwarmPipeline(options)
  }
}
