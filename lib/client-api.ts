'use client'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

let csrfTokenPromise: Promise<string> | null = null

function shouldAttachCsrf(url: string, method: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false
  return (
    url.startsWith('/api/integrations/')
    || url.startsWith('/api/billing/')
    || url.startsWith('/api/providers/')
    || url === '/api/me/profile'
    || url === '/api/me/integrations'
  )
}

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (!csrfTokenPromise || forceRefresh) {
    csrfTokenPromise = (async () => {
      const response = await fetch('/api/csrf', {
        method: 'GET',
        credentials: 'same-origin',
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch CSRF token (${response.status})`)
      }
      const data = (await response.json()) as { csrfToken?: string }
      if (!data.csrfToken) {
        throw new Error('Missing CSRF token in response')
      }
      return data.csrfToken
    })()
  }
  return csrfTokenPromise
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers ?? {})

  if (shouldAttachCsrf(input, method)) {
    const token = await getCsrfToken()
    headers.set('x-csrf-token', token)
  }

  const response = await fetch(input, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
  })

  if (response.status === 403 && shouldAttachCsrf(input, method)) {
    // Retry once with a refreshed token in case the prior token expired.
    const refreshedToken = await getCsrfToken(true)
    const retryHeaders = new Headers(headers)
    retryHeaders.set('x-csrf-token', refreshedToken)
    return fetch(input, {
      ...init,
      method,
      headers: retryHeaders,
      credentials: 'same-origin',
    })
  }

  return response
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.message === 'string' && record.message) return record.message
  if (typeof record.error === 'string' && record.error) return record.error
  return null
}

export async function apiJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(input, init)
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = extractErrorMessage(payload) ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  return payload as T
}
