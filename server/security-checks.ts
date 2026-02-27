import { exec } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

/** Result of a single security / quality check. */
export interface SecurityCheck {
  name: string
  passed: boolean
  output: string
}

/** Aggregate result of all security checks. */
export interface SecurityResult {
  passed: boolean
  checks: SecurityCheck[]
}

/** T16.1: Config to enable/disable checks. Default: all enabled. */
export interface TestingConfig {
  typescript?: boolean
  eslint?: boolean
  npmAudit?: boolean
  secretDetection?: boolean
  sastChecks?: boolean
  customCommand?: string
}

const DEFAULT_TESTING_CONFIG: TestingConfig = {
  typescript: true,
  eslint: true,
  npmAudit: true,
  secretDetection: true,
  sastChecks: true,
}

/** Secret detection patterns */
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Generic API Key', pattern: /api[_-]?key['":\s]*[=:]\s*['"][A-Za-z0-9]{20,}['"]/i },
  { name: 'Generic Secret', pattern: /secret['":\s]*[=:]\s*['"][A-Za-z0-9]{20,}['"]/i },
  { name: 'Password in URL', pattern: /:\/\/[^:]+:[^@]+@/ },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,}-[A-Za-z0-9]+/ },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Stripe Key', pattern: /sk_live_[0-9a-zA-Z]{24,}/ },
  { name: 'OpenAI Key', pattern: /sk-[A-Za-z0-9]{48}/ },
]

/** SAST-like vulnerability patterns */
const VULNERABILITY_PATTERNS = [
  { name: 'SQL Injection', pattern: /`SELECT.*\$\{.*\}`|`INSERT.*\$\{.*\}`|`UPDATE.*\$\{.*\}`|`DELETE.*\$\{.*\}`/i },
  { name: 'Command Injection', pattern: /exec\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`\s*\)/ },
  { name: 'Eval Usage', pattern: /\beval\s*\([^)]*\$\{/ },
  { name: 'Unsafe innerHTML', pattern: /\.innerHTML\s*=\s*[^'"][^;]*\$\{/ },
  { name: 'Disabled TLS', pattern: /rejectUnauthorized\s*:\s*false/ },
  { name: 'Hardcoded Password', pattern: /password\s*[:=]\s*['"][^'"]{8,}['"](?!.*process\.env)/i },
]

/** Files to skip during scanning */
const SKIP_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.next/,
  /dist/,
  /build/,
  /coverage/,
  /\.min\.js$/,
  /\.map$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
]

/** File extensions to scan */
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yml', '.yaml', '.env', '.sh', '.bash',
])

interface SecretFinding {
  file: string
  line: number
  pattern: string
  snippet: string
}

interface VulnerabilityFinding {
  file: string
  line: number
  pattern: string
  snippet: string
}

/**
 * Recursively scan directory for files
 */
function getFilesToScan(dir: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      
      if (SKIP_PATTERNS.some(p => p.test(fullPath))) {
        continue
      }
      
      if (entry.isDirectory()) {
        getFilesToScan(fullPath, files)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SCANNABLE_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
          files.push(fullPath)
        }
      }
    }
  } catch {
    // Directory not accessible
  }
  return files
}

/**
 * Scan a file for secrets
 */
function scanFileForSecrets(filePath: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Skip comments and environment variable references
      if (line.trim().startsWith('//') || line.trim().startsWith('#')) continue
      if (line.includes('process.env')) continue
      if (line.includes('${') && line.includes('ENV')) continue
      
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            file: filePath,
            line: i + 1,
            pattern: name,
            snippet: line.slice(0, 100).trim(),
          })
        }
      }
    }
  } catch {
    // File not readable
  }
  
  return findings
}

/**
 * Scan a file for vulnerabilities
 */
function scanFileForVulnerabilities(filePath: string): VulnerabilityFinding[] {
  const findings: VulnerabilityFinding[] = []
  
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('#')) continue
      
      for (const { name, pattern } of VULNERABILITY_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            file: filePath,
            line: i + 1,
            pattern: name,
            snippet: line.slice(0, 100).trim(),
          })
        }
      }
    }
  } catch {
    // File not readable
  }
  
  return findings
}

/**
 * Run secret detection scan
 */
export async function runSecretDetection(workdir: string): Promise<SecurityCheck> {
  const files = getFilesToScan(workdir)
  const allFindings: SecretFinding[] = []
  
  for (const file of files) {
    const findings = scanFileForSecrets(file)
    allFindings.push(...findings)
  }
  
  if (allFindings.length === 0) {
    return {
      name: 'Secret Detection',
      passed: true,
      output: `Scanned ${files.length} files. No hardcoded secrets found.`,
    }
  }
  
  const output = allFindings
    .slice(0, 10)
    .map(f => `${f.file}:${f.line} - ${f.pattern}: ${f.snippet}`)
    .join('\n')
  
  return {
    name: 'Secret Detection',
    passed: false,
    output: `Found ${allFindings.length} potential secret(s):\n${output}${allFindings.length > 10 ? `\n... and ${allFindings.length - 10} more` : ''}`,
  }
}

/**
 * Run SAST-like vulnerability scan
 */
export async function runSASTChecks(workdir: string): Promise<SecurityCheck> {
  const files = getFilesToScan(workdir)
  const allFindings: VulnerabilityFinding[] = []
  
  for (const file of files) {
    const findings = scanFileForVulnerabilities(file)
    allFindings.push(...findings)
  }
  
  if (allFindings.length === 0) {
    return {
      name: 'SAST Vulnerability Scan',
      passed: true,
      output: `Scanned ${files.length} files. No vulnerability patterns found.`,
    }
  }
  
  const output = allFindings
    .slice(0, 10)
    .map(f => `${f.file}:${f.line} - ${f.pattern}: ${f.snippet}`)
    .join('\n')
  
  return {
    name: 'SAST Vulnerability Scan',
    passed: false,
    output: `Found ${allFindings.length} potential vulnerability(ies):\n${output}${allFindings.length > 10 ? `\n... and ${allFindings.length - 10} more` : ''}`,
  }
}

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

/**
 * Run a suite of security and quality checks inside the given working directory.
 *
 * Each check is conditional on its configuration file being present:
 * - **TypeScript** (`npx tsc --noEmit`) — if `tsconfig.json` exists
 * - **ESLint** (`npx eslint . --max-warnings 0`) — if an ESLint config exists
 * - **npm audit** (`npm audit --json`) — if `package.json` exists
 *
 * Checks that cannot run because required tooling is missing are marked as
 * failed. Checks with missing config files are skipped.
 *
 * @param workdir - The directory to run the checks in.
 * @param testingConfig - Optional. Enables/disables checks. Default: all enabled.
 * @returns Aggregate result with per-check details.
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
    let parsed = false
    let parseError = ''
    try {
      const audit = JSON.parse(result.output) as {
        metadata?: { vulnerabilities?: { critical?: number; high?: number } }
      }
      parsed = true
      const vulns = audit?.metadata?.vulnerabilities
      if (vulns && ((vulns.critical ?? 0) > 0 || (vulns.high ?? 0) > 0)) {
        hasCritical = true
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error)
    }

    const toolingFailed = result.code !== 0 && !parsed
    const parseFailed = !parsed
    const passed = !toolingFailed && !parseFailed && !hasCritical

    checks.push({
      name: 'npm audit',
      passed,
      output: hasCritical
        ? 'Critical or high severity vulnerabilities found.'
        : parseFailed
          ? `Failed to parse npm audit output: ${parseError || 'Unknown parsing error'}\n${result.output.slice(0, 500)}`
          : result.output.slice(0, 500)
    })
  } else if (config.npmAudit !== false) {
    checks.push({
      name: 'npm audit',
      passed: true,
      output: 'Skipped — no package.json found.'
    })
  }

  // Secret Detection
  if (config.secretDetection !== false) {
    const secretCheck = await runSecretDetection(workdir)
    checks.push(secretCheck)
  }

  // SAST Vulnerability Scan
  if (config.sastChecks !== false) {
    const sastCheck = await runSASTChecks(workdir)
    checks.push(sastCheck)
  }

  const allPassed = checks.every((c) => c.passed)
  return { passed: allPassed, checks }
}
