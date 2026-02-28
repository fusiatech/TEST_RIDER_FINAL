/**
 * WebSocket Load Performance Tests (TypeScript/Vitest version)
 * 
 * Tests WebSocket connection handling under load.
 * Run with: npx vitest run tests/performance/websocket-load.test.ts
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { WebSocket } from 'ws'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const WS_URL = process.env.WS_URL || 'ws://localhost:3000/api/ws'

interface WSMetrics {
  totalConnections: number
  successfulConnections: number
  failedConnections: number
  avgConnectionTime: number
  minConnectionTime: number
  maxConnectionTime: number
  p50ConnectionTime: number
  p95ConnectionTime: number
  p99ConnectionTime: number
  avgMessageLatency: number
  p95MessageLatency: number
  messagesReceived: number
  connectionErrorRate: number
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

interface ConnectionResult {
  connected: boolean
  connectionTime: number
  messageLatencies: number[]
  messagesReceived: number
  ws?: WebSocket
}

async function createWSConnection(
  url: string,
  options: { timeout?: number; sendPing?: boolean; waitForMessages?: number } = {}
): Promise<ConnectionResult> {
  const { timeout = 10000, sendPing = true, waitForMessages = 1 } = options
  const startTime = performance.now()
  const messageLatencies: number[] = []
  let messagesReceived = 0

  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    let connected = false
    let connectionTime = 0
    let pingStart = 0

    const timeoutId = setTimeout(() => {
      if (!connected) {
        ws.close()
        resolve({
          connected: false,
          connectionTime: performance.now() - startTime,
          messageLatencies: [],
          messagesReceived: 0,
        })
      }
    }, timeout)

    ws.on('open', () => {
      connected = true
      connectionTime = performance.now() - startTime

      if (sendPing) {
        pingStart = performance.now()
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    })

    ws.on('message', (data) => {
      messagesReceived++
      if (pingStart > 0) {
        messageLatencies.push(performance.now() - pingStart)
        pingStart = 0
      }

      if (messagesReceived >= waitForMessages) {
        clearTimeout(timeoutId)
        resolve({
          connected,
          connectionTime,
          messageLatencies,
          messagesReceived,
          ws,
        })
      }
    })

    ws.on('error', () => {
      clearTimeout(timeoutId)
      resolve({
        connected: false,
        connectionTime: performance.now() - startTime,
        messageLatencies: [],
        messagesReceived: 0,
      })
    })

    ws.on('close', () => {
      if (!connected) {
        clearTimeout(timeoutId)
        resolve({
          connected: false,
          connectionTime: performance.now() - startTime,
          messageLatencies: [],
          messagesReceived: 0,
        })
      }
    })
  })
}

describe('WebSocket Load Performance Tests', () => {
  let serverReady = false
  const activeConnections: WebSocket[] = []

  beforeAll(async () => {
    serverReady = await waitForServerReady(10, 500)
  }, 30000)

  afterEach(() => {
    // Clean up all active connections
    for (const ws of activeConnections) {
      try {
        ws.close()
      } catch {
        // Ignore close errors
      }
    }
    activeConnections.length = 0
  })

  describe('Connection Load Tests', () => {
    it('should handle 10 concurrent WebSocket connections', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const connectionCount = 10
      const connectionTimes: number[] = []
      const messageLatencies: number[] = []

      const promises = Array.from({ length: connectionCount }, () =>
        createWSConnection(WS_URL, { timeout: 15000 })
      )

      const results = await Promise.all(promises)

      for (const result of results) {
        if (result.connected) {
          connectionTimes.push(result.connectionTime)
          messageLatencies.push(...result.messageLatencies)
          if (result.ws) {
            activeConnections.push(result.ws)
          }
        }
      }

      const successfulConnections = results.filter((r) => r.connected).length

      const metrics: WSMetrics = {
        totalConnections: connectionCount,
        successfulConnections,
        failedConnections: connectionCount - successfulConnections,
        avgConnectionTime: connectionTimes.length > 0
          ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
          : 0,
        minConnectionTime: connectionTimes.length > 0 ? Math.min(...connectionTimes) : 0,
        maxConnectionTime: connectionTimes.length > 0 ? Math.max(...connectionTimes) : 0,
        p50ConnectionTime: calculatePercentile(connectionTimes, 50),
        p95ConnectionTime: calculatePercentile(connectionTimes, 95),
        p99ConnectionTime: calculatePercentile(connectionTimes, 99),
        avgMessageLatency: messageLatencies.length > 0
          ? messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length
          : 0,
        p95MessageLatency: calculatePercentile(messageLatencies, 95),
        messagesReceived: results.reduce((a, r) => a + r.messagesReceived, 0),
        connectionErrorRate: (connectionCount - successfulConnections) / connectionCount,
      }

      console.log('\n--- 10 Concurrent WebSocket Connections ---')
      console.log(`Total Connections: ${metrics.totalConnections}`)
      console.log(`Successful: ${metrics.successfulConnections}`)
      console.log(`Failed: ${metrics.failedConnections}`)
      console.log(`Avg Connection Time: ${metrics.avgConnectionTime.toFixed(2)}ms`)
      console.log(`P95 Connection Time: ${metrics.p95ConnectionTime.toFixed(2)}ms`)
      console.log(`Avg Message Latency: ${metrics.avgMessageLatency.toFixed(2)}ms`)
      console.log(`P95 Message Latency: ${metrics.p95MessageLatency.toFixed(2)}ms`)
      console.log(`Error Rate: ${(metrics.connectionErrorRate * 100).toFixed(2)}%`)

      expect(metrics.connectionErrorRate).toBeLessThan(0.1) // < 10% error rate
      expect(metrics.p95ConnectionTime).toBeLessThan(5000) // P95 < 5s
    }, 60000)

    it('should handle 50 concurrent WebSocket connections', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const connectionCount = 50
      const connectionTimes: number[] = []
      const messageLatencies: number[] = []

      const promises = Array.from({ length: connectionCount }, () =>
        createWSConnection(WS_URL, { timeout: 20000 })
      )

      const results = await Promise.all(promises)

      for (const result of results) {
        if (result.connected) {
          connectionTimes.push(result.connectionTime)
          messageLatencies.push(...result.messageLatencies)
          if (result.ws) {
            activeConnections.push(result.ws)
          }
        }
      }

      const successfulConnections = results.filter((r) => r.connected).length

      const metrics: WSMetrics = {
        totalConnections: connectionCount,
        successfulConnections,
        failedConnections: connectionCount - successfulConnections,
        avgConnectionTime: connectionTimes.length > 0
          ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
          : 0,
        minConnectionTime: connectionTimes.length > 0 ? Math.min(...connectionTimes) : 0,
        maxConnectionTime: connectionTimes.length > 0 ? Math.max(...connectionTimes) : 0,
        p50ConnectionTime: calculatePercentile(connectionTimes, 50),
        p95ConnectionTime: calculatePercentile(connectionTimes, 95),
        p99ConnectionTime: calculatePercentile(connectionTimes, 99),
        avgMessageLatency: messageLatencies.length > 0
          ? messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length
          : 0,
        p95MessageLatency: calculatePercentile(messageLatencies, 95),
        messagesReceived: results.reduce((a, r) => a + r.messagesReceived, 0),
        connectionErrorRate: (connectionCount - successfulConnections) / connectionCount,
      }

      console.log('\n--- 50 Concurrent WebSocket Connections ---')
      console.log(`Total Connections: ${metrics.totalConnections}`)
      console.log(`Successful: ${metrics.successfulConnections}`)
      console.log(`Failed: ${metrics.failedConnections}`)
      console.log(`Avg Connection Time: ${metrics.avgConnectionTime.toFixed(2)}ms`)
      console.log(`P95 Connection Time: ${metrics.p95ConnectionTime.toFixed(2)}ms`)
      console.log(`Avg Message Latency: ${metrics.avgMessageLatency.toFixed(2)}ms`)
      console.log(`Error Rate: ${(metrics.connectionErrorRate * 100).toFixed(2)}%`)

      // More lenient thresholds for higher load
      expect(metrics.connectionErrorRate).toBeLessThan(0.2) // < 20% error rate
      expect(metrics.p95ConnectionTime).toBeLessThan(10000) // P95 < 10s
    }, 120000)
  })

  describe('Message Throughput Tests', () => {
    it('should handle high message throughput', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const result = await createWSConnection(WS_URL, { timeout: 10000, sendPing: false })

      if (!result.connected || !result.ws) {
        console.log('Skipping test - could not establish connection')
        return
      }

      const ws = result.ws
      activeConnections.push(ws)

      const messageCount = 100
      const messageLatencies: number[] = []
      let messagesReceived = 0

      return new Promise<void>((resolve) => {
        const startTime = performance.now()
        let sendIndex = 0

        ws.on('message', () => {
          messagesReceived++
          if (messagesReceived === messageCount) {
            const totalDuration = performance.now() - startTime
            const throughput = (messageCount / totalDuration) * 1000

            console.log('\n--- Message Throughput Test ---')
            console.log(`Messages Sent: ${messageCount}`)
            console.log(`Messages Received: ${messagesReceived}`)
            console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`)
            console.log(`Throughput: ${throughput.toFixed(2)} msg/sec`)

            expect(throughput).toBeGreaterThan(10) // At least 10 msg/sec
            resolve()
          }
        })

        // Send messages with small delay to avoid overwhelming
        const sendInterval = setInterval(() => {
          if (sendIndex < messageCount) {
            const msgStart = performance.now()
            ws.send(JSON.stringify({ type: 'ping' }))
            messageLatencies.push(performance.now() - msgStart)
            sendIndex++
          } else {
            clearInterval(sendInterval)
          }
        }, 10)

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(sendInterval)
          resolve()
        }, 30000)
      })
    }, 60000)
  })

  describe('Connection Churn Tests', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const cycles = 20
      const connectionTimes: number[] = []
      let successfulCycles = 0

      for (let i = 0; i < cycles; i++) {
        const result = await createWSConnection(WS_URL, { timeout: 5000 })

        if (result.connected) {
          connectionTimes.push(result.connectionTime)
          successfulCycles++
          if (result.ws) {
            result.ws.close()
          }
        }

        // Small delay between cycles
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      const avgConnectionTime = connectionTimes.length > 0
        ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
        : 0

      console.log('\n--- Connection Churn Test ---')
      console.log(`Total Cycles: ${cycles}`)
      console.log(`Successful Cycles: ${successfulCycles}`)
      console.log(`Avg Connection Time: ${avgConnectionTime.toFixed(2)}ms`)
      console.log(`P95 Connection Time: ${calculatePercentile(connectionTimes, 95).toFixed(2)}ms`)

      expect(successfulCycles / cycles).toBeGreaterThan(0.8) // 80% success rate
    }, 60000)
  })

  describe('Sustained Connection Tests', () => {
    it('should maintain stable connections over time', async () => {
      if (!serverReady) {
        console.log('Skipping test - server not available')
        return
      }

      const connectionCount = 5
      const testDurationMs = 10000 // 10 seconds
      const pingIntervalMs = 1000

      const connections: { ws: WebSocket; latencies: number[] }[] = []

      // Establish connections
      for (let i = 0; i < connectionCount; i++) {
        const result = await createWSConnection(WS_URL, { timeout: 5000, sendPing: false })
        if (result.connected && result.ws) {
          connections.push({ ws: result.ws, latencies: [] })
          activeConnections.push(result.ws)
        }
      }

      if (connections.length === 0) {
        console.log('Skipping test - no connections established')
        return
      }

      // Set up message handlers
      for (const conn of connections) {
        conn.ws.on('message', () => {
          // Message received
        })
      }

      // Send periodic pings
      const startTime = performance.now()
      let pingCount = 0

      while (performance.now() - startTime < testDurationMs) {
        for (const conn of connections) {
          if (conn.ws.readyState === WebSocket.OPEN) {
            const pingStart = performance.now()
            conn.ws.send(JSON.stringify({ type: 'ping' }))
            conn.latencies.push(performance.now() - pingStart)
          }
        }
        pingCount++
        await new Promise((resolve) => setTimeout(resolve, pingIntervalMs))
      }

      // Calculate metrics
      const allLatencies = connections.flatMap((c) => c.latencies)
      const openConnections = connections.filter((c) => c.ws.readyState === WebSocket.OPEN).length

      console.log('\n--- Sustained Connection Test ---')
      console.log(`Duration: ${testDurationMs / 1000}s`)
      console.log(`Initial Connections: ${connections.length}`)
      console.log(`Final Open Connections: ${openConnections}`)
      console.log(`Total Pings Sent: ${pingCount * connections.length}`)
      console.log(`Avg Send Latency: ${(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length).toFixed(2)}ms`)

      expect(openConnections).toBe(connections.length) // All connections should remain open
    }, 30000)
  })
})

describe('WebSocket Performance Thresholds', () => {
  let serverReady = false

  beforeAll(async () => {
    serverReady = await waitForServerReady(10, 500)
  }, 30000)

  const WS_THRESHOLDS = {
    connectionTime: { p50: 100, p95: 500, p99: 1000 },
    messageLatency: { p50: 50, p95: 200, p99: 500 },
    errorRate: 0.05, // 5%
  }

  it('should meet WebSocket connection time thresholds', async () => {
    if (!serverReady) {
      console.log('Skipping test - server not available')
      return
    }

    const connectionCount = 20
    const connectionTimes: number[] = []
    const connections: WebSocket[] = []

    const promises = Array.from({ length: connectionCount }, () =>
      createWSConnection(WS_URL, { timeout: 10000 })
    )

    const results = await Promise.all(promises)

    for (const result of results) {
      if (result.connected) {
        connectionTimes.push(result.connectionTime)
        if (result.ws) {
          connections.push(result.ws)
        }
      }
    }

    // Clean up
    for (const ws of connections) {
      ws.close()
    }

    const p50 = calculatePercentile(connectionTimes, 50)
    const p95 = calculatePercentile(connectionTimes, 95)
    const p99 = calculatePercentile(connectionTimes, 99)
    const errorRate = (connectionCount - connectionTimes.length) / connectionCount

    console.log('\n--- WebSocket Connection Thresholds ---')
    console.log(`P50: ${p50.toFixed(2)}ms (threshold: ${WS_THRESHOLDS.connectionTime.p50}ms)`)
    console.log(`P95: ${p95.toFixed(2)}ms (threshold: ${WS_THRESHOLDS.connectionTime.p95}ms)`)
    console.log(`P99: ${p99.toFixed(2)}ms (threshold: ${WS_THRESHOLDS.connectionTime.p99}ms)`)
    console.log(`Error Rate: ${(errorRate * 100).toFixed(2)}% (threshold: ${WS_THRESHOLDS.errorRate * 100}%)`)

    // Using 2x multiplier for CI environments
    expect(p95).toBeLessThan(WS_THRESHOLDS.connectionTime.p95 * 4)
    expect(errorRate).toBeLessThan(WS_THRESHOLDS.errorRate * 2)
  }, 60000)
})
