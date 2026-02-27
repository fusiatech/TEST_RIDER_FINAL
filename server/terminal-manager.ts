import * as pty from 'node-pty'
import { randomUUID } from 'node:crypto'
import { createLogger } from '@/server/logger'
import {
  getTerminalSessions as getPersistedSessions,
  saveTerminalSession as persistSession,
  updateTerminalSession as updatePersistedSession,
  deleteTerminalSession as deletePersistedSession,
  clearTerminatedTerminalSessions,
} from '@/server/storage'
import type { PersistedTerminalSession } from '@/lib/types'

const terminalLogger = createLogger('terminal-api')

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32
const MAX_SCROLLBACK_CHARS = 200_000
const SESSION_TTL_MS = 30 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 1000
const PERSIST_INTERVAL_MS = 5_000

const WORKSPACE_ROOT = process.env.PROJECT_PATH ?? process.cwd()

const SHELL = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL ?? '/bin/bash'
const SHELL_ARGS = process.platform === 'win32' ? [] : ['--noprofile', '--norc']

interface TerminalSession {
  id: string
  name: string
  pty: pty.IPty | null
  cols: number
  rows: number
  cwd: string
  createdAt: number
  lastActivityAt: number
  terminated: boolean
  exitCode: number | null
  scrollback: string
  persistDirty: boolean
}

export interface TerminalSessionSummary {
  id: string
  name: string
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
let persistenceInitialized = false

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
    name: session.name,
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

function toPersistedSession(session: TerminalSession): PersistedTerminalSession {
  return {
    id: session.id,
    name: session.name,
    cwd: session.cwd,
    cols: session.cols,
    rows: session.rows,
    scrollback: session.scrollback,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    terminated: session.terminated,
    exitCode: session.exitCode,
  }
}

function terminateSessionInternal(session: TerminalSession, reason: 'api' | 'ttl'): void {
  if (session.terminated) return

  session.terminated = true
  session.persistDirty = true
  try {
    session.pty?.kill()
  } catch {
    // no-op
  }
  terminalLogger.info('Terminal session stopped', {
    sessionId: session.id,
    reason,
    exitCode: session.exitCode,
  })
}

async function persistDirtySessions(): Promise<void> {
  for (const session of sessions.values()) {
    if (session.persistDirty) {
      try {
        await persistSession(toPersistedSession(session))
        session.persistDirty = false
      } catch (err) {
        terminalLogger.error('Failed to persist terminal session', {
          sessionId: session.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
}

setInterval(() => {
  const now = Date.now()
  for (const session of sessions.values()) {
    if (!session.terminated && now - session.lastActivityAt > SESSION_TTL_MS) {
      terminateSessionInternal(session, 'ttl')
    }
  }
}, CLEANUP_INTERVAL_MS).unref()

setInterval(() => {
  void persistDirtySessions()
}, PERSIST_INTERVAL_MS).unref()

setInterval(() => {
  void clearTerminatedTerminalSessions()
}, 60 * 60 * 1000).unref()

export async function initializeTerminalPersistence(): Promise<void> {
  if (persistenceInitialized) return
  persistenceInitialized = true

  try {
    const persisted = await getPersistedSessions()
    for (const p of persisted) {
      if (!sessions.has(p.id)) {
        const session: TerminalSession = {
          id: p.id,
          name: p.name,
          pty: null,
          cols: p.cols,
          rows: p.rows,
          cwd: p.cwd,
          createdAt: p.createdAt,
          lastActivityAt: p.lastActivityAt,
          terminated: p.terminated,
          exitCode: p.exitCode,
          scrollback: p.scrollback,
          persistDirty: false,
        }
        sessions.set(p.id, session)
      }
    }
    terminalLogger.info('Restored terminal sessions from storage', { count: persisted.length })
  } catch (err) {
    terminalLogger.error('Failed to restore terminal sessions', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function generateTerminalName(): string {
  const existingNames = Array.from(sessions.values()).map((s) => s.name)
  let index = 1
  while (existingNames.includes(`Terminal ${index}`)) {
    index++
  }
  return `Terminal ${index}`
}

export function createTerminalSession(
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS,
  name?: string,
  cwd?: string
): TerminalSessionSummary {
  const id = randomUUID()
  const now = Date.now()
  const sessionCwd = cwd ?? WORKSPACE_ROOT
  const proc = pty.spawn(SHELL, SHELL_ARGS, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: sessionCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      PROJECT_PATH: WORKSPACE_ROOT,
    },
  })

  const session: TerminalSession = {
    id,
    name: name ?? generateTerminalName(),
    pty: proc,
    cols,
    rows,
    cwd: sessionCwd,
    createdAt: now,
    lastActivityAt: now,
    terminated: false,
    exitCode: null,
    scrollback: '',
    persistDirty: true,
  }

  proc.onData((chunk) => {
    session.lastActivityAt = Date.now()
    session.scrollback = truncateScrollback(session.scrollback + chunk)
    session.persistDirty = true
  })

  proc.onExit(({ exitCode }) => {
    session.exitCode = exitCode
    session.terminated = true
    session.persistDirty = true
  })

  sessions.set(id, session)
  terminalLogger.info('Terminal session started', { sessionId: id, name: session.name, cols, rows, cwd: sessionCwd })

  void persistSession(toPersistedSession(session))

  return toSummary(session)
}

export function restoreTerminalSession(id: string): TerminalSessionSummary | null {
  const session = sessions.get(id)
  if (!session) return null
  if (!session.terminated) return toSummary(session)
  if (session.pty) return toSummary(session)

  const proc = pty.spawn(SHELL, SHELL_ARGS, {
    name: 'xterm-256color',
    cols: session.cols,
    rows: session.rows,
    cwd: session.cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      PROJECT_PATH: WORKSPACE_ROOT,
    },
  })

  session.pty = proc
  session.terminated = false
  session.exitCode = null
  session.lastActivityAt = Date.now()
  session.persistDirty = true

  proc.onData((chunk) => {
    session.lastActivityAt = Date.now()
    session.scrollback = truncateScrollback(session.scrollback + chunk)
    session.persistDirty = true
  })

  proc.onExit(({ exitCode }) => {
    session.exitCode = exitCode
    session.terminated = true
    session.persistDirty = true
  })

  terminalLogger.info('Terminal session restored', { sessionId: id, name: session.name })

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
  if (!session.pty) return { ok: false, error: 'Session has no active PTY' }

  if (!isCommandAllowed(input)) {
    session.scrollback = truncateScrollback(
      session.scrollback + '\r\n\x1b[31m[blocked] Command rejected by workspace policy.\x1b[0m\r\n'
    )
    session.persistDirty = true
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
  if (!session.pty) return { ok: false, error: 'Session has no active PTY' }

  const safeCols = Math.max(20, Math.floor(cols))
  const safeRows = Math.max(5, Math.floor(rows))
  session.cols = safeCols
  session.rows = safeRows
  session.lastActivityAt = Date.now()
  session.persistDirty = true
  session.pty.resize(safeCols, safeRows)
  return { ok: true }
}

export function terminateTerminalSession(id: string): { ok: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) return { ok: false, error: 'Session not found' }
  terminateSessionInternal(session, 'api')
  return { ok: true }
}

export function renameTerminalSession(id: string, name: string): { ok: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) return { ok: false, error: 'Session not found' }

  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, error: 'Name cannot be empty' }
  if (trimmedName.length > 50) return { ok: false, error: 'Name too long (max 50 chars)' }

  session.name = trimmedName
  session.persistDirty = true
  terminalLogger.info('Terminal session renamed', { sessionId: id, name: trimmedName })
  return { ok: true }
}

export async function deleteTerminalSessionPermanently(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = sessions.get(id)
  if (session) {
    if (!session.terminated) {
      terminateSessionInternal(session, 'api')
    }
    sessions.delete(id)
  }
  try {
    await deletePersistedSession(id)
    terminalLogger.info('Terminal session deleted', { sessionId: id })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to delete' }
  }
}

export function __resetTerminalSessionsForTests(): void {
  for (const session of sessions.values()) {
    terminateSessionInternal(session, 'api')
  }
  sessions.clear()
  persistenceInitialized = false
}
