import test from 'node:test'
import assert from 'node:assert/strict'
import type { Ticket } from '@/lib/types'
import { computeCriticalPath, getTicketSLARisk } from '@/lib/project-analytics'

function makeTicket(partial: Partial<Ticket> & Pick<Ticket, 'id'>): Ticket {
  const now = Date.now()
  const { id, ...rest } = partial
  return {
    id,
    projectId: 'p1',
    title: partial.title ?? partial.id,
    description: partial.description ?? '',
    acceptanceCriteria: partial.acceptanceCriteria ?? [],
    complexity: partial.complexity ?? 'M',
    status: partial.status ?? 'backlog',
    assignedRole: partial.assignedRole ?? 'coder',
    dependencies: partial.dependencies ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    ...(rest as Partial<Ticket>),
  }
}

test('computeCriticalPath returns longest dependency chain using SLA durations', () => {
  const tickets: Ticket[] = [
    makeTicket({ id: 'A', sla: { targetMinutes: 30, warningThresholdPct: 80 }, dependencies: [] }),
    makeTicket({ id: 'B', sla: { targetMinutes: 60, warningThresholdPct: 80 }, dependencies: ['A'] }),
    makeTicket({ id: 'C', sla: { targetMinutes: 20, warningThresholdPct: 80 }, dependencies: ['B'] }),
    makeTicket({ id: 'D', sla: { targetMinutes: 90, warningThresholdPct: 80 }, dependencies: [] }),
  ]

  const result = computeCriticalPath(tickets)
  assert.deepEqual(result.path, ['A', 'B', 'C'])
  assert.equal(result.totalDurationMinutes, 110)
})

test('getTicketSLARisk identifies breached and at-risk tickets', () => {
  const now = Date.now()
  const atRisk = makeTicket({
    id: 'risk',
    createdAt: now - 85 * 60_000,
    sla: { targetMinutes: 100, warningThresholdPct: 80 },
  })
  const breached = makeTicket({
    id: 'breach',
    createdAt: now - 130 * 60_000,
    sla: { targetMinutes: 120, warningThresholdPct: 80 },
  })

  assert.equal(getTicketSLARisk(atRisk, now), 'at_risk')
  assert.equal(getTicketSLARisk(breached, now), 'breached')
})
