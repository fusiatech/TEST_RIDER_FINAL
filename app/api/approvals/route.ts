import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getApprovalChainEngine,
  initializeApprovalChainEngine,
  ResourceTypeSchema,
  type ApprovalRequest,
  type ApprovalChain,
} from '@/server/approval-chain'
import { getUser } from '@/server/storage'
import { createLogger } from '@/server/logger'

const logger = createLogger('api/approvals')

const CreateRequestSchema = z.object({
  chainId: z.string(),
  resourceType: ResourceTypeSchema,
  resourceId: z.string(),
  resourceName: z.string().optional(),
  requestedBy: z.string(),
  requestedByEmail: z.string().optional(),
})

const UpdateRequestSchema = z.object({
  requestId: z.string(),
  action: z.enum(['approve', 'reject', 'escalate', 'cancel']),
  userId: z.string(),
  comment: z.string().optional(),
  reason: z.string().optional(),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const filter = searchParams.get('filter') || 'pending'
    const resourceType = searchParams.get('resourceType')
    const resourceId = searchParams.get('resourceId')
    const chainId = searchParams.get('chainId')

    const engine = await initializeApprovalChainEngine()

    let requests: ApprovalRequest[]

    if (resourceType && resourceId) {
      requests = engine.getRequestsByResource(
        resourceType as ApprovalRequest['resourceType'],
        resourceId
      )
    } else if (userId && filter === 'pending') {
      const user = await getUser(userId)
      requests = engine.getPendingApprovals(userId, user?.role)
    } else {
      requests = engine.getAllRequests()
    }

    if (chainId) {
      requests = requests.filter((r) => r.chainId === chainId)
    }

    if (filter === 'pending') {
      requests = requests.filter(
        (r) => r.status === 'pending' || r.status === 'escalated'
      )
    }

    requests.sort((a, b) => {
      if (a.deadline && b.deadline) {
        return a.deadline - b.deadline
      }
      if (a.deadline) return -1
      if (b.deadline) return 1
      return b.createdAt - a.createdAt
    })

    const chains = engine.getAllChains()
    const chainMap: Record<string, ApprovalChain> = {}
    for (const chain of chains) {
      chainMap[chain.id] = chain
    }

    return NextResponse.json({
      requests,
      chains,
      total: requests.length,
    })
  } catch (error) {
    logger.error('Failed to fetch approvals', { error })
    return NextResponse.json(
      { error: 'Failed to fetch approvals' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const parsed = CreateRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { chainId, resourceType, resourceId, resourceName, requestedBy, requestedByEmail } =
      parsed.data

    const engine = await initializeApprovalChainEngine()

    const existingRequests = engine.getRequestsByResource(resourceType, resourceId)
    const pendingRequest = existingRequests.find(
      (r) => r.status === 'pending' || r.status === 'escalated'
    )

    if (pendingRequest) {
      return NextResponse.json(
        {
          error: 'An approval request already exists for this resource',
          existingRequest: pendingRequest,
        },
        { status: 409 }
      )
    }

    const approvalRequest = await engine.createRequest(
      chainId,
      resourceType,
      resourceId,
      requestedBy,
      { resourceName, requestedByEmail }
    )

    logger.info('Created approval request', {
      requestId: approvalRequest.id,
      chainId,
      resourceType,
      resourceId,
    })

    return NextResponse.json({ request: approvalRequest }, { status: 201 })
  } catch (error) {
    logger.error('Failed to create approval request', { error })

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'Failed to create approval request' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const parsed = UpdateRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { requestId, action, userId, comment, reason } = parsed.data

    const engine = await initializeApprovalChainEngine()

    const user = await getUser(userId)
    const userEmail = user?.email

    let updatedRequest: ApprovalRequest

    switch (action) {
      case 'approve':
        if (!engine.canUserApprove(requestId, userId, user?.role)) {
          return NextResponse.json(
            { error: 'You are not authorized to approve this request' },
            { status: 403 }
          )
        }
        updatedRequest = await engine.approve(requestId, userId, comment, userEmail)
        break

      case 'reject':
        if (!engine.canUserApprove(requestId, userId, user?.role)) {
          return NextResponse.json(
            { error: 'You are not authorized to reject this request' },
            { status: 403 }
          )
        }
        updatedRequest = await engine.reject(requestId, userId, comment, userEmail)
        break

      case 'escalate':
        updatedRequest = await engine.escalate(requestId, reason || 'Manual escalation')
        break

      case 'cancel':
        updatedRequest = await engine.cancel(requestId)
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const progress = engine.getApprovalProgress(requestId)

    logger.info('Updated approval request', {
      requestId,
      action,
      userId,
      newStatus: updatedRequest.status,
    })

    return NextResponse.json({
      request: updatedRequest,
      progress,
    })
  } catch (error) {
    logger.error('Failed to update approval request', { error })

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (error.message.includes('Cannot')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json(
      { error: 'Failed to update approval request' },
      { status: 500 }
    )
  }
}
