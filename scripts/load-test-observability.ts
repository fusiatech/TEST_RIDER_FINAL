import { runSwarmPipeline } from '../server/orchestrator'
import { DEFAULT_SETTINGS } from '../lib/types'
import { getPrometheusMetrics } from '../server/observability'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

async function main() {
  const outDir = path.join(process.cwd(), 'artifacts')
  mkdirSync(outDir, { recursive: true })

  const runs = 3
  const durations: number[] = []
  const traces: Array<{ run: number; outputSample: string; confidence: number; validationPassed: boolean }> = []

  for (let i = 0; i < runs; i++) {
    const started = process.hrtime.bigint()
    const result = await runSwarmPipeline({
      prompt: `Load-test observability run ${i + 1}: generate a concise implementation checklist.`,
      settings: {
        ...DEFAULT_SETTINGS,
        enabledCLIs: ['custom'],
        customCLICommand: 'echo "synthetic agent output for {PROMPT}"',
        parallelCounts: {
          researcher: 1,
          planner: 1,
          coder: 1,
          validator: 1,
          security: 1,
          synthesizer: 1,
        },
        maxRuntimeSeconds: 10,
      },
      projectPath: process.cwd(),
      mode: 'swarm',
      onAgentOutput: () => {},
      onAgentStatus: () => {},
    })
    const durSec = Number(process.hrtime.bigint() - started) / 1_000_000_000
    durations.push(durSec)
    traces.push({
      run: i + 1,
      outputSample: result.finalOutput.slice(0, 200),
      confidence: result.confidence,
      validationPassed: result.validationPassed,
    })
  }

  const metrics = getPrometheusMetrics()
  writeFileSync(path.join(outDir, 'metrics-snapshot.prom'), metrics, 'utf-8')

  const report = {
    generatedAt: new Date().toISOString(),
    runs,
    durations,
    avgDurationSec: durations.reduce((a, b) => a + b, 0) / durations.length,
    traces,
    metricsSnapshotPath: 'artifacts/metrics-snapshot.prom',
    auditLogPath: 'artifacts/audit-events.ndjson',
    traceSamplePath: 'artifacts/trace-samples.ndjson',
    traceSampleTail: (() => {
      try {
        const content = readFileSync(path.join(outDir, 'trace-samples.ndjson'), 'utf-8').trim().split('\n')
        return content.slice(-10)
      } catch {
        return [] as string[]
      }
    })(),
  }

  writeFileSync(path.join(outDir, 'load-test-report.json'), JSON.stringify(report, null, 2), 'utf-8')
  console.log('Load-test report generated at artifacts/load-test-report.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
