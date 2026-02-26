import { NextRequest, NextResponse } from 'next/server'
import { scheduler } from '@/server/scheduler'
import { ScheduledTaskSchema } from '@/lib/types'

export async function GET(): Promise<NextResponse> {
  try {
    const tasks = await scheduler.getTasks()
    return NextResponse.json(tasks)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const result = ScheduledTaskSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid task: ${result.error.message}` },
        { status: 400 }
      )
    }
    await scheduler.addTask(result.data)
    return NextResponse.json(result.data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
