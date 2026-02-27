import { randomUUID } from 'node:crypto'
import type { UserRole } from '@/lib/types'

/* ── Workflow State Types ─────────────────────────────────────────── */

export type WorkflowStateType = 'start' | 'intermediate' | 'end'

export interface WorkflowState {
  id: string
  name: string
  type: WorkflowStateType
  onEnter?: WorkflowAction[]
  onExit?: WorkflowAction[]
  allowedTransitions: string[]
}

/* ── Workflow Action Types ────────────────────────────────────────── */

export type WorkflowActionType =
  | 'notify'
  | 'log'
  | 'update-field'
  | 'trigger-webhook'
  | 'assign-role'
  | 'custom'

export interface WorkflowAction {
  type: WorkflowActionType
  payload: Record<string, unknown>
  handler?: (context: WorkflowContext, instance: WorkflowInstance) => Promise<void>
}

/* ── Workflow Condition Types ─────────────────────────────────────── */

export type WorkflowConditionType =
  | 'field-equals'
  | 'field-not-empty'
  | 'has-role'
  | 'time-elapsed'
  | 'custom'

export interface WorkflowCondition {
  type: WorkflowConditionType
  payload: Record<string, unknown>
  evaluate?: (context: WorkflowContext, instance: WorkflowInstance) => boolean
}

/* ── Workflow Transition Types ────────────────────────────────────── */

export interface WorkflowTransition {
  id: string
  from: string
  to: string
  conditions: WorkflowCondition[]
  actions: WorkflowAction[]
  requiresApproval: boolean
  approverRoles: UserRole[]
}

/* ── Workflow Definition Types ────────────────────────────────────── */

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  version: number
  states: WorkflowState[]
  transitions: WorkflowTransition[]
  initialState: string
  createdAt: number
  updatedAt: number
}

/* ── Workflow Context ─────────────────────────────────────────────── */

export interface WorkflowContext {
  entityId: string
  entityType: string
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}

/* ── Workflow History Entry ───────────────────────────────────────── */

export interface WorkflowHistoryEntry {
  id: string
  fromState: string
  toState: string
  transitionId: string
  actor: WorkflowActor
  timestamp: number
  comment?: string
  approved?: boolean
  approvedBy?: WorkflowActor
  approvedAt?: number
}

/* ── Workflow Actor ───────────────────────────────────────────────── */

export interface WorkflowActor {
  id: string
  name: string
  role: UserRole
  email?: string
}

/* ── Workflow Instance Types ──────────────────────────────────────── */

export type WorkflowInstanceStatus = 'active' | 'completed' | 'suspended' | 'cancelled'

export interface WorkflowInstance {
  id: string
  workflowId: string
  workflowVersion: number
  currentState: string
  previousState?: string
  status: WorkflowInstanceStatus
  history: WorkflowHistoryEntry[]
  context: WorkflowContext
  pendingApproval?: {
    transitionId: string
    requestedBy: WorkflowActor
    requestedAt: number
    approverRoles: UserRole[]
  }
  createdAt: number
  updatedAt: number
}

/* ── Workflow Validation Result ───────────────────────────────────── */

export interface WorkflowValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/* ── Available Transition ─────────────────────────────────────────── */

export interface AvailableTransition {
  transition: WorkflowTransition
  targetState: WorkflowState
  conditionsMet: boolean
  failedConditions: string[]
  requiresApproval: boolean
  canApprove: boolean
}

/* ── Workflow Engine ──────────────────────────────────────────────── */

export class WorkflowEngine {
  private workflows: Map<string, WorkflowDefinition> = new Map()
  private instances: Map<string, WorkflowInstance> = new Map()
  private onInstanceUpdate: ((instance: WorkflowInstance) => void) | null = null

  setUpdateCallback(cb: (instance: WorkflowInstance) => void): void {
    this.onInstanceUpdate = cb
  }

  registerWorkflow(workflow: WorkflowDefinition): void {
    const validation = this.validateWorkflowDefinition(workflow)
    if (!validation.valid) {
      throw new Error(`Invalid workflow definition: ${validation.errors.join(', ')}`)
    }
    this.workflows.set(workflow.id, workflow)
  }

  getWorkflow(workflowId: string): WorkflowDefinition | null {
    return this.workflows.get(workflowId) ?? null
  }

  getAllWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values())
  }

  createInstance(workflowId: string, context: WorkflowContext): WorkflowInstance {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    const initialState = workflow.states.find((s) => s.id === workflow.initialState)
    if (!initialState) {
      throw new Error(`Initial state ${workflow.initialState} not found in workflow`)
    }

    const now = Date.now()
    const instance: WorkflowInstance = {
      id: randomUUID(),
      workflowId,
      workflowVersion: workflow.version,
      currentState: workflow.initialState,
      status: 'active',
      history: [],
      context,
      createdAt: now,
      updatedAt: now,
    }

    this.instances.set(instance.id, instance)

    this.executeActions(initialState.onEnter ?? [], context, instance).catch(() => {
      // Log but don't fail instance creation
    })

    this.onInstanceUpdate?.(instance)
    return instance
  }

  getInstance(instanceId: string): WorkflowInstance | null {
    return this.instances.get(instanceId) ?? null
  }

  getAllInstances(): WorkflowInstance[] {
    return Array.from(this.instances.values())
  }

  getInstancesByWorkflow(workflowId: string): WorkflowInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.workflowId === workflowId)
  }

  getInstancesByStatus(status: WorkflowInstanceStatus): WorkflowInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.status === status)
  }

  async transition(
    instanceId: string,
    targetState: string,
    actor: WorkflowActor,
    comment?: string
  ): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`Workflow instance ${instanceId} not found`)
    }

    if (instance.status !== 'active') {
      throw new Error(`Cannot transition instance in ${instance.status} status`)
    }

    const workflow = this.workflows.get(instance.workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${instance.workflowId} not found`)
    }

    const validation = this.validateTransition(instanceId, targetState, actor)
    if (!validation.valid) {
      throw new Error(`Invalid transition: ${validation.errors.join(', ')}`)
    }

    const transition = this.findTransition(workflow, instance.currentState, targetState)
    if (!transition) {
      throw new Error(`No transition found from ${instance.currentState} to ${targetState}`)
    }

    if (transition.requiresApproval && !this.canApprove(actor, transition.approverRoles)) {
      instance.pendingApproval = {
        transitionId: transition.id,
        requestedBy: actor,
        requestedAt: Date.now(),
        approverRoles: transition.approverRoles,
      }
      instance.updatedAt = Date.now()
      this.instances.set(instanceId, instance)
      this.onInstanceUpdate?.(instance)
      return instance
    }

    return this.executeTransition(instance, workflow, transition, actor, comment)
  }

  async approveTransition(
    instanceId: string,
    approver: WorkflowActor,
    approved: boolean,
    comment?: string
  ): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`Workflow instance ${instanceId} not found`)
    }

    if (!instance.pendingApproval) {
      throw new Error('No pending approval for this instance')
    }

    if (!this.canApprove(approver, instance.pendingApproval.approverRoles)) {
      throw new Error(`User ${approver.id} does not have approval rights`)
    }

    const workflow = this.workflows.get(instance.workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${instance.workflowId} not found`)
    }

    const transition = workflow.transitions.find(
      (t) => t.id === instance.pendingApproval?.transitionId
    )
    if (!transition) {
      throw new Error('Pending transition not found')
    }

    if (!approved) {
      const historyEntry: WorkflowHistoryEntry = {
        id: randomUUID(),
        fromState: instance.currentState,
        toState: instance.currentState,
        transitionId: transition.id,
        actor: instance.pendingApproval.requestedBy,
        timestamp: Date.now(),
        comment,
        approved: false,
        approvedBy: approver,
        approvedAt: Date.now(),
      }

      instance.history.push(historyEntry)
      instance.pendingApproval = undefined
      instance.updatedAt = Date.now()
      this.instances.set(instanceId, instance)
      this.onInstanceUpdate?.(instance)
      return instance
    }

    return this.executeTransition(
      instance,
      workflow,
      transition,
      instance.pendingApproval.requestedBy,
      comment,
      approver
    )
  }

  getAvailableTransitions(instanceId: string, actor?: WorkflowActor): AvailableTransition[] {
    const instance = this.instances.get(instanceId)
    if (!instance || instance.status !== 'active') {
      return []
    }

    const workflow = this.workflows.get(instance.workflowId)
    if (!workflow) {
      return []
    }

    const currentState = workflow.states.find((s) => s.id === instance.currentState)
    if (!currentState) {
      return []
    }

    const available: AvailableTransition[] = []

    for (const transitionId of currentState.allowedTransitions) {
      const transition = workflow.transitions.find(
        (t) => t.id === transitionId || (t.from === instance.currentState && t.to === transitionId)
      )
      if (!transition) continue

      const targetState = workflow.states.find((s) => s.id === transition.to)
      if (!targetState) continue

      const failedConditions: string[] = []
      let conditionsMet = true

      for (const condition of transition.conditions) {
        if (!this.evaluateCondition(condition, instance.context, instance)) {
          conditionsMet = false
          failedConditions.push(this.describeCondition(condition))
        }
      }

      available.push({
        transition,
        targetState,
        conditionsMet,
        failedConditions,
        requiresApproval: transition.requiresApproval,
        canApprove: actor ? this.canApprove(actor, transition.approverRoles) : false,
      })
    }

    return available
  }

  validateTransition(
    instanceId: string,
    targetState: string,
    actor?: WorkflowActor
  ): WorkflowValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    const instance = this.instances.get(instanceId)
    if (!instance) {
      return { valid: false, errors: ['Instance not found'], warnings: [] }
    }

    if (instance.status !== 'active') {
      return { valid: false, errors: [`Instance is ${instance.status}`], warnings: [] }
    }

    const workflow = this.workflows.get(instance.workflowId)
    if (!workflow) {
      return { valid: false, errors: ['Workflow not found'], warnings: [] }
    }

    const currentState = workflow.states.find((s) => s.id === instance.currentState)
    if (!currentState) {
      return { valid: false, errors: ['Current state not found'], warnings: [] }
    }

    const transition = this.findTransition(workflow, instance.currentState, targetState)
    if (!transition) {
      errors.push(`No transition from ${instance.currentState} to ${targetState}`)
      return { valid: false, errors, warnings }
    }

    if (!currentState.allowedTransitions.includes(targetState) &&
        !currentState.allowedTransitions.includes(transition.id)) {
      errors.push(`Transition to ${targetState} not allowed from ${instance.currentState}`)
    }

    for (const condition of transition.conditions) {
      if (!this.evaluateCondition(condition, instance.context, instance)) {
        errors.push(`Condition not met: ${this.describeCondition(condition)}`)
      }
    }

    if (transition.requiresApproval && actor) {
      if (!this.canApprove(actor, transition.approverRoles)) {
        warnings.push('This transition requires approval from an authorized user')
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  suspendInstance(instanceId: string): WorkflowInstance {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`)
    }

    instance.status = 'suspended'
    instance.updatedAt = Date.now()
    this.instances.set(instanceId, instance)
    this.onInstanceUpdate?.(instance)
    return instance
  }

  resumeInstance(instanceId: string): WorkflowInstance {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`)
    }

    if (instance.status !== 'suspended') {
      throw new Error(`Instance is not suspended`)
    }

    instance.status = 'active'
    instance.updatedAt = Date.now()
    this.instances.set(instanceId, instance)
    this.onInstanceUpdate?.(instance)
    return instance
  }

  cancelInstance(instanceId: string): WorkflowInstance {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`)
    }

    instance.status = 'cancelled'
    instance.updatedAt = Date.now()
    this.instances.set(instanceId, instance)
    this.onInstanceUpdate?.(instance)
    return instance
  }

  updateContext(instanceId: string, data: Record<string, unknown>): WorkflowInstance {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`)
    }

    instance.context.data = { ...instance.context.data, ...data }
    instance.updatedAt = Date.now()
    this.instances.set(instanceId, instance)
    this.onInstanceUpdate?.(instance)
    return instance
  }

  private async executeTransition(
    instance: WorkflowInstance,
    workflow: WorkflowDefinition,
    transition: WorkflowTransition,
    actor: WorkflowActor,
    comment?: string,
    approver?: WorkflowActor
  ): Promise<WorkflowInstance> {
    const fromState = workflow.states.find((s) => s.id === instance.currentState)
    const toState = workflow.states.find((s) => s.id === transition.to)

    if (!toState) {
      throw new Error(`Target state ${transition.to} not found`)
    }

    if (fromState?.onExit) {
      await this.executeActions(fromState.onExit, instance.context, instance)
    }

    await this.executeActions(transition.actions, instance.context, instance)

    const historyEntry: WorkflowHistoryEntry = {
      id: randomUUID(),
      fromState: instance.currentState,
      toState: transition.to,
      transitionId: transition.id,
      actor,
      timestamp: Date.now(),
      comment,
      approved: transition.requiresApproval ? true : undefined,
      approvedBy: approver,
      approvedAt: approver ? Date.now() : undefined,
    }

    instance.previousState = instance.currentState
    instance.currentState = transition.to
    instance.history.push(historyEntry)
    instance.pendingApproval = undefined
    instance.updatedAt = Date.now()

    if (toState.type === 'end') {
      instance.status = 'completed'
    }

    if (toState.onEnter) {
      await this.executeActions(toState.onEnter, instance.context, instance)
    }

    this.instances.set(instance.id, instance)
    this.onInstanceUpdate?.(instance)
    return instance
  }

  private async executeActions(
    actions: WorkflowAction[],
    context: WorkflowContext,
    instance: WorkflowInstance
  ): Promise<void> {
    for (const action of actions) {
      try {
        if (action.handler) {
          await action.handler(context, instance)
        } else {
          await this.executeBuiltInAction(action, context, instance)
        }
      } catch {
        // Log but don't fail the transition
      }
    }
  }

  private async executeBuiltInAction(
    action: WorkflowAction,
    context: WorkflowContext,
    _instance: WorkflowInstance
  ): Promise<void> {
    switch (action.type) {
      case 'update-field':
        if (action.payload.field && action.payload.value !== undefined) {
          context.data[action.payload.field as string] = action.payload.value
        }
        break
      case 'log':
        console.log(`[Workflow] ${action.payload.message ?? 'Action executed'}`)
        break
      case 'notify':
      case 'trigger-webhook':
      case 'assign-role':
      case 'custom':
        break
    }
  }

  private evaluateCondition(
    condition: WorkflowCondition,
    context: WorkflowContext,
    instance: WorkflowInstance
  ): boolean {
    if (condition.evaluate) {
      return condition.evaluate(context, instance)
    }

    switch (condition.type) {
      case 'field-equals':
        return context.data[condition.payload.field as string] === condition.payload.value
      case 'field-not-empty': {
        const value = context.data[condition.payload.field as string]
        return value !== undefined && value !== null && value !== ''
      }
      case 'has-role':
        return true
      case 'time-elapsed': {
        const elapsed = Date.now() - instance.createdAt
        const required = (condition.payload.milliseconds as number) ?? 0
        return elapsed >= required
      }
      case 'custom':
        return true
      default:
        return true
    }
  }

  private describeCondition(condition: WorkflowCondition): string {
    switch (condition.type) {
      case 'field-equals':
        return `${condition.payload.field} must equal ${condition.payload.value}`
      case 'field-not-empty':
        return `${condition.payload.field} must not be empty`
      case 'has-role':
        return `User must have role ${condition.payload.role}`
      case 'time-elapsed':
        return `${condition.payload.milliseconds}ms must have elapsed`
      case 'custom':
        return condition.payload.description as string ?? 'Custom condition'
      default:
        return 'Unknown condition'
    }
  }

  private findTransition(
    workflow: WorkflowDefinition,
    from: string,
    to: string
  ): WorkflowTransition | null {
    return workflow.transitions.find((t) => t.from === from && t.to === to) ?? null
  }

  private canApprove(actor: WorkflowActor, approverRoles: UserRole[]): boolean {
    if (approverRoles.length === 0) return true
    return approverRoles.includes(actor.role)
  }

  private validateWorkflowDefinition(workflow: WorkflowDefinition): WorkflowValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!workflow.id) errors.push('Workflow must have an id')
    if (!workflow.name) errors.push('Workflow must have a name')
    if (!workflow.states || workflow.states.length === 0) {
      errors.push('Workflow must have at least one state')
    }
    if (!workflow.initialState) errors.push('Workflow must have an initial state')

    const stateIds = new Set(workflow.states.map((s) => s.id))

    if (!stateIds.has(workflow.initialState)) {
      errors.push(`Initial state ${workflow.initialState} not found in states`)
    }

    const startStates = workflow.states.filter((s) => s.type === 'start')
    if (startStates.length === 0) {
      warnings.push('Workflow has no start state')
    }

    const endStates = workflow.states.filter((s) => s.type === 'end')
    if (endStates.length === 0) {
      warnings.push('Workflow has no end state')
    }

    for (const transition of workflow.transitions) {
      if (!stateIds.has(transition.from)) {
        errors.push(`Transition ${transition.id} references unknown from state: ${transition.from}`)
      }
      if (!stateIds.has(transition.to)) {
        errors.push(`Transition ${transition.id} references unknown to state: ${transition.to}`)
      }
    }

    for (const state of workflow.states) {
      for (const allowed of state.allowedTransitions) {
        const hasTransition = workflow.transitions.some(
          (t) => t.id === allowed || (t.from === state.id && t.to === allowed)
        )
        if (!hasTransition && !stateIds.has(allowed)) {
          warnings.push(`State ${state.id} allows transition to unknown state/transition: ${allowed}`)
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  reset(): void {
    this.instances.clear()
  }

  clearWorkflows(): void {
    this.workflows.clear()
    this.instances.clear()
  }
}

/* ── Pre-built Workflow Definitions ───────────────────────────────── */

export const TicketWorkflow: WorkflowDefinition = {
  id: 'ticket-workflow',
  name: 'Ticket Workflow',
  description: 'Standard ticket lifecycle from backlog to completion',
  version: 1,
  initialState: 'backlog',
  states: [
    {
      id: 'backlog',
      name: 'Backlog',
      type: 'start',
      allowedTransitions: ['in_progress'],
      onEnter: [{ type: 'log', payload: { message: 'Ticket added to backlog' } }],
    },
    {
      id: 'in_progress',
      name: 'In Progress',
      type: 'intermediate',
      allowedTransitions: ['review', 'backlog'],
      onEnter: [{ type: 'update-field', payload: { field: 'startedAt', value: Date.now() } }],
    },
    {
      id: 'review',
      name: 'Review',
      type: 'intermediate',
      allowedTransitions: ['approved', 'in_progress'],
    },
    {
      id: 'approved',
      name: 'Approved',
      type: 'intermediate',
      allowedTransitions: ['done', 'in_progress'],
    },
    {
      id: 'done',
      name: 'Done',
      type: 'end',
      allowedTransitions: [],
      onEnter: [{ type: 'update-field', payload: { field: 'completedAt', value: Date.now() } }],
    },
  ],
  transitions: [
    {
      id: 'start-work',
      from: 'backlog',
      to: 'in_progress',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Work started on ticket' } }],
      requiresApproval: false,
      approverRoles: [],
    },
    {
      id: 'submit-review',
      from: 'in_progress',
      to: 'review',
      conditions: [{ type: 'field-not-empty', payload: { field: 'output' } }],
      actions: [{ type: 'notify', payload: { message: 'Ticket ready for review' } }],
      requiresApproval: false,
      approverRoles: [],
    },
    {
      id: 'return-to-progress',
      from: 'review',
      to: 'in_progress',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Ticket returned for rework' } }],
      requiresApproval: false,
      approverRoles: [],
    },
    {
      id: 'approve-ticket',
      from: 'review',
      to: 'approved',
      conditions: [],
      actions: [{ type: 'notify', payload: { message: 'Ticket approved' } }],
      requiresApproval: true,
      approverRoles: ['admin', 'editor'],
    },
    {
      id: 'complete-ticket',
      from: 'approved',
      to: 'done',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Ticket completed' } }],
      requiresApproval: false,
      approverRoles: [],
    },
    {
      id: 'reopen-approved',
      from: 'approved',
      to: 'in_progress',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Ticket reopened from approved' } }],
      requiresApproval: false,
      approverRoles: [],
    },
    {
      id: 'return-to-backlog',
      from: 'in_progress',
      to: 'backlog',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Ticket returned to backlog' } }],
      requiresApproval: false,
      approverRoles: [],
    },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

export const PRDWorkflow: WorkflowDefinition = {
  id: 'prd-workflow',
  name: 'PRD Workflow',
  description: 'Product Requirements Document lifecycle',
  version: 1,
  initialState: 'draft',
  states: [
    {
      id: 'draft',
      name: 'Draft',
      type: 'start',
      allowedTransitions: ['review'],
      onEnter: [{ type: 'log', payload: { message: 'PRD created as draft' } }],
    },
    {
      id: 'review',
      name: 'Review',
      type: 'intermediate',
      allowedTransitions: ['approved', 'draft'],
    },
    {
      id: 'approved',
      name: 'Approved',
      type: 'intermediate',
      allowedTransitions: ['tickets_generated'],
      onEnter: [{ type: 'update-field', payload: { field: 'approvedAt', value: Date.now() } }],
    },
    {
      id: 'tickets_generated',
      name: 'Tickets Generated',
      type: 'end',
      allowedTransitions: [],
      onEnter: [{ type: 'log', payload: { message: 'Tickets generated from PRD' } }],
    },
  ],
  transitions: [
    {
      id: 'submit-prd',
      from: 'draft',
      to: 'review',
      conditions: [
        { type: 'field-not-empty', payload: { field: 'title' } },
        { type: 'field-not-empty', payload: { field: 'content' } },
      ],
      actions: [{ type: 'notify', payload: { message: 'PRD submitted for review' } }],
      requiresApproval: false,
      approverRoles: [],
    },
    {
      id: 'return-draft',
      from: 'review',
      to: 'draft',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'PRD returned for revision' } }],
      requiresApproval: false,
      approverRoles: [],
    },
    {
      id: 'approve-prd',
      from: 'review',
      to: 'approved',
      conditions: [],
      actions: [{ type: 'notify', payload: { message: 'PRD approved' } }],
      requiresApproval: true,
      approverRoles: ['admin'],
    },
    {
      id: 'generate-tickets',
      from: 'approved',
      to: 'tickets_generated',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Generating tickets from PRD' } }],
      requiresApproval: false,
      approverRoles: [],
    },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

export const ApprovalWorkflow: WorkflowDefinition = {
  id: 'approval-workflow',
  name: 'Approval Workflow',
  description: 'Generic approval workflow for any entity',
  version: 1,
  initialState: 'pending',
  states: [
    {
      id: 'pending',
      name: 'Pending',
      type: 'start',
      allowedTransitions: ['approved', 'rejected'],
      onEnter: [{ type: 'notify', payload: { message: 'Approval requested' } }],
    },
    {
      id: 'approved',
      name: 'Approved',
      type: 'end',
      allowedTransitions: [],
      onEnter: [
        { type: 'update-field', payload: { field: 'approvedAt', value: Date.now() } },
        { type: 'notify', payload: { message: 'Request approved' } },
      ],
    },
    {
      id: 'rejected',
      name: 'Rejected',
      type: 'end',
      allowedTransitions: [],
      onEnter: [
        { type: 'update-field', payload: { field: 'rejectedAt', value: Date.now() } },
        { type: 'notify', payload: { message: 'Request rejected' } },
      ],
    },
  ],
  transitions: [
    {
      id: 'approve',
      from: 'pending',
      to: 'approved',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Request approved' } }],
      requiresApproval: true,
      approverRoles: ['admin', 'editor'],
    },
    {
      id: 'reject',
      from: 'pending',
      to: 'rejected',
      conditions: [],
      actions: [{ type: 'log', payload: { message: 'Request rejected' } }],
      requiresApproval: true,
      approverRoles: ['admin', 'editor'],
    },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

/* ── Factory function for creating pre-configured engine ──────────── */

export function createWorkflowEngine(): WorkflowEngine {
  const engine = new WorkflowEngine()
  engine.registerWorkflow(TicketWorkflow)
  engine.registerWorkflow(PRDWorkflow)
  engine.registerWorkflow(ApprovalWorkflow)
  return engine
}

/* ── Singleton instance ───────────────────────────────────────────── */

let workflowEngineInstance: WorkflowEngine | null = null

export function getWorkflowEngine(): WorkflowEngine {
  if (!workflowEngineInstance) {
    workflowEngineInstance = createWorkflowEngine()
  }
  return workflowEngineInstance
}

export function resetWorkflowEngine(): void {
  workflowEngineInstance = null
}
