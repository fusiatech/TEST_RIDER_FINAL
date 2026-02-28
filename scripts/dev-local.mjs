import { spawn } from 'node:child_process'
import { accessSync, constants, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || '4100'
const origin = `http://${host}:${port}`
const tempDir = process.env.SWARM_TMP_DIR || resolve(process.cwd(), '.tmp', 'swarm-ui-dev')
// Next.js treats distDir as project-relative; keep relative by default.
const distDir = process.env.NEXT_DIST_DIR || '.tmp/.next-dev'
const distDirPath = resolve(process.cwd(), distDir)
const localDevSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  'swarm-ui-local-dev-secret-not-for-production'

function ensureWritableDir(dirPath) {
  mkdirSync(dirPath, { recursive: true })
  accessSync(dirPath, constants.R_OK | constants.W_OK)
}

function failFast(message, error) {
  const details = error instanceof Error ? ` (${error.message})` : ''
  console.error(`[dev-local] ${message}${details}`)
  process.exit(1)
}

try {
  ensureWritableDir(tempDir)
  ensureWritableDir(distDirPath)
} catch (error) {
  failFast('Preflight failed: temp/dist directory is not writable', error)
}

const shouldCleanDist =
  process.env.SWARM_CLEAN_DIST === '1' || process.argv.includes('--clean')

if (shouldCleanDist) {
  try {
    rmSync(distDirPath, { recursive: true, force: true })
    ensureWritableDir(distDirPath)
    console.log(`[dev-local] Cleared NEXT_DIST_DIR at ${distDirPath}`)
  } catch (error) {
    failFast(`Failed to clean NEXT_DIST_DIR at ${distDirPath}`, error)
  }
}

const env = {
  ...process.env,
  HOST: host,
  PORT: port,
  TEMP: tempDir,
  TMP: tempDir,
  NEXT_DIST_DIR: distDir,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || origin,
  AUTH_SECRET: localDevSecret,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || localDevSecret,
  ...(process.env.NEXT_PUBLIC_WS_URL ? { NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL } : {}),
  NEXT_PUBLIC_PREVIEW_URL: process.env.NEXT_PUBLIC_PREVIEW_URL || origin,
  // Keep websocket auth enabled in local by default. Explicitly disable only when
  // SWARM_WS_AUTH_MODE=off is set for debugging.
  WS_AUTH_ENABLED: process.env.SWARM_WS_AUTH_MODE === 'off' ? 'false' : 'true',
  SWARM_DEV_PROFILE_FALLBACK: process.env.SWARM_DEV_PROFILE_FALLBACK === 'false' ? 'false' : 'true',
  SWARM_ALLOW_DEV_WS_FALLBACK:
    process.env.SWARM_ALLOW_DEV_WS_FALLBACK ||
    (process.env.SWARM_DEV_PROFILE_FALLBACK === 'false' ? 'false' : 'true'),
  SWARM_CLI_DETECT_SKIP_VERSION: process.env.SWARM_CLI_DETECT_SKIP_VERSION || '1',
  SWARM_ENABLE_SYSTEM_CLIS: process.env.SWARM_ENABLE_SYSTEM_CLIS || '0',
}

console.log(
  `[dev-local] Starting SwarmUI at ${origin} (tmp=${tempDir}, dist=${distDirPath})`
)

const child = spawn(
  process.execPath,
  ['-r', './scripts/als-polyfill.cjs', './node_modules/tsx/dist/cli.mjs', 'server.ts'],
  {
    stdio: 'inherit',
    env,
    shell: false,
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
