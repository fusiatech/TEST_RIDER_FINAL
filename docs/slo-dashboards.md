# SLO Dashboards and Alert Thresholds

## Dashboard: Queue Health

- **P95 queue lag**: `histogram_quantile(0.95, sum by (le, source) (rate(swarm_queue_lag_seconds_bucket[5m])))`
  - **SLO**: p95 < 30s over 30m windows.
  - **Alert (warning)**: p95 > 45s for 10m.
  - **Alert (critical)**: p95 > 90s for 5m.
- **Queue depth**: `swarm_api_requests_total{route="/api/jobs",method="POST"}` and `/api/health` queueDepth cross-check.
  - **Alert**: sustained enqueue rate > completion rate for 15m.

## Dashboard: Pipeline Reliability

- **Pipeline success rate**:
  - Success = `swarm_pipeline_runs_total{validation_passed="true"}`
  - Total = `swarm_pipeline_runs_total`
  - **SLO**: success rate >= 99% (rolling 1h).
  - **Alert (warning)**: < 98% for 15m.
  - **Alert (critical)**: < 95% for 10m.
- **Pipeline latency p95**:
  - `histogram_quantile(0.95, sum by (le, mode) (rate(swarm_pipeline_duration_seconds_bucket[10m])))`
  - **SLO**: p95 < 120s.
  - **Alert**: p95 > 180s for 10m.

## Dashboard: Guardrails & Safety

- **Guardrail failures**: `sum(rate(swarm_guardrail_failures_total[15m])) by (check)`
  - **SLO**: zero critical check failures.
  - **Alert**: any non-zero for critical checks in 5m.
- **Span failures**: `sum(rate(swarm_span_failures_total[5m])) by (span_name)`
  - **Alert**: any span failure rate > 0.05/s for 10m.

## Dashboard: API / Retry Pressure

- **API error rate by route**:
  - `sum(rate(swarm_api_failures_total[5m])) by (route, method) / sum(rate(swarm_api_requests_total[5m])) by (route, method)`
  - **Alert**: > 2% for 10m.
- **CLI retry volume**:
  - `sum(rate(swarm_cli_retries_total[10m])) by (provider)`
  - **Alert**: retry surge > 3x baseline for 15m.

## Evidence/Audit Correlation

- Spans and events are durable in:
  - `artifacts/audit-events.ndjson`
  - `artifacts/trace-samples.ndjson`
- Use `traceId` to correlate API call → job enqueue → orchestrator stages.
