import { spawn, ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLogger } from '@/server/logger'

const logger = createLogger('test-runner')

/* ── Test Result Types ─────────────────────────────────────────────── */

export interface TestResult {
  id: string
  name: string
  file: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  error?: string
  stackTrace?: string
}

/* ── Coverage Types ─────────────────────────────────────────────── */

export interface CoverageMetrics {
  total: number
  covered: number
  skipped: number
  pct: number
}

export interface FileCoverage {
  path: string
  lines: CoverageMetrics
  branches: CoverageMetrics
  functions: CoverageMetrics
  statements: CoverageMetrics
}

export interface CoverageSummary {
  lines: CoverageMetrics
  branches: CoverageMetrics
  functions: CoverageMetrics
  statements: CoverageMetrics
}

export interface CoverageData {
  summary: CoverageSummary
  files: FileCoverage[]
}

export interface TestRunSummary {
  id: string
  timestamp: number
  framework: string
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  results: TestResult[]
  coverage?: CoverageData
}

export type TestFramework = 'jest' | 'vitest' | 'pytest' | 'mocha' | 'go-test' | 'cargo-test' | 'unknown'

export interface TestRunOptions {
  filter?: string
  watch?: boolean
  timeout?: number
  coverage?: boolean
}

/* ── Framework Detection ───────────────────────────────────────────── */

interface FrameworkConfig {
  framework: TestFramework
  command: string
  args: string[]
  jsonFlag?: string[]
  coverageFlag?: string[]
  coverageDir?: string
}

/**
 * Detect the test framework used in a project by examining config files.
 */
export function detectTestFramework(projectPath: string): FrameworkConfig {
  const packageJsonPath = join(projectPath, 'package.json')
  const pyprojectPath = join(projectPath, 'pyproject.toml')
  const setupPyPath = join(projectPath, 'setup.py')
  const goModPath = join(projectPath, 'go.mod')
  const cargoTomlPath = join(projectPath, 'Cargo.toml')

  // Check for Node.js project
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }

      // Vitest takes precedence if both are present
      if (deps['vitest'] || existsSync(join(projectPath, 'vitest.config.ts')) || existsSync(join(projectPath, 'vitest.config.js'))) {
        return {
          framework: 'vitest',
          command: 'npx',
          args: ['vitest', 'run'],
          jsonFlag: ['--reporter=json'],
          coverageFlag: ['--coverage', '--coverage.reporter=json-summary', '--coverage.reporter=json'],
          coverageDir: 'coverage',
        }
      }

      // Jest
      if (deps['jest'] || existsSync(join(projectPath, 'jest.config.js')) || existsSync(join(projectPath, 'jest.config.ts'))) {
        return {
          framework: 'jest',
          command: 'npx',
          args: ['jest'],
          jsonFlag: ['--json'],
          coverageFlag: ['--coverage', '--coverageReporters=json-summary', '--coverageReporters=json'],
          coverageDir: 'coverage',
        }
      }

      // Mocha
      if (deps['mocha'] || existsSync(join(projectPath, '.mocharc.js')) || existsSync(join(projectPath, '.mocharc.json'))) {
        return {
          framework: 'mocha',
          command: 'npx',
          args: ['mocha'],
          jsonFlag: ['--reporter=json'],
        }
      }

      // Check scripts for test command hints
      if (pkg.scripts?.test) {
        const testScript = pkg.scripts.test.toLowerCase()
        if (testScript.includes('vitest')) {
          return {
            framework: 'vitest',
            command: 'npm',
            args: ['test', '--'],
            jsonFlag: ['--reporter=json'],
          }
        }
        if (testScript.includes('jest')) {
          return {
            framework: 'jest',
            command: 'npm',
            args: ['test', '--'],
            jsonFlag: ['--json'],
          }
        }
        if (testScript.includes('mocha')) {
          return {
            framework: 'mocha',
            command: 'npm',
            args: ['test', '--'],
            jsonFlag: ['--reporter=json'],
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to parse package.json', { error: String(err) })
    }
  }

  // Check for Python project
  if (existsSync(pyprojectPath) || existsSync(setupPyPath)) {
    // Check for pytest
    if (existsSync(join(projectPath, 'pytest.ini')) || 
        existsSync(join(projectPath, 'conftest.py')) ||
        existsSync(join(projectPath, 'tests'))) {
      return {
        framework: 'pytest',
        command: 'python',
        args: ['-m', 'pytest'],
        jsonFlag: ['--json-report', '--json-report-file=-'],
      }
    }
  }

  // Check for Go project
  if (existsSync(goModPath)) {
    return {
      framework: 'go-test',
      command: 'go',
      args: ['test', './...'],
      jsonFlag: ['-json'],
    }
  }

  // Check for Rust project
  if (existsSync(cargoTomlPath)) {
    return {
      framework: 'cargo-test',
      command: 'cargo',
      args: ['test'],
      jsonFlag: ['--', '-Z', 'unstable-options', '--format', 'json'],
    }
  }

  return {
    framework: 'unknown',
    command: 'npm',
    args: ['test'],
  }
}

/* ── Test Result Parsing ───────────────────────────────────────────── */

/**
 * Parse Jest JSON output into structured test results.
 */
function parseJestResults(output: string): TestResult[] {
  const results: TestResult[] = []
  
  try {
    // Jest JSON output may have console logs before the JSON
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/)
    if (!jsonMatch) return results
    
    const json = JSON.parse(jsonMatch[0])
    
    for (const testFile of json.testResults || []) {
      for (const assertion of testFile.assertionResults || []) {
        results.push({
          id: randomUUID(),
          name: assertion.fullName || assertion.title,
          file: testFile.name,
          status: assertion.status === 'passed' ? 'passed' : 
                  assertion.status === 'pending' ? 'skipped' : 'failed',
          duration: assertion.duration || 0,
          error: assertion.failureMessages?.join('\n'),
          stackTrace: assertion.failureMessages?.find((m: string) => m.includes('at '))
        })
      }
    }
  } catch (err) {
    logger.warn('Failed to parse Jest output', { error: String(err) })
  }
  
  return results
}

/**
 * Parse Vitest JSON output into structured test results.
 */
function parseVitestResults(output: string): TestResult[] {
  const results: TestResult[] = []
  
  try {
    // Vitest outputs JSON to stdout
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/)
    if (!jsonMatch) return results
    
    const json = JSON.parse(jsonMatch[0])
    
    for (const testFile of json.testResults || []) {
      for (const task of testFile.tasks || []) {
        results.push({
          id: randomUUID(),
          name: task.name,
          file: testFile.name,
          status: task.result?.state === 'pass' ? 'passed' :
                  task.result?.state === 'skip' ? 'skipped' : 'failed',
          duration: task.result?.duration || 0,
          error: task.result?.errors?.[0]?.message,
          stackTrace: task.result?.errors?.[0]?.stack
        })
      }
    }
  } catch (err) {
    logger.warn('Failed to parse Vitest output', { error: String(err) })
  }
  
  return results
}

/**
 * Parse pytest JSON output into structured test results.
 */
function parsePytestResults(output: string): TestResult[] {
  const results: TestResult[] = []
  
  try {
    // pytest-json-report outputs JSON
    const jsonMatch = output.match(/\{[\s\S]*"tests"[\s\S]*\}/)
    if (!jsonMatch) return results
    
    const json = JSON.parse(jsonMatch[0])
    
    for (const test of json.tests || []) {
      results.push({
        id: randomUUID(),
        name: test.nodeid,
        file: test.nodeid.split('::')[0],
        status: test.outcome === 'passed' ? 'passed' :
                test.outcome === 'skipped' ? 'skipped' : 'failed',
        duration: (test.call?.duration || test.setup?.duration || 0) * 1000,
        error: test.call?.longrepr,
        stackTrace: test.call?.longrepr
      })
    }
  } catch (err) {
    logger.warn('Failed to parse pytest output', { error: String(err) })
  }
  
  return results
}

/**
 * Parse Go test JSON output into structured test results.
 */
function parseGoTestResults(output: string): TestResult[] {
  const results: TestResult[] = []
  const testMap = new Map<string, TestResult>()
  
  try {
    // Go test -json outputs newline-delimited JSON
    const lines = output.split('\n').filter(line => line.trim())
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        if (event.Test && event.Action) {
          const key = `${event.Package}/${event.Test}`
          
          if (event.Action === 'run') {
            testMap.set(key, {
              id: randomUUID(),
              name: event.Test,
              file: event.Package,
              status: 'passed',
              duration: 0
            })
          } else if (event.Action === 'pass' || event.Action === 'fail' || event.Action === 'skip') {
            const existing = testMap.get(key)
            if (existing) {
              existing.status = event.Action === 'pass' ? 'passed' :
                               event.Action === 'skip' ? 'skipped' : 'failed'
              existing.duration = (event.Elapsed || 0) * 1000
            }
          } else if (event.Action === 'output' && event.Output) {
            const existing = testMap.get(key)
            if (existing && event.Output.includes('Error')) {
              existing.error = (existing.error || '') + event.Output
            }
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }
    
    results.push(...testMap.values())
  } catch (err) {
    logger.warn('Failed to parse Go test output', { error: String(err) })
  }
  
  return results
}

/**
 * Parse Mocha JSON output into structured test results.
 */
function parseMochaResults(output: string): TestResult[] {
  const results: TestResult[] = []
  
  try {
    const jsonMatch = output.match(/\{[\s\S]*"tests"[\s\S]*\}/)
    if (!jsonMatch) return results
    
    const json = JSON.parse(jsonMatch[0])
    
    for (const test of json.tests || []) {
      results.push({
        id: randomUUID(),
        name: test.fullTitle || test.title,
        file: test.file || '',
        status: test.state === 'passed' ? 'passed' :
                test.pending ? 'skipped' : 'failed',
        duration: test.duration || 0,
        error: test.err?.message,
        stackTrace: test.err?.stack
      })
    }
  } catch (err) {
    logger.warn('Failed to parse Mocha output', { error: String(err) })
  }
  
  return results
}

/**
 * Fallback parser that extracts test results from plain text output.
 */
function parsePlainTextResults(output: string, framework: string): TestResult[] {
  const results: TestResult[] = []
  
  // Common patterns for test output
  const passPatterns = [
    /✓\s+(.+?)(?:\s+\((\d+)ms\))?$/gm,
    /PASS\s+(.+)$/gm,
    /ok\s+(.+?)\s+(\d+(?:\.\d+)?s)?$/gm,
  ]
  
  const failPatterns = [
    /✗\s+(.+?)(?:\s+\((\d+)ms\))?$/gm,
    /FAIL\s+(.+)$/gm,
    /FAILED\s+(.+)$/gm,
  ]
  
  const skipPatterns = [
    /-\s+(.+?)(?:\s+\(skipped\))?$/gm,
    /SKIP\s+(.+)$/gm,
  ]
  
  for (const pattern of passPatterns) {
    let match
    while ((match = pattern.exec(output)) !== null) {
      results.push({
        id: randomUUID(),
        name: match[1].trim(),
        file: '',
        status: 'passed',
        duration: match[2] ? parseInt(match[2], 10) : 0
      })
    }
  }
  
  for (const pattern of failPatterns) {
    let match
    while ((match = pattern.exec(output)) !== null) {
      results.push({
        id: randomUUID(),
        name: match[1].trim(),
        file: '',
        status: 'failed',
        duration: 0
      })
    }
  }
  
  for (const pattern of skipPatterns) {
    let match
    while ((match = pattern.exec(output)) !== null) {
      results.push({
        id: randomUUID(),
        name: match[1].trim(),
        file: '',
        status: 'skipped',
        duration: 0
      })
    }
  }
  
  return results
}

/**
 * Parse test output into structured results based on the framework.
 */
export function parseTestResults(output: string, framework: string): TestResult[] {
  switch (framework) {
    case 'jest':
      return parseJestResults(output)
    case 'vitest':
      return parseVitestResults(output)
    case 'pytest':
      return parsePytestResults(output)
    case 'go-test':
      return parseGoTestResults(output)
    case 'mocha':
      return parseMochaResults(output)
    default:
      return parsePlainTextResults(output, framework)
  }
}

/* ── Coverage Parsing ─────────────────────────────────────────────── */

interface CoverageSummaryJson {
  total?: {
    lines?: { total: number; covered: number; skipped: number; pct: number }
    branches?: { total: number; covered: number; skipped: number; pct: number }
    functions?: { total: number; covered: number; skipped: number; pct: number }
    statements?: { total: number; covered: number; skipped: number; pct: number }
  }
  [filePath: string]: {
    lines?: { total: number; covered: number; skipped: number; pct: number }
    branches?: { total: number; covered: number; skipped: number; pct: number }
    functions?: { total: number; covered: number; skipped: number; pct: number }
    statements?: { total: number; covered: number; skipped: number; pct: number }
  } | undefined
}

function createEmptyMetrics(): CoverageMetrics {
  return { total: 0, covered: 0, skipped: 0, pct: 0 }
}

function parseMetrics(data: { total: number; covered: number; skipped: number; pct: number } | undefined): CoverageMetrics {
  if (!data) return createEmptyMetrics()
  return {
    total: data.total || 0,
    covered: data.covered || 0,
    skipped: data.skipped || 0,
    pct: typeof data.pct === 'number' ? data.pct : 0,
  }
}

/**
 * Parse coverage-summary.json from Jest/Vitest coverage output.
 */
export function parseCoverageSummary(projectPath: string, coverageDir: string): CoverageData | undefined {
  const summaryPath = join(projectPath, coverageDir, 'coverage-summary.json')
  
  if (!existsSync(summaryPath)) {
    logger.debug('Coverage summary not found', { path: summaryPath })
    return undefined
  }
  
  try {
    const content = readFileSync(summaryPath, 'utf-8')
    const json: CoverageSummaryJson = JSON.parse(content)
    
    const files: FileCoverage[] = []
    
    for (const [filePath, data] of Object.entries(json)) {
      if (filePath === 'total' || !data) continue
      
      files.push({
        path: filePath,
        lines: parseMetrics(data.lines),
        branches: parseMetrics(data.branches),
        functions: parseMetrics(data.functions),
        statements: parseMetrics(data.statements),
      })
    }
    
    const totalData = json.total
    const summary: CoverageSummary = {
      lines: parseMetrics(totalData?.lines),
      branches: parseMetrics(totalData?.branches),
      functions: parseMetrics(totalData?.functions),
      statements: parseMetrics(totalData?.statements),
    }
    
    logger.info('Parsed coverage data', { 
      fileCount: files.length, 
      lineCoverage: summary.lines.pct 
    })
    
    return { summary, files }
  } catch (err) {
    logger.warn('Failed to parse coverage summary', { error: String(err) })
    return undefined
  }
}

/* ── Test Execution ────────────────────────────────────────────────── */

export interface TestRunHandle {
  kill: () => void
  promise: Promise<TestRunSummary>
}

/**
 * Run tests in the specified project directory.
 */
export function runTests(
  projectPath: string,
  options: TestRunOptions = {},
  onOutput?: (data: string) => void
): TestRunHandle {
  const { filter, watch = false, timeout = 300000, coverage = true } = options
  
  const config = detectTestFramework(projectPath)
  const runId = randomUUID()
  const startTime = Date.now()
  
  logger.info('Starting test run', { 
    runId, 
    framework: config.framework, 
    projectPath,
    filter,
    watch,
    coverage
  })
  
  let proc: ChildProcess | null = null
  let killed = false
  let output = ''
  
  const args = [...config.args]
  
  // Add JSON output flag for structured results
  if (config.jsonFlag && !watch) {
    args.push(...config.jsonFlag)
  }
  
  // Add coverage flag if enabled and not in watch mode
  if (coverage && config.coverageFlag && !watch) {
    args.push(...config.coverageFlag)
  }
  
  // Add filter pattern
  if (filter) {
    switch (config.framework) {
      case 'jest':
        args.push('--testNamePattern', filter)
        break
      case 'vitest':
        args.push('--filter', filter)
        break
      case 'pytest':
        args.push('-k', filter)
        break
      case 'go-test':
        args.push('-run', filter)
        break
      case 'mocha':
        args.push('--grep', filter)
        break
    }
  }
  
  // Add watch mode
  if (watch) {
    switch (config.framework) {
      case 'jest':
        args.push('--watch')
        break
      case 'vitest':
        // Remove 'run' and add watch
        const runIdx = args.indexOf('run')
        if (runIdx !== -1) args.splice(runIdx, 1)
        args.push('--watch')
        break
      case 'pytest':
        // pytest-watch is a separate package
        args.push('--looponfail')
        break
    }
  }
  
  const promise = new Promise<TestRunSummary>((resolve, reject) => {
    const isWindows = process.platform === 'win32'
    
    try {
      proc = spawn(config.command, args, {
        cwd: projectPath,
        shell: isWindows,
        env: { ...process.env, FORCE_COLOR: '0', CI: 'true' }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Failed to spawn test process', { error: message })
      reject(new Error(`Failed to spawn test process: ${message}`))
      return
    }
    
    const timeoutId = setTimeout(() => {
      if (!killed && proc) {
        killed = true
        proc.kill('SIGTERM')
        reject(new Error(`Test run timed out after ${timeout}ms`))
      }
    }, timeout)
    
    proc.stdout?.on('data', (data: Buffer) => {
      const str = data.toString()
      output += str
      if (onOutput) {
        try {
          onOutput(str)
        } catch {
          // Swallow callback errors
        }
      }
    })
    
    proc.stderr?.on('data', (data: Buffer) => {
      const str = data.toString()
      output += str
      if (onOutput) {
        try {
          onOutput(str)
        } catch {
          // Swallow callback errors
        }
      }
    })
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      
      if (killed) return
      
      const duration = Date.now() - startTime
      const results = parseTestResults(output, config.framework)
      
      // Parse coverage data if available
      let coverageData: CoverageData | undefined
      if (coverage && config.coverageDir) {
        coverageData = parseCoverageSummary(projectPath, config.coverageDir)
      }
      
      const summary: TestRunSummary = {
        id: runId,
        timestamp: startTime,
        framework: config.framework,
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        duration,
        results,
        coverage: coverageData
      }
      
      // If no structured results were parsed, create a summary from exit code
      if (results.length === 0) {
        summary.total = 1
        if (code === 0) {
          summary.passed = 1
          summary.results = [{
            id: randomUUID(),
            name: 'Test Suite',
            file: projectPath,
            status: 'passed',
            duration
          }]
        } else {
          summary.failed = 1
          summary.results = [{
            id: randomUUID(),
            name: 'Test Suite',
            file: projectPath,
            status: 'failed',
            duration,
            error: `Tests exited with code ${code}`,
            stackTrace: output.slice(-2000)
          }]
        }
      }
      
      logger.info('Test run completed', {
        runId,
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        duration,
        hasCoverage: !!coverageData,
        lineCoverage: coverageData?.summary.lines.pct
      })
      
      resolve(summary)
    })
    
    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      if (!killed) {
        logger.error('Test process error', { error: err.message })
        reject(err)
      }
    })
  })
  
  return {
    kill: () => {
      if (!killed && proc) {
        killed = true
        proc.kill('SIGTERM')
      }
    },
    promise
  }
}

/* ── Test Job Queue Integration ────────────────────────────────────── */

export interface TestJob {
  id: string
  projectPath: string
  options: TestRunOptions
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: TestRunSummary
  error?: string
}

const testJobs = new Map<string, TestJob>()
const runningHandles = new Map<string, TestRunHandle>()

/**
 * Enqueue a test job for execution.
 */
export function enqueueTestJob(
  projectPath: string,
  options: TestRunOptions = {},
  onOutput?: (data: string) => void
): TestJob {
  const job: TestJob = {
    id: randomUUID(),
    projectPath,
    options,
    status: 'queued',
    createdAt: Date.now()
  }
  
  testJobs.set(job.id, job)
  
  // Start execution immediately (could be queued in a real implementation)
  setImmediate(() => executeTestJob(job.id, onOutput))
  
  return job
}

async function executeTestJob(jobId: string, onOutput?: (data: string) => void): Promise<void> {
  const job = testJobs.get(jobId)
  if (!job || job.status === 'cancelled') return
  
  job.status = 'running'
  job.startedAt = Date.now()
  testJobs.set(jobId, job)
  
  try {
    const handle = runTests(job.projectPath, job.options, onOutput)
    runningHandles.set(jobId, handle)
    
    const result = await handle.promise
    
    runningHandles.delete(jobId)
    
    job.status = 'completed'
    job.completedAt = Date.now()
    job.result = result
    testJobs.set(jobId, job)
  } catch (err) {
    runningHandles.delete(jobId)
    
    job.status = 'failed'
    job.completedAt = Date.now()
    job.error = err instanceof Error ? err.message : String(err)
    testJobs.set(jobId, job)
  }
}

/**
 * Get a test job by ID.
 */
export function getTestJob(id: string): TestJob | undefined {
  return testJobs.get(id)
}

/**
 * Get all test jobs.
 */
export function getAllTestJobs(): TestJob[] {
  return Array.from(testJobs.values())
}

/**
 * Cancel a running test job.
 */
export function cancelTestJob(id: string): boolean {
  const job = testJobs.get(id)
  if (!job) return false
  
  if (job.status === 'running') {
    const handle = runningHandles.get(id)
    if (handle) {
      handle.kill()
      runningHandles.delete(id)
    }
  }
  
  job.status = 'cancelled'
  job.completedAt = Date.now()
  testJobs.set(id, job)
  
  return true
}

/**
 * Clear completed/failed/cancelled test jobs older than the specified age.
 */
export function clearOldTestJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs
  let cleared = 0
  
  for (const [id, job] of testJobs) {
    if (job.status !== 'queued' && job.status !== 'running' && job.createdAt < cutoff) {
      testJobs.delete(id)
      cleared++
    }
  }
  
  return cleared
}
