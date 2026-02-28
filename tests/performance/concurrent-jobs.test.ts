/**
 * Concurrent Jobs Performance Test
 * 
 * Tests the job queue under load with multiple concurrent job submissions.
 * Run with: npx tsx tests/performance/concurrent-jobs.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { WebSocket } from 'ws'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const WS_URL = process.env.WS_URL || 'ws://localhost:3000/api/ws'

interface PerformanceMetrics {
  totalJobs: number
  successfulJobs: number
  failedJobs: number
  avgEnqueueTime: number
  maxEnqueueTime: number
  minEnqueueTime: number
  p95EnqueueTime: number
  p99EnqueueTime: number
  totalDuration: number
  throughput: number
  memoryUsageMB: number
}

interface JobResponse {
  id: string
  status: string
  createdAt: number
}

async function httpRequest(
  url: string,
  options: { method?: string; body?: unknown; timeout?: number } = {}
): Promise<{ status: number; data: unknown; duration: number }> {
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

    const data = await response.json().catch(() => null)
    const duration = performance.now() - start

    return { status: response.status, data, duration }
  } finally {
    clearTimeout(timeoutId)
  }
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
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

describe('Concurrent Jobs Performance Tests', () => {
  let serverReady = false

  beforeAll(async () => {
    serverReady = await waitForServerReady(10, 500)
  }, 30000)

  describe('Job Enqueue Performance', () => {
    it('should handle 10 concurrent job submissions', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const concurrentJobs = 10
      const enqueueTimes: number[] = []
      const results: { success: boolean; duration: number }[] = []

      const startTime = performance.now()

      const promises = Array.from({ length: concurrentJobs }, async (_, i) => {
        const jobStart = performance.now()
        try {
          const response = await httpRequest(`${BASE_URL}/api/jobs`, {
            method: 'POST',
            body: {
              sessionId: `perf-test-${Date.now()}-${i}`,
              prompt: `Performance test job ${i}`,
              mode: 'chat',
            },
          })

          const duration = performance.now() - jobStart
          enqueueTimes.push(duration)

          return {
            success: response.status === 200 || response.status === 201,
            duration,
          }
        } catch (error) {
          const duration = performance.now() - jobStart
          enqueueTimes.push(duration)
          return { success: false, duration }
        }
      })

      const jobResults = await Promise.all(promises)
      results.push(...jobResults)

      const totalDuration = performance.now() - startTime
      const successCount = results.filter((r) => r.success).length

      const metrics: PerformanceMetrics = {
        totalJobs: concurrentJobs,
        successfulJobs: successCount,
        failedJobs: concurrentJobs - successCount,
        avgEnqueueTime: enqueueTimes.reduce((a, b) => a + b, 0) / enqueueTimes.length,
        maxEnqueueTime: Math.max(...enqueueTimes),
        minEnqueueTime: Math.min(...enqueueTimes),
        p95EnqueueTime: calculatePercentile(enqueueTimes, 95),
        p99EnqueueTime: calculatePercentile(enqueueTimes, 99),
        totalDuration,
        throughput: (concurrentJobs / totalDuration) * 1000,
        memoryUsageMB: process.memoryUsage().heapUsed / (1024 * 1024),
      }

      console.log('\n--- 10 Concurrent Jobs Metrics ---')
      console.log(`Total Jobs: ${metrics.totalJobs}`)
      console.log(`Successful: ${metrics.successfulJobs}`)
      console.log(`Failed: ${metrics.failedJobs}`)
      console.log(`Avg Enqueue Time: ${metrics.avgEnqueueTime.toFixed(2)}ms`)
      console.log(`P95 Enqueue Time: ${metrics.p95EnqueueTime.toFixed(2)}ms`)
      console.log(`P99 Enqueue Time: ${metrics.p99EnqueueTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} jobs/sec`)
      console.log(`Memory Usage: ${metrics.memoryUsageMB.toFixed(2)}MB`)

      // Performance thresholds
      expect(metrics.p95EnqueueTime).toBeLessThan(1000) // P95 < 1s
      expect(metrics.failedJobs / metrics.totalJobs).toBeLessThan(0.1) // < 10% failure rate
    }, 60000)

    it('should handle 50 concurrent job submissions', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const concurrentJobs = 50
      const enqueueTimes: number[] = []
      const results: { success: boolean; duration: number }[] = []

      const startTime = performance.now()

      const promises = Array.from({ length: concurrentJobs }, async (_, i) => {
        const jobStart = performance.now()
        try {
          const response = await httpRequest(`${BASE_URL}/api/jobs`, {
            method: 'POST',
            body: {
              sessionId: `perf-test-50-${Date.now()}-${i}`,
              prompt: `Performance test job ${i} of 50`,
              mode: 'chat',
            },
          })

          const duration = performance.now() - jobStart
          enqueueTimes.push(duration)

          return {
            success: response.status === 200 || response.status === 201,
            duration,
          }
        } catch (error) {
          const duration = performance.now() - jobStart
          enqueueTimes.push(duration)
          return { success: false, duration }
        }
      })

      const jobResults = await Promise.all(promises)
      results.push(...jobResults)

      const totalDuration = performance.now() - startTime
      const successCount = results.filter((r) => r.success).length

      const metrics: PerformanceMetrics = {
        totalJobs: concurrentJobs,
        successfulJobs: successCount,
        failedJobs: concurrentJobs - successCount,
        avgEnqueueTime: enqueueTimes.reduce((a, b) => a + b, 0) / enqueueTimes.length,
        maxEnqueueTime: Math.max(...enqueueTimes),
        minEnqueueTime: Math.min(...enqueueTimes),
        p95EnqueueTime: calculatePercentile(enqueueTimes, 95),
        p99EnqueueTime: calculatePercentile(enqueueTimes, 99),
        totalDuration,
        throughput: (concurrentJobs / totalDuration) * 1000,
        memoryUsageMB: process.memoryUsage().heapUsed / (1024 * 1024),
      }

      console.log('\n--- 50 Concurrent Jobs Metrics ---')
      console.log(`Total Jobs: ${metrics.totalJobs}`)
      console.log(`Successful: ${metrics.successfulJobs}`)
      console.log(`Failed: ${metrics.failedJobs}`)
      console.log(`Avg Enqueue Time: ${metrics.avgEnqueueTime.toFixed(2)}ms`)
      console.log(`P95 Enqueue Time: ${metrics.p95EnqueueTime.toFixed(2)}ms`)
      console.log(`P99 Enqueue Time: ${metrics.p99EnqueueTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} jobs/sec`)
      console.log(`Memory Usage: ${metrics.memoryUsageMB.toFixed(2)}MB`)

      // Performance thresholds (more lenient for higher load)
      expect(metrics.p95EnqueueTime).toBeLessThan(2000) // P95 < 2s
      expect(metrics.failedJobs / metrics.totalJobs).toBeLessThan(0.15) // < 15% failure rate
    }, 120000)
  })

  describe('Job Queue Throughput', () => {
    it('should maintain throughput under sustained load', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const durationMs = 10000 // 10 seconds
      const batchSize = 5
      const batchIntervalMs = 500

      const enqueueTimes: number[] = []
      const results: { success: boolean; duration: number }[] = []

      const startTime = performance.now()
      let batchCount = 0

      while (performance.now() - startTime < durationMs) {
        const batchStart = performance.now()

        const promises = Array.from({ length: batchSize }, async (_, i) => {
          const jobStart = performance.now()
          try {
            const response = await httpRequest(`${BASE_URL}/api/jobs`, {
              method: 'POST',
              body: {
                sessionId: `sustained-${Date.now()}-${batchCount}-${i}`,
                prompt: `Sustained load test batch ${batchCount} job ${i}`,
                mode: 'chat',
              },
            })

            const duration = performance.now() - jobStart
            enqueueTimes.push(duration)

            return {
              success: response.status === 200 || response.status === 201,
              duration,
            }
          } catch (error) {
            const duration = performance.now() - jobStart
            enqueueTimes.push(duration)
            return { success: false, duration }
          }
        })

        const batchResults = await Promise.all(promises)
        results.push(...batchResults)
        batchCount++

        const batchDuration = performance.now() - batchStart
        const sleepTime = Math.max(0, batchIntervalMs - batchDuration)
        if (sleepTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, sleepTime))
        }
      }

      const totalDuration = performance.now() - startTime
      const successCount = results.filter((r) => r.success).length

      const metrics: PerformanceMetrics = {
        totalJobs: results.length,
        successfulJobs: successCount,
        failedJobs: results.length - successCount,
        avgEnqueueTime: enqueueTimes.reduce((a, b) => a + b, 0) / enqueueTimes.length,
        maxEnqueueTime: Math.max(...enqueueTimes),
        minEnqueueTime: Math.min(...enqueueTimes),
        p95EnqueueTime: calculatePercentile(enqueueTimes, 95),
        p99EnqueueTime: calculatePercentile(enqueueTimes, 99),
        totalDuration,
        throughput: (results.length / totalDuration) * 1000,
        memoryUsageMB: process.memoryUsage().heapUsed / (1024 * 1024),
      }

      console.log('\n--- Sustained Load Metrics ---')
      console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`)
      console.log(`Total Jobs: ${metrics.totalJobs}`)
      console.log(`Successful: ${metrics.successfulJobs}`)
      console.log(`Failed: ${metrics.failedJobs}`)
      console.log(`Avg Enqueue Time: ${metrics.avgEnqueueTime.toFixed(2)}ms`)
      console.log(`P95 Enqueue Time: ${metrics.p95EnqueueTime.toFixed(2)}ms`)
      console.log(`Throughput: ${metrics.throughput.toFixed(2)} jobs/sec`)
      console.log(`Memory Usage: ${metrics.memoryUsageMB.toFixed(2)}MB`)

      // Sustained load thresholds
      expect(metrics.throughput).toBeGreaterThan(5) // At least 5 jobs/sec
      expect(metrics.failedJobs / metrics.totalJobs).toBeLessThan(0.1) // < 10% failure rate
    }, 30000)
  })

  describe('Memory Pressure Tests', () => {
    it('should handle memory pressure gracefully', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const initialMemory = process.memoryUsage().heapUsed
      const jobCount = 100
      const results: { success: boolean }[] = []

      // Rapid-fire job submissions
      for (let i = 0; i < jobCount; i++) {
        try {
          const response = await httpRequest(`${BASE_URL}/api/jobs`, {
            method: 'POST',
            body: {
              sessionId: `memory-test-${Date.now()}-${i}`,
              prompt: `Memory pressure test job ${i} with some additional payload data to increase memory usage`,
              mode: 'chat',
            },
            timeout: 5000,
          })
          results.push({ success: response.status === 200 || response.status === 201 })
        } catch {
          results.push({ success: false })
        }
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncreaseMB = (finalMemory - initialMemory) / (1024 * 1024)
      const successRate = results.filter((r) => r.success).length / results.length

      console.log('\n--- Memory Pressure Test ---')
      console.log(`Jobs Submitted: ${jobCount}`)
      console.log(`Success Rate: ${(successRate * 100).toFixed(1)}%`)
      console.log(`Memory Increase: ${memoryIncreaseMB.toFixed(2)}MB`)
      console.log(`Final Memory: ${(finalMemory / (1024 * 1024)).toFixed(2)}MB`)

      // Memory should not grow unboundedly
      expect(memoryIncreaseMB).toBeLessThan(100) // Less than 100MB increase
      expect(successRate).toBeGreaterThan(0.8) // At least 80% success rate
    }, 60000)
  })
})

describe('WebSocket Concurrent Connection Tests', () => {
  let serverReady = false

  beforeAll(async () => {
    serverReady = await waitForServerReady(10, 500)
  }, 30000)

  it('should handle 20 concurrent WebSocket connections', async () => {
    if (!serverReady) {
      console.log('Skipping test - server not available')
      return
    }

    const connectionCount = 20
    const connections: WebSocket[] = []
    const connectionTimes: number[] = []
    const messageTimes: number[] = []

    const connectPromises = Array.from({ length: connectionCount }, (_, i) => {
      return new Promise<{ connected: boolean; connectionTime: number; messageTime?: number }>((resolve) => {
        const startTime = performance.now()
        const ws = new WebSocket(WS_URL)
        let messageReceived = false

        const timeout = setTimeout(() => {
          ws.close()
          resolve({ connected: false, connectionTime: performance.now() - startTime })
        }, 10000)

        ws.on('open', () => {
          const connectionTime = performance.now() - startTime
          connectionTimes.push(connectionTime)
          connections.push(ws)

          const msgStart = performance.now()
          ws.send(JSON.stringify({ type: 'ping' }))

          ws.on('message', (data) => {
            if (!messageReceived) {
              messageReceived = true
              const messageTime = performance.now() - msgStart
              messageTimes.push(messageTime)
              clearTimeout(timeout)
              resolve({ connected: true, connectionTime, messageTime })
            }
          })
        })

        ws.on('error', () => {
          clearTimeout(timeout)
          resolve({ connected: false, connectionTime: performance.now() - startTime })
        })
      })
    })

    const results = await Promise.all(connectPromises)

    // Clean up connections
    connections.forEach((ws) => {
      try {
        ws.close()
      } catch {
        // Ignore close errors
      }
    })

    const connectedCount = results.filter((r) => r.connected).length
    const avgConnectionTime = connectionTimes.length > 0
      ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
      : 0
    const avgMessageTime = messageTimes.length > 0
      ? messageTimes.reduce((a, b) => a + b, 0) / messageTimes.length
      : 0

    console.log('\n--- WebSocket Concurrent Connections ---')
    console.log(`Total Connections Attempted: ${connectionCount}`)
    console.log(`Successful Connections: ${connectedCount}`)
    console.log(`Avg Connection Time: ${avgConnectionTime.toFixed(2)}ms`)
    console.log(`Avg Message Round-Trip: ${avgMessageTime.toFixed(2)}ms`)
    console.log(`P95 Connection Time: ${calculatePercentile(connectionTimes, 95).toFixed(2)}ms`)

    expect(connectedCount / connectionCount).toBeGreaterThan(0.9) // 90% success rate
    expect(calculatePercentile(connectionTimes, 95)).toBeLessThan(5000) // P95 < 5s
  }, 60000)
})
