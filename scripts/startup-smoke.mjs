import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'

const host = process.env.HOST || '127.0.0.1'
const basePort = Number.parseInt(process.env.PORT || '4100', 10)
const attempts = Number.parseInt(process.env.STARTUP_SMOKE_RUNS || '3', 10)
const timeoutMs = Number.parseInt(process.env.STARTUP_SMOKE_TIMEOUT_MS || '30000', 10)
const requestTimeoutMs = Number.parseInt(process.env.STARTUP_SMOKE_REQUEST_TIMEOUT_MS || '5000', 10)
const captureScreenshot = process.env.STARTUP_SMOKE_SCREENSHOT === '1'

const phaseDir = resolve(process.cwd(), 'artifacts', 'phase--1')
const logsDir = resolve(phaseDir, 'logs')
const screenshotsDir = resolve(phaseDir, 'screenshots')

mkdirSync(logsDir, { recursive: true })
mkdirSync(screenshotsDir, { recursive: true })

const startupLogPath = resolve(logsDir, 'startup.log')
const smokeLogPath = resolve(logsDir, 'startup-smoke.log')
const summaryPath = resolve(phaseDir, 'phase--1-summary.json')
const matrixPath = resolve(phaseDir, 'phase--1-pass-fail-matrix.json')
const risksPath = resolve(phaseDir, 'phase--1-known-risks.json')

const startupLogLines = []
const smokeLogLines = []

function logStartup(line) {
  const msg = `[${new Date().toISOString()}] ${line}`
  startupLogLines.push(msg)
  console.log(msg)
}

function logSmoke(line) {
  const msg = `[${new Date().toISOString()}] ${line}`
  smokeLogLines.push(msg)
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

async function fetchStatus(baseUrl, pathname) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  return {
    ok: res.ok,
    status: res.status,
    body: await res.text(),
  }
}

async function waitForServerReady(baseUrl) {
  const start = Date.now()
  let lastError = null

  while (Date.now() - start < timeoutMs) {
    try {
      const live = await fetchStatus(baseUrl, '/api/health/live')
      const ready = await fetchStatus(baseUrl, '/api/health/ready')
      if (live.status === 200 && ready.status === 200) {
        return {
          live: live.status,
          ready: ready.status,
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(1000)
  }

  throw new Error(lastError || `Server did not become ready within ${timeoutMs}ms`)
}

async function warmCriticalRoutes(baseUrl) {
  const checks = [
    '/api/health',
    '/api/auth/session',
  ]

  const results = []
  for (const path of checks) {
    try {
      const status = await fetchStatus(baseUrl, path)
      results.push({ path, status: status.status, ok: status.status < 500 })
    } catch (error) {
      results.push({
        path,
        status: 0,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

async function checkWebSocketConnectivity(wsUrl) {
  return await new Promise((resolveCheck) => {
    let settled = false
    const ws = new WebSocket(wsUrl)
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          ws.terminate()
        } catch {
          // noop
        }
        resolveCheck({ ok: false, message: 'WebSocket connect timeout' })
      }
    }, 8000)

    ws.on('open', () => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        try {
          ws.close()
        } catch {
          // noop
        }
        resolveCheck({ ok: true, message: 'WebSocket connected' })
      }
    })

    ws.on('error', (error) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        resolveCheck({ ok: false, message: error.message })
      }
    })
  })
}

async function takeScreenshotIfAvailable(baseUrl) {
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.screenshot({
      path: resolve(screenshotsDir, 'initial-load-ok.png'),
      fullPage: true,
    })
    await browser.close()
    return { ok: true, message: 'Captured startup screenshot' }
  } catch (error) {
    return {
      ok: false,
      message: `Screenshot skipped: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function runAttempt(index) {
  logSmoke(`Starting run ${index + 1}/${attempts}`)
  const port = await getFreePort(basePort + index)
  const baseUrl = `http://${host}:${port}`
  const wsUrl = `ws://${host}:${port}/api/ws`
  const child = spawn(process.execPath, ['./scripts/dev-local.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
    },
  })

  child.stdout?.on('data', (data) => {
    logStartup(`[run:${index + 1}] ${String(data).trimEnd()}`)
  })
  child.stderr?.on('data', (data) => {
    logStartup(`[run:${index + 1}:stderr] ${String(data).trimEnd()}`)
  })

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
    const readiness = await waitForServerReady(baseUrl)
    const criticalRoutes = await warmCriticalRoutes(baseUrl)
    const criticalRoutesOk = criticalRoutes.every((r) => r.ok)
    const ws = await checkWebSocketConnectivity(wsUrl)
    const status = ws.ok && criticalRoutesOk ? 'pass' : 'fail'

    logSmoke(
      `Run ${index + 1}: live=${readiness.live}, ready=${readiness.ready}, ws=${ws.ok ? 'ok' : 'fail'}`
    )

    return {
      run: index + 1,
      status,
      readiness,
      healthStatus: readiness.ready,
      ws,
      criticalRoutes,
      baseUrl,
      wsUrl,
      firstRequest500: readiness.ready >= 500,
    }
  } catch (error) {
    logSmoke(`Run ${index + 1} failed: ${error instanceof Error ? error.message : String(error)}`)
    return {
      run: index + 1,
      status: 'fail',
      readiness: null,
      healthStatus: 0,
      ws: { ok: false, message: 'Not tested due to startup failure' },
      criticalRoutes: [],
      baseUrl,
      wsUrl,
      firstRequest500: true,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await stopChild()
  }
}

const results = []
for (let i = 0; i < attempts; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  const result = await runAttempt(i)
  results.push(result)
}

const screenshotTarget = results.find((r) => r.status === 'pass')?.baseUrl
const screenshot = captureScreenshot && screenshotTarget
  ? await takeScreenshotIfAvailable(screenshotTarget)
  : { ok: false, message: 'Screenshot skipped: disabled or no successful run target' }
logSmoke(screenshot.message)

const passes = results.filter((r) => r.status === 'pass').length
const phasePassed = passes === attempts

const summary = {
  phase: -1,
  basePort,
  timestamp: new Date().toISOString(),
  attempts,
  passes,
  status: phasePassed ? 'pass' : 'fail',
  checks: {
    startupConsistency: phasePassed,
    firstRequestNo500: results.every((r) => !r.firstRequest500),
    healthReady: results.every((r) => r.healthStatus === 200),
    websocketReady: results.every((r) => r.ws.ok),
  },
  screenshot,
}

const matrix = {
  phase: -1,
  matrix: results,
}

const risks = {
  timestamp: new Date().toISOString(),
  residualRisks: phasePassed
    ? []
    : [
        'Startup consistency failed for one or more runs.',
        'First-request 500 or websocket readiness instability detected.',
      ],
}

writeFileSync(startupLogPath, `${startupLogLines.join('\n')}\n`, 'utf-8')
writeFileSync(smokeLogPath, `${smokeLogLines.join('\n')}\n`, 'utf-8')
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf-8')
writeFileSync(risksPath, `${JSON.stringify(risks, null, 2)}\n`, 'utf-8')

process.exit(phasePassed ? 0 : 1)
