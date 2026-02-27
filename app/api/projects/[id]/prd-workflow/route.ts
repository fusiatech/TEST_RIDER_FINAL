import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prdWorkflowEngine, type PRDWorkflow } from '@/server/prd-workflow'
import { getProject } from '@/server/storage'

const StartWorkflowSchema = z.object({
  action: z.enum(['full', 'epics', 'stories', 'tasks', 'subtasks', 'design_pack', 'dev_pack']),
  targetId: z.string().optional(),
  prdSectionId: z.string().optional(),
  config: z.object({
    generateStories: z.boolean().optional(),
    generateTasks: z.boolean().optional(),
    generateSubtasks: z.boolean().optional(),
    generateDesignPacks: z.boolean().optional(),
    generateDevPacks: z.boolean().optional(),
    autoApprove: z.boolean().optional(),
  }).optional(),
})

const ApproveRejectSchema = z.object({
  workflowId: z.string(),
  stepId: z.string(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const url = new URL(_request.url)
    const workflowId = url.searchParams.get('workflowId')

    if (workflowId) {
      const workflow = prdWorkflowEngine.getWorkflow(workflowId)
      if (!workflow) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
      }
      return NextResponse.json(workflow)
    }

    return NextResponse.json({
      projectId: id,
      hasPRD: !!project.prd,
      prdStatus: project.prdStatus || 'draft',
      epicCount: project.epics.length,
      ticketCount: project.tickets.length,
      ticketsByLevel: {
        story: project.tickets.filter((t) => t.level === 'story').length,
        task: project.tickets.filter((t) => t.level === 'task').length,
        subtask: project.tickets.filter((t) => t.level === 'subtask').length,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const result = StartWorkflowSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { action, targetId, prdSectionId, config } = result.data

    switch (action) {
      case 'full': {
        if (!project.prd) {
          return NextResponse.json(
            { error: 'Project has no PRD. Generate a PRD first.' },
            { status: 400 }
          )
        }

        const fullResult = await prdWorkflowEngine.runFullWorkflow(id, config)
        return NextResponse.json({
          success: true,
          workflowId: fullResult.workflowId,
          summary: {
            epics: fullResult.epics.length,
            stories: fullResult.stories.length,
            tasks: fullResult.tasks.length,
            subtasks: fullResult.subtasks.length,
          },
          epics: fullResult.epics,
          stories: fullResult.stories,
          tasks: fullResult.tasks,
          subtasks: fullResult.subtasks,
        })
      }

      case 'epics': {
        if (!project.prd) {
          return NextResponse.json(
            { error: 'Project has no PRD. Generate a PRD first.' },
            { status: 400 }
          )
        }

        const { epics, workflowId } = await prdWorkflowEngine.generateEpicsFromPRD(
          project.prd,
          id,
          { autoApprove: config?.autoApprove }
        )
        return NextResponse.json({
          success: true,
          workflowId,
          epics,
        })
      }

      case 'stories': {
        if (!targetId) {
          return NextResponse.json(
            { error: 'targetId (epicId) is required for generating stories' },
            { status: 400 }
          )
        }

        const stories = await prdWorkflowEngine.generateStoriesFromEpic(
          targetId,
          id,
          { autoApprove: config?.autoApprove }
        )
        return NextResponse.json({
          success: true,
          stories,
        })
      }

      case 'tasks': {
        if (!targetId) {
          return NextResponse.json(
            { error: 'targetId (storyId) is required for generating tasks' },
            { status: 400 }
          )
        }

        const tasks = await prdWorkflowEngine.generateTasksFromStory(
          targetId,
          id,
          { autoApprove: config?.autoApprove }
        )
        return NextResponse.json({
          success: true,
          tasks,
        })
      }

      case 'subtasks': {
        if (!targetId) {
          return NextResponse.json(
            { error: 'targetId (taskId) is required for generating subtasks' },
            { status: 400 }
          )
        }

        const subtasks = await prdWorkflowEngine.generateSubtasksFromTask(
          targetId,
          id,
          { autoApprove: config?.autoApprove }
        )
        return NextResponse.json({
          success: true,
          subtasks,
        })
      }

      case 'design_pack': {
        if (!targetId) {
          return NextResponse.json(
            { error: 'targetId (ticketId) is required for generating design pack' },
            { status: 400 }
          )
        }

        const designPack = await prdWorkflowEngine.generateDesignPack(
          targetId,
          id,
          prdSectionId
        )
        return NextResponse.json({
          success: true,
          designPack,
        })
      }

      case 'dev_pack': {
        if (!targetId) {
          return NextResponse.json(
            { error: 'targetId (ticketId) is required for generating dev pack' },
            { status: 400 }
          )
        }

        const devPack = await prdWorkflowEngine.generateDevPack(
          targetId,
          id,
          prdSectionId
        )
        return NextResponse.json({
          success: true,
          devPack,
        })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PRD Workflow Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const result = ApproveRejectSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { workflowId, stepId, action, reason } = result.data

    if (action === 'approve') {
      await prdWorkflowEngine.approveWorkflowStep(workflowId, stepId)
    } else {
      await prdWorkflowEngine.rejectWorkflowStep(workflowId, stepId, reason)
    }

    const workflow = prdWorkflowEngine.getWorkflow(workflowId)
    return NextResponse.json({
      success: true,
      workflow,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
