import type { CLIDefinition, CLIProvider } from '@/lib/types'

export const CLI_REGISTRY: CLIDefinition[] = [
  {
    id: 'cursor',
    name: 'Cursor CLI',
    command: 'cursor',
    args: ['-p', '--force'],
    promptFlag: '',
    enabled: true
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    args: ['-p'],
    promptFlag: '',
    enabled: false
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    args: ['-p', '--output-format', 'stream-json'],
    promptFlag: '',
    enabled: false
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    command: 'copilot',
    args: ['-p'],
    promptFlag: '',
    enabled: false
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    command: 'codex',
    args: ['exec'],
    promptFlag: '',
    enabled: false
  },
  {
    id: 'rovo',
    name: 'Rovo Dev',
    command: 'acli',
    args: ['rovodev', 'run'],
    promptFlag: '',
    enabled: false
  },
  {
    id: 'custom',
    name: 'Custom CLI',
    command: '',
    args: [],
    promptFlag: '',
    enabled: false
  }
]

export function buildCLICommand(cli: CLIDefinition, prompt: string): { command: string; args: string[] } {
  return {
    command: cli.command,
    args: [...cli.args, prompt]
  }
}

export function getEnabledCLIs(registry: CLIDefinition[]): CLIDefinition[] {
  return registry.filter(cli => cli.enabled)
}

/**
 * Safely escape a string for bash using single quotes.
 * Single quotes prevent ALL shell interpretation except the quote itself.
 * Each embedded single quote is replaced with the sequence: '\'' 
 * (end current quote, add an escaped literal quote, start new quote).
 */
export function shellEscape(s: string): string {
  const escaped = s.replace(/'/g, "'\\''")
  return `'${escaped}'`
}

/**
 * Backward-compatible command builder used by server/cli-runner.ts.
 * Assembles a single shell command string from a provider id and prompt.
 */
export function getCLICommand(
  provider: CLIProvider,
  prompt: string,
  workdir?: string,
  customTemplate?: string
): string {
  if (provider === 'custom') {
    if (!customTemplate || !customTemplate.includes('{PROMPT}')) {
      throw new Error(
        'Custom CLI provider requires a command template containing {PROMPT}'
      )
    }
    return customTemplate.replace('{PROMPT}', shellEscape(prompt))
  }

  const cli = CLI_REGISTRY.find((c) => c.id === provider)
  if (!cli) {
    throw new Error(`Unknown CLI provider: ${provider}`)
  }

  const escaped = shellEscape(prompt)
  const parts = [cli.command, ...cli.args, escaped]

  if (workdir) {
    return `cd "${workdir}" && ${parts.join(' ')}`
  }

  return parts.join(' ')
}

/**
 * Build a shell command that reads the prompt from a file instead of inlining
 * it.  This avoids shell-escaping issues with backticks, dollar signs, newlines
 * and other special characters that are common in LLM prompts.
 *
 * The file is read via `cat` wrapped in `$( )` so the shell never needs to
 * parse the prompt content as code.
 *
 * @param provider   - CLI provider id (e.g. 'cursor', 'gemini').
 * @param promptFile - Absolute path to the file containing the prompt text.
 * @param workdir    - Optional working directory to `cd` into first.
 * @param customTemplate - Template string for the 'custom' provider.
 * @returns A shell command string safe to pass to `bash -c`.
 */
export function getCLICommandFromFile(
  provider: CLIProvider,
  promptFile: string,
  workdir?: string,
  customTemplate?: string
): string {
  const fileRef = `"$(cat ${shellEscape(promptFile)})"`

  if (provider === 'custom') {
    if (!customTemplate || !customTemplate.includes('{PROMPT}')) {
      throw new Error(
        'Custom CLI provider requires a command template containing {PROMPT}'
      )
    }
    const cmd = customTemplate.replace('{PROMPT}', fileRef)
    if (workdir) {
      return `cd "${workdir}" && ${cmd}`
    }
    return cmd
  }

  const cli = CLI_REGISTRY.find((c) => c.id === provider)
  if (!cli) {
    throw new Error(`Unknown CLI provider: ${provider}`)
  }

  const parts = [cli.command, ...cli.args, fileRef]

  if (workdir) {
    return `cd "${workdir}" && ${parts.join(' ')}`
  }

  return parts.join(' ')
}

