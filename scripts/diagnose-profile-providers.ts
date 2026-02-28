import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

type ProviderDiag = {
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

async function testOpenAI(apiKey: string): Promise<ProviderDiag> {
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
    return { provider: 'openai', configured: true, ok: false, status: response.status, reason: body.slice(0, 240) }
  } catch (error) {
    return { provider: 'openai', configured: true, ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function testGemini(apiKey: string): Promise<ProviderDiag> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20_000) })
    if (response.ok) {
      return { provider: 'gemini', configured: true, ok: true, status: response.status, reason: 'ok' }
    }
    const body = await response.text()
    return { provider: 'gemini', configured: true, ok: false, status: response.status, reason: body.slice(0, 240) }
  } catch (error) {
    return { provider: 'gemini', configured: true, ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function testClaude(apiKey: string): Promise<ProviderDiag> {
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
    return { provider: 'claude', configured: true, ok: false, status: response.status, reason: body.slice(0, 240) }
  } catch (error) {
    return { provider: 'claude', configured: true, ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function main() {
  const storageModule = await import('@/server/storage')
  const storage = (storageModule as unknown as { default?: any })?.default ?? (storageModule as any)

  const email = (getArg('email') || process.env.SWARM_DIAG_EMAIL || '').trim().toLowerCase()
  if (!email) {
    throw new Error('Missing email. Use --email=<user@example.com> or SWARM_DIAG_EMAIL.')
  }

  const users = await storage.getUsers()
  const user = users.find((entry: { email: string }) => entry.email.toLowerCase() === email)
  if (!user) {
    throw new Error(`User not found for email: ${email}`)
  }

  const keys = await storage.getUserApiKeys(user.id)
  const openaiKey = (keys?.openai || keys?.codex || '').trim()
  const geminiKey = (keys?.gemini || keys?.google || '').trim()
  const claudeKey = (keys?.claude || keys?.anthropic || '').trim()

  const diagnostics: ProviderDiag[] = []
  diagnostics.push(openaiKey ? await testOpenAI(openaiKey) : { provider: 'openai', configured: false, ok: false, reason: 'missing key' })
  diagnostics.push(geminiKey ? await testGemini(geminiKey) : { provider: 'gemini', configured: false, ok: false, reason: 'missing key' })
  diagnostics.push(claudeKey ? await testClaude(claudeKey) : { provider: 'claude', configured: false, ok: false, reason: 'missing key' })

  const artifactDir = path.resolve(process.cwd(), 'artifacts', 'phase-fast')
  mkdirSync(artifactDir, { recursive: true })
  const outPath = path.join(artifactDir, 'provider-auth-diagnostics.json')
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        diagnostics,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  )

  console.log(JSON.stringify({ outPath, diagnostics }, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
