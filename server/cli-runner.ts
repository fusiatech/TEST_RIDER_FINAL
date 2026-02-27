import * as pty from 'node-pty'
import { writeFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { CLIProvider } from '@/lib/types'
import { getCLICommandFromFile } from '@/lib/cli-registry'
import { getTempFile } from '@/lib/paths'
import { createLogger } from '@/server/logger'

const logger = createLogger('cli-runner')

/** Exit codes that should NOT trigger a retry (e.g. timeout kills). */
const NON_RETRYABLE_EXIT_CODES = new Set([137, 143])

/**
 * Options for spawning a CLI agent process via node-pty.
 */
export interface CLIRunnerOptions {
  /** Which CLI provider to use (cursor, gemini, claude, etc.) */
  provider: CLIProvider
  /** The prompt to send to the CLI agent */
  prompt: string
  /** Working directory for the spawned process */
  workdir?: string
  /** Maximum runtime in milliseconds before the process is killed */
  maxRuntimeMs: number
  /** Callback fired whenever the process emits data (stdout/stderr merged in pty) */
  onOutput: (data: string) => void
  /** Callback fired when the process exits */
  onExit: (code: number) => void
  /** Optional custom CLI command template (for provider === 'custom') */
  customTemplate?: string
  /** Maximum number of automatic retries on non-zero exit (default 0 = no retries) */
  maxRetries?: number
  /** Delay in milliseconds before each retry attempt (default 2000) */
  retryDelayMs?: number
  /** Optional additional environment variables to pass to the CLI process */
  env?: {
    OPENAI_API_KEY?: string
    GOOGLE_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    GITHUB_TOKEN?: string
  }
}

/**
 * Handle returned by {@link spawnCLI} to allow the caller to kill the process.
 */
export interface CLIRunnerHandle {
  /** Forcefully kill the pty process. Safe to call multiple times. */
  kill: () => void
}

/**
 * Spawn a single CLI attempt inside a pseudo-terminal (no retry logic).
 * Returns a handle and invokes onExit when the process finishes.
 */
function spawnSingleAttempt(
  options: CLIRunnerOptions,
  promptFile: string,
  timedOut: { value: boolean },
): CLIRunnerHandle {
  const {
    provider,
    workdir,
    maxRuntimeMs,
    onOutput,
    onExit,
    customTemplate,
    env: customEnv,
  } = options

  let killed = false

  const command = getCLICommandFromFile(provider, promptFile, undefined, customTemplate)

  const isWindows = process.platform === 'win32'
  const shell = isWindows ? 'powershell.exe' : 'bash'
  const shellArgs = isWindows ? ['-Command', command] : ['-c', command]

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }

  if (customEnv) {
    if (customEnv.OPENAI_API_KEY) env.OPENAI_API_KEY = customEnv.OPENAI_API_KEY
    if (customEnv.GOOGLE_API_KEY) env.GOOGLE_API_KEY = customEnv.GOOGLE_API_KEY
    if (customEnv.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = customEnv.ANTHROPIC_API_KEY
    if (customEnv.GITHUB_TOKEN) env.GITHUB_TOKEN = customEnv.GITHUB_TOKEN
  }

  let proc: pty.IPty
  try {
    proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: workdir ?? process.cwd(),
      env,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    onOutput(`[cli-runner] Failed to spawn process: ${message}\n`)
    onExit(1)
    return { kill: () => {} }
  }

  const dataDisposable = proc.onData((data: string) => {
    try {
      onOutput(data)
    } catch (err) {
      logger.warn('onOutput callback error', { error: err instanceof Error ? err.message : String(err) })
    }
  })

  const exitDisposable = proc.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
    killed = true
    clearTimeout(timeoutId)
    dataDisposable.dispose()
    exitDisposable.dispose()
    try {
      onExit(exitCode)
    } catch (err) {
      logger.warn('onExit callback error', { error: err instanceof Error ? err.message : String(err), exitCode })
    }
  })

  const timeoutId = setTimeout(() => {
    if (!killed) {
      timedOut.value = true
      try {
        onOutput(
          `\n[cli-runner] Process timed out after ${maxRuntimeMs}ms — killing.\n`,
        )
        proc.kill()
      } catch (err) {
        logger.debug('Process kill after timeout failed (may have already exited)', { error: err instanceof Error ? err.message : String(err) })
      }
    }
  }, maxRuntimeMs)

  return {
    kill: (): void => {
      if (!killed) {
        killed = true
        clearTimeout(timeoutId)
        try {
          proc.kill()
        } catch (err) {
          logger.debug('Process kill failed (may have already exited)', { error: err instanceof Error ? err.message : String(err) })
        }
      }
    },
  }
}

/**
 * Spawn a CLI agent process inside a pseudo-terminal.
 *
 * The full CLI command is assembled by {@link getCLICommandFromFile} and executed inside
 * a platform-appropriate shell (`bash -c` on Unix, `powershell.exe -Command` on Windows).
 * A timeout is set up that kills the process after `maxRuntimeMs`.
 *
 * When `maxRetries` > 0, non-zero exits are retried up to that many times with a
 * configurable delay (`retryDelayMs`, default 2 000 ms). Timeout kills and signal
 * kills (exit codes 137/143) are never retried.
 *
 * @param options - Configuration for the CLI run.
 * @returns A handle with a `kill()` method to terminate the process early.
 */
export function spawnCLI(options: CLIRunnerOptions): CLIRunnerHandle {
  const {
    prompt,
    onOutput,
    onExit,
    maxRetries = 0,
    retryDelayMs = 2000,
  } = options

  const promptFile = getTempFile(`swarm-prompt-${randomUUID()}.txt`)
  writeFileSync(promptFile, prompt, 'utf-8')

  let attempt = 0
  let outerKilled = false
  let currentHandle: CLIRunnerHandle | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function launchAttempt(): void {
    if (outerKilled) return

    const timedOut = { value: false }
    currentHandle = spawnSingleAttempt(
      {
        ...options,
        onOutput,
        onExit: (code: number) => {
          currentHandle = null

          const canRetry =
            code !== 0 &&
            !outerKilled &&
            attempt < maxRetries &&
            !timedOut.value &&
            !NON_RETRYABLE_EXIT_CODES.has(code)

          if (canRetry) {
            attempt++
            onOutput(
              `\n[cli-runner] Process exited with code ${code}. Retrying (${attempt}/${maxRetries}) in ${retryDelayMs}ms...\n`,
            )
            retryTimer = setTimeout(() => {
              retryTimer = null
              launchAttempt()
            }, retryDelayMs)
            return
          }

          try { unlinkSync(promptFile) } catch (err) { logger.debug('Prompt file cleanup failed', { error: err instanceof Error ? err.message : String(err), promptFile }) }
          try {
            onExit(code)
          } catch (err) {
            logger.warn('onExit callback error in retry handler', { error: err instanceof Error ? err.message : String(err), exitCode: code })
          }
        },
      },
      promptFile,
      timedOut,
    )
  }

  launchAttempt()

  return {
    kill: (): void => {
      if (!outerKilled) {
        outerKilled = true
        if (retryTimer !== null) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
        try { unlinkSync(promptFile) } catch (err) { logger.debug('Prompt file cleanup failed on kill', { error: err instanceof Error ? err.message : String(err), promptFile }) }
        if (currentHandle) {
          currentHandle.kill()
          currentHandle = null
        }
      }
    },
  }
}
