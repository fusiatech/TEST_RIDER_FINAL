import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import type { Session, Settings, Project, SwarmJob, ScheduledTask, EvidenceLedgerEntry, TestRunSummary, ApiKeys, User, Workspace, AuditLogEntry, AuditLogFilter, Prompt, PromptVersion, Tenant, PersistedTerminalSession, TicketTemplate } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'
import type { Extension, ExtensionConfig } from '@/lib/extensions'
import path from 'node:path'
import { encrypt, decrypt, isEncrypted, getEncryptionSecret } from '@/lib/encryption'
import { createLogger } from '@/server/logger'

const logger = createLogger('storage')

interface DbSchema {
  sessions: Session[]
  settings: Settings
  projects: Project[]
  jobs: SwarmJob[]
  scheduledTasks: ScheduledTask[]
  evidence: EvidenceLedgerEntry[]
  testRuns: TestRunSummary[]
  extensions: Extension[]
  extensionConfigs: ExtensionConfig[]
  users: User[]
  workspaces: Workspace[]
  auditLog: AuditLogEntry[]
  prompts: Prompt[]
  tenants: Tenant[]
  terminalSessions: PersistedTerminalSession[]
  ticketTemplates: TicketTemplate[]
}

const DEFAULT_DATA: DbSchema = {
  sessions: [],
  settings: DEFAULT_SETTINGS,
  projects: [],
  jobs: [],
  scheduledTasks: [],
  evidence: [],
  testRuns: [],
  extensions: [],
  extensionConfigs: [],
  users: [],
  workspaces: [],
  auditLog: [],
  prompts: [],
  tenants: [],
  terminalSessions: [],
  ticketTemplates: [],
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
    if (!db.data.extensions) db.data.extensions = []
    if (!db.data.extensionConfigs) db.data.extensionConfigs = []
    if (!db.data.users) db.data.users = []
    if (!db.data.auditLog) db.data.auditLog = []
    if (!db.data.prompts) db.data.prompts = []
    if (!db.data.tenants) db.data.tenants = []
    if (!db.data.terminalSessions) db.data.terminalSessions = []
    if (!db.data.ticketTemplates) db.data.ticketTemplates = []

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

/**
 * Encrypt all API key values in an ApiKeys object
 */
export function encryptApiKeys(apiKeys: ApiKeys | undefined): ApiKeys | undefined {
  if (!apiKeys) return apiKeys
  
  const secret = getEncryptionSecret()
  const encrypted: ApiKeys = {}
  
  for (const [key, value] of Object.entries(apiKeys)) {
    if (value && !isEncrypted(value)) {
      encrypted[key as keyof ApiKeys] = encrypt(value, secret)
    } else {
      encrypted[key as keyof ApiKeys] = value
    }
  }
  
  return encrypted
}

/**
 * Decrypt all API key values in an ApiKeys object
 */
export function decryptApiKeys(apiKeys: ApiKeys | undefined): ApiKeys | undefined {
  if (!apiKeys) return apiKeys
  
  const secret = getEncryptionSecret()
  const decrypted: ApiKeys = {}
  
  for (const [key, value] of Object.entries(apiKeys)) {
    if (value && isEncrypted(value)) {
      try {
        decrypted[key as keyof ApiKeys] = decrypt(value, secret)
      } catch (err) {
        logger.error('Failed to decrypt API key', { key, error: err instanceof Error ? err.message : String(err) })
        decrypted[key as keyof ApiKeys] = value
      }
    } else {
      decrypted[key as keyof ApiKeys] = value
    }
  }
  
  return decrypted
}

/**
 * Migrate plain-text API keys to encrypted format
 */
async function migrateApiKeysIfNeeded(db: Low<DbSchema>): Promise<boolean> {
  const apiKeys = db.data.settings.apiKeys
  if (!apiKeys) return false
  
  let needsMigration = false
  for (const value of Object.values(apiKeys)) {
    if (value && !isEncrypted(value)) {
      needsMigration = true
      break
    }
  }
  
  if (needsMigration) {
    logger.info('Migrating plain-text API keys to encrypted format')
    db.data.settings.apiKeys = encryptApiKeys(apiKeys)
    await db.write()
    logger.info('API key migration complete')
    return true
  }
  
  return false
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb()
  
  await migrateApiKeysIfNeeded(db)
  
  const settings = { ...db.data.settings }
  settings.apiKeys = decryptApiKeys(settings.apiKeys)
  
  return settings
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDb()
  
  const settingsToSave = { ...settings }
  settingsToSave.apiKeys = encryptApiKeys(settings.apiKeys)
  
  db.data.settings = settingsToSave
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
    fileSnapshots: update.fileSnapshots ?? existing.fileSnapshots,
    testResults: update.testResults ?? existing.testResults,
    screenshots: update.screenshots ?? existing.screenshots,
  }
  db.data.evidence[idx] = merged
  await db.write()
  return merged
}

/* ── Test Runs ─────────────────────────────────────────────────────── */

export async function getTestRuns(): Promise<TestRunSummary[]> {
  const db = await getDb()
  return db.data.testRuns
}

export async function getTestRun(id: string): Promise<TestRunSummary | undefined> {
  const db = await getDb()
  return db.data.testRuns.find((t) => t.id === id)
}

export async function saveTestRun(testRun: TestRunSummary): Promise<void> {
  const db = await getDb()
  const idx = db.data.testRuns.findIndex((t) => t.id === testRun.id)
  if (idx >= 0) {
    db.data.testRuns[idx] = testRun
  } else {
    db.data.testRuns.push(testRun)
  }
  await db.write()
}

export async function deleteTestRun(id: string): Promise<void> {
  const db = await getDb()
  db.data.testRuns = db.data.testRuns.filter((t) => t.id !== id)
  await db.write()
}

export async function clearOldTestRuns(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDb()
  const cutoff = Date.now() - maxAgeMs
  const before = db.data.testRuns.length
  db.data.testRuns = db.data.testRuns.filter((t) => t.timestamp > cutoff)
  const cleared = before - db.data.testRuns.length
  if (cleared > 0) {
    await db.write()
  }
  return cleared
}

/* ── Extensions ─────────────────────────────────────────────────────── */

export async function getExtensions(): Promise<Extension[]> {
  const db = await getDb()
  return db.data.extensions
}

export async function getExtension(id: string): Promise<Extension | undefined> {
  const db = await getDb()
  return db.data.extensions.find((e) => e.id === id)
}

export async function saveExtension(extension: Extension): Promise<void> {
  const db = await getDb()
  const idx = db.data.extensions.findIndex((e) => e.id === extension.id)
  if (idx >= 0) {
    db.data.extensions[idx] = extension
  } else {
    db.data.extensions.push(extension)
  }
  await db.write()
}

export async function deleteExtension(id: string): Promise<void> {
  const db = await getDb()
  db.data.extensions = db.data.extensions.filter((e) => e.id !== id)
  db.data.extensionConfigs = db.data.extensionConfigs.filter((c) => c.extensionId !== id)
  await db.write()
}

export async function getExtensionConfigs(): Promise<ExtensionConfig[]> {
  const db = await getDb()
  return db.data.extensionConfigs
}

export async function getExtensionConfig(extensionId: string): Promise<ExtensionConfig | undefined> {
  const db = await getDb()
  return db.data.extensionConfigs.find((c) => c.extensionId === extensionId)
}

export async function saveExtensionConfig(config: ExtensionConfig): Promise<void> {
  const db = await getDb()
  const idx = db.data.extensionConfigs.findIndex((c) => c.extensionId === config.extensionId)
  if (idx >= 0) {
    db.data.extensionConfigs[idx] = config
  } else {
    db.data.extensionConfigs.push(config)
  }
  await db.write()
}

export async function deleteExtensionConfig(extensionId: string): Promise<void> {
  const db = await getDb()
  db.data.extensionConfigs = db.data.extensionConfigs.filter((c) => c.extensionId !== extensionId)
  await db.write()
}

/* ── Users (RBAC) ─────────────────────────────────────────────────────── */

export async function getUsers(): Promise<User[]> {
  const db = await getDb()
  return db.data.users
}

export async function getUser(id: string): Promise<User | undefined> {
  const db = await getDb()
  return db.data.users.find((u) => u.id === id)
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb()
  return db.data.users.find((u) => u.email === email)
}

export async function saveUser(user: User): Promise<void> {
  const db = await getDb()
  const idx = db.data.users.findIndex((u) => u.id === user.id)
  if (idx >= 0) {
    db.data.users[idx] = user
  } else {
    db.data.users.push(user)
  }
  await db.write()
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDb()
  db.data.users = db.data.users.filter((u) => u.id !== id)
  await db.write()
}

export async function updateUserRole(id: string, role: User['role']): Promise<User | null> {
  const db = await getDb()
  const idx = db.data.users.findIndex((u) => u.id === id)
  if (idx < 0) return null
  
  db.data.users[idx] = {
    ...db.data.users[idx],
    role,
    updatedAt: Date.now(),
  }
  await db.write()
  return db.data.users[idx]
}

/* ── Workspaces ─────────────────────────────────────────────────────── */

export async function getWorkspaces(): Promise<Workspace[]> {
  const db = await getDb()
  if (!db.data.workspaces) {
    db.data.workspaces = []
  }
  return db.data.workspaces
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  const db = await getDb()
  if (!db.data.workspaces) {
    db.data.workspaces = []
  }
  return db.data.workspaces.find((w) => w.id === id)
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await getDb()
  if (!db.data.workspaces) {
    db.data.workspaces = []
  }
  const idx = db.data.workspaces.findIndex((w) => w.id === workspace.id)
  if (idx >= 0) {
    db.data.workspaces[idx] = workspace
  } else {
    db.data.workspaces.push(workspace)
  }
  await db.write()
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await getDb()
  if (!db.data.workspaces) {
    db.data.workspaces = []
    return
  }
  db.data.workspaces = db.data.workspaces.filter((w) => w.id !== id)
  await db.write()
}

export async function updateWorkspace(
  id: string,
  update: Partial<Omit<Workspace, 'id'>>
): Promise<Workspace | null> {
  const db = await getDb()
  if (!db.data.workspaces) {
    db.data.workspaces = []
    return null
  }
  const idx = db.data.workspaces.findIndex((w) => w.id === id)
  if (idx < 0) return null

  db.data.workspaces[idx] = {
    ...db.data.workspaces[idx],
    ...update,
  }
  await db.write()
  return db.data.workspaces[idx]
}

/* ── Audit Log (GAP-003) ─────────────────────────────────────────── */

export async function logAuditEntry(entry: AuditLogEntry): Promise<void> {
  const db = await getDb()
  if (!db.data.auditLog) {
    db.data.auditLog = []
  }
  db.data.auditLog.push(entry)
  await db.write()
}

export async function getAuditLog(filters?: AuditLogFilter): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const db = await getDb()
  if (!db.data.auditLog) {
    db.data.auditLog = []
  }
  
  let entries = [...db.data.auditLog]
  
  if (filters?.userId) {
    entries = entries.filter((e) => e.userId === filters.userId)
  }
  if (filters?.action) {
    entries = entries.filter((e) => e.action === filters.action)
  }
  if (filters?.resourceType) {
    entries = entries.filter((e) => e.resourceType === filters.resourceType)
  }
  if (filters?.startDate) {
    const start = new Date(filters.startDate).getTime()
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= start)
  }
  if (filters?.endDate) {
    const end = new Date(filters.endDate).getTime()
    entries = entries.filter((e) => new Date(e.timestamp).getTime() <= end)
  }
  
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  
  const total = entries.length
  const offset = filters?.offset ?? 0
  const limit = filters?.limit ?? 100
  
  entries = entries.slice(offset, offset + limit)
  
  return { entries, total }
}

export async function getAuditEntry(id: string): Promise<AuditLogEntry | undefined> {
  const db = await getDb()
  if (!db.data.auditLog) {
    db.data.auditLog = []
  }
  return db.data.auditLog.find((e) => e.id === id)
}

export async function clearOldAuditLogs(maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDb()
  if (!db.data.auditLog) {
    db.data.auditLog = []
    return 0
  }
  const cutoff = Date.now() - maxAgeMs
  const before = db.data.auditLog.length
  db.data.auditLog = db.data.auditLog.filter((e) => new Date(e.timestamp).getTime() > cutoff)
  const cleared = before - db.data.auditLog.length
  if (cleared > 0) {
    await db.write()
  }
  return cleared
}

/* ── Prompts (GAP-005) ─────────────────────────────────────────────── */

export async function getPrompts(): Promise<Prompt[]> {
  const db = await getDb()
  if (!db.data.prompts) {
    db.data.prompts = []
  }
  return db.data.prompts
}

export async function getPrompt(id: string): Promise<Prompt | undefined> {
  const db = await getDb()
  if (!db.data.prompts) {
    db.data.prompts = []
  }
  return db.data.prompts.find((p) => p.id === id)
}

export async function getPromptByName(name: string): Promise<Prompt | undefined> {
  const db = await getDb()
  if (!db.data.prompts) {
    db.data.prompts = []
  }
  return db.data.prompts.find((p) => p.name === name)
}

export async function savePrompt(prompt: Prompt): Promise<void> {
  const db = await getDb()
  if (!db.data.prompts) {
    db.data.prompts = []
  }
  const idx = db.data.prompts.findIndex((p) => p.id === prompt.id)
  if (idx >= 0) {
    db.data.prompts[idx] = prompt
  } else {
    db.data.prompts.push(prompt)
  }
  await db.write()
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await getDb()
  if (!db.data.prompts) {
    db.data.prompts = []
  }
  db.data.prompts = db.data.prompts.filter((p) => p.id !== id)
  await db.write()
}

export async function addPromptVersion(promptId: string, version: PromptVersion): Promise<Prompt | null> {
  const db = await getDb()
  if (!db.data.prompts) {
    db.data.prompts = []
  }
  const idx = db.data.prompts.findIndex((p) => p.id === promptId)
  if (idx < 0) return null
  
  db.data.prompts[idx].versions.forEach((v) => {
    v.isActive = false
  })
  
  db.data.prompts[idx].versions.push(version)
  db.data.prompts[idx].currentVersion = version.version
  db.data.prompts[idx].updatedAt = new Date().toISOString()
  
  await db.write()
  return db.data.prompts[idx]
}

export async function rollbackPromptVersion(promptId: string, targetVersion: number): Promise<Prompt | null> {
  const db = await getDb()
  if (!db.data.prompts) {
    db.data.prompts = []
  }
  const idx = db.data.prompts.findIndex((p) => p.id === promptId)
  if (idx < 0) return null
  
  const prompt = db.data.prompts[idx]
  const targetVersionEntry = prompt.versions.find((v) => v.version === targetVersion)
  if (!targetVersionEntry) return null
  
  prompt.versions.forEach((v) => {
    v.isActive = v.version === targetVersion
  })
  
  prompt.currentVersion = targetVersion
  prompt.updatedAt = new Date().toISOString()
  
  await db.write()
  return prompt
}

export async function getActivePromptContent(promptId: string): Promise<string | null> {
  const prompt = await getPrompt(promptId)
  if (!prompt) return null
  
  const activeVersion = prompt.versions.find((v) => v.isActive)
  return activeVersion?.content ?? null
}

/* ── Tenants (GAP-002) ─────────────────────────────────────────────── */

export async function getTenants(): Promise<Tenant[]> {
  const db = await getDb()
  if (!db.data.tenants) {
    db.data.tenants = []
  }
  return db.data.tenants
}

export async function getTenant(id: string): Promise<Tenant | undefined> {
  const db = await getDb()
  if (!db.data.tenants) {
    db.data.tenants = []
  }
  return db.data.tenants.find((t) => t.id === id)
}

export async function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
  const db = await getDb()
  if (!db.data.tenants) {
    db.data.tenants = []
  }
  return db.data.tenants.find((t) => t.slug === slug)
}

export async function createTenant(
  tenant: Omit<Tenant, 'id' | 'createdAt'>
): Promise<Tenant> {
  const db = await getDb()
  if (!db.data.tenants) {
    db.data.tenants = []
  }
  
  const existingSlug = db.data.tenants.find((t) => t.slug === tenant.slug)
  if (existingSlug) {
    throw new Error(`Tenant with slug "${tenant.slug}" already exists`)
  }
  
  const newTenant: Tenant = {
    ...tenant,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  
  db.data.tenants.push(newTenant)
  await db.write()
  return newTenant
}

export async function updateTenant(
  id: string,
  updates: Partial<Omit<Tenant, 'id' | 'createdAt'>>
): Promise<Tenant | null> {
  const db = await getDb()
  if (!db.data.tenants) {
    db.data.tenants = []
  }
  
  const idx = db.data.tenants.findIndex((t) => t.id === id)
  if (idx < 0) return null
  
  if (updates.slug) {
    const existingSlug = db.data.tenants.find(
      (t) => t.slug === updates.slug && t.id !== id
    )
    if (existingSlug) {
      throw new Error(`Tenant with slug "${updates.slug}" already exists`)
    }
  }
  
  db.data.tenants[idx] = {
    ...db.data.tenants[idx],
    ...updates,
  }
  
  await db.write()
  return db.data.tenants[idx]
}

export async function deleteTenant(id: string): Promise<boolean> {
  const db = await getDb()
  if (!db.data.tenants) {
    db.data.tenants = []
  }
  
  const idx = db.data.tenants.findIndex((t) => t.id === id)
  if (idx < 0) return false
  
  db.data.tenants.splice(idx, 1)
  await db.write()
  return true
}

export async function getTenantUsers(tenantId: string): Promise<User[]> {
  const db = await getDb()
  if (!db.data.users) {
    db.data.users = []
  }
  return db.data.users.filter((u) => u.tenantId === tenantId)
}

export async function assignUserToTenant(
  userId: string,
  tenantId: string
): Promise<User | null> {
  const db = await getDb()
  if (!db.data.users) {
    db.data.users = []
  }
  
  const userIdx = db.data.users.findIndex((u) => u.id === userId)
  if (userIdx < 0) return null
  
  const tenant = await getTenant(tenantId)
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`)
  }
  
  db.data.users[userIdx] = {
    ...db.data.users[userIdx],
    tenantId,
    updatedAt: Date.now(),
  }
  
  await db.write()
  return db.data.users[userIdx]
}

export async function removeUserFromTenant(userId: string): Promise<User | null> {
  const db = await getDb()
  if (!db.data.users) {
    db.data.users = []
  }
  
  const userIdx = db.data.users.findIndex((u) => u.id === userId)
  if (userIdx < 0) return null
  
  const { tenantId, ...userWithoutTenant } = db.data.users[userIdx]
  db.data.users[userIdx] = {
    ...userWithoutTenant,
    updatedAt: Date.now(),
  }
  
  await db.write()
  return db.data.users[userIdx]
}

/* ── Terminal Sessions (IDE-002) ─────────────────────────────────── */

export async function getTerminalSessions(): Promise<PersistedTerminalSession[]> {
  const db = await getDb()
  if (!db.data.terminalSessions) {
    db.data.terminalSessions = []
  }
  return db.data.terminalSessions
}

export async function getTerminalSessionById(id: string): Promise<PersistedTerminalSession | undefined> {
  const db = await getDb()
  if (!db.data.terminalSessions) {
    db.data.terminalSessions = []
  }
  return db.data.terminalSessions.find((t) => t.id === id)
}

export async function saveTerminalSession(session: PersistedTerminalSession): Promise<void> {
  const db = await getDb()
  if (!db.data.terminalSessions) {
    db.data.terminalSessions = []
  }
  const idx = db.data.terminalSessions.findIndex((t) => t.id === session.id)
  if (idx >= 0) {
    db.data.terminalSessions[idx] = session
  } else {
    db.data.terminalSessions.push(session)
  }
  await db.write()
}

export async function updateTerminalSession(
  id: string,
  update: Partial<Omit<PersistedTerminalSession, 'id' | 'createdAt'>>
): Promise<PersistedTerminalSession | null> {
  const db = await getDb()
  if (!db.data.terminalSessions) {
    db.data.terminalSessions = []
  }
  const idx = db.data.terminalSessions.findIndex((t) => t.id === id)
  if (idx < 0) return null
  
  db.data.terminalSessions[idx] = {
    ...db.data.terminalSessions[idx],
    ...update,
  }
  await db.write()
  return db.data.terminalSessions[idx]
}

export async function deleteTerminalSession(id: string): Promise<void> {
  const db = await getDb()
  if (!db.data.terminalSessions) {
    db.data.terminalSessions = []
  }
  db.data.terminalSessions = db.data.terminalSessions.filter((t) => t.id !== id)
  await db.write()
}

export async function clearTerminatedTerminalSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDb()
  if (!db.data.terminalSessions) {
    db.data.terminalSessions = []
    return 0
  }
  const cutoff = Date.now() - maxAgeMs
  const before = db.data.terminalSessions.length
  db.data.terminalSessions = db.data.terminalSessions.filter(
    (t) => !t.terminated || t.lastActivityAt > cutoff
  )
  const cleared = before - db.data.terminalSessions.length
  if (cleared > 0) {
    await db.write()
  }
  return cleared
}
