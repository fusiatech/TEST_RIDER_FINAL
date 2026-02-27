import type { Ticket, AgentRole, TicketComplexity, Settings, TicketLevel, TicketApprovalGate } from '@/lib/types'
import { randomUUID } from 'node:crypto'
import { canTicketExecute, getMissingApprovalGates, getTicketSLARisk } from '@/lib/project-analytics'

/** Parent level required for each ticket level. Epic is external to TicketManager. */
const PARENT_LEVEL: Record<Exclude<TicketLevel, 'task'>, TicketLevel> = {
  subtask: 'task',
  subatomic: 'subtask',
}

const PIPELINE_STAGES: AgentRole[] = [
  'researcher',
  'planner',
  'coder',
  'validator',
  'security',
  'synthesizer',
]

export class TicketManager {
  private tickets: Map<string, Ticket> = new Map()
  private onTicketUpdate: ((ticket: Ticket) => void) | null = null

  setUpdateCallback(cb: (ticket: Ticket) => void): void {
    this.onTicketUpdate = cb
  }

  createTicket(options: {
    title: string
    description: string
    assignedRole: AgentRole
    dependencies?: string[]
    projectId?: string
    level?: TicketLevel
    parentId?: string
    epicId?: string
  }): Ticket {
    const level = options.level
    const parentId = options.parentId
    const epicId = options.epicId

    if (level) {
      if (!epicId) {
        throw new Error(`createTicket: epicId is required when level is ${level}`)
      }
      if (level === 'task') {
        if (!parentId) {
          throw new Error(`createTicket: parentId (epicId) is required when level is task`)
        }
      } else {
        if (!parentId) {
          throw new Error(`createTicket: parentId is required when level is ${level}`)
        }
        const parent = this.tickets.get(parentId)
        if (!parent) {
          throw new Error(`createTicket: parent ticket ${parentId} not found`)
        }
        const requiredParentLevel = PARENT_LEVEL[level]
        if (parent.level !== requiredParentLevel) {
          throw new Error(
            `createTicket: ${level} requires parent with level ${requiredParentLevel}, got ${parent.level ?? 'undefined'}`
          )
        }
      }
    }

    const ticket: Ticket = {
      id: randomUUID(),
      projectId: options.projectId ?? 'default',
      title: options.title,
      description: options.description,
      acceptanceCriteria: [],
      complexity: 'M',
      status: 'backlog',
      assignedRole: options.assignedRole,
      dependencies: options.dependencies ?? [],
      evidenceIds: [],
      sla: {
        targetMinutes: 120,
        warningThresholdPct: 80,
        startedAt: Date.now(),
      },
      escalationPolicy: {
        maxRetries: 3,
        escalateOnSLABreach: true,
        escalationDelayMinutes: 0,
        escalationRoles: ['planner', 'validator'],
      },
      approvals: {
        requiredGates: level === 'task'
          ? ['review', 'epic_breakdown']
          : level === 'subtask' || level === 'subatomic'
            ? ['review', 'task_breakdown']
            : ['review'],
        approvedGates: [],
      },
      level,
      parentId,
      epicId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    this.tickets.set(ticket.id, ticket)
    this.onTicketUpdate?.(ticket)
    return ticket
  }

  /** Load tickets into the manager (e.g. from project). Enables hierarchy validation for new tickets. */
  loadTickets(tickets: Ticket[]): void {
    for (const t of tickets) {
      this.tickets.set(t.id, t)
    }
  }

  updateTicket(id: string, update: Partial<Ticket>): Ticket | null {
    const existing = this.tickets.get(id)
    if (!existing) return null

    const updated: Ticket = { ...existing, ...update, id: existing.id, updatedAt: Date.now() }
    this.tickets.set(id, updated)
    this.onTicketUpdate?.(updated)
    return updated
  }

  getTicket(id: string): Ticket | null {
    return this.tickets.get(id) ?? null
  }

  /** T10.2: Create escalation ticket when original fails 3 times */
  createEscalationTicket(
    original: Ticket,
    logs: string,
    reproSteps: string,
  ): Ticket {
    const ticket: Ticket = {
      id: randomUUID(),
      projectId: original.projectId,
      title: `[Escalation] ${original.title}`,
      description: `${original.description}\n\n--- Escalation ---\nLogs:\n${logs.slice(0, 2000)}\n\nRepro:\n${reproSteps.slice(0, 1000)}`,
      acceptanceCriteria: [],
      complexity: original.complexity,
      status: 'backlog',
      assignedRole: original.assignedRole,
      dependencies: [original.id],
      evidenceIds: original.evidenceIds ?? [],
      originalTicketId: original.id,
      type: 'escalation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.tickets.set(ticket.id, ticket)
    this.onTicketUpdate?.(ticket)
    return ticket
  }

  getAllTickets(): Ticket[] {
    return Array.from(this.tickets.values())
  }

  getTicketsByStage(stage: AgentRole): Ticket[] {
    return Array.from(this.tickets.values()).filter((t) => t.assignedRole === stage)
  }

  completeTicket(id: string, output: string): void {
    const ticket = this.tickets.get(id)
    if (!ticket) return

    const updated: Ticket = {
      ...ticket,
      status: 'done',
      output,
      updatedAt: Date.now(),
    }
    this.tickets.set(id, updated)
    this.onTicketUpdate?.(updated)

    this.unblockDependents(id)
  }

  failTicket(id: string, error: string): void {
    const ticket = this.tickets.get(id)
    if (!ticket) return

    const retryCount = Math.min(3, (ticket.retryCount ?? 0) + 1)
    const updated: Ticket = {
      ...ticket,
      status: 'rejected',
      output: error,
      retryCount,
      updatedAt: Date.now(),
    }
    this.tickets.set(id, updated)
    this.onTicketUpdate?.(updated)

    this.blockDependents(id)
  }

  getReadyTickets(): Ticket[] {
    this.enforceSLATimers()

    return Array.from(this.tickets.values()).filter((ticket) => {
      if (ticket.status !== 'backlog') return false
      if (!canTicketExecute(ticket)) return false
      return ticket.dependencies.every((depId: string) => {
        const dep = this.tickets.get(depId)
        return dep !== undefined && dep.status === 'done' && canTicketExecute(dep)
      })
    })
  }

  approveGate(id: string, gate: TicketApprovalGate): Ticket | null {
    const ticket = this.tickets.get(id)
    if (!ticket) return null

    const approved = new Set<string>((ticket.approvals?.approvedGates ?? []) as string[])
    approved.add(gate)
    const updated: Ticket = {
      ...ticket,
      approvals: {
        requiredGates: (ticket.approvals?.requiredGates ?? ['review']) as TicketApprovalGate[],
        approvedGates: Array.from(approved) as TicketApprovalGate[],
        approvedAt: {
          ...(ticket.approvals?.approvedAt ?? {}),
          [gate]: Date.now(),
        },
      },
      updatedAt: Date.now(),
    }
    this.tickets.set(id, updated)
    this.onTicketUpdate?.(updated)
    return updated
  }

  enforceSLATimers(now = Date.now()): Ticket[] {
    const escalations: Ticket[] = []
    for (const ticket of this.tickets.values()) {
      if (ticket.status !== 'backlog' && ticket.status !== 'in_progress' && ticket.status !== 'review') continue

      if (getTicketSLARisk(ticket, now) !== 'breached') continue

      const rejected: Ticket = {
        ...ticket,
        status: 'rejected',
        output: `${ticket.output ?? ''}\nSLA breach: exceeded ${ticket.sla?.targetMinutes ?? 0} minute target.`.trim(),
        retryCount: Math.min(ticket.escalationPolicy?.maxRetries ?? 3, (ticket.retryCount ?? 0) + 1),
        updatedAt: now,
      }
      this.tickets.set(ticket.id, rejected)
      this.onTicketUpdate?.(rejected)

      const shouldEscalate = rejected.escalationPolicy?.escalateOnSLABreach !== false
      if (shouldEscalate) {
        const escalation = this.createEscalationTicket(
          rejected,
          rejected.output ?? 'SLA breach',
          `Missing approvals: ${getMissingApprovalGates(rejected).join(', ') || 'none'}`,
        )
        escalations.push(escalation)
      }
    }
    return escalations
  }

  /**
   * Returns the next ticket ready for an agent, respecting level hierarchy and dependencies.
   * Subatomic only when subtask is done; subtask only when task is done.
   */
  getNextTicketForAgent(): Ticket | null {
    const ready = this.getReadyTickets()
    for (const ticket of ready) {
      if (ticket.level === 'subatomic' && ticket.parentId) {
        const parent = this.tickets.get(ticket.parentId)
        if (!parent || parent.status !== 'done') continue
      }
      if (ticket.level === 'subtask' && ticket.parentId) {
        const parent = this.tickets.get(ticket.parentId)
        if (!parent || parent.status !== 'done') continue
      }
      return ticket
    }
    return null
  }

  decomposeTask(prompt: string, settings: Settings): Ticket[] {
    const created: Ticket[] = []
    let previousStageIds: string[] = []

    for (const stage of PIPELINE_STAGES) {
      const count = settings.parallelCounts[stage] ?? 1
      const currentStageIds: string[] = []

      for (let i = 0; i < count; i++) {
        const ticket = this.createTicket({
          title: `${stage} #${i + 1}`,
          description: `${stage} stage for: ${prompt.slice(0, 200)}`,
          assignedRole: stage,
          dependencies: [...previousStageIds],
        })
        currentStageIds.push(ticket.id)
        created.push(ticket)
      }

      previousStageIds = currentStageIds
    }

    return created
  }

  reset(): void {
    this.tickets.clear()
  }

  private unblockDependents(completedId: string): void {
    for (const ticket of this.tickets.values()) {
      if (ticket.status === 'backlog' && ticket.dependencies.includes(completedId)) {
        const allDepsCompleted = ticket.dependencies.every((depId: string) => {
          const dep = this.tickets.get(depId)
          return dep !== undefined && dep.status === 'done'
        })
        if (allDepsCompleted) {
          const unblocked: Ticket = { ...ticket, status: 'in_progress', updatedAt: Date.now() }
          this.tickets.set(ticket.id, unblocked)
          this.onTicketUpdate?.(unblocked)
        }
      }
    }
  }

  private blockDependents(failedId: string): void {
    for (const ticket of this.tickets.values()) {
      if (
        ticket.dependencies.includes(failedId) &&
        (ticket.status === 'backlog' || ticket.status === 'in_progress')
      ) {
        const blocked: Ticket = { ...ticket, status: 'backlog', updatedAt: Date.now() }
        this.tickets.set(ticket.id, blocked)
        this.onTicketUpdate?.(blocked)
      }
    }
  }
}

/* ── Standalone ticket generation utilities ───────────────────── */

function estimateComplexity(text: string): TicketComplexity {
  const length = text.trim().length
  if (length < 80) return 'S'
  if (length < 200) return 'M'
  if (length < 500) return 'L'
  return 'XL'
}

function inferRole(text: string): AgentRole {
  const lower = text.toLowerCase()
  if (lower.includes('test') || lower.includes('validate') || lower.includes('verify') || lower.includes('qa')) return 'validator'
  if (lower.includes('security') || lower.includes('audit') || lower.includes('vulnerability')) return 'security'
  if (lower.includes('research') || lower.includes('investigate') || lower.includes('explore')) return 'researcher'
  if (lower.includes('plan') || lower.includes('architect') || lower.includes('design') || lower.includes('structure')) return 'planner'
  if (lower.includes('synthesize') || lower.includes('summary') || lower.includes('combine') || lower.includes('merge')) return 'synthesizer'
  return 'coder'
}

function splitIntoSections(description: string): string[] {
  const lines = description.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)

  const sections: string[] = []
  let current: string[] = []

  for (const line of lines) {
    const isHeader = /^#{1,4}\s/.test(line) ||
      /^[-*]\s/.test(line) ||
      /^\d+[.)]\s/.test(line) ||
      (line.endsWith(':') && line.length < 80)

    if (isHeader && current.length > 0) {
      sections.push(current.join('\n'))
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) {
    sections.push(current.join('\n'))
  }

  if (sections.length === 0 && description.trim().length > 0) {
    sections.push(description.trim())
  }

  return sections
}

export function generateTicketsFromDescription(
  projectId: string,
  description: string,
): Ticket[] {
  const sections = splitIntoSections(description)
  const tickets: Ticket[] = []
  const now = Date.now()

  const planTicketId = randomUUID()
  const planTicket: Ticket = {
    id: planTicketId,
    projectId,
    title: 'Architecture & planning',
    description: `Plan the implementation approach for: ${description.slice(0, 300)}`,
    acceptanceCriteria: ['Implementation plan documented', 'Dependencies identified', 'Approach approved'],
    complexity: 'M',
    status: 'backlog',
    assignedRole: 'planner',
    dependencies: [],
    evidenceIds: [],
    createdAt: now,
    updatedAt: now,
  }
  tickets.push(planTicket)

  const implTicketIds: string[] = []
  for (const section of sections) {
    const title = section.split('\n')[0].replace(/^[#\-*\d.)]+\s*/, '').slice(0, 100)
    const role = inferRole(section)
    const ticketId = randomUUID()
    implTicketIds.push(ticketId)

    const implTicket: Ticket = {
      id: ticketId,
      projectId,
      title: title || 'Implementation task',
      description: section,
      acceptanceCriteria: [`${title || 'Feature'} implemented and working`],
      complexity: estimateComplexity(section),
      status: 'backlog',
      assignedRole: role,
      dependencies: [planTicketId],
      evidenceIds: [],
      createdAt: now,
      updatedAt: now,
    }
    tickets.push(implTicket)
  }

  const testTicketId = randomUUID()
  const testTicket: Ticket = {
    id: testTicketId,
    projectId,
    title: 'Testing & validation',
    description: `Validate all implementation tickets for project ${projectId}`,
    acceptanceCriteria: ['All tests pass', 'No regressions detected', 'Code review completed'],
    complexity: 'M',
    status: 'backlog',
    assignedRole: 'validator',
    dependencies: [...implTicketIds],
    evidenceIds: [],
    createdAt: now,
    updatedAt: now,
  }
  tickets.push(testTicket)

  const securityTicketId = randomUUID()
  const securityTicket: Ticket = {
    id: securityTicketId,
    projectId,
    title: 'Security review',
    description: `Security audit for all changes in project ${projectId}`,
    acceptanceCriteria: ['No critical vulnerabilities', 'Security best practices followed'],
    complexity: 'S',
    status: 'backlog',
    assignedRole: 'security',
    dependencies: [...implTicketIds],
    evidenceIds: [],
    createdAt: now,
    updatedAt: now,
  }
  tickets.push(securityTicket)

  return tickets
}

export function getExecutableTickets(tickets: Ticket[]): Ticket[] {
  const doneIds = new Set(
    tickets.filter((t) => t.status === 'done' || t.status === 'approved').map((t) => t.id)
  )

  return tickets.filter((ticket) => {
    if (ticket.status !== 'backlog') return false
    return ticket.dependencies.every((depId) => doneIds.has(depId))
  })
}

export function advanceTicketPipeline(
  tickets: Ticket[],
  completedTicketId: string,
): Ticket[] {
  const now = Date.now()

  return tickets.map((ticket) => {
    if (ticket.id === completedTicketId) {
      return { ...ticket, status: 'done' as const, updatedAt: now }
    }

    if (ticket.status !== 'backlog') return ticket

    const updatedDeps = ticket.dependencies.filter((d) => d !== completedTicketId)
    const allDoneIds = new Set(
      tickets
        .filter((t) => t.id === completedTicketId || t.status === 'done' || t.status === 'approved')
        .map((t) => t.id)
    )
    const allDepsMet = ticket.dependencies.every((depId) => allDoneIds.has(depId))

    if (allDepsMet) {
      return { ...ticket, status: 'in_progress' as const, updatedAt: now }
    }

    if (updatedDeps.length < ticket.dependencies.length) {
      return { ...ticket, updatedAt: now }
    }

    return ticket
  })
}
