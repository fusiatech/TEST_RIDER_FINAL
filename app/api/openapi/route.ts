import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

export async function GET() {
  try {
    const specPath = join(process.cwd(), 'docs', 'openapi.yaml')
    const specContent = readFileSync(specPath, 'utf-8')
    const spec = yaml.load(specContent)
    
    return NextResponse.json(spec, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Failed to load OpenAPI spec:', error)
    return NextResponse.json(
      { error: 'Failed to load OpenAPI spec' },
      { status: 500 }
    )
  }
}
