import { createHash } from 'crypto'

interface CacheEntry {
  output: string
  provider: string
  timestamp: number
  confidence: number
}

const cache = new Map<string, CacheEntry>()
const MAX_CACHE_SIZE = 100
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

let hits = 0
let misses = 0

function hashPrompt(prompt: string, provider: string): string {
  return createHash('sha256')
    .update(`${provider}:${prompt}`)
    .digest('hex')
    .slice(0, 16)
}

function evictStale(): void {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key)
    }
  }
}

function evictLRU(): void {
  if (cache.size <= MAX_CACHE_SIZE) return
  // Evict the oldest entry by timestamp
  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [key, entry] of cache) {
    if (entry.timestamp < oldestTime) {
      oldestTime = entry.timestamp
      oldestKey = key
    }
  }
  if (oldestKey !== null) {
    cache.delete(oldestKey)
  }
}

export function getCachedOutput(
  prompt: string,
  provider: string,
): CacheEntry | undefined {
  evictStale()
  const key = hashPrompt(prompt, provider)
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp <= CACHE_TTL_MS) {
    hits++
    return entry
  }
  misses++
  return undefined
}

export function setCachedOutput(
  prompt: string,
  provider: string,
  output: string,
  confidence: number,
): void {
  const key = hashPrompt(prompt, provider)
  cache.set(key, {
    output,
    provider,
    timestamp: Date.now(),
    confidence,
  })
  evictLRU()
}

export function clearCache(): void {
  cache.clear()
  hits = 0
  misses = 0
}

export function getCacheStats(): {
  size: number
  hits: number
  misses: number
} {
  return { size: cache.size, hits, misses }
}
