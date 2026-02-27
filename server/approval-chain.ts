import type { UserRole } from '@/lib/types'
import { getDb } from '@/server/storage'
import { createLogger } from '@/server/logger'

export {
  EscalationRuleSchema,
  NotificationSettingsSchema,
  ApprovalLevelSchema,
  ApprovalChainSchema,
  ApprovalDecisionSchema,
  ApprovalEntrySchema,
  ApprovalRequestStatusSchema,
  ResourceTypeSchema,
  ApprovalRequestSchema,
  type EscalationRule,
  type NotificationSettings,
  type ApprovalLevel,
  type ApprovalChain,
  type ApprovalDecision,
  type ApprovalEntry,
  type ApprovalRequestStatus,
  type ResourceType,
  type ApprovalRequest,
} from '@/lib/approval-types'

import type {
  ApprovalChain,
  ApprovalRequest,
  ApprovalEntry,
  ApprovalLevel,
  ResourceType,
} from '@/lib/approval-types'

const logger = createLogger('approval-chain')

/* ── Pre-built Approval Chains ─────────────────────────────────────── */

export const TICKET_APPROVAL_CHAIN: Omit<ApprovalChain, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Ticket Approval',
  description: 'Single-level approval for tickets',
  levels: [
    {
      order: 1,
      name: 'Tech Lead',
      approverRoles: ['admin', 'editor'] as UserRole[],
      approverUserIds: [],
      requiredApprovals: 1,
      timeoutHours: 24,
    },
  ],
  notificationSettings: {
    notifyOnCreate: true,
    notifyOnApprove: true,
    notifyOnReject: true,
    notifyOnEscalate: true,
    emailEnabled: false,
    slackEnabled: false,
  },
}

export const PRD_APPROVAL_CHAIN: Omit<ApprovalChain, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'PRD Approval',
  description: 'Two-level approval: Tech Lead → PM',
  levels: [
    {
      order: 1,
      name: 'Tech Lead',
      approverRoles: ['admin', 'editor'] as UserRole[],
      approverUserIds: [],
      requiredApprovals: 1,
      timeoutHours: 48,
      escalateTo: 'next_level',
    },
    {
      order: 2,
      name: 'Product Manager',
      approverRoles: ['admin'] as UserRole[],
      approverUserIds: [],
      requiredApprovals: 1,
      timeoutHours: 72,
      escalateTo: 'admin',
    },
  ],
  escalationRules: [
    {
      triggerAfterHours: 72,
      escalateTo: 'admin',
      notifyOnEscalation: true,
    },
  ],
  notificationSettings: {
    notifyOnCreate: true,
    notifyOnApprove: true,
    notifyOnReject: true,
    notifyOnEscalate: true,
    emailEnabled: false,
    slackEnabled: false,
  },
}

export const RELEASE_APPROVAL_CHAIN: Omit<ApprovalChain, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Release Approval',
  description: 'Four-level approval: QA → Tech Lead → PM → Director',
  levels: [
    {
      order: 1,
      name: 'QA Lead',
      approverRoles: ['editor'] as UserRole[],
      approverUserIds: [],
      requiredApprovals: 1,
      timeoutHours: 24,
      escalateTo: 'next_level',
    },
    {
      order: 2,
      name: 'Tech Lead',
      approverRoles: ['admin', 'editor'] as UserRole[],
      approverUserIds: [],
      requiredApprovals: 1,
      timeoutHours: 24,
      escalateTo: 'next_level',
    },
    {
      order: 3,
      name: 'Product Manager',
      approverRoles: ['admin'] as UserRole[],
      approverUserIds: [],
      requiredApprovals: 1,
      timeoutHours: 48,
      escalateTo: 'next_level',
    },
    {
      order: 4,
      name: 'Director',
      approverRoles: ['admin'] as UserRole[],
      approverUserIds: [],
      requiredApprovals: 1,
      timeoutHours: 72,
      escalateTo: 'admin',
    },
  ],
  escalationRules: [
    {
      triggerAfterHours: 96,
      escalateTo: 'admin',
      notifyOnEscalation: true,
    },
  ],
  notificationSettings: {
    notifyOnCreate: true,
    notifyOnApprove: true,
    notifyOnReject: true,
    notifyOnEscalate: true,
    emailEnabled: false,
    slackEnabled: false,
  },
}

/* ── Approval Chain Engine ─────────────────────────────────────────── */

export class ApprovalChainEngine {
  private chains: Map<string, ApprovalChain> = new Map()
  private requests: Map<string, ApprovalRequest> = new Map()
  private timeoutCheckerInterval: NodeJS.Timeout | null = null

  constructor() {
    this.initializeDefaultChains()
  }

  private initializeDefaultChains(): void {
    const now = Date.now()
    
    const ticketChain: ApprovalChain = {
      ...TICKET_APPROVAL_CHAIN,
      id: 'ticket-approval',
      createdAt: now,
      updatedAt: now,
    }
    
    const prdChain: ApprovalChain = {
      ...PRD_APPROVAL_CHAIN,
      id: 'prd-approval',
      createdAt: now,
      updatedAt: now,
    }
    
    const releaseChain: ApprovalChain = {
      ...RELEASE_APPROVAL_CHAIN,
      id: 'release-approval',
      createdAt: now,
      updatedAt: now,
    }

    this.chains.set(ticketChain.id, ticketChain)
    this.chains.set(prdChain.id, prdChain)
    this.chains.set(releaseChain.id, releaseChain)
  }

  async loadFromStorage(): Promise<void> {
    try {
      const db = await getDb()
      const data = db.data as { approvalChains?: ApprovalChain[]; approvalRequests?: ApprovalRequest[] }
      
      if (data.approvalChains) {
        for (const chain of data.approvalChains) {
          this.chains.set(chain.id, chain)
        }
      }
      
      if (data.approvalRequests) {
        for (const request of data.approvalRequests) {
          this.requests.set(request.id, request)
        }
      }
      
      logger.info('Loaded approval chains from storage', {
        chains: this.chains.size,
        requests: this.requests.size,
      })
    } catch (error) {
      logger.error('Failed to load approval chains from storage', { error })
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      const db = await getDb()
      const data = db.data as { approvalChains?: ApprovalChain[]; approvalRequests?: ApprovalRequest[] }
      
      data.approvalChains = Array.from(this.chains.values())
      data.approvalRequests = Array.from(this.requests.values())
      
      await db.write()
    } catch (error) {
      logger.error('Failed to save approval chains to storage', { error })
    }
  }

  getChain(chainId: string): ApprovalChain | undefined {
    return this.chains.get(chainId)
  }

  getAllChains(): ApprovalChain[] {
    return Array.from(this.chains.values())
  }

  async createChain(chain: Omit<ApprovalChain, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApprovalChain> {
    const now = Date.now()
    const newChain: ApprovalChain = {
      ...chain,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    
    this.chains.set(newChain.id, newChain)
    await this.saveToStorage()
    
    logger.info('Created approval chain', { chainId: newChain.id, name: newChain.name })
    return newChain
  }

  async updateChain(chainId: string, updates: Partial<Omit<ApprovalChain, 'id' | 'createdAt'>>): Promise<ApprovalChain | null> {
    const chain = this.chains.get(chainId)
    if (!chain) return null

    const updatedChain: ApprovalChain = {
      ...chain,
      ...updates,
      id: chain.id,
      createdAt: chain.createdAt,
      updatedAt: Date.now(),
    }
    
    this.chains.set(chainId, updatedChain)
    await this.saveToStorage()
    
    logger.info('Updated approval chain', { chainId })
    return updatedChain
  }

  async deleteChain(chainId: string): Promise<boolean> {
    const deleted = this.chains.delete(chainId)
    if (deleted) {
      await this.saveToStorage()
      logger.info('Deleted approval chain', { chainId })
    }
    return deleted
  }

  async createRequest(
    chainId: string,
    resourceType: ResourceType,
    resourceId: string,
    requestedBy: string,
    options?: {
      resourceName?: string
      requestedByEmail?: string
    }
  ): Promise<ApprovalRequest> {
    const chain = this.chains.get(chainId)
    if (!chain) {
      throw new Error(`Approval chain ${chainId} not found`)
    }

    const now = Date.now()
    const firstLevel = chain.levels.find(l => l.order === 1)
    const deadline = firstLevel?.timeoutHours
      ? now + firstLevel.timeoutHours * 60 * 60 * 1000
      : undefined

    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      chainId,
      resourceType,
      resourceId,
      resourceName: options?.resourceName,
      currentLevel: 1,
      approvals: [],
      status: 'pending',
      requestedBy,
      requestedByEmail: options?.requestedByEmail,
      escalationHistory: [],
      createdAt: now,
      deadline,
    }

    this.requests.set(request.id, request)
    await this.saveToStorage()

    logger.info('Created approval request', {
      requestId: request.id,
      chainId,
      resourceType,
      resourceId,
    })

    return request
  }

  async approve(
    requestId: string,
    userId: string,
    comment?: string,
    userEmail?: string
  ): Promise<ApprovalRequest> {
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`)
    }

    if (request.status !== 'pending' && request.status !== 'escalated') {
      throw new Error(`Cannot approve request in status: ${request.status}`)
    }

    const chain = this.chains.get(request.chainId)
    if (!chain) {
      throw new Error(`Approval chain ${request.chainId} not found`)
    }

    const currentLevel = chain.levels.find(l => l.order === request.currentLevel)
    if (!currentLevel) {
      throw new Error(`Level ${request.currentLevel} not found in chain`)
    }

    const approval: ApprovalEntry = {
      userId,
      userEmail,
      decision: 'approved',
      comment,
      timestamp: Date.now(),
      levelOrder: request.currentLevel,
    }

    request.approvals.push(approval)

    const levelApprovals = request.approvals.filter(
      a => a.levelOrder === request.currentLevel && a.decision === 'approved'
    )

    if (levelApprovals.length >= currentLevel.requiredApprovals) {
      const nextLevel = chain.levels.find(l => l.order === request.currentLevel + 1)
      
      if (nextLevel) {
        request.currentLevel = nextLevel.order
        request.deadline = nextLevel.timeoutHours
          ? Date.now() + nextLevel.timeoutHours * 60 * 60 * 1000
          : undefined
        request.status = 'pending'
        
        logger.info('Approval request advanced to next level', {
          requestId,
          newLevel: nextLevel.order,
          levelName: nextLevel.name,
        })
      } else {
        request.status = 'approved'
        request.completedAt = Date.now()
        
        logger.info('Approval request fully approved', { requestId })
      }
    }

    this.requests.set(requestId, request)
    await this.saveToStorage()

    return request
  }

  async reject(
    requestId: string,
    userId: string,
    comment?: string,
    userEmail?: string
  ): Promise<ApprovalRequest> {
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`)
    }

    if (request.status !== 'pending' && request.status !== 'escalated') {
      throw new Error(`Cannot reject request in status: ${request.status}`)
    }

    const rejection: ApprovalEntry = {
      userId,
      userEmail,
      decision: 'rejected',
      comment,
      timestamp: Date.now(),
      levelOrder: request.currentLevel,
    }

    request.approvals.push(rejection)
    request.status = 'rejected'
    request.completedAt = Date.now()

    this.requests.set(requestId, request)
    await this.saveToStorage()

    logger.info('Approval request rejected', { requestId, userId })

    return request
  }

  async escalate(requestId: string, reason: string): Promise<ApprovalRequest> {
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`)
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot escalate request in status: ${request.status}`)
    }

    const chain = this.chains.get(request.chainId)
    if (!chain) {
      throw new Error(`Approval chain ${request.chainId} not found`)
    }

    const currentLevel = chain.levels.find(l => l.order === request.currentLevel)
    if (!currentLevel) {
      throw new Error(`Level ${request.currentLevel} not found in chain`)
    }

    const escalationEntry = {
      fromLevel: request.currentLevel,
      toLevel: request.currentLevel,
      reason,
      timestamp: Date.now(),
    }

    if (currentLevel.escalateTo === 'next_level') {
      const nextLevel = chain.levels.find(l => l.order === request.currentLevel + 1)
      if (nextLevel) {
        escalationEntry.toLevel = nextLevel.order
        request.currentLevel = nextLevel.order
        request.deadline = nextLevel.timeoutHours
          ? Date.now() + nextLevel.timeoutHours * 60 * 60 * 1000
          : undefined
      }
    }

    request.escalationHistory = request.escalationHistory || []
    request.escalationHistory.push(escalationEntry)
    request.status = 'escalated'

    this.requests.set(requestId, request)
    await this.saveToStorage()

    logger.info('Approval request escalated', {
      requestId,
      fromLevel: escalationEntry.fromLevel,
      toLevel: escalationEntry.toLevel,
      reason,
    })

    return request
  }

  async cancel(requestId: string): Promise<ApprovalRequest> {
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error(`Approval request ${requestId} not found`)
    }

    if (request.status === 'approved' || request.status === 'rejected') {
      throw new Error(`Cannot cancel completed request`)
    }

    request.status = 'cancelled'
    request.completedAt = Date.now()

    this.requests.set(requestId, request)
    await this.saveToStorage()

    logger.info('Approval request cancelled', { requestId })

    return request
  }

  getApprovalStatus(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId)
  }

  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId)
  }

  getAllRequests(): ApprovalRequest[] {
    return Array.from(this.requests.values())
  }

  getPendingApprovals(userId: string, userRole?: UserRole): ApprovalRequest[] {
    const pending: ApprovalRequest[] = []

    for (const request of this.requests.values()) {
      if (request.status !== 'pending' && request.status !== 'escalated') {
        continue
      }

      const chain = this.chains.get(request.chainId)
      if (!chain) continue

      const currentLevel = chain.levels.find(l => l.order === request.currentLevel)
      if (!currentLevel) continue

      const canApprove =
        currentLevel.approverUserIds.includes(userId) ||
        (userRole && currentLevel.approverRoles.includes(userRole))

      const hasAlreadyActed = request.approvals.some(
        a => a.userId === userId && a.levelOrder === request.currentLevel
      )

      if (canApprove && !hasAlreadyActed) {
        pending.push(request)
      }
    }

    return pending
  }

  getRequestsByResource(resourceType: ResourceType, resourceId: string): ApprovalRequest[] {
    return Array.from(this.requests.values()).filter(
      r => r.resourceType === resourceType && r.resourceId === resourceId
    )
  }

  async checkTimeouts(): Promise<ApprovalRequest[]> {
    const escalated: ApprovalRequest[] = []
    const now = Date.now()

    for (const request of this.requests.values()) {
      if (request.status !== 'pending') continue
      if (!request.deadline) continue

      if (now > request.deadline) {
        try {
          const updated = await this.escalate(request.id, 'Timeout exceeded')
          escalated.push(updated)
        } catch (error) {
          logger.error('Failed to escalate timed-out request', {
            requestId: request.id,
            error,
          })
        }
      }
    }

    if (escalated.length > 0) {
      logger.info('Escalated timed-out approval requests', {
        count: escalated.length,
      })
    }

    return escalated
  }

  startTimeoutChecker(intervalMs: number = 60000): void {
    if (this.timeoutCheckerInterval) {
      clearInterval(this.timeoutCheckerInterval)
    }

    this.timeoutCheckerInterval = setInterval(() => {
      this.checkTimeouts().catch(error => {
        logger.error('Timeout checker failed', { error })
      })
    }, intervalMs)

    logger.info('Started approval timeout checker', { intervalMs })
  }

  stopTimeoutChecker(): void {
    if (this.timeoutCheckerInterval) {
      clearInterval(this.timeoutCheckerInterval)
      this.timeoutCheckerInterval = null
      logger.info('Stopped approval timeout checker')
    }
  }

  canUserApprove(requestId: string, userId: string, userRole?: UserRole): boolean {
    const request = this.requests.get(requestId)
    if (!request) return false

    if (request.status !== 'pending' && request.status !== 'escalated') {
      return false
    }

    const chain = this.chains.get(request.chainId)
    if (!chain) return false

    const currentLevel = chain.levels.find(l => l.order === request.currentLevel)
    if (!currentLevel) return false

    const canApprove =
      currentLevel.approverUserIds.includes(userId) ||
      (userRole && currentLevel.approverRoles.includes(userRole))

    const hasAlreadyActed = request.approvals.some(
      a => a.userId === userId && a.levelOrder === request.currentLevel
    )

    return Boolean(canApprove) && !hasAlreadyActed
  }

  getApprovalProgress(requestId: string): {
    currentLevel: number
    totalLevels: number
    currentLevelName: string
    approvalsAtCurrentLevel: number
    requiredApprovals: number
    percentComplete: number
  } | null {
    const request = this.requests.get(requestId)
    if (!request) return null

    const chain = this.chains.get(request.chainId)
    if (!chain) return null

    const currentLevel = chain.levels.find(l => l.order === request.currentLevel)
    if (!currentLevel) return null

    const approvalsAtCurrentLevel = request.approvals.filter(
      a => a.levelOrder === request.currentLevel && a.decision === 'approved'
    ).length

    const completedLevels = request.currentLevel - 1
    const levelProgress = approvalsAtCurrentLevel / currentLevel.requiredApprovals
    const percentComplete = Math.round(
      ((completedLevels + levelProgress) / chain.levels.length) * 100
    )

    return {
      currentLevel: request.currentLevel,
      totalLevels: chain.levels.length,
      currentLevelName: currentLevel.name,
      approvalsAtCurrentLevel,
      requiredApprovals: currentLevel.requiredApprovals,
      percentComplete,
    }
  }
}

let engineInstance: ApprovalChainEngine | null = null

export function getApprovalChainEngine(): ApprovalChainEngine {
  if (!engineInstance) {
    engineInstance = new ApprovalChainEngine()
  }
  return engineInstance
}

export async function initializeApprovalChainEngine(): Promise<ApprovalChainEngine> {
  const engine = getApprovalChainEngine()
  await engine.loadFromStorage()
  return engine
}
