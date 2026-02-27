import { NextRequest, NextResponse } from 'next/server'
import { deleteTestRun, getTestRun } from '@/server/storage'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const run = await getTestRun(id)
    if (!run) {
      return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    }
    return NextResponse.json(run)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const run = await getTestRun(id)
    if (!run) {
      return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    }
    await deleteTestRun(id)
    return new NextResponse(null, { status: 204 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
