import { z } from 'zod'

/* ── Agent Roles ───────────────────────────────────────────────── */

export const AgentRole = z.enum([
  'researcher',
  'planner',
  'coder',
  'validator',
  'security',
  'synthesizer'
])
export type AgentRole = z.infer<typeof AgentRole>

export const ROLE_DEFAULTS: Record<AgentRole, number> = {
  researcher: 1,
  planner: 2,
  coder: 3,
  validator: 2,
  security: 1,
  synthesizer: 1
}

export const ROLE_COLORS: Record<AgentRole, string> = {
  researcher: '#60a5fa',
  planner: '#a78bfa',
  coder: '#34d399',
  validator: '#fbbf24',
  security: '#f87171',
  synthesizer: '#e879f9'
}

export const ROLE_LABELS: Record<AgentRole, string> = {
  researcher: 'Researcher',
  planner: 'Planner',
  coder: 'Coder',
  validator: 'Validator',
  security: 'Security',
  synthesizer: 'Synthesizer'
}

/* ── CLI Providers ─────────────────────────────────────────────── */

export const CLIProvider = z.enum(['cursor', 'gemini', 'claude', 'copilot', 'codex', 'rovo', 'custom'])
export type CLIProvider = z.infer<typeof CLIProvider>

/* ── CLI Definition (pluggable registry) ───────────────────────── */

export const CLIDefinitionSchema = z.object({
  id: CLIProvider,
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  promptFlag: z.string(),
  enabled: z.boolean(),
  installed: z.boolean().optional()
})
export type CLIDefinition = z.infer<typeof CLIDefinitionSchema>

/* ── Agent Status ──────────────────────────────────────────────── */

export const AgentStatus = z.enum([
  'pending', 'spawning', 'running', 'completed', 'failed', 'cancelled'
])
export type AgentStatus = z.infer<typeof AgentStatus>

/* ── Agent Instance ────────────────────────────────────────────── */

export const AgentInstanceSchema = z.object({
  id: z.string(),
  role: AgentRole,
  label: z.string(),
  provider: CLIProvider,
  status: AgentStatus,
  worktree: z.string().optional(),
  output: z.string(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  exitCode: z.number().optional()
})
export type AgentInstance = z.infer<typeof AgentInstanceSchema>

/* ── Chat Message ──────────────────────────────────────────────── */

export const AttachmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  dataUrl: z.string().optional(),
})
export type Attachment = z.infer<typeof AttachmentSchema>

/** Enqueue attachment: optional content for text, dataUrl for binary. Max 10, 5MB total. */
export const EnqueueAttachmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number().min(0).max(5 * 1024 * 1024),
  dataUrl: z.string().optional(),
  content: z.string().optional(),
})
export type EnqueueAttachment = z.infer<typeof EnqueueAttachmentSchema>

const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENTS_TOTAL_BYTES = 5 * 1024 * 1024

export function validateAttachments(attachments: EnqueueAttachment[]): { ok: boolean; error?: string } {
  if (attachments.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Maximum ${MAX_ATTACHMENTS} attachments allowed` }
  }
  const total = attachments.reduce((sum, a) => sum + a.size, 0)
  if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
    return { ok: false, error: `Total attachment size must not exceed ${MAX_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)}MB` }
  }
  return { ok: true }
}

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.number(),
  agents: z.array(AgentInstanceSchema).optional(),
  confidence: z.number().min(0).max(100).optional(),
  sources: z.array(z.string()).optional(),
  attachments: z.array(AttachmentSchema).optional(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

/* ── Session ───────────────────────────────────────────────────── */

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z.array(ChatMessageSchema)
})
export type Session = z.infer<typeof SessionSchema>

/* ── MCP Server ────────────────────────────────────────────────── */

export const MCPServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()),
  enabled: z.boolean(),
})
export type MCPServer = z.infer<typeof MCPServerSchema>

/* ── GitHub Config ─────────────────────────────────────────────── */

export const GitHubConfigSchema = z.object({
  enabled: z.boolean(),
  autoCreatePR: z.boolean(),
  baseBranch: z.string(),
  branchPrefix: z.string(),
})
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>

/* ── Settings ──────────────────────────────────────────────────── */

export const SettingsSchema = z.object({
  enabledCLIs: z.array(CLIProvider),
  parallelCounts: z.record(AgentRole, z.number().min(0).max(6)),
  worktreeIsolation: z.boolean(),
  maxRuntimeSeconds: z.number().min(10).max(600),
  researchDepth: z.enum(['shallow', 'medium', 'deep']),
  autoRerunThreshold: z.number().min(0).max(100),
  customCLICommand: z.string().optional(),
  projectPath: z.string().optional(),
  chatsPerAgent: z.number().min(1).max(20).optional(),
  testingConfig: z.object({
    typescript: z.boolean(),
    eslint: z.boolean(),
    npmAudit: z.boolean(),
    customCommand: z.string().optional()
  }).optional(),
  fileWriteConfirmation: z.boolean().optional(),
  maxFilesPerCommit: z.number().optional(),
  continuousMode: z.boolean().optional(),
  autoApproveTickets: z.boolean().optional(),
  backgroundProcessing: z.boolean().optional(),
  maxConcurrentJobs: z.number().min(1).max(5).optional(),
  ideationAutoRun: z.boolean().optional(),
  ideationSchedule: z.string().optional(),
  mcpServers: z.array(MCPServerSchema).optional(),
  githubConfig: GitHubConfigSchema.optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  enabledCLIs: ['cursor'],
  parallelCounts: {
    researcher: 1,
    planner: 2,
    coder: 3,
    validator: 2,
    security: 1,
    synthesizer: 1
  },
  worktreeIsolation: true,
  maxRuntimeSeconds: 120,
  researchDepth: 'medium',
  autoRerunThreshold: 80
}

/* ── Swarm Result ──────────────────────────────────────────────── */

export const SwarmResultSchema = z.object({
  finalOutput: z.string(),
  confidence: z.number().min(0).max(100),
  agents: z.array(AgentInstanceSchema),
  sources: z.array(z.string()),
  validationPassed: z.boolean()
})
export type SwarmResult = z.infer<typeof SwarmResultSchema>

/* ── Extension Allowlist (T18.1) ─────────────────────────────────── */

export const ExtensionAllowlistSchema = z.object({
  id: z.string(),
  version: z.string(),
  permissions: z.array(z.string()),
})
export type ExtensionAllowlist = z.infer<typeof ExtensionAllowlistSchema>

/* ── Evidence Ledger ─────────────────────────────────────────────── */

export const EvidenceLedgerEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  branch: z.string().optional(),
  commitHash: z.string().optional(),
  diffSummary: z.string().optional(),
  cliExcerpts: z.record(z.string(), z.string()).optional(),
  testRunId: z.string().optional(),
  ticketIds: z.array(z.string()).optional(),
  filePaths: z.array(z.string()).optional(),
})
export type EvidenceLedgerEntry = z.infer<typeof EvidenceLedgerEntrySchema>

/* ── Test Runs ─────────────────────────────────────────────────── */

export const TestRunSource = z.enum(['orchestrator', 'ci', 'manual'])
export type TestRunSource = z.infer<typeof TestRunSource>

export const TestRunStatus = z.enum(['passed', 'failed'])
export type TestRunStatus = z.infer<typeof TestRunStatus>

export const TestFailureSchema = z.object({
  id: z.string(),
  testName: z.string(),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  message: z.string().optional(),
})
export type TestFailure = z.infer<typeof TestFailureSchema>

export const TestRunCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  output: z.string(),
})
export type TestRunCheck = z.infer<typeof TestRunCheckSchema>

export const TestRunSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  source: TestRunSource,
  status: TestRunStatus,
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  checks: z.array(TestRunCheckSchema),
  failures: z.array(TestFailureSchema),
  logs: z.string(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})
export type TestRun = z.infer<typeof TestRunSchema>

/* ── Ticket ────────────────────────────────────────────────────── */

export const TicketComplexity = z.enum(['S', 'M', 'L', 'XL'])
export type TicketComplexity = z.infer<typeof TicketComplexity>

export const TicketStatus = z.enum(['backlog', 'in_progress', 'review', 'approved', 'rejected', 'done'])
export type TicketStatus = z.infer<typeof TicketStatus>

export const TicketLevel = z.enum(['task', 'subtask', 'subatomic'])
export type TicketLevel = z.infer<typeof TicketLevel>

export const TicketSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  complexity: TicketComplexity,
  status: TicketStatus,
  assignedRole: AgentRole,
  assignedProvider: CLIProvider.optional(),
  level: TicketLevel.optional(),
  parentId: z.string().optional(),
  epicId: z.string().optional(),
  storyId: z.string().optional(),
  dependencies: z.array(z.string()),
  evidenceIds: z.array(z.string()).optional(),
  retryCount: z.number().min(0).max(3).optional(),
  originalTicketId: z.string().optional(),
  type: z.enum(['task', 'escalation']).optional(),
  output: z.string().optional(),
  diff: z.string().optional(),
  testResults: z.string().optional(),
  confidence: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Ticket = z.infer<typeof TicketSchema>

/* ── Epic ──────────────────────────────────────────────────────── */

export const EpicSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  featureId: z.string().optional(),
  status: z.enum(['draft', 'active', 'completed']),
  createdAt: z.number()
})
export type Epic = z.infer<typeof EpicSchema>

/* ── Project ──────────────────────────────────────────────────── */

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  prd: z.string().optional(),
  prdStatus: z.enum(['draft', 'approved', 'rejected']).optional(),
  features: z.array(z.string()),
  epics: z.array(EpicSchema),
  tickets: z.array(TicketSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: z.enum(['planning', 'in_progress', 'completed', 'archived'])
})
export type Project = z.infer<typeof ProjectSchema>

/* ── Swarm Job ─────────────────────────────────────────────────── */

export const SwarmJobStatus = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled'])
export type SwarmJobStatus = z.infer<typeof SwarmJobStatus>

export const SwarmJobSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  prompt: z.string(),
  mode: z.enum(['chat', 'swarm', 'project']),
  status: SwarmJobStatus,
  result: SwarmResultSchema.optional(),
  error: z.string().optional(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  progress: z.number().min(0).max(100),
  currentStage: z.string().optional(),
  attachments: z.array(EnqueueAttachmentSchema).max(MAX_ATTACHMENTS).optional(),
  /** T2.1: 'scheduler' = use pipeline-engine; 'user' = use runSwarmPipeline */
  source: z.enum(['scheduler', 'user']).optional(),
})
export type SwarmJob = z.infer<typeof SwarmJobSchema>

/* ── Scheduled Task ────────────────────────────────────────────── */

export const ScheduledTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  cronExpression: z.string(),
  prompt: z.string(),
  mode: z.enum(['chat', 'swarm', 'project']),
  enabled: z.boolean(),
  lastRun: z.number().optional(),
  nextRun: z.number(),
  createdAt: z.number(),
})
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>

/* ── WebSocket Messages ────────────────────────────────────────── */

export const WSMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start-swarm'),
    prompt: z.string(),
    sessionId: z.string(),
    mode: z.enum(['chat', 'swarm', 'project']).optional(),
    attachments: z.array(EnqueueAttachmentSchema).max(MAX_ATTACHMENTS).optional(),
  }),
  z.object({ type: z.literal('cancel-swarm'), sessionId: z.string() }),
  z.object({ type: z.literal('agent-output'), agentId: z.string(), data: z.string() }),
  z.object({ type: z.literal('agent-status'), agentId: z.string(), status: AgentStatus, exitCode: z.number().optional() }),
  z.object({ type: z.literal('swarm-result'), result: SwarmResultSchema }),
  z.object({ type: z.literal('swarm-error'), error: z.string() }),
  z.object({ type: z.literal('confirm-write'), filespath: z.string(), diff: z.string(), requestId: z.string() }),
  z.object({ type: z.literal('confirm-response'), requestId: z.string(), approved: z.boolean() }),
  z.object({ type: z.literal('insert-code'), code: z.string(), filePath: z.string().optional() }),
  z.object({ type: z.literal('ticket-created'), ticket: TicketSchema }),
  z.object({ type: z.literal('ticket-updated'), ticketId: z.string(), update: TicketSchema.partial() }),
  z.object({ type: z.literal('tickets-list'), tickets: z.array(TicketSchema) }),
  z.object({ type: z.literal('task-queued'), taskId: z.string() }),
  z.object({ type: z.literal('task-status'), taskId: z.string(), status: z.string() }),
  z.object({ type: z.literal('job-status'), job: SwarmJobSchema }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('pong') })
])
export type WSMessage = z.infer<typeof WSMessageSchema>
