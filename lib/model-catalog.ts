import type { CLIProvider } from '@/lib/types'

export type ReasoningMode = 'standard' | 'deep'

export interface ModelCapability {
  supportsDeepReasoning: boolean
  supportsStreaming: boolean
  supportsTools: boolean
}

export interface ModelDefinition {
  id: string
  provider: CLIProvider
  label: string
  capability: ModelCapability
}

export interface ProviderDefinition {
  id: CLIProvider
  label: string
  description: string
  models: ModelDefinition[]
}

export const MODEL_CATALOG: ProviderDefinition[] = [
  {
    id: 'codex',
    label: 'OpenAI',
    description: 'OpenAI coding models for in-app execution',
    models: [
      {
        id: 'codex-gpt-5',
        provider: 'codex',
        label: 'Codex GPT-5',
        capability: {
          supportsDeepReasoning: true,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
      {
        id: 'codex-gpt-4.1',
        provider: 'codex',
        label: 'Codex GPT-4.1',
        capability: {
          supportsDeepReasoning: false,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini API provider',
    models: [
      {
        id: 'gemini-2.5-pro',
        provider: 'gemini',
        label: 'Gemini 2.5 Pro',
        capability: {
          supportsDeepReasoning: true,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
      {
        id: 'gemini-2.5-flash',
        provider: 'gemini',
        label: 'Gemini 2.5 Flash',
        capability: {
          supportsDeepReasoning: false,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    description: 'Anthropic Claude API provider',
    models: [
      {
        id: 'claude-sonnet-4',
        provider: 'claude',
        label: 'Claude Sonnet 4',
        capability: {
          supportsDeepReasoning: true,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
      {
        id: 'claude-haiku-4',
        provider: 'claude',
        label: 'Claude Haiku 4',
        capability: {
          supportsDeepReasoning: false,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor Connector',
    description: 'Optional local runtime connector',
    models: [
      {
        id: 'cursor-default',
        provider: 'cursor',
        label: 'Cursor Local Runtime',
        capability: {
          supportsDeepReasoning: false,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
    ],
  },
  {
    id: 'copilot',
    label: 'Copilot Connector',
    description: 'Optional local/runtime connector',
    models: [
      {
        id: 'copilot-default',
        provider: 'copilot',
        label: 'Copilot Local Runtime',
        capability: {
          supportsDeepReasoning: false,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
    ],
  },
  {
    id: 'rovo',
    label: 'Rovo Connector',
    description: 'Optional local/runtime connector',
    models: [
      {
        id: 'rovo-default',
        provider: 'rovo',
        label: 'Rovo Local Runtime',
        capability: {
          supportsDeepReasoning: false,
          supportsStreaming: true,
          supportsTools: true,
        },
      },
    ],
  },
  {
    id: 'custom',
    label: 'Custom Provider',
    description: 'Custom configured provider/runtime',
    models: [
      {
        id: 'custom-default',
        provider: 'custom',
        label: 'Custom Runtime',
        capability: {
          supportsDeepReasoning: false,
          supportsStreaming: true,
          supportsTools: false,
        },
      },
    ],
  },
]

export function getProviderModels(provider: CLIProvider): ModelDefinition[] {
  return MODEL_CATALOG.find((entry) => entry.id === provider)?.models ?? []
}

export function getModelById(modelId: string): ModelDefinition | null {
  for (const provider of MODEL_CATALOG) {
    const found = provider.models.find((model) => model.id === modelId)
    if (found) return found
  }
  return null
}

export function getDefaultModelForProvider(provider: CLIProvider): string | null {
  return getProviderModels(provider)[0]?.id ?? null
}
