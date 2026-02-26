import { appendFileSync } from 'node:fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  data?: Record<string, unknown>
}

const LOG_FILE = '/tmp/swarm-ui.log'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
}

const RESET = '\x1b[0m'

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'debug'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL]
}

function formatConsole(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level]
  const lvl = entry.level.toUpperCase().padEnd(5)
  const base = `${color}${lvl}${RESET} [${entry.component}] ${entry.message}`
  if (entry.data && Object.keys(entry.data).length > 0) {
    return `${base} ${JSON.stringify(entry.data)}`
  }
  return base
}

function writeToFile(entry: LogEntry): void {
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  } catch {
    // Silently ignore file write errors to avoid cascading failures
  }
}

function log(
  component: string,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(data !== undefined ? { data } : {}),
  }

  if (level === 'error') {
    console.error(formatConsole(entry))
  } else if (level === 'warn') {
    console.warn(formatConsole(entry))
  } else {
    console.log(formatConsole(entry))
  }

  writeToFile(entry)
}

export function createLogger(component: string): {
  debug: (msg: string, data?: Record<string, unknown>) => void
  info: (msg: string, data?: Record<string, unknown>) => void
  warn: (msg: string, data?: Record<string, unknown>) => void
  error: (msg: string, data?: Record<string, unknown>) => void
} {
  return {
    debug: (msg: string, data?: Record<string, unknown>) =>
      log(component, 'debug', msg, data),
    info: (msg: string, data?: Record<string, unknown>) =>
      log(component, 'info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) =>
      log(component, 'warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) =>
      log(component, 'error', msg, data),
  }
}
