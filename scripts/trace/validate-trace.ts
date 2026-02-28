import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

type RequirementStatus = 'implemented' | 'partial' | 'missing' | 'broken' | 'unverified'

interface TraceRequirement {
  requirement_id: string
  phase: number
  status: RequirementStatus
  code_paths: string[]
  api_routes: string[]
  ui_components: string[]
  jobs: string[]
  tests: string[]
  docs: string[]
  owner: string
  eta: string
  risk: string
}

interface TraceMatrix {
  version: number
  source: string
  generated_at: string
  requirements: TraceRequirement[]
}

const ALLOWED_STATUS: Set<RequirementStatus> = new Set([
  'implemented',
  'partial',
  'missing',
  'broken',
  'unverified',
])

const EXPECTED_REQUIREMENT_IDS = [
  'P0-001', 'P0-002', 'P0-003',
  'P1-001', 'P1-002', 'P1-003', 'P1-004', 'P1-005', 'P1-006', 'P1-007',
  'P2-001', 'P2-002', 'P2-003', 'P2-004',
  'P3-001', 'P3-002', 'P3-003', 'P3-004', 'P3-005', 'P3-006', 'P3-007',
  'P4-001', 'P4-002', 'P4-003', 'P4-004', 'P4-005', 'P4-006',
  'P5-001', 'P5-002', 'P5-003', 'P5-004', 'P5-005', 'P5-006', 'P5-007',
  'P6-001', 'P6-002', 'P6-003', 'P6-004', 'P6-005', 'P6-006', 'P6-007',
  'P7-001', 'P7-002', 'P7-003', 'P7-004', 'P7-005', 'P7-006', 'P7-007', 'P7-008', 'P7-009', 'P7-010', 'P7-011',
  'P8-001', 'P8-002', 'P8-003', 'P8-004',
  'P9-001', 'P9-002', 'P9-003', 'P9-004', 'P9-005',
]

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidEta(value: unknown): boolean {
  return isNonEmptyString(value) || value instanceof Date
}

function validateArrayField(
  value: unknown,
  fieldName: keyof Pick<
    TraceRequirement,
    'code_paths' | 'api_routes' | 'ui_components' | 'jobs' | 'tests' | 'docs'
  >,
  requirementId: string,
  errors: string[]
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${requirementId}: ${fieldName} must be a non-empty array`)
    return
  }
  const hasInvalid = value.some((entry) => !isNonEmptyString(entry))
  if (hasInvalid) {
    errors.push(`${requirementId}: ${fieldName} must contain only non-empty strings`)
  }
}

function validateRequirement(req: unknown, errors: string[]): req is TraceRequirement {
  if (!req || typeof req !== 'object') {
    errors.push('Requirement entry is not an object')
    return false
  }

  const obj = req as Record<string, unknown>
  const requirementId = String(obj.requirement_id ?? '<missing-id>')

  if (!isNonEmptyString(obj.requirement_id)) {
    errors.push(`${requirementId}: requirement_id is required`)
  }
  if (typeof obj.phase !== 'number' || obj.phase < 0 || obj.phase > 9) {
    errors.push(`${requirementId}: phase must be a number between 0 and 9`)
  }
  if (!isNonEmptyString(obj.status) || !ALLOWED_STATUS.has(obj.status as RequirementStatus)) {
    errors.push(`${requirementId}: status must be one of ${[...ALLOWED_STATUS].join(', ')}`)
  }

  validateArrayField(obj.code_paths, 'code_paths', requirementId, errors)
  validateArrayField(obj.api_routes, 'api_routes', requirementId, errors)
  validateArrayField(obj.ui_components, 'ui_components', requirementId, errors)
  validateArrayField(obj.jobs, 'jobs', requirementId, errors)
  validateArrayField(obj.tests, 'tests', requirementId, errors)
  validateArrayField(obj.docs, 'docs', requirementId, errors)

  if (!isNonEmptyString(obj.owner)) {
    errors.push(`${requirementId}: owner is required`)
  }
  if (!isValidEta(obj.eta)) {
    errors.push(`${requirementId}: eta is required`)
  }
  if (!isNonEmptyString(obj.risk)) {
    errors.push(`${requirementId}: risk is required`)
  }

  return true
}

function main(): void {
  const tracePathArg = process.argv[2] ?? 'docs/trace-matrix-2026.yaml'
  const tracePath = path.resolve(tracePathArg)
  const errors: string[] = []

  if (!fs.existsSync(tracePath)) {
    console.error(`Trace matrix file not found: ${tracePath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(tracePath, 'utf8')
  const parsed = yaml.load(raw) as TraceMatrix | undefined
  if (!parsed || typeof parsed !== 'object') {
    console.error('Trace matrix is not valid YAML object')
    process.exit(1)
  }

  if (!Array.isArray(parsed.requirements)) {
    console.error('Trace matrix must contain a requirements array')
    process.exit(1)
  }

  const seen = new Set<string>()
  for (const req of parsed.requirements) {
    if (!validateRequirement(req, errors)) {
      continue
    }

    if (seen.has(req.requirement_id)) {
      errors.push(`${req.requirement_id}: duplicate requirement_id`)
    }
    seen.add(req.requirement_id)
  }

  for (const expectedId of EXPECTED_REQUIREMENT_IDS) {
    if (!seen.has(expectedId)) {
      errors.push(`Missing required requirement_id: ${expectedId}`)
    }
  }

  for (const actualId of seen) {
    if (!EXPECTED_REQUIREMENT_IDS.includes(actualId)) {
      errors.push(`Unexpected requirement_id in trace matrix: ${actualId}`)
    }
  }

  if (errors.length > 0) {
    console.error('Trace matrix validation failed:')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log(
    `Trace matrix validation passed: ${parsed.requirements.length} requirements, ` +
      `${EXPECTED_REQUIREMENT_IDS.length} expected IDs fully mapped.`
  )
}

main()
