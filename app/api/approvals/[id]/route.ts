import { NextRequest, NextResponse } from 'next/server'
import {
  getApprovalChainEngine,
  initializeApprovalChainEngine,
} from '@/server/approval-chain'
import { createLogger } from '@/server/logger'

const logger = createLogger('api/approvals/[id]')

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const engine = await initializeApprovalChainEngine()

    const approvalRequest = engine.getRequest(id)

    if (!approvalRequest) {
      return NextResponse.json(
        { error: 'Approval request not found' },
        { status: 404 }
      )
    }

    const chain = engine.getChain(approvalRequest.chainId)
    const progress = engine.getApprovalProgress(id)

    return NextResponse.json({
      request: approvalRequest,
      chain,
      progress,
    })
  } catch (error) {
    logger.error('Failed to fetch approval request', { error })
    return NextResponse.json(
      { error: 'Failed to fetch approval request' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const engine = await initializeApprovalChainEngine()

    const approvalRequest = engine.getRequest(id)

    if (!approvalRequest) {
      return NextResponse.json(
        { error: 'Approval request not found' },
        { status: 404 }
      )
    }

    if (approvalRequest.status === 'approved' || approvalRequest.status === 'rejected') {
      return NextResponse.json(
        { error: 'Cannot delete a completed approval request' },
        { status: 400 }
      )
    }

    const cancelled = await engine.cancel(id)

    logger.info('Cancelled approval request', { id })

    return NextResponse.json({ request: cancelled })
  } catch (error) {
    logger.error('Failed to delete approval request', { error })
    return NextResponse.json(
      { error: 'Failed to delete approval request' },
      { status: 500 }
    )
  }
}
