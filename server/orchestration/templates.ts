import type { StageName } from '@/server/pipeline-engine'

export interface DeterministicTemplate {
  id: 'scheduled-ci' | 'scheduled-report' | 'scheduled-deploy'
  name: string
  mode: 'chat' | 'swarm' | 'project'
  stages: Array<{
    stage: StageName
    prompt: string
    agents: number
  }>
}

export const DETERMINISTIC_TEMPLATES: Record<DeterministicTemplate['id'], DeterministicTemplate> = {
  'scheduled-ci': {
    id: 'scheduled-ci',
    name: 'CI Validation',
    mode: 'swarm',
    stages: [
      { stage: 'plan', prompt: 'Plan CI verification steps for this repo.', agents: 1 },
      { stage: 'validate', prompt: 'Run validation strategy: lint, typecheck, and test guidance.', agents: 1 },
      { stage: 'security', prompt: 'Review dependency/security posture and flag blockers.', agents: 1 },
      { stage: 'synthesize', prompt: 'Produce a CI summary with pass/fail, risks, and next actions.', agents: 1 },
    ],
  },
  'scheduled-report': {
    id: 'scheduled-report',
    name: 'Status Report',
    mode: 'chat',
    stages: [
      { stage: 'research', prompt: 'Gather latest project status signals from available context.', agents: 1 },
      { stage: 'synthesize', prompt: 'Generate concise weekly-style status report with sections and risks.', agents: 1 },
    ],
  },
  'scheduled-deploy': {
    id: 'scheduled-deploy',
    name: 'Deploy Readiness',
    mode: 'swarm',
    stages: [
      { stage: 'plan', prompt: 'Create deploy readiness checklist and release steps.', agents: 1 },
      { stage: 'validate', prompt: 'Validate deploy prerequisites and rollback plan quality.', agents: 1 },
      { stage: 'security', prompt: 'Evaluate security and compliance deployment blockers.', agents: 1 },
      { stage: 'synthesize', prompt: 'Output go/no-go decision with rationale and owner actions.', agents: 1 },
    ],
  },
}
