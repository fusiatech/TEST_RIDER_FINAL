import { createLogger } from '@/server/logger'
import type {
  Notification,
  NotificationPreferences,
  NotificationTemplate,
  NotificationChannel,
  DigestNotification,
  QueuedNotification,
  NotificationEvent,
} from '@/lib/notifications'
import {
  NOTIFICATION_TEMPLATES,
  renderTemplate,
  getChannelsForEvent,
  DigestMode,
} from '@/lib/notifications'
import crypto from 'node:crypto'

const logger = createLogger('notification-sender')

const notificationQueue: QueuedNotification[] = []
const digestBuckets: Map<string, Notification[]> = new Map()
const userPreferencesCache: Map<string, NotificationPreferences> = new Map()

const MAX_QUEUE_SIZE = 1000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000

export interface EmailConfig {
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPass?: string
  fromAddress?: string
  fromName?: string
}

export interface WebhookPayload {
  event: string
  timestamp: number
  notification: {
    id: string
    type: string
    title: string
    message: string
    link?: string
    metadata?: Record<string, unknown>
  }
  signature?: string
}

let emailConfig: EmailConfig = {}

export function configureEmail(config: EmailConfig): void {
  emailConfig = config
  logger.info('Email configuration updated')
}

export function setUserPreferences(userId: string, preferences: NotificationPreferences): void {
  userPreferencesCache.set(userId, preferences)
}

export function getUserPreferences(userId: string): NotificationPreferences | undefined {
  return userPreferencesCache.get(userId)
}

export async function sendEmail(
  to: string,
  template: NotificationTemplate,
  data: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const subject = renderTemplate(template.subject, data)
    const htmlBody = renderTemplate(template.htmlTemplate, data)
    const textBody = renderTemplate(template.textTemplate, data)

    if (!emailConfig.smtpHost) {
      logger.warn('Email not configured, skipping send', { to, subject })
      return { success: false, error: 'Email not configured' }
    }

    logger.info('Sending email', { to, subject, templateId: template.id })

    // In production, integrate with nodemailer or similar
    // For now, log the email details
    logger.debug('Email content', {
      to,
      from: `${emailConfig.fromName || 'SwarmUI'} <${emailConfig.fromAddress || 'noreply@swarmui.local'}>`,
      subject,
      textBody: textBody.substring(0, 200),
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to send email', { to, error: message })
    return { success: false, error: message }
  }
}

export function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  secret?: string
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  try {
    const payloadString = JSON.stringify(payload)
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-SwarmUI-Event': payload.event,
      'X-SwarmUI-Timestamp': String(payload.timestamp),
    }

    if (secret) {
      const signature = generateWebhookSignature(payloadString, secret)
      headers['X-SwarmUI-Signature'] = `sha256=${signature}`
      payload.signature = signature
    }

    logger.info('Sending webhook', { url, event: payload.event })

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      logger.warn('Webhook request failed', {
        url,
        statusCode: response.status,
        error: errorText,
      })
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        statusCode: response.status,
      }
    }

    logger.debug('Webhook sent successfully', { url, statusCode: response.status })
    return { success: true, statusCode: response.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to send webhook', { url, error: message })
    return { success: false, error: message }
  }
}

export interface InAppNotificationHandler {
  (userId: string, notification: Notification): void
}

let inAppHandler: InAppNotificationHandler | null = null

export function setInAppHandler(handler: InAppNotificationHandler): void {
  inAppHandler = handler
}

export async function sendInApp(
  userId: string,
  notification: Notification
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!inAppHandler) {
      logger.warn('No in-app notification handler configured')
      return { success: false, error: 'No handler configured' }
    }

    logger.debug('Sending in-app notification', {
      userId,
      notificationId: notification.id,
      type: notification.type,
    })

    inAppHandler(userId, notification)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to send in-app notification', { userId, error: message })
    return { success: false, error: message }
  }
}

export async function sendDigest(
  userId: string
): Promise<{ success: boolean; count: number; error?: string }> {
  const preferences = getUserPreferences(userId)
  if (!preferences || preferences.digestMode === 'none') {
    return { success: true, count: 0 }
  }

  const bucketKey = `${userId}:${preferences.digestMode}`
  const notifications = digestBuckets.get(bucketKey) || []

  if (notifications.length === 0) {
    return { success: true, count: 0 }
  }

  try {
    const digest: DigestNotification = {
      id: crypto.randomUUID(),
      userId,
      notifications,
      period: preferences.digestMode,
      startTime: notifications[notifications.length - 1]?.timestamp || Date.now(),
      endTime: Date.now(),
    }

    logger.info('Sending notification digest', {
      userId,
      count: notifications.length,
      period: preferences.digestMode,
    })

    if (preferences.emailAddress) {
      const digestHtml = generateDigestHtml(digest)
      const digestText = generateDigestText(digest)

      await sendEmail(preferences.emailAddress, {
        id: 'digest',
        event: 'job_completed' as NotificationEvent,
        subject: `SwarmUI Digest: {{count}} notifications`,
        htmlTemplate: digestHtml,
        textTemplate: digestText,
        variables: ['count'],
      }, {
        count: String(notifications.length),
      })
    }

    digestBuckets.delete(bucketKey)
    return { success: true, count: notifications.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Failed to send digest', { userId, error: message })
    return { success: false, count: 0, error: message }
  }
}

function generateDigestHtml(digest: DigestNotification): string {
  const items = digest.notifications
    .map((n) => `
      <div style="border-bottom: 1px solid #eee; padding: 12px 0;">
        <strong style="color: ${getTypeColor(n.type)}">${n.title}</strong>
        <p style="margin: 4px 0; color: #666;">${n.message}</p>
        <small style="color: #999;">${new Date(n.timestamp).toLocaleString()}</small>
      </div>
    `)
    .join('')

  return `
    <h2>SwarmUI Notification Digest</h2>
    <p>You have {{count}} notifications from the last ${digest.period === 'hourly' ? 'hour' : 'day'}:</p>
    <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
      ${items}
    </div>
    <p><a href="{{dashboardLink}}" style="color: #3b82f6;">View all in SwarmUI</a></p>
  `
}

function generateDigestText(digest: DigestNotification): string {
  const items = digest.notifications
    .map((n) => `- ${n.title}: ${n.message} (${new Date(n.timestamp).toLocaleString()})`)
    .join('\n')

  return `SwarmUI Notification Digest

You have {{count}} notifications from the last ${digest.period === 'hourly' ? 'hour' : 'day'}:

${items}

View all at: {{dashboardLink}}`
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'success':
      return '#22c55e'
    case 'warning':
      return '#f59e0b'
    case 'error':
      return '#ef4444'
    default:
      return '#3b82f6'
  }
}

export function queueNotification(
  notification: Notification,
  userId: string,
  channels: NotificationChannel[]
): string {
  if (notificationQueue.length >= MAX_QUEUE_SIZE) {
    const removed = notificationQueue.shift()
    if (removed) {
      logger.warn('Notification queue full, dropping oldest', {
        droppedId: removed.id,
      })
    }
  }

  const queued: QueuedNotification = {
    id: crypto.randomUUID(),
    notification,
    channels,
    userId,
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
  }

  notificationQueue.push(queued)
  logger.debug('Notification queued', {
    queuedId: queued.id,
    notificationId: notification.id,
    channels,
  })

  return queued.id
}

export async function processNotificationQueue(): Promise<{
  processed: number
  succeeded: number
  failed: number
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0 }

  const pending = notificationQueue.filter((q) => q.status === 'pending')
  
  for (const queued of pending) {
    stats.processed++
    queued.status = 'processing'

    const preferences = getUserPreferences(queued.userId)
    let allSucceeded = true

    for (const channel of queued.channels) {
      let result: { success: boolean; error?: string }

      switch (channel) {
        case 'in_app':
          result = await sendInApp(queued.userId, queued.notification)
          break

        case 'email':
          if (preferences?.emailAddress && queued.notification.event) {
            const template = NOTIFICATION_TEMPLATES[queued.notification.event]
            if (template) {
              const data = queued.notification.metadata as Record<string, string> || {}
              result = await sendEmail(preferences.emailAddress, template, data)
            } else {
              result = { success: false, error: 'No template found' }
            }
          } else {
            result = { success: false, error: 'No email address configured' }
          }
          break

        case 'webhook':
          if (preferences?.webhookUrl) {
            const payload: WebhookPayload = {
              event: queued.notification.event || 'notification',
              timestamp: queued.notification.timestamp,
              notification: {
                id: queued.notification.id,
                type: queued.notification.type,
                title: queued.notification.title,
                message: queued.notification.message,
                link: queued.notification.link,
                metadata: queued.notification.metadata,
              },
            }
            result = await sendWebhook(
              preferences.webhookUrl,
              payload,
              preferences.webhookSecret
            )
          } else {
            result = { success: false, error: 'No webhook URL configured' }
          }
          break

        default:
          result = { success: false, error: `Unknown channel: ${channel}` }
      }

      if (!result.success) {
        allSucceeded = false
        logger.warn('Channel delivery failed', {
          queuedId: queued.id,
          channel,
          error: result.error,
        })
      }
    }

    if (allSucceeded) {
      queued.status = 'sent'
      queued.processedAt = Date.now()
      stats.succeeded++
    } else {
      queued.retryCount++
      if (queued.retryCount >= MAX_RETRIES) {
        queued.status = 'failed'
        queued.error = 'Max retries exceeded'
        stats.failed++
      } else {
        queued.status = 'pending'
      }
    }
  }

  const completedIds = notificationQueue
    .filter((q) => q.status === 'sent' || q.status === 'failed')
    .map((q) => q.id)

  for (const id of completedIds) {
    const idx = notificationQueue.findIndex((q) => q.id === id)
    if (idx >= 0) {
      notificationQueue.splice(idx, 1)
    }
  }

  if (stats.processed > 0) {
    logger.info('Notification queue processed', stats)
  }

  return stats
}

export function addToDigestBucket(
  userId: string,
  notification: Notification,
  digestMode: DigestMode
): void {
  if (digestMode === 'none') return

  const bucketKey = `${userId}:${digestMode}`
  const bucket = digestBuckets.get(bucketKey) || []
  bucket.push(notification)
  digestBuckets.set(bucketKey, bucket)

  logger.debug('Added notification to digest bucket', {
    userId,
    bucketKey,
    bucketSize: bucket.length,
  })
}

export async function sendNotification(
  notification: Notification,
  userId: string,
  preferences?: NotificationPreferences
): Promise<{ queued: boolean; channels: NotificationChannel[] }> {
  const prefs = preferences || getUserPreferences(userId)
  
  if (!prefs || !prefs.enabled) {
    return { queued: false, channels: [] }
  }

  const event = notification.event
  if (!event) {
    const channels: NotificationChannel[] = ['in_app']
    queueNotification(notification, userId, channels)
    return { queued: true, channels }
  }

  const channels = getChannelsForEvent(prefs, event)
  
  if (channels.length === 0) {
    return { queued: false, channels: [] }
  }

  if (prefs.digestMode !== 'none') {
    const nonDigestChannels = channels.filter((c) => c === 'in_app')
    const digestChannels = channels.filter((c) => c !== 'in_app')

    if (nonDigestChannels.length > 0) {
      queueNotification(notification, userId, nonDigestChannels)
    }

    if (digestChannels.length > 0) {
      addToDigestBucket(userId, notification, prefs.digestMode)
    }
  } else {
    queueNotification(notification, userId, channels)
  }

  return { queued: true, channels }
}

export function getQueueStats(): {
  pending: number
  processing: number
  total: number
} {
  return {
    pending: notificationQueue.filter((q) => q.status === 'pending').length,
    processing: notificationQueue.filter((q) => q.status === 'processing').length,
    total: notificationQueue.length,
  }
}

export function getDigestBucketStats(): Map<string, number> {
  const stats = new Map<string, number>()
  for (const [key, bucket] of digestBuckets) {
    stats.set(key, bucket.length)
  }
  return stats
}

let processingInterval: ReturnType<typeof setInterval> | null = null
let digestInterval: ReturnType<typeof setInterval> | null = null

export function startNotificationProcessor(
  queueIntervalMs = 5000,
  digestIntervalMs = 60 * 60 * 1000
): void {
  if (processingInterval) {
    clearInterval(processingInterval)
  }
  if (digestInterval) {
    clearInterval(digestInterval)
  }

  processingInterval = setInterval(() => {
    void processNotificationQueue()
  }, queueIntervalMs)

  digestInterval = setInterval(() => {
    for (const [key] of digestBuckets) {
      const [userId] = key.split(':')
      void sendDigest(userId)
    }
  }, digestIntervalMs)

  logger.info('Notification processor started', {
    queueIntervalMs,
    digestIntervalMs,
  })
}

export function stopNotificationProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
  }
  if (digestInterval) {
    clearInterval(digestInterval)
    digestInterval = null
  }
  logger.info('Notification processor stopped')
}

export async function sendTestNotification(
  userId: string,
  channel: NotificationChannel
): Promise<{ success: boolean; error?: string }> {
  const preferences = getUserPreferences(userId)
  
  const testNotification: Notification = {
    id: crypto.randomUUID(),
    type: 'info',
    title: 'Test Notification',
    message: 'This is a test notification from SwarmUI.',
    timestamp: Date.now(),
    read: false,
    event: 'job_completed',
    metadata: {
      test: true,
      channel,
    },
  }

  switch (channel) {
    case 'in_app':
      return sendInApp(userId, testNotification)

    case 'email':
      if (!preferences?.emailAddress) {
        return { success: false, error: 'No email address configured' }
      }
      return sendEmail(preferences.emailAddress, {
        id: 'test',
        event: 'job_completed',
        subject: 'SwarmUI Test Notification',
        htmlTemplate: `
          <h2>Test Notification</h2>
          <p>This is a test notification from SwarmUI.</p>
          <p>If you received this email, your email notifications are configured correctly.</p>
        `,
        textTemplate: `Test Notification

This is a test notification from SwarmUI.
If you received this email, your email notifications are configured correctly.`,
        variables: [],
      }, {})

    case 'webhook':
      if (!preferences?.webhookUrl) {
        return { success: false, error: 'No webhook URL configured' }
      }
      const payload: WebhookPayload = {
        event: 'test',
        timestamp: Date.now(),
        notification: {
          id: testNotification.id,
          type: testNotification.type,
          title: testNotification.title,
          message: testNotification.message,
        },
      }
      return sendWebhook(preferences.webhookUrl, payload, preferences.webhookSecret)

    default:
      return { success: false, error: `Unknown channel: ${channel}` }
  }
}
