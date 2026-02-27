/**
 * Semantic validation using OpenAI embeddings.
 *
 * Provides semantic similarity scoring between agent outputs using
 * text-embedding-3-small model and cosine similarity.
 */

/* ── Types ────────────────────────────────────────────────────────── */

export interface SemanticValidationResult {
  similarity: number
  isConsensus: boolean
  embeddings: number[][]
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[]
    index: number
  }>
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

/* ── Constants ────────────────────────────────────────────────────── */

const EMBEDDING_MODEL = 'text-embedding-3-small'
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'
const DEFAULT_CONSENSUS_THRESHOLD = 0.8
const MIN_TEXT_LENGTH = 20

/* ── Embedding Cache ──────────────────────────────────────────────── */

const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

function getCacheKey(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `emb_${hash}_${text.length}`
}

function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [key, value] of embeddingCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      embeddingCache.delete(key)
    }
  }
}

/* ── Core Functions ───────────────────────────────────────────────── */

/**
 * Get embedding vector for a single text using OpenAI's API.
 */
export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('OpenAI API key is required for semantic validation')
  }

  const normalizedText = text.trim()
  if (normalizedText.length === 0) {
    return []
  }

  const cacheKey = getCacheKey(normalizedText)
  const cached = embeddingCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.embedding
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: normalizedText,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as OpenAIEmbeddingResponse
  const embedding = data.data[0]?.embedding ?? []

  embeddingCache.set(cacheKey, { embedding, timestamp: Date.now() })
  cleanExpiredCache()

  return embedding
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1, where 1 means identical.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  if (magnitude === 0) return 0

  return dotProduct / magnitude
}

/**
 * Compute average pairwise semantic similarity for multiple texts.
 * Returns a value between 0 and 1.
 */
export async function computeSemanticSimilarity(
  texts: string[],
  apiKey: string,
): Promise<number> {
  const meaningful = texts.filter((t) => t.trim().length >= MIN_TEXT_LENGTH)

  if (meaningful.length === 0) return 0
  if (meaningful.length === 1) return 0.5

  const embeddings = await Promise.all(
    meaningful.map((text) => getEmbedding(text, apiKey)),
  )

  const validEmbeddings = embeddings.filter((e) => e.length > 0)
  if (validEmbeddings.length < 2) return 0.5

  let totalSimilarity = 0
  let pairCount = 0

  for (let i = 0; i < validEmbeddings.length; i++) {
    for (let j = i + 1; j < validEmbeddings.length; j++) {
      const sim = cosineSimilarity(validEmbeddings[i], validEmbeddings[j])
      totalSimilarity += (sim + 1) / 2
      pairCount++
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 0
}

/**
 * Validate multiple outputs semantically and determine consensus.
 */
export async function validateOutputsSemantically(
  outputs: string[],
  apiKey: string,
  threshold: number = DEFAULT_CONSENSUS_THRESHOLD,
): Promise<SemanticValidationResult> {
  const meaningful = outputs.filter((o) => o.trim().length >= MIN_TEXT_LENGTH)

  if (meaningful.length === 0) {
    return {
      similarity: 0,
      isConsensus: false,
      embeddings: [],
    }
  }

  if (meaningful.length === 1) {
    const embedding = await getEmbedding(meaningful[0], apiKey)
    return {
      similarity: 0.5,
      isConsensus: false,
      embeddings: [embedding],
    }
  }

  const embeddings = await Promise.all(
    meaningful.map((text) => getEmbedding(text, apiKey)),
  )

  const validEmbeddings = embeddings.filter((e) => e.length > 0)
  if (validEmbeddings.length < 2) {
    return {
      similarity: 0.5,
      isConsensus: false,
      embeddings: validEmbeddings,
    }
  }

  let totalSimilarity = 0
  let pairCount = 0

  for (let i = 0; i < validEmbeddings.length; i++) {
    for (let j = i + 1; j < validEmbeddings.length; j++) {
      const sim = cosineSimilarity(validEmbeddings[i], validEmbeddings[j])
      totalSimilarity += (sim + 1) / 2
      pairCount++
    }
  }

  const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0

  return {
    similarity: avgSimilarity,
    isConsensus: avgSimilarity >= threshold,
    embeddings: validEmbeddings,
  }
}

/**
 * Hybrid confidence scoring that combines Jaccard and semantic similarity.
 * Uses weighted average: 30% Jaccard + 70% Semantic.
 */
export async function computeHybridSimilarity(
  texts: string[],
  jaccardScore: number,
  apiKey: string,
): Promise<{ hybrid: number; semantic: number; jaccard: number }> {
  const semanticScore = await computeSemanticSimilarity(texts, apiKey)

  const hybrid = 0.3 * jaccardScore + 0.7 * semanticScore

  return {
    hybrid,
    semantic: semanticScore,
    jaccard: jaccardScore,
  }
}

/**
 * Clear the embedding cache (useful for testing or memory management).
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear()
}

/**
 * Get current cache statistics.
 */
export function getEmbeddingCacheStats(): { size: number; maxAge: number } {
  let maxAge = 0
  const now = Date.now()

  for (const value of embeddingCache.values()) {
    const age = now - value.timestamp
    if (age > maxAge) maxAge = age
  }

  return {
    size: embeddingCache.size,
    maxAge,
  }
}
