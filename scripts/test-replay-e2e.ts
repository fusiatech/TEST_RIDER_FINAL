import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRunReplay, appendRunEvent, setRunStatus, buildReproBundle } from '@/server/replay'
import { DEFAULT_SETTINGS } from '@/lib/types'
import { getReplayRun, updateReplayRun } from '@/server/storage'

async function main() {
  const runId = `test-replay-${randomUUID()}`
  const evidenceId = `evidence-${randomUUID()}`

  await createRunReplay({
    runId,
    sessionId: 'session-test',
    prompt: 'Known deterministic run prompt',
    mode: 'swarm',
    settingsSnapshot: DEFAULT_SETTINGS,
  })

  await appendRunEvent(runId, 'job-status', { status: 'running', progress: 10 }, 1000)
  await appendRunEvent(runId, 'agent-status', { agentId: 'researcher-1', status: 'running' }, 1100)
  await appendRunEvent(runId, 'agent-output', { agentId: 'researcher-1', data: 'finding A' }, 1200)
  await appendRunEvent(runId, 'check', { validationPassed: true, confidence: 92 }, 1300)
  await updateReplayRun(runId, { evidenceId })
  await appendRunEvent(runId, 'run-completed', {
    resultSummary: { confidence: 92, validationPassed: true },
    evidence: {
      diffSummary: '1 file changed, 5 insertions(+)',
      filePaths: ['server/job-queue.ts'],
      cliExcerpts: { 'researcher-1': 'finding A' },
    },
  }, 1400)
  await setRunStatus(runId, 'completed', 1500)

  const run = await getReplayRun(runId)
  assert.ok(run, 'run should exist')

  const bundle = buildReproBundle(run!)
  assert.equal(bundle.summary.status, 'completed')
  const checkpointTypes = bundle.checkpoints.map((c) => c.type)
  assert.ok(checkpointTypes.includes('job-status'))
  assert.ok(checkpointTypes.includes('check'))
  assert.ok(checkpointTypes.includes('run-completed'))
  assert.ok(checkpointTypes.indexOf('check') < checkpointTypes.indexOf('run-completed'))
  assert.deepEqual(bundle.diffMetadata.changedFiles, ['server/job-queue.ts'])

  console.log('replay e2e passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
