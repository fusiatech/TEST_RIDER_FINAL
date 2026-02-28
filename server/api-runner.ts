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

  try {
    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      onError(`OpenAI API error (${response.status}): ${errorText}`)
      return ''
    }

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

async function runGemini(
  prompt: string,
  apiKey: string,
  onOutput: (data: string) => void,
  onComplete: (fullOutput: string) => void,
  onError: (error: string) => void,
): Promise<string> {
  let fullOutput = ''
  const candidateModels = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ]
  let lastError = ''

  try {
    let response: Response | null = null
    let selectedModel: string | null = null
    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      })
      if (res.ok) {
        response = res
        selectedModel = model
        break
      }
      const errorText = await res.text()
      lastError = `model=${model} status=${res.status} ${errorText}`
      // For invalid key or quota, fail fast instead of trying next model.
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
        onError(`Gemini API error (${res.status}): ${errorText}`)
        return ''
      }
    }
    if (!response || !selectedModel) {
      onError(`Gemini API model resolution failed: ${lastError || 'no compatible model found'}`)
      return ''
    }
    onOutput(`[api-runner] Gemini model: ${selectedModel}\n`)

    const body = response.body
    if (!body) {
      onError('No response body received from Gemini')
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
          const parsed: GeminiResponse = JSON.parse(payload) as GeminiResponse
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            fullOutput += text
            onOutput(text)
          }
        } catch {
          // Skip malformed SSE chunks
        }
      })
    }

    if (buffer.trim()) {
      processSSELines(buffer + '\n', (payload) => {
        try {
          const parsed: GeminiResponse = JSON.parse(payload) as GeminiResponse
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            fullOutput += text
            onOutput(text)
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
    onError(`Gemini streaming error: ${message}`)
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
