import test from 'node:test'
import assert from 'node:assert/strict'

import { runSwarmPipeline } from '../orchestrator'
import { DEFAULT_SETTINGS } from '../../lib/types'

test('orchestrator chat mode blocks success and returns structured refusal when policy fails', async () => {
  const outputs: string[] = []
  const result = await runSwarmPipeline({
    prompt: 'Provide answer with no evidence',
    settings: {
      ...DEFAULT_SETTINGS,
      enabledCLIs: ['cursor'],
      autoRerunThreshold: 90,
      parallelCounts: {
        ...DEFAULT_SETTINGS.parallelCounts,
        coder: 1,
      },
    },
    projectPath: process.cwd(),
    mode: 'chat',
    onAgentOutput: (_agentId, data) => outputs.push(data),
    onAgentStatus: () => {},
  })

  assert.equal(result.validationPassed, false)
  const refusal = JSON.parse(result.finalOutput)
  assert.equal(refusal.type, 'guardrail_refusal')
  assert.ok(refusal.reasons.includes('LOW_CONFIDENCE'))
  assert.ok(outputs.some((o) => o.includes('Guardrail refusal')))
})
