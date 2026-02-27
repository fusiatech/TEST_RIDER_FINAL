import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { 
  detectTestFramework, 
  enqueueTestJob, 
  getTestJob, 
  getAllTestJobs, 
  cancelTestJob 
} from '@/server/test-runner'
import { getTestRuns, saveTestRun, getSettings } from '@/server/storage'
import { broadcastToAll } from '@/server/ws-server'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

const RunTestsSchema = z.object({
  projectPath: z.string().optional(),
  filter: z.string().optional(),
  watch: z.boolean().optional(),
  timeout: z.number().min(1000).max(600000).optional(),
  coverage: z.boolean().optional(),
})

/**
 * GET /api/tests
 * 
 * Query params:
 * - history=true: Get persisted test run history
 * - jobs=true: Get current test jobs (queued/running/completed)
 * - detect=true&path=<projectPath>: Detect test framework for a project
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    
    // Get test run history
    if (searchParams.get('history') === 'true') {
      const runs = await getTestRuns()
      return NextResponse.json(runs)
    }
    
    // Get current test jobs
    if (searchParams.get('jobs') === 'true') {
      const jobs = getAllTestJobs()
      return NextResponse.json(jobs)
    }
    
    // Detect test framework
    if (searchParams.get('detect') === 'true') {
      const settings = await getSettings()
      const requestedPath = searchParams.get('path') || settings.projectPath || process.cwd()
      const resolved = resolvePathWithinWorkspace(requestedPath)
      if (!resolved.ok || !resolved.path) {
        return NextResponse.json(
          { error: resolved.error ?? 'Path outside workspace root' },
          { status: 403 }
        )
      }
      const framework = detectTestFramework(resolved.path)
      return NextResponse.json(framework)
    }
    
    // Default: return both history and jobs
    const [runs, jobs] = await Promise.all([
      getTestRuns(),
      Promise.resolve(getAllTestJobs())
    ])
    
    return NextResponse.json({
      history: runs,
      jobs: jobs
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/tests
 * 
 * Run tests in the specified project directory.
 * Returns a job ID that can be used to track progress.
 * 
 * Body:
 * - projectPath?: string - Path to project (defaults to settings.projectPath)
 * - filter?: string - Test name filter pattern
 * - watch?: boolean - Enable watch mode
 * - timeout?: number - Timeout in milliseconds (default 300000)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const result = RunTestsSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { filter, watch, timeout, coverage = true } = result.data
    const settings = await getSettings()
    const requestedPath = result.data.projectPath || settings.projectPath || process.cwd()
    const resolved = resolvePathWithinWorkspace(requestedPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 }
      )
    }
    const projectPath = resolved.path
    
    // Detect framework first
    const framework = detectTestFramework(projectPath)
    
    // Enqueue the test job
    const job = enqueueTestJob(
      projectPath,
      { filter, watch, timeout, coverage },
      (data) => {
        // Stream output via WebSocket
        broadcastToAll({
          type: 'test-output',
          jobId: job.id,
          data
        })
      }
    )
    
    // Broadcast test started
    broadcastToAll({
      type: 'test-started',
      jobId: job.id,
      framework: framework.framework
    })
    
    // When job completes, save to history and broadcast
    const checkCompletion = setInterval(async () => {
      const currentJob = getTestJob(job.id)
      if (!currentJob) {
        clearInterval(checkCompletion)
        return
      }
      
      if (currentJob.status === 'completed' && currentJob.result) {
        clearInterval(checkCompletion)
        await saveTestRun(currentJob.result)
        broadcastToAll({
          type: 'test-completed',
          jobId: job.id,
          summary: currentJob.result
        })
      } else if (currentJob.status === 'failed') {
        clearInterval(checkCompletion)
        broadcastToAll({
          type: 'test-error',
          jobId: job.id,
          error: currentJob.error || 'Unknown error'
        })
      } else if (currentJob.status === 'cancelled') {
        clearInterval(checkCompletion)
      }
    }, 500)
    
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      framework: framework.framework,
      projectPath
    }, { status: 202 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/tests?jobId=<id>
 * 
 * Cancel a running test job.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId query parameter is required' },
        { status: 400 }
      )
    }
    
    const cancelled = cancelTestJob(jobId)
    
    if (!cancelled) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true, jobId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
