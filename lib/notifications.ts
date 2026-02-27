import { z } from 'zod'

export const NotificationType = z.enum(['info', 'success', 'warning', 'error'])
export type NotificationType = z.infer<typeof NotificationType>

export const NotificationEvent = z.enum([
  'job_started',
  'job_completed',
  'job_failed',
  'ticket_assigned',
  'ticket_status_changed',
  'pr_created',
  'pr_merged',
  'test_failed',
  'coverage_dropped',
  'pipeline_started',
  'pipeline_completed',
  'security_alert',
  'approval_request',
  'approval_decision',
  'prd_approved',
  'error_threshold_reached',
])
export type NotificationEvent = z.infer<typeof NotificationEvent>

export const NotificationChannel = z.enum(['in_app', 'email', 'webhook'])
export type NotificationChannel = z.infer<typeof NotificationChannel>

export const DigestMode = z.enum(['none', 'hourly', 'daily'])
export type DigestMode = z.infer<typeof DigestMode>

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationType,
  title: z.string(),
  message: z.string(),
  timestamp: z.number(),
  read: z.boolean(),
  event: NotificationEvent.optional(),
  link: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  userId: z.string().optional(),
  channels: z.array(NotificationChannel).optional(),
  digestBatch: z.string().optional(),
})
export type Notification = z.infer<typeof NotificationSchema>

export const EventChannelPreferenceSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  webhook: z.boolean(),
})
export type EventChannelPreference = z.infer<typeof EventChannelPreferenceSchema>

export const NotificationPreferencesSchema = z.object({
  userId: z.string(),
  enabled: z.boolean(),
  sound: z.boolean(),
  desktop: z.boolean(),
  digestMode: DigestMode,
  emailAddress: z.string().email().optional(),
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
  events: z.record(NotificationEvent, EventChannelPreferenceSchema).optional(),
})
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>

export const DEFAULT_EVENT_CHANNEL_PREFERENCE: EventChannelPreference = {
  inApp: true,
  email: false,
  webhook: false,
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  userId: '',
  enabled: true,
  sound: false,
  desktop: false,
  digestMode: 'none',
}

export const NotificationTemplateSchema = z.object({
  id: z.string(),
  event: NotificationEvent,
  subject: z.string(),
  htmlTemplate: z.string(),
  textTemplate: z.string(),
  variables: z.array(z.string()),
})
export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  approval_request: {
    id: 'approval_request',
    event: 'approval_request',
    subject: 'Approval Required: {{ticketTitle}}',
    htmlTemplate: `
      <h2>Approval Request</h2>
      <p>A new item requires your approval:</p>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong>{{ticketTitle}}</strong>
        <p>{{ticketDescription}}</p>
        <p><strong>Requested by:</strong> {{requestedBy}}</p>
        <p><strong>Priority:</strong> {{priority}}</p>
      </div>
      <a href="{{approvalLink}}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Review Now</a>
    `,
    textTemplate: `Approval Request

A new item requires your approval:

Title: {{ticketTitle}}
Description: {{ticketDescription}}
Requested by: {{requestedBy}}
Priority: {{priority}}

Review at: {{approvalLink}}`,
    variables: ['ticketTitle', 'ticketDescription', 'requestedBy', 'priority', 'approvalLink'],
  },
  approval_decision: {
    id: 'approval_decision',
    event: 'approval_decision',
    subject: '{{decision}}: {{ticketTitle}}',
    htmlTemplate: `
      <h2>Approval {{decision}}</h2>
      <p>Your request has been <strong>{{decision}}</strong>:</p>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong>{{ticketTitle}}</strong>
        <p><strong>Decided by:</strong> {{decidedBy}}</p>
        <p><strong>Comment:</strong> {{comment}}</p>
      </div>
      <a href="{{ticketLink}}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Details</a>
    `,
    textTemplate: `Approval {{decision}}

Your request has been {{decision}}:

Title: {{ticketTitle}}
Decided by: {{decidedBy}}
Comment: {{comment}}

View at: {{ticketLink}}`,
    variables: ['decision', 'ticketTitle', 'decidedBy', 'comment', 'ticketLink'],
  },
  ticket_assigned: {
    id: 'ticket_assigned',
    event: 'ticket_assigned',
    subject: 'Ticket Assigned: {{ticketTitle}}',
    htmlTemplate: `
      <h2>New Ticket Assignment</h2>
      <p>You have been assigned a new ticket:</p>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong>{{ticketTitle}}</strong>
        <p>{{ticketDescription}}</p>
        <p><strong>Complexity:</strong> {{complexity}}</p>
        <p><strong>Priority:</strong> {{priority}}</p>
      </div>
      <a href="{{ticketLink}}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Ticket</a>
    `,
    textTemplate: `New Ticket Assignment

You have been assigned a new ticket:

Title: {{ticketTitle}}
Description: {{ticketDescription}}
Complexity: {{complexity}}
Priority: {{priority}}

View at: {{ticketLink}}`,
    variables: ['ticketTitle', 'ticketDescription', 'complexity', 'priority', 'ticketLink'],
  },
  ticket_status_changed: {
    id: 'ticket_status_changed',
    event: 'ticket_status_changed',
    subject: 'Status Update: {{ticketTitle}} → {{newStatus}}',
    htmlTemplate: `
      <h2>Ticket Status Changed</h2>
      <p>A ticket you're watching has been updated:</p>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong>{{ticketTitle}}</strong>
        <p><strong>Previous Status:</strong> {{oldStatus}}</p>
        <p><strong>New Status:</strong> {{newStatus}}</p>
        <p><strong>Changed by:</strong> {{changedBy}}</p>
      </div>
      <a href="{{ticketLink}}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Ticket</a>
    `,
    textTemplate: `Ticket Status Changed

A ticket you're watching has been updated:

Title: {{ticketTitle}}
Previous Status: {{oldStatus}}
New Status: {{newStatus}}
Changed by: {{changedBy}}

View at: {{ticketLink}}`,
    variables: ['ticketTitle', 'oldStatus', 'newStatus', 'changedBy', 'ticketLink'],
  },
  prd_approved: {
    id: 'prd_approved',
    event: 'prd_approved',
    subject: 'PRD Approved: {{projectName}}',
    htmlTemplate: `
      <h2>PRD Approved</h2>
      <p>The PRD for your project has been approved:</p>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong>{{projectName}}</strong>
        <p><strong>Approved by:</strong> {{approvedBy}}</p>
        <p><strong>Version:</strong> {{version}}</p>
      </div>
      <p>You can now proceed with implementation.</p>
      <a href="{{projectLink}}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Project</a>
    `,
    textTemplate: `PRD Approved

The PRD for your project has been approved:

Project: {{projectName}}
Approved by: {{approvedBy}}
Version: {{version}}

You can now proceed with implementation.

View at: {{projectLink}}`,
    variables: ['projectName', 'approvedBy', 'version', 'projectLink'],
  },
  error_threshold_reached: {
    id: 'error_threshold_reached',
    event: 'error_threshold_reached',
    subject: 'Alert: Error Threshold Reached',
    htmlTemplate: `
      <h2 style="color: #ef4444;">Error Threshold Alert</h2>
      <p>The error threshold has been exceeded:</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Error Count:</strong> {{errorCount}}</p>
        <p><strong>Threshold:</strong> {{threshold}}</p>
        <p><strong>Time Window:</strong> {{timeWindow}}</p>
        <p><strong>Most Recent Error:</strong> {{recentError}}</p>
      </div>
      <p>Immediate attention may be required.</p>
      <a href="{{dashboardLink}}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Dashboard</a>
    `,
    textTemplate: `Error Threshold Alert

The error threshold has been exceeded:

Error Count: {{errorCount}}
Threshold: {{threshold}}
Time Window: {{timeWindow}}
Most Recent Error: {{recentError}}

Immediate attention may be required.

View at: {{dashboardLink}}`,
    variables: ['errorCount', 'threshold', 'timeWindow', 'recentError', 'dashboardLink'],
  },
}

export const DigestNotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  notifications: z.array(NotificationSchema),
  period: DigestMode,
  startTime: z.number(),
  endTime: z.number(),
  sentAt: z.number().optional(),
})
export type DigestNotification = z.infer<typeof DigestNotificationSchema>

export const QueuedNotificationSchema = z.object({
  id: z.string(),
  notification: NotificationSchema,
  channels: z.array(NotificationChannel),
  userId: z.string(),
  createdAt: z.number(),
  processedAt: z.number().optional(),
  status: z.enum(['pending', 'processing', 'sent', 'failed']),
  error: z.string().optional(),
  retryCount: z.number(),
})
export type QueuedNotification = z.infer<typeof QueuedNotificationSchema>

export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '')
}

export function createNotification(
  type: NotificationType,
  title: string,
  message: string,
  options?: {
    event?: NotificationEvent
    link?: string
    metadata?: Record<string, unknown>
  }
): Notification {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    message,
    timestamp: Date.now(),
    read: false,
    ...options,
  }
}

export function createJobNotification(
  event: 'job_started' | 'job_completed' | 'job_failed',
  jobId: string,
  prompt: string,
  error?: string
): Notification {
  const truncatedPrompt = prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt

  switch (event) {
    case 'job_started':
      return createNotification('info', 'Job Started', `Processing: ${truncatedPrompt}`, {
        event,
        metadata: { jobId },
      })
    case 'job_completed':
      return createNotification('success', 'Job Completed', `Finished: ${truncatedPrompt}`, {
        event,
        metadata: { jobId },
      })
    case 'job_failed':
      return createNotification('error', 'Job Failed', error ?? `Failed: ${truncatedPrompt}`, {
        event,
        metadata: { jobId, error },
      })
  }
}

export function createPipelineNotification(
  event: 'pipeline_started' | 'pipeline_completed',
  confidence?: number
): Notification {
  if (event === 'pipeline_started') {
    return createNotification('info', 'Pipeline Started', 'Swarm pipeline is running...', {
      event,
    })
  }
  return createNotification(
    confidence && confidence >= 80 ? 'success' : 'warning',
    'Pipeline Completed',
    `Finished with ${confidence ?? 0}% confidence`,
    {
      event,
      metadata: { confidence },
    }
  )
}

export function createTicketNotification(
  event: 'ticket_assigned' | 'ticket_status_changed',
  ticketId: string,
  ticketTitle: string,
  status?: string
): Notification {
  if (event === 'ticket_assigned') {
    return createNotification('info', 'Ticket Assigned', `You've been assigned: ${ticketTitle}`, {
      event,
      metadata: { ticketId },
    })
  }
  return createNotification('info', 'Ticket Updated', `${ticketTitle} is now ${status}`, {
    event,
    metadata: { ticketId, status },
  })
}

export function createPRNotification(
  event: 'pr_created' | 'pr_merged',
  prUrl: string,
  title: string
): Notification {
  if (event === 'pr_created') {
    return createNotification('success', 'PR Created', title, {
      event,
      link: prUrl,
      metadata: { prUrl },
    })
  }
  return createNotification('success', 'PR Merged', title, {
    event,
    link: prUrl,
    metadata: { prUrl },
  })
}

export function createTestNotification(
  event: 'test_failed' | 'coverage_dropped',
  details: string,
  metadata?: Record<string, unknown>
): Notification {
  if (event === 'test_failed') {
    return createNotification('error', 'Tests Failed', details, {
      event,
      metadata,
    })
  }
  return createNotification('warning', 'Coverage Dropped', details, {
    event,
    metadata,
  })
}

export function createSecurityNotification(
  severity: 'warning' | 'error',
  message: string,
  metadata?: Record<string, unknown>
): Notification {
  return createNotification(severity, 'Security Alert', message, {
    event: 'security_alert',
    metadata,
  })
}

export function createApprovalRequestNotification(
  ticketId: string,
  ticketTitle: string,
  requestedBy: string
): Notification {
  return createNotification('info', 'Approval Required', `${ticketTitle} requires your approval`, {
    event: 'approval_request',
    link: `/projects?ticket=${ticketId}`,
    metadata: { ticketId, ticketTitle, requestedBy },
  })
}

export function createApprovalDecisionNotification(
  ticketId: string,
  ticketTitle: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  comment?: string
): Notification {
  const type = decision === 'approved' ? 'success' : 'warning'
  return createNotification(
    type,
    `Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
    `${ticketTitle} has been ${decision}`,
    {
      event: 'approval_decision',
      link: `/projects?ticket=${ticketId}`,
      metadata: { ticketId, ticketTitle, decision, decidedBy, comment },
    }
  )
}

export function createPRDApprovedNotification(
  projectId: string,
  projectName: string,
  approvedBy: string,
  version: number
): Notification {
  return createNotification('success', 'PRD Approved', `PRD for ${projectName} has been approved`, {
    event: 'prd_approved',
    link: `/projects/${projectId}`,
    metadata: { projectId, projectName, approvedBy, version },
  })
}

export function createErrorThresholdNotification(
  errorCount: number,
  threshold: number,
  timeWindow: string,
  recentError: string
): Notification {
  return createNotification(
    'error',
    'Error Threshold Reached',
    `${errorCount} errors in the last ${timeWindow}`,
    {
      event: 'error_threshold_reached',
      link: '/dashboard',
      metadata: { errorCount, threshold, timeWindow, recentError },
    }
  )
}

export function getDefaultEventPreferences(): Record<NotificationEvent, EventChannelPreference> {
  const events = NotificationEvent.options
  const preferences: Record<string, EventChannelPreference> = {}
  for (const event of events) {
    preferences[event] = { ...DEFAULT_EVENT_CHANNEL_PREFERENCE }
  }
  return preferences as Record<NotificationEvent, EventChannelPreference>
}

export function shouldNotifyChannel(
  preferences: NotificationPreferences,
  event: NotificationEvent,
  channel: NotificationChannel
): boolean {
  if (!preferences.enabled) return false
  
  const eventPrefs = preferences.events?.[event]
  if (!eventPrefs) {
    return channel === 'in_app'
  }
  
  switch (channel) {
    case 'in_app':
      return eventPrefs.inApp
    case 'email':
      return eventPrefs.email && !!preferences.emailAddress
    case 'webhook':
      return eventPrefs.webhook && !!preferences.webhookUrl
    default:
      return false
  }
}

export function getChannelsForEvent(
  preferences: NotificationPreferences,
  event: NotificationEvent
): NotificationChannel[] {
  const channels: NotificationChannel[] = []
  
  if (shouldNotifyChannel(preferences, event, 'in_app')) {
    channels.push('in_app')
  }
  if (shouldNotifyChannel(preferences, event, 'email')) {
    channels.push('email')
  }
  if (shouldNotifyChannel(preferences, event, 'webhook')) {
    channels.push('webhook')
  }
  
  return channels
}
