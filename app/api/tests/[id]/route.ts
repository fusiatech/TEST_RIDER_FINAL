import { NextRequest, NextResponse } from 'next/server'
import { getTestJob, cancelTestJob } from '@/server/test-runner'
import { getTestRun, deleteTestRun } from '@/server/storage'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tests/[id]
 * 
 * Get a specific test job or test run by ID.
 * First checks running jobs, then falls back to persisted history.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    
    // First check running/recent jobs
    const job = getTestJob(id)
    if (job) {
      return NextResponse.json(job)
    }
    
    // Fall back to persisted test runs
    const run = await getTestRun(id)
    if (run) {
      return NextResponse.json({
        id: run.id,
        projectPath: '',
        options: {},
        status: 'completed' as const,
        createdAt: run.timestamp,
        completedAt: run.timestamp + run.duration,
        result: run
      })
    }
    
    return NextResponse.json(
      { error: 'Test job or run not found' },
      { status: 404 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/tests/[id]
 * 
 * Cancel a running test job or delete a test run from history.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    
    // Try to cancel if it's a running job
    const job = getTestJob(id)
    if (job) {
      if (job.status === 'running' || job.status === 'queued') {
        cancelTestJob(id)
        return NextResponse.json({ success: true, action: 'cancelled' })
      }
    }
    
    // Try to delete from history
    const run = await getTestRun(id)
    if (run) {
      await deleteTestRun(id)
      return NextResponse.json({ success: true, action: 'deleted' })
    }
    
    return NextResponse.json(
      { error: 'Test job or run not found' },
      { status: 404 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
