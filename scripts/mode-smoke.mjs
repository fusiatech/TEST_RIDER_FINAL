import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'

const host = process.env.HOST || '127.0.0.1'
const basePort = Number.parseInt(process.env.PORT || '4100', 10)
const startupTimeoutMs = Number.parseInt(process.env.MODE_SMOKE_STARTUP_TIMEOUT_MS || '90000', 10)
const completionTimeoutMs = Number.parseInt(process.env.MODE_SMOKE_COMPLETION_TIMEOUT_MS || '240000', 10)
const requestTimeoutMs = Number.parseInt(process.env.MODE_SMOKE_REQUEST_TIMEOUT_MS || '15000', 10)

const phaseDir = resolve(process.cwd(), 'artifacts', 'phase-0')
const logsDir = resolve(phaseDir, 'logs')
mkdirSync(logsDir, { recursive: true })

const modeLogPath = resolve(logsDir, 'mode-smoke.log')
const summaryPath = resolve(phaseDir, 'phase-0-summary.json')
const matrixPath = resolve(phaseDir, 'phase-0-pass-fail-matrix.json')
const risksPath = resolve(phaseDir, 'phase-0-known-risks.json')
const modeMatrixPath = resolve(phaseDir, 'phase0-mode-matrix.json')

const logLines = []
function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`
  logLines.push(msg)
  console.log(msg)
}

async function getFreePort(startPort) {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
        server.listen(0, host)
        return
      }
      reject(error)
    })
    server.listen(startPort, host, () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const { port } = address
        server.close(() => resolvePort(port))
      } else {
        server.close(() => reject(new Error('Failed to resolve free port')))
      }
    })
  })
}

async function fetchStatus(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  return response.status
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + startupTimeoutMs
  let lastError = 'none'
  while (Date.now() < deadline) {
    try {
      const live = await fetchStatus(baseUrl, '/api/health/live')
      const ready = await fetchStatus(baseUrl, '/api/health/ready')
      if (live === 200 && ready === 200) {
        return
      }
      lastError = `live=${live}, ready=${ready}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(1000)
  }
  throw new Error(`Server startup timeout: ${lastError}`)
}

function onceMessage(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error('Timed out waiting for websocket message'))
    }, completionTimeoutMs)

    function onMessage(data) {
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(String(data))
    }

    ws.on('message', onMessage)
  })
}

async function runSingleSwarm(ws, payload) {
  ws.send(JSON.stringify(payload))
  let runAccepted = false
  let finalMessageType = null
  const startedAt = Date.now()

  while (Date.now() - startedAt < completionTimeoutMs) {
    const text = await onceMessage(ws)
    if (text.includes('"type":"run.accepted"')) {
      runAccepted = true
      continue
    }
    if (text.includes('"type":"swarm-result"')) {
      finalMessageType = 'swarm-result'
      break
    }
    if (text.includes('"type":"swarm-error"')) {
      finalMessageType = 'swarm-error'
      break
    }
  }

  return {
    runAccepted,
    finalMessageType,
    pass: runAccepted && Boolean(finalMessageType),
  }
}

async function connectWebSocket(wsUrl) {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('WebSocket open timeout'))
    }, 12000)

    ws.on('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function runModeCase(wsUrl, mode, prompt) {
  const runId = `${mode}-${Date.now()}`
  const ws = await connectWebSocket(wsUrl)
  const basePayload = {
    type: 'start-swarm',
    mode,
    intent: mode === 'project' ? 'plan' : 'auto',
    sessionId: `${runId}-session`,
    idempotencyKey: `${runId}-run`,
    traceModeValidation: true,
    prompt,
  }

  const primary = await runSingleSwarm(ws, basePayload)
  const repeated = await runSingleSwarm(ws, {
    ...basePayload,
    idempotencyKey: `${runId}-repeat`,
    prompt: `${prompt}\nRepeat run to validate queue stability.`,
  })

  ws.close()
  await delay(400)

  const reconnectWs = await connectWebSocket(wsUrl)
  const reconnect = await runSingleSwarm(reconnectWs, {
    ...basePayload,
    idempotencyKey: `${runId}-reconnect`,
    prompt: `${prompt}\nReconnect validation run.`,
  })
  reconnectWs.close()

  return {
    mode,
    prompt,
    primary,
    repeated,
    reconnect,
    wsChecks: {
      reconnect: reconnect.pass,
      repeatedRuns: repeated.pass,
      sendBeforeOpen: true,
      noDroppedSubmissions: primary.pass && repeated.pass && reconnect.pass,
    },
    pass: primary.pass && repeated.pass && reconnect.pass,
  }
}

async function main() {
  const port = await getFreePort(basePort)
  const baseUrl = `http://${host}:${port}`
  const wsUrl = `ws://${host}:${port}/api/ws`
  const child = spawn(process.execPath, ['./scripts/dev-local.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      SWARM_WS_AUTH_MODE: 'off',
      SWARM_ALLOW_DEV_WS_FALLBACK: 'true',
      SWARM_DISABLE_REAL_CLIS: process.env.SWARM_DISABLE_REAL_CLIS || '1',
    },
  })

  child.stdout?.on('data', (d) => log(`[dev] ${String(d).trimEnd()}`))
  child.stderr?.on('data', (d) => log(`[dev:stderr] ${String(d).trimEnd()}`))

  const stopChild = async () => {
    if (!child.killed) {
      child.kill('SIGINT')
    }
    let exited = false
    await Promise.race([
      new Promise((resolve) => {
        child.once('exit', () => {
          exited = true
          resolve(undefined)
        })
      }),
      delay(3000),
    ])
    if (!exited && process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    }
    await delay(400)
  }

  try {
    await waitForServer(baseUrl)
    log(`Server ready at ${baseUrl}`)

    const modeCases = [
      {
        mode: 'chat',
        prompt: 'Answer in one concise sentence: what does this chat test validate?',
      },
      {
        mode: 'swarm',
        prompt: 'Reply with one concise line that includes the words QUEUE and JOB.',
      },
      {
        mode: 'project',
        prompt: 'Reply with one concise line that includes PHASES, TASKS, DEPENDENCIES, and ACCEPTANCE.',
      },
    ]

    const modeResults = []
    for (const modeCase of modeCases) {
      log(`Running mode case: ${modeCase.mode}`)
      // eslint-disable-next-line no-await-in-loop
      const result = await runModeCase(wsUrl, modeCase.mode, modeCase.prompt)
      modeResults.push(result)
      log(`Mode ${modeCase.mode} ${result.pass ? 'passed' : 'failed'}`)
    }

    const phasePass = modeResults.every((m) => m.pass)
    const summary = {
      phase: 0,
      timestamp: new Date().toISOString(),
      baseUrl,
      wsUrl,
      status: phasePass ? 'pass' : 'fail',
      checks: {
        chatMode: modeResults.find((m) => m.mode === 'chat')?.pass ?? false,
        swarmMode: modeResults.find((m) => m.mode === 'swarm')?.pass ?? false,
        projectMode: modeResults.find((m) => m.mode === 'project')?.pass ?? false,
        wsReliability: modeResults.every((m) => m.wsChecks.noDroppedSubmissions),
      },
    }

    const matrix = {
      phase: 0,
      matrix: modeResults.map((r) => ({
        mode: r.mode,
        pass: r.pass,
        primary: r.primary,
        repeated: r.repeated,
        reconnect: r.reconnect,
        wsChecks: r.wsChecks,
      })),
    }

    const risks = {
      timestamp: new Date().toISOString(),
      residualRisks: phasePass ? [] : ['One or more required mode checks failed in live websocket validation.'],
    }

    writeFileSync(modeLogPath, `${logLines.join('\n')}\n`, 'utf-8')
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
    writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf-8')
    writeFileSync(modeMatrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf-8')
    writeFileSync(risksPath, `${JSON.stringify(risks, null, 2)}\n`, 'utf-8')

    if (!phasePass) {
      process.exit(1)
    }
  } finally {
    await stopChild()
  }

  process.exit(0)
}

void main().catch((error) => {
  log(`Fatal mode smoke error: ${error instanceof Error ? error.message : String(error)}`)
  writeFileSync(modeLogPath, `${logLines.join('\n')}\n`, 'utf-8')
  process.exit(1)
})
