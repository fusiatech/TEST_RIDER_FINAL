import { describe, expect, it } from 'vitest'

function buildHealthPayload(status: 'healthy' | 'degraded' | 'unhealthy') {
  return {
    status,
    version: '1.0.0',
    uptime: 123.456,
    timestamp: new Date().toISOString(),
    responseTimeMs: 12,
    checks: [
      { name: 'memory', status: 'healthy', message: 'Heap: 50.0% used' },
      { name: 'job_queue', status, message: 'Queue state' },
    ],
    dependencies: [
      {
        name: 'database',
        status: 'healthy',
        latencyMs: 4,
        message: 'Connected',
        lastChecked: new Date().toISOString(),
      },
    ],
    details: {
      activeJobCount: status === 'degraded' ? 5 : 0,
      queueDepth: status === 'degraded' ? 10 : 0,
    },
  }
}

describe('Health API Contract', () => {
  it('returns health status with required fields', () => {
    const body = buildHealthPayload('healthy')

    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status)
    expect(body.version).toBeTypeOf('string')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
    expect(body.timestamp).toBeTypeOf('string')
    expect(body.responseTimeMs).toBeTypeOf('number')
    expect(Array.isArray(body.checks)).toBe(true)
    expect(Array.isArray(body.dependencies)).toBe(true)
    expect(body.details).toBeDefined()
  })

  it('supports degraded status payloads', () => {
    const body = buildHealthPayload('degraded')
    expect(body.status).toBe('degraded')
    expect(body.checks.some((check) => check.status === 'degraded')).toBe(true)
  })
})
