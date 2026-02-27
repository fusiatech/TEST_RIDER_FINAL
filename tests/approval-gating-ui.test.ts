import test from 'node:test'
import assert from 'node:assert/strict'
import type { Ticket } from '@/lib/types'
import { canTicketExecute, getMissingApprovalGates } from '@/lib/project-analytics'

function ticketWithApprovals(approvedGates: string[]): Ticket {
  const now = Date.now()
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Decompose Epic',
    description: '',
    acceptanceCriteria: [],
    complexity: 'M',
    status: 'backlog',
    assignedRole: 'planner',
    dependencies: [],
    approvals: {
      requiredGates: ['review', 'epic_breakdown'],
      approvedGates: approvedGates as any,
    },
    createdAt: now,
    updatedAt: now,
  }
}

test('approval-gated progression blocks execution until all checkpoints are approved', () => {
  const onlyReview = ticketWithApprovals(['review'])
  assert.equal(canTicketExecute(onlyReview), false)
  assert.deepEqual(getMissingApprovalGates(onlyReview), ['epic_breakdown'])

  const fullyApproved = ticketWithApprovals(['review', 'epic_breakdown'])
  assert.equal(canTicketExecute(fullyApproved), true)
  assert.deepEqual(getMissingApprovalGates(fullyApproved), [])
})
