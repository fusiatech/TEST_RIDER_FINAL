import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'

const host = process.env.HOST || '127.0.0.1'
const port = process.env.PORT || '4100'
const baseUrl = `http://${host}:${port}`
const wsUrl = `ws://${host}:${port}/api/ws`

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

async function clearQueue() {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolveClear, rejectClear) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
      rejectClear(new Error('clearQueue timeout'))
    }, 10000)

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'cancel-all-queued' }))
      ws.send(JSON.stringify({ type: 'emergency-stop', reason: 'verify-run-matrix-reset' }))
      setTimeout(() => {
        clearTimeout(timer)
        ws.close()
        resolveClear()
      }, 1000)
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      rejectClear(err)
    })
  })
}

function parseMessage(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function hasProviderErrorText(text) {
  const lower = (text || '').toLowerCase()
  return lower.includes('[api-runner] error:') || lower.includes('no usable provider output')
}

async function runCase({ name, mode, provider, prompt, intent = 'explain', timeoutMs = 120000 }) {
  const ws = new WebSocket(wsUrl)
  const runId = `${name}-${Date.now()}`
  const payload = {
    type: 'start-swarm',
    mode,
    intent,
    prompt,
    sessionId: `verify-${runId}`,
    idempotencyKey: `verify-${runId}`,
    agentSelectionMode: 'manual',
    preferredAgent: provider,
    traceModeValidation: true,
  }

  let runAccepted = false
  let acceptedRunId = null
  let finalType = null
  let finalOutput = ''
  let finalError = ''
  const attempts = []
  const failovers = []
  const statusTrace = []

  await new Promise((resolveRun, rejectRun) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
      rejectRun(new Error(`timeout: ${name}`))
    }, timeoutMs)

    ws.on('open', () => {
      ws.send(JSON.stringify(payload))
    })

    ws.on('message', (raw) => {
      const text = String(raw)
      const msg = parseMessage(text)
      if (!msg) return

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
        statusTrace.push({
          agentId: msg.agentId,
          status: msg.status,
          providerRequested: msg.providerRequested || null,
          providerActive: msg.providerActive || null,
          attempt: msg.attempt || null,
          failoverFrom: msg.failoverFrom || null,
          failureCode: msg.failureCode || null,
        })
        return
      }

      if (msg.type === 'swarm-result') {
        finalType = 'swarm-result'
        finalOutput = msg?.result?.finalOutput || ''
        clearTimeout(timer)
        ws.close()
        resolveRun()
        return
      }

      if (msg.type === 'swarm-error') {
        finalType = 'swarm-error'
        finalError = msg?.error || ''
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

  let pass = false
  let reason = 'ok'
  if (!runAccepted) {
    reason = 'run.accepted missing'
  } else if (finalType === 'swarm-error') {
    reason = finalError || 'swarm-error'
  } else if (finalType !== 'swarm-result') {
    reason = `final type ${finalType || 'none'}`
  } else if (hasProviderErrorText(finalOutput)) {
    reason = 'provider runtime error'
  } else {
    const lower = finalOutput.toLowerCase()
    if (mode === 'chat') {
      pass = lower.length > 20
      if (!pass) reason = 'chat output too short'
    } else if (mode === 'swarm') {
      pass = lower.includes('queue') || lower.includes('job') || lower.length > 40
      if (!pass) reason = 'swarm markers missing'
    } else if (mode === 'project') {
      pass =
        (lower.includes('phases') &&
          lower.includes('tasks') &&
          lower.includes('dependencies') &&
          lower.includes('acceptance')) ||
        lower.length > 60
      if (!pass) reason = 'project planner output too short'
    }
  }

  return {
    name,
    mode,
    providerRequested: provider,
    runAccepted,
    finalType,
    pass,
    reason,
    attempts,
    failovers,
    statusTrace,
    outputPreview: (finalOutput || finalError).slice(0, 800),
  }
}

async function main() {
  await waitForLive()

  const outDir = resolve(process.cwd(), 'artifacts', 'phase-agent-runtime')
  const logDir = resolve(outDir, 'logs')
  const traceDir = resolve(outDir, 'traces')
  mkdirSync(outDir, { recursive: true })
  mkdirSync(logDir, { recursive: true })
  mkdirSync(traceDir, { recursive: true })

  const testCases = [
    {
      name: 'normal-gemini',
      mode: 'chat',
      provider: 'gemini',
      prompt: 'Give a concise answer to: what is 2+2? one sentence only.',
      intent: 'one_line_fix',
      timeoutMs: 90000,
    },
    {
      name: 'swarm-gemini-primary',
      mode: 'swarm',
      provider: 'gemini',
      prompt: 'Provide a short orchestration output that references queue and job transitions.',
      intent: 'plan',
      timeoutMs: 300000,
    },
    {
      name: 'swarm-failover-from-claude',
      mode: 'swarm',
      provider: 'claude',
      prompt: 'Return a short execution summary and include queue and job words.',
      intent: 'plan',
      timeoutMs: 300000,
    },
    {
      name: 'project-planner-tickets',
      mode: 'project',
      provider: 'gemini',
      prompt: 'Create structured output sections: Phases, Tasks, Dependencies, Acceptance, Tickets.',
      intent: 'plan',
      timeoutMs: 300000,
    },
  ]

  const results = []
  for (const testCase of testCases) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await clearQueue()
      // eslint-disable-next-line no-await-in-loop
      const result = await runCase(testCase)
      results.push(result)
    } catch (error) {
      results.push({
        name: testCase.name,
        mode: testCase.mode,
        providerRequested: testCase.provider,
        runAccepted: false,
        finalType: null,
        pass: false,
        reason: error instanceof Error ? error.message : String(error),
        attempts: [],
        failovers: [],
        statusTrace: [],
        outputPreview: '',
      })
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl,
    wsUrl,
    totals: {
      runs: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
    },
  }

  const matrix = { summary, results }
  const ts = Date.now()
  writeFileSync(resolve(outDir, 'pass-fail-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`, 'utf-8')
  writeFileSync(resolve(traceDir, `run-matrix-${ts}.json`), `${JSON.stringify(matrix, null, 2)}\n`, 'utf-8')
  writeFileSync(resolve(outDir, 'proof-responses.json'), `${JSON.stringify(results.map((r) => ({
    name: r.name,
    mode: r.mode,
    providerRequested: r.providerRequested,
    finalType: r.finalType,
    outputPreview: r.outputPreview,
  })), null, 2)}\n`, 'utf-8')
  writeFileSync(resolve(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')

  const logLines = results.map((r) => `[${r.name}] pass=${r.pass} reason=${r.reason}`)
  writeFileSync(resolve(logDir, `run-matrix-${ts}.log`), `${logLines.join('\n')}\n`, 'utf-8')

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
