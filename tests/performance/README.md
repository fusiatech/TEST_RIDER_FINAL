# SwarmUI Performance Tests

This directory contains performance tests for SwarmUI, including load testing, stress testing, and benchmark validation.

## Test Types

### k6 Tests (JavaScript)

Located in `*.js` files, these tests use [k6](https://k6.io/) for load testing:

- **`api-load.js`** - API endpoint load testing with gradual ramp-up
- **`websocket-load.js`** - WebSocket connection load testing
- **`stress-test.js`** - High-load stress testing with aggressive ramp-up

### Vitest Tests (TypeScript)

Located in `*.test.ts` files, these tests use Vitest for performance validation:

- **`api-load.test.ts`** - API endpoint performance with threshold validation
- **`websocket-load.test.ts`** - WebSocket performance and connection handling
- **`concurrent-jobs.test.ts`** - Job queue performance under concurrent load

### Benchmarks Configuration

- **`benchmarks.ts`** - Defines response time thresholds, throughput targets, and memory limits

## Prerequisites

### For k6 Tests

Install k6: https://k6.io/docs/getting-started/installation/

```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### For Vitest Tests

No additional installation required - uses project dependencies.

## Running Tests

### Quick Start

```bash
# Start the server first
npm run dev

# Run all performance tests (k6 + Vitest)
npm run perf:all

# Run only Vitest tests (no k6 required)
npm run perf:vitest

# Run only k6 tests
npm run perf:k6
```

### Individual Test Commands

```bash
# k6 Tests
npm run perf:api        # API load test
npm run perf:ws         # WebSocket load test
npm run perf:stress     # Stress test

# Vitest Tests
npm run perf:api:vitest # API load test (TypeScript)
npm run perf:ws:vitest  # WebSocket load test (TypeScript)
npm run perf:jobs       # Concurrent jobs test
```

### Using the Test Runner Script

```bash
# Run all tests
npx tsx scripts/run-performance-tests.ts

# Run specific test type
npx tsx scripts/run-performance-tests.ts --type=api
npx tsx scripts/run-performance-tests.ts --type=ws
npx tsx scripts/run-performance-tests.ts --type=jobs

# Run against different environments
npx tsx scripts/run-performance-tests.ts --env=stress
npx tsx scripts/run-performance-tests.ts --env=ci

# Run against a different server
npx tsx scripts/run-performance-tests.ts --base-url=https://staging.example.com

# Run only k6 or Vitest tests
npx tsx scripts/run-performance-tests.ts --k6-only
npx tsx scripts/run-performance-tests.ts --vitest-only

# Show help
npx tsx scripts/run-performance-tests.ts --help
```

### CI/CD Integration

```bash
# Run with CI-friendly thresholds
npm run perf:ci
```

## Performance Benchmarks

### API Endpoints

| Endpoint | P50 | P95 | P99 | Error Rate |
|----------|-----|-----|-----|------------|
| `/api/health` | 50ms | 200ms | 500ms | < 0.1% |
| `/api/sessions` | 100ms | 500ms | 1000ms | < 1% |
| `/api/projects` | 100ms | 500ms | 1000ms | < 1% |
| `/api/jobs` | 100ms | 500ms | 1000ms | < 1% |
| `/api/settings` | 100ms | 500ms | 1000ms | < 1% |

### WebSocket

| Metric | P50 | P95 | P99 |
|--------|-----|-----|-----|
| Connection Time | 100ms | 500ms | 1000ms |
| Message Latency | 50ms | 200ms | 500ms |
| Max Concurrent Connections | 100 | - | - |
| Error Rate | - | - | < 5% |

### Job Queue

| Metric | Target |
|--------|--------|
| Enqueue Time (P95) | < 500ms |
| Min Throughput | 5 jobs/sec |
| Max Concurrent Jobs | 10 |
| Error Rate | < 10% |

### Memory Limits

| Metric | Limit |
|--------|-------|
| Max Heap | 512 MB |
| Max RSS | 1024 MB |
| Max Increase per Request | 0.5 MB |

## Test Results

Results are saved to `tests/performance/results/`:

- `api-load-summary.json` - k6 API load test results
- `websocket-load-summary.json` - k6 WebSocket test results
- `stress-test-summary.json` - k6 stress test results
- `performance-report-*.json` - Combined test runner reports

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | Server base URL |
| `WS_URL` | `ws://localhost:3000` | WebSocket URL |
| `PERF_ENV` | `default` | Benchmark environment (default/stress/ci) |

## Writing New Tests

### k6 Test Template

```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errorRate = new Rate('errors')
const latency = new Trend('latency')

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
  const res = http.get(`${BASE_URL}/api/your-endpoint`)
  check(res, { 'status is 200': (r) => r.status === 200 })
  latency.add(res.timings.duration)
  errorRate.add(res.status !== 200)
  sleep(1)
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'tests/performance/results/your-test-summary.json': JSON.stringify(data),
  }
}
```

### Vitest Test Template

```typescript
import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

describe('Your Performance Tests', () => {
  let serverReady = false

  beforeAll(async () => {
    // Check server health
    try {
      const response = await fetch(`${BASE_URL}/api/health`)
      serverReady = response.ok
    } catch {
      serverReady = false
    }
  }, 30000)

  it('should meet performance thresholds', async () => {
    if (!serverReady) {
      console.log('Skipping test - server not available')
      return
    }

    // Your test logic here
    const start = performance.now()
    const response = await fetch(`${BASE_URL}/api/your-endpoint`)
    const duration = performance.now() - start

    expect(response.ok).toBe(true)
    expect(duration).toBeLessThan(500) // P95 threshold
  }, 60000)
})
```

## Troubleshooting

### Server Not Available

Ensure the server is running before executing tests:

```bash
npm run dev
```

### k6 Not Found

Install k6 following the instructions above, or use `--vitest-only` flag:

```bash
npx tsx scripts/run-performance-tests.ts --vitest-only
```

### Tests Timing Out

- Increase timeout in test configuration
- Check server logs for errors
- Reduce concurrency level

### High Error Rates

- Check server resource usage (CPU, memory)
- Review server logs for errors
- Consider using stress benchmarks (`--env=stress`)

## Contributing

When adding new performance tests:

1. Add appropriate thresholds to `benchmarks.ts`
2. Include both k6 and Vitest versions if applicable
3. Update this README with new test documentation
4. Ensure tests pass in CI environment (`--env=ci`)
