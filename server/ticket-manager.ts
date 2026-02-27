import type { Ticket, AgentRole, TicketComplexity, Settings, TicketLevel, Epic, TicketStatus, UserRole, DesignPack, DevPack } from '@/lib/types'
import { TICKET_HIERARCHY, validateTicketHierarchy } from '@/lib/types'
import { randomUUID } from 'node:crypto'
import {
  StatusTransitionEngine,
  getTransitionEngine,
  type Actor,
  type TransitionContext,
  type TransitionValidationResult,
  type TransitionExecutionResult,
  type StatusTransitionRule,
} from './status-transitions'

/** Parent level required for each ticket level in the full hierarchy */
const PARENT_LEVEL: Record<Exclude<TicketLevel, 'feature'>, TicketLevel> = {
  epic: 'feature',
  story: 'epic',
  task: 'story',
  subtask: 'task',
  subatomic: 'subtask',
}

/** Ticket hierarchy node for tree representation */
export interface TicketHierarchyNode {
  ticket: Ticket
  children: TicketHierarchyNode[]
  depth: number
  path: string[]
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
  private transitionEngine: StatusTransitionEngine
  private designPacks: Map<string, DesignPack> = new Map()
  private devPacks: Map<string, DevPack> = new Map()
  private testResults: Map<string, { passed: boolean; output: string }> = new Map()
  private codeReviews: Map<string, { approved: boolean; reviewer: string }> = new Map()

  constructor() {
    this.transitionEngine = getTransitionEngine()
  }

  setUpdateCallback(cb: (ticket: Ticket) => void): void {
    this.onTicketUpdate = cb
  }

  getTransitionEngine(): StatusTransitionEngine {
    return this.transitionEngine
  }

  setDesignPack(ticketId: string, pack: DesignPack): void {
    this.designPacks.set(ticketId, pack)
  }

  setDevPack(ticketId: string, pack: DevPack): void {
    this.devPacks.set(ticketId, pack)
  }

  setTestResult(ticketId: string, result: { passed: boolean; output: string }): void {
    this.testResults.set(ticketId, result)
  }

  setCodeReview(ticketId: string, review: { approved: boolean; reviewer: string }): void {
    this.codeReviews.set(ticketId, review)
  }

  private getTransitionContext(): TransitionContext {
    return {
      allTickets: this.getAllTickets(),
      designPacks: this.designPacks,
      devPacks: this.devPacks,
      testResults: this.testResults,
      codeReviews: this.codeReviews,
    }
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
    storyId?: string
    featureId?: string
  }): Ticket {
    const level = options.level
    const parentId = options.parentId
    const epicId = options.epicId
    const storyId = options.storyId
    const featureId = options.featureId

    if (level) {
      if (level === 'feature') {
        // Feature is top-level, no parent required
      } else if (level === 'epic') {
        if (!featureId) {
          throw new Error(`createTicket: featureId is required when level is epic`)
        }
      } else if (level === 'story') {
        if (!epicId) {
          throw new Error(`createTicket: epicId is required when level is story`)
        }
      } else if (level === 'task') {
        if (!storyId) {
          throw new Error(`createTicket: storyId is required when level is task`)
        }
      } else {
        // subtask, subatomic - require parentId
        if (!parentId) {
          throw new Error(`createTicket: parentId is required when level is ${level}`)
        }
        const parent = this.tickets.get(parentId)
        if (!parent) {
          throw new Error(`createTicket: parent ticket ${parentId} not found`)
        }
        if (parent.level) {
          const validation = validateTicketHierarchy(parent.level, level)
          if (!validation.valid) {
            throw new Error(`createTicket: ${validation.error}`)
          }
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
      level,
      parentId,
      epicId,
      storyId,
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

  /* ── Status Transition Methods ─────────────────────────────────── */

  validateStatusTransition(
    ticketId: string,
    toStatus: TicketStatus,
    actor: Actor
  ): TransitionValidationResult {
    const ticket = this.tickets.get(ticketId)
    if (!ticket) {
      return {
        valid: false,
        errors: [`Ticket ${ticketId} not found`],
        warnings: [],
        missingFields: [],
        blockedByStatuses: [],
      }
    }

    return this.transitionEngine.validateTransition(
      ticket,
      toStatus,
      actor,
      this.getTransitionContext()
    )
  }

  executeStatusTransition(
    ticketId: string,
    toStatus: TicketStatus,
    actor: Actor
  ): TransitionExecutionResult {
    const ticket = this.tickets.get(ticketId)
    if (!ticket) {
      return {
        success: false,
        ticket: {} as Ticket,
        actionsExecuted: [],
        errors: [`Ticket ${ticketId} not found`],
      }
    }

    const result = this.transitionEngine.executeTransition(
      ticket,
      toStatus,
      actor,
      this.getTransitionContext(),
      (updatedTicket) => {
        this.tickets.set(updatedTicket.id, updatedTicket)
        this.onTicketUpdate?.(updatedTicket)
      }
    )

    if (result.success) {
      // Handle side effects based on status
      if (toStatus === 'done') {
        this.unblockDependents(ticketId)
      } else if (toStatus === 'rejected') {
        this.blockDependents(ticketId)
      }
    }

    return result
  }

  getAvailableTransitions(
    ticketId: string,
    actor: Actor
  ): Array<{ rule: StatusTransitionRule; validation: TransitionValidationResult }> {
    const ticket = this.tickets.get(ticketId)
    if (!ticket) return []

    return this.transitionEngine.getAvailableTransitions(
      ticket,
      actor,
      this.getTransitionContext()
    )
  }

  getBlockingReasons(
    ticketId: string,
    toStatus: TicketStatus,
    actor: Actor
  ): string[] {
    const ticket = this.tickets.get(ticketId)
    if (!ticket) return [`Ticket ${ticketId} not found`]

    return this.transitionEngine.getBlockingReasons(
      ticket,
      toStatus,
      actor,
      this.getTransitionContext()
    )
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
    return Array.from(this.tickets.values()).filter((ticket) => {
      if (ticket.status !== 'backlog') return false
      return ticket.dependencies.every((depId: string) => {
        const dep = this.tickets.get(depId)
        return dep !== undefined && dep.status === 'done'
      })
    })
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

  /**
   * Get the full hierarchy tree for a ticket.
   * Returns the ticket and all its descendants organized as a tree.
   */
  getTicketHierarchy(ticketId: string): TicketHierarchyNode | null {
    const ticket = this.tickets.get(ticketId)
    if (!ticket) return null

    const buildNode = (t: Ticket, depth: number, path: string[]): TicketHierarchyNode => {
      const children = this.getChildTickets(t.id)
      const currentPath = [...path, t.id]
      
      return {
        ticket: t,
        depth,
        path: currentPath,
        children: children.map((child) => buildNode(child, depth + 1, currentPath)),
      }
    }

    return buildNode(ticket, 0, [])
  }

  /**
   * Get all direct children of a ticket based on parentId.
   */
  getChildTickets(parentId: string): Ticket[] {
    return Array.from(this.tickets.values()).filter((t) => t.parentId === parentId)
  }

  /**
   * Get all ancestors of a ticket (parent, grandparent, etc.)
   */
  getTicketAncestors(ticketId: string): Ticket[] {
    const ancestors: Ticket[] = []
    let current = this.tickets.get(ticketId)
    
    while (current?.parentId) {
      const parent = this.tickets.get(current.parentId)
      if (!parent) break
      ancestors.push(parent)
      current = parent
    }
    
    return ancestors
  }

  /**
   * Get all descendants of a ticket (children, grandchildren, etc.)
   */
  getTicketDescendants(ticketId: string): Ticket[] {
    const descendants: Ticket[] = []
    const queue = this.getChildTickets(ticketId)
    
    while (queue.length > 0) {
      const current = queue.shift()!
      descendants.push(current)
      queue.push(...this.getChildTickets(current.id))
    }
    
    return descendants
  }

  /**
   * Validate that a ticket can be moved to a new parent.
   */
  validateMove(ticketId: string, newParentId: string): { valid: boolean; error?: string } {
    const ticket = this.tickets.get(ticketId)
    if (!ticket) {
      return { valid: false, error: `Ticket ${ticketId} not found` }
    }

    const newParent = this.tickets.get(newParentId)
    if (!newParent) {
      return { valid: false, error: `New parent ${newParentId} not found` }
    }

    if (!ticket.level || !newParent.level) {
      return { valid: false, error: 'Both tickets must have a level defined' }
    }

    const hierarchyValidation = validateTicketHierarchy(newParent.level, ticket.level)
    if (!hierarchyValidation.valid) {
      return hierarchyValidation
    }

    // Check for circular reference
    const descendants = this.getTicketDescendants(ticketId)
    if (descendants.some((d) => d.id === newParentId)) {
      return { valid: false, error: 'Cannot move ticket to its own descendant' }
    }

    return { valid: true }
  }

  /**
   * Move a ticket to a new parent.
   */
  moveTicket(ticketId: string, newParentId: string): Ticket | null {
    const validation = this.validateMove(ticketId, newParentId)
    if (!validation.valid) {
      throw new Error(`moveTicket: ${validation.error}`)
    }

    return this.updateTicket(ticketId, { parentId: newParentId })
  }

  /**
   * Get tickets by level.
   */
  getTicketsByLevel(level: TicketLevel): Ticket[] {
    return Array.from(this.tickets.values()).filter((t) => t.level === level)
  }

  /**
   * Get the root tickets (features or tickets without parents).
   */
  getRootTickets(): Ticket[] {
    return Array.from(this.tickets.values()).filter(
      (t) => !t.parentId && (t.level === 'feature' || !t.level)
    )
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
