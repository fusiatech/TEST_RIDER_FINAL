/**
 * GAP-012: Role-specific output schemas for agent validation.
 * All agent outputs are validated against these schemas before acceptance.
 */

import { z } from 'zod'
import type { AgentRole } from '@/lib/types'

/* ── Researcher Output Schema ─────────────────────────────────────── */

export const ResearchFindingSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(10),
  sources: z.array(z.string()),
  confidence: z.number().min(0).max(100),
})
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>

export const ResearcherOutputSchema = z.object({
  findings: z.array(ResearchFindingSchema).min(1),
  recommendations: z.array(z.string()),
})
export type ResearcherOutput = z.infer<typeof ResearcherOutputSchema>

/* ── Planner Output Schema ────────────────────────────────────────── */

export const PlanStepSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(5),
  dependencies: z.array(z.string()),
  estimatedEffort: z.enum(['S', 'M', 'L', 'XL']),
})
export type PlanStep = z.infer<typeof PlanStepSchema>

export const PlannerOutputSchema = z.object({
  steps: z.array(PlanStepSchema).min(1),
  risks: z.array(z.string()),
})
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>

/* ── Coder Output Schema ──────────────────────────────────────────── */

export const CodeChangeSchema = z.object({
  file: z.string().min(1),
  action: z.enum(['create', 'modify', 'delete']),
  content: z.string().optional(),
  diff: z.string().optional(),
  explanation: z.string().optional(),
})
export type CodeChange = z.infer<typeof CodeChangeSchema>

export const CoderOutputSchema = z.object({
  changes: z.array(CodeChangeSchema),
  summary: z.string().min(10),
  testsAdded: z.boolean().optional(),
  breakingChanges: z.boolean().optional(),
})
export type CoderOutput = z.infer<typeof CoderOutputSchema>

/* ── Validator Output Schema ──────────────────────────────────────── */

export const ValidationIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  location: z.string().optional(),
  message: z.string().min(5),
  suggestion: z.string().optional(),
})
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>

export const ValidatorOutputSchema = z.object({
  isValid: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  coverage: z.number().min(0).max(100).optional(),
  recommendations: z.array(z.string()),
})
export type ValidatorOutput = z.infer<typeof ValidatorOutputSchema>

/* ── Security Output Schema ───────────────────────────────────────── */

export const SecurityVulnerabilitySchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  type: z.string().min(1),
  location: z.string().optional(),
  description: z.string().min(10),
  remediation: z.string().optional(),
  cweId: z.string().optional(),
})
export type SecurityVulnerability = z.infer<typeof SecurityVulnerabilitySchema>

export const SecurityOutputSchema = z.object({
  isSecure: z.boolean(),
  vulnerabilities: z.array(SecurityVulnerabilitySchema),
  recommendations: z.array(z.string()),
  auditPassed: z.boolean(),
})
export type SecurityOutput = z.infer<typeof SecurityOutputSchema>

/* ── Synthesizer Output Schema ────────────────────────────────────── */

export const SynthesizerOutputSchema = z.object({
  summary: z.string().min(20),
  keyFindings: z.array(z.string()).min(1),
  actionItems: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  sources: z.array(z.string()),
})
export type SynthesizerOutput = z.infer<typeof SynthesizerOutputSchema>

/* ── Schema Registry ──────────────────────────────────────────────── */

export const OUTPUT_SCHEMAS: Record<AgentRole, z.ZodSchema> = {
  researcher: ResearcherOutputSchema,
  planner: PlannerOutputSchema,
  coder: CoderOutputSchema,
  validator: ValidatorOutputSchema,
  security: SecurityOutputSchema,
  synthesizer: SynthesizerOutputSchema,
}

/* ── Validation Result ────────────────────────────────────────────── */

export interface OutputValidationResult {
  isValid: boolean
  role: AgentRole
  errors: string[]
  parsedOutput?: unknown
  rawOutput: string
}

/* ── JSON Extraction ──────────────────────────────────────────────── */

const JSON_BLOCK_PATTERN = /```(?:json)?\s*([\s\S]*?)```/g
const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/

function hasStructuredOutputHint(text: string): boolean {
  JSON_BLOCK_PATTERN.lastIndex = 0
  if (JSON_BLOCK_PATTERN.test(text)) {
    return true
  }

  const trimmed = text.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function extractJSON(text: string): string | null {
  JSON_BLOCK_PATTERN.lastIndex = 0
  const blockMatch = JSON_BLOCK_PATTERN.exec(text)
  if (blockMatch) {
    return blockMatch[1].trim()
  }

  const objectMatch = JSON_OBJECT_PATTERN.exec(text)
  if (objectMatch) {
    return objectMatch[0]
  }

  return null
}

/* ── Validation Functions ─────────────────────────────────────────── */

/**
 * Validate agent output against role-specific schema.
 * Attempts to extract JSON from the output and validate it.
 */
export function validateAgentOutput(
  role: AgentRole,
  output: string,
): OutputValidationResult {
  const schema = OUTPUT_SCHEMAS[role]
  
  if (!output || output.trim().length < 10) {
    return {
      isValid: false,
      role,
      errors: ['Output is empty or too short'],
      rawOutput: output,
    }
  }

  const jsonStr = extractJSON(output)
  
  if (!jsonStr) {
    if (hasStructuredOutputHint(output)) {
      return {
        isValid: false,
        role,
        errors: ['Structured output detected but valid JSON payload was not found'],
        rawOutput: output,
      }
    }

    return {
      isValid: true,
      role,
      errors: [],
      rawOutput: output,
    }
  }

  try {
    const parsed = JSON.parse(jsonStr)
    const result = schema.safeParse(parsed)
    
    if (result.success) {
      return {
        isValid: true,
        role,
        errors: [],
        parsedOutput: result.data,
        rawOutput: output,
      }
    }
    
    const errors = result.error.errors.map(
      (e) => `${e.path.join('.')}: ${e.message}`
    )
    
    return {
      isValid: false,
      role,
      errors,
      rawOutput: output,
    }
  } catch {
    return {
      isValid: false,
      role,
      errors: ['Structured output JSON could not be parsed'],
      rawOutput: output,
    }
  }
}

/**
 * Validate multiple agent outputs and return aggregated results.
 */
export function validateStageOutputs(
  role: AgentRole,
  outputs: string[],
): OutputValidationResult[] {
  return outputs.map((output) => validateAgentOutput(role, output))
}

/**
 * Check if all outputs in a stage are valid.
 */
export function areAllOutputsValid(results: OutputValidationResult[]): boolean {
  return results.every((r) => r.isValid)
}

/**
 * Get validation error summary for logging.
 */
export function getValidationErrorSummary(results: OutputValidationResult[]): string {
  const invalid = results.filter((r) => !r.isValid)
  if (invalid.length === 0) return 'All outputs valid'
  
  return invalid
    .map((r) => `${r.role}: ${r.errors.join(', ')}`)
    .join('; ')
}

export const ToolContractEnvelopeSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.unknown()),
})

export function validateToolContractEnvelope(payload: unknown): {
  isValid: boolean
  errors: string[]
  parsed?: z.infer<typeof ToolContractEnvelopeSchema>
} {
  const result = ToolContractEnvelopeSchema.safeParse(payload)
  if (result.success) {
    return { isValid: true, errors: [], parsed: result.data }
  }
  return {
    isValid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  }
}
