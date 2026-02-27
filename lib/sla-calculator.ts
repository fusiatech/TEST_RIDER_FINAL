import type { SLAPriority, SLAStatus } from '@/lib/types'

const SLA_DEFAULTS: Record<SLAPriority, { response: number; resolution: number }> = {
  critical: { response: 1, resolution: 4 },
  high: { response: 4, resolution: 24 },
  medium: { response: 8, resolution: 48 },
  low: { response: 24, resolution: 72 },
}

export function calculateSLADeadlines(
  createdAt: number,
  priority: SLAPriority
): { responseDeadline: string; resolutionDeadline: string } {
  const config = SLA_DEFAULTS[priority]
  const created = new Date(createdAt)

  return {
    responseDeadline: new Date(
      created.getTime() + config.response * 60 * 60 * 1000
    ).toISOString(),
    resolutionDeadline: new Date(
      created.getTime() + config.resolution * 60 * 60 * 1000
    ).toISOString(),
  }
}

export function checkSLAStatus(
  createdAt: number,
  firstResponseAt: number | null | undefined,
  resolvedAt: number | null | undefined,
  priority: SLAPriority
): SLAStatus {
  const deadlines = calculateSLADeadlines(createdAt, priority)
  const now = new Date()

  const responseDeadline = new Date(deadlines.responseDeadline)
  const resolutionDeadline = new Date(deadlines.resolutionDeadline)

  const responseBreached = firstResponseAt
    ? new Date(firstResponseAt) > responseDeadline
    : now > responseDeadline

  const resolutionBreached = resolvedAt
    ? new Date(resolvedAt) > resolutionDeadline
    : now > resolutionDeadline

  return {
    responseDeadline: deadlines.responseDeadline,
    resolutionDeadline: deadlines.resolutionDeadline,
    responseBreached,
    resolutionBreached,
    timeToResponse: firstResponseAt
      ? Math.round((firstResponseAt - createdAt) / 60000)
      : undefined,
    timeToResolution: resolvedAt
      ? Math.round((resolvedAt - createdAt) / 60000)
      : undefined,
  }
}

export function formatTimeRemaining(deadline: string): string {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const remaining = deadlineDate.getTime() - now.getTime()

  if (remaining < 0) {
    const overdue = Math.abs(remaining)
    const hours = Math.floor(overdue / (60 * 60 * 1000))
    if (hours < 24) {
      return `${hours}h overdue`
    }
    const days = Math.floor(hours / 24)
    return `${days}d overdue`
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  if (hours < 1) {
    const minutes = Math.floor(remaining / (60 * 1000))
    return `${minutes}m`
  }
  if (hours < 24) {
    return `${hours}h`
  }
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function getSLAUrgency(
  deadline: string
): 'critical' | 'warning' | 'normal' | 'completed' {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const remaining = deadlineDate.getTime() - now.getTime()
  const hoursRemaining = remaining / (60 * 60 * 1000)

  if (hoursRemaining < 0) return 'critical'
  if (hoursRemaining < 2) return 'critical'
  if (hoursRemaining < 8) return 'warning'
  return 'normal'
}

export function getDefaultPriorityFromComplexity(
  complexity: 'S' | 'M' | 'L' | 'XL'
): SLAPriority {
  switch (complexity) {
    case 'S':
      return 'low'
    case 'M':
      return 'medium'
    case 'L':
      return 'high'
    case 'XL':
      return 'critical'
    default:
      return 'medium'
  }
}
