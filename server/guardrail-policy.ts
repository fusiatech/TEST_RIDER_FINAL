import type { Ticket } from '@/lib/types'
import { TicketManager } from '@/server/ticket-manager'

export type GuardrailFailureCode =
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UPSTREAM_VALIDATION_FAILED'
  | 'EXPLICIT_REFUSAL_TRIGGERED'

export interface GuardrailPolicyInput {
  minConfidence: number
  minEvidenceCount: number
  confidence: number
  evidence: string[]
  candidateOutput: string
  upstreamValidationPassed: boolean
  explicitRefusalPatterns?: RegExp[]
  context: {
    pipeline: 'orchestrator' | 'scheduled'
    mode: 'chat' | 'swarm' | 'project'
    promptSnippet: string
  }
}

export interface GuardrailRefusalPayload {
  type: 'guardrail_refusal'
  message: string
  reasons: GuardrailFailureCode[]
  confidence: number
  evidenceCount: number
  policy: {
    minConfidence: number
    minEvidenceCount: number
  }
  context: GuardrailPolicyInput['context']
}

export interface GuardrailPolicyResult {
  passed: boolean
  failures: GuardrailFailureCode[]
  refusalPayload?: GuardrailRefusalPayload
}

const DEFAULT_REFUSAL_PATTERNS: RegExp[] = [
  /\b(i\s+cannot|i\s+can'?t|unable\s+to|insufficient\s+information|not\s+enough\s+context)\b/i,
]

export function evaluateGuardrailPolicy(
  input: GuardrailPolicyInput,
): GuardrailPolicyResult {
  const failures: GuardrailFailureCode[] = []
  const patterns = input.explicitRefusalPatterns ?? DEFAULT_REFUSAL_PATTERNS

  if (input.confidence < input.minConfidence) {
    failures.push('LOW_CONFIDENCE')
  }

  if (input.evidence.length < input.minEvidenceCount) {
    failures.push('INSUFFICIENT_EVIDENCE')
  }

  if (!input.upstreamValidationPassed) {
    failures.push('UPSTREAM_VALIDATION_FAILED')
  }

  if (patterns.some((pattern) => pattern.test(input.candidateOutput))) {
    failures.push('EXPLICIT_REFUSAL_TRIGGERED')
  }

  if (failures.length === 0) {
    return { passed: true, failures: [] }
  }

  return {
    passed: false,
    failures,
    refusalPayload: {
      type: 'guardrail_refusal',
      message: 'Final output refused by guardrail policy.',
      reasons: failures,
      confidence: input.confidence,
      evidenceCount: input.evidence.length,
      policy: {
        minConfidence: input.minConfidence,
        minEvidenceCount: input.minEvidenceCount,
      },
      context: input.context,
    },
  }
}

export function formatRefusalPayload(payload: GuardrailRefusalPayload): string {
  return JSON.stringify(payload, null, 2)
}

export function createGuardrailEscalation(
  ticketManager: TicketManager,
  message: string,
  context: GuardrailPolicyInput['context'],
): Ticket {
  const seedTicket = ticketManager.createTicket({
    title: `Guardrail refusal (${context.pipeline}/${context.mode})`,
    description: `Guardrail policy refusal for prompt: ${context.promptSnippet}`,
    assignedRole: 'validator',
  })

  return ticketManager.createEscalationTicket(
    seedTicket,
    message,
    `Pipeline=${context.pipeline}\nMode=${context.mode}\nPrompt=${context.promptSnippet}`,
  )
}
