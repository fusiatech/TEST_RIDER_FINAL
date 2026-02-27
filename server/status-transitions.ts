import type { Ticket, TicketStatus, UserRole, User, DesignPack, DevPack } from '@/lib/types'

/* ── Transition Condition Types ─────────────────────────────────── */

export type TransitionConditionType =
  | { type: 'hasRole'; role: UserRole }
  | { type: 'hasApproval' }
  | { type: 'allDependenciesComplete' }
  | { type: 'allSubtasksComplete' }
  | { type: 'hasDesignPack' }
  | { type: 'hasDevPack' }
  | { type: 'passesTests' }
  | { type: 'hasCodeReview' }
  | { type: 'custom'; fn: (ticket: Ticket, actor: Actor) => boolean; description: string }

export interface TransitionCondition {
  condition: TransitionConditionType
  errorMessage: string
}

/* ── Transition Action Types ────────────────────────────────────── */

export type TransitionActionType =
  | { type: 'notify'; users: string[]; template: string }
  | { type: 'assignTo'; role: UserRole }
  | { type: 'createSubtask'; template: SubtaskTemplate }
  | { type: 'triggerWorkflow'; workflowId: string }
  | { type: 'updateField'; field: keyof Ticket; value: unknown }
  | { type: 'createGitBranch' }
  | { type: 'createPR' }

export interface TransitionAction {
  action: TransitionActionType
  description: string
}

export interface SubtaskTemplate {
  title: string
  description: string
  assignedRole: string
}

/* ── Status Transition Rule ─────────────────────────────────────── */

export interface StatusTransitionRule {
  id: string
  name: string
  fromStatus: TicketStatus
  toStatus: TicketStatus
  conditions: TransitionCondition[]
  requiredFields: (keyof Ticket)[]
  requiredApproval: boolean
  autoActions: TransitionAction[]
  blockedBy: TicketStatus[]
}

/* ── Actor (user performing the transition) ─────────────────────── */

export interface Actor {
  id: string
  email: string
  role: UserRole
  name?: string
}

/* ── Transition Context ─────────────────────────────────────────── */

export interface TransitionContext {
  allTickets: Ticket[]
  designPacks?: Map<string, DesignPack>
  devPacks?: Map<string, DevPack>
  testResults?: Map<string, { passed: boolean; output: string }>
  codeReviews?: Map<string, { approved: boolean; reviewer: string }>
}

/* ── Transition Result ──────────────────────────────────────────── */

export interface TransitionValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  missingFields: (keyof Ticket)[]
  blockedByStatuses: TicketStatus[]
}

export interface TransitionExecutionResult {
  success: boolean
  ticket: Ticket
  actionsExecuted: string[]
  errors: string[]
}

/* ── Condition Helpers ──────────────────────────────────────────── */

export function hasRole(role: UserRole): TransitionConditionType {
  return { type: 'hasRole', role }
}

export function hasApproval(): TransitionConditionType {
  return { type: 'hasApproval' }
}

export function allDependenciesComplete(): TransitionConditionType {
  return { type: 'allDependenciesComplete' }
}

export function allSubtasksComplete(): TransitionConditionType {
  return { type: 'allSubtasksComplete' }
}

export function hasDesignPack(): TransitionConditionType {
  return { type: 'hasDesignPack' }
}

export function hasDevPack(): TransitionConditionType {
  return { type: 'hasDevPack' }
}

export function passesTests(): TransitionConditionType {
  return { type: 'passesTests' }
}

export function hasCodeReview(): TransitionConditionType {
  return { type: 'hasCodeReview' }
}

export function custom(
  fn: (ticket: Ticket, actor: Actor) => boolean,
  description: string
): TransitionConditionType {
  return { type: 'custom', fn, description }
}

/* ── Action Helpers ─────────────────────────────────────────────── */

export function notify(users: string[], template: string): TransitionActionType {
  return { type: 'notify', users, template }
}

export function assignTo(role: UserRole): TransitionActionType {
  return { type: 'assignTo', role }
}

export function createSubtask(template: SubtaskTemplate): TransitionActionType {
  return { type: 'createSubtask', template }
}

export function triggerWorkflow(workflowId: string): TransitionActionType {
  return { type: 'triggerWorkflow', workflowId }
}

export function updateField(field: keyof Ticket, value: unknown): TransitionActionType {
  return { type: 'updateField', field, value }
}

export function createGitBranch(): TransitionActionType {
  return { type: 'createGitBranch' }
}

export function createPR(): TransitionActionType {
  return { type: 'createPR' }
}

/* ── Pre-built Transition Rules ─────────────────────────────────── */

export const DEFAULT_TRANSITION_RULES: StatusTransitionRule[] = [
  {
    id: 'backlog-to-in_progress',
    name: 'Start Work',
    fromStatus: 'backlog',
    toStatus: 'in_progress',
    conditions: [
      {
        condition: { type: 'allDependenciesComplete' },
        errorMessage: 'All dependencies must be completed before starting work',
      },
    ],
    requiredFields: ['assignedRole'],
    requiredApproval: false,
    autoActions: [
      {
        action: { type: 'createGitBranch' },
        description: 'Create feature branch for this ticket',
      },
    ],
    blockedBy: [],
  },
  {
    id: 'in_progress-to-review',
    name: 'Submit for Review',
    fromStatus: 'in_progress',
    toStatus: 'review',
    conditions: [
      {
        condition: custom(
          (ticket) => Boolean(ticket.output || ticket.diff),
          'Has code changes'
        ),
        errorMessage: 'Ticket must have code changes or output before review',
      },
    ],
    requiredFields: [],
    requiredApproval: false,
    autoActions: [
      {
        action: { type: 'createPR' },
        description: 'Create pull request for code review',
      },
      {
        action: { type: 'notify', users: ['reviewers'], template: 'review-requested' },
        description: 'Notify reviewers about pending review',
      },
    ],
    blockedBy: [],
  },
  {
    id: 'review-to-approved',
    name: 'Approve',
    fromStatus: 'review',
    toStatus: 'approved',
    conditions: [
      {
        condition: { type: 'hasRole', role: 'editor' },
        errorMessage: 'Only editors or admins can approve tickets',
      },
      {
        condition: { type: 'hasCodeReview' },
        errorMessage: 'Code review must be completed before approval',
      },
    ],
    requiredFields: [],
    requiredApproval: true,
    autoActions: [
      {
        action: { type: 'notify', users: ['assignee'], template: 'ticket-approved' },
        description: 'Notify assignee that ticket was approved',
      },
    ],
    blockedBy: [],
  },
  {
    id: 'review-to-rejected',
    name: 'Request Changes',
    fromStatus: 'review',
    toStatus: 'rejected',
    conditions: [
      {
        condition: { type: 'hasRole', role: 'editor' },
        errorMessage: 'Only editors or admins can reject tickets',
      },
    ],
    requiredFields: [],
    requiredApproval: false,
    autoActions: [
      {
        action: { type: 'notify', users: ['assignee'], template: 'changes-requested' },
        description: 'Notify assignee about requested changes',
      },
    ],
    blockedBy: [],
  },
  {
    id: 'rejected-to-in_progress',
    name: 'Resume Work',
    fromStatus: 'rejected',
    toStatus: 'in_progress',
    conditions: [],
    requiredFields: [],
    requiredApproval: false,
    autoActions: [],
    blockedBy: [],
  },
  {
    id: 'approved-to-done',
    name: 'Complete',
    fromStatus: 'approved',
    toStatus: 'done',
    conditions: [
      {
        condition: { type: 'allSubtasksComplete' },
        errorMessage: 'All subtasks must be completed before marking as done',
      },
      {
        condition: { type: 'passesTests' },
        errorMessage: 'All tests must pass before completion',
      },
    ],
    requiredFields: [],
    requiredApproval: false,
    autoActions: [
      {
        action: { type: 'notify', users: ['stakeholders'], template: 'ticket-completed' },
        description: 'Notify stakeholders about completion',
      },
    ],
    blockedBy: [],
  },
  {
    id: 'backlog-to-done',
    name: 'Quick Complete',
    fromStatus: 'backlog',
    toStatus: 'done',
    conditions: [
      {
        condition: { type: 'hasRole', role: 'admin' },
        errorMessage: 'Only admins can quick-complete tickets',
      },
    ],
    requiredFields: [],
    requiredApproval: true,
    autoActions: [],
    blockedBy: [],
  },
  {
    id: 'in_progress-to-backlog',
    name: 'Move to Backlog',
    fromStatus: 'in_progress',
    toStatus: 'backlog',
    conditions: [],
    requiredFields: [],
    requiredApproval: false,
    autoActions: [],
    blockedBy: [],
  },
]

/* ── Status Transition Engine ───────────────────────────────────── */

export class StatusTransitionEngine {
  private rules: StatusTransitionRule[]

  constructor(rules: StatusTransitionRule[] = DEFAULT_TRANSITION_RULES) {
    this.rules = rules
  }

  addRule(rule: StatusTransitionRule): void {
    const existingIndex = this.rules.findIndex((r) => r.id === rule.id)
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule
    } else {
      this.rules.push(rule)
    }
  }

  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId)
    if (index >= 0) {
      this.rules.splice(index, 1)
      return true
    }
    return false
  }

  getRules(): StatusTransitionRule[] {
    return [...this.rules]
  }

  getRule(fromStatus: TicketStatus, toStatus: TicketStatus): StatusTransitionRule | null {
    return this.rules.find((r) => r.fromStatus === fromStatus && r.toStatus === toStatus) ?? null
  }

  validateTransition(
    ticket: Ticket,
    toStatus: TicketStatus,
    actor: Actor,
    context: TransitionContext
  ): TransitionValidationResult {
    const result: TransitionValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      missingFields: [],
      blockedByStatuses: [],
    }

    const rule = this.getRule(ticket.status, toStatus)
    if (!rule) {
      result.valid = false
      result.errors.push(`No transition rule found from ${ticket.status} to ${toStatus}`)
      return result
    }

    // Check blocked by statuses
    for (const blockedStatus of rule.blockedBy) {
      const hasBlockingTicket = context.allTickets.some(
        (t) => t.id !== ticket.id && t.status === blockedStatus && ticket.dependencies.includes(t.id)
      )
      if (hasBlockingTicket) {
        result.valid = false
        result.blockedByStatuses.push(blockedStatus)
        result.errors.push(`Transition blocked by tickets in ${blockedStatus} status`)
      }
    }

    // Check required fields
    for (const field of rule.requiredFields) {
      const value = ticket[field]
      if (value === undefined || value === null || value === '') {
        result.valid = false
        result.missingFields.push(field)
        result.errors.push(`Required field "${field}" is missing`)
      }
    }

    // Check conditions
    for (const { condition, errorMessage } of rule.conditions) {
      const conditionMet = this.evaluateCondition(condition, ticket, actor, context)
      if (!conditionMet) {
        result.valid = false
        result.errors.push(errorMessage)
      }
    }

    // Check approval requirement
    if (rule.requiredApproval && !this.hasApprovalPermission(actor)) {
      result.valid = false
      result.errors.push('This transition requires approval from an editor or admin')
    }

    return result
  }

  private evaluateCondition(
    condition: TransitionConditionType,
    ticket: Ticket,
    actor: Actor,
    context: TransitionContext
  ): boolean {
    switch (condition.type) {
      case 'hasRole':
        return this.checkRole(actor.role, condition.role)

      case 'hasApproval':
        return this.checkApproval(ticket)

      case 'allDependenciesComplete':
        return this.checkDependenciesComplete(ticket, context)

      case 'allSubtasksComplete':
        return this.checkSubtasksComplete(ticket, context)

      case 'hasDesignPack':
        return context.designPacks?.has(ticket.id) ?? false

      case 'hasDevPack':
        return context.devPacks?.has(ticket.id) ?? false

      case 'passesTests':
        return this.checkTestsPassing(ticket, context)

      case 'hasCodeReview':
        return this.checkCodeReview(ticket, context)

      case 'custom':
        return condition.fn(ticket, actor)

      default:
        return false
    }
  }

  private checkRole(actorRole: UserRole, requiredRole: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      viewer: 0,
      editor: 1,
      admin: 2,
    }
    return roleHierarchy[actorRole] >= roleHierarchy[requiredRole]
  }

  private checkApproval(ticket: Ticket): boolean {
    const history = ticket.approvalHistory ?? []
    const lastApproval = history[history.length - 1]
    return lastApproval?.action === 'approved'
  }

  private checkDependenciesComplete(ticket: Ticket, context: TransitionContext): boolean {
    if (ticket.dependencies.length === 0) return true
    return ticket.dependencies.every((depId) => {
      const dep = context.allTickets.find((t) => t.id === depId)
      return dep?.status === 'done' || dep?.status === 'approved'
    })
  }

  private checkSubtasksComplete(ticket: Ticket, context: TransitionContext): boolean {
    const subtasks = context.allTickets.filter((t) => t.parentId === ticket.id)
    if (subtasks.length === 0) return true
    return subtasks.every((st) => st.status === 'done')
  }

  private checkTestsPassing(ticket: Ticket, context: TransitionContext): boolean {
    const testResult = context.testResults?.get(ticket.id)
    return testResult?.passed ?? true
  }

  private checkCodeReview(ticket: Ticket, context: TransitionContext): boolean {
    const review = context.codeReviews?.get(ticket.id)
    return review?.approved ?? false
  }

  private hasApprovalPermission(actor: Actor): boolean {
    return actor.role === 'admin' || actor.role === 'editor'
  }

  executeTransition(
    ticket: Ticket,
    toStatus: TicketStatus,
    actor: Actor,
    context: TransitionContext,
    onUpdate: (ticket: Ticket) => void
  ): TransitionExecutionResult {
    const validation = this.validateTransition(ticket, toStatus, actor, context)
    if (!validation.valid) {
      return {
        success: false,
        ticket,
        actionsExecuted: [],
        errors: validation.errors,
      }
    }

    const rule = this.getRule(ticket.status, toStatus)!
    const actionsExecuted: string[] = []
    const errors: string[] = []

    // Update ticket status
    const updatedTicket: Ticket = {
      ...ticket,
      status: toStatus,
      updatedAt: Date.now(),
    }

    // Add approval history if this is an approval action
    if (toStatus === 'approved' || toStatus === 'rejected') {
      const approvalEntry = {
        action: toStatus === 'approved' ? 'approved' as const : 'rejected' as const,
        timestamp: Date.now(),
        user: actor.email,
      }
      updatedTicket.approvalHistory = [...(ticket.approvalHistory ?? []), approvalEntry]
    }

    // Execute auto actions
    for (const { action, description } of rule.autoActions) {
      try {
        this.executeAction(action, updatedTicket, actor, context)
        actionsExecuted.push(description)
      } catch (err) {
        errors.push(`Failed to execute action "${description}": ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    onUpdate(updatedTicket)

    return {
      success: true,
      ticket: updatedTicket,
      actionsExecuted,
      errors,
    }
  }

  private executeAction(
    action: TransitionActionType,
    ticket: Ticket,
    actor: Actor,
    _context: TransitionContext
  ): void {
    switch (action.type) {
      case 'notify':
        console.log(`[Transition] Notify ${action.users.join(', ')} with template: ${action.template}`)
        break

      case 'assignTo':
        console.log(`[Transition] Assign to role: ${action.role}`)
        break

      case 'createSubtask':
        console.log(`[Transition] Create subtask: ${action.template.title}`)
        break

      case 'triggerWorkflow':
        console.log(`[Transition] Trigger workflow: ${action.workflowId}`)
        break

      case 'updateField':
        console.log(`[Transition] Update field ${action.field} to ${action.value}`)
        break

      case 'createGitBranch':
        console.log(`[Transition] Create git branch for ticket: ${ticket.id}`)
        break

      case 'createPR':
        console.log(`[Transition] Create PR for ticket: ${ticket.id}`)
        break
    }
  }

  getAvailableTransitions(
    ticket: Ticket,
    actor: Actor,
    context: TransitionContext
  ): Array<{ rule: StatusTransitionRule; validation: TransitionValidationResult }> {
    const available: Array<{ rule: StatusTransitionRule; validation: TransitionValidationResult }> = []

    for (const rule of this.rules) {
      if (rule.fromStatus !== ticket.status) continue

      const validation = this.validateTransition(ticket, rule.toStatus, actor, context)
      available.push({ rule, validation })
    }

    return available
  }

  getBlockingReasons(
    ticket: Ticket,
    toStatus: TicketStatus,
    actor: Actor,
    context: TransitionContext
  ): string[] {
    const validation = this.validateTransition(ticket, toStatus, actor, context)
    return validation.errors
  }
}

/* ── Singleton instance ─────────────────────────────────────────── */

let transitionEngineInstance: StatusTransitionEngine | null = null

export function getTransitionEngine(): StatusTransitionEngine {
  if (!transitionEngineInstance) {
    transitionEngineInstance = new StatusTransitionEngine()
  }
  return transitionEngineInstance
}

export function resetTransitionEngine(): void {
  transitionEngineInstance = null
}
