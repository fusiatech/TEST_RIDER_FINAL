import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}))

describe('Security Scan Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Hardcoded Secrets Detection', () => {
    const SECRET_PATTERNS = [
      { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
      { name: 'AWS Secret Key', pattern: /[A-Za-z0-9/+=]{40}(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/ },
      { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
      { name: 'Generic API Key', pattern: /api[_-]?key['":\s]*[=:]\s*['"][A-Za-z0-9]{20,}['"]/ },
      { name: 'Generic Secret', pattern: /secret['":\s]*[=:]\s*['"][A-Za-z0-9]{20,}['"]/ },
      { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
      { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/ },
      { name: 'Basic Auth', pattern: /basic\s+[A-Za-z0-9+/=]{20,}/ },
      { name: 'Bearer Token', pattern: /bearer\s+[A-Za-z0-9._-]{20,}/i },
      { name: 'Password in URL', pattern: /:\/\/[^:]+:[^@]+@/ },
      { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,}-[A-Za-z0-9]+/ },
      { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
      { name: 'Stripe Key', pattern: /sk_live_[0-9a-zA-Z]{24,}/ },
      { name: 'OpenAI Key', pattern: /sk-[A-Za-z0-9]{48}/ },
    ]

    it('detects AWS access keys', () => {
      const content = 'const key = "AKIAIOSFODNN7EXAMPLE"'
      const match = SECRET_PATTERNS.find(p => p.name === 'AWS Access Key')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects GitHub tokens', () => {
      const content = 'token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'
      const match = SECRET_PATTERNS.find(p => p.name === 'GitHub Token')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects private keys', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...'
      const match = SECRET_PATTERNS.find(p => p.name === 'Private Key')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects JWT tokens', () => {
      const content = 'const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"'
      const match = SECRET_PATTERNS.find(p => p.name === 'JWT Token')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects passwords in URLs', () => {
      const content = 'const url = "https://user:password123@example.com"'
      const match = SECRET_PATTERNS.find(p => p.name === 'Password in URL')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects OpenAI keys', () => {
      const content = 'const key = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'
      const match = SECRET_PATTERNS.find(p => p.name === 'OpenAI Key')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('does not flag environment variable references', () => {
      const content = 'const key = process.env.API_KEY'
      const hasSecret = SECRET_PATTERNS.some(p => p.pattern.test(content))
      expect(hasSecret).toBe(false)
    })

    it('does not flag placeholder values', () => {
      const content = 'const key = "your-api-key-here"'
      const hasSecret = SECRET_PATTERNS.some(p => p.pattern.test(content))
      expect(hasSecret).toBe(false)
    })
  })

  describe('Vulnerable Code Patterns', () => {
    const VULNERABLE_PATTERNS = [
      { name: 'SQL Injection', pattern: /`SELECT.*\$\{.*\}`|`INSERT.*\$\{.*\}`|`UPDATE.*\$\{.*\}`|`DELETE.*\$\{.*\}`/i },
      { name: 'Command Injection', pattern: /exec\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`\s*\)|spawn\s*\([^)]*\$\{[^}]+\}[^)]*\)/ },
      { name: 'Path Traversal', pattern: /\.\.\// },
      { name: 'Eval Usage', pattern: /\beval\s*\(/ },
      { name: 'innerHTML Assignment', pattern: /\.innerHTML\s*=\s*[^'"][^;]+/ },
      { name: 'document.write', pattern: /document\.write\s*\(/ },
      { name: 'Unsafe Regex', pattern: /new RegExp\s*\([^)]*\+[^)]*\)/ },
      { name: 'Hardcoded Credentials', pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/ },
      { name: 'Insecure Random', pattern: /(?:token|key|secret|password).*Math\.random\s*\(\s*\)|Math\.random\s*\(\s*\).*(?:token|key|secret|password)/i },
      { name: 'Disabled Security', pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/ },
    ]

    it('detects SQL injection vulnerabilities', () => {
      const content = 'const query = `SELECT * FROM users WHERE id = ${userId}`'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'SQL Injection')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects command injection', () => {
      const content = 'exec(`ls ${userInput}`)'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'Command Injection')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects path traversal attempts', () => {
      const content = 'const path = "../../../etc/passwd"'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'Path Traversal')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects eval usage', () => {
      const content = 'eval(userCode)'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'Eval Usage')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects unsafe innerHTML', () => {
      const content = 'element.innerHTML = userContent'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'innerHTML Assignment')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects document.write', () => {
      const content = 'document.write(data)'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'document.write')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects insecure random for security purposes', () => {
      const content = 'const token = Math.random().toString(36)'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'Insecure Random')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('detects disabled TLS verification', () => {
      const content = 'const options = { rejectUnauthorized: false }'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'Disabled Security')?.pattern.test(content)
      expect(match).toBe(true)
    })

    it('allows safe parameterized queries', () => {
      const content = 'db.query("SELECT * FROM users WHERE id = ?", [userId])'
      const match = VULNERABLE_PATTERNS.find(p => p.name === 'SQL Injection')?.pattern.test(content)
      expect(match).toBe(false)
    })
  })

  describe('Input Sanitization', () => {
    function sanitizeInput(input: string): string {
      return input
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim()
    }

    it('removes HTML tags', () => {
      const input = '<script>alert("xss")</script>'
      const sanitized = sanitizeInput(input)
      expect(sanitized).not.toContain('<')
      expect(sanitized).not.toContain('>')
    })

    it('removes javascript: protocol', () => {
      const input = 'javascript:alert(1)'
      const sanitized = sanitizeInput(input)
      expect(sanitized.toLowerCase()).not.toContain('javascript:')
    })

    it('removes event handlers', () => {
      const input = 'onclick=alert(1)'
      const sanitized = sanitizeInput(input)
      expect(sanitized.toLowerCase()).not.toMatch(/on\w+=/i)
    })

    it('trims whitespace', () => {
      const input = '  valid input  '
      const sanitized = sanitizeInput(input)
      expect(sanitized).toBe('valid input')
    })

    it('preserves valid input', () => {
      const input = 'Hello, World!'
      const sanitized = sanitizeInput(input)
      expect(sanitized).toBe('Hello, World!')
    })
  })

  describe('Sensitive File Detection', () => {
    const SENSITIVE_FILES = [
      '.env',
      '.env.local',
      '.env.production',
      'credentials.json',
      'secrets.json',
      'private.key',
      'id_rsa',
      'id_ed25519',
      '.htpasswd',
      'wp-config.php',
      'config.php',
      'database.yml',
      'secrets.yml',
    ]

    it('identifies .env files as sensitive', () => {
      expect(SENSITIVE_FILES.includes('.env')).toBe(true)
      expect(SENSITIVE_FILES.includes('.env.local')).toBe(true)
      expect(SENSITIVE_FILES.includes('.env.production')).toBe(true)
    })

    it('identifies credential files as sensitive', () => {
      expect(SENSITIVE_FILES.includes('credentials.json')).toBe(true)
      expect(SENSITIVE_FILES.includes('secrets.json')).toBe(true)
    })

    it('identifies private keys as sensitive', () => {
      expect(SENSITIVE_FILES.includes('private.key')).toBe(true)
      expect(SENSITIVE_FILES.includes('id_rsa')).toBe(true)
      expect(SENSITIVE_FILES.includes('id_ed25519')).toBe(true)
    })

    it('does not flag regular config files', () => {
      expect(SENSITIVE_FILES.includes('package.json')).toBe(false)
      expect(SENSITIVE_FILES.includes('tsconfig.json')).toBe(false)
    })
  })

  describe('Dependency Vulnerability Patterns', () => {
    const KNOWN_VULNERABLE_PACKAGES = [
      { name: 'lodash', vulnerableVersions: ['<4.17.21'] },
      { name: 'axios', vulnerableVersions: ['<0.21.1'] },
      { name: 'minimist', vulnerableVersions: ['<1.2.6'] },
      { name: 'node-fetch', vulnerableVersions: ['<2.6.7', '>=3.0.0 <3.1.1'] },
      { name: 'express', vulnerableVersions: ['<4.17.3'] },
    ]

    function isVulnerableVersion(pkg: string, version: string): boolean {
      const entry = KNOWN_VULNERABLE_PACKAGES.find(p => p.name === pkg)
      if (!entry) return false
      
      const majorVersion = parseInt(version.split('.')[0], 10)
      const minorVersion = parseInt(version.split('.')[1], 10)
      const patchVersion = parseInt(version.split('.')[2], 10)
      
      for (const range of entry.vulnerableVersions) {
        if (range.startsWith('<')) {
          const targetVersion = range.slice(1).split('.').map(Number)
          if (majorVersion < targetVersion[0]) return true
          if (majorVersion === targetVersion[0] && minorVersion < targetVersion[1]) return true
          if (majorVersion === targetVersion[0] && minorVersion === targetVersion[1] && patchVersion < targetVersion[2]) return true
        }
      }
      return false
    }

    it('detects vulnerable lodash versions', () => {
      expect(isVulnerableVersion('lodash', '4.17.20')).toBe(true)
      expect(isVulnerableVersion('lodash', '4.17.21')).toBe(false)
    })

    it('detects vulnerable axios versions', () => {
      expect(isVulnerableVersion('axios', '0.21.0')).toBe(true)
      expect(isVulnerableVersion('axios', '0.21.1')).toBe(false)
    })

    it('returns false for unknown packages', () => {
      expect(isVulnerableVersion('unknown-package', '1.0.0')).toBe(false)
    })
  })

  describe('Security Headers Check', () => {
    const REQUIRED_HEADERS = [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Strict-Transport-Security',
      'Referrer-Policy',
    ]

    function checkSecurityHeaders(headers: Record<string, string>): string[] {
      const missing: string[] = []
      for (const header of REQUIRED_HEADERS) {
        if (!headers[header.toLowerCase()]) {
          missing.push(header)
        }
      }
      return missing
    }

    it('identifies missing security headers', () => {
      const headers = {
        'content-type': 'text/html',
      }
      const missing = checkSecurityHeaders(headers)
      expect(missing).toContain('Content-Security-Policy')
      expect(missing).toContain('X-Frame-Options')
    })

    it('passes when all headers present', () => {
      const headers = {
        'content-security-policy': "default-src 'self'",
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'x-xss-protection': '1; mode=block',
        'strict-transport-security': 'max-age=31536000',
        'referrer-policy': 'strict-origin-when-cross-origin',
      }
      const missing = checkSecurityHeaders(headers)
      expect(missing).toHaveLength(0)
    })
  })

  describe('CORS Configuration Check', () => {
    function validateCorsConfig(config: {
      origin: string | string[] | boolean
      credentials?: boolean
      methods?: string[]
    }): string[] {
      const issues: string[] = []

      if (config.origin === '*' && config.credentials) {
        issues.push('Cannot use wildcard origin with credentials')
      }

      if (config.origin === '*') {
        issues.push('Wildcard origin allows any domain')
      }

      if (config.origin === true) {
        issues.push('Reflecting origin without validation is insecure')
      }

      return issues
    }

    it('flags wildcard origin with credentials', () => {
      const issues = validateCorsConfig({
        origin: '*',
        credentials: true,
      })
      expect(issues).toContain('Cannot use wildcard origin with credentials')
    })

    it('warns about wildcard origin', () => {
      const issues = validateCorsConfig({
        origin: '*',
      })
      expect(issues).toContain('Wildcard origin allows any domain')
    })

    it('warns about origin reflection', () => {
      const issues = validateCorsConfig({
        origin: true,
      })
      expect(issues).toContain('Reflecting origin without validation is insecure')
    })

    it('passes for specific origins', () => {
      const issues = validateCorsConfig({
        origin: ['https://example.com', 'https://app.example.com'],
        credentials: true,
      })
      expect(issues).toHaveLength(0)
    })
  })

  describe('Authentication Security', () => {
    function validatePasswordPolicy(password: string): string[] {
      const issues: string[] = []

      if (password.length < 8) {
        issues.push('Password must be at least 8 characters')
      }
      if (!/[A-Z]/.test(password)) {
        issues.push('Password must contain uppercase letter')
      }
      if (!/[a-z]/.test(password)) {
        issues.push('Password must contain lowercase letter')
      }
      if (!/[0-9]/.test(password)) {
        issues.push('Password must contain number')
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        issues.push('Password must contain special character')
      }

      return issues
    }

    it('rejects short passwords', () => {
      const issues = validatePasswordPolicy('Short1!')
      expect(issues).toContain('Password must be at least 8 characters')
    })

    it('requires uppercase letters', () => {
      const issues = validatePasswordPolicy('lowercase1!')
      expect(issues).toContain('Password must contain uppercase letter')
    })

    it('requires lowercase letters', () => {
      const issues = validatePasswordPolicy('UPPERCASE1!')
      expect(issues).toContain('Password must contain lowercase letter')
    })

    it('requires numbers', () => {
      const issues = validatePasswordPolicy('NoNumbers!')
      expect(issues).toContain('Password must contain number')
    })

    it('requires special characters', () => {
      const issues = validatePasswordPolicy('NoSpecial1')
      expect(issues).toContain('Password must contain special character')
    })

    it('passes strong passwords', () => {
      const issues = validatePasswordPolicy('StrongP@ss1')
      expect(issues).toHaveLength(0)
    })
  })
})
