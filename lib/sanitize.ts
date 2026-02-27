/**
 * Comprehensive Input Sanitization Library
 * Provides functions for sanitizing various types of user input
 * to prevent XSS, SQL injection, path traversal, and command injection attacks.
 */

/* ── HTML Sanitization ──────────────────────────────────────────── */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

const ALLOWED_HTML_TAGS = new Set([
  'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'code', 'pre',
  'ul', 'ol', 'li', 'a', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
])

const ALLOWED_ATTRIBUTES = new Set([
  'href', 'title', 'class', 'id', 'target', 'rel',
])

const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
]

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHTML(input: string): string {
  if (!input) return ''
  return input.replace(/[&<>"'`=/]/g, char => HTML_ENTITIES[char] || char)
}

/**
 * Sanitize HTML by removing dangerous tags and attributes
 * Allows a safe subset of HTML for rich text display
 */
export function sanitizeHTML(input: string): string {
  if (!input) return ''

  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')

  sanitized = sanitized.replace(/<(\/?)([\w-]+)([^>]*)>/gi, (match, slash, tag, attrs) => {
    const tagLower = tag.toLowerCase()
    
    if (!ALLOWED_HTML_TAGS.has(tagLower)) {
      return ''
    }

    if (slash === '/') {
      return `</${tagLower}>`
    }

    const sanitizedAttrs = sanitizeAttributes(attrs, tagLower)
    return sanitizedAttrs ? `<${tagLower}${sanitizedAttrs}>` : `<${tagLower}>`
  })

  return sanitized
}

function sanitizeAttributes(attrs: string, tag: string): string {
  if (!attrs.trim()) return ''

  const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  const sanitizedParts: string[] = []
  let match: RegExpExecArray | null

  while ((match = attrRegex.exec(attrs)) !== null) {
    const attrName = match[1].toLowerCase()
    const attrValue = match[2] ?? match[3] ?? match[4] ?? ''

    if (!ALLOWED_ATTRIBUTES.has(attrName)) continue

    if (attrName === 'href') {
      const lowerValue = attrValue.toLowerCase().trim()
      if (DANGEROUS_PROTOCOLS.some(p => lowerValue.startsWith(p))) {
        continue
      }
    }

    sanitizedParts.push(`${attrName}="${escapeHTML(attrValue)}"`)
  }

  if (tag === 'a' && sanitizedParts.some(p => p.startsWith('href='))) {
    if (!sanitizedParts.some(p => p.startsWith('rel='))) {
      sanitizedParts.push('rel="noopener noreferrer"')
    }
    if (!sanitizedParts.some(p => p.startsWith('target='))) {
      sanitizedParts.push('target="_blank"')
    }
  }

  return sanitizedParts.length > 0 ? ' ' + sanitizedParts.join(' ') : ''
}

/**
 * Strip all HTML tags from input
 */
export function stripHTML(input: string): string {
  if (!input) return ''
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
}

/* ── SQL Sanitization ───────────────────────────────────────────── */

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|UNION|DECLARE|CAST)\b)/gi,
  /(--)|(\/\*)|(\*\/)/g,
  /(\bOR\b|\bAND\b)\s*(\d+\s*=\s*\d+|'[^']*'\s*=\s*'[^']*')/gi,
  /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP)/gi,
  /\bWAITFOR\s+DELAY\b/gi,
  /\bBENCHMARK\s*\(/gi,
  /\bSLEEP\s*\(/gi,
]

/**
 * Escape special characters for SQL queries
 * Note: Always prefer parameterized queries over string escaping
 */
export function escapeSQL(input: string): string {
  if (!input) return ''
  return input
    .replace(/'/g, "''")
    .replace(/\\/g, '\\\\')
    .replace(/\x00/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z')
}

/**
 * Sanitize SQL input by removing dangerous patterns
 * Warning: This is a defense-in-depth measure. Always use parameterized queries.
 */
export function sanitizeSQL(input: string): string {
  if (!input) return ''
  
  let sanitized = input

  for (const pattern of SQL_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '')
  }

  sanitized = escapeSQL(sanitized)

  return sanitized
}

/**
 * Check if input contains potential SQL injection patterns
 */
export function containsSQLInjection(input: string): boolean {
  if (!input) return false
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input))
}

/* ── Path Sanitization ──────────────────────────────────────────── */

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\+/g,
  /\.\.$/,
  /%2e%2e%2f/gi,
  /%2e%2e\//gi,
  /\.%2e\//gi,
  /%2e\.\//gi,
  /%252e%252e%252f/gi,
  /\.\./g,
]

const DANGEROUS_PATH_CHARS = /[<>:"|?*\x00-\x1f]/g

/**
 * Sanitize file path to prevent path traversal attacks
 */
export function sanitizePath(input: string): string {
  if (!input) return ''

  let sanitized = input

  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, '')
  }

  sanitized = sanitized.replace(DANGEROUS_PATH_CHARS, '')

  sanitized = sanitized.replace(/^[/\\]+/, '')

  sanitized = sanitized.replace(/[/\\]+/g, '/')

  const parts = sanitized.split('/')
  const safeParts = parts.filter(part => {
    if (!part || part === '.' || part === '..') return false
    if (part.startsWith('.') && part !== '.gitkeep') return false
    return true
  })

  return safeParts.join('/')
}

/**
 * Check if path is safe (no traversal attempts)
 */
export function isPathSafe(input: string): boolean {
  if (!input) return false
  return !PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(input))
}

/**
 * Normalize and validate a path against a base directory
 */
export function validatePathWithinBase(inputPath: string, basePath: string): boolean {
  if (!inputPath || !basePath) return false

  const normalizedInput = inputPath.replace(/\\/g, '/').toLowerCase()
  const normalizedBase = basePath.replace(/\\/g, '/').toLowerCase()

  if (PATH_TRAVERSAL_PATTERNS.some(p => p.test(inputPath))) {
    return false
  }

  const fullPath = normalizedBase.endsWith('/')
    ? normalizedBase + normalizedInput
    : normalizedBase + '/' + normalizedInput

  const resolvedParts: string[] = []
  for (const part of fullPath.split('/')) {
    if (part === '..') {
      resolvedParts.pop()
    } else if (part && part !== '.') {
      resolvedParts.push(part)
    }
  }
  const resolved = resolvedParts.join('/')

  return resolved.startsWith(normalizedBase.replace(/\/$/, ''))
}

/* ── Command Sanitization ───────────────────────────────────────── */

const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#*?~^\\]/g

const DANGEROUS_COMMANDS = [
  /\brm\s+-rf?\b/gi,
  /\bsudo\b/gi,
  /\bchmod\s+777\b/gi,
  /\bchown\b/gi,
  /\bmkfs\b/gi,
  /\bdd\s+if=/gi,
  /\bformat\b/gi,
  /\bdel\s+\/[fqs]/gi,
  /\bshutdown\b/gi,
  /\breboot\b/gi,
  /\bpoweroff\b/gi,
  /\bhalt\b/gi,
  /\binit\s+0\b/gi,
  /\bkill\s+-9\b/gi,
  /\bkillall\b/gi,
  /\bpkill\b/gi,
  /\bwget\s+.*\|\s*sh\b/gi,
  /\bcurl\s+.*\|\s*sh\b/gi,
  /\beval\b/gi,
  /\bexec\b/gi,
  /\bsource\b/gi,
  /\b\.\s+\//gi,
]

/**
 * Escape shell metacharacters
 */
export function escapeShell(input: string): string {
  if (!input) return ''
  return input.replace(SHELL_METACHARACTERS, '\\$&')
}

/**
 * Sanitize command input by removing dangerous patterns
 */
export function sanitizeCommand(input: string): string {
  if (!input) return ''

  let sanitized = input

  for (const pattern of DANGEROUS_COMMANDS) {
    sanitized = sanitized.replace(pattern, '')
  }

  sanitized = sanitized
    .replace(/\$\([^)]*\)/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\$\{[^}]*\}/g, '')

  sanitized = sanitized.replace(/[;&|]/g, '')

  return sanitized.trim()
}

/**
 * Check if command contains dangerous patterns
 */
export function containsDangerousCommand(input: string): boolean {
  if (!input) return false
  return DANGEROUS_COMMANDS.some(pattern => pattern.test(input))
}

/**
 * Validate command against an allowlist
 */
export function validateCommandAllowlist(
  command: string,
  allowedCommands: string[]
): boolean {
  if (!command || allowedCommands.length === 0) return false
  
  const baseCommand = command.trim().split(/\s+/)[0].toLowerCase()
  return allowedCommands.some(allowed => 
    baseCommand === allowed.toLowerCase() ||
    baseCommand.endsWith('/' + allowed.toLowerCase()) ||
    baseCommand.endsWith('\\' + allowed.toLowerCase())
  )
}

/* ── General Sanitization ───────────────────────────────────────── */

/**
 * Sanitize a string for safe logging (remove sensitive patterns)
 */
export function sanitizeForLogging(input: string): string {
  if (!input) return ''
  
  return input
    .replace(/password[=:]\s*['"]?[^\s'"]+['"]?/gi, 'password=***')
    .replace(/api[_-]?key[=:]\s*['"]?[^\s'"]+['"]?/gi, 'api_key=***')
    .replace(/secret[=:]\s*['"]?[^\s'"]+['"]?/gi, 'secret=***')
    .replace(/token[=:]\s*['"]?[^\s'"]+['"]?/gi, 'token=***')
    .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer ***')
    .replace(/Basic\s+[a-zA-Z0-9+/=]+/gi, 'Basic ***')
}

/**
 * Sanitize user input for display (general purpose)
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return ''
  
  return escapeHTML(input)
    .replace(/\x00/g, '')
    .trim()
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(input: string): string {
  if (!input) return ''
  
  return input
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 255)
}

/**
 * Sanitize JSON string input
 */
export function sanitizeJSON(input: string): string {
  if (!input) return ''
  
  try {
    const parsed = JSON.parse(input)
    return JSON.stringify(parsed)
  } catch {
    return escapeHTML(input)
  }
}

/* ── Validation Helpers ─────────────────────────────────────────── */

export interface SanitizationResult {
  original: string
  sanitized: string
  wasModified: boolean
  warnings: string[]
}

/**
 * Comprehensive sanitization with reporting
 */
export function sanitizeWithReport(
  input: string,
  type: 'html' | 'sql' | 'path' | 'command' | 'general'
): SanitizationResult {
  const warnings: string[] = []
  let sanitized: string

  switch (type) {
    case 'html':
      sanitized = sanitizeHTML(input)
      if (/<script/i.test(input)) warnings.push('Script tags removed')
      if (/on\w+\s*=/i.test(input)) warnings.push('Event handlers removed')
      break
    case 'sql':
      sanitized = sanitizeSQL(input)
      if (containsSQLInjection(input)) warnings.push('SQL injection patterns detected')
      break
    case 'path':
      sanitized = sanitizePath(input)
      if (!isPathSafe(input)) warnings.push('Path traversal patterns detected')
      break
    case 'command':
      sanitized = sanitizeCommand(input)
      if (containsDangerousCommand(input)) warnings.push('Dangerous command patterns detected')
      break
    default:
      sanitized = sanitizeUserInput(input)
  }

  return {
    original: input,
    sanitized,
    wasModified: input !== sanitized,
    warnings,
  }
}
