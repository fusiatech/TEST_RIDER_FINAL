import { z } from 'zod'

/* ── User Roles (RBAC) ─────────────────────────────────────────── */

export const UserRoleSchema = z.enum(['admin', 'editor', 'viewer'])
export type UserRole = z.infer<typeof UserRoleSchema>

export const PermissionSchema = z.object({
  canCreateProjects: z.boolean(),
  canDeleteProjects: z.boolean(),
  canManageUsers: z.boolean(),
  canConfigureSettings: z.boolean(),
  canRunSwarms: z.boolean(),
  canApproveTickets: z.boolean(),
  canManageBackups: z.boolean(),
})
export type Permission = z.infer<typeof PermissionSchema>

export const ROLE_PERMISSIONS: Record<UserRole, Permission> = {
  admin: {
    canCreateProjects: true,
    canDeleteProjects: true,
    canManageUsers: true,
    canConfigureSettings: true,
    canRunSwarms: true,
    canApproveTickets: true,
    canManageBackups: true,
  },
  editor: {
    canCreateProjects: true,
    canDeleteProjects: false,
    canManageUsers: false,
    canConfigureSettings: false,
    canRunSwarms: true,
    canApproveTickets: true,
    canManageBackups: false,
  },
  viewer: {
    canCreateProjects: false,
    canDeleteProjects: false,
    canManageUsers: false,
    canConfigureSettings: false,
    canRunSwarms: false,
    canApproveTickets: false,
    canManageBackups: false,
  },
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  editor: 'Editor',
  viewer: 'Viewer',
}

export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access to all features including user management and settings',
  editor: 'Can create projects, run swarms, and approve tickets',
  viewer: 'Read-only access to view projects and results',
}

/* ── User Schema ───────────────────────────────────────────────── */

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  role: UserRoleSchema,
  tenantId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type User = z.infer<typeof UserSchema>

/* ── Tenant Schema (GAP-002) ─────────────────────────────────────── */

export const TenantSettingsSchema = z.object({
  maxUsers: z.number().default(10),
  maxProjects: z.number().default(50),
  maxStorage: z.number().default(1073741824), // 1GB
})
export type TenantSettings = z.infer<typeof TenantSettingsSchema>

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  ownerId: z.string(),
  settings: TenantSettingsSchema.optional(),
})
export type Tenant = z.infer<typeof TenantSchema>

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
  installed: z.boolean().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  supportsAPI: z.boolean().optional(),
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

/* ── MCP Tool ─────────────────────────────────────────────────── */

export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
})
export type MCPTool = z.infer<typeof MCPToolSchema>

/* ── MCP Tool Call ────────────────────────────────────────────── */

export const MCPToolCallSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
})
export type MCPToolCall = z.infer<typeof MCPToolCallSchema>

/* ── MCP Tool Result ──────────────────────────────────────────── */

export const MCPToolResultSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
  result: z.unknown(),
  error: z.string().optional(),
  timestamp: z.number(),
})
export type MCPToolResult = z.infer<typeof MCPToolResultSchema>

/* ── GitHub Config ─────────────────────────────────────────────── */

export const GitHubConfigSchema = z.object({
  enabled: z.boolean(),
  autoCreatePR: z.boolean(),
  baseBranch: z.string(),
  branchPrefix: z.string(),
})
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>

/* ── API Keys ─────────────────────────────────────────────────── */

export const ApiKeysSchema = z.object({
  openai: z.string().optional(),
  anthropic: z.string().optional(),
  google: z.string().optional(),
  github: z.string().optional(),
  huggingface: z.string().optional(),
})
export type ApiKeys = z.infer<typeof ApiKeysSchema>

/* ── Code Validation Config ────────────────────────────────────── */

export const CodeValidationConfigSchema = z.object({
  enabled: z.boolean(),
  blockOnErrors: z.boolean(),
  minScore: z.number().min(0).max(100).optional(),
})
export type CodeValidationConfig = z.infer<typeof CodeValidationConfigSchema>

/* ── Figma Integration (GAP-013) ───────────────────────────────── */

export const FigmaConfigSchema = z.object({
  enabled: z.boolean(),
  accessToken: z.string().optional(),
  teamId: z.string().optional(),
})
export type FigmaConfig = z.infer<typeof FigmaConfigSchema>

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
  previewUrl: z.string().optional(),
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
  figmaConfig: FigmaConfigSchema.optional(),
  apiKeys: ApiKeysSchema.optional(),
  apiEndpoints: z.record(z.string(), z.string()).optional(),
  useSemanticValidation: z.boolean().optional(),
  enableFactChecking: z.boolean().optional(),
  codeValidation: CodeValidationConfigSchema.optional(),
  sessionReplayConfig: z.object({
    enabled: z.boolean(),
    playbackSpeed: z.number().min(0.25).max(4),
    showCursor: z.boolean(),
    showClicks: z.boolean(),
    showInputHighlights: z.boolean(),
    autoPlay: z.boolean(),
  }).optional(),
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

export const FileSnapshotSchema = z.object({
  path: z.string(),
  content: z.string(),
  hash: z.string(),
})
export type FileSnapshot = z.infer<typeof FileSnapshotSchema>

export const LinkedTestResultSchema = z.object({
  testId: z.string(),
  passed: z.boolean(),
  output: z.string(),
})
export type LinkedTestResult = z.infer<typeof LinkedTestResultSchema>

export const ScreenshotSchema = z.object({
  url: z.string(),
  timestamp: z.number(),
})
export type Screenshot = z.infer<typeof ScreenshotSchema>

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
  fileSnapshots: z.array(FileSnapshotSchema).optional(),
  testResults: z.array(LinkedTestResultSchema).optional(),
  screenshots: z.array(ScreenshotSchema).optional(),
})
export type EvidenceLedgerEntry = z.infer<typeof EvidenceLedgerEntrySchema>

export const FigmaLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  fileKey: z.string(),
  nodeId: z.string().optional(),
  name: z.string(),
  thumbnailUrl: z.string().optional(),
  lastModified: z.string().optional(),
})
export type FigmaLink = z.infer<typeof FigmaLinkSchema>

/* ── SLA Tracking (GAP-006) ────────────────────────────────────── */

export const SLAPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])
export type SLAPriority = z.infer<typeof SLAPrioritySchema>

export const SLAConfigSchema = z.object({
  responseTimeHours: z.number().optional(),
  resolutionTimeHours: z.number().optional(),
  priority: SLAPrioritySchema,
})
export type SLAConfig = z.infer<typeof SLAConfigSchema>

export const SLAStatusSchema = z.object({
  responseDeadline: z.string().optional(),
  resolutionDeadline: z.string().optional(),
  responseBreached: z.boolean(),
  resolutionBreached: z.boolean(),
  timeToResponse: z.number().optional(),
  timeToResolution: z.number().optional(),
})
export type SLAStatus = z.infer<typeof SLAStatusSchema>

/* ── Ticket ────────────────────────────────────────────────────── */

export const TicketComplexity = z.enum(['S', 'M', 'L', 'XL'])
export type TicketComplexity = z.infer<typeof TicketComplexity>

export const TicketStatus = z.enum(['backlog', 'in_progress', 'review', 'approved', 'rejected', 'done'])
export type TicketStatus = z.infer<typeof TicketStatus>

export const TicketLevel = z.enum(['feature', 'epic', 'story', 'task', 'subtask', 'subatomic'])
export type TicketLevel = z.infer<typeof TicketLevel>

/** Hierarchy rules: which levels can contain which children */
export const TICKET_HIERARCHY: Record<TicketLevel, TicketLevel[]> = {
  feature: ['epic'],
  epic: ['story'],
  story: ['task'],
  task: ['subtask'],
  subtask: ['subatomic'],
  subatomic: [],
}

/** Get valid parent levels for a given ticket level */
export function getValidParentLevels(level: TicketLevel): TicketLevel[] {
  const parents: TicketLevel[] = []
  for (const [parent, children] of Object.entries(TICKET_HIERARCHY)) {
    if (children.includes(level)) {
      parents.push(parent as TicketLevel)
    }
  }
  return parents
}

/** Validate that a parent-child relationship is valid */
export function validateTicketHierarchy(parentLevel: TicketLevel, childLevel: TicketLevel): { valid: boolean; error?: string } {
  const allowedChildren = TICKET_HIERARCHY[parentLevel]
  if (!allowedChildren.includes(childLevel)) {
    const validParents = getValidParentLevels(childLevel)
    return {
      valid: false,
      error: `${childLevel} cannot be a child of ${parentLevel}. Valid parents: ${validParents.join(', ') || 'none (top-level only)'}`,
    }
  }
  return { valid: true }
}

/* ── Approval History ─────────────────────────────────────────────── */

export const ApprovalHistoryEntrySchema = z.object({
  action: z.enum(['approved', 'rejected']),
  timestamp: z.number(),
  comment: z.string().optional(),
  user: z.string().optional(),
})
export type ApprovalHistoryEntry = z.infer<typeof ApprovalHistoryEntrySchema>

/* ── Ticket Attachment ─────────────────────────────────────────────── */

export const TicketAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
  uploadedAt: z.number(),
  uploadedBy: z.string().optional(),
})
export type TicketAttachment = z.infer<typeof TicketAttachmentSchema>

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
] as const

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_ATTACHMENTS_PER_TICKET = 10

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
  prdSectionId: z.string().optional(),
  dependencies: z.array(z.string()),
  blockedBy: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
  evidenceIds: z.array(z.string()).optional(),
  retryCount: z.number().min(0).max(3).optional(),
  originalTicketId: z.string().optional(),
  type: z.enum(['task', 'escalation']).optional(),
  output: z.string().optional(),
  diff: z.string().optional(),
  testResults: z.string().optional(),
  confidence: z.number().optional(),
  approvalHistory: z.array(ApprovalHistoryEntrySchema).optional(),
  attachments: z.array(TicketAttachmentSchema).optional(),
  figmaLinks: z.array(FigmaLinkSchema).optional(),
  sla: SLAConfigSchema.optional(),
  slaStatus: SLAStatusSchema.optional(),
  firstResponseAt: z.number().optional(),
  resolvedAt: z.number().optional(),
  aiSummary: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Ticket = z.infer<typeof TicketSchema>

/* ── User Story ───────────────────────────────────────────────── */

export const StoryPointsSchema = z.enum(['1', '2', '3', '5', '8', '13', '21'])
export type StoryPoints = z.infer<typeof StoryPointsSchema>

export const BusinessValueSchema = z.enum(['low', 'medium', 'high', 'critical'])
export type BusinessValue = z.infer<typeof BusinessValueSchema>

export const UserStorySchema = TicketSchema.extend({
  storyPoints: StoryPointsSchema,
  persona: z.string(),
  acceptanceCriteria: z.array(z.string()),
  businessValue: BusinessValueSchema,
})
export type UserStory = z.infer<typeof UserStorySchema>

/* ── DesignPack ───────────────────────────────────────────────── */

export const DesignPackStatusSchema = z.enum(['draft', 'review', 'approved'])
export type DesignPackStatus = z.infer<typeof DesignPackStatusSchema>

export const DesignPackFigmaLinkSchema = z.object({
  url: z.string().url(),
  nodeId: z.string(),
  name: z.string(),
})
export type DesignPackFigmaLink = z.infer<typeof DesignPackFigmaLinkSchema>

export const DesignTokensSchema = z.object({
  colors: z.record(z.string(), z.string()).optional(),
  spacing: z.record(z.string(), z.string()).optional(),
  typography: z.record(z.string(), z.object({
    fontFamily: z.string().optional(),
    fontSize: z.string().optional(),
    fontWeight: z.string().optional(),
    lineHeight: z.string().optional(),
    letterSpacing: z.string().optional(),
  })).optional(),
})
export type DesignTokens = z.infer<typeof DesignTokensSchema>

export const ComponentSpecSchema = z.object({
  name: z.string(),
  props: z.record(z.string(), z.object({
    type: z.string(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    description: z.string().optional(),
  })).optional(),
  variants: z.array(z.object({
    name: z.string(),
    props: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
})
export type ComponentSpec = z.infer<typeof ComponentSpecSchema>

export const DesignPackSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  prdSectionId: z.string().optional(),
  figmaLinks: z.array(DesignPackFigmaLinkSchema),
  wireframes: z.array(z.string().url()),
  mockups: z.array(z.string().url()),
  designTokens: DesignTokensSchema.optional(),
  componentSpecs: z.array(ComponentSpecSchema),
  status: DesignPackStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type DesignPack = z.infer<typeof DesignPackSchema>

/* ── DevPack ──────────────────────────────────────────────────── */

export const DevPackStatusSchema = z.enum(['draft', 'review', 'approved'])
export type DevPackStatus = z.infer<typeof DevPackStatusSchema>

export const ApiSpecSchema = z.object({
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  requestSchema: z.record(z.unknown()).optional(),
  responseSchema: z.record(z.unknown()).optional(),
  description: z.string().optional(),
})
export type ApiSpec = z.infer<typeof ApiSpecSchema>

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['unit', 'integration', 'e2e', 'performance', 'security']).optional(),
  steps: z.array(z.string()).optional(),
  expectedResult: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
})
export type TestCase = z.infer<typeof TestCaseSchema>

export const DevPackSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  prdSectionId: z.string().optional(),
  architectureDiagram: z.string().optional(),
  apiSpecs: z.array(ApiSpecSchema),
  databaseSchema: z.string().optional(),
  techStack: z.array(z.string()),
  dependencies: z.array(z.string()),
  implementationNotes: z.string().optional(),
  testPlan: z.array(TestCaseSchema),
  status: DevPackStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type DevPack = z.infer<typeof DevPackSchema>

/* ── Epic ──────────────────────────────────────────────────────── */

export const EpicStatus = z.enum(['draft', 'active', 'completed'])
export type EpicStatus = z.infer<typeof EpicStatus>

export const EpicSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  featureId: z.string().optional(),
  ticketIds: z.array(z.string()),
  status: EpicStatus,
  progress: z.number().min(0).max(100),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Epic = z.infer<typeof EpicSchema>

/* ── Kanban Column ────────────────────────────────────────────── */

export const KanbanColumnSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: TicketStatus,
  color: z.string(),
})
export type KanbanColumn = z.infer<typeof KanbanColumnSchema>

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
  kanbanColumns: z.array(KanbanColumnSchema).optional(),
  ticketOrder: z.record(z.string(), z.array(z.string())).optional(),
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
  idempotencyKey: z.string().optional(),
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
  /** Job priority: higher values run first (default: 0) */
  priority: z.number().optional(),
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

/* ── Test Runner Types ─────────────────────────────────────────────── */

export const TestResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  file: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  duration: z.number(),
  error: z.string().optional(),
  stackTrace: z.string().optional(),
})
export type TestResult = z.infer<typeof TestResultSchema>

/* ── Coverage Types ───────────────────────────────────────────────── */

export const CoverageMetricsSchema = z.object({
  total: z.number(),
  covered: z.number(),
  skipped: z.number(),
  pct: z.number(),
})
export type CoverageMetrics = z.infer<typeof CoverageMetricsSchema>

export const FileCoverageSchema = z.object({
  path: z.string(),
  lines: CoverageMetricsSchema,
  branches: CoverageMetricsSchema,
  functions: CoverageMetricsSchema,
  statements: CoverageMetricsSchema,
})
export type FileCoverage = z.infer<typeof FileCoverageSchema>

export const CoverageSummarySchema = z.object({
  lines: CoverageMetricsSchema,
  branches: CoverageMetricsSchema,
  functions: CoverageMetricsSchema,
  statements: CoverageMetricsSchema,
})
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>

export const CoverageDataSchema = z.object({
  summary: CoverageSummarySchema,
  files: z.array(FileCoverageSchema),
})
export type CoverageData = z.infer<typeof CoverageDataSchema>

export const TestRunSummarySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  framework: z.string(),
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  duration: z.number(),
  results: z.array(TestResultSchema),
  coverage: CoverageDataSchema.optional(),
})
export type TestRunSummary = z.infer<typeof TestRunSummarySchema>

export const TestJobSchema = z.object({
  id: z.string(),
  projectPath: z.string(),
  options: z.object({
    filter: z.string().optional(),
    watch: z.boolean().optional(),
    timeout: z.number().optional(),
  }),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  result: TestRunSummarySchema.optional(),
  error: z.string().optional(),
})
export type TestJob = z.infer<typeof TestJobSchema>

/* ── Git Branch ───────────────────────────────────────────────── */

export const GitBranchSchema = z.object({
  name: z.string(),
  upstream: z.string().nullable(),
  current: z.boolean(),
  isRemote: z.boolean(),
})
export type GitBranch = z.infer<typeof GitBranchSchema>

/* ── Workspace ────────────────────────────────────────────────── */

export const WorkspaceSettingsSchema = z.object({
  defaultBranch: z.string().optional(),
  autoSave: z.boolean().optional(),
  theme: z.string().optional(),
})
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
  lastOpenedAt: z.string(),
  settings: WorkspaceSettingsSchema.optional(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>

/* ── WebSocket Messages ────────────────────────────────────────── */

/* ── Audit Log (GAP-003) ───────────────────────────────────────── */

export const AuditActionSchema = z.enum([
  'user_login', 'user_logout',
  'project_create', 'project_update', 'project_delete',
  'ticket_create', 'ticket_update', 'ticket_delete', 'ticket_approve', 'ticket_reject',
  'job_start', 'job_cancel', 'job_complete', 'job_fail',
  'settings_update', 'api_key_rotate',
  'extension_install', 'extension_uninstall',
  'file_create', 'file_update', 'file_delete',
  'git_commit', 'git_push', 'git_pull',
])
export type AuditAction = z.infer<typeof AuditActionSchema>

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  action: AuditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
})
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>

export const AuditLogFilterSchema = z.object({
  userId: z.string().optional(),
  action: AuditActionSchema.optional(),
  resourceType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
})
export type AuditLogFilter = z.infer<typeof AuditLogFilterSchema>

/* ── Prompt Versioning (GAP-005) ───────────────────────────────── */

export const PromptCategorySchema = z.enum(['system', 'stage', 'tool', 'custom'])
export type PromptCategory = z.infer<typeof PromptCategorySchema>

export const PromptVersionSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  version: z.number(),
  content: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  isActive: z.boolean(),
})
export type PromptVersion = z.infer<typeof PromptVersionSchema>

export const PromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: PromptCategorySchema,
  description: z.string().optional(),
  currentVersion: z.number(),
  versions: z.array(PromptVersionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Prompt = z.infer<typeof PromptSchema>

/* ── WebSocket Messages ────────────────────────────────────────── */

export const WSMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start-swarm'),
    prompt: z.string(),
    sessionId: z.string(),
    mode: z.enum(['chat', 'swarm', 'project']).optional(),
    idempotencyKey: z.string().optional(),
    attachments: z.array(EnqueueAttachmentSchema).max(MAX_ATTACHMENTS).optional(),
    priority: z.number().optional(),
  }),
  z.object({ type: z.literal('cancel-swarm'), sessionId: z.string() }),
  z.object({ type: z.literal('cancel-job'), jobId: z.string() }),
  z.object({ type: z.literal('cancel-all-queued') }),
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
  z.object({ type: z.literal('job-started'), jobId: z.string(), position: z.number() }),
  z.object({ type: z.literal('job-queued'), jobId: z.string(), position: z.number() }),
  z.object({ type: z.literal('active-jobs-count'), count: z.number(), queueDepth: z.number() }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('pong') }),
  // Test runner messages
  z.object({ type: z.literal('test-started'), jobId: z.string(), framework: z.string() }),
  z.object({ type: z.literal('test-output'), jobId: z.string(), data: z.string() }),
  z.object({ type: z.literal('test-result'), jobId: z.string(), result: TestResultSchema }),
  z.object({ type: z.literal('test-completed'), jobId: z.string(), summary: TestRunSummarySchema }),
  z.object({ type: z.literal('test-error'), jobId: z.string(), error: z.string() }),
  // MCP tool messages
  z.object({ type: z.literal('mcp-tool-call'), call: MCPToolCallSchema }),
  z.object({ type: z.literal('mcp-tool-result'), result: MCPToolResultSchema }),
  z.object({ type: z.literal('mcp-tool-error'), serverId: z.string(), toolName: z.string(), error: z.string() }),
  // File watcher messages
  z.object({ type: z.literal('file-changed'), event: z.enum(['add', 'change', 'unlink']), path: z.string() }),
  z.object({ type: z.literal('watch-project'), projectPath: z.string() }),
  z.object({ type: z.literal('unwatch-project') }),
  // Notification messages
  z.object({
    type: z.literal('notification'),
    notification: z.object({
      id: z.string(),
      type: z.enum(['info', 'success', 'warning', 'error']),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
      read: z.boolean(),
      event: z.enum([
        'job_started', 'job_completed', 'job_failed',
        'ticket_assigned', 'ticket_status_changed',
        'pr_created', 'pr_merged',
        'test_failed', 'coverage_dropped',
        'pipeline_started', 'pipeline_completed', 'security_alert',
        'approval_request', 'approval_decision', 'prd_approved', 'error_threshold_reached',
      ]).optional(),
      link: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
])
export type WSMessage = z.infer<typeof WSMessageSchema>

/* ── Terminal Session Persistence (IDE-002) ─────────────────────── */

export const PersistedTerminalSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  cwd: z.string(),
  cols: z.number(),
  rows: z.number(),
  scrollback: z.string(),
  createdAt: z.number(),
  lastActivityAt: z.number(),
  terminated: z.boolean(),
  exitCode: z.number().nullable(),
})
export type PersistedTerminalSession = z.infer<typeof PersistedTerminalSessionSchema>

/* ── Ticket Templates (GAP-014) ─────────────────────────────────── */

export const TicketTemplateCategorySchema = z.enum(['bug', 'feature', 'enhancement', 'chore'])
export type TicketTemplateCategory = z.infer<typeof TicketTemplateCategorySchema>

export const CustomFieldTypeSchema = z.enum(['text', 'textarea', 'select', 'multiselect', 'number', 'date', 'checkbox', 'url'])
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>

export const CustomFieldSchema = z.object({
  name: z.string(),
  type: CustomFieldTypeSchema,
  label: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
})
export type CustomField = z.infer<typeof CustomFieldSchema>

export const TicketTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  level: TicketLevel,
  defaultFields: TicketSchema.partial().omit({ id: true, projectId: true, createdAt: true, updatedAt: true }),
  requiredFields: z.array(z.string()),
  customFields: z.array(CustomFieldSchema),
  category: TicketTemplateCategorySchema,
  isDefault: z.boolean(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
})
export type TicketTemplate = z.infer<typeof TicketTemplateSchema>

/* ── PRD Section Types ─────────────────────────────────────────────── */

export const PRDSectionTypeSchema = z.enum([
  'problem',
  'solution',
  'requirements',
  'metrics',
  'constraints',
  'assumptions',
  'risks',
  'timeline',
  'stakeholders',
  'scope',
  'custom',
])
export type PRDSectionType = z.infer<typeof PRDSectionTypeSchema>

export const PRDSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  type: PRDSectionTypeSchema,
  linkedTicketIds: z.array(z.string()),
  linkedEpicIds: z.array(z.string()),
})
export type PRDSection = z.infer<typeof PRDSectionSchema>

/* ── PRD Version Types ─────────────────────────────────────────────── */

export const PRDVersionSchema = z.object({
  version: z.number(),
  content: z.string(),
  sections: z.array(PRDSectionSchema),
  author: z.string(),
  createdAt: z.number(),
  changeLog: z.string(),
})
export type PRDVersion = z.infer<typeof PRDVersionSchema>

/* ── PRD Section Link Types ────────────────────────────────────────── */

export const PRDSectionLinkSchema = z.object({
  sectionId: z.string(),
  ticketId: z.string(),
  linkedAt: z.number(),
  linkedBy: z.string().optional(),
})
export type PRDSectionLink = z.infer<typeof PRDSectionLinkSchema>
