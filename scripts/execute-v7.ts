import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'
import { getSettings, saveSettings, saveProject, deleteProject } from '../server/storage'
import type { Project, Settings, Ticket } from '../lib/types'
import { sanitizeOutputText, isOutputQualityAcceptable } from '../lib/output-sanitize'
import { evaluateEvidenceSufficiency } from '../server/anti-hallucination'

const host = process.env.HOST || '127.0.0.1'
const defaultPort = Number.parseInt(process.env.PORT || '4100', 10)
const startupTimeoutMs = Number.parseInt(process.env.V7_STARTUP_TIMEOUT_MS || '35000', 10)
const runTimeoutMs = Number.parseInt(process.env.V7_RUN_TIMEOUT_MS || '90000', 10)
const requestTimeoutMs = Number.parseInt(process.env.V7_REQUEST_TIMEOUT_MS || '7000', 10)
const devAuthCookie = 'authjs.session-token=v7-dev-session'

type PhaseResult = {
  name: string
  pass: boolean
  details?: Record<string, unknown>
}

function nowIso() {
  return new Date().toISOString()
}

function ensurePhaseDirs(phaseSlug: string) {
  const base = resolve(process.cwd(), 'artifacts', phaseSlug)
  const logsDir = resolve(base, 'logs')
  mkdirSync(logsDir, { recursive: true })
  return { base, logsDir }
}

async function getFreePort(startPort: number) {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', (error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'EADDRINUSE'
      ) {
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

async function fetchJson(baseUrl: string, path: string, init?: RequestInit) {
  const incomingHeaders = new Headers(init?.headers ?? {})
  if (!incomingHeaders.has('Content-Type') && init?.body) {
    incomingHeaders.set('Content-Type', 'application/json')
  }
  if (!incomingHeaders.has('Cookie')) {
    incomingHeaders.set('Cookie', devAuthCookie)
  }
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: incomingHeaders,
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, ok: res.ok, json }
}

async function waitForReady(baseUrl: string) {
  const deadline = Date.now() + startupTimeoutMs
  let lastError = 'none'
  while (Date.now() < deadline) {
    try {
      const live = await fetchJson(baseUrl, '/api/health/live')
      const ready = await fetchJson(baseUrl, '/api/health/ready')
      if (live.status === 200 && ready.status === 200) return
      lastError = `live=${live.status},ready=${ready.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(1000)
  }
  throw new Error(`Server not ready in time: ${lastError}`)
}

async function startDevServer(port: number, logSink: string[]) {
  const child = spawn(process.execPath, ['./scripts/dev-local.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      WS_AUTH_ENABLED: 'false',
      SWARM_ENABLE_SYSTEM_CLIS: '0',
      SWARM_DISABLE_REAL_CLIS: '1',
      SWARM_FORCE_MOCK_AGENTS: '1',
      SWARM_CLI_DETECT_SKIP_VERSION: '1',
      SWARM_FAKE_SESSION_COOKIE: devAuthCookie,
    },
  })

  child.stdout?.on('data', (d) => logSink.push(`[${nowIso()}] [dev] ${String(d).trimEnd()}`))
  child.stderr?.on('data', (d) => logSink.push(`[${nowIso()}] [dev:stderr] ${String(d).trimEnd()}`))

  const baseUrl = `http://${host}:${port}`
  await waitForReady(baseUrl)
  return { child, baseUrl, wsUrl: `ws://${host}:${port}/api/ws` }
}

async function stopDevServer(child: ReturnType<typeof spawn>) {
  if (!child.killed) child.kill('SIGINT')
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

async function connectWs(wsUrl: string) {
  return await new Promise<WebSocket>((resolveWs, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('WS open timeout'))
    }, 12_000)
    ws.on('open', () => {
      clearTimeout(timer)
      resolveWs(ws)
    })
    ws.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function runWsMode(wsUrl: string, mode: 'chat' | 'swarm' | 'project', prompt: string) {
  const ws = await connectWs(wsUrl)
  const id = `${mode}-${Date.now()}`
  let runAccepted = false
  let finalType: 'swarm-result' | 'swarm-error' | null = null
  let finalPayload: Record<string, unknown> | null = null
  const logs: string[] = []

  const done = new Promise<void>((resolveRun, rejectRun) => {
    const timeout = setTimeout(() => {
      ws.terminate()
      rejectRun(new Error(`Mode ${mode} run timed out`))
    }, runTimeoutMs)
    ws.on('message', (data) => {
      const text = String(data)
      logs.push(text)
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(text) as Record<string, unknown>
      } catch {
        parsed = null
      }
      if (text.includes('"type":"run.accepted"')) runAccepted = true
      if (text.includes('"type":"swarm-result"')) {
        finalType = 'swarm-result'
        finalPayload = parsed
        clearTimeout(timeout)
        resolveRun()
      } else if (text.includes('"type":"swarm-error"')) {
        finalType = 'swarm-error'
        finalPayload = parsed
        clearTimeout(timeout)
        resolveRun()
      }
    })
  })

  ws.send(
    JSON.stringify({
      type: 'start-swarm',
      prompt,
      sessionId: `${id}-session`,
      mode,
      intent: mode === 'project' ? 'plan' : 'auto',
      idempotencyKey: `${id}-run`,
      traceModeValidation: true,
    })
  )
  await done
  ws.close()

  return {
    mode,
    prompt,
    runAccepted,
    finalType,
    finalPayload,
    pass: runAccepted && Boolean(finalType),
    logsCount: logs.length,
  }
}

function verifyAgentsHeadless(settings: Settings) {
  const apiKeys = settings.apiKeys ?? {}
  const matrix = [
    { provider: 'codex', inAppConfigured: Boolean(apiKeys.openai) },
    { provider: 'gemini', inAppConfigured: Boolean(apiKeys.google) },
    { provider: 'claude', inAppConfigured: Boolean(apiKeys.anthropic) },
  ]
  return {
    mode: 'in-app-only',
    configuredCount: matrix.filter((m) => m.inAppConfigured).length,
    total: matrix.length,
    matrix,
  }
}

async function execute() {
  const port = await getFreePort(defaultPort)
  const runLog: string[] = []
  const originalSettings = await getSettings()
  let seededProjectId: string | null = null

  let server: { child: ReturnType<typeof spawn>; baseUrl: string; wsUrl: string } | null = null

  try {
    // Phase 1: full flow testing first.
    const phase1Dirs = ensurePhaseDirs('phase-1-flow')
    const phase1Results: PhaseResult[] = []
    const realAgents = verifyAgentsHeadless(originalSettings)
    runLog.push(`[${nowIso()}] in-app-agent-check configured=${realAgents.configuredCount}/${realAgents.total}`)

    server = await startDevServer(await getFreePort(port), runLog)
    runLog.push(`[${nowIso()}] server-started ${server.baseUrl}`)

    const modePrompts: Array<{ mode: 'chat' | 'swarm' | 'project'; prompt: string }> = [
      { mode: 'chat', prompt: 'Give one concise sentence confirming chat-mode response path.' },
      { mode: 'swarm', prompt: 'Execute a multi-step orchestration summary: analyze, plan, validate, and summarize.' },
      {
        mode: 'project',
        prompt: 'Create a build planning output with phases, tasks, dependencies, and acceptance criteria for a note-taking app.',
      },
    ]

    const modeRuns = []
    for (const item of modePrompts) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runWsMode(server.wsUrl, item.mode, item.prompt)
      modeRuns.push(result)
      phase1Results.push({
        name: `mode-${item.mode}`,
        pass: result.pass,
        details: result,
      })
    }
    // repeated-run reliability check
    const chatRepeat = await runWsMode(
      server.wsUrl,
      'chat',
      'Repeat run reliability check: return one concise sentence.'
    )
    phase1Results.push({
      name: 'mode-chat-repeat',
      pass: chatRepeat.pass,
      details: chatRepeat,
    })

    const now = Date.now()
    const projectPayload: Project = {
      id: `project-v7-${now}`,
      name: 'V7 Flow Validation Project',
      description: 'Headless flow validation for ticketing and PRD endpoints.',
      prd: '# Product Requirements\n\n## Scope\nValidate PRD endpoint flow.',
      prdStatus: 'draft',
      features: ['flow-checks'],
      epics: [],
      tickets: [],
      createdAt: now,
      updatedAt: now,
      status: 'planning',
    }
    await stopDevServer(server.child)
    server = null
    await saveProject(projectPayload)
    seededProjectId = projectPayload.id
    phase1Results.push({
      name: 'project-seeded',
      pass: true,
      details: { projectId: projectPayload.id },
    })
    server = await startDevServer(await getFreePort(port), runLog)

    const ticketPayload: Ticket = {
      id: `ticket-v7-${now}`,
      projectId: projectPayload.id,
      title: 'Validation ticket',
      description: 'Ensure ticket API create/update works.',
      acceptanceCriteria: ['Ticket can be created', 'Ticket can be updated'],
      complexity: 'S',
      status: 'backlog',
      assignedRole: 'coder',
      level: 'task',
      dependencies: [],
      createdAt: now,
      updatedAt: now,
    }
    const createTicket = await fetchJson(server.baseUrl, `/api/projects/${projectPayload.id}/tickets`, {
      method: 'POST',
      body: JSON.stringify(ticketPayload),
    })
    phase1Results.push({
      name: 'ticket-create',
      pass: createTicket.status === 201,
      details: { status: createTicket.status, body: createTicket.json },
    })

    const updateTicket = await fetchJson(server.baseUrl, `/api/projects/${projectPayload.id}/tickets`, {
    method: 'PUT',
    body: JSON.stringify({
      ticketId: ticketPayload.id,
      status: 'in_progress',
    }),
  })
    phase1Results.push({
    name: 'ticket-update',
    pass: updateTicket.status === 200,
    details: { status: updateTicket.status, body: updateTicket.json },
  })

    const prdGet = await fetchJson(server.baseUrl, `/api/projects/${projectPayload.id}/prd`)
    phase1Results.push({
    name: 'prd-get',
    pass: prdGet.status === 200,
    details: { status: prdGet.status, body: prdGet.json },
  })

    const prdWorkflowGet = await fetchJson(server.baseUrl, `/api/projects/${projectPayload.id}/prd-workflow`)
    phase1Results.push({
    name: 'prd-workflow-get',
    pass: prdWorkflowGet.status === 200,
    details: { status: prdWorkflowGet.status, body: prdWorkflowGet.json },
  })

    const phase1Pass = phase1Results.every((r) => r.pass)
    writeFileSync(resolve(phase1Dirs.logsDir, 'phase-1-flow.log'), `${runLog.join('\n')}\n`, 'utf-8')
    writeFileSync(
    resolve(phase1Dirs.base, 'phase-1-flow-pass-fail-matrix.json'),
    `${JSON.stringify({ timestamp: nowIso(), results: phase1Results }, null, 2)}\n`,
    'utf-8'
  )
    writeFileSync(
    resolve(phase1Dirs.base, 'phase-1-flow-summary.json'),
    `${JSON.stringify(
      {
        timestamp: nowIso(),
        status: phase1Pass ? 'pass' : 'fail',
        checks: {
          modeChat: modeRuns.find((r) => r.mode === 'chat')?.pass ?? false,
          modeSwarm: modeRuns.find((r) => r.mode === 'swarm')?.pass ?? false,
          modeProject: modeRuns.find((r) => r.mode === 'project')?.pass ?? false,
          ticketingFlow: phase1Results.find((r) => r.name === 'ticket-update')?.pass ?? false,
          prdFlow: phase1Results.find((r) => r.name === 'prd-workflow-get')?.pass ?? false,
          realAgentPresenceChecked: true,
        },
        realAgents,
      },
      null,
      2
    )}\n`,
    'utf-8'
  )
    writeFileSync(
    resolve(phase1Dirs.base, 'known-risks.json'),
    `${JSON.stringify(
      {
        timestamp: nowIso(),
        residualRisks: phase1Pass ? [] : ['One or more mode/flow checks failed in phase 1.'],
      },
      null,
      2
    )}\n`,
    'utf-8'
  )

    // Phase 2: runtime/setup hardening
    await stopDevServer(server.child)
    server = null
    const phase2Dirs = ensurePhaseDirs('phase-2-runtime')
    const phase2Runs: Record<string, unknown>[] = []
    const coldStarts = 2
    for (let i = 0; i < coldStarts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const p = await getFreePort(port + i + 1)
    // eslint-disable-next-line no-await-in-loop
    const localLogs: string[] = []
    // eslint-disable-next-line no-await-in-loop
    const s = await startDevServer(p, localLogs)
    // eslint-disable-next-line no-await-in-loop
    const live = await fetchJson(s.baseUrl, '/api/health/live')
    // eslint-disable-next-line no-await-in-loop
    const ready = await fetchJson(s.baseUrl, '/api/health/ready')
    // eslint-disable-next-line no-await-in-loop
    const authSession = await fetchJson(s.baseUrl, '/api/auth/session')
    // eslint-disable-next-line no-await-in-loop
    const ws = await connectWs(s.wsUrl)
    ws.close()
    // eslint-disable-next-line no-await-in-loop
    await stopDevServer(s.child)
    phase2Runs.push({
      run: i + 1,
      live: live.status,
      ready: ready.status,
      authSession: authSession.status,
      wsOpen: true,
      pass: live.status === 200 && ready.status === 200 && authSession.status < 500,
    })
    runLog.push(...localLogs)
    }
    const phase2Pass = phase2Runs.every((r) => (r.pass as boolean) === true)
    writeFileSync(resolve(phase2Dirs.logsDir, 'phase-2-runtime.log'), `${runLog.join('\n')}\n`, 'utf-8')
    writeFileSync(
    resolve(phase2Dirs.base, 'phase-2-runtime-pass-fail-matrix.json'),
    `${JSON.stringify({ timestamp: nowIso(), runs: phase2Runs }, null, 2)}\n`,
    'utf-8'
  )
    writeFileSync(
    resolve(phase2Dirs.base, 'phase-2-runtime-summary.json'),
    `${JSON.stringify(
      {
        timestamp: nowIso(),
        status: phase2Pass ? 'pass' : 'fail',
        checks: {
          startupConsistency: phase2Pass,
          authRouteCompile: phase2Runs.every((r) => (r.authSession as number) < 500),
          wsReadyAtStartup: phase2Runs.every((r) => r.wsOpen === true),
        },
      },
      null,
      2
    )}\n`,
    'utf-8'
  )
    writeFileSync(
    resolve(phase2Dirs.base, 'known-risks.json'),
    `${JSON.stringify(
      {
        timestamp: nowIso(),
        residualRisks: phase2Pass ? [] : ['Startup or auth-session route instability detected.'],
      },
      null,
      2
    )}\n`,
    'utf-8'
  )

    // Start server again for phases 3-5
    server = await startDevServer(await getFreePort(port), runLog)

    // Phase 3: settings implementation/wiring
    const phase3Dirs = ensurePhaseDirs('phase-3-settings')
    await stopDevServer(server.child)
    server = null
    const settingsBefore = await getSettings()
    const settingsUpdate: Settings = {
    ...settingsBefore,
    freeOnlyMode: false,
    providerFailoverPolicy: {
      enabled: true,
      cooldownMs: 30_000,
      maxSwitchesPerRun: 6,
    },
    testingMode: 'manual',
    onboardingState: {
      completed: true,
      entryMode: 'free',
      setupLevel: 'basic',
      completedAt: Date.now(),
    },
    subscriptionTier: settingsBefore.subscriptionTier ?? 'free',
    credits: settingsBefore.credits ?? { balance: 50, weeklyCap: 100, autoStop: true },
  }
    await saveSettings(settingsUpdate)
    const settingsAfter = await getSettings()
    server = await startDevServer(await getFreePort(port), runLog)
    const healthAfterSettings = await fetchJson(server.baseUrl, '/api/health')
    const phase3Results: PhaseResult[] = [
    {
      name: 'settings-persisted',
      pass:
        settingsAfter.providerFailoverPolicy?.enabled === true &&
        settingsAfter.testingMode === 'manual' &&
        settingsAfter.onboardingState?.completed === true,
    },
    {
      name: 'settings-consumed-health',
      pass:
        healthAfterSettings.ok &&
        Boolean(
          (healthAfterSettings.json as { details?: { freeOnlyMode?: boolean } })?.details
        ),
    },
  ]
    const phase3Pass = phase3Results.every((r) => r.pass)
    writeFileSync(
    resolve(phase3Dirs.base, 'phase-3-settings-pass-fail-matrix.json'),
    `${JSON.stringify({ timestamp: nowIso(), results: phase3Results }, null, 2)}\n`,
    'utf-8'
  )
    writeFileSync(
    resolve(phase3Dirs.base, 'phase-3-settings-summary.json'),
    `${JSON.stringify({ timestamp: nowIso(), status: phase3Pass ? 'pass' : 'fail', checks: phase3Results }, null, 2)}\n`,
    'utf-8'
  )
    writeFileSync(resolve(phase3Dirs.logsDir, 'phase-3-settings.log'), `${JSON.stringify(settingsAfter, null, 2)}\n`, 'utf-8')
    writeFileSync(
    resolve(phase3Dirs.base, 'known-risks.json'),
    `${JSON.stringify({ timestamp: nowIso(), residualRisks: phase3Pass ? [] : ['Settings wiring mismatch detected.'] }, null, 2)}\n`,
    'utf-8'
  )

    // Phase 4: free models + tiers
    const phase4Dirs = ensurePhaseDirs('phase-4-tiers')
    await stopDevServer(server.child)
    server = null
    const settingsPhase4 = await getSettings()
    await saveSettings({
      ...settingsPhase4,
      freeOnlyMode: true,
      subscriptionTier: 'free',
    credits: {
      balance: Math.max(0, settingsPhase4.credits?.balance ?? 20),
      weeklyCap: Math.max(0, settingsPhase4.credits?.weeklyCap ?? 40),
        autoStop: true,
      },
    })
    server = await startDevServer(await getFreePort(port), runLog)
    const healthFreeOnly = await fetchJson(server.baseUrl, '/api/health')
    const dashboardFreeOnly = await fetchJson(server.baseUrl, '/api/metrics/dashboard?scenario=free-only')
    const freeOnlyRun = await runWsMode(
    server.wsUrl,
    'swarm',
    'Run in free-only mode and return a brief status summary.'
  )
    const phase4Results: PhaseResult[] = [
    {
      name: 'health-free-only-flag',
      pass:
        ((healthFreeOnly.json as { details?: { freeOnlyMode?: boolean } })?.details?.freeOnlyMode ??
          false) === true,
    },
    {
      name: 'dashboard-subscription-visible',
      pass: Boolean((dashboardFreeOnly.json as { subscription?: unknown })?.subscription),
    },
    {
      name: 'free-only-run-lifecycle',
      pass: freeOnlyRun.pass,
      details: freeOnlyRun,
    },
  ]
    const phase4Pass = phase4Results.every((r) => r.pass)
    writeFileSync(
    resolve(phase4Dirs.base, 'phase-4-tiers-pass-fail-matrix.json'),
    `${JSON.stringify({ timestamp: nowIso(), results: phase4Results }, null, 2)}\n`,
    'utf-8'
  )
    writeFileSync(
    resolve(phase4Dirs.base, 'phase-4-tiers-summary.json'),
    `${JSON.stringify({ timestamp: nowIso(), status: phase4Pass ? 'pass' : 'fail', checks: phase4Results }, null, 2)}\n`,
    'utf-8'
  )
    writeFileSync(resolve(phase4Dirs.logsDir, 'phase-4-tiers.log'), `${JSON.stringify({ healthFreeOnly, dashboardFreeOnly }, null, 2)}\n`, 'utf-8')
    writeFileSync(
    resolve(phase4Dirs.base, 'known-risks.json'),
    `${JSON.stringify({ timestamp: nowIso(), residualRisks: phase4Pass ? [] : ['Free-mode/tier enforcement did not fully validate.'] }, null, 2)}\n`,
    'utf-8'
  )

    // Phase 5: output quality and guardrails
    const phase5Dirs = ensurePhaseDirs('phase-5-guardrails')
    const noisySample = "Warning: 'p' is not in the list of known options, but still passed to Electron/Chromium."
    const sanitized = sanitizeOutputText(noisySample)
    const qualityPass = isOutputQualityAcceptable(noisySample)
    const evidenceDecision = evaluateEvidenceSufficiency({
    confidence: 20,
    sourceCount: 0,
    evidence: {
      id: 'ev-v7',
      timestamp: Date.now(),
      traceId: 'trace-v7',
      logRefs: [],
      diffRefs: [],
      testIds: [],
      artifactRefs: [],
    },
  })
    const guardrailRun = await runWsMode(
    server.wsUrl,
    'chat',
    'Return only one clear sentence; avoid terminal noise.'
  )
    const guardrailResultPayload =
      (guardrailRun.finalPayload as { result?: { finalOutput?: string } } | null)?.result
    const guardrailText = guardrailResultPayload?.finalOutput ?? ''
    const phase5Results: PhaseResult[] = [
    {
      name: 'sanitize-noisy-output',
      pass: sanitized.length > 0 && qualityPass === false,
      details: { sanitized, qualityPass },
    },
    {
      name: 'insufficient-evidence-refusal',
      pass: evidenceDecision.refuse === true,
      details: {
        refuse: evidenceDecision.refuse,
        reason: evidenceDecision.reason,
        references: evidenceDecision.references,
      },
    },
    {
      name: 'final-output-cleanliness',
      pass: guardrailRun.pass && sanitizeOutputText(guardrailText).length > 0,
      details: {
        runAccepted: guardrailRun.runAccepted,
        finalType: guardrailRun.finalType,
      },
    },
  ]
    const phase5Pass = phase5Results.every((r) => r.pass)
    writeFileSync(
    resolve(phase5Dirs.base, 'phase-5-guardrails-pass-fail-matrix.json'),
    `${JSON.stringify({ timestamp: nowIso(), results: phase5Results }, null, 2)}\n`,
    'utf-8'
  )
    writeFileSync(
    resolve(phase5Dirs.base, 'phase-5-guardrails-summary.json'),
    `${JSON.stringify(
      {
        timestamp: nowIso(),
        status: phase5Pass ? 'pass' : 'fail',
        checks: phase5Results,
      },
      null,
      2
    )}\n`,
    'utf-8'
  )
    writeFileSync(resolve(phase5Dirs.logsDir, 'phase-5-guardrails.log'), `${JSON.stringify({ guardrailRun }, null, 2)}\n`, 'utf-8')
    writeFileSync(
    resolve(phase5Dirs.base, 'known-risks.json'),
    `${JSON.stringify({ timestamp: nowIso(), residualRisks: phase5Pass ? [] : ['Guardrail scenario checks did not fully pass.'] }, null, 2)}\n`,
    'utf-8'
  )

    await stopDevServer(server.child)
    server = null

    const finalSummary = {
      timestamp: nowIso(),
      phases: {
        phase1: phase1Pass,
        phase2: phase2Pass,
        phase3: phase3Pass,
        phase4: phase4Pass,
        phase5: phase5Pass,
      },
      overallPass: phase1Pass && phase2Pass && phase3Pass && phase4Pass && phase5Pass,
    }
    writeFileSync(resolve(process.cwd(), 'artifacts', 'v7-execution-summary.json'), `${JSON.stringify(finalSummary, null, 2)}\n`, 'utf-8')

    if (!finalSummary.overallPass) process.exit(1)
  } finally {
    if (server) {
      await stopDevServer(server.child)
    }
    if (seededProjectId) {
      await deleteProject(seededProjectId)
    }
    await saveSettings(originalSettings)
  }
}

void execute().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  const outPath = resolve(process.cwd(), 'artifacts', 'v7-execution-fatal.json')
  mkdirSync(resolve(process.cwd(), 'artifacts'), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify({ timestamp: nowIso(), error: message }, null, 2)}\n`, 'utf-8')
  process.exit(1)
})
