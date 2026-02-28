const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export type BackendFeatureFlag =
  | 'BACKEND_INTEGRATIONS'
  | 'BILLING_STRIPE'
  | 'GITHUB_INTEGRATION'
  | 'FIGMA_USER_SCOPED'
  | 'MCP_MANAGED_SERVERS'
  | 'SLACK_INTEGRATION'
  | 'LINEAR_INTEGRATION'
  | 'PROVIDER_CATALOG'

function envName(flag: BackendFeatureFlag): string {
  return `FEATURE_${flag}`
}

export function isFeatureEnabled(flag: BackendFeatureFlag): boolean {
  const raw = process.env[envName(flag)]
  if (raw === undefined) {
    return process.env.NODE_ENV !== 'production'
  }
  return TRUE_VALUES.has(raw.trim().toLowerCase())
}

export function requireFeature(flag: BackendFeatureFlag): { ok: true } | { ok: false; message: string } {
  if (isFeatureEnabled(flag)) {
    return { ok: true }
  }
  return {
    ok: false,
    message: `Feature ${flag} is disabled. Set ${envName(flag)}=true to enable.`,
  }
}
