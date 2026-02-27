import assert from 'node:assert/strict'
import type { CLIDefinition } from '@/lib/types'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { detectCLIProviderDiagnostics } from '@/server/cli-detect'

function makeRunner(state: 'missing' | 'unauthenticated' | 'healthy') {
  return (command: string): string => {
    if (command.startsWith('which ')) {
      if (state === 'missing') throw new Error('not found')
      return '/usr/bin/mock'
    }
    if (command.includes('--version') || command.endsWith(' -v')) return 'mock 1.2.3'
    if (command.includes('auth status')) {
      if (state === 'unauthenticated') throw new Error('not auth')
      return 'authenticated'
    }
    return 'ok'
  }
}

function run(): void {
  const missing = detectCLIProviderDiagnostics({ runCommand: makeRunner('missing'), env: {} })
  assert(missing.every((d) => d.failureReasons.includes('missing_binary')))

  const unauth = detectCLIProviderDiagnostics({ runCommand: makeRunner('unauthenticated'), env: {} })
  const cursorUnauth = unauth.find((d) => d.id === 'cursor')
  assert(cursorUnauth)
  assert(cursorUnauth.failureReasons.includes('unauthenticated'))

  const unsupportedRegistry: CLIDefinition[] = CLI_REGISTRY.map((cli) =>
    cli.id === 'claude' ? { ...cli, args: ['-p'] } : { ...cli },
  )
  const unsupported = detectCLIProviderDiagnostics({
    runCommand: makeRunner('healthy'),
    env: { ANTHROPIC_API_KEY: 'x' },
    registry: unsupportedRegistry,
  })
  const claude = unsupported.find((d) => d.id === 'claude')
  assert(claude)
  assert(claude.failureReasons.includes('unsupported_flags'))

  const healthy = detectCLIProviderDiagnostics({
    runCommand: makeRunner('healthy'),
    env: {
      GEMINI_API_KEY: 'x',
      ANTHROPIC_API_KEY: 'x',
      OPENAI_API_KEY: 'x',
      GITHUB_TOKEN: 'x',
    },
  })
  const passing = healthy.filter((d) => d.healthy)
  assert(passing.length > 0)

  console.log('provider diagnostics mock tests passed')
}

run()
