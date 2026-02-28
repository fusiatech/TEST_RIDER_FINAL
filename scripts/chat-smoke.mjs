import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'

const host = process.env.HOST || '127.0.0.1'
const basePort = Number.parseInt(process.env.PORT || '4100', 10)
const startupTimeoutMs = Number.parseInt(process.env.CHAT_SMOKE_STARTUP_TIMEOUT_MS || '90000', 10)
const completionTimeoutMs = Number.parseInt(process.env.CHAT_SMOKE_COMPLETION_TIMEOUT_MS || '45000', 10)
const requestTimeoutMs = Number.parseInt(process.env.CHAT_SMOKE_REQUEST_TIMEOUT_MS || '15000', 10)

const phaseDir = resolve(process.cwd(), 'artifacts', 'phase-0')
const logsDir = resolve(phaseDir, 'logs')
mkdirSync(logsDir, { recursive: true })

const smokeLogPath = resolve(logsDir, 'chat-smoke.log')
const summaryPath = resolve(phaseDir, 'phase-0-summary.json')
const matrixPath = resolve(phaseDir, 'phase-0-pass-fail-matrix.json')
const risksPath = resolve(phaseDir, 'phase-0-known-risks.json')

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

async function runChatSmoke() {
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

  let runAccepted = false
  let finalMessageType = null
  let wsError = null

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

    await new Promise((resolveRun, rejectRun) => {
      const ws = new WebSocket(wsUrl)
      const timeout = setTimeout(() => {
        ws.terminate()
        rejectRun(new Error('Chat smoke timeout waiting for run result'))
      }, completionTimeoutMs)

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'start-swarm',
            prompt: 'Reply with one concise sentence: chat smoke test',
            sessionId: `chat-smoke-${Date.now()}`,
            mode: 'chat',
            intent: 'explain',
            idempotencyKey: `chat-smoke-${Date.now()}`,
          })
        )
      })

      ws.on('message', (data) => {
        const text = String(data)
        if (text.includes('"type":"run.accepted"')) {
          runAccepted = true
          return
        }
        if (text.includes('"type":"swarm-result"') || text.includes('"type":"swarm-error"')) {
          finalMessageType = text.includes('"type":"swarm-result"') ? 'swarm-result' : 'swarm-error'
          clearTimeout(timeout)
          ws.close()
          resolveRun(undefined)
        }
      })

      ws.on('error', (error) => {
        wsError = error.message
      })

      ws.on('close', () => {
        if (!finalMessageType) {
          // keep timeout as source of truth
        }
      })
    })

    const pass = runAccepted && (finalMessageType === 'swarm-result' || finalMessageType === 'swarm-error')
    const summary = {
      phase: 0,
      timestamp: new Date().toISOString(),
      baseUrl,
      wsUrl,
      checks: {
        runAccepted,
        finalMessageType,
        wsError,
      },
      status: pass ? 'pass' : 'fail',
    }

    writeFileSync(smokeLogPath, `${logLines.join('\n')}\n`, 'utf-8')
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
    writeFileSync(
      matrixPath,
      `${JSON.stringify({ phase: 0, matrix: [{ name: 'chat-smoke', pass }] }, null, 2)}\n`,
      'utf-8'
    )
    writeFileSync(
      risksPath,
      `${JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          residualRisks: pass ? [] : ['Chat smoke did not receive expected websocket lifecycle events.'],
        },
        null,
        2
      )}\n`,
      'utf-8'
    )

    if (!pass) {
      process.exit(1)
    }
  } finally {
    await stopChild()
  }

  process.exit(0)
}

void runChatSmoke().catch((error) => {
  log(`Fatal chat smoke error: ${error instanceof Error ? error.message : String(error)}`)
  writeFileSync(smokeLogPath, `${logLines.join('\n')}\n`, 'utf-8')
  process.exit(1)
})
