import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'

const host = process.env.HOST || '127.0.0.1'
const port = Number.parseInt(process.env.PORT || '4100', 10)
const wsUrl = process.env.WS_URL || `ws://${host}:${port}/api/ws`
const timeoutMs = Number.parseInt(process.env.WS_SMOKE_TIMEOUT_MS || '45000', 10)

async function runWsSmoke() {
  const logs = []
  const startedAt = Date.now()
  const payload = {
    type: 'start-swarm',
    mode: 'chat',
    intent: 'explain',
    prompt: 'Reply with one concise sentence: websocket smoke check.',
    sessionId: `ws-smoke-${Date.now()}`,
    idempotencyKey: `ws-smoke-${Date.now()}`,
    traceModeValidation: true,
  }

  const result = await new Promise((resolveRun, rejectRun) => {
    const ws = new WebSocket(wsUrl)
    let runAccepted = false
    let finalType = null
    let finalPayload = null

    const timeout = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // no-op
      }
      rejectRun(new Error('WS smoke timeout waiting for run completion'))
    }, timeoutMs)

    ws.on('open', () => {
      logs.push('ws.open')
      ws.send(JSON.stringify(payload))
    })

    ws.on('message', (data) => {
      const text = String(data)
      logs.push(text)
      if (text.includes('"type":"run.accepted"')) {
        runAccepted = true
        return
      }
      if (text.includes('"type":"swarm-result"') || text.includes('"type":"swarm-error"')) {
        finalType = text.includes('"type":"swarm-result"') ? 'swarm-result' : 'swarm-error'
        try {
          finalPayload = JSON.parse(text)
        } catch {
          finalPayload = null
        }
        clearTimeout(timeout)
        ws.close()
        resolveRun({ runAccepted, finalType, finalPayload })
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      rejectRun(err)
    })
  })

  const finalText = JSON.stringify(result.finalPayload ?? {})
  const hasMockOutput = finalText.includes('[mock-agent]')
  const pass = Boolean(result.runAccepted && result.finalType && !hasMockOutput)

  const summary = {
    timestamp: new Date().toISOString(),
    wsUrl,
    durationMs: Date.now() - startedAt,
    pass,
    runAccepted: result.runAccepted,
    finalType: result.finalType,
    hasMockOutput,
  }

  const outDir = resolve(process.cwd(), 'artifacts', 'phase-fast')
  const logsDir = resolve(outDir, 'logs')
  mkdirSync(logsDir, { recursive: true })
  writeFileSync(resolve(outDir, 'phase-fast-pass-fail-matrix.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
  writeFileSync(resolve(logsDir, 'ws-run-smoke.log'), `${logs.join('\n')}\n`, 'utf-8')
  console.log(JSON.stringify(summary, null, 2))

  if (!pass) {
    process.exit(1)
  }
}

void runWsSmoke().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

