import { exec } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

/** Result of a single security / quality check. */
export interface SecurityCheck {
  name: string
  passed: boolean
  output: string
}

export interface SecretFinding {
  filePath: string
  line: number
  detector: 'regex' | 'entropy'
  rule: string
  confidence: 'low' | 'medium' | 'high'
  excerpt: string
}

export interface SecretScanResult {
  findings: SecretFinding[]
  ignoredPaths: string[]
  highConfidenceCount: number
}

/** Aggregate result of all security checks. */
export interface SecurityResult {
  passed: boolean
  checks: SecurityCheck[]
  secretScan?: SecretScanResult
}

/** T16.1: Config to enable/disable checks. Default: all enabled. */
export interface TestingConfig {
  typescript?: boolean
  eslint?: boolean
  npmAudit?: boolean
  customCommand?: string
}

const DEFAULT_TESTING_CONFIG: TestingConfig = {
  typescript: true,
  eslint: true,
  npmAudit: true,
}

const SECRET_IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
])

const SECRET_IGNORE_FILE_PATTERNS: RegExp[] = [
  /(?:^|\/)package-lock\.json$/,
  /(?:^|\/)pnpm-lock\.yaml$/,
  /(?:^|\/)yarn\.lock$/,
  /(?:^|\/)\.env(?:\..+)?$/,
  /(?:^|\/)\.gitignore$/,
  /(?:^|\/)README\.md$/i,
]

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf', '.zip', '.gz', '.tgz', '.mp4', '.mov', '.mp3', '.woff', '.woff2', '.ttf', '.eot'
])

const SECRET_RULES: Array<{
  name: string
  regex: RegExp
  confidence: 'medium' | 'high'
}> = [
  { name: 'OpenAI key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g, confidence: 'high' },
  { name: 'GitHub token', regex: /\bghp_[A-Za-z0-9]{24,}\b/g, confidence: 'high' },
  { name: 'AWS access key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, confidence: 'high' },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, confidence: 'high' },
  {
    name: 'Generic credential assignment',
    regex: /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_\-\/+=]{12,}["']?/gi,
    confidence: 'medium',
  },
]

/**
 * Execute a shell command inside `workdir`, returning its combined output.
 * Resolves even when the command exits non-zero so callers can inspect output.
 */
async function safeExec(
  command: string,
  workdir: string
): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workdir,
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024
    })
    return { code: 0, output: (stdout + '\n' + stderr).trim() }
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      'stdout' in err &&
      'stderr' in err
    ) {
      const execErr = err as { code: number; stdout: string; stderr: string }
      return {
        code: typeof execErr.code === 'number' ? execErr.code : 1,
        output: (
          String(execErr.stdout ?? '') +
          '\n' +
          String(execErr.stderr ?? '')
        ).trim()
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { code: 1, output: message }
  }
}

function shouldIgnoreSecretScanPath(relativePath: string): boolean {
  if (!relativePath) return true
  const normalized = relativePath.replace(/\\/g, '/')
  return SECRET_IGNORE_FILE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function calculateShannonEntropy(value: string): number {
  if (value.length === 0) return 0
  const frequencies = new Map<string, number>()
  for (const char of value) {
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1)
  }

  let entropy = 0
  for (const [, count] of frequencies) {
    const probability = count / value.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function collectCandidateFiles(workdir: string): { files: string[]; ignoredPaths: string[] } {
  const files: string[] = []
  const ignoredPaths: string[] = []

  function walk(relativePath: string): void {
    const absolute = join(workdir, relativePath)
    const entries = readdirSync(absolute, { withFileTypes: true })

    for (const entry of entries) {
      const childRelative = relativePath ? join(relativePath, entry.name) : entry.name

      if (entry.isDirectory()) {
        if (SECRET_IGNORE_DIRS.has(entry.name)) {
          ignoredPaths.push(childRelative.replace(/\\/g, '/'))
          continue
        }
        walk(childRelative)
        continue
      }

      const normalized = childRelative.replace(/\\/g, '/')
      if (shouldIgnoreSecretScanPath(normalized)) {
        ignoredPaths.push(normalized)
        continue
      }

      const extension = extname(entry.name).toLowerCase()
      if (BINARY_EXTENSIONS.has(extension)) {
        ignoredPaths.push(normalized)
        continue
      }

      try {
        const stats = statSync(join(workdir, childRelative))
        if (stats.size > 1024 * 1024) {
          ignoredPaths.push(normalized)
          continue
        }
      } catch {
        ignoredPaths.push(normalized)
        continue
      }

      files.push(normalized)
    }
  }

  walk('')
  return { files, ignoredPaths }
}

function scanForSecrets(workdir: string): SecretScanResult {
  const { files, ignoredPaths } = collectCandidateFiles(workdir)
  const findings: SecretFinding[] = []

  for (const relativePath of files) {
    const absolutePath = join(workdir, relativePath)
    let content: string

    try {
      content = readFileSync(absolutePath, 'utf8')
    } catch {
      continue
    }

    for (const rule of SECRET_RULES) {
      const matches = content.matchAll(rule.regex)
      for (const match of matches) {
        const token = match[0]
        const index = match.index ?? 0
        const line = getLineNumber(content, index)
        findings.push({
          filePath: relativePath,
          line,
          detector: 'regex',
          rule: rule.name,
          confidence: rule.confidence,
          excerpt: token.slice(0, 80),
        })
      }
    }

    const entropyCandidates = content.matchAll(/\b[A-Za-z0-9+/=_-]{24,}\b/g)
    for (const match of entropyCandidates) {
      const token = match[0]
      const index = match.index ?? 0
      if (/^[a-f0-9]{24,}$/i.test(token)) continue
      const entropy = calculateShannonEntropy(token)
      if (entropy < 4.1) continue

      const confidence: 'medium' | 'high' = token.length >= 32 && entropy >= 4.5
        ? 'high'
        : 'medium'

      findings.push({
        filePath: relativePath,
        line: getLineNumber(content, index),
        detector: 'entropy',
        rule: `High entropy token (${entropy.toFixed(2)})`,
        confidence,
        excerpt: token.slice(0, 80),
      })
    }
  }

  const deduped = new Map<string, SecretFinding>()
  for (const finding of findings) {
    const key = `${finding.filePath}:${finding.line}:${finding.detector}:${finding.excerpt}`
    if (!deduped.has(key)) {
      deduped.set(key, finding)
    }
  }

  const dedupedFindings = Array.from(deduped.values())
  const highConfidenceCount = dedupedFindings.filter((f) => f.confidence === 'high').length

  return {
    findings: dedupedFindings,
    ignoredPaths,
    highConfidenceCount,
  }
}

/**
 * Run a suite of security and quality checks inside the given working directory.
 */
export async function runSecurityChecks(
  workdir: string,
  testingConfig?: TestingConfig | null
): Promise<SecurityResult> {
  const config = { ...DEFAULT_TESTING_CONFIG, ...testingConfig }
  const checks: SecurityCheck[] = []

  // TypeScript type-checking
  if (config.typescript !== false && existsSync(join(workdir, 'tsconfig.json'))) {
    const result = await safeExec('npx tsc --noEmit', workdir)
    checks.push({
      name: 'TypeScript (tsc --noEmit)',
      passed: result.code === 0,
      output: result.output
    })
  } else if (config.typescript !== false) {
    checks.push({
      name: 'TypeScript (tsc --noEmit)',
      passed: true,
      output: 'Skipped — no tsconfig.json found.'
    })
  }

  // ESLint
  const hasEslintConfig =
    existsSync(join(workdir, '.eslintrc')) ||
    existsSync(join(workdir, '.eslintrc.js')) ||
    existsSync(join(workdir, '.eslintrc.cjs')) ||
    existsSync(join(workdir, '.eslintrc.json')) ||
    existsSync(join(workdir, '.eslintrc.yml')) ||
    existsSync(join(workdir, '.eslintrc.yaml')) ||
    existsSync(join(workdir, 'eslint.config.js')) ||
    existsSync(join(workdir, 'eslint.config.mjs')) ||
    existsSync(join(workdir, 'eslint.config.cjs')) ||
    existsSync(join(workdir, 'eslint.config.ts'))

  if (config.eslint !== false && hasEslintConfig) {
    const result = await safeExec('npx eslint . --max-warnings 0', workdir)
    checks.push({
      name: 'ESLint (--max-warnings 0)',
      passed: result.code === 0,
      output: result.output
    })
  } else if (config.eslint !== false) {
    checks.push({
      name: 'ESLint (--max-warnings 0)',
      passed: true,
      output: 'Skipped — no ESLint config found.'
    })
  }

  // npm audit
  if (config.npmAudit !== false && existsSync(join(workdir, 'package.json'))) {
    const result = await safeExec('npm audit --json', workdir)

    let hasCritical = false
    try {
      const audit = JSON.parse(result.output) as {
        metadata?: { vulnerabilities?: { critical?: number; high?: number } }
      }
      const vulns = audit?.metadata?.vulnerabilities
      if (vulns && ((vulns.critical ?? 0) > 0 || (vulns.high ?? 0) > 0)) {
        hasCritical = true
      }
    } catch {
      // If JSON parsing fails we'll just report the raw output
    }

    checks.push({
      name: 'npm audit',
      passed: !hasCritical,
      output: hasCritical
        ? 'Critical or high severity vulnerabilities found.'
        : result.output.slice(0, 500)
    })
  } else if (config.npmAudit !== false) {
    checks.push({
      name: 'npm audit',
      passed: true,
      output: 'Skipped — no package.json found.'
    })
  }

  const secretScan = scanForSecrets(workdir)
  checks.push({
    name: 'Secrets scan (regex + entropy)',
    passed: secretScan.highConfidenceCount === 0,
    output: secretScan.highConfidenceCount > 0
      ? `Detected ${secretScan.highConfidenceCount} high-confidence secret(s).`
      : secretScan.findings.length > 0
        ? `Detected ${secretScan.findings.length} medium-confidence candidate(s); high-confidence findings: 0.`
        : 'No secret patterns detected.',
  })

  const allPassed = checks.every((c) => c.passed)
  return { passed: allPassed, checks, secretScan }
}
