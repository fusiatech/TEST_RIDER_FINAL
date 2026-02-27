import { createHash, randomUUID } from 'node:crypto'
import type { Ticket, SLAPriority } from '@/lib/types'
import { createLogger } from '@/server/logger'

const logger = createLogger('error-to-ticket')

/* ── Types ─────────────────────────────────────────────────────── */

export interface ErrorFingerprint {
  hash: string
  message: string
  stackTrace: string
  component: string
  source: 'error-boundary' | 'logger' | 'test-failure' | 'ci-cd' | 'api' | 'unknown'
  firstSeen: number
  lastSeen: number
  occurrenceCount: number
  ticketId?: string
  metadata?: Record<string, unknown>
}

export interface ErrorToTicketConfig {
  enabled: boolean
  minOccurrences: number
  deduplicationWindowMs: number
  autoAssign: boolean
  defaultPriority: SLAPriority
  excludePatterns: RegExp[]
  autoCreateTicket: boolean
  notifyOnNewError: boolean
}

export interface RawError {
  message: string
  stack?: string
  component?: string
  source?: ErrorFingerprint['source']
  metadata?: Record<string, unknown>
}

export interface ErrorOccurrence {
  id: string
  fingerprintHash: string
  timestamp: number
  message: string
  stackTrace: string
  component: string
  source: ErrorFingerprint['source']
  metadata?: Record<string, unknown>
}

/* ── Default Config ────────────────────────────────────────────── */

export const DEFAULT_ERROR_TO_TICKET_CONFIG: ErrorToTicketConfig = {
  enabled: true,
  minOccurrences: 3,
  deduplicationWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  autoAssign: true,
  defaultPriority: 'medium',
  excludePatterns: [
    /ResizeObserver loop/i,
    /Script error/i,
    /Network request failed/i,
    /AbortError/i,
    /Loading chunk \d+ failed/i,
  ],
  autoCreateTicket: false,
  notifyOnNewError: true,
}

/* ── In-Memory Storage ─────────────────────────────────────────── */

const fingerprints = new Map<string, ErrorFingerprint>()
const occurrences: ErrorOccurrence[] = []
let config: ErrorToTicketConfig = { ...DEFAULT_ERROR_TO_TICKET_CONFIG }

/* ── Core Functions ────────────────────────────────────────────── */

export function computeFingerprint(error: RawError): ErrorFingerprint {
  const message = error.message || 'Unknown error'
  const stackTrace = normalizeStackTrace(error.stack || '')
  const component = error.component || extractComponentFromStack(stackTrace)
  const source = error.source || 'unknown'
  
  const hashInput = `${message}::${stackTrace}::${component}`
  const hash = createHash('sha256').update(hashInput).digest('hex')
  
  const now = Date.now()
  
  const existing = fingerprints.get(hash)
  if (existing) {
    existing.lastSeen = now
    existing.occurrenceCount++
    return existing
  }
  
  const fp: ErrorFingerprint = {
    hash,
    message,
    stackTrace,
    component,
    source,
    firstSeen: now,
    lastSeen: now,
    occurrenceCount: 1,
    metadata: error.metadata,
  }
  
  fingerprints.set(hash, fp)
  return fp
}

function normalizeStackTrace(stack: string): string {
  if (!stack) return ''
  
  return stack
    .split('\n')
    .map((line) => {
      return line
        .replace(/:\d+:\d+\)?$/, '') // Remove line:column numbers
        .replace(/\?[^\s)]+/, '') // Remove query strings
        .trim()
    })
    .filter((line) => line.length > 0)
    .slice(0, 10) // Keep first 10 frames
    .join('\n')
}

function extractComponentFromStack(stack: string): string {
  if (!stack) return 'unknown'
  
  const lines = stack.split('\n')
  for (const line of lines) {
    const match = line.match(/at\s+(\w+)/)
    if (match && match[1] && !['Object', 'Module', 'eval', 'anonymous'].includes(match[1])) {
      return match[1]
    }
  }
  
  return 'unknown'
}

export function shouldCreateTicket(fp: ErrorFingerprint, cfg: ErrorToTicketConfig = config): boolean {
  if (!cfg.enabled) return false
  if (fp.ticketId) return false
  if (fp.occurrenceCount < cfg.minOccurrences) return false
  
  const windowStart = Date.now() - cfg.deduplicationWindowMs
  if (fp.firstSeen < windowStart && fp.lastSeen < windowStart) {
    return false
  }
  
  for (const pattern of cfg.excludePatterns) {
    if (pattern.test(fp.message) || pattern.test(fp.stackTrace)) {
      return false
    }
  }
  
  return true
}

export async function createBugTicket(fp: ErrorFingerprint, projectId: string): Promise<Ticket> {
  const now = Date.now()
  
  const ticket: Ticket = {
    id: randomUUID(),
    projectId,
    title: `[Auto] Bug: ${fp.message.slice(0, 80)}`,
    description: buildTicketDescription(fp),
    acceptanceCriteria: [
      'Error no longer occurs in production',
      'Root cause identified and documented',
      'Tests added to prevent regression',
    ],
    complexity: estimateComplexity(fp),
    status: 'backlog',
    assignedRole: 'coder',
    dependencies: [],
    evidenceIds: [],
    type: 'task',
    sla: {
      priority: config.defaultPriority,
      responseTimeHours: getPriorityResponseTime(config.defaultPriority),
      resolutionTimeHours: getPriorityResolutionTime(config.defaultPriority),
    },
    createdAt: now,
    updatedAt: now,
  }
  
  fp.ticketId = ticket.id
  fingerprints.set(fp.hash, fp)
  
  logger.info('Created bug ticket from error fingerprint', {
    ticketId: ticket.id,
    hash: fp.hash,
    occurrences: fp.occurrenceCount,
  })
  
  return ticket
}

function buildTicketDescription(fp: ErrorFingerprint): string {
  const lines: string[] = [
    '## Error Details',
    '',
    `**Message:** ${fp.message}`,
    `**Component:** ${fp.component}`,
    `**Source:** ${fp.source}`,
    '',
    '## Occurrence Info',
    '',
    `- **First seen:** ${new Date(fp.firstSeen).toISOString()}`,
    `- **Last seen:** ${new Date(fp.lastSeen).toISOString()}`,
    `- **Total occurrences:** ${fp.occurrenceCount}`,
    '',
    '## Stack Trace',
    '',
    '```',
    fp.stackTrace || 'No stack trace available',
    '```',
  ]
  
  if (fp.metadata && Object.keys(fp.metadata).length > 0) {
    lines.push('', '## Additional Metadata', '', '```json')
    lines.push(JSON.stringify(fp.metadata, null, 2))
    lines.push('```')
  }
  
  return lines.join('\n')
}

function estimateComplexity(fp: ErrorFingerprint): 'S' | 'M' | 'L' | 'XL' {
  if (fp.occurrenceCount > 100) return 'L'
  if (fp.occurrenceCount > 50) return 'M'
  if (fp.stackTrace.split('\n').length > 15) return 'L'
  return 'S'
}

function getPriorityResponseTime(priority: SLAPriority): number {
  const times: Record<SLAPriority, number> = {
    critical: 1,
    high: 4,
    medium: 24,
    low: 72,
  }
  return times[priority]
}

function getPriorityResolutionTime(priority: SLAPriority): number {
  const times: Record<SLAPriority, number> = {
    critical: 4,
    high: 24,
    medium: 72,
    low: 168,
  }
  return times[priority]
}

export function linkErrorToTicket(fingerprintHash: string, ticketId: string): ErrorFingerprint | null {
  const fp = fingerprints.get(fingerprintHash)
  if (!fp) return null
  
  fp.ticketId = ticketId
  fingerprints.set(fingerprintHash, fp)
  
  logger.info('Linked error fingerprint to ticket', { hash: fingerprintHash, ticketId })
  
  return fp
}

export function unlinkErrorFromTicket(fingerprintHash: string): ErrorFingerprint | null {
  const fp = fingerprints.get(fingerprintHash)
  if (!fp) return null
  
  delete fp.ticketId
  fingerprints.set(fingerprintHash, fp)
  
  logger.info('Unlinked error fingerprint from ticket', { hash: fingerprintHash })
  
  return fp
}

/* ── Query Functions ───────────────────────────────────────────── */

export function getErrorsByFingerprint(hash: string): ErrorOccurrence[] {
  return occurrences.filter((o) => o.fingerprintHash === hash)
}

export function getAllFingerprints(): ErrorFingerprint[] {
  return Array.from(fingerprints.values())
}

export function getFingerprint(hash: string): ErrorFingerprint | undefined {
  return fingerprints.get(hash)
}

export function getFingerprintsWithoutTicket(): ErrorFingerprint[] {
  return Array.from(fingerprints.values()).filter((fp) => !fp.ticketId)
}

export function getFingerprintsReadyForTicket(cfg: ErrorToTicketConfig = config): ErrorFingerprint[] {
  return Array.from(fingerprints.values()).filter((fp) => shouldCreateTicket(fp, cfg))
}

export function deduplicateErrors(errors: RawError[]): ErrorFingerprint[] {
  const seen = new Map<string, ErrorFingerprint>()
  
  for (const error of errors) {
    const fp = computeFingerprint(error)
    const existing = seen.get(fp.hash)
    
    if (existing) {
      existing.occurrenceCount++
      existing.lastSeen = Math.max(existing.lastSeen, fp.lastSeen)
    } else {
      seen.set(fp.hash, { ...fp })
    }
  }
  
  return Array.from(seen.values())
}

/* ── Error Recording ───────────────────────────────────────────── */

export function recordError(error: RawError): { fingerprint: ErrorFingerprint; occurrence: ErrorOccurrence } {
  const fp = computeFingerprint(error)
  
  const occurrence: ErrorOccurrence = {
    id: randomUUID(),
    fingerprintHash: fp.hash,
    timestamp: Date.now(),
    message: error.message,
    stackTrace: error.stack || '',
    component: error.component || fp.component,
    source: error.source || 'unknown',
    metadata: error.metadata,
  }
  
  occurrences.push(occurrence)
  
  // Trim old occurrences (keep last 1000)
  if (occurrences.length > 1000) {
    occurrences.splice(0, occurrences.length - 1000)
  }
  
  logger.debug('Recorded error occurrence', {
    hash: fp.hash,
    occurrences: fp.occurrenceCount,
    source: occurrence.source,
  })
  
  return { fingerprint: fp, occurrence }
}

/* ── Config Management ─────────────────────────────────────────── */

export function getConfig(): ErrorToTicketConfig {
  return { ...config }
}

export function updateConfig(updates: Partial<ErrorToTicketConfig>): ErrorToTicketConfig {
  config = { ...config, ...updates }
  logger.info('Updated error-to-ticket config', { config })
  return config
}

export function resetConfig(): void {
  config = { ...DEFAULT_ERROR_TO_TICKET_CONFIG }
}

/* ── Statistics ────────────────────────────────────────────────── */

export interface ErrorStatistics {
  totalFingerprints: number
  totalOccurrences: number
  fingerprintsWithTickets: number
  fingerprintsWithoutTickets: number
  readyForTicket: number
  bySource: Record<ErrorFingerprint['source'], number>
  byComponent: Record<string, number>
  recentErrors: number // Last 24 hours
}

export function getStatistics(): ErrorStatistics {
  const fps = Array.from(fingerprints.values())
  const now = Date.now()
  const dayAgo = now - 24 * 60 * 60 * 1000
  
  const bySource: Record<ErrorFingerprint['source'], number> = {
    'error-boundary': 0,
    'logger': 0,
    'test-failure': 0,
    'ci-cd': 0,
    'api': 0,
    'unknown': 0,
  }
  
  const byComponent: Record<string, number> = {}
  
  for (const fp of fps) {
    bySource[fp.source]++
    byComponent[fp.component] = (byComponent[fp.component] || 0) + fp.occurrenceCount
  }
  
  return {
    totalFingerprints: fps.length,
    totalOccurrences: fps.reduce((sum, fp) => sum + fp.occurrenceCount, 0),
    fingerprintsWithTickets: fps.filter((fp) => fp.ticketId).length,
    fingerprintsWithoutTickets: fps.filter((fp) => !fp.ticketId).length,
    readyForTicket: fps.filter((fp) => shouldCreateTicket(fp)).length,
    bySource,
    byComponent,
    recentErrors: occurrences.filter((o) => o.timestamp > dayAgo).length,
  }
}

/* ── Trend Analysis ────────────────────────────────────────────── */

export interface ErrorTrend {
  hash: string
  message: string
  component: string
  hourlyOccurrences: number[]
  trend: 'increasing' | 'decreasing' | 'stable'
  percentChange: number
}

export function getErrorTrends(hours: number = 24): ErrorTrend[] {
  const now = Date.now()
  const trends: ErrorTrend[] = []
  
  for (const fp of fingerprints.values()) {
    const hourlyOccurrences: number[] = []
    
    for (let i = 0; i < hours; i++) {
      const hourStart = now - (i + 1) * 60 * 60 * 1000
      const hourEnd = now - i * 60 * 60 * 1000
      
      const count = occurrences.filter(
        (o) => o.fingerprintHash === fp.hash && o.timestamp >= hourStart && o.timestamp < hourEnd
      ).length
      
      hourlyOccurrences.unshift(count)
    }
    
    const recentHalf = hourlyOccurrences.slice(Math.floor(hours / 2))
    const olderHalf = hourlyOccurrences.slice(0, Math.floor(hours / 2))
    
    const recentSum = recentHalf.reduce((a, b) => a + b, 0)
    const olderSum = olderHalf.reduce((a, b) => a + b, 0)
    
    let trend: ErrorTrend['trend'] = 'stable'
    let percentChange = 0
    
    if (olderSum > 0) {
      percentChange = ((recentSum - olderSum) / olderSum) * 100
      if (percentChange > 20) trend = 'increasing'
      else if (percentChange < -20) trend = 'decreasing'
    } else if (recentSum > 0) {
      trend = 'increasing'
      percentChange = 100
    }
    
    trends.push({
      hash: fp.hash,
      message: fp.message,
      component: fp.component,
      hourlyOccurrences,
      trend,
      percentChange,
    })
  }
  
  return trends.sort((a, b) => {
    if (a.trend === 'increasing' && b.trend !== 'increasing') return -1
    if (b.trend === 'increasing' && a.trend !== 'increasing') return 1
    return b.percentChange - a.percentChange
  })
}

/* ── Cleanup ───────────────────────────────────────────────────── */

export function clearOldFingerprints(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs
  let cleared = 0
  
  for (const [hash, fp] of fingerprints.entries()) {
    if (fp.lastSeen < cutoff && !fp.ticketId) {
      fingerprints.delete(hash)
      cleared++
    }
  }
  
  if (cleared > 0) {
    logger.info('Cleared old error fingerprints', { cleared, maxAgeMs })
  }
  
  return cleared
}

export function clearAllData(): void {
  fingerprints.clear()
  occurrences.length = 0
  logger.info('Cleared all error tracking data')
}

/* ── Integration Hooks ─────────────────────────────────────────── */

export function createErrorBoundaryHook() {
  return {
    onError: (error: Error, componentStack?: string) => {
      recordError({
        message: error.message,
        stack: error.stack || componentStack,
        source: 'error-boundary',
        metadata: { componentStack },
      })
    },
  }
}

export function createLoggerHook() {
  return {
    onError: (message: string, data?: Record<string, unknown>) => {
      recordError({
        message,
        stack: new Error().stack,
        source: 'logger',
        metadata: data,
      })
    },
  }
}

export function createTestFailureHook() {
  return {
    onTestFail: (testName: string, error: Error, testFile?: string) => {
      recordError({
        message: `Test failed: ${testName}`,
        stack: error.stack,
        source: 'test-failure',
        component: testFile || 'test',
        metadata: { testName, testFile },
      })
    },
  }
}

export function createCICDHook() {
  return {
    onPipelineFailure: (pipelineName: string, stage: string, error: string) => {
      recordError({
        message: `CI/CD failure: ${pipelineName} - ${stage}`,
        stack: error,
        source: 'ci-cd',
        component: pipelineName,
        metadata: { pipelineName, stage },
      })
    },
  }
}
