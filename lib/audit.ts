import { auth } from '@/auth'
import { logAuditEntry } from '@/server/storage'
import type { AuditAction, AuditLogEntry } from '@/lib/types'
import { headers } from 'next/headers'

export async function createAuditEntry(
  action: AuditAction,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const session = await auth()
    const headersList = await headers()
    
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      userId: session?.user?.id ?? 'anonymous',
      userEmail: session?.user?.email ?? 'anonymous',
      action,
      resourceType,
      resourceId,
      details,
      ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
      userAgent: headersList.get('user-agent') ?? undefined,
    }
    
    await logAuditEntry(entry)
  } catch (err) {
    console.error('[audit] Failed to create audit entry:', err)
  }
}

export async function auditProjectCreate(projectId: string, projectName: string): Promise<void> {
  await createAuditEntry('project_create', 'project', projectId, { name: projectName })
}

export async function auditProjectUpdate(projectId: string, changes: Record<string, unknown>): Promise<void> {
  await createAuditEntry('project_update', 'project', projectId, changes)
}

export async function auditProjectDelete(projectId: string, projectName: string): Promise<void> {
  await createAuditEntry('project_delete', 'project', projectId, { name: projectName })
}

export async function auditTicketCreate(ticketId: string, projectId: string, title: string): Promise<void> {
  await createAuditEntry('ticket_create', 'ticket', ticketId, { projectId, title })
}

export async function auditTicketUpdate(ticketId: string, changes: Record<string, unknown>): Promise<void> {
  await createAuditEntry('ticket_update', 'ticket', ticketId, changes)
}

export async function auditTicketDelete(ticketId: string, projectId: string): Promise<void> {
  await createAuditEntry('ticket_delete', 'ticket', ticketId, { projectId })
}

export async function auditTicketApprove(ticketId: string, comment?: string): Promise<void> {
  await createAuditEntry('ticket_approve', 'ticket', ticketId, { comment })
}

export async function auditTicketReject(ticketId: string, comment?: string): Promise<void> {
  await createAuditEntry('ticket_reject', 'ticket', ticketId, { comment })
}

export async function auditJobStart(jobId: string, prompt: string, mode: string): Promise<void> {
  await createAuditEntry('job_start', 'job', jobId, { prompt: prompt.slice(0, 200), mode })
}

export async function auditJobPause(jobId: string, reason?: string): Promise<void> {
  await createAuditEntry('job_pause', 'job', jobId, reason ? { reason } : undefined)
}

export async function auditJobResume(jobId: string): Promise<void> {
  await createAuditEntry('job_resume', 'job', jobId)
}

export async function auditJobCancel(jobId: string): Promise<void> {
  await createAuditEntry('job_cancel', 'job', jobId)
}

export async function auditJobComplete(jobId: string, confidence?: number): Promise<void> {
  await createAuditEntry('job_complete', 'job', jobId, { confidence })
}

export async function auditJobFail(jobId: string, error: string): Promise<void> {
  await createAuditEntry('job_fail', 'job', jobId, { error: error.slice(0, 500) })
}

export async function auditSettingsUpdate(changes: Record<string, unknown>): Promise<void> {
  await createAuditEntry('settings_update', 'settings', undefined, changes)
}

export async function auditApiKeyRotate(keyName: string): Promise<void> {
  await createAuditEntry('api_key_rotate', 'api_key', keyName)
}

export async function auditExtensionInstall(extensionId: string, name: string): Promise<void> {
  await createAuditEntry('extension_install', 'extension', extensionId, { name })
}

export async function auditExtensionUninstall(extensionId: string, name: string): Promise<void> {
  await createAuditEntry('extension_uninstall', 'extension', extensionId, { name })
}

export async function auditFileCreate(filePath: string): Promise<void> {
  await createAuditEntry('file_create', 'file', undefined, { path: filePath })
}

export async function auditFileUpdate(filePath: string): Promise<void> {
  await createAuditEntry('file_update', 'file', undefined, { path: filePath })
}

export async function auditFileDelete(filePath: string): Promise<void> {
  await createAuditEntry('file_delete', 'file', undefined, { path: filePath })
}

export async function auditGitCommit(commitHash: string, message: string): Promise<void> {
  await createAuditEntry('git_commit', 'git', commitHash, { message: message.slice(0, 200) })
}

export async function auditGitPush(branch: string, commits: number): Promise<void> {
  await createAuditEntry('git_push', 'git', branch, { commits })
}

export async function auditGitPull(branch: string): Promise<void> {
  await createAuditEntry('git_pull', 'git', branch)
}

export async function auditUserLogin(userId: string, email: string, provider: string): Promise<void> {
  await createAuditEntry('user_login', 'user', userId, { email, provider })
}

export async function auditUserRegister(userId: string, email: string): Promise<void> {
  await createAuditEntry('user_register', 'user', userId, { email })
}

export async function auditUserLogout(userId: string, email: string): Promise<void> {
  await createAuditEntry('user_logout', 'user', userId, { email })
}

export async function auditEmergencyStop(reason?: string): Promise<void> {
  await createAuditEntry('emergency_stop', 'system', 'global', reason ? { reason } : undefined)
}

export async function auditIntegrationConnect(provider: string, details?: Record<string, unknown>): Promise<void> {
  await createAuditEntry('integration_connect', 'integration', provider, details)
}

export async function auditIntegrationDisconnect(provider: string, details?: Record<string, unknown>): Promise<void> {
  await createAuditEntry('integration_disconnect', 'integration', provider, details)
}

export async function auditIntegrationSecretRotate(provider: string, details?: Record<string, unknown>): Promise<void> {
  await createAuditEntry('integration_secret_rotate', 'integration', provider, details)
}

export async function auditBillingCheckout(details?: Record<string, unknown>): Promise<void> {
  await createAuditEntry('billing_checkout', 'billing', undefined, details)
}

export async function auditBillingPortal(details?: Record<string, unknown>): Promise<void> {
  await createAuditEntry('billing_portal', 'billing', undefined, details)
}

export async function auditBillingWebhook(details?: Record<string, unknown>): Promise<void> {
  await createAuditEntry('billing_webhook', 'billing', undefined, details)
}
