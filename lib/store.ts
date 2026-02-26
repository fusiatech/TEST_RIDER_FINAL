import { create } from 'zustand'
import type { AgentInstance, AgentRole, ChatMessage, CLIProvider, Session, Settings, SwarmResult, Ticket, Project, SwarmJob, ScheduledTask } from '@/lib/types'
import { DEFAULT_SETTINGS, ROLE_LABELS, SessionSchema, SettingsSchema } from '@/lib/types'
import { generateId } from '@/lib/utils'
import { wsClient } from '@/lib/ws-client'
import { toast } from 'sonner'

/* ── Client-side types for dashboard panels ─────────────────────── */

export interface ClientSecurityCheck {
  name: string
  passed: boolean
  output: string
}

let wsInitialized = false

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

export type IdeaComplexity = 'S' | 'M' | 'L' | 'XL'

export interface Idea {
  id: string
  title: string
  description: string
  complexity: IdeaComplexity
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
  activeTab: 'chat' | 'dashboard' | 'ide' | 'testing' | 'eclipse'
  wsConnected: boolean
  securityResults: ClientSecurityCheck[]
  tickets: Ticket[]
  mode: AppMode
  selectedAgent: CLIProvider | null
  projects: Project[]
  currentProjectId: string | null
  errors: SwarmError[]
  previewUrl: string
  showPreview: boolean
  sessionsLoading: boolean
  settingsLoading: boolean
  ideOpen: boolean
  openFiles: OpenFile[]
  activeFilePath: string | null
  ideDiffOriginal: string | null
  ideDiffModified: string | null
  ideDiffLanguage: string
  showDiff: boolean
  jobs: SwarmJob[]
  scheduledTasks: ScheduledTask[]
  ideas: Idea[]
  activePanel: 'queue' | 'schedule' | 'ideas' | null

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
  sendMessage: (prompt: string) => void
  handleSwarmResult: (result: SwarmResult) => void
  sendPrompt: (prompt: string) => void
  cancelSwarm: () => void
  setCurrentSession: (id: string | null) => void
  setRunning: (running: boolean) => void
  setConfidence: (value: number | null) => void
  setActiveTab: (tab: 'chat' | 'dashboard' | 'ide' | 'testing' | 'eclipse') => void
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
  openFileInIde: (filePath: string, content: string, language: string) => void
  closeFile: (filePath: string) => void
  updateFileContent: (filePath: string, content: string) => void
  showDiffInIde: (original: string, modified: string, language: string) => void
  closeDiff: () => void
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
  securityResults: [],
  tickets: [],
  mode: 'chat' as AppMode,
  selectedAgent: null,
  projects: [],
  currentProjectId: null,
  errors: [],
  previewUrl: 'http://localhost:3001',
  showPreview: false,
  sessionsLoading: false,
  settingsLoading: false,
  ideOpen: false,
  openFiles: [],
  activeFilePath: null,
  ideDiffOriginal: null,
  ideDiffModified: null,
  ideDiffLanguage: 'typescript',
  showDiff: false,
  jobs: [],
  scheduledTasks: [],
  ideas: [],
  activePanel: null,

  createSession: () => {
    const id = generateId()
    const session: Session = {
      id,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
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
      agents: [],
      isRunning: false,
    })
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
    }))
    void get().persistSettings()
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }))
  },

  toggleSettings: () => {
    set((state) => ({ settingsOpen: !state.settingsOpen }))
  },

  initWebSocket: () => {
    if (wsInitialized) return
    wsInitialized = true

    wsClient.onMessage = (msg) => {
      switch (msg.type) {
        case 'agent-output': {
          const existing = get().agents.find((a) => a.id === msg.agentId)
          if (existing) {
            get().appendAgentOutput(msg.agentId, msg.data)
          }
          const lines = msg.data.split('\n')
          for (const line of lines) {
            if (ERROR_PATTERNS.test(line)) {
              get().addError(msg.agentId, line.trim())
            }
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
          set({ isRunning: false })
          get().addMessage({
            id: generateId(),
            role: 'system',
            content: `Swarm error: ${msg.error}`,
            timestamp: Date.now(),
          })
          toast.error('Swarm failed', { description: msg.error })
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
        case 'pong':
          break
        default:
          break
      }
    }

    wsClient.onDisconnect = () => {
      set({ wsConnected: false })
      toast.error('WebSocket disconnected', { description: 'Attempting to reconnect...' })
    }

    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '3001'
    const protocol =
      typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? 'wss:'
        : 'ws:'
    const hostname =
      typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    wsClient.connect(`${protocol}//${hostname}:${wsPort}`)
    set({ wsConnected: true })
  },

  setActiveTab: (tab: 'chat' | 'dashboard' | 'ide' | 'testing' | 'eclipse') => {
    set({ activeTab: tab })
  },

  sendMessage: (prompt: string) => {
    const state = get()

    let sessionId = state.currentSessionId
    if (!sessionId) {
      sessionId = get().createSession()
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    }

    get().addMessage(userMessage)
    set({ isRunning: true, agents: [] })

    get().initWebSocket()

    wsClient.send({
      type: 'start-swarm',
      prompt,
      sessionId: sessionId,
      mode: get().mode,
    })
  },

  handleSwarmResult: (result: SwarmResult) => {
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: result.finalOutput,
      timestamp: Date.now(),
      confidence: result.confidence,
      agents: result.agents,
      sources: result.sources,
    }
    get().addMessage(assistantMessage)
    set({ isRunning: false, confidence: result.confidence })
  },

  sendPrompt: (prompt: string) => {
    get().sendMessage(prompt)
  },

  cancelSwarm: () => {
    const sessionId = get().currentSessionId
    if (sessionId) {
      wsClient.send({ type: 'cancel-swarm', sessionId })
    }
    set({ isRunning: false })
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
    set({ previewUrl: url })
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
  },

  setScheduledTasks: (tasks: ScheduledTask[]) => {
    set({ scheduledTasks: tasks })
  },

  addScheduledTask: (task: ScheduledTask) => {
    set((state) => ({ scheduledTasks: [...state.scheduledTasks, task] }))
  },

  updateScheduledTask: (id: string, update: Partial<ScheduledTask>) => {
    set((state) => ({
      scheduledTasks: state.scheduledTasks.map((t) =>
        t.id === id ? { ...t, ...update } : t
      ),
    }))
  },

  deleteScheduledTask: (id: string) => {
    set((state) => ({
      scheduledTasks: state.scheduledTasks.filter((t) => t.id !== id),
    }))
  },

  toggleScheduledTask: (id: string) => {
    set((state) => ({
      scheduledTasks: state.scheduledTasks.map((t) =>
        t.id === id ? { ...t, enabled: !t.enabled } : t
      ),
    }))
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
      set({ settings: parsed })
    } catch {
      // API may not be available
    } finally {
      set({ settingsLoading: false })
    }
  },

  persistSettings: async () => {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(get().settings),
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
}))
