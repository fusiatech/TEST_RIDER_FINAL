/**
 * Confidence scoring engine.
 *
 * Compares N agent outputs using pairwise Jaccard word-overlap similarity,
 * extracts referenced sources (file paths, URLs, package names), and produces
 * a human-readable diff summary of agreements/disagreements.
 */

/* ── Helpers ──────────────────────────────────────────────────── */

/** Normalise a raw output string into a bag of lowercase words. */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./:\\@]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
  return new Set(words)
}

/**
 * Jaccard similarity coefficient for two word sets.
 * Returns a value between 0 (completely disjoint) and 1 (identical).
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1

  let intersectionSize = 0
  for (const word of a) {
    if (b.has(word)) {
      intersectionSize++
    }
  }

  const unionSize = a.size + b.size - intersectionSize
  if (unionSize === 0) return 1
  return intersectionSize / unionSize
}

/* ── Public API ───────────────────────────────────────────────── */

/**
 * Minimum trimmed-output length for an agent output to be considered
 * meaningful.  Anything shorter is likely a crash or empty response
 * and should not inflate the confidence score.
 */
const MIN_MEANINGFUL_LENGTH = 20

/**
 * Compute a confidence score (0–100) from N agent outputs.
 *
 * - Empty or trivially-short outputs (likely crashes) are excluded before
 *   comparison so they cannot inflate the score via empty-vs-empty Jaccard = 1.
 * - With zero meaningful outputs we return 0.
 * - With a single meaningful output there is nothing to compare, so we return 50.
 * - With multiple outputs we calculate the average pairwise Jaccard similarity
 *   and scale it to 0–100.  If average similarity exceeds 0.90 we cap at 95.
 *
 * @param outputs - Array of raw text outputs from agent runs.
 * @returns A confidence score between 0 and 100 (inclusive).
 */
export function computeConfidence(outputs: string[]): number {
  const meaningful = outputs.filter(
    (o) => o.trim().length > MIN_MEANINGFUL_LENGTH,
  )

  if (meaningful.length === 0) return 0
  if (meaningful.length === 1) return 50

  const tokenSets = meaningful.map(tokenize)
  let totalSimilarity = 0
  let pairCount = 0

  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      totalSimilarity += jaccardSimilarity(tokenSets[i], tokenSets[j])
      pairCount++
    }
  }

  const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0

  if (avgSimilarity >= 0.9) return 95

  return Math.round(avgSimilarity * 100)
}

/**
 * Extract notable sources from a single agent output.
 *
 * Looks for:
 * - HTTP(S) URLs
 * - File paths (Unix and Windows style)
 * - npm / PyPI-style package names (`package@version`)
 *
 * @param output - Raw text output from an agent.
 * @returns Deduplicated array of source strings.
 */
export function extractSources(output: string): string[] {
  const sources = new Set<string>()

  // HTTP(S) URLs
  const urlPattern = /https?:\/\/[^\s"'<>)\]]+/g
  let match: RegExpExecArray | null = urlPattern.exec(output)
  while (match !== null) {
    sources.add(match[0].replace(/[.,;:!?]+$/, ''))
    match = urlPattern.exec(output)
  }

  // File paths (Unix-style absolute or relative with extension)
  const filePattern = /(?:\/[\w.@-]+)+\.\w+/g
  match = filePattern.exec(output)
  while (match !== null) {
    sources.add(match[0])
    match = filePattern.exec(output)
  }

  // Windows-style file paths
  const winFilePattern = /[A-Z]:\\(?:[\w.@-]+\\)*[\w.@-]+\.\w+/gi
  match = winFilePattern.exec(output)
  while (match !== null) {
    sources.add(match[0])
    match = winFilePattern.exec(output)
  }

  // npm-style package references (e.g. react@18.2.0)
  const pkgPattern = /(?:^|\s)(@?[\w-]+(?:\/[\w-]+)?)@(\d+[\w.-]*)/g
  match = pkgPattern.exec(output)
  while (match !== null) {
    sources.add(`${match[1]}@${match[2]}`)
    match = pkgPattern.exec(output)
  }

  return [...sources]
}

/**
 * Produce a human-readable diff summary describing where multiple agent
 * outputs agree and where they disagree.
 *
 * @param outputs - Array of raw text outputs from agent runs.
 * @returns A Markdown-formatted summary string.
 */
export function diffOutputs(outputs: string[]): string {
  if (outputs.length === 0) return 'No outputs to compare.'
  if (outputs.length === 1) return 'Only one output — nothing to compare.'

  const tokenSets = outputs.map(tokenize)

  // Words present in ALL outputs
  const commonWords = new Set<string>()
  for (const word of tokenSets[0]) {
    if (tokenSets.every((s) => s.has(word))) {
      commonWords.add(word)
    }
  }

  // Words unique to each output (present only in that output)
  const uniquePerAgent: string[][] = tokenSets.map((tokens, idx) => {
    const unique: string[] = []
    for (const word of tokens) {
      const onlyHere = tokenSets.every((other, otherIdx) => {
        return otherIdx === idx || !other.has(word)
      })
      if (onlyHere) {
        unique.push(word)
      }
    }
    return unique
  })

  const lines: string[] = []
  lines.push(`## Output Comparison (${outputs.length} agents)`)
  lines.push('')
  lines.push(
    `**Shared vocabulary:** ${commonWords.size} words appear in all outputs.`
  )
  lines.push('')

  for (let i = 0; i < outputs.length; i++) {
    const uniqueCount = uniquePerAgent[i].length
    const sample = uniquePerAgent[i].slice(0, 10).join(', ')
    lines.push(
      `**Agent ${i + 1}:** ${tokenSets[i].size} words total, ${uniqueCount} unique.${sample ? ` Sample unique: ${sample}` : ''}`
    )
  }

  lines.push('')

  // Pairwise similarity summary
  lines.push('### Pairwise Similarity')
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const sim = jaccardSimilarity(tokenSets[i], tokenSets[j])
      lines.push(
        `- Agent ${i + 1} vs Agent ${j + 1}: ${(sim * 100).toFixed(1)}%`
      )
    }
  }

  return lines.join('\n')
}
