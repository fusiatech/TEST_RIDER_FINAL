import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { 
  Session, 
  Settings, 
  Project, 
  SwarmJob, 
  ScheduledTask, 
  EvidenceLedgerEntry, 
  TestRunSummary,
  User,
  Workspace,
  AuditLogEntry,
  Prompt,
  PromptVersion,
  Tenant
} from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'

const mockWrite = vi.fn().mockResolvedValue(undefined)
const mockRead = vi.fn().mockResolvedValue(undefined)

let mockDbData: {
  sessions: Session[]
  settings: Settings
  projects: Project[]
  jobs: SwarmJob[]
  scheduledTasks: ScheduledTask[]
  evidence: EvidenceLedgerEntry[]
  testRuns: TestRunSummary[]
  extensions: []
  extensionConfigs: []
  users: User[]
  workspaces: Workspace[]
  auditLog: AuditLogEntry[]
  prompts: Prompt[]
  tenants: Tenant[]
}

vi.mock('lowdb', () => ({
  Low: vi.fn().mockImplementation(() => {
    const dbProxy = {
      get data() {
        return mockDbData
      },
      set data(value: typeof mockDbData) {
        Object.assign(mockDbData, value)
      },
      read: mockRead,
      write: mockWrite,
    }
    return dbProxy
  }),
}))

vi.mock('lowdb/node', () => ({
  JSONFile: vi.fn(),
}))

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace('encrypted:', '')),
  isEncrypted: vi.fn((value: string) => value?.startsWith('encrypted:')),
  getEncryptionSecret: vi.fn(() => 'test-secret'),
}))

describe('storage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    
    mockDbData = {
      sessions: [],
      settings: { ...DEFAULT_SETTINGS },
      projects: [],
      jobs: [],
      scheduledTasks: [],
      evidence: [],
      testRuns: [],
      extensions: [],
      extensionConfigs: [],
      users: [],
      workspaces: [],
      auditLog: [],
      prompts: [],
      tenants: [],
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /* ── Session CRUD ─────────────────────────────────────────────── */

  describe('Session CRUD operations', () => {
    it('getSessions returns empty array initially', async () => {
      const { getSessions } = await import('@/server/storage')
      const sessions = await getSessions()
      expect(sessions).toEqual([])
    })

    it('getSessions returns all sessions', async () => {
      const session1: Session = {
        id: 'session-1',
        title: 'Test Session 1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        mode: 'chat',
      }
      const session2: Session = {
        id: 'session-2',
        title: 'Test Session 2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        mode: 'chat',
      }
      mockDbData.sessions = [session1, session2]

      const { getSessions } = await import('@/server/storage')
      const sessions = await getSessions()
      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toBe('session-1')
      expect(sessions[1].id).toBe('session-2')
    })

    it('getSession returns undefined for non-existent session', async () => {
      const { getSession } = await import('@/server/storage')
      const session = await getSession('non-existent')
      expect(session).toBeUndefined()
    })

    it('getSession returns the correct session by id', async () => {
      const testSession: Session = {
        id: 'session-123',
        title: 'Test Session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        mode: 'chat',
      }
      mockDbData.sessions = [testSession]

      const { getSession } = await import('@/server/storage')
      const session = await getSession('session-123')
      expect(session).toBeDefined()
      expect(session?.id).toBe('session-123')
      expect(session?.title).toBe('Test Session')
    })

    it('saveSession creates a new session', async () => {
      const { saveSession } = await import('@/server/storage')
      const newSession: Session = {
        id: 'new-session',
        title: 'New Session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        mode: 'chat',
      }

      await saveSession(newSession)
      expect(mockDbData.sessions).toHaveLength(1)
      expect(mockDbData.sessions[0].id).toBe('new-session')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveSession updates an existing session', async () => {
      const existingSession: Session = {
        id: 'existing-session',
        title: 'Original Title',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        mode: 'chat',
      }
      mockDbData.sessions = [existingSession]

      const { saveSession } = await import('@/server/storage')
      const updatedSession: Session = {
        ...existingSession,
        title: 'Updated Title',
        updatedAt: Date.now(),
      }

      await saveSession(updatedSession)
      expect(mockDbData.sessions).toHaveLength(1)
      expect(mockDbData.sessions[0].title).toBe('Updated Title')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('deleteSession removes the session', async () => {
      const session: Session = {
        id: 'to-delete',
        title: 'Delete Me',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        mode: 'chat',
      }
      mockDbData.sessions = [session]

      const { deleteSession } = await import('@/server/storage')
      await deleteSession('to-delete')
      expect(mockDbData.sessions).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })

    it('deleteSession does nothing for non-existent session', async () => {
      const session: Session = {
        id: 'keep-me',
        title: 'Keep Me',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        mode: 'chat',
      }
      mockDbData.sessions = [session]

      const { deleteSession } = await import('@/server/storage')
      await deleteSession('non-existent')
      expect(mockDbData.sessions).toHaveLength(1)
      expect(mockDbData.sessions[0].id).toBe('keep-me')
    })
  })

  /* ── Settings ─────────────────────────────────────────────────── */

  describe('Settings operations', () => {
    it('getSettings returns default settings', async () => {
      const { getSettings } = await import('@/server/storage')
      const settings = await getSettings()
      expect(settings).toBeDefined()
      expect(settings.enabledCLIs).toEqual(['cursor'])
    })

    it('getSettings decrypts API keys', async () => {
      mockDbData.settings = {
        ...DEFAULT_SETTINGS,
        apiKeys: {
          openai: 'encrypted:sk-test-key',
        },
      }

      const { getSettings } = await import('@/server/storage')
      const settings = await getSettings()
      expect(settings.apiKeys?.openai).toBe('sk-test-key')
    })

    it('saveSettings encrypts API keys', async () => {
      const { saveSettings } = await import('@/server/storage')
      const newSettings: Settings = {
        ...DEFAULT_SETTINGS,
        apiKeys: {
          openai: 'sk-plain-key',
        },
      }

      await saveSettings(newSettings)
      expect(mockDbData.settings.apiKeys?.openai).toBe('encrypted:sk-plain-key')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveSettings preserves other settings', async () => {
      const { saveSettings } = await import('@/server/storage')
      const newSettings: Settings = {
        ...DEFAULT_SETTINGS,
        maxRuntimeSeconds: 300,
        researchDepth: 'deep',
      }

      await saveSettings(newSettings)
      expect(mockDbData.settings.maxRuntimeSeconds).toBe(300)
      expect(mockDbData.settings.researchDepth).toBe('deep')
    })
  })

  /* ── Project CRUD ─────────────────────────────────────────────── */

  describe('Project CRUD operations', () => {
    it('getProjects returns empty array initially', async () => {
      const { getProjects } = await import('@/server/storage')
      const projects = await getProjects()
      expect(projects).toEqual([])
    })

    it('getProjects backfills ticket evidenceIds', async () => {
      const project: Project = {
        id: 'project-1',
        name: 'Test Project',
        description: 'Test',
        features: [],
        epics: [],
        tickets: [
          {
            id: 'ticket-1',
            projectId: 'project-1',
            title: 'Test Ticket',
            description: 'Test',
            acceptanceCriteria: [],
            complexity: 'M',
            status: 'backlog',
            assignedRole: 'coder',
            dependencies: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } as any,
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'planning',
      }
      mockDbData.projects = [project]

      const { getProjects } = await import('@/server/storage')
      const projects = await getProjects()
      expect(projects[0].tickets[0].evidenceIds).toEqual([])
    })

    it('getProject returns undefined for non-existent project', async () => {
      const { getProject } = await import('@/server/storage')
      const project = await getProject('non-existent')
      expect(project).toBeUndefined()
    })

    it('getProject returns the correct project', async () => {
      const testProject: Project = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        features: ['feature-1'],
        epics: [],
        tickets: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'planning',
      }
      mockDbData.projects = [testProject]

      const { getProject } = await import('@/server/storage')
      const project = await getProject('project-123')
      expect(project).toBeDefined()
      expect(project?.name).toBe('Test Project')
    })

    it('saveProject creates a new project', async () => {
      const { saveProject } = await import('@/server/storage')
      const newProject: Project = {
        id: 'new-project',
        name: 'New Project',
        description: 'New Description',
        features: [],
        epics: [],
        tickets: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'planning',
      }

      await saveProject(newProject)
      expect(mockDbData.projects).toHaveLength(1)
      expect(mockDbData.projects[0].id).toBe('new-project')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveProject updates an existing project', async () => {
      const existingProject: Project = {
        id: 'existing-project',
        name: 'Original Name',
        description: 'Original',
        features: [],
        epics: [],
        tickets: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'planning',
      }
      mockDbData.projects = [existingProject]

      const { saveProject } = await import('@/server/storage')
      const updatedProject: Project = {
        ...existingProject,
        name: 'Updated Name',
        status: 'in_progress',
      }

      await saveProject(updatedProject)
      expect(mockDbData.projects).toHaveLength(1)
      expect(mockDbData.projects[0].name).toBe('Updated Name')
      expect(mockDbData.projects[0].status).toBe('in_progress')
    })

    it('deleteProject removes the project', async () => {
      const project: Project = {
        id: 'to-delete',
        name: 'Delete Me',
        description: 'Test',
        features: [],
        epics: [],
        tickets: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'planning',
      }
      mockDbData.projects = [project]

      const { deleteProject } = await import('@/server/storage')
      await deleteProject('to-delete')
      expect(mockDbData.projects).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })
  })

  /* ── Job Queue ────────────────────────────────────────────────── */

  describe('Job queue operations', () => {
    it('getJobs returns empty array initially', async () => {
      const { getJobs } = await import('@/server/storage')
      const jobs = await getJobs()
      expect(jobs).toEqual([])
    })

    it('getJobs returns all jobs', async () => {
      const job1: SwarmJob = {
        id: 'job-1',
        sessionId: 'session-1',
        prompt: 'Test prompt 1',
        mode: 'chat',
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
      }
      const job2: SwarmJob = {
        id: 'job-2',
        sessionId: 'session-2',
        prompt: 'Test prompt 2',
        mode: 'swarm',
        status: 'running',
        createdAt: Date.now(),
        progress: 50,
      }
      mockDbData.jobs = [job1, job2]

      const { getJobs } = await import('@/server/storage')
      const jobs = await getJobs()
      expect(jobs).toHaveLength(2)
    })

    it('getJob returns undefined for non-existent job', async () => {
      const { getJob } = await import('@/server/storage')
      const job = await getJob('non-existent')
      expect(job).toBeUndefined()
    })

    it('getJob returns the correct job', async () => {
      const testJob: SwarmJob = {
        id: 'job-123',
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
      }
      mockDbData.jobs = [testJob]

      const { getJob } = await import('@/server/storage')
      const job = await getJob('job-123')
      expect(job).toBeDefined()
      expect(job?.prompt).toBe('Test prompt')
    })

    it('saveJob creates a new job', async () => {
      const { saveJob } = await import('@/server/storage')
      const newJob: SwarmJob = {
        id: 'new-job',
        sessionId: 'session-1',
        prompt: 'New prompt',
        mode: 'swarm',
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
      }

      await saveJob(newJob)
      expect(mockDbData.jobs).toHaveLength(1)
      expect(mockDbData.jobs[0].id).toBe('new-job')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveJob updates an existing job', async () => {
      const existingJob: SwarmJob = {
        id: 'existing-job',
        sessionId: 'session-1',
        prompt: 'Original prompt',
        mode: 'chat',
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
      }
      mockDbData.jobs = [existingJob]

      const { saveJob } = await import('@/server/storage')
      const updatedJob: SwarmJob = {
        ...existingJob,
        status: 'running',
        progress: 50,
      }

      await saveJob(updatedJob)
      expect(mockDbData.jobs).toHaveLength(1)
      expect(mockDbData.jobs[0].status).toBe('running')
      expect(mockDbData.jobs[0].progress).toBe(50)
    })

    it('deleteJob removes the job', async () => {
      const job: SwarmJob = {
        id: 'to-delete',
        sessionId: 'session-1',
        prompt: 'Delete me',
        mode: 'chat',
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
      }
      mockDbData.jobs = [job]

      const { deleteJob } = await import('@/server/storage')
      await deleteJob('to-delete')
      expect(mockDbData.jobs).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })
  })

  /* ── Scheduled Tasks ──────────────────────────────────────────── */

  describe('Scheduled task operations', () => {
    it('getScheduledTasks returns empty array initially', async () => {
      const { getScheduledTasks } = await import('@/server/storage')
      const tasks = await getScheduledTasks()
      expect(tasks).toEqual([])
    })

    it('getScheduledTask returns undefined for non-existent task', async () => {
      const { getScheduledTask } = await import('@/server/storage')
      const task = await getScheduledTask('non-existent')
      expect(task).toBeUndefined()
    })

    it('getScheduledTask returns the correct task', async () => {
      const testTask: ScheduledTask = {
        id: 'task-123',
        name: 'Daily Report',
        cronExpression: '0 9 * * *',
        prompt: 'Generate daily report',
        mode: 'swarm',
        enabled: true,
        nextRun: Date.now() + 86400000,
        createdAt: Date.now(),
      }
      mockDbData.scheduledTasks = [testTask]

      const { getScheduledTask } = await import('@/server/storage')
      const task = await getScheduledTask('task-123')
      expect(task).toBeDefined()
      expect(task?.name).toBe('Daily Report')
    })

    it('saveScheduledTask creates a new task', async () => {
      const { saveScheduledTask } = await import('@/server/storage')
      const newTask: ScheduledTask = {
        id: 'new-task',
        name: 'Weekly Backup',
        cronExpression: '0 0 * * 0',
        prompt: 'Run backup',
        mode: 'swarm',
        enabled: true,
        nextRun: Date.now() + 604800000,
        createdAt: Date.now(),
      }

      await saveScheduledTask(newTask)
      expect(mockDbData.scheduledTasks).toHaveLength(1)
      expect(mockDbData.scheduledTasks[0].id).toBe('new-task')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveScheduledTask updates an existing task', async () => {
      const existingTask: ScheduledTask = {
        id: 'existing-task',
        name: 'Original Name',
        cronExpression: '0 0 * * *',
        prompt: 'Original prompt',
        mode: 'chat',
        enabled: true,
        nextRun: Date.now(),
        createdAt: Date.now(),
      }
      mockDbData.scheduledTasks = [existingTask]

      const { saveScheduledTask } = await import('@/server/storage')
      const updatedTask: ScheduledTask = {
        ...existingTask,
        name: 'Updated Name',
        enabled: false,
      }

      await saveScheduledTask(updatedTask)
      expect(mockDbData.scheduledTasks).toHaveLength(1)
      expect(mockDbData.scheduledTasks[0].name).toBe('Updated Name')
      expect(mockDbData.scheduledTasks[0].enabled).toBe(false)
    })

    it('deleteScheduledTask removes the task', async () => {
      const task: ScheduledTask = {
        id: 'to-delete',
        name: 'Delete Me',
        cronExpression: '0 0 * * *',
        prompt: 'Test',
        mode: 'chat',
        enabled: true,
        nextRun: Date.now(),
        createdAt: Date.now(),
      }
      mockDbData.scheduledTasks = [task]

      const { deleteScheduledTask } = await import('@/server/storage')
      await deleteScheduledTask('to-delete')
      expect(mockDbData.scheduledTasks).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })
  })

  /* ── Evidence Ledger ──────────────────────────────────────────── */

  describe('Evidence ledger operations', () => {
    it('getAllEvidence returns empty array initially', async () => {
      const { getAllEvidence } = await import('@/server/storage')
      const evidence = await getAllEvidence()
      expect(evidence).toEqual([])
    })

    it('createEvidence adds new evidence entry', async () => {
      const { createEvidence } = await import('@/server/storage')
      const entry: EvidenceLedgerEntry = {
        id: 'evidence-1',
        timestamp: Date.now(),
        branch: 'main',
        commitHash: 'abc123',
      }

      await createEvidence(entry)
      expect(mockDbData.evidence).toHaveLength(1)
      expect(mockDbData.evidence[0].id).toBe('evidence-1')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('createEvidence throws error for duplicate id', async () => {
      const existingEntry: EvidenceLedgerEntry = {
        id: 'evidence-1',
        timestamp: Date.now(),
      }
      mockDbData.evidence = [existingEntry]

      const { createEvidence } = await import('@/server/storage')
      const duplicateEntry: EvidenceLedgerEntry = {
        id: 'evidence-1',
        timestamp: Date.now(),
      }

      await expect(createEvidence(duplicateEntry)).rejects.toThrow('Evidence evidence-1 already exists')
    })

    it('getEvidence returns undefined for non-existent entry', async () => {
      const { getEvidence } = await import('@/server/storage')
      const evidence = await getEvidence('non-existent')
      expect(evidence).toBeUndefined()
    })

    it('getEvidence returns the correct entry', async () => {
      const entry: EvidenceLedgerEntry = {
        id: 'evidence-123',
        timestamp: Date.now(),
        branch: 'feature/test',
        commitHash: 'def456',
      }
      mockDbData.evidence = [entry]

      const { getEvidence } = await import('@/server/storage')
      const evidence = await getEvidence('evidence-123')
      expect(evidence).toBeDefined()
      expect(evidence?.branch).toBe('feature/test')
    })

    it('updateEvidence updates an existing entry', async () => {
      const entry: EvidenceLedgerEntry = {
        id: 'evidence-1',
        timestamp: Date.now(),
        branch: 'main',
      }
      mockDbData.evidence = [entry]

      const { updateEvidence } = await import('@/server/storage')
      const result = await updateEvidence('evidence-1', {
        commitHash: 'new-hash',
        diffSummary: 'Updated diff',
      })

      expect(result).not.toBeNull()
      expect(result?.commitHash).toBe('new-hash')
      expect(result?.diffSummary).toBe('Updated diff')
      expect(result?.id).toBe('evidence-1')
    })

    it('updateEvidence returns null for non-existent entry', async () => {
      const { updateEvidence } = await import('@/server/storage')
      const result = await updateEvidence('non-existent', {
        commitHash: 'new-hash',
      })
      expect(result).toBeNull()
    })

    it('updateEvidence merges cliExcerpts', async () => {
      const entry: EvidenceLedgerEntry = {
        id: 'evidence-1',
        timestamp: Date.now(),
        cliExcerpts: { cursor: 'original output' },
      }
      mockDbData.evidence = [entry]

      const { updateEvidence } = await import('@/server/storage')
      const result = await updateEvidence('evidence-1', {
        cliExcerpts: { gemini: 'new output' },
      })

      expect(result?.cliExcerpts).toEqual({
        cursor: 'original output',
        gemini: 'new output',
      })
    })

    it('updateEvidence appends ticketIds', async () => {
      const entry: EvidenceLedgerEntry = {
        id: 'evidence-1',
        timestamp: Date.now(),
        ticketIds: ['ticket-1'],
      }
      mockDbData.evidence = [entry]

      const { updateEvidence } = await import('@/server/storage')
      const result = await updateEvidence('evidence-1', {
        ticketIds: ['ticket-2'],
      })

      expect(result?.ticketIds).toEqual(['ticket-1', 'ticket-2'])
    })
  })

  /* ── Test Runs ────────────────────────────────────────────────── */

  describe('Test run operations', () => {
    it('getTestRuns returns empty array initially', async () => {
      const { getTestRuns } = await import('@/server/storage')
      const runs = await getTestRuns()
      expect(runs).toEqual([])
    })

    it('getTestRun returns undefined for non-existent run', async () => {
      const { getTestRun } = await import('@/server/storage')
      const run = await getTestRun('non-existent')
      expect(run).toBeUndefined()
    })

    it('saveTestRun creates a new test run', async () => {
      const { saveTestRun } = await import('@/server/storage')
      const testRun: TestRunSummary = {
        id: 'run-1',
        timestamp: Date.now(),
        framework: 'vitest',
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 5000,
        results: [],
      }

      await saveTestRun(testRun)
      expect(mockDbData.testRuns).toHaveLength(1)
      expect(mockDbData.testRuns[0].id).toBe('run-1')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveTestRun updates an existing test run', async () => {
      const existingRun: TestRunSummary = {
        id: 'run-1',
        timestamp: Date.now(),
        framework: 'vitest',
        total: 10,
        passed: 5,
        failed: 5,
        skipped: 0,
        duration: 5000,
        results: [],
      }
      mockDbData.testRuns = [existingRun]

      const { saveTestRun } = await import('@/server/storage')
      const updatedRun: TestRunSummary = {
        ...existingRun,
        passed: 10,
        failed: 0,
      }

      await saveTestRun(updatedRun)
      expect(mockDbData.testRuns).toHaveLength(1)
      expect(mockDbData.testRuns[0].passed).toBe(10)
      expect(mockDbData.testRuns[0].failed).toBe(0)
    })

    it('deleteTestRun removes the test run', async () => {
      const run: TestRunSummary = {
        id: 'to-delete',
        timestamp: Date.now(),
        framework: 'vitest',
        total: 5,
        passed: 5,
        failed: 0,
        skipped: 0,
        duration: 1000,
        results: [],
      }
      mockDbData.testRuns = [run]

      const { deleteTestRun } = await import('@/server/storage')
      await deleteTestRun('to-delete')
      expect(mockDbData.testRuns).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })

    it('clearOldTestRuns removes runs older than maxAge', async () => {
      const oldRun: TestRunSummary = {
        id: 'old-run',
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
        framework: 'vitest',
        total: 5,
        passed: 5,
        failed: 0,
        skipped: 0,
        duration: 1000,
        results: [],
      }
      const newRun: TestRunSummary = {
        id: 'new-run',
        timestamp: Date.now(),
        framework: 'vitest',
        total: 5,
        passed: 5,
        failed: 0,
        skipped: 0,
        duration: 1000,
        results: [],
      }
      mockDbData.testRuns = [oldRun, newRun]

      const { clearOldTestRuns } = await import('@/server/storage')
      const cleared = await clearOldTestRuns()
      expect(cleared).toBe(1)
      expect(mockDbData.testRuns).toHaveLength(1)
      expect(mockDbData.testRuns[0].id).toBe('new-run')
    })

    it('clearOldTestRuns does not write if nothing cleared', async () => {
      const recentRun: TestRunSummary = {
        id: 'recent-run',
        timestamp: Date.now(),
        framework: 'vitest',
        total: 5,
        passed: 5,
        failed: 0,
        skipped: 0,
        duration: 1000,
        results: [],
      }
      mockDbData.testRuns = [recentRun]
      mockWrite.mockClear()

      const { clearOldTestRuns } = await import('@/server/storage')
      const cleared = await clearOldTestRuns()
      expect(cleared).toBe(0)
      expect(mockWrite).not.toHaveBeenCalled()
    })
  })

  /* ── Users (RBAC) ─────────────────────────────────────────────── */

  describe('User operations', () => {
    it('getUsers returns empty array initially', async () => {
      const { getUsers } = await import('@/server/storage')
      const users = await getUsers()
      expect(users).toEqual([])
    })

    it('getUser returns undefined for non-existent user', async () => {
      const { getUser } = await import('@/server/storage')
      const user = await getUser('non-existent')
      expect(user).toBeUndefined()
    })

    it('getUser returns the correct user', async () => {
      const testUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [testUser]

      const { getUser } = await import('@/server/storage')
      const user = await getUser('user-123')
      expect(user).toBeDefined()
      expect(user?.email).toBe('test@example.com')
    })

    it('getUserByEmail returns the correct user', async () => {
      const testUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'editor',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [testUser]

      const { getUserByEmail } = await import('@/server/storage')
      const user = await getUserByEmail('test@example.com')
      expect(user).toBeDefined()
      expect(user?.id).toBe('user-123')
    })

    it('getUserByEmail returns undefined for non-existent email', async () => {
      const { getUserByEmail } = await import('@/server/storage')
      const user = await getUserByEmail('nonexistent@example.com')
      expect(user).toBeUndefined()
    })

    it('saveUser creates a new user', async () => {
      const { saveUser } = await import('@/server/storage')
      const newUser: User = {
        id: 'new-user',
        email: 'new@example.com',
        name: 'New User',
        role: 'viewer',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await saveUser(newUser)
      expect(mockDbData.users).toHaveLength(1)
      expect(mockDbData.users[0].id).toBe('new-user')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveUser updates an existing user', async () => {
      const existingUser: User = {
        id: 'existing-user',
        email: 'existing@example.com',
        name: 'Original Name',
        role: 'viewer',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [existingUser]

      const { saveUser } = await import('@/server/storage')
      const updatedUser: User = {
        ...existingUser,
        name: 'Updated Name',
        role: 'editor',
      }

      await saveUser(updatedUser)
      expect(mockDbData.users).toHaveLength(1)
      expect(mockDbData.users[0].name).toBe('Updated Name')
      expect(mockDbData.users[0].role).toBe('editor')
    })

    it('deleteUser removes the user', async () => {
      const user: User = {
        id: 'to-delete',
        email: 'delete@example.com',
        role: 'viewer',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [user]

      const { deleteUser } = await import('@/server/storage')
      await deleteUser('to-delete')
      expect(mockDbData.users).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })

    it('updateUserRole updates the user role', async () => {
      const user: User = {
        id: 'user-1',
        email: 'user@example.com',
        role: 'viewer',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [user]

      const { updateUserRole } = await import('@/server/storage')
      const result = await updateUserRole('user-1', 'admin')
      expect(result).not.toBeNull()
      expect(result?.role).toBe('admin')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('updateUserRole returns null for non-existent user', async () => {
      const { updateUserRole } = await import('@/server/storage')
      const result = await updateUserRole('non-existent', 'admin')
      expect(result).toBeNull()
    })
  })

  /* ── Workspaces ───────────────────────────────────────────────── */

  describe('Workspace operations', () => {
    it('getWorkspaces returns empty array initially', async () => {
      const { getWorkspaces } = await import('@/server/storage')
      const workspaces = await getWorkspaces()
      expect(workspaces).toEqual([])
    })

    it('getWorkspace returns undefined for non-existent workspace', async () => {
      const { getWorkspace } = await import('@/server/storage')
      const workspace = await getWorkspace('non-existent')
      expect(workspace).toBeUndefined()
    })

    it('getWorkspace returns the correct workspace', async () => {
      const testWorkspace: Workspace = {
        id: 'workspace-123',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      }
      mockDbData.workspaces = [testWorkspace]

      const { getWorkspace } = await import('@/server/storage')
      const workspace = await getWorkspace('workspace-123')
      expect(workspace).toBeDefined()
      expect(workspace?.name).toBe('Test Workspace')
    })

    it('saveWorkspace creates a new workspace', async () => {
      const { saveWorkspace } = await import('@/server/storage')
      const newWorkspace: Workspace = {
        id: 'new-workspace',
        name: 'New Workspace',
        path: '/new/path',
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      }

      await saveWorkspace(newWorkspace)
      expect(mockDbData.workspaces).toHaveLength(1)
      expect(mockDbData.workspaces[0].id).toBe('new-workspace')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('saveWorkspace updates an existing workspace', async () => {
      const existingWorkspace: Workspace = {
        id: 'existing-workspace',
        name: 'Original Name',
        path: '/original/path',
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      }
      mockDbData.workspaces = [existingWorkspace]

      const { saveWorkspace } = await import('@/server/storage')
      const updatedWorkspace: Workspace = {
        ...existingWorkspace,
        name: 'Updated Name',
      }

      await saveWorkspace(updatedWorkspace)
      expect(mockDbData.workspaces).toHaveLength(1)
      expect(mockDbData.workspaces[0].name).toBe('Updated Name')
    })

    it('deleteWorkspace removes the workspace', async () => {
      const workspace: Workspace = {
        id: 'to-delete',
        name: 'Delete Me',
        path: '/delete/path',
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      }
      mockDbData.workspaces = [workspace]

      const { deleteWorkspace } = await import('@/server/storage')
      await deleteWorkspace('to-delete')
      expect(mockDbData.workspaces).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })

    it('updateWorkspace updates workspace properties', async () => {
      const workspace: Workspace = {
        id: 'workspace-1',
        name: 'Original',
        path: '/original',
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      }
      mockDbData.workspaces = [workspace]

      const { updateWorkspace } = await import('@/server/storage')
      const result = await updateWorkspace('workspace-1', {
        name: 'Updated',
        path: '/updated',
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Updated')
      expect(result?.path).toBe('/updated')
    })

    it('updateWorkspace returns null for non-existent workspace', async () => {
      const { updateWorkspace } = await import('@/server/storage')
      const result = await updateWorkspace('non-existent', { name: 'Test' })
      expect(result).toBeNull()
    })
  })

  /* ── Audit Log ────────────────────────────────────────────────── */

  describe('Audit log operations', () => {
    it('logAuditEntry adds a new audit entry', async () => {
      const { logAuditEntry } = await import('@/server/storage')
      const entry: AuditLogEntry = {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
        resourceId: 'project-1',
      }

      await logAuditEntry(entry)
      expect(mockDbData.auditLog).toHaveLength(1)
      expect(mockDbData.auditLog[0].id).toBe('audit-1')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('getAuditLog returns all entries', async () => {
      const entry1: AuditLogEntry = {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
      }
      const entry2: AuditLogEntry = {
        id: 'audit-2',
        timestamp: new Date().toISOString(),
        userId: 'user-2',
        userEmail: 'user2@example.com',
        action: 'ticket_create',
        resourceType: 'ticket',
      }
      mockDbData.auditLog = [entry1, entry2]

      const { getAuditLog } = await import('@/server/storage')
      const { entries, total } = await getAuditLog()
      expect(entries).toHaveLength(2)
      expect(total).toBe(2)
    })

    it('getAuditLog filters by userId', async () => {
      const entry1: AuditLogEntry = {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
      }
      const entry2: AuditLogEntry = {
        id: 'audit-2',
        timestamp: new Date().toISOString(),
        userId: 'user-2',
        userEmail: 'user2@example.com',
        action: 'ticket_create',
        resourceType: 'ticket',
      }
      mockDbData.auditLog = [entry1, entry2]

      const { getAuditLog } = await import('@/server/storage')
      const { entries, total } = await getAuditLog({ userId: 'user-1' })
      expect(entries).toHaveLength(1)
      expect(entries[0].userId).toBe('user-1')
      expect(total).toBe(1)
    })

    it('getAuditLog filters by action', async () => {
      const entry1: AuditLogEntry = {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
      }
      const entry2: AuditLogEntry = {
        id: 'audit-2',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'ticket_create',
        resourceType: 'ticket',
      }
      mockDbData.auditLog = [entry1, entry2]

      const { getAuditLog } = await import('@/server/storage')
      const { entries } = await getAuditLog({ action: 'project_create' })
      expect(entries).toHaveLength(1)
      expect(entries[0].action).toBe('project_create')
    })

    it('getAuditLog filters by resourceType', async () => {
      const entry1: AuditLogEntry = {
        id: 'audit-1',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
      }
      const entry2: AuditLogEntry = {
        id: 'audit-2',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'ticket_create',
        resourceType: 'ticket',
      }
      mockDbData.auditLog = [entry1, entry2]

      const { getAuditLog } = await import('@/server/storage')
      const { entries } = await getAuditLog({ resourceType: 'ticket' })
      expect(entries).toHaveLength(1)
      expect(entries[0].resourceType).toBe('ticket')
    })

    it('getAuditLog filters by date range', async () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

      const entry1: AuditLogEntry = {
        id: 'audit-1',
        timestamp: twoDaysAgo.toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
      }
      const entry2: AuditLogEntry = {
        id: 'audit-2',
        timestamp: now.toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'ticket_create',
        resourceType: 'ticket',
      }
      mockDbData.auditLog = [entry1, entry2]

      const { getAuditLog } = await import('@/server/storage')
      const { entries } = await getAuditLog({
        startDate: yesterday.toISOString(),
      })
      expect(entries).toHaveLength(1)
      expect(entries[0].id).toBe('audit-2')
    })

    it('getAuditLog paginates results', async () => {
      const entries: AuditLogEntry[] = Array.from({ length: 5 }, (_, i) => ({
        id: `audit-${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create' as const,
        resourceType: 'project',
      }))
      mockDbData.auditLog = entries

      const { getAuditLog } = await import('@/server/storage')
      const { entries: page1, total } = await getAuditLog({ limit: 2, offset: 0 })
      expect(page1).toHaveLength(2)
      expect(total).toBe(5)

      const { entries: page2 } = await getAuditLog({ limit: 2, offset: 2 })
      expect(page2).toHaveLength(2)
    })

    it('getAuditEntry returns undefined for non-existent entry', async () => {
      const { getAuditEntry } = await import('@/server/storage')
      const entry = await getAuditEntry('non-existent')
      expect(entry).toBeUndefined()
    })

    it('getAuditEntry returns the correct entry', async () => {
      const testEntry: AuditLogEntry = {
        id: 'audit-123',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
      }
      mockDbData.auditLog = [testEntry]

      const { getAuditEntry } = await import('@/server/storage')
      const entry = await getAuditEntry('audit-123')
      expect(entry).toBeDefined()
      expect(entry?.action).toBe('project_create')
    })

    it('clearOldAuditLogs removes old entries', async () => {
      const oldEntry: AuditLogEntry = {
        id: 'old-audit',
        timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'project_create',
        resourceType: 'project',
      }
      const newEntry: AuditLogEntry = {
        id: 'new-audit',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
        userEmail: 'user@example.com',
        action: 'ticket_create',
        resourceType: 'ticket',
      }
      mockDbData.auditLog = [oldEntry, newEntry]

      const { clearOldAuditLogs } = await import('@/server/storage')
      const cleared = await clearOldAuditLogs()
      expect(cleared).toBe(1)
      expect(mockDbData.auditLog).toHaveLength(1)
      expect(mockDbData.auditLog[0].id).toBe('new-audit')
    })
  })

  /* ── Prompts ──────────────────────────────────────────────────── */

  describe('Prompt operations', () => {
    it('getPrompts returns empty array initially', async () => {
      const { getPrompts } = await import('@/server/storage')
      const prompts = await getPrompts()
      expect(prompts).toEqual([])
    })

    it('getPrompt returns undefined for non-existent prompt', async () => {
      const { getPrompt } = await import('@/server/storage')
      const prompt = await getPrompt('non-existent')
      expect(prompt).toBeUndefined()
    })

    it('getPrompt returns the correct prompt', async () => {
      const testPrompt: Prompt = {
        id: 'prompt-123',
        name: 'Test Prompt',
        category: 'system',
        currentVersion: 1,
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [testPrompt]

      const { getPrompt } = await import('@/server/storage')
      const prompt = await getPrompt('prompt-123')
      expect(prompt).toBeDefined()
      expect(prompt?.name).toBe('Test Prompt')
    })

    it('getPromptByName returns the correct prompt', async () => {
      const testPrompt: Prompt = {
        id: 'prompt-123',
        name: 'System Prompt',
        category: 'system',
        currentVersion: 1,
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [testPrompt]

      const { getPromptByName } = await import('@/server/storage')
      const prompt = await getPromptByName('System Prompt')
      expect(prompt).toBeDefined()
      expect(prompt?.id).toBe('prompt-123')
    })

    it('savePrompt creates a new prompt', async () => {
      const { savePrompt } = await import('@/server/storage')
      const newPrompt: Prompt = {
        id: 'new-prompt',
        name: 'New Prompt',
        category: 'custom',
        currentVersion: 1,
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await savePrompt(newPrompt)
      expect(mockDbData.prompts).toHaveLength(1)
      expect(mockDbData.prompts[0].id).toBe('new-prompt')
      expect(mockWrite).toHaveBeenCalled()
    })

    it('savePrompt updates an existing prompt', async () => {
      const existingPrompt: Prompt = {
        id: 'existing-prompt',
        name: 'Original Name',
        category: 'system',
        currentVersion: 1,
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [existingPrompt]

      const { savePrompt } = await import('@/server/storage')
      const updatedPrompt: Prompt = {
        ...existingPrompt,
        name: 'Updated Name',
      }

      await savePrompt(updatedPrompt)
      expect(mockDbData.prompts).toHaveLength(1)
      expect(mockDbData.prompts[0].name).toBe('Updated Name')
    })

    it('deletePrompt removes the prompt', async () => {
      const prompt: Prompt = {
        id: 'to-delete',
        name: 'Delete Me',
        category: 'custom',
        currentVersion: 1,
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [prompt]

      const { deletePrompt } = await import('@/server/storage')
      await deletePrompt('to-delete')
      expect(mockDbData.prompts).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })

    it('addPromptVersion adds a new version', async () => {
      const prompt: Prompt = {
        id: 'prompt-1',
        name: 'Test Prompt',
        category: 'system',
        currentVersion: 1,
        versions: [
          {
            id: 'v1',
            promptId: 'prompt-1',
            version: 1,
            content: 'Version 1 content',
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            isActive: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [prompt]

      const { addPromptVersion } = await import('@/server/storage')
      const newVersion: PromptVersion = {
        id: 'v2',
        promptId: 'prompt-1',
        version: 2,
        content: 'Version 2 content',
        createdAt: new Date().toISOString(),
        createdBy: 'user-1',
        isActive: true,
      }

      const result = await addPromptVersion('prompt-1', newVersion)
      expect(result).not.toBeNull()
      expect(result?.versions).toHaveLength(2)
      expect(result?.currentVersion).toBe(2)
      expect(result?.versions[0].isActive).toBe(false)
      expect(result?.versions[1].isActive).toBe(true)
    })

    it('addPromptVersion returns null for non-existent prompt', async () => {
      const { addPromptVersion } = await import('@/server/storage')
      const version: PromptVersion = {
        id: 'v1',
        promptId: 'non-existent',
        version: 1,
        content: 'Content',
        createdAt: new Date().toISOString(),
        createdBy: 'user-1',
        isActive: true,
      }

      const result = await addPromptVersion('non-existent', version)
      expect(result).toBeNull()
    })

    it('rollbackPromptVersion rolls back to target version', async () => {
      const prompt: Prompt = {
        id: 'prompt-1',
        name: 'Test Prompt',
        category: 'system',
        currentVersion: 2,
        versions: [
          {
            id: 'v1',
            promptId: 'prompt-1',
            version: 1,
            content: 'Version 1',
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            isActive: false,
          },
          {
            id: 'v2',
            promptId: 'prompt-1',
            version: 2,
            content: 'Version 2',
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            isActive: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [prompt]

      const { rollbackPromptVersion } = await import('@/server/storage')
      const result = await rollbackPromptVersion('prompt-1', 1)
      expect(result).not.toBeNull()
      expect(result?.currentVersion).toBe(1)
      expect(result?.versions[0].isActive).toBe(true)
      expect(result?.versions[1].isActive).toBe(false)
    })

    it('rollbackPromptVersion returns null for non-existent version', async () => {
      const prompt: Prompt = {
        id: 'prompt-1',
        name: 'Test Prompt',
        category: 'system',
        currentVersion: 1,
        versions: [
          {
            id: 'v1',
            promptId: 'prompt-1',
            version: 1,
            content: 'Version 1',
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            isActive: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [prompt]

      const { rollbackPromptVersion } = await import('@/server/storage')
      const result = await rollbackPromptVersion('prompt-1', 99)
      expect(result).toBeNull()
    })

    it('getActivePromptContent returns active version content', async () => {
      const prompt: Prompt = {
        id: 'prompt-1',
        name: 'Test Prompt',
        category: 'system',
        currentVersion: 1,
        versions: [
          {
            id: 'v1',
            promptId: 'prompt-1',
            version: 1,
            content: 'Active content',
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            isActive: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockDbData.prompts = [prompt]

      const { getActivePromptContent } = await import('@/server/storage')
      const content = await getActivePromptContent('prompt-1')
      expect(content).toBe('Active content')
    })

    it('getActivePromptContent returns null for non-existent prompt', async () => {
      const { getActivePromptContent } = await import('@/server/storage')
      const content = await getActivePromptContent('non-existent')
      expect(content).toBeNull()
    })
  })

  /* ── Tenants ──────────────────────────────────────────────────── */

  describe('Tenant operations', () => {
    it('getTenants returns empty array initially', async () => {
      const { getTenants } = await import('@/server/storage')
      const tenants = await getTenants()
      expect(tenants).toEqual([])
    })

    it('getTenant returns undefined for non-existent tenant', async () => {
      const { getTenant } = await import('@/server/storage')
      const tenant = await getTenant('non-existent')
      expect(tenant).toBeUndefined()
    })

    it('getTenant returns the correct tenant', async () => {
      const testTenant: Tenant = {
        id: 'tenant-123',
        name: 'Test Tenant',
        slug: 'test-tenant',
        createdAt: new Date().toISOString(),
        ownerId: 'user-1',
      }
      mockDbData.tenants = [testTenant]

      const { getTenant } = await import('@/server/storage')
      const tenant = await getTenant('tenant-123')
      expect(tenant).toBeDefined()
      expect(tenant?.name).toBe('Test Tenant')
    })

    it('getTenantBySlug returns the correct tenant', async () => {
      const testTenant: Tenant = {
        id: 'tenant-123',
        name: 'Test Tenant',
        slug: 'test-tenant',
        createdAt: new Date().toISOString(),
        ownerId: 'user-1',
      }
      mockDbData.tenants = [testTenant]

      const { getTenantBySlug } = await import('@/server/storage')
      const tenant = await getTenantBySlug('test-tenant')
      expect(tenant).toBeDefined()
      expect(tenant?.id).toBe('tenant-123')
    })

    it('createTenant creates a new tenant', async () => {
      const { createTenant } = await import('@/server/storage')
      const result = await createTenant({
        name: 'New Tenant',
        slug: 'new-tenant',
        ownerId: 'user-1',
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('New Tenant')
      expect(result.slug).toBe('new-tenant')
      expect(result.id).toBeDefined()
      expect(result.createdAt).toBeDefined()
      expect(mockDbData.tenants).toHaveLength(1)
      expect(mockWrite).toHaveBeenCalled()
    })

    it('createTenant throws error for duplicate slug', async () => {
      const existingTenant: Tenant = {
        id: 'tenant-1',
        name: 'Existing Tenant',
        slug: 'existing-slug',
        createdAt: new Date().toISOString(),
        ownerId: 'user-1',
      }
      mockDbData.tenants = [existingTenant]

      const { createTenant } = await import('@/server/storage')
      await expect(
        createTenant({
          name: 'New Tenant',
          slug: 'existing-slug',
          ownerId: 'user-2',
        })
      ).rejects.toThrow('Tenant with slug "existing-slug" already exists')
    })

    it('updateTenant updates tenant properties', async () => {
      const tenant: Tenant = {
        id: 'tenant-1',
        name: 'Original Name',
        slug: 'original-slug',
        createdAt: new Date().toISOString(),
        ownerId: 'user-1',
      }
      mockDbData.tenants = [tenant]

      const { updateTenant } = await import('@/server/storage')
      const result = await updateTenant('tenant-1', {
        name: 'Updated Name',
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Updated Name')
      expect(result?.slug).toBe('original-slug')
    })

    it('updateTenant returns null for non-existent tenant', async () => {
      const { updateTenant } = await import('@/server/storage')
      const result = await updateTenant('non-existent', { name: 'Test' })
      expect(result).toBeNull()
    })

    it('updateTenant throws error for duplicate slug', async () => {
      const tenant1: Tenant = {
        id: 'tenant-1',
        name: 'Tenant 1',
        slug: 'slug-1',
        createdAt: new Date().toISOString(),
        ownerId: 'user-1',
      }
      const tenant2: Tenant = {
        id: 'tenant-2',
        name: 'Tenant 2',
        slug: 'slug-2',
        createdAt: new Date().toISOString(),
        ownerId: 'user-2',
      }
      mockDbData.tenants = [tenant1, tenant2]

      const { updateTenant } = await import('@/server/storage')
      await expect(
        updateTenant('tenant-1', { slug: 'slug-2' })
      ).rejects.toThrow('Tenant with slug "slug-2" already exists')
    })

    it('deleteTenant removes the tenant', async () => {
      const tenant: Tenant = {
        id: 'to-delete',
        name: 'Delete Me',
        slug: 'delete-me',
        createdAt: new Date().toISOString(),
        ownerId: 'user-1',
      }
      mockDbData.tenants = [tenant]

      const { deleteTenant } = await import('@/server/storage')
      const result = await deleteTenant('to-delete')
      expect(result).toBe(true)
      expect(mockDbData.tenants).toHaveLength(0)
      expect(mockWrite).toHaveBeenCalled()
    })

    it('deleteTenant returns false for non-existent tenant', async () => {
      const { deleteTenant } = await import('@/server/storage')
      const result = await deleteTenant('non-existent')
      expect(result).toBe(false)
    })

    it('getTenantUsers returns users for a tenant', async () => {
      const user1: User = {
        id: 'user-1',
        email: 'user1@example.com',
        role: 'editor',
        tenantId: 'tenant-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const user2: User = {
        id: 'user-2',
        email: 'user2@example.com',
        role: 'viewer',
        tenantId: 'tenant-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [user1, user2]

      const { getTenantUsers } = await import('@/server/storage')
      const users = await getTenantUsers('tenant-1')
      expect(users).toHaveLength(1)
      expect(users[0].id).toBe('user-1')
    })

    it('assignUserToTenant assigns user to tenant', async () => {
      const user: User = {
        id: 'user-1',
        email: 'user@example.com',
        role: 'editor',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const tenant: Tenant = {
        id: 'tenant-1',
        name: 'Test Tenant',
        slug: 'test-tenant',
        createdAt: new Date().toISOString(),
        ownerId: 'owner-1',
      }
      mockDbData.users = [user]
      mockDbData.tenants = [tenant]

      const { assignUserToTenant } = await import('@/server/storage')
      const result = await assignUserToTenant('user-1', 'tenant-1')
      expect(result).not.toBeNull()
      expect(result?.tenantId).toBe('tenant-1')
    })

    it('assignUserToTenant returns null for non-existent user', async () => {
      const tenant: Tenant = {
        id: 'tenant-1',
        name: 'Test Tenant',
        slug: 'test-tenant',
        createdAt: new Date().toISOString(),
        ownerId: 'owner-1',
      }
      mockDbData.tenants = [tenant]

      const { assignUserToTenant } = await import('@/server/storage')
      const result = await assignUserToTenant('non-existent', 'tenant-1')
      expect(result).toBeNull()
    })

    it('assignUserToTenant throws error for non-existent tenant', async () => {
      const user: User = {
        id: 'user-1',
        email: 'user@example.com',
        role: 'editor',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [user]

      const { assignUserToTenant } = await import('@/server/storage')
      await expect(
        assignUserToTenant('user-1', 'non-existent')
      ).rejects.toThrow('Tenant non-existent not found')
    })

    it('removeUserFromTenant removes tenant assignment', async () => {
      const user: User = {
        id: 'user-1',
        email: 'user@example.com',
        role: 'editor',
        tenantId: 'tenant-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDbData.users = [user]

      const { removeUserFromTenant } = await import('@/server/storage')
      const result = await removeUserFromTenant('user-1')
      expect(result).not.toBeNull()
      expect(result?.tenantId).toBeUndefined()
    })

    it('removeUserFromTenant returns null for non-existent user', async () => {
      const { removeUserFromTenant } = await import('@/server/storage')
      const result = await removeUserFromTenant('non-existent')
      expect(result).toBeNull()
    })
  })

  /* ── API Key Encryption ───────────────────────────────────────── */

  describe('API key encryption helpers', () => {
    it('encryptApiKeys returns undefined for undefined input', async () => {
      const { encryptApiKeys } = await import('@/server/storage')
      const result = encryptApiKeys(undefined)
      expect(result).toBeUndefined()
    })

    it('encryptApiKeys encrypts plain text keys', async () => {
      const { encryptApiKeys } = await import('@/server/storage')
      const result = encryptApiKeys({
        openai: 'sk-plain-key',
        anthropic: 'sk-another-key',
      })
      expect(result?.openai).toBe('encrypted:sk-plain-key')
      expect(result?.anthropic).toBe('encrypted:sk-another-key')
    })

    it('encryptApiKeys does not double-encrypt', async () => {
      const { encryptApiKeys } = await import('@/server/storage')
      const result = encryptApiKeys({
        openai: 'encrypted:already-encrypted',
      })
      expect(result?.openai).toBe('encrypted:already-encrypted')
    })

    it('decryptApiKeys returns undefined for undefined input', async () => {
      const { decryptApiKeys } = await import('@/server/storage')
      const result = decryptApiKeys(undefined)
      expect(result).toBeUndefined()
    })

    it('decryptApiKeys decrypts encrypted keys', async () => {
      const { decryptApiKeys } = await import('@/server/storage')
      const result = decryptApiKeys({
        openai: 'encrypted:sk-secret-key',
      })
      expect(result?.openai).toBe('sk-secret-key')
    })

    it('decryptApiKeys leaves plain text keys unchanged', async () => {
      const { decryptApiKeys } = await import('@/server/storage')
      const result = decryptApiKeys({
        openai: 'plain-key',
      })
      expect(result?.openai).toBe('plain-key')
    })
  })
})
