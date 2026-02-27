#!/usr/bin/env npx tsx
/**
 * Performance Test Runner Script
 * 
 * Runs all performance tests and generates a summary report.
 * 
 * Usage:
 *   npx tsx scripts/run-performance-tests.ts [options]
 * 
 * Options:
 *   --type=<type>     Test type: all, api, ws, jobs, k6 (default: all)
 *   --env=<env>       Environment: default, stress, ci (default: default)
 *   --base-url=<url>  Base URL (default: http://localhost:3000)
 *   --output=<path>   Output directory for results (default: tests/performance/results)
 *   --k6-only         Run only k6 tests (requires k6 installed)
 *   --vitest-only     Run only Vitest tests
 *   --help            Show this help message
 */

import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface TestResult {
  name: string
  type: 'k6' | 'vitest'
  passed: boolean
  duration: number
  metrics?: Record<string, unknown>
  error?: string
}

interface PerformanceReport {
  timestamp: string
  environment: string
  baseUrl: string
  duration: number
  results: TestResult[]
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
  }
}

function parseArgs(): {
  type: string
  env: string
  baseUrl: string
  output: string
  k6Only: boolean
  vitestOnly: boolean
  help: boolean
} {
  const args = process.argv.slice(2)
  const result = {
    type: 'all',
    env: 'default',
    baseUrl: 'http://localhost:3000',
    output: 'tests/performance/results',
    k6Only: false,
    vitestOnly: false,
    help: false,
  }

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--k6-only') {
      result.k6Only = true
    } else if (arg === '--vitest-only') {
      result.vitestOnly = true
    } else if (arg.startsWith('--type=')) {
      result.type = arg.split('=')[1]
    } else if (arg.startsWith('--env=')) {
      result.env = arg.split('=')[1]
    } else if (arg.startsWith('--base-url=')) {
      result.baseUrl = arg.split('=')[1]
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1]
    }
  }

  return result
}

function showHelp(): void {
  console.log(`
Performance Test Runner for SwarmUI

Usage:
  npx tsx scripts/run-performance-tests.ts [options]

Options:
  --type=<type>     Test type: all, api, ws, jobs, k6 (default: all)
  --env=<env>       Environment: default, stress, ci (default: default)
  --base-url=<url>  Base URL (default: http://localhost:3000)
  --output=<path>   Output directory for results (default: tests/performance/results)
  --k6-only         Run only k6 tests (requires k6 installed)
  --vitest-only     Run only Vitest tests
  --help            Show this help message

Examples:
  # Run all performance tests
  npx tsx scripts/run-performance-tests.ts

  # Run only API load tests
  npx tsx scripts/run-performance-tests.ts --type=api

  # Run k6 tests against staging
  npx tsx scripts/run-performance-tests.ts --k6-only --base-url=https://staging.example.com

  # Run stress tests
  npx tsx scripts/run-performance-tests.ts --env=stress

Test Types:
  all   - Run all performance tests (k6 + Vitest)
  api   - Run API load tests only
  ws    - Run WebSocket load tests only
  jobs  - Run concurrent jobs tests only
  k6    - Run all k6 tests only

Environments:
  default - Standard benchmarks for development
  stress  - Lenient benchmarks for stress testing
  ci      - Very lenient benchmarks for CI/CD pipelines
`)
}

function isK6Installed(): boolean {
  try {
    execSync('k6 version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string> = {}
): Promise<{ success: boolean; output: string; duration: number }> {
  const startTime = Date.now()

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...env },
      shell: true,
      stdio: 'pipe',
    })

    let output = ''

    proc.stdout.on('data', (data) => {
      output += data.toString()
      process.stdout.write(data)
    })

    proc.stderr.on('data', (data) => {
      output += data.toString()
      process.stderr.write(data)
    })

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output,
        duration: Date.now() - startTime,
      })
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: err.message,
        duration: Date.now() - startTime,
      })
    })
  })
}

async function runK6Test(
  testFile: string,
  baseUrl: string
): Promise<TestResult> {
  const name = testFile.replace('.js', '')
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Running k6 test: ${name}`)
  console.log('='.repeat(60))

  const result = await runCommand('k6', ['run', `tests/performance/${testFile}`], {
    BASE_URL: baseUrl,
    WS_URL: baseUrl.replace('http', 'ws'),
  })

  return {
    name,
    type: 'k6',
    passed: result.success,
    duration: result.duration,
    error: result.success ? undefined : 'Test failed - check output above',
  }
}

async function runVitestTest(
  testFile: string,
  baseUrl: string,
  env: string
): Promise<TestResult> {
  const name = testFile.replace('.test.ts', '')
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Running Vitest test: ${name}`)
  console.log('='.repeat(60))

  const result = await runCommand('npx', ['vitest', 'run', `tests/performance/${testFile}`, '--reporter=verbose'], {
    BASE_URL: baseUrl,
    WS_URL: baseUrl.replace('http', 'ws'),
    PERF_ENV: env,
  })

  return {
    name,
    type: 'vitest',
    passed: result.success,
    duration: result.duration,
    error: result.success ? undefined : 'Test failed - check output above',
  }
}

async function checkServerHealth(baseUrl: string): Promise<boolean> {
  console.log(`\nChecking server health at ${baseUrl}...`)

  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) {
        console.log('Server is healthy!')
        return true
      }
    } catch {
      // Server not ready
    }
    console.log(`Waiting for server... (attempt ${i + 1}/10)`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  console.error('Server health check failed!')
  return false
}

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           SwarmUI Performance Test Runner                     ║
╚══════════════════════════════════════════════════════════════╝

Configuration:
  Test Type:    ${args.type}
  Environment:  ${args.env}
  Base URL:     ${args.baseUrl}
  Output:       ${args.output}
  k6 Only:      ${args.k6Only}
  Vitest Only:  ${args.vitestOnly}
`)

  // Check server health
  const serverHealthy = await checkServerHealth(args.baseUrl)
  if (!serverHealthy) {
    console.error('\nServer is not available. Please start the server first:')
    console.error('  npm run dev')
    process.exit(1)
  }

  // Ensure output directory exists
  if (!existsSync(args.output)) {
    mkdirSync(args.output, { recursive: true })
  }

  const results: TestResult[] = []
  const startTime = Date.now()

  // Determine which tests to run
  const runK6 = !args.vitestOnly && (args.type === 'all' || args.type === 'k6' || args.k6Only)
  const runVitest = !args.k6Only

  // Run k6 tests
  if (runK6) {
    if (!isK6Installed()) {
      console.log('\n⚠️  k6 is not installed. Skipping k6 tests.')
      console.log('   Install k6: https://k6.io/docs/getting-started/installation/')
    } else {
      const k6Tests = ['api-load.js', 'websocket-load.js', 'stress-test.js']

      for (const test of k6Tests) {
        if (args.type === 'all' || args.type === 'k6' || args.k6Only) {
          const result = await runK6Test(test, args.baseUrl)
          results.push(result)
        }
      }
    }
  }

  // Run Vitest tests
  if (runVitest) {
    const vitestTests: { file: string; types: string[] }[] = [
      { file: 'api-load.test.ts', types: ['all', 'api'] },
      { file: 'websocket-load.test.ts', types: ['all', 'ws'] },
      { file: 'concurrent-jobs.test.ts', types: ['all', 'jobs'] },
    ]

    for (const test of vitestTests) {
      if (test.types.includes(args.type)) {
        const result = await runVitestTest(test.file, args.baseUrl, args.env)
        results.push(result)
      }
    }
  }

  // Generate report
  const report: PerformanceReport = {
    timestamp: new Date().toISOString(),
    environment: args.env,
    baseUrl: args.baseUrl,
    duration: Date.now() - startTime,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      skipped: 0,
    },
  }

  // Write report
  const reportPath = join(args.output, `performance-report-${Date.now()}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  // Print summary
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Test Summary                               ║
╚══════════════════════════════════════════════════════════════╝

Total Tests:  ${report.summary.total}
Passed:       ${report.summary.passed} ✓
Failed:       ${report.summary.failed} ✗
Duration:     ${(report.duration / 1000).toFixed(2)}s

Results by Test:
`)

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL'
    const duration = (result.duration / 1000).toFixed(2)
    console.log(`  ${status}  ${result.name} (${duration}s)`)
  }

  console.log(`
Report saved to: ${reportPath}
`)

  // Exit with appropriate code
  process.exit(report.summary.failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Performance test runner failed:', err)
  process.exit(1)
})
