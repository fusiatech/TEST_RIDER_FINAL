const DEV_AUTH_FALLBACK_SECRET = 'swarm-ui-local-dev-auth-secret'

export function getEffectiveAuthSecret(): string | undefined {
  const authSecret = process.env.AUTH_SECRET?.trim()
  if (authSecret) {
    return authSecret
  }

  const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim()
  if (nextAuthSecret) {
    return nextAuthSecret
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_AUTH_FALLBACK_SECRET
  }

  return undefined
}

export function isAuthSecretConfigured(): boolean {
  return Boolean(getEffectiveAuthSecret())
}

export function ensureProductionAuthSecret(): void {
  if (process.env.NODE_ENV === 'production' && !isAuthSecretConfigured()) {
    throw new Error(
      'Missing auth secret: set AUTH_SECRET or NEXTAUTH_SECRET before starting in production.'
    )
  }
}
