import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const hostPlatform = process.platform
const isWindows = hostPlatform === 'win32'
const resolver = isWindows ? 'where.exe' : 'which'
const resolverArgsFlag = isWindows ? ['/Q'] : []

const providers = [
  { id: 'cursor', command: 'cursor' },
  { id: 'gemini', command: 'gemini' },
  { id: 'claude', command: 'claude' },
  { id: 'copilot', command: 'copilot' },
  { id: 'codex', command: 'codex' },
  { id: 'rovo', command: 'rovo' },
]

const outDir = resolve(process.cwd(), 'artifacts', 'phase-0')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'agent-install-matrix.json')

function resolveCommandPath(command) {
  if (isWindows) {
    const check = spawnSync(resolver, [...resolverArgsFlag, command], { stdio: 'ignore', windowsHide: true })
    if (check.status !== 0) return null
    const out = spawnSync('where.exe', [command], { encoding: 'utf-8', windowsHide: true })
    if (out.status !== 0) return null
    const first = String(out.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    return first || null
  }

  const out = spawnSync(resolver, [command], { encoding: 'utf-8' })
  if (out.status !== 0) return null
  const first = String(out.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return first || null
}

const matrix = providers.map((provider) => {
  const path = resolveCommandPath(provider.command)
  return {
    provider: provider.id,
    command: provider.command,
    installed: Boolean(path),
    executablePath: path,
    realAgent: true,
  }
})

const summary = {
  timestamp: new Date().toISOString(),
  platform: hostPlatform,
  installedCount: matrix.filter((m) => m.installed).length,
  total: matrix.length,
  matrix,
}

writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')
console.log(JSON.stringify(summary, null, 2))
