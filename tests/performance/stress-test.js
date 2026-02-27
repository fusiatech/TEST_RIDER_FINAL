import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const errorRate = new Rate('errors')
const apiLatency = new Trend('api_latency')
const requestCount = new Counter('requests')

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<2000'],
    errors: ['rate<0.1'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

export default function () {
  const endpoints = [
    '/api/health',
    '/api/sessions',
    '/api/projects',
    '/api/jobs',
    '/api/settings',
  ]

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)]
  const res = http.get(`${BASE_URL}${endpoint}`)

  requestCount.add(1)
  apiLatency.add(res.timings.duration)
  errorRate.add(res.status !== 200)

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  })

  sleep(0.1)
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'tests/performance/results/stress-test-summary.json': JSON.stringify(data),
  }
}
