import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPtySpawn = vi.fn()
const mockOnData = vi.fn()
const mockOnExit = vi.fn()
const mockKill = vi.fn()

vi.mock('node-pty', () => ({
  default: {
    spawn: mockPtySpawn,
  },
  spawn: mockPtySpawn,
}))

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('@/lib/cli-registry', () => ({
  getCLICommandFromFile: vi.fn().mockReturnValue('mock-cli --prompt /tmp/prompt.txt'),
}))

vi.mock('@/lib/paths', () => ({
  getTempFile: vi.fn().mockImplementation((name) => `/tmp/${name}`),
}))

describe('cli-runner.ts', () => {
  let dataCallback: ((data: string) => void) | null = null
  let exitCallback: ((info: { exitCode: number; signal?: number }) => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    dataCallback = null
    exitCallback = null

    mockPtySpawn.mockImplementation(() => ({
      onData: vi.fn().mockImplementation((cb) => {
        dataCallback = cb
        return { dispose: vi.fn() }
      }),
      onExit: vi.fn().mockImplementation((cb) => {
        exitCallback = cb
        return { dispose: vi.fn() }
      }),
      kill: mockKill,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  describe('spawnCLI', () => {
    it('spawns a CLI process with correct options', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        workdir: '/test/project',
        maxRuntimeMs: 30000,
        onOutput,
        onExit,
      })

      expect(mockPtySpawn).toHaveBeenCalled()
      const spawnArgs = mockPtySpawn.mock.calls[0]
      expect(spawnArgs[2]).toMatchObject({
        cwd: '/test/project',
      })
    })

    it('returns a handle with kill method', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const handle = spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput: vi.fn(),
        onExit: vi.fn(),
      })

      expect(handle).toHaveProperty('kill')
      expect(typeof handle.kill).toBe('function')
    })

    it('calls onOutput when process emits data', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput,
        onExit,
      })

      if (dataCallback) {
        dataCallback('Hello from CLI')
      }

      expect(onOutput).toHaveBeenCalledWith('Hello from CLI')
    })

    it('calls onExit when process exits', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput,
        onExit,
      })

      if (exitCallback) {
        exitCallback({ exitCode: 0 })
      }

      expect(onExit).toHaveBeenCalledWith(0)
    })

    it('kills process on timeout', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 5000,
        onOutput,
        onExit,
      })

      vi.advanceTimersByTime(5001)

      expect(mockKill).toHaveBeenCalled()
      expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('timed out'))
    })

    it('retries on non-zero exit when maxRetries > 0', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        maxRetries: 2,
        retryDelayMs: 1000,
        onOutput,
        onExit,
      })

      if (exitCallback) {
        exitCallback({ exitCode: 1 })
      }

      expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('Retrying'))

      vi.advanceTimersByTime(1001)

      expect(mockPtySpawn).toHaveBeenCalledTimes(2)
    })

    it('does not retry on exit code 137 (timeout kill)', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        maxRetries: 2,
        retryDelayMs: 1000,
        onOutput,
        onExit,
      })

      if (exitCallback) {
        exitCallback({ exitCode: 137 })
      }

      expect(onExit).toHaveBeenCalledWith(137)
      expect(mockPtySpawn).toHaveBeenCalledTimes(1)
    })

    it('does not retry on exit code 143 (SIGTERM)', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        maxRetries: 2,
        retryDelayMs: 1000,
        onOutput,
        onExit,
      })

      if (exitCallback) {
        exitCallback({ exitCode: 143 })
      }

      expect(onExit).toHaveBeenCalledWith(143)
      expect(mockPtySpawn).toHaveBeenCalledTimes(1)
    })

    it('passes custom environment variables', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput: vi.fn(),
        onExit: vi.fn(),
        env: {
          OPENAI_API_KEY: 'test-key',
          GOOGLE_API_KEY: 'google-key',
        },
      })

      const spawnArgs = mockPtySpawn.mock.calls[0]
      expect(spawnArgs[2].env.OPENAI_API_KEY).toBe('test-key')
      expect(spawnArgs[2].env.GOOGLE_API_KEY).toBe('google-key')
    })

    it('uses custom CLI template when provided', async () => {
      const { getCLICommandFromFile } = await import('@/lib/cli-registry')
      const { spawnCLI } = await import('@/server/cli-runner')
      
      spawnCLI({
        provider: 'custom',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        customTemplate: 'my-custom-cli --input {{PROMPT_FILE}}',
        onOutput: vi.fn(),
        onExit: vi.fn(),
      })

      expect(getCLICommandFromFile).toHaveBeenCalledWith(
        'custom',
        expect.any(String),
        undefined,
        'my-custom-cli --input {{PROMPT_FILE}}'
      )
    })

    it('cleans up prompt file on exit', async () => {
      const { unlinkSync } = await import('node:fs')
      const { spawnCLI } = await import('@/server/cli-runner')
      
      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput: vi.fn(),
        onExit: vi.fn(),
      })

      if (exitCallback) {
        exitCallback({ exitCode: 0 })
      }

      expect(unlinkSync).toHaveBeenCalled()
    })

    it('cleans up prompt file when killed', async () => {
      const { unlinkSync } = await import('node:fs')
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const handle = spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput: vi.fn(),
        onExit: vi.fn(),
      })

      handle.kill()

      expect(unlinkSync).toHaveBeenCalled()
    })

    it('handles spawn failure gracefully', async () => {
      mockPtySpawn.mockImplementation(() => {
        throw new Error('Spawn failed')
      })

      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      const handle = spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput,
        onExit,
      })

      expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('Failed to spawn'))
      expect(onExit).toHaveBeenCalledWith(1)
      expect(handle.kill).toBeDefined()
    })

    it('uses correct shell based on platform', async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      vi.resetModules()
      const { spawnCLI } = await import('@/server/cli-runner')
      
      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        onOutput: vi.fn(),
        onExit: vi.fn(),
      })

      const spawnArgs = mockPtySpawn.mock.calls[0]
      expect(spawnArgs[0]).toBe('powershell.exe')

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('stops retrying after max retries reached', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        maxRetries: 1,
        retryDelayMs: 100,
        onOutput,
        onExit,
      })

      if (exitCallback) {
        exitCallback({ exitCode: 1 })
      }

      vi.advanceTimersByTime(101)

      if (exitCallback) {
        exitCallback({ exitCode: 1 })
      }

      expect(onExit).toHaveBeenCalledWith(1)
      expect(mockPtySpawn).toHaveBeenCalledTimes(2)
    })

    it('cancels retry timer when killed', async () => {
      const { spawnCLI } = await import('@/server/cli-runner')
      
      const onOutput = vi.fn()
      const onExit = vi.fn()

      const handle = spawnCLI({
        provider: 'cursor',
        prompt: 'Test prompt',
        maxRuntimeMs: 30000,
        maxRetries: 2,
        retryDelayMs: 1000,
        onOutput,
        onExit,
      })

      if (exitCallback) {
        exitCallback({ exitCode: 1 })
      }

      handle.kill()

      vi.advanceTimersByTime(1001)

      expect(mockPtySpawn).toHaveBeenCalledTimes(1)
    })
  })
})
