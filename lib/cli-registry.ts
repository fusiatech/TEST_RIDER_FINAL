import type { CLIDefinition, CLIProvider } from '@/lib/types'

export const CLI_REGISTRY: CLIDefinition[] = [
  {
    id: 'cursor',
    name: 'Cursor CLI',
    command: 'cursor-agent',
    args: ['-p', '--output-format', 'text', '--trust'],
    promptFlag: '',
    enabled: true,
    description: 'Cursor AI-powered code editor CLI',
    color: '#00d4aa',
    supportsAPI: false,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    args: ['-p'],
    promptFlag: '',
    enabled: false,
    description: 'Google Gemini AI assistant',
    color: '#4285f4',
    supportsAPI: true,
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    args: ['-p', '--output-format', 'stream-json'],
    promptFlag: '',
    enabled: false,
    description: 'Anthropic Claude AI assistant with API support',
    color: '#d97706',
    supportsAPI: true,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    command: 'copilot',
    args: ['-p'],
    promptFlag: '',
    enabled: false,
    description: 'GitHub Copilot AI pair programmer',
    color: '#6e40c9',
    supportsAPI: false,
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    command: 'codex',
    args: ['exec'],
    promptFlag: '',
    enabled: false,
    description: 'OpenAI Codex code generation',
    color: '#10a37f',
    supportsAPI: true,
  },
  {
    id: 'rovo',
    name: 'Rovo Dev',
    command: 'acli',
    args: ['rovodev', 'run'],
    promptFlag: '',
    enabled: false,
    description: 'Atlassian Rovo development assistant',
    color: '#0052cc',
    supportsAPI: false,
  },
  {
    id: 'custom',
    name: 'Custom CLI',
    command: '',
    args: [],
    promptFlag: '',
    enabled: false,
    description: 'Custom CLI command with {PROMPT} placeholder',
    color: '#6b7280',
    supportsAPI: false,
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
 * Validate and sanitize a file path to prevent shell injection.
 * Rejects paths containing dangerous shell metacharacters.
 * @throws Error if the path contains dangerous characters.
 */
export function sanitizePath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new Error('Path must be a non-empty string')
  }
  
  const dangerousPatterns = [
    /[`$(){}|;&<>!]/,
    /\n|\r/,
    /\0/,
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(path)) {
      throw new Error(`Path contains dangerous characters: ${path}`)
    }
  }
  
  return path
}

/**
 * Validate a custom CLI template for security.
 * Ensures the template doesn't contain obvious injection attempts.
 * @throws Error if the template is invalid or contains dangerous patterns.
 */
export function validateCustomTemplate(template: string): void {
  if (!template || typeof template !== 'string') {
    throw new Error('Custom template must be a non-empty string')
  }
  
  if (!template.includes('{PROMPT}')) {
    throw new Error('Custom CLI provider requires a command template containing {PROMPT}')
  }
  
  const promptPlaceholderCount = (template.match(/\{PROMPT\}/g) || []).length
  if (promptPlaceholderCount > 1) {
    throw new Error('Custom template must contain exactly one {PROMPT} placeholder')
  }
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
    validateCustomTemplate(customTemplate!)
    return customTemplate!.replace('{PROMPT}', shellEscape(prompt))
  }

  const cli = CLI_REGISTRY.find((c) => c.id === provider)
  if (!cli) {
    throw new Error(`Unknown CLI provider: ${provider}`)
  }

  const escaped = shellEscape(prompt)
  const parts = [cli.command, ...cli.args, escaped]

  if (workdir) {
    const sanitizedWorkdir = sanitizePath(workdir)
    return `cd ${shellEscape(sanitizedWorkdir)} && ${parts.join(' ')}`
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
  const sanitizedPromptFile = sanitizePath(promptFile)
  const fileRef =
    process.platform === 'win32'
      ? `"$(Get-Content -Raw ${shellEscape(sanitizedPromptFile)})"`
      : `"$(cat ${shellEscape(sanitizedPromptFile)})"`

  if (provider === 'custom') {
    validateCustomTemplate(customTemplate!)
    const cmd = customTemplate!.replace('{PROMPT}', fileRef)
    if (workdir) {
      const sanitizedWorkdir = sanitizePath(workdir)
      return `cd ${shellEscape(sanitizedWorkdir)} && ${cmd}`
    }
    return cmd
  }

  const cli = CLI_REGISTRY.find((c) => c.id === provider)
  if (!cli) {
    throw new Error(`Unknown CLI provider: ${provider}`)
  }

  const parts = [cli.command, ...cli.args, fileRef]

  if (workdir) {
    const sanitizedWorkdir = sanitizePath(workdir)
    return `cd ${shellEscape(sanitizedWorkdir)} && ${parts.join(' ')}`
  }

  return parts.join(' ')
}
