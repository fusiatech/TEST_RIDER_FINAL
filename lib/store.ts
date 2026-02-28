import { create } from 'zustand'
import type {
  AgentInstance,
  AgentRole,
  Attachment,
  ChatIntent,
  ChatMessage,
  CLIProvider,
  EnqueueAttachment,
  RunLogEntry,
  Session,
  Settings,
  SwarmResult,
  Ticket,
  TicketStatus,
  Project,
  SwarmJob,
  ScheduledTask,
  Epic,
  KanbanColumn,
  GitBranch,
  Workspace,
} from '@/lib/types'
import type { Notification } from '@/lib/notifications'
import { DEFAULT_SETTINGS, ROLE_LABELS, SessionSchema, SettingsSchema, validateAttachments } from '@/lib/types'
import { generateId } from '@/lib/utils'
import { wsClient, type WSConnectionState } from '@/lib/ws-client'
import { isOutputQualityAcceptable, sanitizeOutputText } from '@/lib/output-sanitize'
import {
  CONTEXT_HARD_COMPACT_PERCENT,
  CONTEXT_SOFT_COMPACT_PERCENT,
  CONTEXT_WARN_PERCENT,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  compactContextMessages,
  estimateContextTelemetry,
  type ContextCompactionStatus,
} from '@/lib/context-window'
import { toast } from 'sonner'
import { getSessionRecorder } from '@/lib/session-recorder'

function recordSwarmEvent(name: string, data?: Record<string, unknown>): void {
  try {
    const recorder = getSessionRecorder()
    if (recorder.isActive()) {
      recorder.recordCustomEvent(name, data)
    }
  } catch {
    // Session recorder may not be initialized
  }
}

/* ── Client-side types for dashboard panels ─────────────────────── */

export interface ClientSecurityCheck {
  name: string
  passed: boolean
  output: string
}

let wsInitialized = false
let sidebarHydrated = false
let lastWsToastAt = 0
let pendingRunAckTimer: ReturnType<typeof setTimeout> | null = null
let pendingRunAckIdempotencyKey: string | null = null
let currentRunId: string | null = null
let currentRunLogs: RunLogEntry[] = []
const RUN_ACCEPTED_TIMEOUT_MS = 12000

function clearPendingRunAck(): void {
  if (pendingRunAckTimer) {
    clearTimeout(pendingRunAckTimer)
    pendingRunAckTimer = null
  }
  pendingRunAckIdempotencyKey = null
}

function getPersistedSidebarState(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const stored = localStorage.getItem('swarm-sidebar-open')
    if (stored !== null) {
      return JSON.parse(stored) as boolean
    }
  } catch {
    // localStorage may not be available
  }
  return true
}

function getDefaultPreviewUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_PREVIEW_URL
  if (configuredUrl) {
    return configuredUrl
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3000'
}

function toEnqueueAttachments(attachments: Attachment[]): EnqueueAttachment[] {
  return attachments.map((attachment) => ({
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    ...(attachment.dataUrl ? { dataUrl: attachment.dataUrl } : {}),
  }))
}

function inferRoleFromId(agentId: string): AgentRole {
  const lower = agentId.toLowerCase()
  if (lower.includes('researcher')) return 'researcher'
  if (lower.includes('planner')) return 'planner'
  if (lower.includes('coder')) return 'coder'
  if (lower.includes('validator')) return 'validator'
  if (lower.includes('security')) return 'security'
  if (lower.includes('synthesizer')) return 'synthesizer'
  return 'coder'
}

function buildLabelFromId(agentId: string): string {
  const role = inferRoleFromId(agentId)
  const match = agentId.match(/(\d+)$/)
  const num = match ? ` #${match[1]}` : ''
  return `${ROLE_LABELS[role]}${num}`
}

export type AppMode = 'chat' | 'swarm' | 'project'

export interface SwarmError {
  id: string
  agentId: string
  message: string
  timestamp: number
}

const MAX_ERRORS = 50

const ERROR_PATTERNS = /Error:|error:|ERR!|FAIL|TypeError|ReferenceError|SyntaxError|RangeError/

export interface OpenFile {
  path: string
  content: string
  language: string
}

export type SplitDirection = 'horizontal' | 'vertical'

export interface EditorGroup {
  id: string
  files: OpenFile[]
  activeFilePath: string | null
}

export type IdeaComplexity = 'S' | 'M' | 'L' | 'XL'

export interface Idea {
  id: string
  title: string
  description: string
  complexity: IdeaComplexity
}

export interface DebugBreakpoint {
  id: string
  file: string
  line: number
  enabled: boolean
  condition?: string
  verified: boolean
}

export interface DebugSessionState {
  id: string
  type: 'node' | 'chrome' | 'python'
  status: 'idle' | 'running' | 'paused' | 'stopped'
}

interface SwarmStore {
  sessions: Session[]
  currentSessionId: string | null
  messages: ChatMessage[]
  agents: AgentInstance[]
  isRunning: boolean
  settings: Settings
  sidebarOpen: boolean
  settingsOpen: boolean
  activeTab: 'chat' | 'dashboard' | 'ide' | 'testing' | 'eclipse' | 'observability'
  wsConnected: boolean
  wsConnectionState: WSConnectionState
  securityResults: ClientSecurityCheck[]
  tickets: Ticket[]
  mode: AppMode
  chatIntent: ChatIntent
  selectedAgent: CLIProvider | null
  projects: Project[]
  currentProjectId: string | null
  errors: SwarmError[]
  previewUrl: string
  showPreview: boolean
  sessionsLoading: boolean
  settingsLoading: boolean
  filesLoading: boolean
  ideOpen: boolean
  openFiles: OpenFile[]
  activeFilePath: string | null
  editorGroups: EditorGroup[]
  activeGroupId: string | null
  splitDirection: SplitDirection
  ideDiffOriginal: string | null
  ideDiffModified: string | null
  ideDiffLanguage: string
  showDiff: boolean
  jobs: SwarmJob[]
  scheduledTasks: ScheduledTask[]
  ideas: Idea[]
  activePanel: 'queue' | 'schedule' | 'ideas' | null
  fileTreeVersion: number
  watchedProjectPath: string | null
  debugSessions: DebugSessionState[]
  activeDebugSessionId: string | null
  breakpoints: Map<string, DebugBreakpoint[]>
  currentDebugLine: { file: string; line: number } | null
  notifications: Notification[]
  runLogs: Record<string, RunLogEntry[]>
  notificationCenterOpen: boolean
  branches: GitBranch[]
  currentBranch: string | null
  branchesLoading: boolean
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  workspacesLoading: boolean
  contextWindowTokens: number
  contextTokensUsed: number
  contextTokenPercent: number
  contextCompactionStatus: ContextCompactionStatus
  lastContextCompactionAt: number | null
  contextCompactionCount: number
  tokenPressureEvents: number

  createSession: () => string
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  addMessage: (message: ChatMessage) => void
  updateAgent: (agentId: string, update: Partial<AgentInstance>) => void
  appendAgentOutput: (agentId: string, data: string) => void
  setAgents: (agents: AgentInstance[]) => void
  clearAgents: () => void
  setIsRunning: (running: boolean) => void
  updateSettings: (settings: Partial<Settings>) => void
  toggleSidebar: () => void
  toggleSettings: () => void
  sendMessage: (prompt: string, attachments?: Attachment[]) => void
  handleSwarmResult: (result: SwarmResult) => void
  sendPrompt: (prompt: string) => void
  cancelSwarm: () => void
  setCurrentSession: (id: string | null) => void
  setRunning: (running: boolean) => void
  setConfidence: (value: number | null) => void
  setActiveTab: (tab: 'chat' | 'dashboard' | 'ide' | 'testing' | 'eclipse' | 'observability') => void
  initWebSocket: () => void
  confidence: number | null
  setSecurityResults: (results: ClientSecurityCheck[]) => void
  setTickets: (tickets: Ticket[]) => void
  updateTicket: (id: string, update: Partial<Ticket>) => void
  loadSessions: () => Promise<void>
  persistSession: () => Promise<void>
  loadSettings: () => Promise<void>
  persistSettings: () => Promise<void>
  addTicket: (ticket: Ticket) => void
  getTicketsByStage: (stage: AgentRole) => Ticket[]
  setMode: (mode: AppMode) => void
  setChatIntent: (intent: ChatIntent) => void
  setSelectedAgent: (agent: CLIProvider | null) => void
  createProject: (name: string, description: string) => string
  updateProject: (id: string, update: Partial<Project>) => void
  deleteProject: (id: string) => void
  switchProject: (id: string) => void
  approveTicket: (id: string) => void
  rejectTicket: (id: string) => void
  addError: (agentId: string, message: string) => void
  clearErrors: () => void
  setPreviewUrl: (url: string) => void
  togglePreview: () => void
  toggleIde: () => void
  setActiveFile: (path: string) => void
  setFilesLoading: (loading: boolean) => void
  openFileInIde: (filePath: string, content: string, language: string) => void
  closeFile: (filePath: string) => void
  updateFileContent: (filePath: string, content: string) => void
  reorderOpenFiles: (oldIndex: number, newIndex: number) => void
  showDiffInIde: (original: string, modified: string, language: string) => void
  closeDiff: () => void
  splitEditor: (direction: SplitDirection) => void
  closeEditorGroup: (groupId: string) => void
  setActiveGroup: (groupId: string) => void
  moveFileToGroup: (filePath: string, targetGroupId: string) => void
  openFileInGroup: (groupId: string, filePath: string, content: string, language: string) => void
  closeFileInGroup: (groupId: string, filePath: string) => void
  setActiveFileInGroup: (groupId: string, filePath: string) => void
  updateFileContentInGroup: (groupId: string, filePath: string, content: string) => void
  setJobs: (jobs: SwarmJob[]) => void
  addJob: (job: SwarmJob) => void
  updateJob: (id: string, update: Partial<SwarmJob>) => void
  cancelJob: (id: string) => void
  retryJob: (id: string) => void
  setScheduledTasks: (tasks: ScheduledTask[]) => void
  addScheduledTask: (task: ScheduledTask) => void
  updateScheduledTask: (id: string, update: Partial<ScheduledTask>) => void
  deleteScheduledTask: (id: string) => void
  toggleScheduledTask: (id: string) => void
  setIdeas: (ideas: Idea[]) => void
  generateIdeas: () => void
  setActivePanel: (panel: 'queue' | 'schedule' | 'ideas' | null) => void
  loadJobs: () => Promise<void>
  loadScheduledTasks: () => Promise<void>
  addEpic: (projectId: string, epic: Epic) => void
  updateEpic: (projectId: string, epicId: string, update: Partial<Epic>) => void
  deleteEpic: (projectId: string, epicId: string) => void
  assignTicketToEpic: (projectId: string, epicId: string, ticketId: string) => void
  removeTicketFromEpic: (projectId: string, epicId: string, ticketId: string) => void
  moveTicketToStatus: (ticketId: string, newStatus: TicketStatus, newIndex: number) => void
  updateKanbanColumns: (projectId: string, columns: KanbanColumn[]) => void
  updateTicketOrder: (projectId: string, statusId: string, ticketIds: string[]) => void
  addTicketDependency: (ticketId: string, dependencyId: string) => void
  removeTicketDependency: (ticketId: string, dependencyId: string) => void
  refreshFileTree: () => void
  watchProject: (projectPath: string) => void
  unwatchProject: () => void
  handleFileChange: (event: 'add' | 'change' | 'unlink', path: string) => void
  setDebugSessions: (sessions: DebugSessionState[]) => void
  setActiveDebugSession: (sessionId: string | null) => void
  addBreakpoint: (file: string, breakpoint: DebugBreakpoint) => void
  removeBreakpoint: (file: string, breakpointId: string) => void
  toggleBreakpoint: (file: string, breakpointId: string) => void
  clearBreakpoints: (file?: string) => void
  setCurrentDebugLine: (line: { file: string; line: number } | null) => void
  getBreakpointsForFile: (file: string) => DebugBreakpoint[]
  hydrateSidebar: () => void
  addNotification: (notification: Notification) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  clearNotifications: () => void
  toggleNotificationCenter: () => void
  getUnreadCount: () => number
  fetchBranches: () => Promise<void>
  createBranch: (name: string, checkout?: boolean, baseBranch?: string) => Promise<void>
  checkoutBranch: (name: string) => Promise<void>
  deleteBranch: (name: string, force?: boolean) => Promise<void>
  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string, path: string) => Promise<string>
  switchWorkspace: (id: string) => void
  deleteWorkspace: (id: string) => Promise<void>
  updateWorkspace: (id: string, update: Partial<Workspace>) => Promise<void>
  recalculateContextTelemetry: () => void
  autoCompactContext: () => void
}

export const useSwarmStore = create<SwarmStore>()((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  agents: [],
  isRunning: false,
  settings: DEFAULT_SETTINGS,
  sidebarOpen: true,
  settingsOpen: false,
  confidence: null,
  activeTab: 'chat' as const,
  wsConnected: false,
  wsConnectionState: 'idle',
  securityResults: [],
  tickets: [],
  mode: 'chat' as AppMode,
  chatIntent: 'auto',
  selectedAgent: null,
  projects: [],
  currentProjectId: null,
  errors: [],
  previewUrl: getDefaultPreviewUrl(),
  showPreview: false,
  sessionsLoading: false,
  settingsLoading: false,
  filesLoading: false,
  ideOpen: false,
  openFiles: [],
  activeFilePath: null,
  editorGroups: [],
  activeGroupId: null,
  splitDirection: 'horizontal' as SplitDirection,
  ideDiffOriginal: null,
  ideDiffModified: null,
  ideDiffLanguage: 'typescript',
  showDiff: false,
  jobs: [],
  scheduledTasks: [],
  ideas: [],
  activePanel: null,
  fileTreeVersion: 0,
  watchedProjectPath: null,
  debugSessions: [],
  activeDebugSessionId: null,
  breakpoints: new Map(),
  currentDebugLine: null,
  notifications: [],
  runLogs: {},
  notificationCenterOpen: false,
  branches: [],
  currentBranch: null,
  branchesLoading: false,
  workspaces: [],
  currentWorkspaceId: null,
  workspacesLoading: false,
  contextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
  contextTokensUsed: 0,
  contextTokenPercent: 0,
  contextCompactionStatus: 'Idle',
  lastContextCompactionAt: null,
  contextCompactionCount: 0,
  tokenPressureEvents: 0,

  createSession: () => {
    const id = generateId()
    const session: Session = {
      id,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      chatIntent: get().chatIntent,
    }
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: id,
      messages: [],
      agents: [],
      isRunning: false,
    }))
    void get().persistSession()
    return id
  },

  switchSession: (id: string) => {
    const session = get().sessions.find((s) => s.id === id)
    if (!session) return
    set({
      currentSessionId: id,
      messages: session.messages,
      chatIntent: session.chatIntent ?? 'auto',
      agents: [],
      isRunning: false,
    })
    get().recalculateContextTelemetry()
  },

  deleteSession: (id: string) => {
    set((state) => {
      const filtered = state.sessions.filter((s) => s.id !== id)
      const isCurrent = state.currentSessionId === id
      if (isCurrent) {
        const next = filtered[0] ?? null
        return {
          sessions: filtered,
          currentSessionId: next?.id ?? null,
          messages: next?.messages ?? [],
          agents: [],
          isRunning: false,
        }
      }
      return { sessions: filtered }
    })
    void fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {})
  },

  addMessage: (message: ChatMessage) => {
    set((state) => {
      const newMessages = [...state.messages, message]
      const sessions = state.sessions.map((s) =>
        s.id === state.currentSessionId
          ? {
              ...s,
              messages: newMessages,
              chatIntent: state.chatIntent,
              updatedAt: Date.now(),
              title:
                s.messages.length === 0 && message.role === 'user'
                  ? message.content.slice(0, 50)
                  : s.title,
            }
          : s
      )
      return { messages: newMessages, sessions }
    })
    get().recalculateContextTelemetry()
    void get().persistSession()
  },

  updateAgent: (agentId: string, update: Partial<AgentInstance>) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, ...update } : a
      ),
    }))
  },

  appendAgentOutput: (agentId: string, data: string) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, output: a.output + data } : a
      ),
    }))
  },

  setAgents: (agents: AgentInstance[]) => {
    set({ agents })
  },

  clearAgents: () => {
    set({ agents: [] })
  },

  setIsRunning: (running: boolean) => {
    set({ isRunning: running })
  },

  updateSettings: (patch: Partial<Settings>) => {
    set((state) => ({
      settings: { ...state.settings, ...patch },
      ...(patch.previewUrl ? { previewUrl: patch.previewUrl } : {}),
    }))
    void get().persistSettings()
  },

  toggleSidebar: () => {
    set((state) => {
      const newState = !state.sidebarOpen
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('swarm-sidebar-open', JSON.stringify(newState))
        } catch {
          // localStorage may not be available
        }
      }
      return { sidebarOpen: newState }
    })
  },

  toggleSettings: () => {
    set((state) => ({ settingsOpen: !state.settingsOpen }))
  },

  initWebSocket: () => {
    if (wsInitialized) return
    wsInitialized = true

    wsClient.onConnect = () => {
      set({ wsConnected: true, wsConnectionState: 'open' })
    }

    wsClient.onConnectionStateChange = (state) => {
      set({ wsConnectionState: state, wsConnected: state === 'open' })

      if (state === 'reconnecting') {
        const now = Date.now()
        if (now - lastWsToastAt > 10000) {
          lastWsToastAt = now
          toast.error('WebSocket disconnected', { description: 'Attempting to reconnect...' })
        }
      }

      if (state === 'auth_failed') {
        const now = Date.now()
        if (now - lastWsToastAt > 10000) {
          lastWsToastAt = now
          toast.error('WebSocket authentication failed', {
            description: 'Refresh login/session and reconnect.',
          })
        }
      }
    }

    wsClient.onMessage = (msg) => {
      switch (msg.type) {
        case 'agent-output': {
          const sanitized = sanitizeOutputText(msg.data)
          const entry: RunLogEntry = {
            timestamp: Date.now(),
            level: ERROR_PATTERNS.test(msg.data) ? 'error' : 'info',
            source: 'agent',
            agentId: msg.agentId,
            text: sanitized,
          }
          currentRunLogs.push(entry)
          if (currentRunId) {
            set((state) => ({
              runLogs: {
                ...state.runLogs,
                [currentRunId as string]: [...(state.runLogs[currentRunId as string] ?? []), entry],
              },
            }))
          }

          const existing = get().agents.find((a) => a.id === msg.agentId)
          if (existing && sanitized) {
            get().appendAgentOutput(msg.agentId, `${sanitized}\n`)
          }
          const lines = sanitized.split('\n')
          for (const line of lines) {
            if (ERROR_PATTERNS.test(line)) {
              get().addError(msg.agentId, line.trim())
            }
          }
          get().recalculateContextTelemetry()
          if (get().contextTokenPercent >= CONTEXT_HARD_COMPACT_PERCENT) {
            get().autoCompactContext()
          }
          break
        }
        case 'agent-status': {
          const existingAgent = get().agents.find((a) => a.id === msg.agentId)
          if (!existingAgent && msg.status === 'spawning') {
            const role = inferRoleFromId(msg.agentId)
            const newAgent: AgentInstance = {
              id: msg.agentId,
              role,
              label: buildLabelFromId(msg.agentId),
              provider: get().settings.enabledCLIs[0] ?? 'cursor',
              status: 'spawning',
              output: '',
              startedAt: Date.now(),
            }
            set((state) => ({ agents: [...state.agents, newAgent] }))
          } else if (existingAgent) {
            get().updateAgent(msg.agentId, {
              status: msg.status,
              exitCode: msg.exitCode,
              ...(msg.status === 'running' ? { startedAt: existingAgent.startedAt ?? Date.now() } : {}),
              ...(msg.status === 'completed' || msg.status === 'failed' ? { finishedAt: Date.now() } : {}),
            })
          }
          break
        }
        case 'swarm-result': {
          get().handleSwarmResult(msg.result)
          break
        }
        case 'swarm-error': {
          clearPendingRunAck()
          currentRunLogs.push({
            timestamp: Date.now(),
            level: 'error',
            source: 'system',
            text: sanitizeOutputText(msg.error),
          })
          set({ isRunning: false })
          get().addMessage({
            id: generateId(),
            role: 'system',
            content: `Swarm error: ${msg.error}`,
            timestamp: Date.now(),
          })
          currentRunId = null
          currentRunLogs = []
          get().recalculateContextTelemetry()
          toast.error('Swarm failed', { description: msg.error })
          recordSwarmEvent('swarm_error', { error: msg.error })
          break
        }
        case 'ticket-created': {
          get().addTicket(msg.ticket)
          break
        }
        case 'ticket-updated': {
          get().updateTicket(msg.ticketId, msg.update)
          break
        }
        case 'tickets-list': {
          set({ tickets: msg.tickets })
          break
        }
        case 'job-status': {
          const existing = get().jobs.find((j) => j.id === msg.job.id)
          if (existing) {
            get().updateJob(msg.job.id, msg.job)
          } else {
            get().addJob(msg.job)
          }
          break
        }
        case 'run.accepted': {
          currentRunId = msg.runId
          currentRunLogs = []
          set((state) => ({
            runLogs: {
              ...state.runLogs,
              [msg.runId]: [],
            },
          }))
          if (
            pendingRunAckIdempotencyKey === null ||
            msg.idempotencyKey === undefined ||
            msg.idempotencyKey === pendingRunAckIdempotencyKey
          ) {
            clearPendingRunAck()
          }
          recordSwarmEvent('run_accepted', {
            runId: msg.runId,
            sessionId: msg.sessionId,
            idempotencyKey: msg.idempotencyKey,
          })
          get().recalculateContextTelemetry()
          break
        }
        case 'notification': {
          get().addNotification(msg.notification)
          break
        }
        case 'pong':
          break
        default:
          break
      }
    }

    wsClient.onDisconnect = () => {
      set({ wsConnected: false })
    }

    wsClient.onAuthError = (error) => {
      const now = Date.now()
      if (now - lastWsToastAt > 10000) {
        lastWsToastAt = now
        toast.error('WebSocket authentication failed', { description: error })
      }
    }

    wsClient.onFileChange = (event, path) => {
      get().handleFileChange(event, path)
    }

    wsClient.connect()
  },

  setActiveTab: (tab: 'chat' | 'dashboard' | 'ide' | 'testing' | 'eclipse' | 'observability') => {
    set({ activeTab: tab })
  },

  sendMessage: (prompt: string, attachments: Attachment[] = []) => {
    const state = get()
    const selectedAgent = state.selectedAgent

    let sessionId = state.currentSessionId
    if (!sessionId) {
      sessionId = get().createSession()
    }

    const enqueueAttachments = toEnqueueAttachments(attachments)
    const attachmentValidation = validateAttachments(enqueueAttachments)
    if (!attachmentValidation.ok) {
      toast.error('Attachment validation failed', {
        description: attachmentValidation.error ?? 'Invalid attachments',
      })
      return
    }

    get().autoCompactContext()

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      ...(attachments.length > 0 ? { attachments } : {}),
    }

    get().addMessage(userMessage)
    set({ isRunning: true, agents: [] })
    currentRunId = null
    currentRunLogs = []

    get().initWebSocket()

    recordSwarmEvent('swarm_start', {
      sessionId,
      mode: get().mode,
      promptLength: prompt.length,
      attachmentCount: attachments.length,
    })

    wsClient.send({
      type: 'start-swarm',
      prompt,
      sessionId: sessionId,
      mode: get().mode,
      intent: get().chatIntent,
      agentSelectionMode: selectedAgent ? 'manual' : 'auto',
      ...(selectedAgent ? { preferredAgent: selectedAgent } : {}),
      idempotencyKey: userMessage.id,
      ...(enqueueAttachments.length > 0 ? { attachments: enqueueAttachments } : {}),
    })

    clearPendingRunAck()
    pendingRunAckIdempotencyKey = userMessage.id
    pendingRunAckTimer = setTimeout(() => {
      if (pendingRunAckIdempotencyKey !== userMessage.id) {
        return
      }
      pendingRunAckIdempotencyKey = null
      pendingRunAckTimer = null
      set({ isRunning: false })
      currentRunLogs.push({
        timestamp: Date.now(),
        level: 'warn',
        source: 'system',
        text: 'Run submission timeout: server did not acknowledge this run.',
      })
      toast.error('Run submission timed out', {
        description: 'The server did not acknowledge this run. Please retry.',
      })
      recordSwarmEvent('run_ack_timeout', {
        sessionId,
        idempotencyKey: userMessage.id,
      })
    }, RUN_ACCEPTED_TIMEOUT_MS)
  },

  handleSwarmResult: (result: SwarmResult) => {
    clearPendingRunAck()
    const sanitizedOutput = sanitizeOutputText(result.finalOutput)
    const outputQualityPassed = isOutputQualityAcceptable(sanitizedOutput)
    const finalContent = outputQualityPassed
      ? sanitizedOutput
      : 'I could not produce a clean final answer from the latest run. Open Agent logs for diagnostics and retry.'

    if (!outputQualityPassed) {
      currentRunLogs.push({
        timestamp: Date.now(),
        level: 'warn',
        source: 'orchestrator',
        text: 'Final output rejected by quality gate (empty/noisy/non-user-readable).',
      })
    }

    if (currentRunId) {
      set((state) => ({
        runLogs: {
          ...state.runLogs,
          [currentRunId as string]: [...currentRunLogs],
        },
      }))
    }

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
      ...(outputQualityPassed ? { confidence: result.confidence } : {}),
      agents: result.agents,
      sources: result.sources,
      logs: [...currentRunLogs],
      outputQualityPassed,
    }
    get().addMessage(assistantMessage)
    set({ isRunning: false, confidence: outputQualityPassed ? result.confidence : null })
    currentRunLogs = []
    currentRunId = null

    recordSwarmEvent('swarm_complete', {
      confidence: result.confidence,
      agentCount: result.agents?.length ?? 0,
      outputLength: result.finalOutput.length,
    })
  },

  sendPrompt: (prompt: string) => {
    get().sendMessage(prompt)
  },

  cancelSwarm: () => {
    clearPendingRunAck()
    const sessionId = get().currentSessionId
    if (sessionId) {
      wsClient.send({ type: 'cancel-swarm', sessionId })
    }
    set({ isRunning: false })

    recordSwarmEvent('swarm_cancel', { sessionId })
  },

  setCurrentSession: (id: string | null) => {
    if (id === null) {
      get().createSession()
    } else {
      get().switchSession(id)
    }
  },

  setRunning: (running: boolean) => {
    set({ isRunning: running })
  },

  setConfidence: (value: number | null) => {
    set({ confidence: value })
  },

  setSecurityResults: (results: ClientSecurityCheck[]) => {
    set({ securityResults: results })
  },

  setTickets: (tickets: Ticket[]) => {
    set({ tickets })
  },

  updateTicket: (id: string, update: Partial<Ticket>) => {
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === id ? { ...t, ...update } : t
      ),
    }))
  },

  addTicket: (ticket: Ticket) => {
    set((state) => ({ tickets: [...state.tickets, ticket] }))
  },

  getTicketsByStage: (stage: AgentRole) => {
    return get().tickets.filter((t) => t.assignedRole === stage)
  },

  setMode: (mode: AppMode) => {
    set({ mode })
  },

  setChatIntent: (intent: ChatIntent) => {
    set((state) => ({
      chatIntent: intent,
      sessions: state.sessions.map((s) =>
        s.id === state.currentSessionId
          ? { ...s, chatIntent: intent, updatedAt: Date.now() }
          : s
      ),
    }))
    void get().persistSession()
  },

  setSelectedAgent: (agent: CLIProvider | null) => {
    set({ selectedAgent: agent })
  },

  createProject: (name: string, description: string) => {
    const id = generateId()
    const now = Date.now()
    const project: Project = {
      id,
      name,
      description,
      features: [],
      epics: [],
      tickets: [],
      createdAt: now,
      updatedAt: now,
      status: 'planning',
    }
    set((state) => ({
      projects: [...state.projects, project],
      currentProjectId: id,
    }))
    void fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }).catch(() => {})
    return id
  },

  updateProject: (id: string, update: Partial<Project>) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...update, updatedAt: Date.now() } : p
      ),
    }))
    const project = get().projects.find((p) => p.id === id)
    if (project) {
      void fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      }).catch(() => {})
    }
  },

  deleteProject: (id: string) => {
    set((state) => {
      const filtered = state.projects.filter((p) => p.id !== id)
      const isCurrent = state.currentProjectId === id
      return {
        projects: filtered,
        currentProjectId: isCurrent ? (filtered[0]?.id ?? null) : state.currentProjectId,
      }
    })
    void fetch(`/api/projects/${id}`, { method: 'DELETE' }).catch(() => {})
  },

  switchProject: (id: string) => {
    const project = get().projects.find((p) => p.id === id)
    if (!project) return
    set({ currentProjectId: id })
  },

  approveTicket: (id: string) => {
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === id ? { ...t, status: 'approved' as const, updatedAt: Date.now() } : t
      ),
    }))
  },

  rejectTicket: (id: string) => {
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === id ? { ...t, status: 'rejected' as const, updatedAt: Date.now() } : t
      ),
    }))
  },

  addError: (agentId: string, message: string) => {
    set((state) => {
      const newError: SwarmError = {
        id: generateId(),
        agentId,
        message,
        timestamp: Date.now(),
      }
      const updated = [...state.errors, newError]
      if (updated.length > MAX_ERRORS) {
        return { errors: updated.slice(updated.length - MAX_ERRORS) }
      }
      return { errors: updated }
    })
  },

  clearErrors: () => {
    set({ errors: [] })
  },

  setPreviewUrl: (url: string) => {
    set((state) => ({
      previewUrl: url,
      settings: {
        ...state.settings,
        previewUrl: url,
      },
    }))
    void get().persistSettings()
  },

  togglePreview: () => {
    set((state) => ({ showPreview: !state.showPreview }))
  },

  toggleIde: () => {
    set((state) => {
      const newOpen = !state.ideOpen
      return {
        ideOpen: newOpen,
        activeTab: newOpen ? 'ide' : 'chat',
      }
    })
  },

  setActiveFile: (filePath: string) => {
    const file = get().openFiles.find((f) => f.path === filePath)
    if (file) {
      set({ activeFilePath: filePath, showDiff: false })
    }
  },

  setFilesLoading: (loading: boolean) => {
    set({ filesLoading: loading })
  },

  openFileInIde: (filePath: string, content: string, language: string) => {
    set((state) => {
      const exists = state.openFiles.find((f) => f.path === filePath)
      if (exists) {
        return { activeFilePath: filePath, activeTab: 'ide', ideOpen: true, showDiff: false }
      }
      return {
        openFiles: [...state.openFiles, { path: filePath, content, language }],
        activeFilePath: filePath,
        activeTab: 'ide',
        ideOpen: true,
        showDiff: false,
      }
    })
  },

  closeFile: (filePath: string) => {
    set((state) => {
      const filtered = state.openFiles.filter((f) => f.path !== filePath)
      const newActive =
        state.activeFilePath === filePath
          ? filtered[filtered.length - 1]?.path ?? null
          : state.activeFilePath
      return { openFiles: filtered, activeFilePath: newActive }
    })
  },

  updateFileContent: (filePath: string, content: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === filePath ? { ...f, content } : f
      ),
    }))
  },

  reorderOpenFiles: (oldIndex: number, newIndex: number) => {
    set((state) => {
      const files = [...state.openFiles]
      const [removed] = files.splice(oldIndex, 1)
      files.splice(newIndex, 0, removed)
      return { openFiles: files }
    })
  },

  showDiffInIde: (original: string, modified: string, language: string) => {
    set({
      ideDiffOriginal: original,
      ideDiffModified: modified,
      ideDiffLanguage: language,
      showDiff: true,
      activeTab: 'ide',
      ideOpen: true,
    })
  },

  closeDiff: () => {
    set({ showDiff: false, ideDiffOriginal: null, ideDiffModified: null })
  },

  splitEditor: (direction: SplitDirection) => {
    set((state) => {
      const currentGroup = state.editorGroups.find((g) => g.id === state.activeGroupId)
      if (!currentGroup && state.editorGroups.length === 0) {
        const firstGroupId = generateId()
        const secondGroupId = generateId()
        const firstGroup: EditorGroup = {
          id: firstGroupId,
          files: [...state.openFiles],
          activeFilePath: state.activeFilePath,
        }
        const secondGroup: EditorGroup = {
          id: secondGroupId,
          files: [],
          activeFilePath: null,
        }
        return {
          editorGroups: [firstGroup, secondGroup],
          activeGroupId: secondGroupId,
          splitDirection: direction,
        }
      }
      
      if (state.editorGroups.length === 0) {
        const firstGroupId = generateId()
        const secondGroupId = generateId()
        const firstGroup: EditorGroup = {
          id: firstGroupId,
          files: [...state.openFiles],
          activeFilePath: state.activeFilePath,
        }
        const secondGroup: EditorGroup = {
          id: secondGroupId,
          files: [],
          activeFilePath: null,
        }
        return {
          editorGroups: [firstGroup, secondGroup],
          activeGroupId: secondGroupId,
          splitDirection: direction,
        }
      }
      
      const newGroupId = generateId()
      const newGroup: EditorGroup = {
        id: newGroupId,
        files: [],
        activeFilePath: null,
      }
      return {
        editorGroups: [...state.editorGroups, newGroup],
        activeGroupId: newGroupId,
        splitDirection: direction,
      }
    })
  },

  closeEditorGroup: (groupId: string) => {
    set((state) => {
      const filtered = state.editorGroups.filter((g) => g.id !== groupId)
      if (filtered.length === 0) {
        return {
          editorGroups: [],
          activeGroupId: null,
        }
      }
      const newActiveId = state.activeGroupId === groupId
        ? filtered[0].id
        : state.activeGroupId
      return {
        editorGroups: filtered,
        activeGroupId: newActiveId,
      }
    })
  },

  setActiveGroup: (groupId: string) => {
    set({ activeGroupId: groupId })
  },

  moveFileToGroup: (filePath: string, targetGroupId: string) => {
    set((state) => {
      let fileToMove: OpenFile | undefined
      const updatedGroups = state.editorGroups.map((group) => {
        const file = group.files.find((f) => f.path === filePath)
        if (file) {
          fileToMove = file
          const filtered = group.files.filter((f) => f.path !== filePath)
          return {
            ...group,
            files: filtered,
            activeFilePath: group.activeFilePath === filePath
              ? filtered[filtered.length - 1]?.path ?? null
              : group.activeFilePath,
          }
        }
        return group
      })

      if (!fileToMove) return state

      return {
        editorGroups: updatedGroups.map((group) => {
          if (group.id === targetGroupId) {
            const exists = group.files.find((f) => f.path === filePath)
            if (exists) {
              return { ...group, activeFilePath: filePath }
            }
            return {
              ...group,
              files: [...group.files, fileToMove!],
              activeFilePath: filePath,
            }
          }
          return group
        }),
        activeGroupId: targetGroupId,
      }
    })
  },

  openFileInGroup: (groupId: string, filePath: string, content: string, language: string) => {
    set((state) => {
      if (state.editorGroups.length === 0) {
        const newGroup: EditorGroup = {
          id: groupId,
          files: [{ path: filePath, content, language }],
          activeFilePath: filePath,
        }
        return {
          editorGroups: [newGroup],
          activeGroupId: groupId,
          activeTab: 'ide',
          ideOpen: true,
          showDiff: false,
          openFiles: [...state.openFiles, { path: filePath, content, language }],
          activeFilePath: filePath,
        }
      }

      return {
        editorGroups: state.editorGroups.map((group) => {
          if (group.id === groupId) {
            const exists = group.files.find((f) => f.path === filePath)
            if (exists) {
              return { ...group, activeFilePath: filePath }
            }
            return {
              ...group,
              files: [...group.files, { path: filePath, content, language }],
              activeFilePath: filePath,
            }
          }
          return group
        }),
        activeGroupId: groupId,
        activeTab: 'ide',
        ideOpen: true,
        showDiff: false,
        openFiles: state.openFiles.find((f) => f.path === filePath)
          ? state.openFiles
          : [...state.openFiles, { path: filePath, content, language }],
        activeFilePath: filePath,
      }
    })
  },

  closeFileInGroup: (groupId: string, filePath: string) => {
    set((state) => ({
      editorGroups: state.editorGroups.map((group) => {
        if (group.id === groupId) {
          const filtered = group.files.filter((f) => f.path !== filePath)
          return {
            ...group,
            files: filtered,
            activeFilePath: group.activeFilePath === filePath
              ? filtered[filtered.length - 1]?.path ?? null
              : group.activeFilePath,
          }
        }
        return group
      }),
    }))
  },

  setActiveFileInGroup: (groupId: string, filePath: string) => {
    set((state) => ({
      editorGroups: state.editorGroups.map((group) => {
        if (group.id === groupId) {
          const file = group.files.find((f) => f.path === filePath)
          if (file) {
            return { ...group, activeFilePath: filePath }
          }
        }
        return group
      }),
      activeGroupId: groupId,
      activeFilePath: filePath,
      showDiff: false,
    }))
  },

  updateFileContentInGroup: (groupId: string, filePath: string, content: string) => {
    set((state) => ({
      editorGroups: state.editorGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            files: group.files.map((f) =>
              f.path === filePath ? { ...f, content } : f
            ),
          }
        }
        return group
      }),
      openFiles: state.openFiles.map((f) =>
        f.path === filePath ? { ...f, content } : f
      ),
    }))
  },

  setJobs: (jobs: SwarmJob[]) => {
    set({ jobs })
  },

  addJob: (job: SwarmJob) => {
    set((state) => ({ jobs: [job, ...state.jobs] }))
  },

  updateJob: (id: string, update: Partial<SwarmJob>) => {
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...update } : j)),
    }))
  },

  cancelJob: (id: string) => {
    set((state) => ({
      jobs: state.jobs.map((j) =>
        j.id === id && (j.status === 'queued' || j.status === 'running')
          ? { ...j, status: 'cancelled' as const, completedAt: Date.now() }
          : j
      ),
    }))
    recordSwarmEvent('job_cancel', { jobId: id })
  },

  retryJob: (id: string) => {
    const job = get().jobs.find((j) => j.id === id)
    if (!job || job.status !== 'failed') return
    const newJob: SwarmJob = {
      id: generateId(),
      sessionId: job.sessionId,
      prompt: job.prompt,
      mode: job.mode,
      status: 'queued',
      createdAt: Date.now(),
      progress: 0,
    }
    set((state) => ({ jobs: [newJob, ...state.jobs] }))
    recordSwarmEvent('job_retry', { originalJobId: id, newJobId: newJob.id })
  },

  setScheduledTasks: (tasks: ScheduledTask[]) => {
    set({ scheduledTasks: tasks })
  },

  addScheduledTask: (task: ScheduledTask) => {
    set((state) => ({ scheduledTasks: [...state.scheduledTasks, task] }))
    void fetch('/api/scheduler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    }).catch(() => {
      toast.error('Failed to persist scheduled task')
    })
  },

  updateScheduledTask: (id: string, update: Partial<ScheduledTask>) => {
    set((state) => ({
      scheduledTasks: state.scheduledTasks.map((t) =>
        t.id === id ? { ...t, ...update } : t
      ),
    }))
    void fetch(`/api/scheduler/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    }).catch(() => {
      toast.error('Failed to update scheduled task')
    })
  },

  deleteScheduledTask: (id: string) => {
    set((state) => ({
      scheduledTasks: state.scheduledTasks.filter((t) => t.id !== id),
    }))
    void fetch(`/api/scheduler/${id}`, {
      method: 'DELETE',
    }).catch(() => {
      toast.error('Failed to delete scheduled task')
    })
  },

  toggleScheduledTask: (id: string) => {
    const task = get().scheduledTasks.find((t) => t.id === id)
    if (!task) {
      return
    }
    const enabled = !task.enabled
    set((state) => ({
      scheduledTasks: state.scheduledTasks.map((t) =>
        t.id === id ? { ...t, enabled } : t
      ),
    }))
    void fetch(`/api/scheduler/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).catch(() => {
      toast.error('Failed to toggle scheduled task')
    })
  },

  setIdeas: (ideas: Idea[]) => {
    set({ ideas })
  },

  generateIdeas: () => {
    const TEMPLATE_IDEAS: Omit<Idea, 'id'>[] = [
      { title: 'SaaS Analytics Dashboard', description: 'Build a real-time analytics dashboard with user tracking, funnel visualizations, and revenue metrics for SaaS products.', complexity: 'L' },
      { title: 'REST API Generator CLI', description: 'A CLI tool that scaffolds REST APIs from OpenAPI specs with validation, auth middleware, and database integration.', complexity: 'M' },
      { title: 'Browser Extension: Tab Manager', description: 'Chrome extension that groups, saves, and restores tab sessions with search and tagging capabilities.', complexity: 'S' },
      { title: 'Real-time Chat Platform', description: 'WebSocket-based chat app with rooms, file sharing, message reactions, and read receipts.', complexity: 'L' },
      { title: 'Markdown Blog Engine', description: 'Static site generator that converts markdown files into a beautiful blog with RSS, SEO, and dark mode.', complexity: 'M' },
      { title: 'Task Automation Service', description: 'Microservice that runs scheduled tasks with retry logic, webhooks, and a monitoring dashboard.', complexity: 'L' },
      { title: 'Component Library Starter', description: 'React component library with Storybook, automated testing, and npm publishing pipeline.', complexity: 'M' },
      { title: 'Personal Finance Tracker', description: 'Mobile-first web app for tracking expenses, budgets, and investments with chart visualizations.', complexity: 'XL' },
      { title: 'AI Code Review Bot', description: 'GitHub bot that automatically reviews PRs, suggests improvements, and checks for security issues.', complexity: 'L' },
      { title: 'E-commerce Storefront', description: 'Full-stack e-commerce site with product catalog, cart, Stripe checkout, and order management.', complexity: 'XL' },
    ]
    const shuffled = [...TEMPLATE_IDEAS].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, 5).map((idea) => ({
      ...idea,
      id: generateId(),
    }))
    set({ ideas: selected })
  },

  setActivePanel: (panel: 'queue' | 'schedule' | 'ideas' | null) => {
    set((state) => ({
      activePanel: state.activePanel === panel ? null : panel,
    }))
  },

  loadSessions: async () => {
    set({ sessionsLoading: true })
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const data: unknown = await res.json()
      const parsed = Array.isArray(data)
        ? data.map((s) => SessionSchema.parse(s))
        : []
      set({ sessions: parsed })
      get().recalculateContextTelemetry()
    } catch {
      // API may not be available in UI-only dev mode
    } finally {
      set({ sessionsLoading: false })
    }
  },

  persistSession: async () => {
    const state = get()
    const session = state.sessions.find((s) => s.id === state.currentSessionId)
    if (!session) return
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      })
    } catch {
      // API may not be available
    }
  },

  loadSettings: async () => {
    set({ settingsLoading: true })
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data: unknown = await res.json()
      const parsed = SettingsSchema.parse(data)
      set({
        settings: parsed,
        previewUrl: parsed.previewUrl || getDefaultPreviewUrl(),
      })
    } catch {
      // API may not be available
    } finally {
      set({ settingsLoading: false })
    }
  },

    persistSettings: async () => {
      try {
        const settings = get().settings
        if (settings.apiKeys) {
          await fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings.apiKeys),
          })
        }
        const { apiKeys, ...nonSecretSettings } = settings
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nonSecretSettings),
        })
      } catch {
        // API may not be available
      }
    },

  loadJobs: async () => {
    try {
      const res = await fetch('/api/jobs')
      if (!res.ok) return
      const data: unknown = await res.json()
      if (Array.isArray(data)) {
        set({ jobs: data as SwarmJob[] })
      }
    } catch {
      // API may not be available
    }
  },

  loadScheduledTasks: async () => {
    try {
      const res = await fetch('/api/scheduler')
      if (!res.ok) return
      const data: unknown = await res.json()
      if (Array.isArray(data)) {
        set({ scheduledTasks: data as ScheduledTask[] })
      }
    } catch {
      // API may not be available
    }
  },

  addEpic: (projectId: string, epic: Epic) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, epics: [...p.epics, epic], updatedAt: Date.now() }
          : p
      ),
    }))
  },

  updateEpic: (projectId: string, epicId: string, update: Partial<Epic>) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              epics: p.epics.map((e) =>
                e.id === epicId ? { ...e, ...update, updatedAt: Date.now() } : e
              ),
              updatedAt: Date.now(),
            }
          : p
      ),
    }))
  },

  deleteEpic: (projectId: string, epicId: string) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              epics: p.epics.filter((e) => e.id !== epicId),
              tickets: p.tickets.map((t) =>
                t.epicId === epicId ? { ...t, epicId: undefined, updatedAt: Date.now() } : t
              ),
              updatedAt: Date.now(),
            }
          : p
      ),
    }))
  },

  assignTicketToEpic: (projectId: string, epicId: string, ticketId: string) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              epics: p.epics.map((e) =>
                e.id === epicId && !e.ticketIds.includes(ticketId)
                  ? { ...e, ticketIds: [...e.ticketIds, ticketId], updatedAt: Date.now() }
                  : e
              ),
              tickets: p.tickets.map((t) =>
                t.id === ticketId ? { ...t, epicId, updatedAt: Date.now() } : t
              ),
              updatedAt: Date.now(),
            }
          : p
      ),
    }))
  },

  removeTicketFromEpic: (projectId: string, epicId: string, ticketId: string) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              epics: p.epics.map((e) =>
                e.id === epicId
                  ? { ...e, ticketIds: e.ticketIds.filter((id) => id !== ticketId), updatedAt: Date.now() }
                  : e
              ),
              tickets: p.tickets.map((t) =>
                t.id === ticketId && t.epicId === epicId
                  ? { ...t, epicId: undefined, updatedAt: Date.now() }
                  : t
              ),
              updatedAt: Date.now(),
            }
          : p
      ),
    }))
  },

  moveTicketToStatus: (ticketId: string, newStatus: TicketStatus, newIndex: number) => {
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, status: newStatus, updatedAt: Date.now() }
          : t
      ),
      projects: state.projects.map((p) => ({
        ...p,
        tickets: p.tickets.map((t) =>
          t.id === ticketId
            ? { ...t, status: newStatus, updatedAt: Date.now() }
            : t
        ),
        ticketOrder: {
          ...p.ticketOrder,
          [newStatus]: (() => {
            const currentOrder = p.ticketOrder?.[newStatus] ?? []
            const ticketIds = p.tickets
              .filter((t) => t.status === newStatus && t.id !== ticketId)
              .map((t) => t.id)
            const orderedIds = currentOrder.filter((id) => ticketIds.includes(id))
            const unorderedIds = ticketIds.filter((id) => !orderedIds.includes(id))
            const allIds = [...orderedIds, ...unorderedIds]
            const clampedIndex = Math.min(Math.max(0, newIndex), allIds.length)
            allIds.splice(clampedIndex, 0, ticketId)
            return allIds
          })(),
        },
        updatedAt: Date.now(),
      })),
    }))
    const project = get().projects.find((p) =>
      p.tickets.some((t) => t.id === ticketId)
    )
    if (project) {
      void fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      }).catch(() => {})
    }
  },

  updateKanbanColumns: (projectId: string, columns: KanbanColumn[]) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, kanbanColumns: columns, updatedAt: Date.now() }
          : p
      ),
    }))
    const project = get().projects.find((p) => p.id === projectId)
    if (project) {
      void fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      }).catch(() => {})
    }
  },

  updateTicketOrder: (projectId: string, statusId: string, ticketIds: string[]) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              ticketOrder: { ...p.ticketOrder, [statusId]: ticketIds },
              updatedAt: Date.now(),
            }
          : p
      ),
    }))
    const project = get().projects.find((p) => p.id === projectId)
    if (project) {
      void fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      }).catch(() => {})
    }
  },

  addTicketDependency: (ticketId: string, dependencyId: string) => {
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId && !t.dependencies?.includes(dependencyId)
          ? { ...t, dependencies: [...(t.dependencies || []), dependencyId], updatedAt: Date.now() }
          : t
      ),
      projects: state.projects.map((p) => ({
        ...p,
        tickets: p.tickets.map((t) =>
          t.id === ticketId && !t.dependencies?.includes(dependencyId)
            ? { ...t, dependencies: [...(t.dependencies || []), dependencyId], updatedAt: Date.now() }
            : t
        ),
        updatedAt: Date.now(),
      })),
    }))
  },

  removeTicketDependency: (ticketId: string, dependencyId: string) => {
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              dependencies: (t.dependencies || []).filter((id) => id !== dependencyId),
              blockedBy: (t.blockedBy || []).filter((id) => id !== dependencyId),
              updatedAt: Date.now(),
            }
          : t
      ),
      projects: state.projects.map((p) => ({
        ...p,
        tickets: p.tickets.map((t) =>
          t.id === ticketId
            ? {
                ...t,
                dependencies: (t.dependencies || []).filter((id) => id !== dependencyId),
                blockedBy: (t.blockedBy || []).filter((id) => id !== dependencyId),
                updatedAt: Date.now(),
              }
            : t
        ),
        updatedAt: Date.now(),
      })),
    }))
  },

  refreshFileTree: () => {
    set((state) => ({ fileTreeVersion: state.fileTreeVersion + 1 }))
  },

  watchProject: (projectPath: string) => {
    get().initWebSocket()
    wsClient.watchProject(projectPath)
    set({ watchedProjectPath: projectPath })
  },

  unwatchProject: () => {
    wsClient.unwatchProject()
    set({ watchedProjectPath: null })
  },

  handleFileChange: (event: 'add' | 'change' | 'unlink', path: string) => {
    get().refreshFileTree()
    
    if (event === 'change') {
      const openFile = get().openFiles.find((f) => f.path === path)
      if (openFile) {
        void fetch(`/api/files/${encodeURIComponent(path)}`)
          .then((res) => res.ok ? res.text() : null)
          .then((content) => {
            if (content !== null) {
              get().updateFileContent(path, content)
            }
          })
          .catch(() => {})
      }
    } else if (event === 'unlink') {
      const openFile = get().openFiles.find((f) => f.path === path)
      if (openFile) {
        get().closeFile(path)
        toast.info('File deleted', { description: path.split(/[\\/]/).pop() })
      }
    }
  },

  setDebugSessions: (sessions: DebugSessionState[]) => {
    set({ debugSessions: sessions })
  },

  setActiveDebugSession: (sessionId: string | null) => {
    set({ activeDebugSessionId: sessionId })
  },

  addBreakpoint: (file: string, breakpoint: DebugBreakpoint) => {
    set((state) => {
      const newBreakpoints = new Map(state.breakpoints)
      const fileBreakpoints = newBreakpoints.get(file) || []
      const exists = fileBreakpoints.some((bp) => bp.line === breakpoint.line)
      if (!exists) {
        newBreakpoints.set(file, [...fileBreakpoints, breakpoint])
      }
      return { breakpoints: newBreakpoints }
    })
  },

  removeBreakpoint: (file: string, breakpointId: string) => {
    set((state) => {
      const newBreakpoints = new Map(state.breakpoints)
      const fileBreakpoints = newBreakpoints.get(file) || []
      newBreakpoints.set(file, fileBreakpoints.filter((bp) => bp.id !== breakpointId))
      return { breakpoints: newBreakpoints }
    })
  },

  toggleBreakpoint: (file: string, breakpointId: string) => {
    set((state) => {
      const newBreakpoints = new Map(state.breakpoints)
      const fileBreakpoints = newBreakpoints.get(file) || []
      newBreakpoints.set(
        file,
        fileBreakpoints.map((bp) =>
          bp.id === breakpointId ? { ...bp, enabled: !bp.enabled } : bp
        )
      )
      return { breakpoints: newBreakpoints }
    })
  },

  clearBreakpoints: (file?: string) => {
    set((state) => {
      if (file) {
        const newBreakpoints = new Map(state.breakpoints)
        newBreakpoints.delete(file)
        return { breakpoints: newBreakpoints }
      }
      return { breakpoints: new Map() }
    })
  },

  setCurrentDebugLine: (line: { file: string; line: number } | null) => {
    set({ currentDebugLine: line })
  },

  getBreakpointsForFile: (file: string) => {
    return get().breakpoints.get(file) || []
  },

  hydrateSidebar: () => {
    if (sidebarHydrated) return
    sidebarHydrated = true
    const persisted = getPersistedSidebarState()
    set({ sidebarOpen: persisted })
  },

  addNotification: (notification: Notification) => {
    set((state) => {
      const MAX_NOTIFICATIONS = 100
      const updated = [notification, ...state.notifications]
      if (updated.length > MAX_NOTIFICATIONS) {
        return { notifications: updated.slice(0, MAX_NOTIFICATIONS) }
      }
      return { notifications: updated }
    })
  },

  markNotificationRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
  },

  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }))
  },

  clearNotifications: () => {
    set({ notifications: [] })
  },

  toggleNotificationCenter: () => {
    set((state) => ({ notificationCenterOpen: !state.notificationCenterOpen }))
  },

  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.read).length
  },

  fetchBranches: async () => {
    const projectPath = get().settings.projectPath
    if (!projectPath) return

    set({ branchesLoading: true })
    try {
      const res = await fetch(`/api/git/branches?path=${encodeURIComponent(projectPath)}`)
      if (!res.ok) throw new Error('Failed to fetch branches')
      const data = await res.json()
      set({
        branches: data.branches || [],
        currentBranch: data.currentBranch || null,
      })
    } catch (error) {
      toast.error('Failed to fetch branches')
    } finally {
      set({ branchesLoading: false })
    }
  },

  createBranch: async (name: string, checkout = true, baseBranch?: string) => {
    const projectPath = get().settings.projectPath
    if (!projectPath) {
      toast.error('No project path set')
      return
    }

    try {
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, checkout, cwd: projectPath, baseBranch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create branch')
      toast.success(`Branch "${name}" created${checkout ? ' and checked out' : ''}`)
      await get().fetchBranches()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create branch')
    }
  },

  checkoutBranch: async (name: string) => {
    const projectPath = get().settings.projectPath
    if (!projectPath) {
      toast.error('No project path set')
      return
    }

    try {
      const res = await fetch(`/api/git/branches/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', cwd: projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to checkout branch')
      toast.success(`Switched to branch "${name}"`)
      await get().fetchBranches()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to checkout branch')
    }
  },

  deleteBranch: async (name: string, force = false) => {
    const projectPath = get().settings.projectPath
    if (!projectPath) {
      toast.error('No project path set')
      return
    }

    try {
      const res = await fetch(
        `/api/git/branches/${encodeURIComponent(name)}?path=${encodeURIComponent(projectPath)}&force=${force}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete branch')
      toast.success(`Branch "${name}" deleted`)
      await get().fetchBranches()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete branch')
    }
  },

  loadWorkspaces: async () => {
    set({ workspacesLoading: true })
    try {
      const res = await fetch('/api/workspaces')
      if (!res.ok) return
      const data = await res.json()
      set({ workspaces: data.workspaces || [] })
    } catch {
      // API may not be available
    } finally {
      set({ workspacesLoading: false })
    }
  },

  createWorkspace: async (name: string, path: string) => {
    const id = generateId()
    const now = new Date().toISOString()
    const workspace: Workspace = {
      id,
      name,
      path,
      createdAt: now,
      lastOpenedAt: now,
    }

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create workspace')
      }
      set((state) => ({
        workspaces: [...state.workspaces, workspace],
        currentWorkspaceId: id,
        settings: { ...state.settings, projectPath: path },
      }))
      toast.success(`Workspace "${name}" created`)
      return id
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create workspace')
      return ''
    }
  },

  switchWorkspace: (id: string) => {
    const workspace = get().workspaces.find((w) => w.id === id)
    if (!workspace) return

    const now = new Date().toISOString()
    set((state) => ({
      currentWorkspaceId: id,
      settings: { ...state.settings, projectPath: workspace.path },
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, lastOpenedAt: now } : w
      ),
      openFiles: [],
      activeFilePath: null,
      editorGroups: [],
      activeGroupId: null,
    }))

    void fetch(`/api/workspaces/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastOpenedAt: now }),
    }).catch(() => {})

    get().refreshFileTree()
    toast.success(`Switched to workspace "${workspace.name}"`)
  },

  deleteWorkspace: async (id: string) => {
    try {
      const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete workspace')
      }
      set((state) => {
        const filtered = state.workspaces.filter((w) => w.id !== id)
        const isCurrent = state.currentWorkspaceId === id
        return {
          workspaces: filtered,
          currentWorkspaceId: isCurrent ? (filtered[0]?.id ?? null) : state.currentWorkspaceId,
        }
      })
      toast.success('Workspace deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete workspace')
    }
  },

  updateWorkspace: async (id: string, update: Partial<Workspace>) => {
    try {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update workspace')
      }
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === id ? { ...w, ...update } : w
        ),
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update workspace')
    }
  },

  recalculateContextTelemetry: () => {
    const state = get()
    const telemetry = estimateContextTelemetry(
      state.messages,
      currentRunLogs,
      state.contextWindowTokens
    )

    set((prev) => {
      let tokenPressureEvents = prev.tokenPressureEvents
      if (
        telemetry.percentUsed >= CONTEXT_WARN_PERCENT &&
        prev.contextTokenPercent < CONTEXT_WARN_PERCENT
      ) {
        tokenPressureEvents += 1
      }

      const contextCompactionStatus: ContextCompactionStatus =
        prev.contextCompactionStatus === 'Compacted' &&
        telemetry.percentUsed < CONTEXT_WARN_PERCENT
          ? 'Idle'
          : prev.contextCompactionStatus

      return {
        contextTokensUsed: telemetry.usedTokens,
        contextTokenPercent: telemetry.percentUsed,
        tokenPressureEvents,
        contextCompactionStatus,
      }
    })
  },

  autoCompactContext: () => {
    get().recalculateContextTelemetry()
    const state = get()
    if (state.contextTokenPercent < CONTEXT_SOFT_COMPACT_PERCENT) {
      return
    }

    const startPercent = state.contextTokenPercent
    set({ contextCompactionStatus: 'Compacting' })

    const compacted = compactContextMessages(
      state.messages,
      state.contextWindowTokens,
      12
    )

    if (!compacted.summaryInserted) {
      set({ contextCompactionStatus: 'Idle' })
      return
    }

    const now = Date.now()
    set((prev) => ({
      messages: compacted.messages,
      sessions: prev.sessions.map((session) =>
        session.id === prev.currentSessionId
          ? { ...session, messages: compacted.messages, updatedAt: now }
          : session
      ),
      contextCompactionStatus: 'Compacted',
      lastContextCompactionAt: now,
      contextCompactionCount: prev.contextCompactionCount + 1,
    }))

    if (startPercent >= CONTEXT_HARD_COMPACT_PERCENT) {
      toast.warning('Context compacted', {
        description: `Context pressure was ${Math.round(startPercent)}%; summarized older messages automatically.`,
      })
    }

    get().recalculateContextTelemetry()
    void get().persistSession()
  },
}))
