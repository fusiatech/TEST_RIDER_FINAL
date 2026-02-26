import { NextRequest, NextResponse } from 'next/server'
import { scheduler } from '@/server/scheduler'
import { z } from 'zod'

const UpdateTaskSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  cronExpression: z.string().optional(),
  prompt: z.string().optional(),
  mode: z.enum(['chat', 'swarm', 'project']).optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const task = await scheduler.getTask(id)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const result = UpdateTaskSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid update: ${result.error.message}` },
        { status: 400 }
      )
    }

    const update = result.data
    if (update.enabled === true) {
      await scheduler.enableTask(id)
    } else if (update.enabled === false) {
      await scheduler.disableTask(id)
    }

    const updated = await scheduler.getTask(id)
    return NextResponse.json(updated)
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
    const task = await scheduler.getTask(id)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    await scheduler.removeTask(id)
    return new NextResponse(null, { status: 204 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
