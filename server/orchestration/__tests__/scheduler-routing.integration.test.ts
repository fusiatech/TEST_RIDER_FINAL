import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types'
import { resolveOrchestratorForJob } from '@/server/orchestration/resolver'

function schedulerDecision(settings: Settings, jobType?: 'scheduled-generic' | 'scheduled-ci' | 'scheduled-report' | 'scheduled-deploy') {
  return resolveOrchestratorForJob({
    source: 'scheduler',
    settings,
    jobType,
  })
}

test('scheduler defaults never choose agentic execution path', () => {
  const cases = [
    schedulerDecision(DEFAULT_SETTINGS, 'scheduled-generic'),
    schedulerDecision(DEFAULT_SETTINGS, 'scheduled-ci'),
    schedulerDecision(DEFAULT_SETTINGS, 'scheduled-report'),
    schedulerDecision(DEFAULT_SETTINGS, 'scheduled-deploy'),
    schedulerDecision(DEFAULT_SETTINGS),
  ]

  for (const decision of cases) {
    assert.equal(decision.resolvedOrchestrator, 'deterministic')
  }
})

test('scheduler only chooses agentic when explicitly configured', () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    jobRouting: {
      interactive: 'agentic',
      scheduled: {
        generic: 'deterministic',
        ci: 'agentic',
        report: 'deterministic',
        deploy: 'deterministic',
      },
    },
  }

  const ciDecision = schedulerDecision(settings, 'scheduled-ci')
  const genericDecision = schedulerDecision(settings, 'scheduled-generic')

  assert.equal(ciDecision.resolvedOrchestrator, 'agentic')
  assert.equal(genericDecision.resolvedOrchestrator, 'deterministic')
})
