import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { PactV3, MatchersV3 } from '@pact-foundation/pact'
import path from 'path'

const { like, eachLike, integer, decimal, string, boolean, datetime } = MatchersV3

const provider = new PactV3({
  consumer: 'SwarmUI-Frontend',
  provider: 'SwarmUI-API',
  dir: path.resolve(process.cwd(), 'tests/contract/pacts'),
  logLevel: 'warn',
})

// Note: Pact contract tests are skipped due to pact-core file writing issues
// These tests require proper pact infrastructure setup
describe.skip('Health API Contract', () => {
  describe('GET /api/health', () => {
    it('returns health status with all required fields', async () => {
      await provider
        .given('the server is running')
        .uponReceiving('a request for health status')
        .withRequest({
          method: 'GET',
          path: '/api/health',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            status: string('healthy'),
            version: string('1.0.0'),
            uptime: decimal(123.456),
            timestamp: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2024-02-27T12:00:00.000Z'),
            responseTimeMs: integer(10),
            checks: eachLike({
              name: string('memory'),
              status: string('healthy'),
              message: string('Heap: 50.0% used'),
            }),
            dependencies: eachLike({
              name: string('database'),
              status: string('healthy'),
              latencyMs: integer(5),
              message: string('Sessions: 0, Projects: 0'),
              lastChecked: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2024-02-27T12:00:00.000Z'),
            }),
            details: like({
              activeJobCount: integer(0),
              activeJobIds: [],
              queueDepth: integer(0),
              installedCLIs: eachLike({
                id: string('cursor'),
                installed: boolean(true),
              }),
              memoryUsage: like({
                rss: integer(100000000),
                heapTotal: integer(50000000),
                heapUsed: integer(25000000),
                external: integer(1000000),
                heapUsagePercent: decimal(50.0),
              }),
              systemMemory: like({
                usagePercent: decimal(50.0),
                freeMemMB: integer(8000),
                totalMemMB: integer(16000),
              }),
              cacheStats: like({
                size: integer(0),
                maxSize: integer(100),
                hitRate: decimal(0),
              }),
            }),
          },
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/health`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.status).toBeDefined()
        expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status)
        expect(body.version).toBeDefined()
        expect(body.uptime).toBeGreaterThanOrEqual(0)
        expect(body.timestamp).toBeDefined()
        expect(body.checks).toBeInstanceOf(Array)
        expect(body.dependencies).toBeInstanceOf(Array)
        expect(body.details).toBeDefined()
      })
    })

    it('returns degraded status when queue is overloaded', async () => {
      await provider
        .given('the job queue is overloaded')
        .uponReceiving('a request for health status when degraded')
        .withRequest({
          method: 'GET',
          path: '/api/health',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            status: string('degraded'),
            version: string('1.0.0'),
            uptime: decimal(123.456),
            timestamp: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2024-02-27T12:00:00.000Z'),
            responseTimeMs: integer(10),
            checks: eachLike({
              name: string('job_queue'),
              status: string('degraded'),
              message: string('Queue: 10, Active: 2'),
            }),
            dependencies: eachLike({
              name: string('database'),
              status: string('healthy'),
              lastChecked: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2024-02-27T12:00:00.000Z'),
            }),
            details: like({
              activeJobCount: integer(2),
              queueDepth: integer(10),
            }),
          },
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/health`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.status).toBe('degraded')
        expect(body.checks.some((c: { name: string; status: string }) => c.status === 'degraded')).toBe(true)
      })
    })
  })
})
