# Performance Baselines

## Overview

This document defines performance targets and baselines for SwarmUI. These metrics should be monitored continuously and any regressions investigated.

## API Latency Targets

| Endpoint | P50 | P95 | P99 | Max |
|----------|-----|-----|-----|-----|
| `/api/health` | <10ms | <50ms | <100ms | <500ms |
| `/api/sessions` | <50ms | <200ms | <500ms | <1s |
| `/api/projects` | <50ms | <200ms | <500ms | <1s |
| `/api/jobs` | <100ms | <300ms | <700ms | <2s |
| `/api/settings` | <20ms | <100ms | <200ms | <500ms |
| `/api/files` | <100ms | <500ms | <1s | <3s |

## Throughput Targets

| Scenario | Target RPS | Error Rate |
|----------|------------|------------|
| Normal load (10 VUs) | 100 RPS | <0.1% |
| Peak load (50 VUs) | 300 RPS | <1% |
| Stress load (200 VUs) | 500 RPS | <5% |

## WebSocket Performance

| Metric | Target |
|--------|--------|
| Connection time | <100ms |
| Message latency | <50ms |
| Max concurrent connections | 500 |
| Message throughput | 1000 msg/s |

## Resource Limits

### Memory

| Component | Normal | Peak | Alert Threshold |
|-----------|--------|------|-----------------|
| Node.js heap | <256MB | <512MB | >400MB |
| RSS | <512MB | <1GB | >800MB |

### CPU

| Scenario | Target | Alert Threshold |
|----------|--------|-----------------|
| Idle | <5% | >10% |
| Normal load | <30% | >50% |
| Peak load | <70% | >85% |

## Test Scenarios

### 1. API Load Test (`api-load.js`)

Simulates normal API usage patterns:
- 10 concurrent users
- 2 minute duration
- Tests all major API endpoints
- Target: P95 <500ms, error rate <1%

```bash
npm run perf:api
```

### 2. WebSocket Load Test (`websocket-load.js`)

Tests WebSocket connection handling:
- 50 concurrent connections
- 1 minute duration
- Ping/pong message exchange
- Target: P95 latency <1s, error rate <5%

```bash
npm run perf:ws
```

### 3. Stress Test (`stress-test.js`)

Tests system behavior under extreme load:
- Ramps up to 200 concurrent users
- 7 minute duration
- Random endpoint selection
- Target: P99 <2s, error rate <10%

```bash
npm run perf:stress
```

## Running Performance Tests

### Prerequisites

1. Install k6: https://k6.io/docs/getting-started/installation/
2. Start the SwarmUI server: `npm run dev`

### Commands

```bash
# Run all performance tests
npm run perf:all

# Run individual tests
npm run perf:api
npm run perf:ws
npm run perf:stress

# Run with custom base URL
BASE_URL=https://staging.example.com k6 run tests/performance/api-load.js
```

### CI Integration

Performance tests can be integrated into CI pipelines:

```yaml
- name: Run Performance Tests
  run: |
    npm run perf:api -- --out json=perf-results.json
    # Fail if thresholds not met (k6 exits with code 99)
```

## Monitoring

### Prometheus Metrics

Key metrics to monitor:
- `http_request_duration_seconds` - API latency histogram
- `swarm_active_jobs` - Current job count
- `swarm_websocket_connections` - Active WS connections
- `nodejs_heap_size_used_bytes` - Memory usage

### Grafana Dashboards

Pre-configured dashboards available at:
- `/monitoring/grafana/dashboards/swarm-ui.json`

## Baseline History

| Date | Version | P95 Latency | Throughput | Notes |
|------|---------|-------------|------------|-------|
| 2026-02-27 | 1.0.0 | Baseline | Baseline | Initial measurements |

## Regression Investigation

When performance degrades:

1. Check recent commits for potential causes
2. Profile the affected endpoints
3. Review database query performance
4. Check for memory leaks
5. Analyze WebSocket connection handling
6. Review third-party service latencies

## Performance Optimization Tips

1. **Caching**: Use output cache for repeated queries
2. **Connection pooling**: Reuse database connections
3. **Compression**: Enable gzip for API responses
4. **Lazy loading**: Defer non-critical resources
5. **Batching**: Combine multiple small requests
