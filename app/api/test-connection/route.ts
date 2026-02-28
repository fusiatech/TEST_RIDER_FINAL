import { NextRequest, NextResponse } from 'next/server'
import { testClaudeConnection } from '@/server/api-runner'
import { detectInstalledCLIs } from '@/server/cli-detect'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { provider: string; apiKey: string }
    const { provider, apiKey } = body

    if (!provider || !apiKey) {
      return NextResponse.json(
        { success: false, message: 'Provider and API key are required' },
        { status: 400 }
      )
    }

    switch (provider) {
      case 'anthropic':
      case 'claude': {
        const result = await testClaudeConnection(apiKey)
        return NextResponse.json(result)
      }

      case 'openai': {
        const result = await testOpenAIConnection(apiKey)
        return NextResponse.json(result)
      }

      case 'google':
      case 'gemini': {
        const result = await testGeminiConnection(apiKey)
        return NextResponse.json(result)
      }

      case 'github':
      case 'copilot': {
        const result = await testGitHubConnection(apiKey)
        return NextResponse.json(result)
      }

      case 'codex': {
        const result = await testOpenAIConnection(apiKey)
        return NextResponse.json(result)
      }

      case 'cursor':
      case 'rovo':
      case 'custom': {
        const result = await testCliProviderReadiness(provider, apiKey)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json(
          { success: false, message: `Unknown provider: ${provider}` },
          { status: 400 }
        )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, message: `Test failed: ${message}` },
      { status: 500 }
    )
  }
}

async function testOpenAIConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (response.ok) {
      return { success: true, message: 'OpenAI API connection successful' }
    }

    if (response.status === 401) {
      return { success: false, message: 'Invalid API key' }
    }
    if (response.status === 429) {
      return { success: false, message: 'Rate limited - try again later' }
    }
    const errorText = await response.text()
    return { success: false, message: `API error (${response.status}): ${errorText}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

async function testGeminiConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url, { method: 'GET' })

    if (response.ok) {
      return { success: true, message: 'Gemini API connection successful' }
    }

    if (response.status === 400 || response.status === 401) {
      return { success: false, message: 'Invalid API key' }
    }
    if (response.status === 429) {
      return { success: false, message: 'Rate limited - try again later' }
    }
    const errorText = await response.text()
    return { success: false, message: `API error (${response.status}): ${errorText}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

async function testGitHubConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'swarm-ui',
        Accept: 'application/vnd.github+json',
      },
    })

    if (response.ok) {
      return { success: true, message: 'GitHub token is valid' }
    }

    if (response.status === 401) {
      return { success: false, message: 'Invalid GitHub token' }
    }

    const errorText = await response.text()
    return { success: false, message: `GitHub API error (${response.status}): ${errorText}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

async function testCliProviderReadiness(
  provider: string,
  apiKey: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const detected = await detectInstalledCLIs()
    const installed = detected.find((c) => c.id === provider)?.installed ?? false
    if (installed) {
      return { success: true, message: `${provider} CLI detected and profile key saved` }
    }
    return {
      success: true,
      message: `${provider} key saved. Local CLI is not installed, but self-contained in-app mode remains available via OpenAI/Gemini/Claude providers.`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Readiness check failed: ${message}` }
  }
}
