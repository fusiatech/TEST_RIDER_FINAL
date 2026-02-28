import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const outDir = resolve(process.cwd(), 'artifacts', 'phase-1')
const logsDir = resolve(outDir, 'logs')
mkdirSync(outDir, { recursive: true })
mkdirSync(logsDir, { recursive: true })

function runStep(name, command, args) {
  const startedAt = Date.now()
  const timeoutMs = name === 'mode-smoke' ? 20 * 60 * 1000 : 10 * 60 * 1000
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf-8',
    timeout: timeoutMs,
  })
  const logPath = resolve(logsDir, `${name}.log`)
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
  writeFileSync(logPath, `${combined}\n`, 'utf-8')
  return {
    name,
    pass: result.status === 0,
    status: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    logPath,
  }
}

function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function routeExists(relativePath) {
  return existsSync(resolve(process.cwd(), relativePath))
}

function routeContains(relativePath, marker) {
  const abs = resolve(process.cwd(), relativePath)
  if (!existsSync(abs)) return false
  const text = readFileSync(abs, 'utf-8')
  return text.includes(marker)
}

const stepResults = [
  runStep('mode-smoke', process.execPath, ['scripts/mode-smoke.mjs']),
  runStep('chat-smoke', process.execPath, ['scripts/chat-smoke.mjs']),
  runStep('provider-auth-live', process.execPath, ['scripts/verify-provider-auth.mjs']),
]

const modeMatrix = readJsonIfExists(
  resolve(process.cwd(), 'artifacts', 'phase-0', 'phase0-mode-matrix.json'),
  {
    phase: 1,
    matrix: [],
  },
)

const providerMatrix =
  readJsonIfExists(
    resolve(process.cwd(), 'artifacts', 'phase-agent-runtime', 'provider-auth-diagnostics.json'),
    null,
  ) ??
  readJsonIfExists(resolve(process.cwd(), 'artifacts', 'phase-fast', 'provider-matrix.json'), {
    providers: [],
  })

const apiMatrix = {
  checkedAt: new Date().toISOString(),
  checks: [
    {
      name: 'prd_route_exists',
      path: 'app/api/projects/[id]/prd/route.ts',
      pass: routeExists('app/api/projects/[id]/prd/route.ts'),
    },
    {
      name: 'tickets_route_exists',
      path: 'app/api/projects/[id]/generate-tickets/route.ts',
      pass: routeExists('app/api/projects/[id]/generate-tickets/route.ts'),
    },
    {
      name: 'prd_route_provider_agnostic',
      path: 'app/api/projects/[id]/prd/route.ts',
      pass: routeContains('app/api/projects/[id]/prd/route.ts', 'runGenerationGateway'),
    },
    {
      name: 'tickets_route_provider_agnostic',
      path: 'app/api/projects/[id]/generate-tickets/route.ts',
      pass: routeContains('app/api/projects/[id]/generate-tickets/route.ts', 'runGenerationGateway'),
    },
    {
      name: 'workflow_route_provider_agnostic',
      path: 'server/prd-workflow.ts',
      pass: routeContains('server/prd-workflow.ts', 'runGenerationGateway'),
    },
    {
      name: 'test_runner_route_exists',
      path: 'app/api/tests/route.ts',
      pass: routeExists('app/api/tests/route.ts'),
    },
    {
      name: 'repo_edit_route_exists',
      path: 'app/api/files/[...path]/route.ts',
      pass: routeExists('app/api/files/[...path]/route.ts'),
    },
  ],
}

const securityFindings = {
  checkedAt: new Date().toISOString(),
  findings: [
    ...stepResults
      .filter((step) => !step.pass)
      .map((step) => ({
        severity: 'high',
        type: 'certification_step_failure',
        check: step.name,
        evidence: step.logPath,
      })),
    ...apiMatrix.checks
      .filter((check) => !check.pass)
      .map((check) => ({
        severity: 'medium',
        type: 'api_contract_or_wiring_gap',
        check: check.name,
        path: check.path,
      })),
  ],
}

const residualRisks = {
  checkedAt: new Date().toISOString(),
  risks: [
    'Provider quotas and free-tier limits can change without notice.',
    'Managed cloud sandbox isolation is not fully certified by this script.',
    'Authenticated end-to-end artifact flows require environment user session setup.',
    ...(securityFindings.findings.length > 0
      ? ['One or more certification checks failed; inspect security-findings.json.']
      : []),
  ],
}

const certSummary = {
  phase: 1,
  checkedAt: new Date().toISOString(),
  status:
    stepResults.every((step) => step.pass) &&
    apiMatrix.checks.every((check) => check.pass)
      ? 'pass'
      : 'fail',
  steps: stepResults,
  aggregates: {
    modeChecks: Array.isArray(modeMatrix?.matrix) ? modeMatrix.matrix.length : 0,
    providerChecks: Array.isArray(providerMatrix?.checks)
      ? providerMatrix.checks.length
      : Array.isArray(providerMatrix?.diagnostics)
        ? providerMatrix.diagnostics.length
      : Array.isArray(providerMatrix?.providers)
        ? providerMatrix.providers.length
        : 0,
    apiChecks: apiMatrix.checks.length,
  },
}

writeFileSync(resolve(outDir, 'cert-summary.json'), `${JSON.stringify(certSummary, null, 2)}\n`, 'utf-8')
writeFileSync(resolve(outDir, 'mode-matrix.json'), `${JSON.stringify(modeMatrix, null, 2)}\n`, 'utf-8')
writeFileSync(resolve(outDir, 'provider-matrix.json'), `${JSON.stringify(providerMatrix, null, 2)}\n`, 'utf-8')
writeFileSync(resolve(outDir, 'api-matrix.json'), `${JSON.stringify(apiMatrix, null, 2)}\n`, 'utf-8')
writeFileSync(resolve(outDir, 'security-findings.json'), `${JSON.stringify(securityFindings, null, 2)}\n`, 'utf-8')
writeFileSync(resolve(outDir, 'residual-risks.json'), `${JSON.stringify(residualRisks, null, 2)}\n`, 'utf-8')

console.log(JSON.stringify(certSummary, null, 2))
if (certSummary.status !== 'pass') {
  process.exit(1)
}
