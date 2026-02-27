import { execSync } from 'child_process'
import type { CLIDefinition, CLIProvider } from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'

/** Extended CLI info with version and capabilities */
export interface CLIInfo extends CLIDefinition {
  version?: string
  capabilities: CLICapabilities
  detectedAt: number
}

/** Feature capabilities for each CLI */
export interface CLICapabilities {
  streaming: boolean
  multiTurn: boolean
  fileContext: boolean
  codeExecution: boolean
  webSearch: boolean
  imageInput: boolean
  workspaceAware: boolean
}

/** Default capabilities (conservative) */
const DEFAULT_CAPABILITIES: CLICapabilities = {
  streaming: false,
  multiTurn: false,
  fileContext: false,
  codeExecution: false,
  webSearch: false,
  imageInput: false,
  workspaceAware: false,
}

/** Known capabilities per CLI provider */
const PROVIDER_CAPABILITIES: Record<CLIProvider, Partial<CLICapabilities>> = {
  cursor: {
    streaming: true,
    multiTurn: true,
    fileContext: true,
    codeExecution: true,
    workspaceAware: true,
  },
  gemini: {
    streaming: true,
    multiTurn: true,
    fileContext: true,
    webSearch: true,
    imageInput: true,
  },
  claude: {
    streaming: true,
    multiTurn: true,
    fileContext: true,
    codeExecution: true,
  },
  copilot: {
    streaming: true,
    multiTurn: true,
    fileContext: true,
    workspaceAware: true,
  },
  codex: {
    streaming: true,
    multiTurn: true,
    fileContext: true,
    codeExecution: true,
  },
  rovo: {
    streaming: true,
    multiTurn: true,
    fileContext: true,
  },
  custom: {},
}

/** Cache for CLI detection results */
let cachedCLIs: CLIInfo[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60_000

function isCLIInstalled(command: string): boolean {
  if (!command) return false
  const checkCmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    execSync(`${checkCmd} ${command}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function getCLIVersion(command: string, provider: CLIProvider): string | undefined {
  if (!command) return undefined

  const versionFlags: Record<CLIProvider, string[]> = {
    cursor: ['--version', '-v'],
    gemini: ['--version'],
    claude: ['--version', '-V'],
    copilot: ['--version'],
    codex: ['--version'],
    rovo: ['--version'],
    custom: ['--version'],
  }

  const flags = versionFlags[provider] ?? ['--version']

  for (const flag of flags) {
    try {
      const output = execSync(`${command} ${flag}`, {
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 5000,
      }).trim()

      const versionMatch = output.match(/(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/)?.[1]
      if (versionMatch) {
        return versionMatch
      }

      if (output.length < 100) {
        return output.split('\n')[0].trim()
      }
    } catch {
      continue
    }
  }

  return undefined
}

function getCapabilities(provider: CLIProvider, version?: string): CLICapabilities {
  const providerCaps = PROVIDER_CAPABILITIES[provider] ?? {}
  return { ...DEFAULT_CAPABILITIES, ...providerCaps }
}

export async function detectInstalledCLIs(): Promise<CLIDefinition[]> {
  const infos = await detectCLIsWithInfo()
  return infos.map((info) => ({
    id: info.id,
    name: info.name,
    command: info.command,
    args: info.args,
    promptFlag: info.promptFlag,
    enabled: info.enabled,
    installed: info.installed,
    description: info.description,
    color: info.color,
    supportsAPI: info.supportsAPI,
  }))
}

export async function detectCLIsWithInfo(): Promise<CLIInfo[]> {
  const now = Date.now()
  if (cachedCLIs && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCLIs
  }

  const results: CLIInfo[] = CLI_REGISTRY.map((cli) => {
    const installed = isCLIInstalled(cli.command)
    const version = installed ? getCLIVersion(cli.command, cli.id) : undefined
    const capabilities = getCapabilities(cli.id, version)

    return {
      ...cli,
      installed,
      version,
      capabilities,
      detectedAt: now,
    }
  })

  cachedCLIs = results
  cacheTimestamp = now

  return results
}

export function clearCLICache(): void {
  cachedCLIs = null
  cacheTimestamp = 0
}

export async function getCLIInfo(provider: CLIProvider): Promise<CLIInfo | null> {
  const clis = await detectCLIsWithInfo()
  return clis.find((c) => c.id === provider) ?? null
}

export async function getInstalledCLIProviders(): Promise<CLIProvider[]> {
  const clis = await detectCLIsWithInfo()
  return clis.filter((c) => c.installed).map((c) => c.id)
}

export async function getCLIsWithCapability(
  capability: keyof CLICapabilities
): Promise<CLIInfo[]> {
  const clis = await detectCLIsWithInfo()
  return clis.filter((c) => c.installed && c.capabilities[capability])
}
