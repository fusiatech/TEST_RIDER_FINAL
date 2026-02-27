import { NextRequest, NextResponse } from 'next/server'
import { getDebugAdapter } from '@/server/debug-adapter'

interface RouteParams {
  params: Promise<{ id: string; bpId: string }>
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, bpId } = await params
    const adapter = getDebugAdapter()
    await adapter.removeBreakpoint(id, bpId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove breakpoint' },
      { status: 500 }
    )
  }
}

export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, bpId } = await params
    const adapter = getDebugAdapter()
    const breakpoint = await adapter.toggleBreakpoint(id, bpId)
    return NextResponse.json({ breakpoint })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to toggle breakpoint' },
      { status: 500 }
    )
  }
}
