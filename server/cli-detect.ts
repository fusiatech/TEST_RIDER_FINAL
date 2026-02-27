import { execSync } from 'child_process'
import type {
  CLIDefinition,
  CLIProvider,
  ProviderDiagnostics,
  ProviderFailureReason,
} from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'

const PROVIDER_CAPABILITIES: Record<
  CLIProvider,
  Record<string, boolean>
> = {
  cursor: { promptFile: true, streamingOutput: true, jsonOutput: false },
  gemini: { promptFile: true, streamingOutput: false, jsonOutput: false },
  claude: { promptFile: true, streamingOutput: true, jsonOutput: true },
  copilot: { promptFile: true, streamingOutput: false, jsonOutput: false },
  codex: { promptFile: true, streamingOutput: true, jsonOutput: false },
  rovo: { promptFile: true, streamingOutput: false, jsonOutput: false },
  custom: { promptFile: true, streamingOutput: false, jsonOutput: false },
}

const REQUIRED_FLAGS_BY_PROVIDER: Partial<Record<CLIProvider, string[]>> = {
  cursor: ['-p', '--force'],
  gemini: ['-p'],
  claude: ['-p', '--output-format', 'stream-json'],
  copilot: ['-p'],
}

const AUTH_CHECKS: Partial<Record<CLIProvider, string>> = {
  cursor: 'cursor auth status',
  gemini: 'gemini auth status',
  claude: 'claude auth status',
  copilot: 'copilot auth status',
  codex: 'codex auth status',
  rovo: 'acli auth status',
}

export interface DetectOptions {
  runCommand?: (command: string) => string
  env?: Partial<NodeJS.ProcessEnv>
  registry?: CLIDefinition[]
}

function defaultRunCommand(command: string): string {
  return execSync(command, { stdio: 'pipe', encoding: 'utf8' })
}

function isCLIInstalled(command: string, runCommand: (command: string) => string): boolean {
  if (!command) return false
  const checkCmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    runCommand(`${checkCmd} ${command}`)
    return true
  } catch {
    return false
  }
}

function safeRun(command: string, runCommand: (command: string) => string): string | null {
  try {
    return runCommand(command).trim()
  } catch {
    return null
  }
}

function resolveVersion(command: string, runCommand: (command: string) => string): string | null {
  if (!command) return null
  return safeRun(`${command} --version`, runCommand) ?? safeRun(`${command} -v`, runCommand)
}

function argsSupportRequiredFlags(cli: CLIDefinition): boolean {
  const required = REQUIRED_FLAGS_BY_PROVIDER[cli.id]
  if (!required || required.length === 0) return true
  const joined = ` ${cli.args.join(' ')} `
  return required.every((flag) => joined.includes(` ${flag} `))
}

function isAuthenticated(
  cli: CLIDefinition,
  runCommand: (command: string) => string,
  env: Partial<NodeJS.ProcessEnv>,
): boolean {
  if (cli.id === 'custom') return true

  const tokenName =
    cli.id === 'gemini'
      ? 'GEMINI_API_KEY'
      : cli.id === 'claude'
        ? 'ANTHROPIC_API_KEY'
        : cli.id === 'codex'
          ? 'OPENAI_API_KEY'
          : cli.id === 'copilot'
            ? 'GITHUB_TOKEN'
            : null

  if (tokenName && env[tokenName]?.trim()) {
    return true
  }

  const authCommand = AUTH_CHECKS[cli.id]
  if (!authCommand) return true

  const output = safeRun(authCommand, runCommand)
  if (!output) return false

  return /(authenticated|logged in|active|ok)/i.test(output)
}

function buildDiagnostics(
  cli: CLIDefinition,
  runCommand: (command: string) => string,
  env: Partial<NodeJS.ProcessEnv>,
): ProviderDiagnostics {
  const installed = isCLIInstalled(cli.command, runCommand)
  const version = installed ? resolveVersion(cli.command, runCommand) : null
  const supportsFlags = argsSupportRequiredFlags(cli)
  const authenticated = installed ? isAuthenticated(cli, runCommand, env) : false

  const failureReasons: ProviderFailureReason[] = []
  if (!installed) failureReasons.push('missing_binary')
  if (installed && !authenticated) failureReasons.push('unauthenticated')
  if (!supportsFlags) failureReasons.push('unsupported_flags')

  const healthy = failureReasons.length === 0

  return {
    id: cli.id,
    name: cli.name,
    command: cli.command,
    installed,
    authenticated,
    version,
    capabilities: PROVIDER_CAPABILITIES[cli.id] ?? { promptFile: true },
    healthy,
    failureReasons,
  }
}

export function detectInstalledCLIs(options?: DetectOptions): CLIDefinition[] {
  const runCommand = options?.runCommand ?? defaultRunCommand
  const registry = options?.registry ?? CLI_REGISTRY
  return registry.map((cli) => ({
    ...cli,
    installed: isCLIInstalled(cli.command, runCommand),
  }))
}

export function detectCLIProviderDiagnostics(options?: DetectOptions): ProviderDiagnostics[] {
  const runCommand = options?.runCommand ?? defaultRunCommand
  const env = options?.env ?? process.env

  const registry = options?.registry ?? CLI_REGISTRY
  return registry.map((cli) => buildDiagnostics(cli, runCommand, env))
}

export function canDispatchToProvider(diag: ProviderDiagnostics): {
  ok: boolean
  reason?: ProviderFailureReason
} {
  const reason = diag.failureReasons[0]
  if (!reason) return { ok: true }
  return { ok: false, reason }
}
