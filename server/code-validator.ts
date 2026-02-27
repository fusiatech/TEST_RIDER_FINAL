import { exec } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import * as ts from 'typescript'

const execAsync = promisify(exec)

/* ── Interfaces ─────────────────────────────────────────────────── */

export interface TypeScriptError {
  file: string
  line: number
  column: number
  message: string
  code: string
}

export interface LintError {
  file: string
  line: number
  column: number
  message: string
  rule: string
  severity: 'error' | 'warning'
}

export interface SyntaxError {
  line: number
  column: number
  message: string
}

export interface CodeValidationResult {
  isValid: boolean
  typeErrors: TypeScriptError[]
  lintErrors: LintError[]
  syntaxErrors: SyntaxError[]
  score: number
}

export interface CodeValidationOptions {
  files?: string[]
  skipLint?: boolean
  skipTypeCheck?: boolean
}

/* ── Helper: safe exec ──────────────────────────────────────────── */

async function safeExec(
  command: string,
  workdir: string,
  timeoutMs = 120_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workdir,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    })
    return { code: 0, stdout, stderr }
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
        stdout: String(execErr.stdout ?? ''),
        stderr: String(execErr.stderr ?? ''),
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { code: 1, stdout: '', stderr: message }
  }
}

/* ── TypeScript Type Checking ───────────────────────────────────── */

/**
 * Run TypeScript type checking using `tsc --noEmit`.
 * Parses the output to extract structured error information.
 */
export async function runTypeCheck(projectPath: string): Promise<TypeScriptError[]> {
  const tsconfigPath = join(projectPath, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) {
    return []
  }

  const result = await safeExec(
    'npx tsc --noEmit --pretty false 2>&1',
    projectPath
  )

  if (result.code === 0) {
    return []
  }

  const errors: TypeScriptError[] = []
  const output = result.stdout + '\n' + result.stderr
  const lines = output.split('\n')

  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/)
    if (match) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[4],
        message: match[5],
      })
    }
  }

  return errors
}

/* ── ESLint Checking ────────────────────────────────────────────── */

interface ESLintMessage {
  ruleId: string | null
  severity: number
  message: string
  line: number
  column: number
}

interface ESLintFileResult {
  filePath: string
  messages: ESLintMessage[]
}

/**
 * Run ESLint with JSON output format.
 * Parses the JSON output to extract structured lint errors.
 */
export async function runLintCheck(
  projectPath: string,
  files?: string[]
): Promise<LintError[]> {
  const hasEslintConfig =
    existsSync(join(projectPath, '.eslintrc')) ||
    existsSync(join(projectPath, '.eslintrc.js')) ||
    existsSync(join(projectPath, '.eslintrc.cjs')) ||
    existsSync(join(projectPath, '.eslintrc.json')) ||
    existsSync(join(projectPath, '.eslintrc.yml')) ||
    existsSync(join(projectPath, '.eslintrc.yaml')) ||
    existsSync(join(projectPath, 'eslint.config.js')) ||
    existsSync(join(projectPath, 'eslint.config.mjs')) ||
    existsSync(join(projectPath, 'eslint.config.cjs')) ||
    existsSync(join(projectPath, 'eslint.config.ts'))

  if (!hasEslintConfig) {
    return []
  }

  const target = files && files.length > 0 ? files.join(' ') : '.'
  const result = await safeExec(
    `npx eslint ${target} --format json 2>&1`,
    projectPath
  )

  const errors: LintError[] = []

  try {
    const jsonOutput = result.stdout.trim()
    if (!jsonOutput.startsWith('[')) {
      return errors
    }

    const eslintResults: ESLintFileResult[] = JSON.parse(jsonOutput)

    for (const fileResult of eslintResults) {
      for (const msg of fileResult.messages) {
        errors.push({
          file: fileResult.filePath,
          line: msg.line,
          column: msg.column,
          message: msg.message,
          rule: msg.ruleId ?? 'unknown',
          severity: msg.severity === 2 ? 'error' : 'warning',
        })
      }
    }
  } catch {
    const lines = (result.stdout + '\n' + result.stderr).split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+)$/)
      if (match) {
        errors.push({
          file: 'unknown',
          line: parseInt(match[1], 10),
          column: parseInt(match[2], 10),
          severity: match[3] as 'error' | 'warning',
          message: match[4],
          rule: match[5],
        })
      }
    }
  }

  return errors
}

/* ── Syntax Checking ────────────────────────────────────────────── */

/**
 * Check syntax of a code string using TypeScript's parser.
 * Returns syntax errors without requiring a full project context.
 */
export function checkSyntax(
  code: string,
  language: 'typescript' | 'javascript'
): SyntaxError[] {
  const errors: SyntaxError[] = []

  const scriptKind =
    language === 'typescript' ? ts.ScriptKind.TS : ts.ScriptKind.JS

  const sourceFile = ts.createSourceFile(
    'temp.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === 'SyntaxError') {
      return
    }

    const diagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics
    if (diagnostics) {
      for (const diag of diagnostics) {
        if (diag.start !== undefined) {
          const pos = sourceFile.getLineAndCharacterOfPosition(diag.start)
          const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')

          const existing = errors.find(
            (e) => e.line === pos.line + 1 && e.column === pos.character + 1
          )
          if (!existing) {
            errors.push({
              line: pos.line + 1,
              column: pos.character + 1,
              message,
            })
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  const parseDiagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  for (const diag of parseDiagnostics) {
    if (diag.start !== undefined) {
      const pos = sourceFile.getLineAndCharacterOfPosition(diag.start)
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')

      const existing = errors.find(
        (e) => e.line === pos.line + 1 && e.column === pos.character + 1
      )
      if (!existing) {
        errors.push({
          line: pos.line + 1,
          column: pos.character + 1,
          message,
        })
      }
    }
  }

  return errors
}

/* ── Score Calculation ──────────────────────────────────────────── */

/**
 * Calculate a validation score from 0-100 based on error counts.
 * Higher score = better code quality.
 *
 * Scoring:
 * - Start at 100
 * - TypeScript errors: -10 each (max -50)
 * - Lint errors: -5 each (max -30)
 * - Lint warnings: -2 each (max -10)
 * - Syntax errors: -15 each (max -50)
 */
function calculateScore(
  typeErrors: TypeScriptError[],
  lintErrors: LintError[],
  syntaxErrors: SyntaxError[]
): number {
  let score = 100

  const typeErrorPenalty = Math.min(typeErrors.length * 10, 50)
  score -= typeErrorPenalty

  const lintErrorCount = lintErrors.filter((e) => e.severity === 'error').length
  const lintWarningCount = lintErrors.filter((e) => e.severity === 'warning').length

  const lintErrorPenalty = Math.min(lintErrorCount * 5, 30)
  const lintWarningPenalty = Math.min(lintWarningCount * 2, 10)
  score -= lintErrorPenalty + lintWarningPenalty

  const syntaxPenalty = Math.min(syntaxErrors.length * 15, 50)
  score -= syntaxPenalty

  return Math.max(0, score)
}

/* ── Main Validation Function ───────────────────────────────────── */

/**
 * Run comprehensive code validation on a project.
 *
 * @param projectPath - Path to the project directory
 * @param options - Optional configuration for validation
 * @returns CodeValidationResult with all errors and a quality score
 */
export async function validateCode(
  projectPath: string,
  options?: CodeValidationOptions
): Promise<CodeValidationResult> {
  const typeErrors: TypeScriptError[] = []
  const lintErrors: LintError[] = []
  const syntaxErrors: SyntaxError[] = []

  if (!options?.skipTypeCheck) {
    const tsErrors = await runTypeCheck(projectPath)
    typeErrors.push(...tsErrors)
  }

  if (!options?.skipLint) {
    const eslintErrors = await runLintCheck(projectPath, options?.files)
    lintErrors.push(...eslintErrors)
  }

  const score = calculateScore(typeErrors, lintErrors, syntaxErrors)

  const hasTypeErrors = typeErrors.length > 0
  const hasLintErrors = lintErrors.some((e) => e.severity === 'error')
  const hasSyntaxErrors = syntaxErrors.length > 0

  const isValid = !hasTypeErrors && !hasLintErrors && !hasSyntaxErrors

  return {
    isValid,
    typeErrors,
    lintErrors,
    syntaxErrors,
    score,
  }
}

/* ── Quick Validation for Generated Code ────────────────────────── */

/**
 * Quick validation for a code snippet without running full project checks.
 * Useful for validating generated code before writing to disk.
 */
export function validateCodeSnippet(
  code: string,
  language: 'typescript' | 'javascript' = 'typescript'
): { isValid: boolean; errors: SyntaxError[] } {
  const errors = checkSyntax(code, language)
  return {
    isValid: errors.length === 0,
    errors,
  }
}
