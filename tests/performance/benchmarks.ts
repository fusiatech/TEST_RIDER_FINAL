/**
 * Performance Benchmarks Configuration
 * 
 * Defines response time thresholds, throughput targets, and memory limits
 * for SwarmUI performance testing.
 */

export interface ResponseTimeThreshold {
  p50: number  // 50th percentile (median) in ms
  p95: number  // 95th percentile in ms
  p99: number  // 99th percentile in ms
}

export interface ThroughputTarget {
  minRequestsPerSecond: number
  targetRequestsPerSecond: number
}

export interface MemoryLimit {
  maxHeapMB: number
  maxRssMB: number
  maxIncreasePerRequestMB: number
}

export interface EndpointBenchmark {
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  responseTime: ResponseTimeThreshold
  throughput: ThroughputTarget
  errorRate: number  // Maximum acceptable error rate (0.01 = 1%)
}

export interface WebSocketBenchmark {
  connectionTime: ResponseTimeThreshold
  messageLatency: ResponseTimeThreshold
  maxConcurrentConnections: number
  errorRate: number
}

export interface JobQueueBenchmark {
  enqueueTime: ResponseTimeThreshold
  maxConcurrentJobs: number
  minThroughput: number  // jobs per second
  errorRate: number
}

export interface PerformanceBenchmarks {
  api: {
    endpoints: EndpointBenchmark[]
    global: {
      maxResponseTime: number
      minThroughput: number
      maxErrorRate: number
    }
  }
  websocket: WebSocketBenchmark
  jobQueue: JobQueueBenchmark
  memory: MemoryLimit
}

/**
 * Default performance benchmarks for SwarmUI
 * 
 * These values are baseline targets. Adjust based on:
 * - Hardware specifications
 * - Expected load patterns
 * - SLA requirements
 */
export const DEFAULT_BENCHMARKS: PerformanceBenchmarks = {
  api: {
    endpoints: [
      {
        endpoint: '/api/health',
        method: 'GET',
        responseTime: { p50: 50, p95: 200, p99: 500 },
        throughput: { minRequestsPerSecond: 100, targetRequestsPerSecond: 500 },
        errorRate: 0.001,  // 0.1%
      },
      {
        endpoint: '/api/health/live',
        method: 'GET',
        responseTime: { p50: 20, p95: 100, p99: 200 },
        throughput: { minRequestsPerSecond: 200, targetRequestsPerSecond: 1000 },
        errorRate: 0.001,
      },
      {
        endpoint: '/api/health/ready',
        method: 'GET',
        responseTime: { p50: 50, p95: 200, p99: 500 },
        throughput: { minRequestsPerSecond: 100, targetRequestsPerSecond: 500 },
        errorRate: 0.001,
      },
      {
        endpoint: '/api/sessions',
        method: 'GET',
        responseTime: { p50: 100, p95: 500, p99: 1000 },
        throughput: { minRequestsPerSecond: 50, targetRequestsPerSecond: 200 },
        errorRate: 0.01,  // 1%
      },
      {
        endpoint: '/api/projects',
        method: 'GET',
        responseTime: { p50: 100, p95: 500, p99: 1000 },
        throughput: { minRequestsPerSecond: 50, targetRequestsPerSecond: 200 },
        errorRate: 0.01,
      },
      {
        endpoint: '/api/jobs',
        method: 'GET',
        responseTime: { p50: 100, p95: 500, p99: 1000 },
        throughput: { minRequestsPerSecond: 50, targetRequestsPerSecond: 200 },
        errorRate: 0.01,
      },
      {
        endpoint: '/api/settings',
        method: 'GET',
        responseTime: { p50: 100, p95: 500, p99: 1000 },
        throughput: { minRequestsPerSecond: 50, targetRequestsPerSecond: 200 },
        errorRate: 0.01,
      },
      {
        endpoint: '/api/metrics',
        method: 'GET',
        responseTime: { p50: 200, p95: 1000, p99: 2000 },
        throughput: { minRequestsPerSecond: 10, targetRequestsPerSecond: 50 },
        errorRate: 0.01,
      },
    ],
    global: {
      maxResponseTime: 5000,  // 5 seconds absolute max
      minThroughput: 10,      // At least 10 req/sec under load
      maxErrorRate: 0.05,     // 5% max error rate
    },
  },
  websocket: {
    connectionTime: { p50: 100, p95: 500, p99: 1000 },
    messageLatency: { p50: 50, p95: 200, p99: 500 },
    maxConcurrentConnections: 100,
    errorRate: 0.05,  // 5%
  },
  jobQueue: {
    enqueueTime: { p50: 100, p95: 500, p99: 1000 },
    maxConcurrentJobs: 10,
    minThroughput: 5,  // 5 jobs/sec
    errorRate: 0.1,    // 10%
  },
  memory: {
    maxHeapMB: 512,
    maxRssMB: 1024,
    maxIncreasePerRequestMB: 0.5,
  },
}

/**
 * Stress test benchmarks (more lenient for high-load scenarios)
 */
export const STRESS_BENCHMARKS: PerformanceBenchmarks = {
  api: {
    endpoints: DEFAULT_BENCHMARKS.api.endpoints.map((e) => ({
      ...e,
      responseTime: {
        p50: e.responseTime.p50 * 2,
        p95: e.responseTime.p95 * 3,
        p99: e.responseTime.p99 * 4,
      },
      errorRate: e.errorRate * 5,
    })),
    global: {
      maxResponseTime: 10000,  // 10 seconds
      minThroughput: 5,
      maxErrorRate: 0.15,      // 15%
    },
  },
  websocket: {
    connectionTime: { p50: 500, p95: 2000, p99: 5000 },
    messageLatency: { p50: 200, p95: 1000, p99: 2000 },
    maxConcurrentConnections: 200,
    errorRate: 0.2,  // 20%
  },
  jobQueue: {
    enqueueTime: { p50: 500, p95: 2000, p99: 5000 },
    maxConcurrentJobs: 20,
    minThroughput: 2,
    errorRate: 0.2,
  },
  memory: {
    maxHeapMB: 1024,
    maxRssMB: 2048,
    maxIncreasePerRequestMB: 1,
  },
}

/**
 * CI/CD benchmarks (lenient for variable CI environments)
 */
export const CI_BENCHMARKS: PerformanceBenchmarks = {
  api: {
    endpoints: DEFAULT_BENCHMARKS.api.endpoints.map((e) => ({
      ...e,
      responseTime: {
        p50: e.responseTime.p50 * 3,
        p95: e.responseTime.p95 * 4,
        p99: e.responseTime.p99 * 5,
      },
      throughput: {
        minRequestsPerSecond: Math.max(1, e.throughput.minRequestsPerSecond / 5),
        targetRequestsPerSecond: e.throughput.targetRequestsPerSecond / 5,
      },
      errorRate: Math.min(0.1, e.errorRate * 3),
    })),
    global: {
      maxResponseTime: 15000,
      minThroughput: 2,
      maxErrorRate: 0.2,
    },
  },
  websocket: {
    connectionTime: { p50: 500, p95: 2000, p99: 5000 },
    messageLatency: { p50: 200, p95: 1000, p99: 2000 },
    maxConcurrentConnections: 50,
    errorRate: 0.25,
  },
  jobQueue: {
    enqueueTime: { p50: 500, p95: 2000, p99: 5000 },
    maxConcurrentJobs: 5,
    minThroughput: 1,
    errorRate: 0.25,
  },
  memory: {
    maxHeapMB: 1024,
    maxRssMB: 2048,
    maxIncreasePerRequestMB: 2,
  },
}

/**
 * Get benchmarks based on environment
 */
export function getBenchmarks(env?: string): PerformanceBenchmarks {
  const environment = env || process.env.PERF_ENV || process.env.NODE_ENV || 'default'
  
  switch (environment) {
    case 'stress':
      return STRESS_BENCHMARKS
    case 'ci':
    case 'test':
      return CI_BENCHMARKS
    default:
      return DEFAULT_BENCHMARKS
  }
}

/**
 * Validate metrics against benchmarks
 */
export interface ValidationResult {
  passed: boolean
  metric: string
  actual: number
  threshold: number
  message: string
}

export function validateResponseTime(
  actual: { p50: number; p95: number; p99: number },
  threshold: ResponseTimeThreshold,
  metricName: string
): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push({
    passed: actual.p50 <= threshold.p50,
    metric: `${metricName}.p50`,
    actual: actual.p50,
    threshold: threshold.p50,
    message: actual.p50 <= threshold.p50
      ? `P50 ${actual.p50}ms within threshold ${threshold.p50}ms`
      : `P50 ${actual.p50}ms exceeds threshold ${threshold.p50}ms`,
  })

  results.push({
    passed: actual.p95 <= threshold.p95,
    metric: `${metricName}.p95`,
    actual: actual.p95,
    threshold: threshold.p95,
    message: actual.p95 <= threshold.p95
      ? `P95 ${actual.p95}ms within threshold ${threshold.p95}ms`
      : `P95 ${actual.p95}ms exceeds threshold ${threshold.p95}ms`,
  })

  results.push({
    passed: actual.p99 <= threshold.p99,
    metric: `${metricName}.p99`,
    actual: actual.p99,
    threshold: threshold.p99,
    message: actual.p99 <= threshold.p99
      ? `P99 ${actual.p99}ms within threshold ${threshold.p99}ms`
      : `P99 ${actual.p99}ms exceeds threshold ${threshold.p99}ms`,
  })

  return results
}

export function validateErrorRate(
  actual: number,
  threshold: number,
  metricName: string
): ValidationResult {
  return {
    passed: actual <= threshold,
    metric: `${metricName}.errorRate`,
    actual,
    threshold,
    message: actual <= threshold
      ? `Error rate ${(actual * 100).toFixed(2)}% within threshold ${(threshold * 100).toFixed(2)}%`
      : `Error rate ${(actual * 100).toFixed(2)}% exceeds threshold ${(threshold * 100).toFixed(2)}%`,
  }
}

export function validateThroughput(
  actual: number,
  target: ThroughputTarget,
  metricName: string
): ValidationResult {
  return {
    passed: actual >= target.minRequestsPerSecond,
    metric: `${metricName}.throughput`,
    actual,
    threshold: target.minRequestsPerSecond,
    message: actual >= target.minRequestsPerSecond
      ? `Throughput ${actual.toFixed(2)} req/s meets minimum ${target.minRequestsPerSecond} req/s`
      : `Throughput ${actual.toFixed(2)} req/s below minimum ${target.minRequestsPerSecond} req/s`,
  }
}

export function validateMemory(
  actual: { heapMB: number; rssMB: number },
  limits: MemoryLimit,
  metricName: string
): ValidationResult[] {
  return [
    {
      passed: actual.heapMB <= limits.maxHeapMB,
      metric: `${metricName}.heap`,
      actual: actual.heapMB,
      threshold: limits.maxHeapMB,
      message: actual.heapMB <= limits.maxHeapMB
        ? `Heap ${actual.heapMB.toFixed(2)}MB within limit ${limits.maxHeapMB}MB`
        : `Heap ${actual.heapMB.toFixed(2)}MB exceeds limit ${limits.maxHeapMB}MB`,
    },
    {
      passed: actual.rssMB <= limits.maxRssMB,
      metric: `${metricName}.rss`,
      actual: actual.rssMB,
      threshold: limits.maxRssMB,
      message: actual.rssMB <= limits.maxRssMB
        ? `RSS ${actual.rssMB.toFixed(2)}MB within limit ${limits.maxRssMB}MB`
        : `RSS ${actual.rssMB.toFixed(2)}MB exceeds limit ${limits.maxRssMB}MB`,
    },
  ]
}
