import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

function detectEmailFromDb() {
  try {
    const dbPath = resolve(process.cwd(), 'db.json')
    const db = JSON.parse(readFileSync(dbPath, 'utf-8'))
    const users = Array.isArray(db?.users) ? db.users : []
    const keyMap = db?.userApiKeys && typeof db.userApiKeys === 'object' ? db.userApiKeys : {}

    const usersWithKeys = users
      .filter((user) => typeof user?.id === 'string' && typeof user?.email === 'string')
      .filter((user) => {
        const keys = keyMap[user.id]
        return keys && Object.values(keys).some((value) => Boolean(value))
      })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

    return usersWithKeys[0]?.email || users[0]?.email || null
  } catch {
    return null
  }
}

function main() {
  const outDir = resolve(process.cwd(), 'artifacts', 'phase-agent-runtime')
  mkdirSync(outDir, { recursive: true })

  const email = process.env.SWARM_DIAG_EMAIL || detectEmailFromDb()
  if (!email) {
    throw new Error('Unable to detect a user email for provider diagnostics. Set SWARM_DIAG_EMAIL.')
  }

  try {
    execSync(`npx tsx ./scripts/diagnose-profile-providers.ts --email="${email}"`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
  } catch {
    throw new Error('verify:provider-auth failed')
  }

  const source = resolve(process.cwd(), 'artifacts', 'phase-fast', 'provider-auth-diagnostics.json')
  const target = resolve(outDir, 'provider-auth-diagnostics.json')
  if (existsSync(source)) {
    copyFileSync(source, target)
  }

  const summary = {
    timestamp: new Date().toISOString(),
    email,
    source: existsSync(source) ? source : null,
    output: target,
    ok: existsSync(target),
  }
  writeFileSync(resolve(outDir, 'provider-auth-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
  console.log(JSON.stringify(summary, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
