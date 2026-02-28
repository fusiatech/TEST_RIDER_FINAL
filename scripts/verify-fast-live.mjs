import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || '4100'
const wsUrl = `ws://${host}:${port}/api/ws`
const baseUrl = `http://${host}:${port}`
const defaultTimeoutMs = Number.parseInt(process.env.FAST_VERIFY_TIMEOUT_MS || '30000', 10)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForLive() {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health/live`, { signal: AbortSignal.timeout(4000) })
      if (res.status === 200) return
    } catch {
      // retry
    }
    await sleep(1000)
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health/live`)
}

function extractAgentOutputStrings(messages) {
  return messages
    .filter((m) => m.includes('"type":"agent-output"'))
    .map((m) => {
      try {
        return JSON.parse(m).data || ''
      } catch {
        return ''
      }
    })
}

function hasProviderError(text) {
  const lower = (text || '').toLowerCase()
  return lower.includes('[api-runner] error:') || lower.includes('no usable provider output')
}

async function clearBacklog() {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolveClear, rejectClear) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
      rejectClear(new Error('backlog clear timeout'))
    }, 8000)
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'cancel-all-queued' }))
      ws.send(JSON.stringify({ type: 'emergency-stop', reason: 'fast-live-reset' }))
      setTimeout(() => {
        clearTimeout(timer)
        ws.close()
        resolveClear()
      }, 900)
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      rejectClear(err)
    })
  })
}

async function runCase({ name, mode, provider, prompt, intent = 'explain', timeoutMs = defaultTimeoutMs }) {
  const ws = new WebSocket(wsUrl)
  const id = `${name}-${Date.now()}`
  const payload = {
    type: 'start-swarm',
    mode,
    intent,
    prompt,
    sessionId: `fast-${id}`,
    idempotencyKey: `fast-${id}`,
    agentSelectionMode: 'manual',
    preferredAgent: provider,
    traceModeValidation: true,
  }

  const messages = []
  let runAccepted = false
  let finalType = null
  let finalText = ''
  let providerUsed = null

  await new Promise((resolveRun, rejectRun) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
      rejectRun(new Error(`timeout on ${name}`))
    }, timeoutMs)

    ws.on('open', () => {
      ws.send(JSON.stringify(payload))
    })

    ws.on('message', (raw) => {
      const text = String(raw)
      messages.push(text)
      if (text.includes('"type":"run.accepted"')) {
        runAccepted = true
        return
      }
      if (text.includes('"type":"swarm-result"')) {
        finalType = 'swarm-result'
        try {
          const parsed = JSON.parse(text)
          finalText = parsed?.result?.finalOutput || ''
          providerUsed = parsed?.result?.agents?.[0]?.provider || null
        } catch {
          finalText = text
        }
        clearTimeout(timer)
        ws.close()
        resolveRun()
      } else if (text.includes('"type":"swarm-error"')) {
        finalType = 'swarm-error'
        try {
          finalText = JSON.parse(text)?.error || text
        } catch {
          finalText = text
        }
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

  const agentOut = extractAgentOutputStrings(messages)
  const attempts = agentOut.filter((line) => line.includes('API attempt'))
  const failovers = agentOut.filter((line) => line.includes('Failover'))

  let pass = false
  let reason = 'ok'
  if (!runAccepted) {
    reason = 'run.accepted missing'
  } else if (finalType !== 'swarm-result') {
    reason = `final type ${finalType || 'none'}`
  } else if (hasProviderError(finalText)) {
    reason = 'provider returned runtime error'
  } else {
    if (mode === 'chat') {
      pass = finalText.toLowerCase().includes('chat_ok')
      if (!pass) reason = 'chat marker missing'
    } else if (mode === 'swarm') {
      const lower = finalText.toLowerCase()
      pass =
        (lower.includes('queue') && lower.includes('job')) ||
        lower.length > 40
      if (!pass) reason = 'swarm output too short'
    } else if (mode === 'project') {
      const lower = finalText.toLowerCase()
      pass =
        (lower.includes('phases') &&
          lower.includes('tasks') &&
          lower.includes('dependencies') &&
          lower.includes('acceptance') &&
          lower.includes('tickets')) ||
        lower.length > 60
      if (!pass) reason = 'project output too short'
    }
  }

  return {
    name,
    mode,
    providerRequested: provider,
    providerUsed,
    runAccepted,
    finalType,
    pass,
    reason,
    attempts,
    failovers,
    outputPreview: finalText.slice(0, 700),
  }
}

async function main() {
  await waitForLive()

  const cases = [
    {
      name: 'normal-gemini',
      mode: 'chat',
      provider: 'gemini',
      prompt: 'Reply in one line with exactly: CHAT_OK_GEMINI',
      intent: 'one_line_fix',
      timeoutMs: 45000,
    },
    {
      name: 'normal-openai',
      mode: 'chat',
      provider: 'codex',
      prompt: 'Reply in one line with exactly: CHAT_OK_OPENAI',
      intent: 'one_line_fix',
      timeoutMs: 45000,
    },
    {
      name: 'swarm-gemini',
      mode: 'swarm',
      provider: 'gemini',
      prompt: 'Return a concise orchestration summary with exactly 3 numbered steps and include the words QUEUE and JOB.',
      intent: 'plan',
      timeoutMs: 140000,
    },
    {
      name: 'swarm-claude',
      mode: 'swarm',
      provider: 'claude',
      prompt: 'Return a concise orchestration summary with exactly 3 numbered steps and include the words QUEUE and JOB.',
      intent: 'plan',
      timeoutMs: 90000,
    },
    {
      name: 'project-planner-tickets',
      mode: 'project',
      provider: 'gemini',
      prompt: 'Output markdown sections titled exactly: Phases, Tasks, Dependencies, Acceptance, Tickets.',
      intent: 'plan',
      timeoutMs: 180000,
    },
  ]

  const results = []
  for (const testCase of cases) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await clearBacklog()
      // eslint-disable-next-line no-await-in-loop
      const result = await runCase(testCase)
      results.push(result)
    } catch (error) {
      results.push({
        name: testCase.name,
        mode: testCase.mode,
        providerRequested: testCase.provider,
        providerUsed: null,
        runAccepted: false,
        finalType: null,
        pass: false,
        reason: error instanceof Error ? error.message : String(error),
        attempts: [],
        failovers: [],
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

  const outDir = resolve(process.cwd(), 'artifacts', 'phase-fast')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'fast-live-matrix.json')
  writeFileSync(outPath, `${JSON.stringify({ summary, results }, null, 2)}\n`, 'utf-8')
  console.log(JSON.stringify({ outPath, summary }, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
