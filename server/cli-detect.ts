import { execSync } from 'child_process'
import type { CLIDefinition } from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'

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

export async function detectInstalledCLIs(): Promise<CLIDefinition[]> {
  return CLI_REGISTRY.map((cli) => ({
    ...cli,
    installed: isCLIInstalled(cli.command),
  }))
}
