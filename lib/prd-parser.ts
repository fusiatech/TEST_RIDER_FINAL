import { z } from 'zod'
import type { TicketComplexity, AgentRole, TicketLevel } from '@/lib/types'

export const ParsedRequirementSchema = z.object({
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  complexity: z.enum(['S', 'M', 'L', 'XL']),
  type: z.enum(['epic', 'story', 'task']),
  assignedRole: z.enum(['researcher', 'planner', 'coder', 'validator', 'security', 'synthesizer']),
  dependencies: z.array(z.string()).optional(),
  parentRef: z.string().optional(),
})

export type ParsedRequirement = z.infer<typeof ParsedRequirementSchema>

export const GeneratedTicketSchema = z.object({
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  complexity: z.enum(['S', 'M', 'L', 'XL']),
  level: z.enum(['feature', 'epic', 'story', 'task', 'subtask', 'subatomic']),
  assignedRole: z.enum(['researcher', 'planner', 'coder', 'validator', 'security', 'synthesizer']),
  dependencies: z.array(z.string()).optional(),
  parentTitle: z.string().optional(),
})

export type GeneratedTicket = z.infer<typeof GeneratedTicketSchema>

export function generateTicketPrompt(prd: string): string {
  return `Analyze this Product Requirements Document and generate a structured list of tickets:

${prd}

For each ticket, provide:
1. title: A concise, actionable title (max 80 characters)
2. description: Detailed description of what needs to be done
3. acceptanceCriteria: Array of testable acceptance criteria
4. complexity: Estimate complexity as S (small, <1 day), M (medium, 1-3 days), L (large, 3-5 days), or XL (extra large, >5 days)
5. level: One of "epic", "story", or "task"
   - epic: Large feature that contains multiple stories
   - story: User-facing functionality that can be completed in one sprint
   - task: Technical work item that supports a story
6. assignedRole: Best-fit role from: "researcher", "planner", "coder", "validator", "security", "synthesizer"
   - researcher: Investigation, research, documentation
   - planner: Architecture, design, planning
   - coder: Implementation, coding
   - validator: Testing, QA, verification
   - security: Security review, vulnerability assessment
   - synthesizer: Integration, final review
7. dependencies: Array of ticket titles this depends on (if any)
8. parentTitle: For stories/tasks, the title of the parent epic/story (if applicable)

Guidelines:
- Create a logical hierarchy: Epics → Stories → Tasks
- Each epic should have 2-5 stories
- Each story should have 1-4 tasks
- Ensure dependencies are correctly identified
- Make acceptance criteria specific and testable
- Assign appropriate roles based on the work type

Output as a JSON array of objects. Example format:
[
  {
    "title": "User Authentication Epic",
    "description": "Implement complete user authentication system",
    "acceptanceCriteria": ["Users can sign up", "Users can log in", "Users can reset password"],
    "complexity": "XL",
    "level": "epic",
    "assignedRole": "planner",
    "dependencies": []
  },
  {
    "title": "Implement Login Form",
    "description": "Create the login form component with validation",
    "acceptanceCriteria": ["Form validates email format", "Form shows error messages", "Form submits to API"],
    "complexity": "M",
    "level": "story",
    "assignedRole": "coder",
    "dependencies": [],
    "parentTitle": "User Authentication Epic"
  }
]

Output ONLY the JSON array, no additional text.`
}

export function parseGeneratedTickets(response: string): GeneratedTicket[] {
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('No valid JSON array found in response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Failed to parse JSON response')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array')
  }

  const tickets: GeneratedTicket[] = []
  const errors: string[] = []

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    const result = GeneratedTicketSchema.safeParse(item)
    
    if (result.success) {
      tickets.push(result.data)
    } else {
      const normalizedItem = normalizeTicketData(item)
      const retryResult = GeneratedTicketSchema.safeParse(normalizedItem)
      
      if (retryResult.success) {
        tickets.push(retryResult.data)
      } else {
        errors.push(`Ticket ${i + 1}: ${result.error.message}`)
      }
    }
  }

  if (tickets.length === 0 && errors.length > 0) {
    throw new Error(`Failed to parse any tickets: ${errors.join('; ')}`)
  }

  return tickets
}

function normalizeTicketData(item: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...item }
  
  if (typeof normalized.complexity === 'string') {
    const complexityMap: Record<string, TicketComplexity> = {
      small: 'S',
      medium: 'M',
      large: 'L',
      'extra large': 'XL',
      'extra-large': 'XL',
      xs: 'S',
      s: 'S',
      m: 'M',
      l: 'L',
      xl: 'XL',
    }
    const lower = (normalized.complexity as string).toLowerCase()
    normalized.complexity = complexityMap[lower] || normalized.complexity
  }
  
  if (typeof normalized.level === 'string') {
    const levelMap: Record<string, TicketLevel> = {
      feature: 'feature',
      epic: 'epic',
      story: 'story',
      task: 'task',
      subtask: 'subtask',
      'sub-task': 'subtask',
      subatomic: 'subatomic',
      'user story': 'story',
      'user-story': 'story',
    }
    const lower = (normalized.level as string).toLowerCase()
    normalized.level = levelMap[lower] || normalized.level
  }
  
  if (typeof normalized.assignedRole === 'string') {
    const roleMap: Record<string, AgentRole> = {
      research: 'researcher',
      researcher: 'researcher',
      plan: 'planner',
      planner: 'planner',
      planning: 'planner',
      code: 'coder',
      coder: 'coder',
      coding: 'coder',
      developer: 'coder',
      development: 'coder',
      validate: 'validator',
      validator: 'validator',
      validation: 'validator',
      test: 'validator',
      testing: 'validator',
      qa: 'validator',
      secure: 'security',
      security: 'security',
      synthesize: 'synthesizer',
      synthesizer: 'synthesizer',
      integration: 'synthesizer',
    }
    const lower = (normalized.assignedRole as string).toLowerCase()
    normalized.assignedRole = roleMap[lower] || normalized.assignedRole
  }
  
  if (!normalized.acceptanceCriteria) {
    normalized.acceptanceCriteria = []
  } else if (typeof normalized.acceptanceCriteria === 'string') {
    normalized.acceptanceCriteria = [normalized.acceptanceCriteria]
  }
  
  if (!normalized.dependencies) {
    normalized.dependencies = []
  } else if (typeof normalized.dependencies === 'string') {
    normalized.dependencies = [normalized.dependencies]
  }
  
  return normalized
}

export function buildTicketHierarchy(tickets: GeneratedTicket[]): {
  epics: GeneratedTicket[]
  stories: GeneratedTicket[]
  tasks: GeneratedTicket[]
  orphans: GeneratedTicket[]
} {
  const epics = tickets.filter((t) => t.level === 'epic')
  const stories = tickets.filter((t) => t.level === 'story')
  const tasks = tickets.filter((t) => t.level === 'task' || t.level === 'subtask')
  
  const epicTitles = new Set(epics.map((e) => e.title.toLowerCase()))
  const storyTitles = new Set(stories.map((s) => s.title.toLowerCase()))
  
  const orphanStories = stories.filter(
    (s) => s.parentTitle && !epicTitles.has(s.parentTitle.toLowerCase())
  )
  const orphanTasks = tasks.filter(
    (t) => t.parentTitle && !storyTitles.has(t.parentTitle.toLowerCase()) && !epicTitles.has(t.parentTitle.toLowerCase())
  )
  
  return {
    epics,
    stories,
    tasks,
    orphans: [...orphanStories, ...orphanTasks],
  }
}

export function estimateTotalEffort(tickets: GeneratedTicket[]): {
  totalDays: { min: number; max: number }
  byComplexity: Record<TicketComplexity, number>
} {
  const complexityDays: Record<TicketComplexity, { min: number; max: number }> = {
    S: { min: 0.5, max: 1 },
    M: { min: 1, max: 3 },
    L: { min: 3, max: 5 },
    XL: { min: 5, max: 10 },
  }
  
  const byComplexity: Record<TicketComplexity, number> = { S: 0, M: 0, L: 0, XL: 0 }
  let minDays = 0
  let maxDays = 0
  
  for (const ticket of tickets) {
    if (ticket.level === 'task' || ticket.level === 'story') {
      byComplexity[ticket.complexity]++
      minDays += complexityDays[ticket.complexity].min
      maxDays += complexityDays[ticket.complexity].max
    }
  }
  
  return {
    totalDays: { min: Math.round(minDays), max: Math.round(maxDays) },
    byComplexity,
  }
}
