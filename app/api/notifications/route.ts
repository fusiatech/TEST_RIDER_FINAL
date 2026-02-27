import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  NotificationPreferencesSchema,
  NotificationChannel,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getDefaultEventPreferences,
} from '@/lib/notifications'
import {
  setUserPreferences,
  getUserPreferences,
  sendTestNotification,
  configureEmail,
} from '@/server/notification-sender'
import { getDb } from '@/server/storage'
import { createLogger } from '@/server/logger'

const logger = createLogger('api-notifications')

interface NotificationPreferencesDb {
  notificationPreferences: Record<string, z.infer<typeof NotificationPreferencesSchema>>
}

async function getNotificationDb(): Promise<NotificationPreferencesDb> {
  const db = await getDb()
  const data = db.data as unknown as NotificationPreferencesDb
  if (!data.notificationPreferences) {
    (db.data as unknown as NotificationPreferencesDb).notificationPreferences = {}
  }
  return db.data as unknown as NotificationPreferencesDb
}

async function saveNotificationDb(): Promise<void> {
  const db = await getDb()
  await db.write()
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    const db = await getNotificationDb()
    const preferences = db.notificationPreferences[userId]

    if (!preferences) {
      const defaultPrefs = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        userId,
        events: getDefaultEventPreferences(),
      }
      return NextResponse.json({ preferences: defaultPrefs })
    }

    setUserPreferences(userId, preferences)

    return NextResponse.json({ preferences })
  } catch (error) {
    logger.error('Failed to get notification preferences', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to get notification preferences' },
      { status: 500 }
    )
  }
}

const UpdatePreferencesSchema = z.object({
  userId: z.string(),
  preferences: NotificationPreferencesSchema,
})

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const parsed = UpdatePreferencesSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { userId, preferences } = parsed.data

    const db = await getNotificationDb()
    db.notificationPreferences[userId] = preferences
    await saveNotificationDb()

    setUserPreferences(userId, preferences)

    logger.info('Notification preferences updated', { userId })

    return NextResponse.json({ success: true, preferences })
  } catch (error) {
    logger.error('Failed to update notification preferences', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 }
    )
  }
}

const TestNotificationSchema = z.object({
  userId: z.string(),
  channel: z.enum(['in_app', 'email', 'webhook']),
  action: z.literal('test'),
})

const ConfigureEmailSchema = z.object({
  action: z.literal('configure_email'),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  fromAddress: z.string().email().optional(),
  fromName: z.string().optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()

    const testParsed = TestNotificationSchema.safeParse(body)
    if (testParsed.success) {
      const { userId, channel } = testParsed.data

      const db = await getNotificationDb()
      const preferences = db.notificationPreferences[userId]
      if (preferences) {
        setUserPreferences(userId, preferences)
      }

      const result = await sendTestNotification(userId, channel as NotificationChannel)

      logger.info('Test notification sent', { userId, channel, success: result.success })

      return NextResponse.json(result)
    }

    const configParsed = ConfigureEmailSchema.safeParse(body)
    if (configParsed.success) {
      const { action, ...config } = configParsed.data
      configureEmail(config)
      logger.info('Email configuration updated')
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  } catch (error) {
    logger.error('Failed to process notification request', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to process notification request' },
      { status: 500 }
    )
  }
}
