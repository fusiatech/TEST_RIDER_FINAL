import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { WebSocket } from 'ws'

type ProviderId = 'cursor' | 'codex' | 'gemini' | 'claude'
type Mode = 'chat' | 'swarm' | 'project'

type RunResult = {
  provider: ProviderId
  mode: Mode
  runAccepted: boolean
  finalType: string | null
  providerUsed: string | null
  outputPreview: string
  pass: boolean
  reason: string
  attempts: string[]
  failovers: string[]
}

type ProviderAuthCheck = {
  provider: 'openai' | 'gemini' | 'claude'
  configured: boolean
  ok: boolean
  status?: number
  reason: string
}

function getArg(name: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : undefined
}

function getPrompts(provider: ProviderId): Record<Mode, string> {
  return {
    chat: `Verification run for ${provider}. Reply exactly one sentence containing: CHAT_OK_${provider.toUpperCase()}.`,
    swarm: `Verification run for ${provider}. Provide a 3-step orchestration summary and include the exact words QUEUE and JOB.`,
    project:
      `Verification run for ${provider}. Output markdown sections titled exactly: Phases, Tasks, Dependencies, Acceptance, Tickets.`,
  }
}

function hasProviderError(output: string): boolean {
  return /\[api-runner\]\s*error:/i.test(output) || output.includes('No usable provider output was generated')
}

function modeSpecificPass(mode: Mode, output: string): boolean {
  const lower = output.toLowerCase()
  if (mode === 'chat') {
    return lower.includes('chat_ok_')
  }
  if (mode === 'swarm') {
    return lower.includes('queue') && lower.includes('job')
  }
  const required = ['phases', 'tasks', 'dependencies', 'acceptance', 'tickets']
  return required.every((k) => lower.includes(k))
}

async function waitForServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health/live`, {
        signal: AbortSignal.timeout(4_000),
      })
      if (response.status === 200) {
        return
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for server at ${baseUrl}`)
}

async function runWsCase(baseWsUrl: string, provider: ProviderId, mode: Mode): Promise<RunResult> {
  const prompts = getPrompts(provider)
  const runId = `${provider}-${mode}-${Date.now()}`
  const payload = {
    type: 'start-swarm',
    mode,
    intent: mode === 'project' ? 'plan' : 'explain',
    prompt: prompts[mode],
    sessionId: `verify-${runId}`,
    idempotencyKey: `verify-${runId}`,
    agentSelectionMode: 'manual',
    preferredAgent: provider,
    traceModeValidation: true,
  }

  const ws = new WebSocket(baseWsUrl)
  const lines: string[] = []
  let runAccepted = false
  let finalType: string | null = null
  let output = ''
  let providerUsed: string | null = null
  let reason = 'ok'

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
      reject(new Error(`timeout waiting for ${provider}/${mode}`))
    }, 70_000)

    ws.on('open', () => {
      ws.send(JSON.stringify(payload))
    })

    ws.on('message', (raw) => {
      const text = String(raw)
      lines.push(text)
      if (text.includes('"type":"run.accepted"')) {
        runAccepted = true
        return
      }
      if (text.includes('"type":"swarm-result"')) {
        finalType = 'swarm-result'
        try {
          const msg = JSON.parse(text) as {
            result?: { finalOutput?: string; agents?: Array<{ provider?: string }> }
          }
          output = msg.result?.finalOutput ?? ''
          providerUsed = msg.result?.agents?.[0]?.provider ?? null
        } catch {
          // keep defaults
        }
        clearTimeout(timeout)
        ws.close()
        resolve()
      } else if (text.includes('"type":"swarm-error"')) {
        finalType = 'swarm-error'
        try {
          const msg = JSON.parse(text) as { error?: string }
          output = msg.error ?? text
        } catch {
          output = text
        }
        clearTimeout(timeout)
        ws.close()
        resolve()
      }
    })

    ws.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })

  const attempts = lines
    .filter((entry) => entry.includes('"type":"agent-output"'))
    .map((entry) => {
      try {
        return (JSON.parse(entry) as { data?: string }).data ?? ''
      } catch {
        return ''
      }
    })
    .filter((entry) => entry.includes('API attempt'))
  const failovers = lines
    .filter((entry) => entry.includes('"type":"agent-output"'))
    .map((entry) => {
      try {
        return (JSON.parse(entry) as { data?: string }).data ?? ''
      } catch {
        return ''
      }
    })
    .filter((entry) => entry.includes('Failover'))

  let pass = false
  if (!runAccepted) {
    reason = 'run.accepted not received'
  } else if (finalType !== 'swarm-result') {
    reason = `final event was ${finalType ?? 'none'}`
  } else if (hasProviderError(output)) {
    reason = 'provider returned explicit runtime error'
  } else if (!modeSpecificPass(mode, output)) {
    reason = 'output did not satisfy mode validation checks'
  } else {
    pass = true
  }

  return {
    provider,
    mode,
    runAccepted,
    finalType,
    providerUsed,
    outputPreview: output.slice(0, 500),
    pass,
    reason,
    attempts,
    failovers,
  }
}

async function testOpenAI(apiKey: string): Promise<ProviderAuthCheck> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (response.ok) {
      return { provider: 'openai', configured: true, ok: true, status: response.status, reason: 'ok' }
    }
    const body = await response.text()
    return { provider: 'openai', configured: true, ok: false, status: response.status, reason: body.slice(0, 220) }
  } catch (error) {
    return { provider: 'openai', configured: true, ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function testGemini(apiKey: string): Promise<ProviderAuthCheck> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20_000) })
    if (response.ok) {
      return { provider: 'gemini', configured: true, ok: true, status: response.status, reason: 'ok' }
    }
    const body = await response.text()
    return { provider: 'gemini', configured: true, ok: false, status: response.status, reason: body.slice(0, 220) }
  } catch (error) {
    return { provider: 'gemini', configured: true, ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function testClaude(apiKey: string): Promise<ProviderAuthCheck> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (response.ok) {
      return { provider: 'claude', configured: true, ok: true, status: response.status, reason: 'ok' }
    }
    const body = await response.text()
    return { provider: 'claude', configured: true, ok: false, status: response.status, reason: body.slice(0, 220) }
  } catch (error) {
    return { provider: 'claude', configured: true, ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function main() {
  const host = process.env.HOST || 'localhost'
  const port = process.env.PORT || '4100'
  const baseUrl = `http://${host}:${port}`
  const wsUrl = `ws://${host}:${port}/api/ws`
  const email = (getArg('email') || process.env.SWARM_DIAG_EMAIL || '').trim().toLowerCase()
  if (!email) {
    throw new Error('Missing email. Use --email=<user@example.com> or SWARM_DIAG_EMAIL.')
  }

  await waitForServer(baseUrl)

  const storageModule = await import('@/server/storage')
  const storage = (storageModule as unknown as { default?: any })?.default ?? (storageModule as any)
  const users = await storage.getUsers()
  const user = users.find((entry: { email: string }) => entry.email.toLowerCase() === email)
  if (!user) {
    throw new Error(`User not found for email: ${email}`)
  }
  const keys = (await storage.getUserApiKeys(user.id)) ?? {}

  const keyPresence = {
    openai: Boolean((keys.openai || keys.codex || '').trim()),
    gemini: Boolean((keys.gemini || keys.google || '').trim()),
    claude: Boolean((keys.claude || keys.anthropic || '').trim()),
    cursor: Boolean((keys.cursor || '').trim()),
    copilot: Boolean((keys.copilot || keys.github || '').trim()),
  }

  const authChecks: ProviderAuthCheck[] = [
    keyPresence.openai
      ? await testOpenAI((keys.openai || keys.codex || '').trim())
      : { provider: 'openai', configured: false, ok: false, reason: 'missing key' },
    keyPresence.gemini
      ? await testGemini((keys.gemini || keys.google || '').trim())
      : { provider: 'gemini', configured: false, ok: false, reason: 'missing key' },
    keyPresence.claude
      ? await testClaude((keys.claude || keys.anthropic || '').trim())
      : { provider: 'claude', configured: false, ok: false, reason: 'missing key' },
  ]

  const providersToTest: ProviderId[] = []
  if (keyPresence.openai) {
    providersToTest.push('cursor', 'codex')
  }
  if (keyPresence.gemini) {
    providersToTest.push('gemini')
  }
  if (keyPresence.claude) {
    providersToTest.push('claude')
  }

  const dedupProviders = [...new Set(providersToTest)]
  const modeOrder: Mode[] = ['chat', 'swarm', 'project']
  const runResults: RunResult[] = []
  for (const provider of dedupProviders) {
    for (const mode of modeOrder) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runWsCase(wsUrl, provider, mode)
      runResults.push(result)
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    app: baseUrl,
    user: { id: user.id, email: user.email },
    keyPresence,
    authChecks,
    providersTested: dedupProviders,
    totals: {
      runs: runResults.length,
      passed: runResults.filter((entry) => entry.pass).length,
      failed: runResults.filter((entry) => !entry.pass).length,
    },
  }

  const outDir = path.resolve(process.cwd(), 'artifacts', 'phase-fast')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'provider-mode-runtime-matrix.json')
  writeFileSync(
    outPath,
    `${JSON.stringify({ summary, runResults }, null, 2)}\n`,
    'utf-8',
  )

  console.log(JSON.stringify({ outPath, summary }, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

