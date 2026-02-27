import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errorRate = new Rate('errors')
const apiLatency = new Trend('api_latency')

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

export default function () {
  let res = http.get(`${BASE_URL}/api/health`)
  check(res, { 'health ok': (r) => r.status === 200 })
  apiLatency.add(res.timings.duration)
  errorRate.add(res.status !== 200)

  res = http.get(`${BASE_URL}/api/sessions`)
  check(res, { 'sessions ok': (r) => r.status === 200 })
  apiLatency.add(res.timings.duration)
  errorRate.add(res.status !== 200)

  res = http.get(`${BASE_URL}/api/projects`)
  check(res, { 'projects ok': (r) => r.status === 200 })
  apiLatency.add(res.timings.duration)
  errorRate.add(res.status !== 200)

  res = http.get(`${BASE_URL}/api/jobs`)
  check(res, { 'jobs ok': (r) => r.status === 200 })
  apiLatency.add(res.timings.duration)
  errorRate.add(res.status !== 200)

  res = http.get(`${BASE_URL}/api/settings`)
  check(res, { 'settings ok': (r) => r.status === 200 })
  apiLatency.add(res.timings.duration)
  errorRate.add(res.status !== 200)

  sleep(1)
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'tests/performance/results/api-load-summary.json': JSON.stringify(data),
  }
}
