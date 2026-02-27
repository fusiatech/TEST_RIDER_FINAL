import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types'
import { resolveOrchestratorForJob } from '@/server/orchestration/resolver'

test('routes interactive jobs to agentic by default', () => {
  const decision = resolveOrchestratorForJob({
    source: 'user',
    settings: DEFAULT_SETTINGS,
    jobType: 'interactive',
  })

  assert.equal(decision.resolvedOrchestrator, 'agentic')
  assert.match(decision.reason, /interactive/i)
})

test('routes scheduled jobs to deterministic by default', () => {
  const jobTypes = ['scheduled-generic', 'scheduled-ci', 'scheduled-report', 'scheduled-deploy'] as const
  for (const jobType of jobTypes) {
    const decision = resolveOrchestratorForJob({
      source: 'scheduler',
      settings: DEFAULT_SETTINGS,
      jobType,
    })
    assert.equal(decision.resolvedOrchestrator, 'deterministic')
  }
})

test('respects explicit settings overrides per scheduled job type', () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    jobRouting: {
      interactive: 'deterministic',
      scheduled: {
        generic: 'deterministic',
        ci: 'agentic',
        report: 'deterministic',
        deploy: 'agentic',
      },
    },
  }

  const ciDecision = resolveOrchestratorForJob({ source: 'scheduler', settings, jobType: 'scheduled-ci' })
  const deployDecision = resolveOrchestratorForJob({ source: 'scheduler', settings, jobType: 'scheduled-deploy' })
  const reportDecision = resolveOrchestratorForJob({ source: 'scheduler', settings, jobType: 'scheduled-report' })

  assert.equal(ciDecision.resolvedOrchestrator, 'agentic')
  assert.equal(deployDecision.resolvedOrchestrator, 'agentic')
  assert.equal(reportDecision.resolvedOrchestrator, 'deterministic')
})
