import { appendFileSync, statSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { getTempFile, getTempDir } from '@/lib/paths'
import { trace } from '@opentelemetry/api'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  traceId?: string
  spanId?: string
  data?: Record<string, unknown>
}

const LOG_FILE = getTempFile('swarm-ui.log')
const STRUCTURED_LOG_DIR = process.env.LOG_DIR || '/var/log/swarm-ui'
const STRUCTURED_LOG_FILE = path.join(STRUCTURED_LOG_DIR, 'app.log')
const MAX_LOG_SIZE_BYTES = parseInt(process.env.LOG_MAX_SIZE || '10485760', 10) // 10MB default
const MAX_LOG_FILES = parseInt(process.env.LOG_MAX_FILES || '5', 10)

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

function getTraceContext(): { traceId?: string; spanId?: string } {
  try {
    const activeSpan = trace.getActiveSpan()
    if (activeSpan) {
      const spanContext = activeSpan.spanContext()
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      }
    }
  } catch {
    // OpenTelemetry may not be initialized
  }
  return {}
}

function formatConsole(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level]
  const lvl = entry.level.toUpperCase().padEnd(5)
  const traceInfo = entry.traceId ? ` [trace:${entry.traceId.slice(0, 8)}]` : ''
  const base = `${color}${lvl}${RESET} [${entry.component}]${traceInfo} ${entry.message}`
  if (entry.data && Object.keys(entry.data).length > 0) {
    return `${base} ${JSON.stringify(entry.data)}`
  }
  return base
}

function rotateLogFile(logPath: string): void {
  try {
    const stats = statSync(logPath)
    if (stats.size >= MAX_LOG_SIZE_BYTES) {
      // Rotate existing files
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const oldFile = `${logPath}.${i}`
        const newFile = `${logPath}.${i + 1}`
        if (existsSync(oldFile)) {
          if (i === MAX_LOG_FILES - 1) {
            // Delete oldest file
            try {
              require('node:fs').unlinkSync(oldFile)
            } catch {
              // Ignore deletion errors
            }
          } else {
            renameSync(oldFile, newFile)
          }
        }
      }
      // Rename current log to .1
      renameSync(logPath, `${logPath}.1`)
    }
  } catch {
    // File doesn't exist or other error, no rotation needed
  }
}

function ensureLogDir(dirPath: string): void {
  try {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
  } catch {
    // Ignore directory creation errors
  }
}

function writeToFile(entry: LogEntry): void {
  const jsonLine = JSON.stringify(entry) + '\n'
  
  // Write to temp file (original behavior)
  try {
    appendFileSync(LOG_FILE, jsonLine)
  } catch {
    // Silently ignore file write errors to avoid cascading failures
  }
  
  // Write to structured log directory for Promtail collection
  try {
    ensureLogDir(STRUCTURED_LOG_DIR)
    rotateLogFile(STRUCTURED_LOG_FILE)
    appendFileSync(STRUCTURED_LOG_FILE, jsonLine)
  } catch {
    // Silently ignore file write errors
  }
}

function log(
  component: string,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return

  const traceContext = getTraceContext()

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(traceContext.traceId ? { traceId: traceContext.traceId } : {}),
    ...(traceContext.spanId ? { spanId: traceContext.spanId } : {}),
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
