import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

describe('api inventory report script', () => {
  it('generates JSON and markdown report files', () => {
    execFileSync('node', ['scripts/report-api-inventory.mjs'], {
      cwd: process.cwd(),
      stdio: 'pipe',
    })

    const jsonPath = path.join(process.cwd(), 'docs/backend-contracts/reports/api-inventory.json')
    const mdPath = path.join(process.cwd(), 'docs/backend-contracts/reports/api-inventory.md')

    expect(fs.existsSync(jsonPath)).toBe(true)
    expect(fs.existsSync(mdPath)).toBe(true)

    const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      apiRouteCount: number
      openApiPathCount: number
      missingInOpenApiCount: number
    }

    expect(report.apiRouteCount).toBeGreaterThan(0)
    expect(report.openApiPathCount).toBeGreaterThan(0)
    expect(report.missingInOpenApiCount).toBeGreaterThanOrEqual(0)
  })
})
