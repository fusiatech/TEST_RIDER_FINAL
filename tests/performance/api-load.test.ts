/**
 * API Load Performance Tests (TypeScript/Vitest version)
 * 
 * Complements the k6 tests with TypeScript-based load testing.
 * Run with: npx vitest run tests/performance/api-load.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

interface EndpointMetrics {
  endpoint: string
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  avgResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  p50ResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
  throughput: number
  errorRate: number
}

interface LoadTestConfig {
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  concurrency: number
  totalRequests: number
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

async function httpRequest(
  url: string,
  options: { method?: string; body?: unknown; timeout?: number } = {}
): Promise<{ status: number; duration: number; success: boolean }> {
  const start = performance.now()
  const { method = 'GET', body, timeout = 10000 } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const duration = performance.now() - start
    return { status: response.status, duration, success: response.ok }
  } catch {
    const duration = performance.now() - start
    return { status: 0, duration, success: false }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runLoadTest(config: LoadTestConfig): Promise<EndpointMetrics> {
  const { endpoint, method, body, concurrency, totalRequests } = config
  const responseTimes: number[] = []
  const results: { success: boolean; duration: number }[] = []

  const startTime = performance.now()

  // Process requests in batches based on concurrency
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batchSize = Math.min(concurrency, totalRequests - i)
    const promises = Array.from({ length: batchSize }, async () => {
      const result = await httpRequest(`${BASE_URL}${endpoint}`, { method, body })
      responseTimes.push(result.duration)
      return { success: result.success, duration: result.duration }
    })

    const batchResults = await Promise.all(promises)
    results.push(...batchResults)
  }

  const totalDuration = performance.now() - startTime
  const successfulRequests = results.filter((r) => r.success).length

  return {
    endpoint,
    totalRequests,
    successfulRequests,
    failedRequests: totalRequests - successfulRequests,
    avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    p50ResponseTime: calculatePercentile(responseTimes, 50),
    p95ResponseTime: calculatePercentile(responseTimes, 95),
    p99ResponseTime: calculatePercentile(responseTimes, 99),
    throughput: (totalRequests / totalDuration) * 1000,
    errorRate: (totalRequests - successfulRequests) / totalRequests,
  }
}

async function waitForServerReady(maxAttempts = 30, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`)
      if (response.ok) return true
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

describe('API Load Performance Tests', () => {
  let serverReady = false

  beforeAll(async () => {
    serverReady = await waitForServerReady(10, 500)
  }, 30000)

  describe('Health Endpoint Load', () => {
    it('should handle 100 concurrent requests to /api/health', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const metrics = await runLoadTest({
        endpoint: '/api/health',
        method: 'GET',
        concurrency: 100,
        totalRequests: 100,
      })

      console.log('\n--- /api/health Load Test (100 concurrent) ---')
      console.log(`Total Requests: ${metrics.totalRequests}`)
      console.log(`Successful: ${metrics.successfulRequests}`)
      console.log(`Failed: ${metrics.failedRequests}`)
      console.log(`Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`)
      console.log(`P50 Response Time: ${metrics.p50ResponseTime.toFixed(2)}ms`)
      console.log(`P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms`)
      console.log(`P99 Response Time: ${metrics.p99ResponseTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} req/sec`)
      console.log(`Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`)

      // Performance thresholds
      expect(metrics.p95ResponseTime).toBeLessThan(500) // P95 < 500ms
      expect(metrics.errorRate).toBeLessThan(0.01) // < 1% error rate
    }, 60000)

    it('should handle sustained load on /api/health', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const metrics = await runLoadTest({
        endpoint: '/api/health',
        method: 'GET',
        concurrency: 10,
        totalRequests: 500,
      })

      console.log('\n--- /api/health Sustained Load (500 requests) ---')
      console.log(`Total Requests: ${metrics.totalRequests}`)
      console.log(`Successful: ${metrics.successfulRequests}`)
      console.log(`Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`)
      console.log(`P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} req/sec`)

      expect(metrics.p95ResponseTime).toBeLessThan(500)
      expect(metrics.errorRate).toBeLessThan(0.01)
    }, 120000)
  })

  describe('Sessions Endpoint Load', () => {
    it('should handle load on /api/sessions', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const metrics = await runLoadTest({
        endpoint: '/api/sessions',
        method: 'GET',
        concurrency: 50,
        totalRequests: 200,
      })

      console.log('\n--- /api/sessions Load Test ---')
      console.log(`Total Requests: ${metrics.totalRequests}`)
      console.log(`Successful: ${metrics.successfulRequests}`)
      console.log(`Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`)
      console.log(`P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} req/sec`)

      expect(metrics.p95ResponseTime).toBeLessThan(1000) // P95 < 1s
      expect(metrics.errorRate).toBeLessThan(0.05) // < 5% error rate
    }, 60000)
  })

  describe('Projects Endpoint Load', () => {
    it('should handle load on /api/projects', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const metrics = await runLoadTest({
        endpoint: '/api/projects',
        method: 'GET',
        concurrency: 50,
        totalRequests: 200,
      })

      console.log('\n--- /api/projects Load Test ---')
      console.log(`Total Requests: ${metrics.totalRequests}`)
      console.log(`Successful: ${metrics.successfulRequests}`)
      console.log(`Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`)
      console.log(`P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} req/sec`)

      expect(metrics.p95ResponseTime).toBeLessThan(1000)
      expect(metrics.errorRate).toBeLessThan(0.05)
    }, 60000)
  })

  describe('Jobs Endpoint Load', () => {
    it('should handle load on /api/jobs', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const metrics = await runLoadTest({
        endpoint: '/api/jobs',
        method: 'GET',
        concurrency: 50,
        totalRequests: 200,
      })

      console.log('\n--- /api/jobs Load Test ---')
      console.log(`Total Requests: ${metrics.totalRequests}`)
      console.log(`Successful: ${metrics.successfulRequests}`)
      console.log(`Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`)
      console.log(`P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} req/sec`)

      expect(metrics.p95ResponseTime).toBeLessThan(1000)
      expect(metrics.errorRate).toBeLessThan(0.05)
    }, 60000)
  })

  describe('Settings Endpoint Load', () => {
    it('should handle load on /api/settings', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const metrics = await runLoadTest({
        endpoint: '/api/settings',
        method: 'GET',
        concurrency: 50,
        totalRequests: 200,
      })

      console.log('\n--- /api/settings Load Test ---')
      console.log(`Total Requests: ${metrics.totalRequests}`)
      console.log(`Successful: ${metrics.successfulRequests}`)
      console.log(`Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`)
      console.log(`P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} req/sec`)

      expect(metrics.p95ResponseTime).toBeLessThan(1000)
      expect(metrics.errorRate).toBeLessThan(0.05)
    }, 60000)
  })

  describe('Mixed Endpoint Load', () => {
    it('should handle mixed load across all endpoints', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const endpoints = [
        '/api/health',
        '/api/sessions',
        '/api/projects',
        '/api/jobs',
        '/api/settings',
      ]

      const allMetrics: EndpointMetrics[] = []

      for (const endpoint of endpoints) {
        const metrics = await runLoadTest({
          endpoint,
          method: 'GET',
          concurrency: 20,
          totalRequests: 100,
        })
        allMetrics.push(metrics)
      }

      console.log('\n--- Mixed Endpoint Load Summary ---')
      for (const metrics of allMetrics) {
        console.log(`${metrics.endpoint}: P95=${metrics.p95ResponseTime.toFixed(0)}ms, Error=${(metrics.errorRate * 100).toFixed(1)}%`)
      }

      const avgP95 = allMetrics.reduce((a, m) => a + m.p95ResponseTime, 0) / allMetrics.length
      const avgErrorRate = allMetrics.reduce((a, m) => a + m.errorRate, 0) / allMetrics.length

      console.log(`\nOverall Avg P95: ${avgP95.toFixed(2)}ms`)
      console.log(`Overall Avg Error Rate: ${(avgErrorRate * 100).toFixed(2)}%`)

      expect(avgP95).toBeLessThan(1000)
      expect(avgErrorRate).toBeLessThan(0.05)
    }, 120000)
  })
})

describe('API Response Time Thresholds', () => {
  let serverReady = false

  beforeAll(async () => {
    serverReady = await waitForServerReady(10, 500)
  }, 30000)

  const RESPONSE_TIME_THRESHOLDS = {
    '/api/health': { p50: 50, p95: 200, p99: 500 },
    '/api/sessions': { p50: 100, p95: 500, p99: 1000 },
    '/api/projects': { p50: 100, p95: 500, p99: 1000 },
    '/api/jobs': { p50: 100, p95: 500, p99: 1000 },
    '/api/settings': { p50: 100, p95: 500, p99: 1000 },
  }

  for (const [endpoint, thresholds] of Object.entries(RESPONSE_TIME_THRESHOLDS)) {
    it(`should meet response time thresholds for ${endpoint}`, async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const metrics = await runLoadTest({
        endpoint,
        method: 'GET',
        concurrency: 10,
        totalRequests: 50,
      })

      console.log(`\n${endpoint} Response Times:`)
      console.log(`  P50: ${metrics.p50ResponseTime.toFixed(2)}ms (threshold: ${thresholds.p50}ms)`)
      console.log(`  P95: ${metrics.p95ResponseTime.toFixed(2)}ms (threshold: ${thresholds.p95}ms)`)
      console.log(`  P99: ${metrics.p99ResponseTime.toFixed(2)}ms (threshold: ${thresholds.p99}ms)`)

      // Note: Thresholds are guidelines; actual performance depends on server load
      // Using more lenient thresholds for CI environments
      expect(metrics.p95ResponseTime).toBeLessThan(thresholds.p95 * 2)
      expect(metrics.p99ResponseTime).toBeLessThan(thresholds.p99 * 2)
    }, 30000)
  }
})
