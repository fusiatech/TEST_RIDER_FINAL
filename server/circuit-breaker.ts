import { createLogger } from '@/server/logger'

const logger = createLogger('circuit-breaker')

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitSnapshot {
  provider: string
  state: CircuitState
  failures: number
  successes: number
  openedAt?: number
  lastFailureAt?: number
}

interface CircuitConfig {
  failureThreshold: number
  resetTimeoutMs: number
}

interface CircuitRuntime extends CircuitSnapshot {
  config: CircuitConfig
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
}

const circuits = new Map<string, CircuitRuntime>()

function getOrCreate(provider: string, config?: Partial<CircuitConfig>): CircuitRuntime {
  const existing = circuits.get(provider)
  if (existing) return existing
  const created: CircuitRuntime = {
    provider,
    state: 'closed',
    failures: 0,
    successes: 0,
    config: {
      ...DEFAULT_CONFIG,
      ...(config ?? {}),
    },
  }
  circuits.set(provider, created)
  return created
}

function canExecute(circuit: CircuitRuntime): boolean {
  if (circuit.state === 'closed') return true
  if (circuit.state === 'half-open') return true
  if (!circuit.openedAt) return false
  const expired = Date.now() - circuit.openedAt >= circuit.config.resetTimeoutMs
  if (expired) {
    circuit.state = 'half-open'
    return true
  }
  return false
}

function markFailure(circuit: CircuitRuntime, error: unknown): void {
  circuit.failures++
  circuit.lastFailureAt = Date.now()
  if (circuit.state === 'half-open' || circuit.failures >= circuit.config.failureThreshold) {
    circuit.state = 'open'
    circuit.openedAt = Date.now()
    logger.warn('Circuit opened', {
      provider: circuit.provider,
      failures: circuit.failures,
      threshold: circuit.config.failureThreshold,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function markSuccess(circuit: CircuitRuntime): void {
  circuit.successes++
  circuit.failures = 0
  circuit.state = 'closed'
  circuit.openedAt = undefined
}

export async function executeWithCircuitBreaker<T>(
  provider: string,
  operation: string,
  fn: () => Promise<T> | T,
  config?: Partial<CircuitConfig>
): Promise<T> {
  const circuit = getOrCreate(provider, config)
  if (!canExecute(circuit)) {
    throw new Error(`Circuit open for provider "${provider}"`)
  }
  try {
    const result = await fn()
    markSuccess(circuit)
    return result
  } catch (error) {
    markFailure(circuit, error)
    throw error instanceof Error ? error : new Error(`${operation} failed`)
  }
}

export function executeWithCircuitBreakerSync<T>(
  provider: string,
  operation: string,
  fn: () => T,
  config?: Partial<CircuitConfig>
): T {
  const circuit = getOrCreate(provider, config)
  if (!canExecute(circuit)) {
    throw new Error(`Circuit open for provider "${provider}"`)
  }
  try {
    const result = fn()
    markSuccess(circuit)
    return result
  } catch (error) {
    markFailure(circuit, error)
    throw error instanceof Error ? error : new Error(`${operation} failed`)
  }
}

export function getCircuitSnapshots(): CircuitSnapshot[] {
  return Array.from(circuits.values()).map((c) => ({
    provider: c.provider,
    state: c.state,
    failures: c.failures,
    successes: c.successes,
    openedAt: c.openedAt,
    lastFailureAt: c.lastFailureAt,
  }))
}
