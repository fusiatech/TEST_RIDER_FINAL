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

const SECRET_REPLACEMENT = '[REDACTED_SECRET]'
const REDACTION_PATTERNS: RegExp[] = [
  /\b(?:sk|pk)(?:_|-)(?:live|test)(?:_|-)[a-zA-Z0-9]{16,}\b/g,
  /\bghp_[a-zA-Z0-9]{24,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[a-zA-Z0-9_\-\/+=]{10,}["']?/gi,
]

export function redactSensitiveOutput(input: string): string {
  let redacted = input
  for (const pattern of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, SECRET_REPLACEMENT)
  }
  return redacted
}

function sanitizeLogData(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSensitiveOutput(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogData(item))
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return Object.fromEntries(entries.map(([k, v]) => [k, sanitizeLogData(v)]))
  }
  return value
}

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

  const safeMessage = redactSensitiveOutput(message)
  const safeData = data === undefined
    ? undefined
    : (sanitizeLogData(data) as Record<string, unknown>)

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message: safeMessage,
    ...(safeData !== undefined ? { data: safeData } : {}),
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
