import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockOnAgentOutput = vi.fn()
const mockOnAgentStatus = vi.fn()
const mockOnMCPToolResult = vi.fn()

vi.mock('@/server/storage', () => ({
  getSettings: vi.fn().mockResolvedValue({
    enabledCLIs: ['cursor'],
    parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
    maxRuntimeSeconds: 300,
    autoRerunThreshold: 60,
    researchDepth: 'standard',
    worktreeIsolation: false,
    continuousMode: false,
    chatsPerAgent: 1,
  }),
}))

vi.mock('@/server/cli-detect', () => ({
  detectInstalledCLIs: vi.fn().mockResolvedValue([
    { id: 'cursor', installed: true },
  ]),
}))

vi.mock('@/server/cli-runner', () => ({
  spawnCLI: vi.fn().mockImplementation((options) => {
    setTimeout(() => {
      options.onOutput('Mock CLI output with enough content for testing purposes')
      options.onExit(0)
    }, 10)
    return { kill: vi.fn() }
  }),
}))

vi.mock('@/server/api-runner', () => ({
  runAPIAgent: vi.fn().mockImplementation(async (options) => {
    options.onOutput('Mock API output with enough content for testing purposes')
    options.onComplete('Mock API output with enough content for testing purposes')
  }),
}))

vi.mock('@/server/security-checks', () => ({
  runSecurityChecks: vi.fn().mockResolvedValue({
    passed: true,
    checks: [{ name: 'TypeScript', passed: true, output: 'OK' }],
  }),
}))

vi.mock('@/server/worktree-manager', () => ({
  createWorktree: vi.fn().mockReturnValue('/tmp/worktree'),
  cleanupWorktree: vi.fn(),
  cleanupAllWorktrees: vi.fn(),
  isGitRepo: vi.fn().mockReturnValue(false),
}))

vi.mock('@/server/evidence', () => ({
  createPipelineEvidence: vi.fn().mockResolvedValue('evidence-123'),
  appendCliExcerpt: vi.fn().mockResolvedValue(undefined),
  appendDiffSummary: vi.fn().mockResolvedValue(undefined),
  linkTicketToEvidence: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/output-cache', () => ({
  getCachedOutput: vi.fn().mockReturnValue(null),
  setCachedOutput: vi.fn(),
}))

vi.mock('@/server/confidence', () => ({
  computeConfidence: vi.fn().mockReturnValue(75),
  extractSources: vi.fn().mockReturnValue([]),
}))

vi.mock('@/server/anti-hallucination', () => ({
  selectBestOutput: vi.fn().mockImplementation((outputs) => outputs[0]?.output ?? ''),
  analyzeStageOutputs: vi.fn().mockReturnValue({ confidence: 80, bestOutput: 'Best output' }),
  shouldRerunValidation: vi.fn().mockReturnValue(false),
}))

vi.mock('@/server/prompt-builder', () => ({
  buildResearchPrompt: vi.fn().mockReturnValue('Research prompt'),
  buildPlanPrompt: vi.fn().mockReturnValue('Plan prompt'),
  buildCodePrompt: vi.fn().mockReturnValue('Code prompt'),
  buildValidatePrompt: vi.fn().mockReturnValue('Validate prompt'),
  buildSecurityPrompt: vi.fn().mockReturnValue('Security prompt'),
  buildSynthesizePrompt: vi.fn().mockReturnValue('Synthesize prompt'),
  buildMCPToolContext: vi.fn().mockReturnValue(null),
}))

vi.mock('@/server/mcp-client', () => ({
  parseToolCallsFromOutput: vi.fn().mockReturnValue([]),
  executeToolCalls: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('@/server/code-validator', () => ({
  validateCode: vi.fn().mockResolvedValue({
    isValid: true,
    score: 100,
    typeErrors: [],
    lintErrors: [],
  }),
}))

vi.mock('@/server/ticket-manager', () => ({
  TicketManager: vi.fn().mockImplementation(() => ({
    decomposeTask: vi.fn().mockReturnValue([]),
    updateTicket: vi.fn(),
    completeTicket: vi.fn(),
    failTicket: vi.fn(),
    getTicket: vi.fn(),
    createEscalationTicket: vi.fn(),
  })),
}))

vi.mock('@/server/github-integration', () => ({
  isGitHubAuthenticated: vi.fn().mockResolvedValue(false),
  createBranch: vi.fn(),
  commitChanges: vi.fn(),
  createPullRequest: vi.fn(),
}))

vi.mock('@/lib/telemetry', () => ({
  createSpan: vi.fn().mockReturnValue({
    setAttributes: vi.fn(),
    end: vi.fn(),
  }),
  withSpan: vi.fn().mockImplementation(async (_name, fn) => fn({
    setAttributes: vi.fn(),
    end: vi.fn(),
  })),
  setSpanError: vi.fn(),
  setSpanSuccess: vi.fn(),
  addSpanEvent: vi.fn(),
}))

vi.mock('@/lib/metrics', () => ({
  agentResponseTime: { observe: vi.fn() },
  confidenceScore: { observe: vi.fn() },
  agentSpawnsTotal: { inc: vi.fn() },
  agentFailuresTotal: { inc: vi.fn() },
  cacheHitsTotal: { inc: vi.fn() },
  cacheMissesTotal: { inc: vi.fn() },
}))

vi.mock('@/lib/paths', () => ({
  getTempFile: vi.fn().mockImplementation((name) => `/tmp/${name}`),
}))

vi.mock('@/server/pipeline-engine', () => ({
  runPipeline: vi.fn(),
  cancelAll: vi.fn(),
}))

vi.mock('@/server/secrets-scanner', () => ({
  scanAndMaskAgentOutput: vi.fn().mockImplementation((agentId, output) => ({
    maskedOutput: output,
    validation: {
      isValid: true,
      secretsFound: [],
      envVarsFound: [],
      summary: { totalSecrets: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
    },
  })),
}))

vi.mock('@/server/output-schemas', () => ({
  validateAgentOutput: vi.fn().mockReturnValue({ isValid: true, errors: [], role: 'coder', rawOutput: '' }),
  getValidationErrorSummary: vi.fn().mockReturnValue('All outputs valid'),
}))

vi.mock('@/server/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
}))

describe('orchestrator.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('detectMode', () => {
    it('detects chat mode for simple questions', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'What is TypeScript?',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result).toBeDefined()
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Mode:'))
    })

    it('detects swarm mode for refactoring tasks', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor the authentication module',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Mode: swarm'))
    })

    it('detects project mode for large project requests', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const longPrompt = 'Build a complete e-commerce application with user authentication, product catalog, shopping cart, checkout flow, order management, and admin dashboard. ' + 'x'.repeat(200)
      
      await runSwarmPipeline({
        prompt: longPrompt,
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'project',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Mode: project'))
    })

    it('detects swarm mode for fix tasks', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Fix the bug in the login form',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Mode: swarm'))
    })

    it('detects swarm mode for test tasks', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Write tests for the user service',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Mode: swarm'))
    })

    it('detects swarm mode for security audit tasks', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Perform a security audit on the API endpoints',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Mode: swarm'))
    })
  })

  describe('runSwarmPipeline', () => {
    it('returns a SwarmResult with required properties', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result).toHaveProperty('finalOutput')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('agents')
      expect(result).toHaveProperty('sources')
      expect(result).toHaveProperty('validationPassed')
    })

    it('respects explicit mode override', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Simple question',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Mode: swarm'))
    })

    it('creates evidence ID for pipeline', async () => {
      const { createPipelineEvidence } = await import('@/server/evidence')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(createPipelineEvidence).toHaveBeenCalledWith('/test/project')
    })

    it('appends diff summary after pipeline completion', async () => {
      const { appendDiffSummary } = await import('@/server/evidence')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(appendDiffSummary).toHaveBeenCalledWith('evidence-123', '/test/project')
    })

    it('resolves available CLIs and logs them', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor', 'gemini'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Resolved CLIs:'))
    })
  })

  describe('cancelSwarm', () => {
    it('sets cancelled flag and clears active processes', async () => {
      const { cancelSwarm } = await import('@/server/orchestrator')
      const { cancelAll } = await import('@/server/pipeline-engine')
      
      cancelSwarm()
      
      expect(cancelAll).toHaveBeenCalled()
    })

    it('kills active processes when cancelling', async () => {
      vi.resetModules()
      
      const mockKill = vi.fn()
      vi.doMock('@/server/cli-runner', () => ({
        spawnCLI: vi.fn().mockImplementation((options) => {
          setTimeout(() => {
            options.onOutput('Mock output')
            options.onExit(0)
          }, 5000)
          return { kill: mockKill }
        }),
      }))

      const { runSwarmPipeline, cancelSwarm } = await import('@/server/orchestrator')
      
      const pipelinePromise = runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      cancelSwarm()

      const result = await pipelinePromise
      expect(result).toBeDefined()
    })

    it('returns cancelled result when pipeline is cancelled mid-execution', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/cli-runner', () => ({
        spawnCLI: vi.fn().mockImplementation((options) => {
          setTimeout(() => {
            options.onOutput('Mock output with enough content for testing')
            options.onExit(0)
          }, 100)
          return { kill: vi.fn() }
        }),
      }))

      const { runSwarmPipeline, cancelSwarm } = await import('@/server/orchestrator')
      
      const pipelinePromise = runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      await new Promise(resolve => setTimeout(resolve, 10))
      cancelSwarm()

      const result = await pipelinePromise
      expect(result.confidence).toBeDefined()
    })
  })

  describe('getLastPipelineRunTime', () => {
    it('returns null initially', async () => {
      vi.resetModules()
      const { getLastPipelineRunTime } = await import('@/server/orchestrator')
      
      const time = getLastPipelineRunTime()
      expect(time).toBeNull()
    })

    it('returns timestamp after pipeline run', async () => {
      vi.resetModules()
      const { runSwarmPipeline, getLastPipelineRunTime } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      const time = getLastPipelineRunTime()
      expect(time).toBeGreaterThan(0)
    })

    it('updates timestamp on subsequent runs', async () => {
      vi.resetModules()
      const { runSwarmPipeline, getLastPipelineRunTime } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'First run',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      const firstTime = getLastPipelineRunTime()

      await new Promise(resolve => setTimeout(resolve, 10))

      await runSwarmPipeline({
        prompt: 'Second run',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      const secondTime = getLastPipelineRunTime()
      expect(secondTime).toBeGreaterThanOrEqual(firstTime!)
    })
  })

  describe('pipeline stages', () => {
    it('runs all 6 stages in swarm mode', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Stage 1/6: RESEARCH'))
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Stage 2/6: PLAN'))
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Stage 3/6: CODE'))
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Stage 4/6: VALIDATE'))
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Stage 5/6: SECURITY'))
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Stage 6/6: SYNTHESIZE'))
    })

    it('skips stages with 0 count', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      const calls = mockOnAgentOutput.mock.calls.map(c => c[1])
      expect(calls.some(c => c.includes('Stage 3/6: CODE'))).toBe(true)
    })

    it('runs project mode phases sequentially', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Build a complete application',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'project',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('PROJECT mode'))
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Phase 1:'))
    })
  })

  describe('CLI detection and filtering', () => {
    it('filters enabled CLIs to only installed ones', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/cli-detect', () => ({
        detectInstalledCLIs: vi.fn().mockResolvedValue([
          { id: 'cursor', installed: true },
          { id: 'gemini', installed: false },
        ]),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor', 'gemini'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Resolved CLIs: cursor'))
    })

    it('falls back to mock agent when no CLIs are installed', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/cli-detect', () => ({
        detectInstalledCLIs: vi.fn().mockResolvedValue([]),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Resolved CLIs:'))
    })

    it('uses default cursor CLI when enabledCLIs is empty', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: [],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Resolved CLIs:'))
    })
  })

  describe('confidence scoring integration', () => {
    it('computes and reports confidence score', async () => {
      const { computeConfidence } = await import('@/server/confidence')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(computeConfidence).toHaveBeenCalled()
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Confidence:'))
    })

    it('returns result with confidence score', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result.confidence).toBe(75)
    })

    it('extracts sources from outputs', async () => {
      const { extractSources } = await import('@/server/confidence')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(extractSources).toHaveBeenCalled()
    })

    it('refuses output when confidence is below 30 with no evidence', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/confidence', () => ({
        computeConfidence: vi.fn().mockReturnValue(25),
        extractSources: vi.fn().mockReturnValue([]),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result.finalOutput).toBe('refused')
      expect(result.validationPassed).toBe(false)
    })
  })

  describe('worktree management', () => {
    it('creates worktrees when isolation is enabled and in git repo', async () => {
      vi.resetModules()
      
      const mockCreateWorktree = vi.fn().mockReturnValue('/tmp/worktree')
      const mockCleanupWorktree = vi.fn()
      const mockCleanupAllWorktrees = vi.fn()
      
      vi.doMock('@/server/worktree-manager', () => ({
        createWorktree: mockCreateWorktree,
        cleanupWorktree: mockCleanupWorktree,
        cleanupAllWorktrees: mockCleanupAllWorktrees,
        isGitRepo: vi.fn().mockReturnValue(true),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: true,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockCreateWorktree).toHaveBeenCalled()
    })

    it('skips worktree creation when not in git repo', async () => {
      vi.resetModules()
      
      const mockCreateWorktree = vi.fn().mockReturnValue('/tmp/worktree')
      
      vi.doMock('@/server/worktree-manager', () => ({
        createWorktree: mockCreateWorktree,
        cleanupWorktree: vi.fn(),
        cleanupAllWorktrees: vi.fn(),
        isGitRepo: vi.fn().mockReturnValue(false),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: true,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockCreateWorktree).not.toHaveBeenCalled()
    })

    it('cleans up worktrees after pipeline completion', async () => {
      vi.resetModules()
      
      const mockCleanupAllWorktrees = vi.fn()
      
      vi.doMock('@/server/worktree-manager', () => ({
        createWorktree: vi.fn().mockReturnValue('/tmp/worktree'),
        cleanupWorktree: vi.fn(),
        cleanupAllWorktrees: mockCleanupAllWorktrees,
        isGitRepo: vi.fn().mockReturnValue(true),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: true,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockCleanupAllWorktrees).toHaveBeenCalledWith('/test/project')
    })

    it('handles worktree creation failure gracefully', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/worktree-manager', () => ({
        createWorktree: vi.fn().mockImplementation(() => {
          throw new Error('Worktree creation failed')
        }),
        cleanupWorktree: vi.fn(),
        cleanupAllWorktrees: vi.fn(),
        isGitRepo: vi.fn().mockReturnValue(true),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: true,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result).toBeDefined()
    })
  })

  describe('MCP tool processing', () => {
    it('skips MCP processing when no servers configured', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
          mcpServers: [],
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
        onMCPToolResult: mockOnMCPToolResult,
      })

      expect(parseToolCallsFromOutput).not.toHaveBeenCalled()
    })

    it('processes MCP tool calls when servers are configured', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
          mcpServers: [
            { id: 'test-server', name: 'Test Server', command: 'test', enabled: true },
          ],
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
        onMCPToolResult: mockOnMCPToolResult,
      })

      expect(parseToolCallsFromOutput).toHaveBeenCalled()
    })

    it('skips disabled MCP servers', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
          mcpServers: [
            { id: 'test-server', name: 'Test Server', command: 'test', enabled: false },
          ],
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
        onMCPToolResult: mockOnMCPToolResult,
      })

      expect(parseToolCallsFromOutput).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('returns failed result on pipeline error', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/cli-runner', () => ({
        spawnCLI: vi.fn().mockImplementation(() => {
          throw new Error('CLI spawn failed')
        }),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result.confidence).toBeGreaterThanOrEqual(0)
    })

    it('handles security check failures gracefully', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/security-checks', () => ({
        runSecurityChecks: vi.fn().mockRejectedValue(new Error('Security check failed')),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result).toBeDefined()
      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('[security]'))
    })

    it('reports error details in output', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/cli-runner', () => ({
        spawnCLI: vi.fn().mockImplementation((options) => {
          setTimeout(() => {
            options.onOutput('Error output')
            options.onExit(1)
          }, 10)
          return { kill: vi.fn() }
        }),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result).toBeDefined()
    })
  })

  describe('output caching', () => {
    it('checks cache before spawning CLI', async () => {
      const { getCachedOutput } = await import('@/server/output-cache')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(getCachedOutput).toHaveBeenCalled()
    })

    it('uses cached output when confidence is high', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/output-cache', () => ({
        getCachedOutput: vi.fn().mockReturnValue({
          output: 'Cached output with enough content for testing',
          confidence: 85,
        }),
        setCachedOutput: vi.fn(),
      }))

      const { cacheHitsTotal } = await import('@/lib/metrics')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(cacheHitsTotal.inc).toHaveBeenCalled()
    })

    it('caches successful outputs', async () => {
      const { setCachedOutput } = await import('@/server/output-cache')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(setCachedOutput).toHaveBeenCalled()
    })
  })

  describe('secrets scanning', () => {
    it('scans and masks secrets in agent output', async () => {
      const { scanAndMaskAgentOutput } = await import('@/server/secrets-scanner')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(scanAndMaskAgentOutput).toHaveBeenCalled()
    })

    it('reports masked secrets count', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/secrets-scanner', () => ({
        scanAndMaskAgentOutput: vi.fn().mockReturnValue({
          maskedOutput: 'Output with ******* masked',
          validation: {
            isValid: false,
            secretsFound: [{ patternName: 'api_key', severity: 'high' }],
            envVarsFound: [],
            summary: { totalSecrets: 1, criticalCount: 0, highCount: 1, mediumCount: 0, lowCount: 0 },
          },
        }),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('[security]'))
    })
  })

  describe('output schema validation', () => {
    it('validates agent outputs against schemas', async () => {
      const { validateAgentOutput } = await import('@/server/output-schemas')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(validateAgentOutput).toHaveBeenCalled()
    })

    it('reports validation errors', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/output-schemas', () => ({
        validateAgentOutput: vi.fn().mockReturnValue({
          isValid: false,
          errors: ['Missing required field: summary'],
          role: 'coder',
          rawOutput: '',
        }),
        getValidationErrorSummary: vi.fn().mockReturnValue('coder: Missing required field: summary'),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('Schema validation'))
    })
  })

  describe('continuous mode', () => {
    it('reruns pipeline when confidence is below threshold', async () => {
      vi.resetModules()
      
      let callCount = 0
      vi.doMock('@/server/confidence', () => ({
        computeConfidence: vi.fn().mockImplementation(() => {
          callCount++
          return callCount < 3 ? 40 : 80
        }),
        extractSources: vi.fn().mockReturnValue(['source1']),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: true,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(result).toBeDefined()
    })

    it('stops after max attempts in continuous mode', async () => {
      vi.resetModules()
      
      vi.doMock('@/server/confidence', () => ({
        computeConfidence: vi.fn().mockReturnValue(40),
        extractSources: vi.fn().mockReturnValue(['source1']),
      }))

      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      const result = await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: true,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(mockOnAgentOutput).toHaveBeenCalledWith('system', expect.stringContaining('max attempts'))
    })
  })

  describe('API mode', () => {
    it('uses API runner when API key is configured', async () => {
      const { runAPIAgent } = await import('@/server/api-runner')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['codex'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
          apiKeys: {
            openai: 'sk-test-key',
          },
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(runAPIAgent).toHaveBeenCalled()
    })

    it('falls back to CLI when no API key is configured', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
          apiKeys: {},
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(spawnCLI).toHaveBeenCalled()
    })
  })

  describe('confidence gates', () => {
    it('exports DEFAULT_STAGE_CONFIDENCE_THRESHOLDS', async () => {
      const { DEFAULT_STAGE_CONFIDENCE_THRESHOLDS } = await import('@/server/orchestrator')
      
      expect(DEFAULT_STAGE_CONFIDENCE_THRESHOLDS).toBeDefined()
      expect(DEFAULT_STAGE_CONFIDENCE_THRESHOLDS.researcher).toBe(40)
      expect(DEFAULT_STAGE_CONFIDENCE_THRESHOLDS.planner).toBe(50)
      expect(DEFAULT_STAGE_CONFIDENCE_THRESHOLDS.coder).toBe(60)
      expect(DEFAULT_STAGE_CONFIDENCE_THRESHOLDS.validator).toBe(70)
      expect(DEFAULT_STAGE_CONFIDENCE_THRESHOLDS.security).toBe(80)
      expect(DEFAULT_STAGE_CONFIDENCE_THRESHOLDS.synthesizer).toBe(50)
    })

    it('reports confidence gate status in output', async () => {
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      const calls = mockOnAgentOutput.mock.calls.map(c => c[1])
      const hasConfidenceGateLog = calls.some(c => 
        typeof c === 'string' && c.includes('Confidence')
      )
      expect(hasConfidenceGateLog).toBe(true)
    })
  })

  describe('telemetry integration', () => {
    it('creates spans for pipeline execution', async () => {
      const { withSpan } = await import('@/lib/telemetry')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(withSpan).toHaveBeenCalledWith('swarm.pipeline', expect.any(Function), expect.any(Object))
    })

    it('adds span events for pipeline stages', async () => {
      const { addSpanEvent } = await import('@/lib/telemetry')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(addSpanEvent).toHaveBeenCalledWith('pipeline.started', expect.any(Object))
      expect(addSpanEvent).toHaveBeenCalledWith('pipeline.completed', expect.any(Object))
    })
  })

  describe('metrics collection', () => {
    it('increments agent spawn counter', async () => {
      const { agentSpawnsTotal } = await import('@/lib/metrics')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(agentSpawnsTotal.inc).toHaveBeenCalled()
    })

    it('observes confidence score', async () => {
      const { confidenceScore } = await import('@/lib/metrics')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Refactor code',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 1, planner: 1, coder: 1, validator: 1, security: 1 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'swarm',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(confidenceScore.observe).toHaveBeenCalledWith({ stage: 'final' }, expect.any(Number))
    })

    it('observes agent response time', async () => {
      const { agentResponseTime } = await import('@/lib/metrics')
      const { runSwarmPipeline } = await import('@/server/orchestrator')
      
      await runSwarmPipeline({
        prompt: 'Test prompt',
        settings: {
          enabledCLIs: ['cursor'],
          parallelCounts: { researcher: 0, planner: 0, coder: 1, validator: 0, security: 0 },
          maxRuntimeSeconds: 300,
          autoRerunThreshold: 60,
          researchDepth: 'standard',
          worktreeIsolation: false,
          continuousMode: false,
          chatsPerAgent: 1,
        } as any,
        projectPath: '/test/project',
        mode: 'chat',
        onAgentOutput: mockOnAgentOutput,
        onAgentStatus: mockOnAgentStatus,
      })

      expect(agentResponseTime.observe).toHaveBeenCalled()
    })
  })
})
