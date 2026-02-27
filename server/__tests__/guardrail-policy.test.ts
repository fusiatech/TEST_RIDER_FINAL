import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateGuardrailPolicy,
  formatRefusalPayload,
  createGuardrailEscalation,
} from '../guardrail-policy'
import { TicketManager } from '../ticket-manager'

test('guardrail policy pass/fail matrix', () => {
  const base = {
    minConfidence: 70,
    minEvidenceCount: 1,
    candidateOutput: 'Implemented feature. Source: docs',
    context: {
      pipeline: 'orchestrator' as const,
      mode: 'swarm' as const,
      promptSnippet: 'Build feature',
    },
  }

  const pass = evaluateGuardrailPolicy({
    ...base,
    confidence: 82,
    evidence: ['docs'],
    upstreamValidationPassed: true,
  })
  assert.equal(pass.passed, true)
  assert.deepEqual(pass.failures, [])

  const lowConfidence = evaluateGuardrailPolicy({
    ...base,
    confidence: 30,
    evidence: ['docs'],
    upstreamValidationPassed: true,
  })
  assert.equal(lowConfidence.passed, false)
  assert.ok(lowConfidence.failures.includes('LOW_CONFIDENCE'))

  const missingEvidence = evaluateGuardrailPolicy({
    ...base,
    confidence: 82,
    evidence: [],
    upstreamValidationPassed: true,
  })
  assert.equal(missingEvidence.passed, false)
  assert.ok(missingEvidence.failures.includes('INSUFFICIENT_EVIDENCE'))

  const explicitRefusal = evaluateGuardrailPolicy({
    ...base,
    confidence: 82,
    evidence: ['docs'],
    candidateOutput: 'I cannot complete this request.',
    upstreamValidationPassed: true,
  })
  assert.equal(explicitRefusal.passed, false)
  assert.ok(explicitRefusal.failures.includes('EXPLICIT_REFUSAL_TRIGGERED'))
})

test('integration: refusal payload is structured and escalation ticket is created', () => {
  const result = evaluateGuardrailPolicy({
    minConfidence: 75,
    minEvidenceCount: 2,
    confidence: 41,
    evidence: [],
    candidateOutput: 'unable to provide final answer',
    upstreamValidationPassed: false,
    context: {
      pipeline: 'scheduled',
      mode: 'project',
      promptSnippet: 'Critical project prompt',
    },
  })

  assert.equal(result.passed, false)
  assert.ok(result.refusalPayload)

  const serialized = formatRefusalPayload(result.refusalPayload!)
  const parsed = JSON.parse(serialized)
  assert.equal(parsed.type, 'guardrail_refusal')
  assert.ok(Array.isArray(parsed.reasons))
  assert.ok(parsed.reasons.length >= 3)

  const ticketManager = new TicketManager()
  const escalation = createGuardrailEscalation(
    ticketManager,
    serialized,
    result.refusalPayload!.context,
  )

  assert.equal(escalation.type, 'escalation')
  assert.match(escalation.title, /Guardrail refusal/)
  assert.match(escalation.description, /guardrail_refusal/)
})
