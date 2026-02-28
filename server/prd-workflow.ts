/**
 * PRD-to-Epic-to-Ticket Workflow Engine
 * Orchestrates the generation of epics, stories, tasks, and subtasks from PRDs
 */

import { z } from 'zod'
import { runGenerationGateway } from './generation-gateway'
import { getProject, saveProject, getSettings } from './storage'
import { createLogger } from './logger'
import type {
  Project,
  Epic,
  Ticket,
  TicketLevel,
  TicketComplexity,
  AgentRole,
  DesignPack,
  DevPack,
} from '@/lib/types'

const logger = createLogger('prd-workflow')

/* ── Workflow Types ─────────────────────────────────────────────── */

export const WorkflowStepStatus = z.enum(['pending', 'in_progress', 'completed', 'failed', 'approved', 'rejected'])
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatus>

export const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(['epics', 'stories', 'tasks', 'subtasks', 'design_pack', 'dev_pack']),
  status: WorkflowStepStatus,
  parentId: z.string().optional(),
  generatedItems: z.array(z.string()),
  error: z.string().optional(),
  createdAt: z.number(),
  completedAt: z.number().optional(),
})
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

export const PRDWorkflowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'paused']),
  currentStep: z.string().optional(),
  steps: z.array(WorkflowStepSchema),
  config: z.object({
    generateStories: z.boolean().default(true),
    generateTasks: z.boolean().default(true),
    generateSubtasks: z.boolean().default(false),
    generateDesignPacks: z.boolean().default(false),
    generateDevPacks: z.boolean().default(false),
    autoApprove: z.boolean().default(false),
  }),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type PRDWorkflow = z.infer<typeof PRDWorkflowSchema>

export interface GeneratedEpic {
  title: string
  description: string
  prdSectionId?: string
}

export interface GeneratedStory {
  title: string
  description: string
  acceptanceCriteria: string[]
  persona: string
  storyPoints: string
  businessValue: string
}

export interface GeneratedTask {
  title: string
  description: string
  acceptanceCriteria: string[]
  complexity: TicketComplexity
  assignedRole: AgentRole
}

/* ── Prompt Templates ───────────────────────────────────────────── */

function generateEpicsPrompt(prd: string, projectName: string): string {
  return `Analyze the following PRD and extract distinct epics (major feature areas).

PROJECT: ${projectName}

PRD:
${prd}

For each epic, provide:
1. A clear, concise title
2. A description of what this epic encompasses
3. The PRD section it relates to (if identifiable)

Output as JSON array:
[
  {
    "title": "Epic Title",
    "description": "What this epic covers and its goals",
    "prdSectionId": "section-name or null"
  }
]

Guidelines:
- Each epic should represent a distinct feature area or capability
- Epics should be large enough to contain multiple user stories
- Avoid overlapping scope between epics
- Typical project has 3-8 epics
- Focus on user-facing functionality and value

Output ONLY the JSON array, no other text.`
}

function generateStoriesPrompt(epic: Epic, prd: string): string {
  return `Generate user stories for the following epic.

EPIC: ${epic.title}
DESCRIPTION: ${epic.description}

RELEVANT PRD CONTEXT:
${prd}

For each user story, provide:
1. Title in format "As a [user], I want [goal]"
2. Description with context
3. Acceptance criteria (testable conditions)
4. User persona
5. Story points (1, 2, 3, 5, 8, 13, or 21)
6. Business value (low, medium, high, critical)

Output as JSON array:
[
  {
    "title": "As a user, I want to...",
    "description": "Detailed description of the story",
    "acceptanceCriteria": ["Given..., When..., Then...", "..."],
    "persona": "End User | Admin | Developer | etc",
    "storyPoints": "3",
    "businessValue": "high"
  }
]

Guidelines:
- Stories should be independent and deliverable
- Each story should provide clear user value
- Acceptance criteria should be specific and testable
- Use Gherkin format (Given/When/Then) for acceptance criteria when possible
- Typical epic has 3-10 stories

Output ONLY the JSON array, no other text.`
}

function generateTasksPrompt(story: Ticket, epicTitle: string): string {
  return `Break down the following user story into implementation tasks.

EPIC: ${epicTitle}
STORY: ${story.title}
DESCRIPTION: ${story.description}
ACCEPTANCE CRITERIA:
${story.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

For each task, provide:
1. Clear, actionable title
2. Technical description
3. Acceptance criteria (what defines "done")
4. Complexity estimate (S, M, L, XL)
5. Assigned role (researcher, planner, coder, validator, security, synthesizer)

Output as JSON array:
[
  {
    "title": "Implement feature X",
    "description": "Technical details of what needs to be done",
    "acceptanceCriteria": ["Unit tests pass", "Code reviewed", "..."],
    "complexity": "M",
    "assignedRole": "coder"
  }
]

Guidelines:
- Tasks should be completable in 1-3 days
- Include both implementation and testing tasks
- Consider security and validation tasks
- Each story typically has 2-8 tasks

Output ONLY the JSON array, no other text.`
}

function generateSubtasksPrompt(task: Ticket): string {
  return `Break down the following task into subtasks (atomic work items).

TASK: ${task.title}
DESCRIPTION: ${task.description}
ACCEPTANCE CRITERIA:
${task.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

For each subtask, provide:
1. Specific, atomic title
2. Brief description
3. Completion criteria
4. Complexity (always S or M for subtasks)
5. Assigned role

Output as JSON array:
[
  {
    "title": "Create database schema for X",
    "description": "Define and create the schema",
    "acceptanceCriteria": ["Schema created", "Migration runs"],
    "complexity": "S",
    "assignedRole": "coder"
  }
]

Guidelines:
- Subtasks should be completable in hours, not days
- Each subtask should be independently verifiable
- Typical task has 2-5 subtasks

Output ONLY the JSON array, no other text.`
}

function generateDesignPackPrompt(ticket: Ticket, prdSection: string): string {
  return `Generate a design pack for the following ticket.

TICKET: ${ticket.title}
DESCRIPTION: ${ticket.description}
ACCEPTANCE CRITERIA:
${ticket.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

PRD CONTEXT:
${prdSection}

Create a design pack with:
1. UI/UX requirements
2. Component specifications
3. Design tokens (colors, spacing, typography)
4. Wireframe descriptions
5. Interaction patterns

Output as JSON:
{
  "uiRequirements": ["Requirement 1", "..."],
  "componentSpecs": [
    {
      "name": "ComponentName",
      "props": {
        "propName": {
          "type": "string",
          "required": true,
          "description": "What this prop does"
        }
      },
      "variants": [{"name": "primary", "props": {"variant": "primary"}}]
    }
  ],
  "designTokens": {
    "colors": {"primary": "#3b82f6"},
    "spacing": {"sm": "0.5rem"},
    "typography": {
      "heading": {
        "fontFamily": "Inter",
        "fontSize": "1.5rem",
        "fontWeight": "600"
      }
    }
  },
  "wireframeDescriptions": ["Description of layout and elements"],
  "interactionPatterns": ["Click behavior", "Hover states", "..."]
}

Output ONLY the JSON, no other text.`
}

function generateDevPackPrompt(ticket: Ticket, prdSection: string): string {
  return `Generate a development pack for the following ticket.

TICKET: ${ticket.title}
DESCRIPTION: ${ticket.description}
ACCEPTANCE CRITERIA:
${ticket.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

PRD CONTEXT:
${prdSection}

Create a dev pack with:
1. Architecture overview
2. API specifications
3. Database schema requirements
4. Tech stack recommendations
5. Dependencies
6. Test plan

Output as JSON:
{
  "architectureOverview": "Description of the architecture",
  "apiSpecs": [
    {
      "endpoint": "/api/resource",
      "method": "POST",
      "requestSchema": {"field": "type"},
      "responseSchema": {"id": "string"},
      "description": "What this endpoint does"
    }
  ],
  "databaseSchema": "SQL or schema description",
  "techStack": ["Next.js", "TypeScript", "..."],
  "dependencies": ["package-name@version"],
  "testPlan": [
    {
      "id": "test-1",
      "name": "Test name",
      "description": "What is being tested",
      "type": "unit",
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "Expected outcome",
      "priority": "high"
    }
  ],
  "implementationNotes": "Additional notes for developers"
}

Output ONLY the JSON, no other text.`
}

/* ── PRD Workflow Engine Class ──────────────────────────────────── */

export class PRDWorkflowEngine {
  private workflows: Map<string, PRDWorkflow> = new Map()

  async generateEpicsFromPRD(
    prd: string,
    projectId: string,
    options?: { autoApprove?: boolean }
  ): Promise<{ epics: Epic[]; workflowId: string }> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const workflowId = `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()

    const workflow: PRDWorkflow = {
      id: workflowId,
      projectId,
      status: 'in_progress',
      currentStep: 'epics',
      steps: [],
      config: {
        generateStories: true,
        generateTasks: true,
        generateSubtasks: false,
        generateDesignPacks: false,
        generateDevPacks: false,
        autoApprove: options?.autoApprove ?? false,
      },
      createdAt: now,
      updatedAt: now,
    }

    this.workflows.set(workflowId, workflow)

    const stepId = `step-${now}`
    const step: WorkflowStep = {
      id: stepId,
      type: 'epics',
      status: 'in_progress',
      generatedItems: [],
      createdAt: now,
    }
    workflow.steps.push(step)

    try {
      const prompt = generateEpicsPrompt(prd, project.name)
      const generatedEpics = await this.generateFromPrompt<GeneratedEpic[]>(
        prompt,
        'workflow_epics',
        () => JSON.stringify(this.buildFallbackEpics(project.name), null, 2),
      )
      const epics: Epic[] = []

      for (const genEpic of generatedEpics) {
        const epicId = `epic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const epic: Epic = {
          id: epicId,
          projectId,
          title: genEpic.title,
          description: genEpic.description,
          ticketIds: [],
          status: 'draft',
          progress: 0,
          createdAt: now,
          updatedAt: now,
        }
        epics.push(epic)
        step.generatedItems.push(epicId)
      }

      const updatedProject = {
        ...project,
        epics: [...project.epics, ...epics],
        updatedAt: now,
      }
      await saveProject(updatedProject)

      step.status = options?.autoApprove ? 'approved' : 'completed'
      step.completedAt = Date.now()
      workflow.status = 'completed'
      workflow.updatedAt = Date.now()

      logger.info('Generated epics from PRD', { projectId, epicCount: epics.length })

      return { epics, workflowId }
    } catch (error) {
      step.status = 'failed'
      step.error = error instanceof Error ? error.message : String(error)
      workflow.status = 'failed'
      workflow.updatedAt = Date.now()
      throw error
    }
  }

  async generateStoriesFromEpic(
    epicId: string,
    projectId: string,
    options?: { autoApprove?: boolean }
  ): Promise<Ticket[]> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const epic = project.epics.find((e) => e.id === epicId)
    if (!epic) {
      throw new Error(`Epic ${epicId} not found`)
    }

    const prompt = generateStoriesPrompt(epic, project.prd || '')
    const generatedStories = await this.generateFromPrompt<GeneratedStory[]>(
      prompt,
      'workflow_stories',
      () => JSON.stringify(this.buildFallbackStories(epic.title), null, 2),
    )
    const now = Date.now()
    const stories: Ticket[] = []

    for (const genStory of generatedStories) {
      const storyId = `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const story: Ticket = {
        id: storyId,
        projectId,
        title: genStory.title,
        description: genStory.description,
        acceptanceCriteria: genStory.acceptanceCriteria,
        complexity: this.mapStoryPointsToComplexity(genStory.storyPoints),
        status: 'backlog',
        assignedRole: 'coder',
        level: 'story',
        epicId,
        dependencies: [],
        createdAt: now,
        updatedAt: now,
      }
      stories.push(story)
    }

    const updatedEpics = project.epics.map((e) =>
      e.id === epicId
        ? { ...e, ticketIds: [...e.ticketIds, ...stories.map((s) => s.id)], updatedAt: now }
        : e
    )

    const updatedProject = {
      ...project,
      epics: updatedEpics,
      tickets: [...project.tickets, ...stories],
      updatedAt: now,
    }
    await saveProject(updatedProject)

    logger.info('Generated stories from epic', { epicId, storyCount: stories.length })

    return stories
  }

  async generateTasksFromStory(
    storyId: string,
    projectId: string,
    options?: { autoApprove?: boolean }
  ): Promise<Ticket[]> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const story = project.tickets.find((t) => t.id === storyId)
    if (!story) {
      throw new Error(`Story ${storyId} not found`)
    }

    const epic = project.epics.find((e) => e.id === story.epicId)
    const epicTitle = epic?.title || 'Unknown Epic'

    const prompt = generateTasksPrompt(story, epicTitle)
    const generatedTasks = await this.generateFromPrompt<GeneratedTask[]>(
      prompt,
      'workflow_tasks',
      () => JSON.stringify(this.buildFallbackTasks(story.title), null, 2),
    )
    const now = Date.now()
    const tasks: Ticket[] = []

    for (const genTask of generatedTasks) {
      const taskId = `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const task: Ticket = {
        id: taskId,
        projectId,
        title: genTask.title,
        description: genTask.description,
        acceptanceCriteria: genTask.acceptanceCriteria,
        complexity: genTask.complexity,
        status: 'backlog',
        assignedRole: genTask.assignedRole,
        level: 'task',
        parentId: storyId,
        storyId,
        epicId: story.epicId,
        dependencies: [],
        createdAt: now,
        updatedAt: now,
      }
      tasks.push(task)
    }

    const updatedProject = {
      ...project,
      tickets: [...project.tickets, ...tasks],
      updatedAt: now,
    }
    await saveProject(updatedProject)

    logger.info('Generated tasks from story', { storyId, taskCount: tasks.length })

    return tasks
  }

  async generateSubtasksFromTask(
    taskId: string,
    projectId: string,
    options?: { autoApprove?: boolean }
  ): Promise<Ticket[]> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const task = project.tickets.find((t) => t.id === taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    const prompt = generateSubtasksPrompt(task)
    const generatedSubtasks = await this.generateFromPrompt<GeneratedTask[]>(
      prompt,
      'workflow_subtasks',
      () => JSON.stringify(this.buildFallbackSubtasks(task.title), null, 2),
    )
    const now = Date.now()
    const subtasks: Ticket[] = []

    for (const genSubtask of generatedSubtasks) {
      const subtaskId = `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const subtask: Ticket = {
        id: subtaskId,
        projectId,
        title: genSubtask.title,
        description: genSubtask.description,
        acceptanceCriteria: genSubtask.acceptanceCriteria,
        complexity: genSubtask.complexity === 'L' || genSubtask.complexity === 'XL' ? 'M' : genSubtask.complexity,
        status: 'backlog',
        assignedRole: genSubtask.assignedRole,
        level: 'subtask',
        parentId: taskId,
        storyId: task.storyId,
        epicId: task.epicId,
        dependencies: [],
        createdAt: now,
        updatedAt: now,
      }
      subtasks.push(subtask)
    }

    const updatedProject = {
      ...project,
      tickets: [...project.tickets, ...subtasks],
      updatedAt: now,
    }
    await saveProject(updatedProject)

    logger.info('Generated subtasks from task', { taskId, subtaskCount: subtasks.length })

    return subtasks
  }

  async generateDesignPack(
    ticketId: string,
    projectId: string,
    prdSectionId?: string
  ): Promise<DesignPack> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const ticket = project.tickets.find((t) => t.id === ticketId)
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`)
    }

    const prdSection = prdSectionId ? this.extractPRDSection(project.prd || '', prdSectionId) : project.prd || ''
    const prompt = generateDesignPackPrompt(ticket, prdSection)
    const parsed = this.parseJSONResponse<{
      uiRequirements: string[]
      componentSpecs: Array<{
        name: string
        props?: Record<string, { type: string; required?: boolean; description?: string }>
        variants?: Array<{ name: string; props?: Record<string, unknown> }>
      }>
      designTokens: {
        colors?: Record<string, string>
        spacing?: Record<string, string>
        typography?: Record<string, { fontFamily?: string; fontSize?: string; fontWeight?: string; lineHeight?: string; letterSpacing?: string }>
      }
      wireframeDescriptions: string[]
      interactionPatterns: string[]
    }>(
      await this.generateTextFromPrompt(
        prompt,
        'workflow_design_pack',
        () => JSON.stringify(this.buildFallbackDesignPack(ticket.title), null, 2),
      )
    )

    const now = Date.now()
    const designPack: DesignPack = {
      id: `design-pack-${now}-${Math.random().toString(36).slice(2, 8)}`,
      ticketId,
      prdSectionId,
      figmaLinks: [],
      wireframes: [],
      mockups: [],
      designTokens: parsed.designTokens,
      componentSpecs: parsed.componentSpecs.map((spec) => ({
        name: spec.name,
        props: spec.props,
        variants: spec.variants,
      })),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }

    logger.info('Generated design pack', { ticketId, designPackId: designPack.id })

    return designPack
  }

  async generateDevPack(
    ticketId: string,
    projectId: string,
    prdSectionId?: string
  ): Promise<DevPack> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const ticket = project.tickets.find((t) => t.id === ticketId)
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`)
    }

    const prdSection = prdSectionId ? this.extractPRDSection(project.prd || '', prdSectionId) : project.prd || ''
    const prompt = generateDevPackPrompt(ticket, prdSection)
    const parsed = this.parseJSONResponse<{
      architectureOverview: string
      apiSpecs: Array<{
        endpoint: string
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
        requestSchema?: Record<string, unknown>
        responseSchema?: Record<string, unknown>
        description?: string
      }>
      databaseSchema: string
      techStack: string[]
      dependencies: string[]
      testPlan: Array<{
        id: string
        name: string
        description?: string
        type?: 'unit' | 'integration' | 'e2e' | 'performance' | 'security'
        steps?: string[]
        expectedResult?: string
        priority?: 'low' | 'medium' | 'high'
      }>
      implementationNotes: string
    }>(
      await this.generateTextFromPrompt(
        prompt,
        'workflow_dev_pack',
        () => JSON.stringify(this.buildFallbackDevPack(ticket.title), null, 2),
      )
    )

    const now = Date.now()
    const devPack: DevPack = {
      id: `dev-pack-${now}-${Math.random().toString(36).slice(2, 8)}`,
      ticketId,
      prdSectionId,
      architectureDiagram: parsed.architectureOverview,
      apiSpecs: parsed.apiSpecs,
      databaseSchema: parsed.databaseSchema,
      techStack: parsed.techStack,
      dependencies: parsed.dependencies,
      implementationNotes: parsed.implementationNotes,
      testPlan: parsed.testPlan,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }

    logger.info('Generated dev pack', { ticketId, devPackId: devPack.id })

    return devPack
  }

  async linkTicketToPRDSection(
    ticketId: string,
    prdSectionId: string,
    projectId: string
  ): Promise<Ticket> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const ticketIndex = project.tickets.findIndex((t) => t.id === ticketId)
    if (ticketIndex === -1) {
      throw new Error(`Ticket ${ticketId} not found`)
    }

    const now = Date.now()
    const updatedTicket = {
      ...project.tickets[ticketIndex],
      prdSectionId,
      updatedAt: now,
    }

    const updatedTickets = [...project.tickets]
    updatedTickets[ticketIndex] = updatedTicket

    const updatedProject = {
      ...project,
      tickets: updatedTickets,
      updatedAt: now,
    }
    await saveProject(updatedProject)

    logger.info('Linked ticket to PRD section', { ticketId, prdSectionId })

    return updatedTicket
  }

  /* ── Full Workflow Orchestration ─────────────────────────────────── */

  async runFullWorkflow(
    projectId: string,
    config?: Partial<PRDWorkflow['config']>
  ): Promise<{
    workflowId: string
    epics: Epic[]
    stories: Ticket[]
    tasks: Ticket[]
    subtasks: Ticket[]
  }> {
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    if (!project.prd) {
      throw new Error('Project has no PRD. Generate a PRD first.')
    }

    const workflowConfig = {
      generateStories: true,
      generateTasks: true,
      generateSubtasks: false,
      generateDesignPacks: false,
      generateDevPacks: false,
      autoApprove: false,
      ...config,
    }

    const result = {
      workflowId: '',
      epics: [] as Epic[],
      stories: [] as Ticket[],
      tasks: [] as Ticket[],
      subtasks: [] as Ticket[],
    }

    // Step 1: Generate epics
    const { epics, workflowId } = await this.generateEpicsFromPRD(
      project.prd,
      projectId,
      { autoApprove: workflowConfig.autoApprove }
    )
    result.workflowId = workflowId
    result.epics = epics

    // Step 2: Generate stories for each epic
    if (workflowConfig.generateStories) {
      for (const epic of epics) {
        const stories = await this.generateStoriesFromEpic(epic.id, projectId, {
          autoApprove: workflowConfig.autoApprove,
        })
        result.stories.push(...stories)
      }
    }

    // Step 3: Generate tasks for each story
    if (workflowConfig.generateTasks) {
      for (const story of result.stories) {
        const tasks = await this.generateTasksFromStory(story.id, projectId, {
          autoApprove: workflowConfig.autoApprove,
        })
        result.tasks.push(...tasks)
      }
    }

    // Step 4: Generate subtasks for each task
    if (workflowConfig.generateSubtasks) {
      for (const task of result.tasks) {
        const subtasks = await this.generateSubtasksFromTask(task.id, projectId, {
          autoApprove: workflowConfig.autoApprove,
        })
        result.subtasks.push(...subtasks)
      }
    }

    logger.info('Completed full workflow', {
      projectId,
      workflowId,
      epicCount: result.epics.length,
      storyCount: result.stories.length,
      taskCount: result.tasks.length,
      subtaskCount: result.subtasks.length,
    })

    return result
  }

  /* ── Workflow Management ─────────────────────────────────────────── */

  getWorkflow(workflowId: string): PRDWorkflow | undefined {
    return this.workflows.get(workflowId)
  }

  async approveWorkflowStep(workflowId: string, stepId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    const step = workflow.steps.find((s) => s.id === stepId)
    if (!step) {
      throw new Error(`Step ${stepId} not found`)
    }

    step.status = 'approved'
    workflow.updatedAt = Date.now()
  }

  async rejectWorkflowStep(workflowId: string, stepId: string, reason?: string): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    const step = workflow.steps.find((s) => s.id === stepId)
    if (!step) {
      throw new Error(`Step ${stepId} not found`)
    }

    step.status = 'rejected'
    step.error = reason
    workflow.status = 'paused'
    workflow.updatedAt = Date.now()
  }

  /* ── Helper Methods ─────────────────────────────────────────────── */

  private async generateTextFromPrompt(
    prompt: string,
    artifactType: string,
    deterministicFallback: () => string,
  ): Promise<string> {
    const settings = await getSettings()
    const result = await runGenerationGateway({
      prompt,
      settings,
      artifactType,
      deterministicFallback,
    })
    return result.text
  }

  private async generateFromPrompt<T>(
    prompt: string,
    artifactType: string,
    deterministicFallback: () => string,
  ): Promise<T> {
    const text = await this.generateTextFromPrompt(prompt, artifactType, deterministicFallback)
    return this.parseJSONResponse<T>(text)
  }

  private buildFallbackEpics(projectName: string): GeneratedEpic[] {
    return [
      {
        title: `${projectName} Core Platform`,
        description: 'Baseline platform epic covering core functionality, persistence, and reliability.',
        prdSectionId: 'overview',
      },
    ]
  }

  private buildFallbackStories(epicTitle: string): GeneratedStory[] {
    return [
      {
        title: `As a user, I want to complete the ${epicTitle} workflow so that the product delivers value end-to-end`,
        description: `Deterministic story generated for ${epicTitle}.`,
        acceptanceCriteria: [
          'Given a valid request, when workflow executes, then artifacts are produced',
          'Given invalid input, when validated, then clear errors are returned',
          'Given completion, when persisted, then state is retrievable',
        ],
        persona: 'End User',
        storyPoints: '5',
        businessValue: 'high',
      },
    ]
  }

  private buildFallbackTasks(storyTitle: string): GeneratedTask[] {
    return [
      {
        title: `${storyTitle}: Implement service logic`,
        description: 'Implement core service logic and schema validation.',
        acceptanceCriteria: [
          'Service handles happy path',
          'Service handles invalid input',
          'Unit tests cover branches',
        ],
        complexity: 'M',
        assignedRole: 'coder',
      },
      {
        title: `${storyTitle}: Add verification tests`,
        description: 'Add integration checks for API and persistence behavior.',
        acceptanceCriteria: [
          'Integration tests pass in CI',
          'Failure scenarios are covered',
        ],
        complexity: 'M',
        assignedRole: 'validator',
      },
    ]
  }

  private buildFallbackSubtasks(taskTitle: string): GeneratedTask[] {
    return [
      {
        title: `${taskTitle}: Define schema`,
        description: 'Define and validate request/response schemas.',
        acceptanceCriteria: ['Schema compiles', 'Validation rejects malformed payloads'],
        complexity: 'S',
        assignedRole: 'planner',
      },
      {
        title: `${taskTitle}: Add tests`,
        description: 'Add targeted tests and update fixtures.',
        acceptanceCriteria: ['Tests are deterministic', 'Edge cases are asserted'],
        complexity: 'S',
        assignedRole: 'validator',
      },
    ]
  }

  private buildFallbackDesignPack(ticketTitle: string): {
    uiRequirements: string[]
    componentSpecs: Array<{
      name: string
      props: Record<string, { type: string; required?: boolean; description?: string }>
      variants: Array<{ name: string; props?: Record<string, unknown> }>
    }>
    designTokens: {
      colors: Record<string, string>
      spacing: Record<string, string>
      typography: Record<string, { fontFamily?: string; fontSize?: string; fontWeight?: string }>
    }
    wireframeDescriptions: string[]
    interactionPatterns: string[]
  } {
    return {
      uiRequirements: [
        `Interface must clearly expose ${ticketTitle} flow controls`,
        'Error and loading states must be explicit',
      ],
      componentSpecs: [
        {
          name: 'WorkflowPanel',
          props: {
            title: { type: 'string', required: true, description: 'Panel heading' },
            status: { type: 'string', required: true, description: 'Workflow status' },
          },
          variants: [{ name: 'default', props: { variant: 'default' } }],
        },
      ],
      designTokens: {
        colors: { primary: '#2563eb', surface: '#f8fafc', text: '#0f172a' },
        spacing: { sm: '0.5rem', md: '1rem', lg: '1.5rem' },
        typography: {
          heading: { fontFamily: 'Inter', fontSize: '1.25rem', fontWeight: '600' },
          body: { fontFamily: 'Inter', fontSize: '1rem', fontWeight: '400' },
        },
      },
      wireframeDescriptions: [
        'Top summary row with status and progress',
        'Main panel listing actionable steps and outputs',
      ],
      interactionPatterns: ['Primary action button triggers generation', 'Inline validation for required fields'],
    }
  }

  private buildFallbackDevPack(ticketTitle: string): {
    architectureOverview: string
    apiSpecs: Array<{
      endpoint: string
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
      requestSchema?: Record<string, unknown>
      responseSchema?: Record<string, unknown>
      description?: string
    }>
    databaseSchema: string
    techStack: string[]
    dependencies: string[]
    testPlan: Array<{
      id: string
      name: string
      description?: string
      type?: 'unit' | 'integration' | 'e2e' | 'performance' | 'security'
      steps?: string[]
      expectedResult?: string
      priority?: 'low' | 'medium' | 'high'
    }>
    implementationNotes: string
  } {
    return {
      architectureOverview: `Service-oriented implementation for ${ticketTitle} with typed route handlers and persistence boundary.`,
      apiSpecs: [
        {
          endpoint: '/api/workflow/execute',
          method: 'POST',
          requestSchema: { input: 'string' },
          responseSchema: { success: 'boolean', artifactId: 'string' },
          description: 'Runs workflow step and stores artifact output.',
        },
      ],
      databaseSchema: 'artifact_runs(id uuid, project_id text, status text, payload jsonb, created_at bigint)',
      techStack: ['Next.js 15', 'TypeScript', 'lowdb'],
      dependencies: ['zod', 'next-auth'],
      testPlan: [
        {
          id: 'fallback-devpack-1',
          name: 'Workflow route validation',
          description: 'Validate happy-path and invalid payload behavior.',
          type: 'integration',
          steps: ['POST valid payload', 'POST invalid payload'],
          expectedResult: 'Valid request succeeds, invalid request returns 400',
          priority: 'high',
        },
      ],
      implementationNotes:
        'Deterministic dev pack generated without live provider response. Replace with live generation when provider lane is available.',
    }
  }

  private parseJSONResponse<T>(response: string): T {
    const jsonMatch = response.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response')
    }

    try {
      return JSON.parse(jsonMatch[0]) as T
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private mapStoryPointsToComplexity(storyPoints: string): TicketComplexity {
    const points = parseInt(storyPoints, 10)
    if (points <= 2) return 'S'
    if (points <= 5) return 'M'
    if (points <= 13) return 'L'
    return 'XL'
  }

  private extractPRDSection(prd: string, sectionId: string): string {
    const sectionPattern = new RegExp(`##\\s*${sectionId}[\\s\\S]*?(?=##|$)`, 'i')
    const match = prd.match(sectionPattern)
    return match ? match[0] : prd
  }
}

// Singleton instance
export const prdWorkflowEngine = new PRDWorkflowEngine()
