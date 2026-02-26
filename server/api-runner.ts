/* ── API-based agent runner (ChatGPT / Gemini streaming) ─────── */

export interface APIRunnerOptions {
  provider: 'chatgpt' | 'gemini-api'
  prompt: string
  apiKey: string
  onOutput: (data: string) => void
  onComplete: (fullOutput: string) => void
  onError: (error: string) => void
}

export async function runAPIAgent(
  options: APIRunnerOptions,
): Promise<string> {
  const { provider, prompt, apiKey, onOutput, onComplete, onError } = options

  if (!apiKey) {
    onError('API key not configured')
    return ''
  }

  if (provider === 'chatgpt') {
    return runChatGPT(prompt, apiKey, onOutput, onComplete, onError)
  }
  return runGemini(prompt, apiKey, onOutput, onComplete, onError)
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

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      onError(`Gemini API error (${response.status}): ${errorText}`)
      return ''
    }

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
