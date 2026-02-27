import type { AgentInstance, SwarmResult } from '@/lib/types'
import {
  computeConfidence,
  computeConfidenceWithOptions,
  diffOutputs,
  extractSources,
  type ConfidenceOptions,
} from '@/server/confidence'
import { runSecurityChecks } from '@/server/security-checks'
import type { SecurityResult } from '@/server/security-checks'
import { validateOutputsSemantically } from '@/server/semantic-validator'
import {
  factCheckOutput,
  computeFactCheckPenalty,
  type FactCheckResult,
} from '@/server/fact-checker'

/* ── Types ────────────────────────────────────────────────────────── */

export interface AgentOutput {
  agentId: string
  output: string
  exitCode: number
}

export interface StageAnalysis {
  confidence: number
  agreements: string
  sources: string[]
  allPassed: boolean
  passRate: number
  bestOutput: string
  needsRerun: boolean
  semanticSimilarity?: number
  confidenceMethod?: 'jaccard' | 'semantic' | 'hybrid'
  factCheckResult?: FactCheckResult
  factCheckScore?: number
}

export interface StageAnalysisOptions extends ConfidenceOptions {
  threshold?: number
  enableFactChecking?: boolean
  projectPath?: string
}

export interface SecurityValidation {
  passed: boolean
  issues: string[]
  details: Array<{ check: string; passed: boolean; output: string }>
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const STAGE_WEIGHTS: Record<string, number> = {
  research: 0.1,
  plan: 0.15,
  code: 0.3,
  validate: 0.25,
  security: 0.2,
}

/**
 * Tokenise text into a bag of lowercase words.
 * Reimplements simple word splitting without importing private helpers.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

/* ── Public API ───────────────────────────────────────────────────── */

/**
 * Select the output that has the most word-overlap with all other outputs.
 *
 * For each output, count how many of its words appear in at least 50% of
 * the *other* outputs.  Return the output with the highest count.
 */
export function selectBestOutput(outputs: AgentOutput[]): string {
  if (outputs.length === 0) return ''
  if (outputs.length === 1) return outputs[0].output

  const tokenized = outputs.map((o) => tokenize(o.output))

  let bestIndex = 0
  let bestCount = -1

  for (let i = 0; i < tokenized.length; i++) {
    const others = tokenized.filter((_, idx) => idx !== i)
    const threshold = Math.ceil(others.length * 0.5)
    let overlapCount = 0

    for (const word of tokenized[i]) {
      let appearances = 0
      for (const otherTokens of others) {
        if (otherTokens.includes(word)) {
          appearances++
        }
      }
      if (appearances >= threshold) {
        overlapCount++
      }
    }

    if (overlapCount > bestCount) {
      bestCount = overlapCount
      bestIndex = i
    }
  }

  return outputs[bestIndex].output
}

/**
 * Analyse a set of agent outputs from a single pipeline stage.
 *
 * Delegates to `computeConfidence`, `diffOutputs` and `extractSources`
 * from `@/server/confidence` for the heavy lifting.
 */
export function analyzeStageOutputs(
  outputs: AgentOutput[],
  threshold: number = 80,
): StageAnalysis {
  const texts = outputs.map((o) => o.output)

  const confidence = computeConfidence(texts)
  const agreements = diffOutputs(texts)

  const mergedSources = new Set<string>()
  for (const o of outputs) {
    for (const src of extractSources(o.output)) {
      mergedSources.add(src)
    }
  }

  const passed = outputs.filter((o) => o.exitCode === 0).length
  const allPassed = outputs.length > 0 && passed === outputs.length
  const passRate = outputs.length > 0 ? (passed / outputs.length) * 100 : 0

  const bestOutput = selectBestOutput(outputs)

  const needsRerun = confidence < threshold

  return {
    confidence,
    agreements,
    sources: [...mergedSources],
    allPassed,
    passRate,
    bestOutput,
    needsRerun,
    confidenceMethod: 'jaccard',
  }
}

/**
 * Analyse a set of agent outputs with optional semantic validation.
 *
 * When semantic validation is enabled and an API key is provided,
 * uses a hybrid approach combining Jaccard and semantic similarity.
 *
 * When fact checking is enabled, verifies file paths and code references
 * mentioned in the output and applies a penalty for unverified facts.
 */
export async function analyzeStageOutputsWithOptions(
  outputs: AgentOutput[],
  options: StageAnalysisOptions = {},
): Promise<StageAnalysis> {
  const {
    threshold = 80,
    useSemanticValidation,
    openaiApiKey,
    enableFactChecking,
    projectPath,
  } = options
  const texts = outputs.map((o) => o.output)

  const confidenceResult = await computeConfidenceWithOptions(texts, {
    useSemanticValidation,
    openaiApiKey,
  })

  const agreements = diffOutputs(texts)

  const mergedSources = new Set<string>()
  for (const o of outputs) {
    for (const src of extractSources(o.output)) {
      mergedSources.add(src)
    }
  }

  const passed = outputs.filter((o) => o.exitCode === 0).length
  const allPassed = outputs.length > 0 && passed === outputs.length
  const passRate = outputs.length > 0 ? (passed / outputs.length) * 100 : 0

  const bestOutput = selectBestOutput(outputs)

  let factCheckResult: FactCheckResult | undefined
  let factCheckScore: number | undefined
  let adjustedConfidence = confidenceResult.score

  if (enableFactChecking && projectPath && bestOutput.trim().length > 20) {
    try {
      factCheckResult = await factCheckOutput(bestOutput, projectPath)
      factCheckScore = factCheckResult.score

      const penalty = computeFactCheckPenalty(factCheckResult)
      adjustedConfidence = Math.max(0, confidenceResult.score - penalty)
    } catch {
      // Fact checking failed, continue without it
    }
  }

  const needsRerun = adjustedConfidence < threshold

  return {
    confidence: adjustedConfidence,
    agreements,
    sources: [...mergedSources],
    allPassed,
    passRate,
    bestOutput,
    needsRerun,
    semanticSimilarity: confidenceResult.semanticScore,
    confidenceMethod: confidenceResult.method,
    factCheckResult,
    factCheckScore,
  }
}

/**
 * Perform semantic-only validation on outputs.
 * Returns semantic similarity score and consensus status.
 */
export async function validateStageSemantics(
  outputs: AgentOutput[],
  apiKey: string,
  consensusThreshold: number = 0.8,
): Promise<{ similarity: number; isConsensus: boolean }> {
  const texts = outputs.map((o) => o.output)

  try {
    const result = await validateOutputsSemantically(texts, apiKey, consensusThreshold)
    return {
      similarity: result.similarity,
      isConsensus: result.isConsensus,
    }
  } catch {
    return {
      similarity: 0,
      isConsensus: false,
    }
  }
}

/**
 * Determine whether a stage should be re-run based on its analysis.
 */
export function shouldRerunValidation(
  analysis: StageAnalysis,
  threshold: number,
): boolean {
  if (analysis.confidence < threshold) return true
  if (analysis.passRate < 50) return true
  if (!analysis.allPassed && analysis.confidence < 60) return true
  return false
}

/**
 * Compute a weighted-average confidence score across all pipeline stages.
 *
 * Weights:  Research 0.1, Plan 0.15, Code 0.3, Validate 0.25, Security 0.2.
 * If any single stage is below 30, the final score is capped at 50.
 */
export function computeFinalConfidence(stageAnalyses: StageAnalysis[]): number {
  const stageNames = Object.keys(STAGE_WEIGHTS)

  let weightedSum = 0
  let totalWeight = 0
  let anyBelowFloor = false

  for (let i = 0; i < stageAnalyses.length; i++) {
    const name = stageNames[i] ?? 'code'
    const weight = STAGE_WEIGHTS[name] ?? 0.2
    weightedSum += stageAnalyses[i].confidence * weight
    totalWeight += weight

    if (stageAnalyses[i].confidence < 30) {
      anyBelowFloor = true
    }
  }

  const avg = totalWeight > 0 ? weightedSum / totalWeight : 0
  const result = Math.round(avg)

  if (anyBelowFloor) return Math.min(result, 50)
  return result
}

/**
 * Run security checks on the given project path and return a
 * `SecurityValidation` summary.
 */
export async function runSecurityValidation(
  projectPath: string,
): Promise<SecurityValidation> {
  const result: SecurityResult = await runSecurityChecks(projectPath)

  const issues: string[] = result.checks
    .filter((c) => !c.passed)
    .map((c) => `${c.name}: ${c.output}`)

  const details = result.checks.map((c) => ({
    check: c.name,
    passed: c.passed,
    output: c.output,
  }))

  return {
    passed: result.passed,
    issues,
    details,
  }
}

/**
 * Assemble the final `SwarmResult` from all pipeline outputs.
 */
export function buildFinalResult(params: {
  userPrompt: string
  stageAnalyses: StageAnalysis[]
  securityResult: SecurityValidation
  synthesizerOutput: string
  allAgents: AgentInstance[]
}): SwarmResult {
  const {
    stageAnalyses,
    securityResult,
    synthesizerOutput,
    allAgents,
  } = params

  const codeStageIndex = 2
  const codeStage: StageAnalysis | undefined = stageAnalyses[codeStageIndex]
  const fallbackOutput = codeStage?.bestOutput ?? ''

  const finalOutput = synthesizerOutput.trim().length > 0
    ? synthesizerOutput
    : fallbackOutput

  const confidence = computeFinalConfidence(stageAnalyses)

  const mergedSources = new Set<string>()
  for (const analysis of stageAnalyses) {
    for (const src of analysis.sources) {
      mergedSources.add(src)
    }
  }

  const validateStageIndex = 3
  const validateStage: StageAnalysis | undefined = stageAnalyses[validateStageIndex]
  const validationAgentsPassed = validateStage?.allPassed ?? true

  return {
    finalOutput,
    confidence,
    agents: allAgents,
    sources: [...mergedSources],
    validationPassed: securityResult.passed && validationAgentsPassed,
  }
}
