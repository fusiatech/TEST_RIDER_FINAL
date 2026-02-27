import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import type { Session, Settings, Project, SwarmJob, ScheduledTask, EvidenceLedgerEntry, TestRun } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'
import path from 'node:path'

interface DbSchema {
  sessions: Session[]
  settings: Settings
  projects: Project[]
  jobs: SwarmJob[]
  scheduledTasks: ScheduledTask[]
  evidence: EvidenceLedgerEntry[]
  testRuns: TestRun[]
}

const DEFAULT_DATA: DbSchema = {
  sessions: [],
  settings: DEFAULT_SETTINGS,
  projects: [],
  jobs: [],
  scheduledTasks: [],
  evidence: [],
  testRuns: [],
}

let dbInstance: Low<DbSchema> | null = null
let dbInitPromise: Promise<Low<DbSchema>> | null = null

export async function getDb(): Promise<Low<DbSchema>> {
  if (dbInstance) return dbInstance
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    const filePath = path.join(process.cwd(), 'db.json')
    const adapter = new JSONFile<DbSchema>(filePath)
    const db = new Low<DbSchema>(adapter, DEFAULT_DATA)

    await db.read()

    db.data = { ...DEFAULT_DATA, ...db.data }
    if (!db.data.evidence) db.data.evidence = []
    if (!db.data.testRuns) db.data.testRuns = []

    dbInstance = db
    return db
  })()

  return dbInitPromise
}

export async function getSessions(): Promise<Session[]> {
  const db = await getDb()
  return db.data.sessions
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDb()
  return db.data.sessions.find((s) => s.id === id)
}

export async function saveSession(session: Session): Promise<void> {
  const db = await getDb()
  const idx = db.data.sessions.findIndex((s) => s.id === session.id)
  if (idx >= 0) {
    db.data.sessions[idx] = session
  } else {
    db.data.sessions.push(session)
  }
  await db.write()
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb()
  db.data.sessions = db.data.sessions.filter((s) => s.id !== id)
  await db.write()
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb()
  return db.data.settings
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDb()
  db.data.settings = settings
  await db.write()
}

/* ── Projects ─────────────────────────────────────────────────── */

function backfillTicketEvidenceIds(project: Project): Project {
  const tickets = project.tickets.map((t) =>
    t.evidenceIds === undefined ? { ...t, evidenceIds: [] as string[] } : t
  )
  return { ...project, tickets }
}

export async function getProjects(): Promise<Project[]> {
  const db = await getDb()
  return db.data.projects.map(backfillTicketEvidenceIds)
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDb()
  const p = db.data.projects.find((p) => p.id === id)
  return p ? backfillTicketEvidenceIds(p) : undefined
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDb()
  const idx = db.data.projects.findIndex((p) => p.id === project.id)
  if (idx >= 0) {
    db.data.projects[idx] = project
  } else {
    db.data.projects.push(project)
  }
  await db.write()
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb()
  db.data.projects = db.data.projects.filter((p) => p.id !== id)
  await db.write()
}

/* ── Jobs ─────────────────────────────────────────────────────── */

export async function getJobs(): Promise<SwarmJob[]> {
  const db = await getDb()
  return db.data.jobs
}

export async function getJob(id: string): Promise<SwarmJob | undefined> {
  const db = await getDb()
  return db.data.jobs.find((j) => j.id === id)
}

export async function saveJob(job: SwarmJob): Promise<void> {
  const db = await getDb()
  const idx = db.data.jobs.findIndex((j) => j.id === job.id)
  if (idx >= 0) {
    db.data.jobs[idx] = job
  } else {
    db.data.jobs.push(job)
  }
  await db.write()
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDb()
  db.data.jobs = db.data.jobs.filter((j) => j.id !== id)
  await db.write()
}

/* ── Scheduled Tasks ──────────────────────────────────────────── */

export async function getScheduledTasks(): Promise<ScheduledTask[]> {
  const db = await getDb()
  return db.data.scheduledTasks
}

export async function getScheduledTask(id: string): Promise<ScheduledTask | undefined> {
  const db = await getDb()
  return db.data.scheduledTasks.find((t) => t.id === id)
}

export async function saveScheduledTask(task: ScheduledTask): Promise<void> {
  const db = await getDb()
  const idx = db.data.scheduledTasks.findIndex((t) => t.id === task.id)
  if (idx >= 0) {
    db.data.scheduledTasks[idx] = task
  } else {
    db.data.scheduledTasks.push(task)
  }
  await db.write()
}

export async function deleteScheduledTask(id: string): Promise<void> {
  const db = await getDb()
  db.data.scheduledTasks = db.data.scheduledTasks.filter((t) => t.id !== id)
  await db.write()
}

/* ── Evidence Ledger (append-only) ─────────────────────────────── */

export async function createEvidence(entry: EvidenceLedgerEntry): Promise<void> {
  const db = await getDb()
  if (db.data.evidence.some((e) => e.id === entry.id)) {
    throw new Error(`Evidence ${entry.id} already exists`)
  }
  db.data.evidence.push(entry)
  await db.write()
}

export async function getEvidence(id: string): Promise<EvidenceLedgerEntry | undefined> {
  const db = await getDb()
  return db.data.evidence.find((e) => e.id === id)
}

export async function getAllEvidence(): Promise<EvidenceLedgerEntry[]> {
  const db = await getDb()
  return db.data.evidence
}

export async function updateEvidence(
  id: string,
  update: Partial<Omit<EvidenceLedgerEntry, 'id' | 'timestamp'>>
): Promise<EvidenceLedgerEntry | null> {
  const db = await getDb()
  const idx = db.data.evidence.findIndex((e) => e.id === id)
  if (idx < 0) return null
  const existing = db.data.evidence[idx]
  const merged: EvidenceLedgerEntry = {
    ...existing,
    ...update,
    id: existing.id,
    timestamp: existing.timestamp,
    cliExcerpts: update.cliExcerpts
      ? { ...existing.cliExcerpts, ...update.cliExcerpts }
      : existing.cliExcerpts,
    ticketIds: update.ticketIds
      ? [...(existing.ticketIds ?? []), ...update.ticketIds]
      : existing.ticketIds,
    filePaths: update.filePaths
      ? [...(existing.filePaths ?? []), ...update.filePaths]
      : existing.filePaths,
  }
  db.data.evidence[idx] = merged
  await db.write()
  return merged
}


/* ── Test Runs ─────────────────────────────────────────────────── */

export async function getTestRuns(): Promise<TestRun[]> {
  const db = await getDb()
  return [...db.data.testRuns].sort((a, b) => b.timestamp - a.timestamp)
}

export async function getTestRun(id: string): Promise<TestRun | undefined> {
  const db = await getDb()
  return db.data.testRuns.find((r) => r.id === id)
}

export async function saveTestRun(run: TestRun): Promise<void> {
  const db = await getDb()
  const idx = db.data.testRuns.findIndex((r) => r.id === run.id)
  if (idx >= 0) {
    db.data.testRuns[idx] = run
  } else {
    db.data.testRuns.push(run)
  }
  await db.write()
}

export async function deleteTestRun(id: string): Promise<void> {
  const db = await getDb()
  db.data.testRuns = db.data.testRuns.filter((r) => r.id !== id)
  await db.write()
}

export async function queryTestRuns(opts?: {
  source?: TestRun['source']
  status?: TestRun['status']
  limit?: number
}): Promise<TestRun[]> {
  const db = await getDb()
  let runs = [...db.data.testRuns]
  if (opts?.source) runs = runs.filter((r) => r.source === opts.source)
  if (opts?.status) runs = runs.filter((r) => r.status === opts.status)
  runs.sort((a, b) => b.timestamp - a.timestamp)
  if (opts?.limit && opts.limit > 0) runs = runs.slice(0, opts.limit)
  return runs
}
