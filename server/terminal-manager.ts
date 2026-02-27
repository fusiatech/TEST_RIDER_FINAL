import * as pty from 'node-pty'
import { randomUUID } from 'node:crypto'
import { createLogger } from '@/server/logger'

const terminalLogger = createLogger('terminal-api')

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const MAX_SCROLLBACK_CHARS = 200_000
const SESSION_TTL_MS = 30 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 1000

const WORKSPACE_ROOT = process.env.PROJECT_PATH ?? process.cwd()

const SHELL = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL ?? '/bin/bash'
const SHELL_ARGS = process.platform === 'win32' ? [] : ['--noprofile', '--norc']

interface TerminalSession {
  id: string
  pty: pty.IPty
  cols: number
  rows: number
  cwd: string
  createdAt: number
  lastActivityAt: number
  terminated: boolean
  exitCode: number | null
  scrollback: string
}

export interface TerminalSessionSummary {
  id: string
  cols: number
  rows: number
  cwd: string
  createdAt: number
  lastActivityAt: number
  terminated: boolean
  exitCode: number | null
  scrollbackSize: number
}

export interface TerminalSessionSnapshot extends TerminalSessionSummary {
  scrollback: string
}

const sessions = new Map<string, TerminalSession>()

function truncateScrollback(data: string): string {
  if (data.length <= MAX_SCROLLBACK_CHARS) return data
  return data.slice(-MAX_SCROLLBACK_CHARS)
}

function isCommandAllowed(input: string): boolean {
  const clean = input.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\r\n]+/g, ' ').trim()
  if (!clean) return true

  const lowered = clean.toLowerCase()
  const blockedPatterns = [
    /\brm\s+-rf\s+\//,
    /\bsudo\b/,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /\bchmod\s+777\s+\//,
  ]

  if (blockedPatterns.some((pattern) => pattern.test(lowered))) {
    return false
  }

  if (lowered.includes('..') && lowered.includes('cd')) return false
  if (/(^|\s)cd\s+\//.test(lowered) && !lowered.includes(WORKSPACE_ROOT.toLowerCase())) {
    return false
  }

  return true
}

function toSummary(session: TerminalSession): TerminalSessionSummary {
  return {
    id: session.id,
    cols: session.cols,
    rows: session.rows,
    cwd: session.cwd,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    terminated: session.terminated,
    exitCode: session.exitCode,
    scrollbackSize: session.scrollback.length,
  }
}

function terminateSessionInternal(session: TerminalSession, reason: 'api' | 'ttl'): void {
  if (session.terminated) return

  session.terminated = true
  try {
    session.pty.kill()
  } catch {
    // no-op
  }
  terminalLogger.info('Terminal session stopped', {
    sessionId: session.id,
    reason,
    exitCode: session.exitCode,
  })
}

setInterval(() => {
  const now = Date.now()
  for (const session of sessions.values()) {
    if (!session.terminated && now - session.lastActivityAt > SESSION_TTL_MS) {
      terminateSessionInternal(session, 'ttl')
    }
  }
}, CLEANUP_INTERVAL_MS).unref()

export function createTerminalSession(cols = DEFAULT_COLS, rows = DEFAULT_ROWS): TerminalSessionSummary {
  const id = randomUUID()
  const now = Date.now()
  const proc = pty.spawn(SHELL, SHELL_ARGS, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      PROJECT_PATH: WORKSPACE_ROOT,
    },
  })

  const session: TerminalSession = {
    id,
    pty: proc,
    cols,
    rows,
    cwd: WORKSPACE_ROOT,
    createdAt: now,
    lastActivityAt: now,
    terminated: false,
    exitCode: null,
    scrollback: '',
  }

  proc.onData((chunk) => {
    session.lastActivityAt = Date.now()
    session.scrollback = truncateScrollback(session.scrollback + chunk)
  })

  proc.onExit(({ exitCode }) => {
    session.exitCode = exitCode
    session.terminated = true
  })

  sessions.set(id, session)
  terminalLogger.info('Terminal session started', { sessionId: id, cols, rows, cwd: WORKSPACE_ROOT })

  return toSummary(session)
}

export function listTerminalSessions(): TerminalSessionSummary[] {
  return Array.from(sessions.values())
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .map(toSummary)
}

export function getTerminalSession(id: string): TerminalSessionSnapshot | null {
  const session = sessions.get(id)
  if (!session) return null

  return {
    ...toSummary(session),
    scrollback: session.scrollback,
  }
}

export function writeTerminalSession(id: string, input: string): { ok: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) return { ok: false, error: 'Session not found' }
  if (session.terminated) return { ok: false, error: 'Session already terminated' }

  if (!isCommandAllowed(input)) {
    session.scrollback = truncateScrollback(
      session.scrollback + '\r\n\x1b[31m[blocked] Command rejected by workspace policy.\x1b[0m\r\n'
    )
    return { ok: false, error: 'Command blocked by workspace policy' }
  }

  session.lastActivityAt = Date.now()
  session.pty.write(input)
  return { ok: true }
}

export function resizeTerminalSession(id: string, cols: number, rows: number): { ok: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) return { ok: false, error: 'Session not found' }
  if (session.terminated) return { ok: false, error: 'Session already terminated' }

  const safeCols = Math.max(20, Math.floor(cols))
  const safeRows = Math.max(5, Math.floor(rows))
  session.cols = safeCols
  session.rows = safeRows
  session.lastActivityAt = Date.now()
  session.pty.resize(safeCols, safeRows)
  return { ok: true }
}

export function terminateTerminalSession(id: string): { ok: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) return { ok: false, error: 'Session not found' }
  terminateSessionInternal(session, 'api')
  return { ok: true }
}

export function __resetTerminalSessionsForTests(): void {
  for (const session of sessions.values()) {
    terminateSessionInternal(session, 'api')
  }
  sessions.clear()
}
