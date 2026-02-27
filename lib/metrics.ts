import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

// Create a registry
export const registry = new Registry()

// Collect default Node.js metrics
collectDefaultMetrics({ register: registry })

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry]
})

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry]
})

export const activeJobs = new Gauge({
  name: 'swarm_active_jobs',
  help: 'Number of active jobs',
  registers: [registry]
})

export const queuedJobs = new Gauge({
  name: 'swarm_queued_jobs',
  help: 'Number of queued jobs',
  registers: [registry]
})

export const pipelineRunsTotal = new Counter({
  name: 'swarm_pipeline_runs_total',
  help: 'Total pipeline runs',
  labelNames: ['mode', 'status'],
  registers: [registry]
})

export const agentResponseTime = new Histogram({
  name: 'swarm_agent_response_seconds',
  help: 'Agent response time in seconds',
  labelNames: ['agent', 'stage'],
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [registry]
})

export const confidenceScore = new Histogram({
  name: 'swarm_confidence_score',
  help: 'Confidence scores distribution',
  labelNames: ['stage'],
  buckets: [0, 20, 40, 60, 80, 100],
  registers: [registry]
})

export const cacheHitsTotal = new Counter({
  name: 'swarm_cache_hits_total',
  help: 'Total cache hits',
  registers: [registry]
})

export const cacheMissesTotal = new Counter({
  name: 'swarm_cache_misses_total',
  help: 'Total cache misses',
  registers: [registry]
})

export const websocketConnections = new Gauge({
  name: 'swarm_websocket_connections',
  help: 'Number of active WebSocket connections',
  registers: [registry]
})

export const agentSpawnsTotal = new Counter({
  name: 'swarm_agent_spawns_total',
  help: 'Total agent spawns',
  labelNames: ['provider', 'role'],
  registers: [registry]
})

export const agentFailuresTotal = new Counter({
  name: 'swarm_agent_failures_total',
  help: 'Total agent failures',
  labelNames: ['provider', 'role'],
  registers: [registry]
})
