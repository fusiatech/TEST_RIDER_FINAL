import type { Orchestrator, OrchestratorRunOptions } from '@/server/orchestration/types'
import { runScheduledPipeline } from '@/server/scheduled-pipeline'

export class DeterministicOrchestrator implements Orchestrator {
  readonly id = 'deterministic' as const

  async run(options: OrchestratorRunOptions) {
    return runScheduledPipeline(options)
  }
}
