import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { GET as getTests, POST as postTests } from '@/app/api/tests/route'
import { GET as getTestById, DELETE as deleteTestById } from '@/app/api/tests/[id]/route'
import type { TestRun } from '@/lib/types'

async function main() {
  const dbPath = 'db.json'
  const original = existsSync(dbPath) ? readFileSync(dbPath, 'utf-8') : null

  try {
    writeFileSync(dbPath, JSON.stringify({
      sessions: [],
      settings: {
        enabledCLIs: ['cursor'],
        parallelCounts: { researcher: 1, planner: 2, coder: 3, validator: 2, security: 1, synthesizer: 1 },
        worktreeIsolation: true,
        maxRuntimeSeconds: 120,
        researchDepth: 'medium',
        autoRerunThreshold: 80,
      },
      projects: [],
      jobs: [],
      scheduledTasks: [],
      evidence: [],
      testRuns: [],
    }))

    const runA: TestRun = {
      id: 'run-a',
      timestamp: Date.now() - 1000,
      source: 'orchestrator',
      status: 'failed',
      total: 2,
      passed: 1,
      failed: 1,
      checks: [
        { name: 'TypeScript (tsc --noEmit)', passed: true, output: 'ok' },
        { name: 'ESLint (--max-warnings 0)', passed: false, output: 'src/a.ts:12:3 bad' },
      ],
      failures: [
        { id: 'f-a', testName: 'ESLint (--max-warnings 0)', file: 'src/a.ts', line: 12, message: 'bad' },
      ],
      logs: 'logs-a',
      metadata: { mode: 'swarm' },
    }

    const runB: TestRun = {
      ...runA,
      id: 'run-b',
      timestamp: Date.now(),
      status: 'passed',
      failed: 0,
      passed: 2,
      failures: [],
      logs: 'logs-b',
    }

    const postA = await postTests(new NextRequest('http://localhost/api/tests', {
      method: 'POST',
      body: JSON.stringify(runA),
      headers: { 'content-type': 'application/json' },
    }))
    if (postA.status !== 201) throw new Error(`POST runA failed: ${postA.status}`)

    const postB = await postTests(new NextRequest('http://localhost/api/tests', {
      method: 'POST',
      body: JSON.stringify(runB),
      headers: { 'content-type': 'application/json' },
    }))
    if (postB.status !== 201) throw new Error(`POST runB failed: ${postB.status}`)

    const allRes = await getTests(new NextRequest('http://localhost/api/tests'))
    const all = await allRes.json() as TestRun[]
    if (all.length !== 2 || all[0].id !== 'run-b') throw new Error('GET all did not return expected sort order')

    const failedRes = await getTests(new NextRequest('http://localhost/api/tests?status=failed'))
    const failed = await failedRes.json() as TestRun[]
    if (failed.length !== 1 || failed[0].id !== 'run-a') throw new Error('GET status query failed')

    const sourceRes = await getTests(new NextRequest('http://localhost/api/tests?source=orchestrator&limit=1'))
    const source = await sourceRes.json() as TestRun[]
    if (source.length !== 1 || source[0].id !== 'run-b') throw new Error('GET source+limit query failed')

    const oneRes = await getTestById(new NextRequest('http://localhost/api/tests/run-a'), { params: Promise.resolve({ id: 'run-a' }) })
    if (oneRes.status !== 200) throw new Error('GET by id failed')

    const delRes = await deleteTestById(new NextRequest('http://localhost/api/tests/run-a', { method: 'DELETE' }), { params: Promise.resolve({ id: 'run-a' }) })
    if (delRes.status !== 204) throw new Error('DELETE failed')

    const missingRes = await getTestById(new NextRequest('http://localhost/api/tests/run-a'), { params: Promise.resolve({ id: 'run-a' }) })
    if (missingRes.status !== 404) throw new Error('Expected 404 after delete')

    console.log('API CRUD/query checks passed')
  } finally {
    if (original === null) {
      if (existsSync(dbPath)) unlinkSync(dbPath)
    } else {
      writeFileSync(dbPath, original)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
