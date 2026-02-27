import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getApprovalChainEngine,
  initializeApprovalChainEngine,
  ApprovalLevelSchema,
  EscalationRuleSchema,
  NotificationSettingsSchema,
} from '@/server/approval-chain'
import { createLogger } from '@/server/logger'

const logger = createLogger('api/approvals/chains')

const CreateChainSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  levels: z.array(ApprovalLevelSchema).min(1),
  escalationRules: z.array(EscalationRuleSchema).optional(),
  notificationSettings: NotificationSettingsSchema.optional(),
})

const UpdateChainSchema = z.object({
  chainId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  levels: z.array(ApprovalLevelSchema).min(1).optional(),
  escalationRules: z.array(EscalationRuleSchema).optional(),
  notificationSettings: NotificationSettingsSchema.optional(),
})

export async function GET(): Promise<NextResponse> {
  try {
    const engine = await initializeApprovalChainEngine()
    const chains = engine.getAllChains()

    return NextResponse.json({
      chains,
      total: chains.length,
    })
  } catch (error) {
    logger.error('Failed to fetch approval chains', { error })
    return NextResponse.json(
      { error: 'Failed to fetch approval chains' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const parsed = CreateChainSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const engine = await initializeApprovalChainEngine()
    const chain = await engine.createChain(parsed.data)

    logger.info('Created approval chain', { chainId: chain.id, name: chain.name })

    return NextResponse.json({ chain }, { status: 201 })
  } catch (error) {
    logger.error('Failed to create approval chain', { error })
    return NextResponse.json(
      { error: 'Failed to create approval chain' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const parsed = UpdateChainSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { chainId, ...updates } = parsed.data

    const engine = await initializeApprovalChainEngine()
    const chain = await engine.updateChain(chainId, updates)

    if (!chain) {
      return NextResponse.json(
        { error: 'Approval chain not found' },
        { status: 404 }
      )
    }

    logger.info('Updated approval chain', { chainId })

    return NextResponse.json({ chain })
  } catch (error) {
    logger.error('Failed to update approval chain', { error })
    return NextResponse.json(
      { error: 'Failed to update approval chain' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const chainId = searchParams.get('chainId')

    if (!chainId) {
      return NextResponse.json(
        { error: 'chainId is required' },
        { status: 400 }
      )
    }

    const engine = await initializeApprovalChainEngine()

    const requests = engine.getAllRequests().filter(
      (r) => r.chainId === chainId && (r.status === 'pending' || r.status === 'escalated')
    )

    if (requests.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete chain with pending approval requests',
          pendingCount: requests.length,
        },
        { status: 400 }
      )
    }

    const deleted = await engine.deleteChain(chainId)

    if (!deleted) {
      return NextResponse.json(
        { error: 'Approval chain not found' },
        { status: 404 }
      )
    }

    logger.info('Deleted approval chain', { chainId })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Failed to delete approval chain', { error })
    return NextResponse.json(
      { error: 'Failed to delete approval chain' },
      { status: 500 }
    )
  }
}
