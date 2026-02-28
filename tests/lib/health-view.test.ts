import { describe, expect, it } from 'vitest'
import { normalizeHealthData } from '@/lib/health-view'

describe('normalizeHealthData', () => {
  it('normalizes canonical /api/health details payload', () => {
    const normalized = normalizeHealthData({
      status: 'healthy',
      version: '1.0.0',
      uptime: 120,
      details: {
        activeJobCount: 2,
        queueDepth: 3,
        installedCLIs: [{ id: 'cursor', installed: true }],
        memoryUsage: {
          rss: 100,
          heapTotal: 200,
          heapUsed: 50,
          external: 10,
        },
        systemMemory: {
          usagePercent: 42,
          freeMemMB: 1000,
          totalMemMB: 2000,
        },
      },
    })

    expect(normalized).not.toBeNull()
    expect(normalized?.activeJobCount).toBe(2)
    expect(normalized?.memoryUsage.heapTotal).toBe(200)
    expect(normalized?.memoryUsage.heapUsed).toBe(50)
    expect(normalized?.systemMemory?.usagePercent).toBe(42)
  })

  it('falls back safely when memory fields are partial or missing', () => {
    const normalized = normalizeHealthData({
      status: 'degraded',
      details: {
        activeJobCount: 0,
        queueDepth: 0,
        installedCLIs: [],
      },
    })

    expect(normalized).not.toBeNull()
    expect(normalized?.memoryUsage.heapTotal).toBeGreaterThan(0)
    expect(normalized?.memoryUsage.heapUsed).toBe(0)
    expect(normalized?.status).toBe('degraded')
  })

  it('supports legacy flattened payload shape', () => {
    const normalized = normalizeHealthData({
      status: 'unhealthy',
      uptime: 55,
      activeJobCount: 1,
      queueDepth: 9,
      installedCLIs: [{ id: 'gemini', installed: false }],
      memoryUsage: {
        rss: 1,
        heapTotal: 2,
        heapUsed: 3,
        external: 0,
      },
    })

    expect(normalized).not.toBeNull()
    expect(normalized?.activeJobCount).toBe(1)
    expect(normalized?.queueDepth).toBe(9)
    expect(normalized?.memoryUsage.heapUsed).toBeLessThanOrEqual(
      normalized?.memoryUsage.heapTotal ?? 0,
    )
  })
})
