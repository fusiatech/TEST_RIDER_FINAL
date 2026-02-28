import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

async function main() {
  const dbPath = resolve(process.cwd(), 'db.json')
  const db = JSON.parse(readFileSync(dbPath, 'utf-8'))
  const settings = db.settings ?? {}
  const users = Array.isArray(db.users) ? db.users : []
  const userApiKeys = db.userApiKeys ?? {}

  const executionRuntime = settings.executionRuntime ?? 'server_managed'
  const targets = ['gemini', 'codex', 'claude', 'cursor', 'copilot']

  const matrix = []
  for (const user of users) {
    // eslint-disable-next-line no-await-in-loop
    const keys = userApiKeys[user.id] ?? {}
    const byProvider = targets.map((provider) => {
      const configured = (() => {
        if (provider === 'gemini') return Boolean(keys.gemini || keys.google)
        if (provider === 'codex' || provider === 'cursor') return Boolean(keys.codex || keys.openai)
        if (provider === 'claude') return Boolean(keys.claude || keys.anthropic)
        if (provider === 'copilot') return Boolean(keys.copilot || keys.github)
        return false
      })()
      const runtimeAvailable =
        executionRuntime === 'server_managed'
          ? ['gemini', 'codex', 'claude', 'cursor'].includes(provider)
          : true
      return {
        provider,
        configured,
        runtimeAvailable,
        ready: configured && runtimeAvailable,
      }
    })
    matrix.push({
      userId: user.id,
      email: user.email,
      providers: byProvider,
    })
  }

  const summary = {
    timestamp: new Date().toISOString(),
    executionRuntime,
    defaultOrder: settings.providerPriority ?? settings.enabledCLIs,
    matrix,
  }

  const outDir = resolve(process.cwd(), 'artifacts', 'phase-fast')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'provider-matrix.json')
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
  console.log(`Wrote ${outPath}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
