const DEFAULT_ALLOWED_PROTOCOLS = new Set(['https:', 'http:'])

export function validateBillingRedirectUrl(candidate: string, requestOrigin: string): string {
  const parsed = new URL(candidate)
  if (!DEFAULT_ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('Redirect URL must use http or https')
  }

  const configuredOrigins = (process.env.BILLING_ALLOWED_REDIRECT_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (configuredOrigins.length === 0) {
    if (parsed.origin !== requestOrigin) {
      throw new Error('Redirect URL origin is not allowed')
    }
  } else if (!configuredOrigins.includes(parsed.origin)) {
    throw new Error('Redirect URL origin is not allowed')
  }

  return parsed.toString()
}
