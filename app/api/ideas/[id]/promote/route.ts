import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  let target: 'project' | 'ticket' | 'backlog' = 'project'
  try {
    const body = (await request.json()) as { target?: 'project' | 'ticket' | 'backlog' } | null
    if (body?.target) {
      target = body.target
    }
  } catch {
    // Default target is project.
  }

  return NextResponse.json({
    success: true,
    ideaId: id,
    target,
    promotedAt: Date.now(),
  })
}

