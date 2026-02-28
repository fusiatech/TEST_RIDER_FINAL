import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

describe('Provider Verification', () => {
  it('ensures required contract paths exist in OpenAPI', () => {
    const openApiPath = path.join(process.cwd(), 'docs', 'openapi.yaml')
    const content = fs.readFileSync(openApiPath, 'utf8')
    const parsed = yaml.load(content) as { paths?: Record<string, unknown> }
    const paths = parsed.paths ?? {}

    expect(paths['/api/health']).toBeDefined()
    expect(paths['/api/sessions']).toBeDefined()
    expect(paths['/api/projects']).toBeDefined()
    expect(paths['/api/billing/checkout-session']).toBeDefined()
    expect(paths['/api/integrations/github/connect']).toBeDefined()
  })
})
