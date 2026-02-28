/* ── API-based agent runner (ChatGPT / Gemini / Claude streaming) ─────── */

export interface APIRunnerOptions {
  provider: 'chatgpt' | 'gemini-api' | 'claude'
  prompt: string
  apiKey: string
  model?: string
  onOutput: (data: string) => void
  onComplete: (fullOutput: string) => void
  onError: (error: string) => void
}

const PROVIDER_TIMEOUT_MS = Number.parseInt(
  process.env.SWARM_PROVIDER_TIMEOUT_MS || '45000',
  10
)

export async function runAPIAgent(
  options: APIRunnerOptions,
): Promise<string> {
  const { provider, prompt, apiKey, model, onOutput, onComplete, onError } = options

  if (!apiKey) {
    onError('API key not configured')
    return ''
  }

  switch (provider) {
    case 'chatgpt':
      return runChatGPT(prompt, apiKey, onOutput, onComplete, onError)
    case 'claude':
      return runClaudeAPI(prompt, apiKey, model, onOutput, onComplete, onError)
    case 'gemini-api':
    default:
      return runGemini(prompt, apiKey, onOutput, onComplete, onError)
  }
}

/* ── SSE line parser ─────────────────────────────────────────── */

function processSSELines(
  buffer: string,
  lineHandler: (dataPayload: string) => void,
): string {
  const lines = buffer.split('\n')
  const remaining = lines.pop() ?? ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data: ')) continue
    const payload = trimmed.slice(6)
    if (payload === '[DONE]') continue
    lineHandler(payload)
  }

  return remaining
}

/* ── ChatGPT (OpenAI Chat Completions with streaming) ────────── */

interface ChatGPTDelta {
  choices?: Array<{ delta?: { content?: string } }>
}

async function runChatGPT(
  prompt: string,
  apiKey: string,
  onOutput: (data: string) => void,
  onComplete: (fullOutput: string) => void,
  onError: (error: string) => void,
): Promise<string> {
  let fullOutput = ''
  const candidateModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1-mini',
    'gpt-3.5-turbo',
  ]

  try {
    let response: Response | null = null
    let selectedModel: string | null = null
    let lastError = ''

    for (const model of candidateModels) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      })

      if (res.ok) {
        response = res
        selectedModel = model
        break
      }

      // eslint-disable-next-line no-await-in-loop
      const errorText = await res.text()
      lastError = `model=${model} status=${res.status} ${errorText}`
      if (res.status === 401) {
        onError(`OpenAI API authentication failed (401): Invalid API key`)
        return ''
      }
    }

    if (!response || !selectedModel) {
      onError(`OpenAI API model resolution failed: ${lastError || 'no compatible model found'}`)
      return ''
    }
    onOutput(`[api-runner] OpenAI model: ${selectedModel}\n`)

    const body = response.body
    if (!body) {
      onError('No response body received from OpenAI')
      return ''
    }

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      buffer = processSSELines(buffer, (payload) => {
        try {
          const parsed: ChatGPTDelta = JSON.parse(payload) as ChatGPTDelta
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullOutput += content
            onOutput(content)
          }
        } catch {
          // Skip malformed SSE chunks
        }
      })
    }

    if (buffer.trim()) {
      processSSELines(buffer + '\n', (payload) => {
        try {
          const parsed: ChatGPTDelta = JSON.parse(payload) as ChatGPTDelta
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullOutput += content
            onOutput(content)
          }
        } catch {
          // Skip
        }
      })
    }

    onComplete(fullOutput)
    return fullOutput
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    onError(`ChatGPT streaming error: ${message}`)
    return fullOutput
  }
}

/* ── Gemini (Google Generative Language streaming) ────────────── */

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
}

interface GeminiModelDescriptor {
  name?: string
  supportedGenerationMethods?: string[]
}

interface GeminiListModelsResponse {
  models?: GeminiModelDescriptor[]
}

const GEMINI_STATIC_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]

const GEMINI_API_VERSIONS = ['v1beta', 'v1'] as const

function normalizeGeminiModelName(name: string): string {
  return name.startsWith('models/') ? name.slice('models/'.length) : name
}

async function getGeminiCandidateModels(apiKey: string): Promise<string[]> {
  try {
    const discovered = new Set<string>()
    for (const version of GEMINI_API_VERSIONS) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(
        `https://generativelanguage.googleapis.com/${version}/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET', signal: AbortSignal.timeout(12_000) },
      )
      if (!res.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const payload = (await res.json()) as GeminiListModelsResponse
      for (const entry of payload.models ?? []) {
        const methods = entry.supportedGenerationMethods ?? []
        const canGenerate =
          methods.includes('generateContent') || methods.includes('streamGenerateContent')
        if (!canGenerate) continue
        const normalized = normalizeGeminiModelName(entry.name ?? '')
        if (normalized) discovered.add(normalized)
      }
    }

    if (discovered.size === 0) return GEMINI_STATIC_MODELS

    const available = Array.from(discovered)
    const preferred = GEMINI_STATIC_MODELS.filter((model) => available.includes(model))
    const remaining = available.filter((model) => !preferred.includes(model))
    // Always append static fallbacks so we don't get stuck on a single stale discovered model.
    const staticFallbacks = GEMINI_STATIC_MODELS.filter(
      (model) => !preferred.includes(model) && !remaining.includes(model),
    )
    return [...preferred, ...remaining, ...staticFallbacks]
  } catch {
    return GEMINI_STATIC_MODELS
  }
}

async function runGemini(
  prompt: string,
  apiKey: string,
  onOutput: (data: string) => void,
  onComplete: (fullOutput: string) => void,
  onError: (error: string) => void,
): Promise<string> {
  let fullOutput = ''
  let lastError = ''
  let quotaError = ''

  try {
    const candidateModels = await getGeminiCandidateModels(apiKey)

    for (const model of candidateModels) {
      for (const version of GEMINI_API_VERSIONS) {
        const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(url, {
          method: 'POST',
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        })

        if (!res.ok) {
          // eslint-disable-next-line no-await-in-loop
          const errorText = await res.text()
          lastError = `api=${version} model=${model} status=${res.status} ${errorText}`
          if (res.status === 429 && !quotaError) {
            quotaError = lastError
          }
          // 404/400 can be model+version mismatch; keep trying next version/model.
          if (res.status === 401 || res.status === 403) {
            onError(`Gemini API error (${res.status}): ${errorText}`)
            return ''
          }
          continue
        }

        // eslint-disable-next-line no-await-in-loop
        const parsed = (await res.json()) as GeminiResponse
        const text = parsed.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim()
        if (!text) {
          lastError = `api=${version} model=${model} status=200 empty-output`
          continue
        }

        onOutput(`[api-runner] Gemini model: ${model} (${version})\n`)
        fullOutput = text
        onOutput(text)
        onComplete(fullOutput)
        return fullOutput
      }
    }

    if (quotaError) {
      onError(`Gemini API quota/rate limit: ${quotaError}`)
      return ''
    }

    if (lastError) {
      onError(`Gemini API model resolution failed: ${lastError}`)
      return ''
    }

    onError('Gemini API model resolution failed: no compatible model found')
    return ''
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    onError(`Gemini API error: ${message}`)
    return fullOutput
  }
}

/* ── Claude (Anthropic Messages API with streaming) ─────────────── */

interface ClaudeStreamEvent {
  type: string
  delta?: { type?: string; text?: string }
  content_block?: { type?: string; text?: string }
  message?: { content?: Array<{ type?: string; text?: string }> }
  error?: { type?: string; message?: string }
}

const CLAUDE_DEFAULT_MODEL = 'claude-3-sonnet-20240229'
const ANTHROPIC_VERSION = '2023-06-01'

async function runClaudeAPI(
  prompt: string,
  apiKey: string,
  model: string | undefined,
  onOutput: (data: string) => void,
  onComplete: (fullOutput: string) => void,
  onError: (error: string) => void,
): Promise<string> {
  let fullOutput = ''

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: model ?? CLAUDE_DEFAULT_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 429) {
        onError(`Claude API rate limited (429): ${errorText}`)
      } else if (response.status === 401) {
        onError(`Claude API authentication failed (401): Invalid API key`)
      } else if (response.status === 400) {
        onError(`Claude API bad request (400): ${errorText}`)
      } else {
        onError(`Claude API error (${response.status}): ${errorText}`)
      }
      return ''
    }

    const body = response.body
    if (!body) {
      onError('No response body received from Claude')
      return ''
    }

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      buffer = processClaudeSSE(buffer, (event) => {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullOutput += event.delta.text
          onOutput(event.delta.text)
        } else if (event.type === 'error' && event.error?.message) {
          onError(`Claude stream error: ${event.error.message}`)
        }
      })
    }

    if (buffer.trim()) {
      processClaudeSSE(buffer + '\n', (event) => {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullOutput += event.delta.text
          onOutput(event.delta.text)
        }
      })
    }

    onComplete(fullOutput)
    return fullOutput
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    onError(`Claude streaming error: ${message}`)
    return fullOutput
  }
}

function processClaudeSSE(
  buffer: string,
  eventHandler: (event: ClaudeStreamEvent) => void,
): string {
  const lines = buffer.split('\n')
  const remaining = lines.pop() ?? ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data: ')) continue
    const payload = trimmed.slice(6)
    if (payload === '[DONE]') continue
    try {
      const event = JSON.parse(payload) as ClaudeStreamEvent
      eventHandler(event)
    } catch {
      // Skip malformed SSE chunks
    }
  }

  return remaining
}

/* ── Standalone Claude API function (for direct usage) ─────────── */

export async function runClaudeAPIStandalone(
  prompt: string,
  apiKey: string,
  model?: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  let fullOutput = ''

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: model ?? CLAUDE_DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errorText}`)
  }

  const body = response.body
  if (!body) {
    throw new Error('No response body received from Claude')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    buffer = processClaudeSSE(buffer, (event) => {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        fullOutput += event.delta.text
        onChunk?.(event.delta.text)
      }
    })
  }

  if (buffer.trim()) {
    processClaudeSSE(buffer + '\n', (event) => {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        fullOutput += event.delta.text
        onChunk?.(event.delta.text)
      }
    })
  }

  return fullOutput
}

/* ── Test function for Claude API ─────────────────────────────── */

export async function testClaudeConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_DEFAULT_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    })

    if (response.ok) {
      return { success: true, message: 'Claude API connection successful' }
    }

    const errorText = await response.text()
    if (response.status === 401) {
      return { success: false, message: 'Invalid API key' }
    }
    if (response.status === 429) {
      return { success: false, message: 'Rate limited - try again later' }
    }
    return { success: false, message: `API error (${response.status}): ${errorText}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}
