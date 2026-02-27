import { randomUUID } from 'node:crypto'
import type { ReplayEvent, ReplayEventType, ReplayRun, Settings, SwarmJobStatus } from '@/lib/types'
import {
  appendReplayEvent,
  createReplayRun,
  getReplayRun,
  updateReplayRun,
} from '@/server/storage'

export async function createRunReplay(params: {
  runId: string
  sessionId: string
  prompt: string
  mode: 'chat' | 'swarm' | 'project'
  settingsSnapshot: Settings
  evidenceId?: string
}): Promise<ReplayRun> {
  const run: ReplayRun = {
    id: params.runId,
    sessionId: params.sessionId,
    prompt: params.prompt,
    mode: params.mode,
    status: 'queued',
    createdAt: Date.now(),
    settingsSnapshot: params.settingsSnapshot,
    evidenceId: params.evidenceId,
    events: [],
  }
  await createReplayRun(run)
  await appendRunEvent(params.runId, 'run-created', {
    sessionId: params.sessionId,
    mode: params.mode,
  })
  await appendRunEvent(params.runId, 'prompt', {
    prompt: params.prompt,
  })
  return (await getReplayRun(params.runId)) as ReplayRun
}

export async function appendRunEvent(
  runId: string,
  type: ReplayEventType,
  payload: Record<string, unknown>,
  timestamp = Date.now(),
): Promise<ReplayEvent> {
  const event: ReplayEvent = {
    id: randomUUID(),
    runId,
    timestamp,
    type,
    payload,
  }
  const updated = await appendReplayEvent(runId, event)
  if (!updated) {
    throw new Error(`Replay run ${runId} not found`)
  }
  return event
}

export async function setRunStatus(
  runId: string,
  status: SwarmJobStatus,
  completedAt?: number,
): Promise<void> {
  await updateReplayRun(runId, {
    status,
    ...(completedAt ? { completedAt } : {}),
  })
}

export interface ReproBundle {
  run: ReplayRun
  summary: {
    runId: string
    prompt: string
    mode: 'chat' | 'swarm' | 'project'
    status: SwarmJobStatus
    startedAt: number
    completedAt?: number
    durationMs?: number
    evidenceId?: string
  }
  checkpoints: Array<{
    type: ReplayEventType
    timestamp: number
    payload: Record<string, unknown>
  }>
  evidence: {
    cliExcerpts: Record<string, string>
    diffSummary?: string
    filePaths: string[]
  }
  keyFiles: string[]
  diffMetadata: {
    summary?: string
    changedFiles: string[]
  }
}

export function buildReproBundle(run: ReplayRun): ReproBundle {
  const byType = (type: ReplayEventType) => run.events.filter((e) => e.type === type)
  const checkEvents = byType('check')
  const complete = byType('run-completed').at(-1)

  const evidencePayload = (complete?.payload.evidence ?? {}) as {
    cliExcerpts?: Record<string, string>
    diffSummary?: string
    filePaths?: string[]
  }
  const keyFiles = Array.from(new Set(evidencePayload.filePaths ?? []))

  return {
    run,
    summary: {
      runId: run.id,
      prompt: run.prompt,
      mode: run.mode,
      status: run.status,
      startedAt: run.createdAt,
      completedAt: run.completedAt,
      durationMs: run.completedAt ? run.completedAt - run.createdAt : undefined,
      evidenceId: run.evidenceId,
    },
    checkpoints: [
      ...byType('run-created'),
      ...byType('prompt'),
      ...byType('job-status'),
      ...byType('agent-status'),
      ...checkEvents,
      ...byType('run-completed'),
      ...byType('run-failed'),
    ].map((e) => ({ type: e.type, timestamp: e.timestamp, payload: e.payload })),
    evidence: {
      cliExcerpts: evidencePayload.cliExcerpts ?? {},
      diffSummary: evidencePayload.diffSummary,
      filePaths: evidencePayload.filePaths ?? [],
    },
    keyFiles,
    diffMetadata: {
      summary: evidencePayload.diffSummary,
      changedFiles: keyFiles,
    },
  }
}
