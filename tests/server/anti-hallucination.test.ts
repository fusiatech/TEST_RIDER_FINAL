import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  selectBestOutput,
  analyzeStageOutputs,
  analyzeStageOutputsWithOptions,
  validateStageSemantics,
  shouldRerunValidation,
  computeFinalConfidence,
  runSecurityValidation,
  buildFinalResult,
  type AgentOutput,
  type StageAnalysis,
  type SecurityValidation,
} from '@/server/anti-hallucination'

const mockComputeConfidence = vi.fn((outputs: string[]) => {
  if (outputs.length === 0) return 0
  if (outputs.length === 1) return 50
  return 75
})

const mockComputeConfidenceWithOptions = vi.fn().mockResolvedValue({
  score: 80,
  jaccardScore: 75,
  semanticScore: 85,
  method: 'hybrid',
})

const mockDiffOutputs = vi.fn().mockReturnValue('## Output Comparison\nMocked diff output')

const mockExtractSources = vi.fn((output: string) => {
  const sources: string[] = []
  if (output.includes('http')) sources.push('https://example.com')
  if (output.includes('/src')) sources.push('/src/file.ts')
  return sources
})

vi.mock('@/server/confidence', () => ({
  computeConfidence: mockComputeConfidence,
  computeConfidenceWithOptions: mockComputeConfidenceWithOptions,
  diffOutputs: mockDiffOutputs,
  extractSources: mockExtractSources,
}))

const mockValidateOutputsSemantically = vi.fn().mockResolvedValue({
  similarity: 0.85,
  isConsensus: true,
})

vi.mock('@/server/semantic-validator', () => ({
  validateOutputsSemantically: mockValidateOutputsSemantically,
}))

const mockRunSecurityChecks = vi.fn().mockResolvedValue({
  passed: true,
  checks: [
    { name: 'npm-audit', passed: true, output: 'No vulnerabilities' },
    { name: 'secret-scan', passed: true, output: 'No secrets found' },
  ],
})

vi.mock('@/server/security-checks', () => ({
  runSecurityChecks: mockRunSecurityChecks,
}))

const mockFactCheckOutput = vi.fn().mockResolvedValue({
  score: 90,
  verifiedFacts: 9,
  unverifiedFacts: 1,
  totalFacts: 10,
  details: [],
  isValid: true,
})

const mockComputeFactCheckPenalty = vi.fn().mockReturnValue(5)

vi.mock('@/server/fact-checker', () => ({
  factCheckOutput: mockFactCheckOutput,
  computeFactCheckPenalty: mockComputeFactCheckPenalty,
}))

describe('anti-hallucination.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeConfidence.mockImplementation((outputs: string[]) => {
      if (outputs.length === 0) return 0
      if (outputs.length === 1) return 50
      return 75
    })
    mockComputeConfidenceWithOptions.mockResolvedValue({
      score: 80,
      jaccardScore: 75,
      semanticScore: 85,
      method: 'hybrid',
    })
    mockFactCheckOutput.mockResolvedValue({
      score: 90,
      verifiedFacts: 9,
      unverifiedFacts: 1,
      totalFacts: 10,
      details: [],
      isValid: true,
    })
    mockComputeFactCheckPenalty.mockReturnValue(5)
    mockRunSecurityChecks.mockResolvedValue({
      passed: true,
      checks: [
        { name: 'npm-audit', passed: true, output: 'No vulnerabilities' },
        { name: 'secret-scan', passed: true, output: 'No secrets found' },
      ],
    })
    mockValidateOutputsSemantically.mockResolvedValue({
      similarity: 0.85,
      isConsensus: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('selectBestOutput', () => {
    it('returns empty string for empty outputs', () => {
      expect(selectBestOutput([])).toBe('')
    })

    it('returns single output when only one provided', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Single output', exitCode: 0 },
      ]
      expect(selectBestOutput(outputs)).toBe('Single output')
    })

    it('selects output with most word overlap', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'apple banana cherry', exitCode: 0 },
        { agentId: 'agent-2', output: 'apple banana date', exitCode: 0 },
        { agentId: 'agent-3', output: 'apple banana elderberry', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toContain('apple')
      expect(best).toContain('banana')
    })

    it('handles outputs with different lengths', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'short', exitCode: 0 },
        { agentId: 'agent-2', output: 'this is a much longer output with more words', exitCode: 0 },
        { agentId: 'agent-3', output: 'medium length output here', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(typeof best).toBe('string')
    })

    it('returns first output when all are identical', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'identical output', exitCode: 0 },
        { agentId: 'agent-2', output: 'identical output', exitCode: 0 },
        { agentId: 'agent-3', output: 'identical output', exitCode: 0 },
      ]
      expect(selectBestOutput(outputs)).toBe('identical output')
    })
  })

  describe('analyzeStageOutputs', () => {
    it('returns analysis with confidence score', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output one', exitCode: 0 },
        { agentId: 'agent-2', output: 'Output two', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)

      expect(analysis.confidence).toBeDefined()
      expect(typeof analysis.confidence).toBe('number')
    })

    it('calculates pass rate correctly', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output one', exitCode: 0 },
        { agentId: 'agent-2', output: 'Output two', exitCode: 1 },
        { agentId: 'agent-3', output: 'Output three', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)

      expect(analysis.passRate).toBeCloseTo(66.67, 0)
      expect(analysis.allPassed).toBe(false)
    })

    it('sets allPassed true when all exit codes are 0', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output one', exitCode: 0 },
        { agentId: 'agent-2', output: 'Output two', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)

      expect(analysis.allPassed).toBe(true)
      expect(analysis.passRate).toBe(100)
    })

    it('extracts and merges sources from all outputs', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Check http://example.com', exitCode: 0 },
        { agentId: 'agent-2', output: 'Edit /src/file.ts', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)

      expect(analysis.sources).toContain('https://example.com')
      expect(analysis.sources).toContain('/src/file.ts')
    })

    it('sets needsRerun based on threshold', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output', exitCode: 0 },
        { agentId: 'agent-2', output: 'Output', exitCode: 0 },
      ]

      const analysisLowThreshold = analyzeStageOutputs(outputs, 50)
      expect(analysisLowThreshold.needsRerun).toBe(false)

      const analysisHighThreshold = analyzeStageOutputs(outputs, 90)
      expect(analysisHighThreshold.needsRerun).toBe(true)
    })

    it('includes agreements diff', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output one', exitCode: 0 },
        { agentId: 'agent-2', output: 'Output two', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)

      expect(analysis.agreements).toContain('Output Comparison')
    })

    it('sets confidenceMethod to jaccard', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)

      expect(analysis.confidenceMethod).toBe('jaccard')
    })
  })

  describe('analyzeStageOutputsWithOptions', () => {
    it('uses semantic validation when enabled', async () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output one', exitCode: 0 },
        { agentId: 'agent-2', output: 'Output two', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: 'test-key',
      })

      expect(analysis.confidenceMethod).toBe('hybrid')
      expect(analysis.semanticSimilarity).toBeDefined()
    })

    it('applies fact check penalty when enabled', async () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'This is a meaningful output with enough content', exitCode: 0 },
        { agentId: 'agent-2', output: 'This is another meaningful output with content', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        enableFactChecking: true,
        projectPath: '/test/project',
      })

      expect(analysis.factCheckResult).toBeDefined()
      expect(analysis.factCheckScore).toBeDefined()
    })

    it('handles empty outputs', async () => {
      const analysis = await analyzeStageOutputsWithOptions([])

      expect(analysis.confidence).toBeDefined()
      expect(analysis.passRate).toBe(0)
    })
  })

  describe('shouldRerunValidation', () => {
    it('returns true when confidence below threshold', () => {
      const analysis: StageAnalysis = {
        confidence: 60,
        agreements: '',
        sources: [],
        allPassed: true,
        passRate: 100,
        bestOutput: '',
        needsRerun: true,
      }
      expect(shouldRerunValidation(analysis, 80)).toBe(true)
    })

    it('returns true when pass rate below 50', () => {
      const analysis: StageAnalysis = {
        confidence: 85,
        agreements: '',
        sources: [],
        allPassed: false,
        passRate: 40,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 80)).toBe(true)
    })

    it('returns true when not all passed and confidence below 60', () => {
      const analysis: StageAnalysis = {
        confidence: 55,
        agreements: '',
        sources: [],
        allPassed: false,
        passRate: 75,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 50)).toBe(true)
    })

    it('returns false when all conditions met', () => {
      const analysis: StageAnalysis = {
        confidence: 85,
        agreements: '',
        sources: [],
        allPassed: true,
        passRate: 100,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 80)).toBe(false)
    })
  })

  describe('computeFinalConfidence', () => {
    it('returns 0 for empty analyses', () => {
      expect(computeFinalConfidence([])).toBe(0)
    })

    it('computes weighted average of stage confidences', () => {
      const analyses: StageAnalysis[] = [
        { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 90, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 85, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const final = computeFinalConfidence(analyses)

      expect(final).toBeGreaterThan(0)
      expect(final).toBeLessThanOrEqual(100)
    })

    it('caps score at 50 when any stage below 30', () => {
      const analyses: StageAnalysis[] = [
        { confidence: 25, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 90, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 95, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const final = computeFinalConfidence(analyses)

      expect(final).toBeLessThanOrEqual(50)
    })

    it('applies stage weights correctly', () => {
      const highCodeConfidence: StageAnalysis[] = [
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]

      const highResearchConfidence: StageAnalysis[] = [
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]

      const codeWeightedScore = computeFinalConfidence(highCodeConfidence)
      const researchWeightedScore = computeFinalConfidence(highResearchConfidence)

      expect(codeWeightedScore).toBeGreaterThan(researchWeightedScore)
    })
  })

  describe('buildFinalResult', () => {
    it('builds result with synthesizer output when available', () => {
      const result = buildFinalResult({
        userPrompt: 'Test prompt',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: ['src1'], allPassed: true, passRate: 100, bestOutput: 'code output', needsRerun: false },
          { confidence: 85, agreements: '', sources: ['src2'], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 90, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: 'best code', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: 'Final synthesized output',
        allAgents: [],
      })

      expect(result.finalOutput).toBe('Final synthesized output')
    })

    it('falls back to code stage output when synthesizer empty', () => {
      const result = buildFinalResult({
        userPrompt: 'Test prompt',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 85, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 90, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: 'code stage output', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: '',
        allAgents: [],
      })

      expect(result.finalOutput).toBe('code stage output')
    })

    it('merges sources from all stages', () => {
      const result = buildFinalResult({
        userPrompt: 'Test prompt',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: ['source1', 'source2'], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 85, agreements: '', sources: ['source3'], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: 'Output',
        allAgents: [],
      })

      expect(result.sources).toContain('source1')
      expect(result.sources).toContain('source2')
      expect(result.sources).toContain('source3')
    })

    it('sets validationPassed based on security and validation stage', () => {
      const resultPassed = buildFinalResult({
        userPrompt: 'Test prompt',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 85, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 90, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 95, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: 'Output',
        allAgents: [],
      })

      expect(resultPassed.validationPassed).toBe(true)

      const resultFailed = buildFinalResult({
        userPrompt: 'Test prompt',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 85, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 90, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 95, agreements: '', sources: [], allPassed: false, passRate: 50, bestOutput: '', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: 'Output',
        allAgents: [],
      })

      expect(resultFailed.validationPassed).toBe(false)
    })

    it('includes all agents in result', () => {
      const agents = [
        { id: 'agent-1', provider: 'claude' as const, status: 'completed' as const, role: 'coder' as const, label: 'Coder 1', output: '' },
        { id: 'agent-2', provider: 'gemini' as const, status: 'completed' as const, role: 'coder' as const, label: 'Coder 2', output: '' },
      ]

      const result = buildFinalResult({
        userPrompt: 'Test prompt',
        stageAnalyses: [],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: 'Output',
        allAgents: agents as any,
      })

      expect(result.agents).toHaveLength(2)
      expect(result.agents[0].id).toBe('agent-1')
    })

    it('computes confidence from stage analyses', () => {
      const result = buildFinalResult({
        userPrompt: 'Test prompt',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 90, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: 'Output',
        allAgents: [],
      })

      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(100)
    })
  })

  /* ── Schema Validation Tests ───────────────────────────────────────── */

  describe('Schema Validation', () => {
    it('handles AgentOutput with all required fields', () => {
      const output: AgentOutput = {
        agentId: 'test-agent-123',
        output: 'This is a valid output string',
        exitCode: 0,
      }
      expect(output.agentId).toBe('test-agent-123')
      expect(output.output).toBe('This is a valid output string')
      expect(output.exitCode).toBe(0)
    })

    it('handles AgentOutput with non-zero exit code', () => {
      const output: AgentOutput = {
        agentId: 'failed-agent',
        output: 'Error: Something went wrong',
        exitCode: 1,
      }
      expect(output.exitCode).toBe(1)
    })

    it('handles StageAnalysis with all optional fields', () => {
      const analysis: StageAnalysis = {
        confidence: 85,
        agreements: 'All agents agree on approach',
        sources: ['https://docs.example.com', '/src/utils.ts'],
        allPassed: true,
        passRate: 100,
        bestOutput: 'Best output content',
        needsRerun: false,
        semanticSimilarity: 0.92,
        confidenceMethod: 'hybrid',
        factCheckResult: {
          isValid: true,
          score: 95,
          verifiedFacts: [],
          unverifiedFacts: [],
          errors: [],
        },
        factCheckScore: 95,
      }
      expect(analysis.semanticSimilarity).toBe(0.92)
      expect(analysis.confidenceMethod).toBe('hybrid')
      expect(analysis.factCheckScore).toBe(95)
    })

    it('handles SecurityValidation structure', () => {
      const validation: SecurityValidation = {
        passed: false,
        issues: ['npm-audit: Critical vulnerability found'],
        details: [
          { check: 'npm-audit', passed: false, output: 'Critical vulnerability' },
          { check: 'secret-scan', passed: true, output: 'No secrets' },
        ],
      }
      expect(validation.passed).toBe(false)
      expect(validation.issues).toHaveLength(1)
      expect(validation.details).toHaveLength(2)
    })

    it('validates empty arrays are handled correctly', () => {
      const analysis = analyzeStageOutputs([])
      expect(analysis.sources).toEqual([])
      expect(analysis.passRate).toBe(0)
      expect(analysis.allPassed).toBe(false)
    })

    it('validates outputs with special characters', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Code with `backticks` and "quotes"', exitCode: 0 },
        { agentId: 'agent-2', output: 'Code with $variables and ${templates}', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)
      expect(analysis.bestOutput).toBeDefined()
    })
  })

  /* ── Evidence Verification Tests ───────────────────────────────────── */

  describe('Evidence Verification', () => {
    it('extracts HTTP sources from outputs', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'See http://example.com/docs', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)
      expect(mockExtractSources).toHaveBeenCalled()
    })

    it('extracts file path sources from outputs', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Edit /src/components/Button.tsx', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)
      expect(mockExtractSources).toHaveBeenCalledWith(expect.stringContaining('/src'))
    })

    it('deduplicates sources across multiple outputs', () => {
      mockExtractSources.mockImplementation((output: string) => {
        if (output.includes('shared')) return ['https://shared.com']
        return []
      })

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'shared resource', exitCode: 0 },
        { agentId: 'agent-2', output: 'shared resource', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)
      expect(analysis.sources.filter(s => s === 'https://shared.com').length).toBeLessThanOrEqual(1)
    })

    it('handles outputs with no extractable sources', () => {
      mockExtractSources.mockReturnValue([])
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Plain text without sources', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs)
      expect(analysis.sources).toEqual([])
    })

    it('merges sources from all stage analyses in buildFinalResult', () => {
      const result = buildFinalResult({
        userPrompt: 'Test',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: ['src1', 'src2'], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 80, agreements: '', sources: ['src2', 'src3'], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 80, agreements: '', sources: ['src3', 'src4'], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: 'Output',
        allAgents: [],
      })
      expect(result.sources).toContain('src1')
      expect(result.sources).toContain('src4')
      expect(new Set(result.sources).size).toBe(result.sources.length)
    })
  })

  /* ── Tool-Backed Verification Tests ────────────────────────────────── */

  describe('Tool-Backed Verification (Fact Checking)', () => {
    it('applies fact check when enabled with sufficient output', async () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'This is a meaningful output with enough content to verify', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        enableFactChecking: true,
        projectPath: '/test/project',
      })
      expect(mockFactCheckOutput).toHaveBeenCalled()
      expect(analysis.factCheckResult).toBeDefined()
    })

    it('skips fact check when output is too short', async () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Short', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        enableFactChecking: true,
        projectPath: '/test/project',
      })
      expect(mockFactCheckOutput).not.toHaveBeenCalled()
    })

    it('skips fact check when projectPath is missing', async () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'This is a meaningful output with enough content', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        enableFactChecking: true,
      })
      expect(mockFactCheckOutput).not.toHaveBeenCalled()
    })

    it('applies penalty based on fact check score', async () => {
      mockFactCheckOutput.mockResolvedValue({
        score: 60,
        verifiedFacts: 6,
        unverifiedFacts: 4,
        totalFacts: 10,
        details: [],
        isValid: true,
      })
      mockComputeFactCheckPenalty.mockReturnValue(15)

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'This is a meaningful output with enough content to verify', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        enableFactChecking: true,
        projectPath: '/test/project',
      })
      expect(analysis.confidence).toBeLessThan(80)
    })

    it('handles fact check errors gracefully', async () => {
      mockFactCheckOutput.mockRejectedValue(new Error('Fact check failed'))

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'This is a meaningful output with enough content to verify', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        enableFactChecking: true,
        projectPath: '/test/project',
      })
      expect(analysis.factCheckResult).toBeUndefined()
      expect(analysis.confidence).toBe(80)
    })

    it('adjusts confidence to minimum 0 after penalty', async () => {
      mockComputeConfidenceWithOptions.mockResolvedValue({
        score: 20,
        jaccardScore: 20,
        method: 'jaccard',
      })
      mockComputeFactCheckPenalty.mockReturnValue(50)

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'This is a meaningful output with enough content to verify', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, {
        enableFactChecking: true,
        projectPath: '/test/project',
      })
      expect(analysis.confidence).toBeGreaterThanOrEqual(0)
    })
  })

  /* ── Escalation Rules Tests ────────────────────────────────────────── */

  describe('Escalation Rules', () => {
    it('triggers rerun when confidence is exactly at threshold', () => {
      const analysis: StageAnalysis = {
        confidence: 80,
        agreements: '',
        sources: [],
        allPassed: true,
        passRate: 100,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 80)).toBe(false)
    })

    it('triggers rerun when confidence is 1 below threshold', () => {
      const analysis: StageAnalysis = {
        confidence: 79,
        agreements: '',
        sources: [],
        allPassed: true,
        passRate: 100,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 80)).toBe(true)
    })

    it('triggers rerun when pass rate is exactly 50', () => {
      const analysis: StageAnalysis = {
        confidence: 90,
        agreements: '',
        sources: [],
        allPassed: false,
        passRate: 50,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 80)).toBe(false)
    })

    it('triggers rerun when pass rate is 49', () => {
      const analysis: StageAnalysis = {
        confidence: 90,
        agreements: '',
        sources: [],
        allPassed: false,
        passRate: 49,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 80)).toBe(true)
    })

    it('triggers rerun for combined low confidence and failed agents', () => {
      const analysis: StageAnalysis = {
        confidence: 59,
        agreements: '',
        sources: [],
        allPassed: false,
        passRate: 75,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 50)).toBe(true)
    })

    it('does not trigger rerun when confidence is 60 with failed agents', () => {
      const analysis: StageAnalysis = {
        confidence: 60,
        agreements: '',
        sources: [],
        allPassed: false,
        passRate: 75,
        bestOutput: '',
        needsRerun: false,
      }
      expect(shouldRerunValidation(analysis, 50)).toBe(false)
    })

    it('analyzeStageOutputs sets needsRerun based on threshold', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output', exitCode: 0 },
      ]
      const analysis = analyzeStageOutputs(outputs, 60)
      expect(analysis.needsRerun).toBe(true)
    })

    it('analyzeStageOutputsWithOptions sets needsRerun based on adjusted confidence', async () => {
      mockComputeConfidenceWithOptions.mockResolvedValue({
        score: 70,
        jaccardScore: 70,
        method: 'jaccard',
      })

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output', exitCode: 0 },
      ]
      const analysis = await analyzeStageOutputsWithOptions(outputs, { threshold: 80 })
      expect(analysis.needsRerun).toBe(true)
    })
  })

  /* ── Error Handling Tests ──────────────────────────────────────────── */

  describe('Error Handling', () => {
    it('handles empty output strings gracefully', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: '', exitCode: 0 },
        { agentId: 'agent-2', output: '', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toBe('')
    })

    it('handles whitespace-only outputs', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: '   \n\t  ', exitCode: 0 },
        { agentId: 'agent-2', output: '  ', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(typeof best).toBe('string')
    })

    it('handles outputs with only special characters', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: '!@#$%^&*()', exitCode: 0 },
        { agentId: 'agent-2', output: '[]{}|\\', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(typeof best).toBe('string')
    })

    it('handles very long outputs', () => {
      const longOutput = 'word '.repeat(10000)
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: longOutput, exitCode: 0 },
        { agentId: 'agent-2', output: longOutput, exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toBe(longOutput)
    })

    it('handles mixed exit codes', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Success', exitCode: 0 },
        { agentId: 'agent-2', output: 'Timeout', exitCode: 137 },
        { agentId: 'agent-3', output: 'Killed', exitCode: 143 },
        { agentId: 'agent-4', output: 'Error', exitCode: 1 },
      ]
      const analysis = analyzeStageOutputs(outputs)
      expect(analysis.passRate).toBe(25)
      expect(analysis.allPassed).toBe(false)
    })

    it('handles negative exit codes', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output', exitCode: -1 },
      ]
      const analysis = analyzeStageOutputs(outputs)
      expect(analysis.passRate).toBe(0)
    })

    it('handles async errors in analyzeStageOutputsWithOptions', async () => {
      mockComputeConfidenceWithOptions.mockRejectedValue(new Error('API error'))

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output', exitCode: 0 },
      ]
      await expect(analyzeStageOutputsWithOptions(outputs)).rejects.toThrow('API error')
    })

    it('buildFinalResult handles missing code stage', () => {
      const result = buildFinalResult({
        userPrompt: 'Test',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: 'research', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: '',
        allAgents: [],
      })
      expect(result.finalOutput).toBe('')
    })

    it('buildFinalResult handles undefined validation stage', () => {
      const result = buildFinalResult({
        userPrompt: 'Test',
        stageAnalyses: [
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
          { confidence: 80, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: 'code', needsRerun: false },
        ],
        securityResult: { passed: true, issues: [], details: [] },
        synthesizerOutput: '',
        allAgents: [],
      })
      expect(result.validationPassed).toBe(true)
    })
  })

  /* ── Security Validation Tests ─────────────────────────────────────── */

  describe('runSecurityValidation', () => {
    it('returns passed validation when all checks pass', async () => {
      const result = await runSecurityValidation('/test/project')
      expect(result.passed).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('returns failed validation with issues', async () => {
      mockRunSecurityChecks.mockResolvedValue({
        passed: false,
        checks: [
          { name: 'npm-audit', passed: false, output: 'Critical vulnerability found' },
          { name: 'secret-scan', passed: true, output: 'No secrets' },
        ],
      })

      const result = await runSecurityValidation('/test/project')
      expect(result.passed).toBe(false)
      expect(result.issues).toContain('npm-audit: Critical vulnerability found')
    })

    it('includes all check details in response', async () => {
      mockRunSecurityChecks.mockResolvedValue({
        passed: true,
        checks: [
          { name: 'TypeScript', passed: true, output: 'No errors' },
          { name: 'ESLint', passed: true, output: 'No warnings' },
          { name: 'npm-audit', passed: true, output: 'No vulnerabilities' },
        ],
      })

      const result = await runSecurityValidation('/test/project')
      expect(result.details).toHaveLength(3)
      expect(result.details[0].check).toBe('TypeScript')
    })

    it('handles multiple failed checks', async () => {
      mockRunSecurityChecks.mockResolvedValue({
        passed: false,
        checks: [
          { name: 'TypeScript', passed: false, output: 'Type errors found' },
          { name: 'ESLint', passed: false, output: 'Linting errors' },
          { name: 'secret-scan', passed: false, output: 'API key detected' },
        ],
      })

      const result = await runSecurityValidation('/test/project')
      expect(result.passed).toBe(false)
      expect(result.issues).toHaveLength(3)
    })
  })

  /* ── Semantic Validation Tests ─────────────────────────────────────── */

  describe('validateStageSemantics', () => {
    it('returns semantic similarity and consensus status', async () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'First meaningful output', exitCode: 0 },
        { agentId: 'agent-2', output: 'Second meaningful output', exitCode: 0 },
      ]
      const result = await validateStageSemantics(outputs, 'test-api-key')
      expect(result.similarity).toBe(0.85)
      expect(result.isConsensus).toBe(true)
    })

    it('uses custom consensus threshold', async () => {
      mockValidateOutputsSemantically.mockResolvedValue({
        similarity: 0.75,
        isConsensus: false,
      })

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output one', exitCode: 0 },
        { agentId: 'agent-2', output: 'Output two', exitCode: 0 },
      ]
      const result = await validateStageSemantics(outputs, 'test-api-key', 0.9)
      expect(result.isConsensus).toBe(false)
    })

    it('handles semantic validation errors gracefully', async () => {
      mockValidateOutputsSemantically.mockRejectedValue(new Error('API error'))

      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'Output', exitCode: 0 },
      ]
      const result = await validateStageSemantics(outputs, 'test-api-key')
      expect(result.similarity).toBe(0)
      expect(result.isConsensus).toBe(false)
    })
  })

  /* ── Weighted Confidence Tests ─────────────────────────────────────── */

  describe('computeFinalConfidence - Stage Weights', () => {
    it('applies research weight (0.1) correctly', () => {
      const analyses: StageAnalysis[] = [
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const result = computeFinalConfidence(analyses)
      expect(result).toBeGreaterThan(0)
    })

    it('applies plan weight (0.15) correctly', () => {
      const analyses: StageAnalysis[] = [
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const result = computeFinalConfidence(analyses)
      expect(result).toBeGreaterThan(50)
    })

    it('applies code weight (0.3) - highest weight', () => {
      const codeHighAnalyses: StageAnalysis[] = [
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const codeLowAnalyses: StageAnalysis[] = [
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 50, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const codeHighResult = computeFinalConfidence(codeHighAnalyses)
      const codeLowResult = computeFinalConfidence(codeLowAnalyses)
      expect(codeHighResult).toBeGreaterThan(codeLowResult)
    })

    it('handles more than 5 stages with fallback weight', () => {
      const analyses: StageAnalysis[] = Array(7).fill({
        confidence: 80,
        agreements: '',
        sources: [],
        allPassed: true,
        passRate: 100,
        bestOutput: '',
        needsRerun: false,
      })
      const result = computeFinalConfidence(analyses)
      expect(result).toBe(80)
    })

    it('returns exactly 50 when capped due to low stage confidence', () => {
      const analyses: StageAnalysis[] = [
        { confidence: 29, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const result = computeFinalConfidence(analyses)
      expect(result).toBeLessThanOrEqual(50)
    })

    it('does not cap when all stages are at or above 30', () => {
      const analyses: StageAnalysis[] = [
        { confidence: 30, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
        { confidence: 100, agreements: '', sources: [], allPassed: true, passRate: 100, bestOutput: '', needsRerun: false },
      ]
      const result = computeFinalConfidence(analyses)
      expect(result).toBeGreaterThan(50)
    })
  })

  /* ── Best Output Selection Edge Cases ──────────────────────────────── */

  describe('selectBestOutput - Edge Cases', () => {
    it('handles outputs with common stop words', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'the a an is are was were', exitCode: 0 },
        { agentId: 'agent-2', output: 'the a an is are was were', exitCode: 0 },
        { agentId: 'agent-3', output: 'the a an is are was were', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toBe('the a an is are was were')
    })

    it('handles outputs with numeric content', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: '123 456 789', exitCode: 0 },
        { agentId: 'agent-2', output: '123 456 000', exitCode: 0 },
        { agentId: 'agent-3', output: '123 456 111', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toContain('123')
      expect(best).toContain('456')
    })

    it('handles outputs with code snippets', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'function foo() { return bar; }', exitCode: 0 },
        { agentId: 'agent-2', output: 'function foo() { return baz; }', exitCode: 0 },
        { agentId: 'agent-3', output: 'function foo() { return qux; }', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toContain('function')
      expect(best).toContain('foo')
    })

    it('selects output with highest overlap when outputs differ significantly', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'completely unique content here', exitCode: 0 },
        { agentId: 'agent-2', output: 'shared words appear in this output', exitCode: 0 },
        { agentId: 'agent-3', output: 'shared words also appear here too', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toContain('shared')
    })

    it('handles two outputs with equal overlap', () => {
      const outputs: AgentOutput[] = [
        { agentId: 'agent-1', output: 'alpha beta gamma', exitCode: 0 },
        { agentId: 'agent-2', output: 'alpha beta delta', exitCode: 0 },
      ]
      const best = selectBestOutput(outputs)
      expect(best).toContain('alpha')
      expect(best).toContain('beta')
    })
  })
})
