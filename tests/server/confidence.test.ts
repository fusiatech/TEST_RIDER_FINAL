import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeConfidence,
  computeJaccardConfidence,
  computeConfidenceWithOptions,
  computeSemanticConfidence,
  extractSources,
  diffOutputs,
} from '@/server/confidence'

vi.mock('@/server/semantic-validator', () => ({
  computeSemanticSimilarity: vi.fn().mockResolvedValue(0.85),
  computeHybridSimilarity: vi.fn().mockResolvedValue({
    hybrid: 0.88,
    semantic: 0.85,
  }),
}))

describe('confidence.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeJaccardConfidence', () => {
    it('returns 0 for empty outputs array', () => {
      expect(computeJaccardConfidence([])).toBe(0)
    })

    it('returns 0 for outputs with only short/empty strings', () => {
      expect(computeJaccardConfidence(['', 'short', 'tiny'])).toBe(0)
    })

    it('returns 0 for outputs with only whitespace', () => {
      expect(computeJaccardConfidence(['   ', '\t\n', '  \r\n  '])).toBe(0)
    })

    it('returns 0 for outputs exactly at MIN_MEANINGFUL_LENGTH threshold', () => {
      const exactly20chars = '12345678901234567890'
      expect(computeJaccardConfidence([exactly20chars])).toBe(0)
    })

    it('returns 50 for single meaningful output', () => {
      const output = 'This is a meaningful output that is long enough to be considered valid'
      expect(computeJaccardConfidence([output])).toBe(50)
    })

    it('returns 50 for single output just over MIN_MEANINGFUL_LENGTH', () => {
      const output = '123456789012345678901'
      expect(computeJaccardConfidence([output])).toBe(50)
    })

    it('returns high score for identical outputs', () => {
      const output = 'This is a meaningful output with enough words to be considered valid for testing'
      const score = computeJaccardConfidence([output, output, output])
      expect(score).toBe(95)
    })

    it('returns 95 for outputs with similarity >= 0.9', () => {
      const output1 = 'The quick brown fox jumps over the lazy dog today'
      const output2 = 'The quick brown fox jumps over the lazy dog now'
      const score = computeJaccardConfidence([output1, output2])
      expect(score).toBe(95)
    })

    it('returns lower score for different outputs', () => {
      const output1 = 'The quick brown fox jumps over the lazy dog in the park'
      const output2 = 'A slow red cat sleeps under the active cat in the house'
      const score = computeJaccardConfidence([output1, output2])
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(50)
    })

    it('returns 0 for completely disjoint outputs', () => {
      const output1 = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
      const output2 = 'one two three four five six seven eight nine ten eleven'
      const score = computeJaccardConfidence([output1, output2])
      expect(score).toBe(0)
    })

    it('returns moderate score for partially similar outputs', () => {
      const output1 = 'Install react and typescript using npm install react typescript'
      const output2 = 'Use npm install to add react and typescript to your project'
      const score = computeJaccardConfidence([output1, output2])
      expect(score).toBeGreaterThan(30)
      expect(score).toBeLessThan(90)
    })

    it('filters out short outputs before comparison', () => {
      const meaningful1 = 'This is a meaningful output with enough content to be valid'
      const meaningful2 = 'This is another meaningful output with enough content to be valid'
      const short = 'too short'
      const score = computeJaccardConfidence([meaningful1, meaningful2, short])
      const scoreWithoutShort = computeJaccardConfidence([meaningful1, meaningful2])
      expect(score).toBe(scoreWithoutShort)
    })

    it('caps score at 95 for very high similarity', () => {
      const base = 'The implementation uses react hooks for state management in the component'
      const similar = 'The implementation uses react hooks for state management in the component file'
      const score = computeJaccardConfidence([base, similar])
      expect(score).toBeLessThanOrEqual(95)
    })

    it('handles special characters in tokenization', () => {
      const output1 = 'Check file at /path/to/file.ts and https://example.com/api'
      const output2 = 'Check file at /path/to/file.ts and https://example.com/api'
      const score = computeJaccardConfidence([output1, output2])
      expect(score).toBe(95)
    })

    it('handles multiple outputs with varying similarity', () => {
      const output1 = 'React hooks are great for state management in components'
      const output2 = 'React hooks are excellent for state management in components'
      const output3 = 'Vue composition API is great for state management in components'
      const score = computeJaccardConfidence([output1, output2, output3])
      expect(score).toBeGreaterThan(50)
      expect(score).toBeLessThan(95)
    })
  })

  describe('computeConfidence', () => {
    it('delegates to computeJaccardConfidence', () => {
      const output = 'This is a meaningful output with enough words to be valid'
      expect(computeConfidence([output])).toBe(computeJaccardConfidence([output]))
    })
  })

  describe('computeConfidenceWithOptions', () => {
    it('returns jaccard-only result when semantic validation disabled', async () => {
      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: false,
      })
      expect(result.method).toBe('jaccard')
      expect(result.score).toBe(result.jaccardScore)
      expect(result.semanticScore).toBeUndefined()
    })

    it('returns jaccard-only result when no API key provided', async () => {
      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: '',
      })
      expect(result.method).toBe('jaccard')
    })

    it('returns jaccard-only result when API key is whitespace only', async () => {
      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: '   \t\n  ',
      })
      expect(result.method).toBe('jaccard')
    })

    it('returns jaccard-only result when no options provided', async () => {
      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const result = await computeConfidenceWithOptions(outputs)
      expect(result.method).toBe('jaccard')
    })

    it('returns jaccard-only result for single meaningful output', async () => {
      const outputs = ['Single meaningful output with enough content for testing']
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: 'test-key',
      })
      expect(result.method).toBe('jaccard')
      expect(result.score).toBe(50)
    })

    it('returns jaccard-only result for zero meaningful outputs', async () => {
      const outputs = ['short', 'tiny', '']
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: 'test-key',
      })
      expect(result.method).toBe('jaccard')
      expect(result.score).toBe(0)
    })

    it('uses hybrid method when semantic validation enabled with API key', async () => {
      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: 'test-api-key',
      })
      expect(result.method).toBe('hybrid')
      expect(result.semanticScore).toBeDefined()
    })

    it('caps hybrid score at 95', async () => {
      const { computeHybridSimilarity } = await import('@/server/semantic-validator')
      vi.mocked(computeHybridSimilarity).mockResolvedValueOnce({
        hybrid: 0.99,
        semantic: 0.99,
        jaccard: 0.99,
      })

      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: 'test-api-key',
      })
      expect(result.score).toBeLessThanOrEqual(95)
    })

    it('falls back to jaccard on semantic validation error', async () => {
      const { computeHybridSimilarity } = await import('@/server/semantic-validator')
      vi.mocked(computeHybridSimilarity).mockRejectedValueOnce(new Error('API error'))

      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const result = await computeConfidenceWithOptions(outputs, {
        useSemanticValidation: true,
        openaiApiKey: 'test-api-key',
      })
      expect(result.method).toBe('jaccard')
    })
  })

  describe('computeSemanticConfidence', () => {
    it('returns 0 for empty outputs', async () => {
      const score = await computeSemanticConfidence([], 'test-key')
      expect(score).toBe(0)
    })

    it('returns 0 for outputs with only short strings', async () => {
      const score = await computeSemanticConfidence(['short', 'tiny', ''], 'test-key')
      expect(score).toBe(0)
    })

    it('returns 50 for single meaningful output', async () => {
      const score = await computeSemanticConfidence(
        ['Single meaningful output with enough content for testing'],
        'test-key'
      )
      expect(score).toBe(50)
    })

    it('returns semantic score for multiple outputs', async () => {
      const score = await computeSemanticConfidence(
        [
          'First meaningful output with enough content for testing purposes',
          'Second meaningful output with enough content for testing purposes',
        ],
        'test-key'
      )
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(95)
    })

    it('caps semantic score at 95', async () => {
      const { computeSemanticSimilarity } = await import('@/server/semantic-validator')
      vi.mocked(computeSemanticSimilarity).mockResolvedValueOnce(0.99)

      const score = await computeSemanticConfidence(
        [
          'First meaningful output with enough content for testing purposes',
          'Second meaningful output with enough content for testing purposes',
        ],
        'test-key'
      )
      expect(score).toBeLessThanOrEqual(95)
    })

    it('falls back to jaccard on error', async () => {
      const { computeSemanticSimilarity } = await import('@/server/semantic-validator')
      vi.mocked(computeSemanticSimilarity).mockRejectedValueOnce(new Error('API error'))

      const outputs = [
        'First meaningful output with enough content for testing purposes',
        'Second meaningful output with enough content for testing purposes',
      ]
      const score = await computeSemanticConfidence(outputs, 'test-key')
      expect(score).toBe(computeJaccardConfidence(outputs))
    })
  })

  describe('extractSources', () => {
    it('extracts HTTP URLs', () => {
      const output = 'Check out https://example.com/docs and http://test.org/api'
      const sources = extractSources(output)
      expect(sources).toContain('https://example.com/docs')
      expect(sources).toContain('http://test.org/api')
    })

    it('extracts URLs with query parameters', () => {
      const output = 'Visit https://example.com/search?q=test&page=1'
      const sources = extractSources(output)
      expect(sources).toContain('https://example.com/search?q=test&page=1')
    })

    it('extracts URLs with fragments', () => {
      const output = 'See https://example.com/docs#section-1'
      const sources = extractSources(output)
      expect(sources).toContain('https://example.com/docs#section-1')
    })

    it('extracts Unix file paths', () => {
      const output = 'Edit the file at /src/components/Button.tsx'
      const sources = extractSources(output)
      expect(sources).toContain('/src/components/Button.tsx')
    })

    it('extracts nested Unix file paths', () => {
      const output = 'Check /home/user/.config/app/settings.json'
      const sources = extractSources(output)
      expect(sources).toContain('/home/user/.config/app/settings.json')
    })

    it('extracts Windows file paths', () => {
      const output = 'The config is at C:\\Users\\test\\config.json'
      const sources = extractSources(output)
      expect(sources).toContain('C:\\Users\\test\\config.json')
    })

    it('extracts Windows file paths with lowercase drive letter', () => {
      const output = 'Check d:\\projects\\app\\index.ts'
      const sources = extractSources(output)
      expect(sources).toContain('d:\\projects\\app\\index.ts')
    })

    it('extracts npm package references', () => {
      const output = 'Install react@18.2.0 and typescript@5.0.0'
      const sources = extractSources(output)
      expect(sources).toContain('react@18.2.0')
      expect(sources).toContain('typescript@5.0.0')
    })

    it('extracts package references with prerelease versions', () => {
      const output = 'Use next@14.0.0-canary.1 for testing'
      const sources = extractSources(output)
      expect(sources).toContain('next@14.0.0-canary.1')
    })

    it('extracts scoped package references', () => {
      const output = 'Use @types/node@20.0.0 for type definitions'
      const sources = extractSources(output)
      expect(sources).toContain('@types/node@20.0.0')
    })

    it('extracts scoped package with organization', () => {
      const output = 'Install @babel/core@7.23.0 for transpilation'
      const sources = extractSources(output)
      expect(sources).toContain('@babel/core@7.23.0')
    })

    it('removes trailing punctuation from URLs', () => {
      const output = 'See https://example.com/page.'
      const sources = extractSources(output)
      expect(sources).toContain('https://example.com/page')
      expect(sources).not.toContain('https://example.com/page.')
    })

    it('removes multiple trailing punctuation marks', () => {
      const output = 'Check https://example.com/api...'
      const sources = extractSources(output)
      expect(sources).toContain('https://example.com/api')
    })

    it('removes trailing comma and semicolon from URLs', () => {
      const output = 'URLs: https://a.com/x, https://b.com/y; done'
      const sources = extractSources(output)
      expect(sources).toContain('https://a.com/x')
      expect(sources).toContain('https://b.com/y')
    })

    it('returns empty array for output with no sources', () => {
      const output = 'This is just plain text without any sources'
      const sources = extractSources(output)
      expect(sources).toHaveLength(0)
    })

    it('returns empty array for empty string', () => {
      const sources = extractSources('')
      expect(sources).toHaveLength(0)
    })

    it('deduplicates sources', () => {
      const output = 'Check /src/file.ts and then /src/file.ts again'
      const sources = extractSources(output)
      const fileCount = sources.filter((s) => s === '/src/file.ts').length
      expect(fileCount).toBe(1)
    })

    it('extracts mixed source types', () => {
      const output = `
        Install react@18.2.0 from https://npmjs.com/package/react
        Edit /src/App.tsx or C:\\project\\App.tsx
      `
      const sources = extractSources(output)
      expect(sources.length).toBeGreaterThanOrEqual(4)
      expect(sources).toContain('react@18.2.0')
      expect(sources).toContain('https://npmjs.com/package/react')
      expect(sources).toContain('/src/App.tsx')
      expect(sources).toContain('C:\\project\\App.tsx')
    })
  })

  describe('diffOutputs', () => {
    it('returns message for empty outputs', () => {
      const diff = diffOutputs([])
      expect(diff).toBe('No outputs to compare.')
    })

    it('returns message for single output', () => {
      const diff = diffOutputs(['Single output'])
      expect(diff).toBe('Only one output — nothing to compare.')
    })

    it('includes shared vocabulary count', () => {
      const outputs = [
        'The quick brown fox jumps over the lazy dog',
        'The quick brown cat jumps over the lazy mouse',
      ]
      const diff = diffOutputs(outputs)
      expect(diff).toContain('Shared vocabulary:')
      expect(diff).toContain('words appear in all outputs')
    })

    it('includes agent word counts', () => {
      const outputs = [
        'First agent output with some words',
        'Second agent output with different words',
      ]
      const diff = diffOutputs(outputs)
      expect(diff).toContain('Agent 1:')
      expect(diff).toContain('Agent 2:')
      expect(diff).toContain('words total')
    })

    it('includes unique word count for each agent', () => {
      const outputs = [
        'apple banana cherry date elderberry fig grape',
        'honeydew kiwi lemon mango nectarine orange papaya',
      ]
      const diff = diffOutputs(outputs)
      expect(diff).toMatch(/Agent 1:.*\d+ words total, \d+ unique/)
      expect(diff).toMatch(/Agent 2:.*\d+ words total, \d+ unique/)
    })

    it('includes pairwise similarity section', () => {
      const outputs = [
        'First meaningful output here',
        'Second meaningful output here',
        'Third meaningful output here',
      ]
      const diff = diffOutputs(outputs)
      expect(diff).toContain('Pairwise Similarity')
      expect(diff).toContain('Agent 1 vs Agent 2')
      expect(diff).toContain('Agent 1 vs Agent 3')
      expect(diff).toContain('Agent 2 vs Agent 3')
    })

    it('shows unique word samples when present', () => {
      const outputs = [
        'apple banana cherry date elderberry',
        'fig grape honeydew kiwi lemon',
      ]
      const diff = diffOutputs(outputs)
      expect(diff).toContain('unique')
      expect(diff).toContain('Sample unique:')
    })

    it('handles outputs with no unique words', () => {
      const outputs = [
        'the same words here',
        'the same words here',
      ]
      const diff = diffOutputs(outputs)
      expect(diff).toContain('0 unique')
    })

    it('limits unique word sample to 10 words', () => {
      const output1 = 'a b c d e f g h i j k l m n o p q r s t u v w x y z'
      const output2 = 'one two three four five six seven eight nine ten'
      const diff = diffOutputs([output1, output2])
      const sampleMatch = diff.match(/Sample unique: ([^*\n]+)/)
      if (sampleMatch) {
        const sampleWords = sampleMatch[1].split(', ')
        expect(sampleWords.length).toBeLessThanOrEqual(10)
      }
    })

    it('formats output as markdown', () => {
      const outputs = ['Output one', 'Output two']
      const diff = diffOutputs(outputs)
      expect(diff).toContain('##')
      expect(diff).toContain('**')
    })

    it('includes header with agent count', () => {
      const outputs = ['Output one', 'Output two', 'Output three']
      const diff = diffOutputs(outputs)
      expect(diff).toContain('## Output Comparison (3 agents)')
    })

    it('shows percentage in pairwise similarity', () => {
      const outputs = ['Hello world test', 'Hello world demo']
      const diff = diffOutputs(outputs)
      expect(diff).toMatch(/Agent 1 vs Agent 2: \d+\.\d+%/)
    })

    it('handles identical outputs', () => {
      const output = 'Identical text content here'
      const diff = diffOutputs([output, output])
      expect(diff).toContain('100.0%')
    })

    it('handles completely different outputs', () => {
      const outputs = [
        'alpha beta gamma delta',
        'one two three four',
      ]
      const diff = diffOutputs(outputs)
      expect(diff).toContain('0.0%')
    })

    it('handles four or more agents', () => {
      const outputs = ['A B C', 'D E F', 'G H I', 'J K L']
      const diff = diffOutputs(outputs)
      expect(diff).toContain('Agent 1 vs Agent 2')
      expect(diff).toContain('Agent 1 vs Agent 3')
      expect(diff).toContain('Agent 1 vs Agent 4')
      expect(diff).toContain('Agent 2 vs Agent 3')
      expect(diff).toContain('Agent 2 vs Agent 4')
      expect(diff).toContain('Agent 3 vs Agent 4')
    })
  })
})
