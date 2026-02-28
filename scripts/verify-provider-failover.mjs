import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'

const host = process.env.HOST || '127.0.0.1'
const port = process.env.PORT || '4100'
const baseUrl = `http://${host}:${port}`
const wsUrl = `ws://${host}:${port}/api/ws`
const failoverTimeoutMs = Number.parseInt(process.env.PROVIDER_FAILOVER_TIMEOUT_MS || '420000', 10)

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function waitForLive(maxMs = 45000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health/live`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return
    } catch {
      // retry
    }
    await sleep(1000)
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health/live`)
}

async function main() {
  await waitForLive()

  const outDir = resolve(process.cwd(), 'artifacts', 'phase-agent-runtime')
  const traceDir = resolve(outDir, 'traces')
  mkdirSync(outDir, { recursive: true })
  mkdirSync(traceDir, { recursive: true })

  const ws = new WebSocket(wsUrl)
  const payload = {
    type: 'start-swarm',
    mode: 'chat',
    intent: 'one_line_fix',
    prompt: 'Reply with exactly: FAILOVER_OK',
    sessionId: `failover-${Date.now()}`,
    idempotencyKey: `failover-${Date.now()}`,
    agentSelectionMode: 'manual',
    preferredAgent: 'claude',
    traceModeValidation: true,
  }

  const attempts = []
  const failovers = []
  const statusEvents = []
  let runAccepted = false
  let acceptedRunId = null
  let finalType = null
  let finalPayload = null

  await new Promise((resolveRun, rejectRun) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
      rejectRun(new Error('failover verification timeout'))
    }, failoverTimeoutMs)

    ws.on('open', () => {
      ws.send(JSON.stringify(payload))
    })

    ws.on('message', (raw) => {
      const text = String(raw)
      let msg
      try {
        msg = JSON.parse(text)
      } catch {
        return
      }

      if (msg.type === 'run.accepted') {
        if (msg.sessionId && msg.sessionId !== payload.sessionId) return
        runAccepted = true
        acceptedRunId = msg.runId || null
        return
      }
      if (acceptedRunId && msg.runId && msg.runId !== acceptedRunId) {
        return
      }
      if (msg.sessionId && msg.sessionId !== payload.sessionId) {
        return
      }
      if (msg.type === 'agent-output' && typeof msg.data === 'string') {
        if (msg.data.includes('API attempt')) attempts.push(msg.data.trim())
        if (msg.data.includes('Failover')) failovers.push(msg.data.trim())
        return
      }
      if (msg.type === 'agent-status') {
        statusEvents.push({
          providerRequested: msg.providerRequested || null,
          providerActive: msg.providerActive || null,
          attempt: msg.attempt || null,
          failoverFrom: msg.failoverFrom || null,
          failureCode: msg.failureCode || null,
          status: msg.status,
        })
        return
      }

      if (msg.type === 'swarm-result' || msg.type === 'swarm-error') {
        finalType = msg.type
        finalPayload = msg
        clearTimeout(timer)
        ws.close()
        resolveRun()
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timer)
      rejectRun(err)
    })
  })

  const passed =
    runAccepted &&
    attempts.length > 0 &&
    (failovers.length > 0 || statusEvents.some((entry) => Boolean(entry.failoverFrom)))

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    wsUrl,
    runAccepted,
    finalType,
    passed,
    attempts,
    failovers,
    statusEvents,
    finalPayload,
  }

  const ts = Date.now()
  writeFileSync(resolve(outDir, 'provider-failover.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  writeFileSync(resolve(traceDir, `provider-failover-${ts}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  console.log(JSON.stringify({ passed, attempts: attempts.length, failovers: failovers.length }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
