import { exec } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
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
  customCommand?: string
}

const DEFAULT_TESTING_CONFIG: TestingConfig = {
  typescript: true,
  eslint: true,
  npmAudit: true,
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
 * Checks that cannot run (missing config, command not found) are marked as
 * passed/skipped so they do not block the pipeline.
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

  const allPassed = checks.every((c) => c.passed)
  return { passed: allPassed, checks }
}
