import test from 'node:test'
import assert from 'node:assert/strict'

import { runScheduledPipeline } from '../scheduled-pipeline'
import { DEFAULT_SETTINGS } from '../../lib/types'

test('scheduled pipeline chat mode returns refusal payload when guardrails fail', async () => {
  const logs: string[] = []

  const result = await runScheduledPipeline({
    prompt: 'Answer without citations',
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
    onAgentOutput: (_agentId, data) => logs.push(data),
    onAgentStatus: () => {},
  })

  assert.equal(result.validationPassed, false)
  const parsed = JSON.parse(result.finalOutput)
  assert.equal(parsed.type, 'guardrail_refusal')
  assert.ok(Array.isArray(parsed.reasons))
  assert.ok(
    logs.some((entry) =>
      entry.includes('Guardrail refusal. Escalation:'),
    ),
  )
})
