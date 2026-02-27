import test from 'node:test'
import assert from 'node:assert/strict'
import { TicketManager } from '@/server/ticket-manager'


test('TicketManager.enforceSLATimers rejects breached ticket and creates escalation', () => {
  const manager = new TicketManager()
  const ticket = manager.createTicket({
    title: 'Implement API',
    description: 'work',
    assignedRole: 'coder',
  })

  manager.updateTicket(ticket.id, {
    sla: { targetMinutes: 1, warningThresholdPct: 80, startedAt: Date.now() - 2 * 60_000 },
    escalationPolicy: { maxRetries: 3, escalateOnSLABreach: true, escalationDelayMinutes: 0, escalationRoles: ['planner'] },
    approvals: { requiredGates: ['review'], approvedGates: ['review'] },
  })

  const escalations = manager.enforceSLATimers(Date.now())
  const updated = manager.getTicket(ticket.id)

  assert.equal(updated?.status, 'rejected')
  assert.equal(escalations.length, 1)
  assert.equal(escalations[0]?.type, 'escalation')
})
