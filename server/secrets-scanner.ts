import { createLogger } from './logger'

const logger = createLogger('secrets-scanner')

/* ── Secret Pattern Definitions ─────────────────────────────────── */

export interface SecretPattern {
  name: string
  pattern: RegExp
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'api_key_generic',
    pattern: /(?:api[_-]?key|apikey)[=:]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'high',
    description: 'Generic API key pattern',
  },
  {
    name: 'password',
    pattern: /(?:password|passwd|pwd)[=:]\s*['"]?([^\s'"]{8,})['"]?/gi,
    severity: 'critical',
    description: 'Password in plaintext',
  },
  {
    name: 'secret_token',
    pattern: /(?:secret|token)[=:]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'high',
    description: 'Secret or token value',
  },
  {
    name: 'aws_access_key',
    pattern: /(?:aws_access_key_id)[=:]\s*['"]?(AKIA[A-Z0-9]{16})['"]?/gi,
    severity: 'critical',
    description: 'AWS Access Key ID',
  },
  {
    name: 'aws_secret_key',
    pattern: /(?:aws_secret_access_key)[=:]\s*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi,
    severity: 'critical',
    description: 'AWS Secret Access Key',
  },
  {
    name: 'private_key',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    severity: 'critical',
    description: 'Private key block',
  },
  {
    name: 'github_token',
    pattern: /(?:gh[pous]_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})/gi,
    severity: 'critical',
    description: 'GitHub Personal Access Token',
  },
  {
    name: 'openai_key',
    pattern: /sk-[a-zA-Z0-9]{48,}/gi,
    severity: 'critical',
    description: 'OpenAI API Key',
  },
  {
    name: 'anthropic_key',
    pattern: /sk-ant-[a-zA-Z0-9-]{90,}/gi,
    severity: 'critical',
    description: 'Anthropic API Key',
  },
  {
    name: 'google_api_key',
    pattern: /AIza[a-zA-Z0-9_-]{35}/gi,
    severity: 'high',
    description: 'Google API Key',
  },
  {
    name: 'stripe_key',
    pattern: /(?:sk_live_|rk_live_)[a-zA-Z0-9]{24,}/gi,
    severity: 'critical',
    description: 'Stripe Live API Key',
  },
  {
    name: 'slack_token',
    pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/gi,
    severity: 'high',
    description: 'Slack Token',
  },
  {
    name: 'jwt_token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
    severity: 'medium',
    description: 'JWT Token',
  },
  {
    name: 'database_url',
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s]+/gi,
    severity: 'critical',
    description: 'Database connection string with credentials',
  },
  {
    name: 'bearer_token',
    pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
    severity: 'high',
    description: 'Bearer authentication token',
  },
  {
    name: 'basic_auth',
    pattern: /Basic\s+[a-zA-Z0-9+/=]{20,}/gi,
    severity: 'high',
    description: 'Basic authentication header',
  },
  {
    name: 'ssh_key',
    pattern: /-----BEGIN\s+(?:OPENSSH\s+)?PRIVATE\s+KEY-----/gi,
    severity: 'critical',
    description: 'SSH Private Key',
  },
  {
    name: 'npm_token',
    pattern: /npm_[a-zA-Z0-9]{36}/gi,
    severity: 'high',
    description: 'NPM Access Token',
  },
  {
    name: 'azure_key',
    pattern: /(?:AccountKey|SharedAccessKey)[=:]\s*['"]?([a-zA-Z0-9+/=]{44,})['"]?/gi,
    severity: 'critical',
    description: 'Azure Storage/Service Bus Key',
  },
  {
    name: 'sendgrid_key',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/gi,
    severity: 'high',
    description: 'SendGrid API Key',
  },
]

/* ── Environment Variable Patterns ──────────────────────────────── */

const ENV_VAR_PATTERNS = [
  /\$\{?([A-Z_][A-Z0-9_]*(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_CREDENTIAL)[A-Z0-9_]*)\}?/gi,
  /process\.env\.([A-Z_][A-Z0-9_]*(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_CREDENTIAL)[A-Z0-9_]*)/gi,
  /os\.environ(?:\.get)?\(['"]([A-Z_][A-Z0-9_]*(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_CREDENTIAL)[A-Z0-9_]*)['"]\)/gi,
]

/* ── Types ──────────────────────────────────────────────────────── */

export interface SecretMatch {
  patternName: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  match: string
  startIndex: number
  endIndex: number
  line?: number
  column?: number
}

export interface EnvVarMatch {
  name: string
  startIndex: number
  endIndex: number
  line?: number
}

export interface ValidationResult {
  isValid: boolean
  secretsFound: SecretMatch[]
  envVarsFound: EnvVarMatch[]
  maskedContent?: string
  summary: {
    totalSecrets: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
  }
}

export interface ScanOptions {
  includeEnvVars?: boolean
  maskSecrets?: boolean
  maxMatches?: number
  excludePatterns?: string[]
}

/* ── Helper Functions ───────────────────────────────────────────── */

function getLineAndColumn(content: string, index: number): { line: number; column: number } {
  const lines = content.substring(0, index).split('\n')
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  }
}

function truncateMatch(match: string, maxLength = 20): string {
  if (match.length <= maxLength) return match
  const visibleChars = Math.floor(maxLength / 2) - 2
  return `${match.substring(0, visibleChars)}...${match.substring(match.length - visibleChars)}`
}

/* ── Core Functions ─────────────────────────────────────────────── */

/**
 * Scan content for secrets using predefined patterns
 */
export function scanForSecrets(
  content: string,
  options: ScanOptions = {}
): SecretMatch[] {
  const {
    maxMatches = 100,
    excludePatterns = [],
  } = options

  const matches: SecretMatch[] = []
  const excludeSet = new Set(excludePatterns)

  for (const secretPattern of SECRET_PATTERNS) {
    if (excludeSet.has(secretPattern.name)) continue

    const regex = new RegExp(secretPattern.pattern.source, secretPattern.pattern.flags)
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      if (matches.length >= maxMatches) {
        logger.warn(`Max matches (${maxMatches}) reached, stopping scan`)
        break
      }

      const { line, column } = getLineAndColumn(content, match.index)
      
      matches.push({
        patternName: secretPattern.name,
        severity: secretPattern.severity,
        description: secretPattern.description,
        match: truncateMatch(match[0]),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        line,
        column,
      })
    }

    if (matches.length >= maxMatches) break
  }

  return matches
}

/**
 * Scan for environment variable references that might contain secrets
 */
export function scanForEnvVars(content: string): EnvVarMatch[] {
  const matches: EnvVarMatch[] = []
  const seenVars = new Set<string>()

  for (const pattern of ENV_VAR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const varName = match[1]
      if (seenVars.has(varName)) continue
      seenVars.add(varName)

      const { line } = getLineAndColumn(content, match.index)
      
      matches.push({
        name: varName,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        line,
      })
    }
  }

  return matches
}

/**
 * Mask secrets in content by replacing them with asterisks
 */
export function maskSecrets(content: string, options: ScanOptions = {}): string {
  let masked = content
  const secrets = scanForSecrets(content, options)

  const sortedSecrets = [...secrets].sort((a, b) => b.startIndex - a.startIndex)

  for (const secret of sortedSecrets) {
    const originalText = content.substring(secret.startIndex, secret.endIndex)
    const maskLength = Math.min(originalText.length, 40)
    const maskedText = '*'.repeat(maskLength)
    
    masked = masked.substring(0, secret.startIndex) + maskedText + masked.substring(secret.endIndex)
  }

  return masked
}

/**
 * Validate content for secrets and return comprehensive result
 */
export function validateNoSecrets(
  content: string,
  options: ScanOptions = {}
): ValidationResult {
  const secretsFound = scanForSecrets(content, options)
  const envVarsFound = options.includeEnvVars ? scanForEnvVars(content) : []

  const summary = {
    totalSecrets: secretsFound.length,
    criticalCount: secretsFound.filter(s => s.severity === 'critical').length,
    highCount: secretsFound.filter(s => s.severity === 'high').length,
    mediumCount: secretsFound.filter(s => s.severity === 'medium').length,
    lowCount: secretsFound.filter(s => s.severity === 'low').length,
  }

  const result: ValidationResult = {
    isValid: secretsFound.length === 0,
    secretsFound,
    envVarsFound,
    summary,
  }

  if (options.maskSecrets && secretsFound.length > 0) {
    result.maskedContent = maskSecrets(content, options)
  }

  if (secretsFound.length > 0) {
    logger.warn(`Found ${secretsFound.length} potential secrets in content`, {
      critical: summary.criticalCount,
      high: summary.highCount,
      medium: summary.mediumCount,
      low: summary.lowCount,
    })
  }

  return result
}

/**
 * Scan agent output and mask any detected secrets
 * Returns the masked output and validation result
 */
export function scanAndMaskAgentOutput(
  agentId: string,
  output: string
): { maskedOutput: string; validation: ValidationResult } {
  const validation = validateNoSecrets(output, {
    maskSecrets: true,
    includeEnvVars: true,
  })

  if (!validation.isValid) {
    logger.warn(`Agent ${agentId} output contains ${validation.summary.totalSecrets} potential secrets`, {
      critical: validation.summary.criticalCount,
      high: validation.summary.highCount,
    })
  }

  return {
    maskedOutput: validation.maskedContent ?? output,
    validation,
  }
}

/**
 * Check if a string looks like it might be a secret value
 * (useful for checking individual values before logging)
 */
export function looksLikeSecret(value: string): boolean {
  if (!value || value.length < 8) return false

  const quickPatterns = [
    /^sk-[a-zA-Z0-9]{20,}$/,
    /^AKIA[A-Z0-9]{16}$/,
    /^gh[pous]_[a-zA-Z0-9]{36,}$/,
    /^eyJ[a-zA-Z0-9_-]*\./,
    /^-----BEGIN/,
    /^xox[baprs]-/,
  ]

  return quickPatterns.some(p => p.test(value))
}

/**
 * Redact a value if it looks like a secret
 */
export function redactIfSecret(value: string): string {
  if (looksLikeSecret(value)) {
    const visibleChars = Math.min(4, Math.floor(value.length / 4))
    return `${value.substring(0, visibleChars)}${'*'.repeat(8)}...`
  }
  return value
}

/**
 * Get all registered secret patterns (for documentation/UI)
 */
export function getSecretPatterns(): Array<{
  name: string
  severity: string
  description: string
}> {
  return SECRET_PATTERNS.map(p => ({
    name: p.name,
    severity: p.severity,
    description: p.description,
  }))
}
