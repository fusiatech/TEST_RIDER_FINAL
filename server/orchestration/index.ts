import type { Orchestrator } from '@/server/orchestration/types'
import { AgenticOrchestrator } from '@/server/orchestration/agentic-orchestrator'
import { DeterministicOrchestrator } from '@/server/orchestration/deterministic-orchestrator'

export { resolveOrchestratorForJob } from '@/server/orchestration/resolver'
export type { OrchestratorRunOptions, Orchestrator, RoutingDecision } from '@/server/orchestration/types'

const AGENTIC = new AgenticOrchestrator()
const DETERMINISTIC = new DeterministicOrchestrator()

export function getOrchestrator(id: 'agentic' | 'deterministic'): Orchestrator {
  return id === 'deterministic' ? DETERMINISTIC : AGENTIC
}
