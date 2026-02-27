'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Bell,
  Mail,
  Webhook,
  Monitor,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  NotificationPreferences,
  NotificationEvent,
  EventChannelPreference,
  DigestMode,
  NotificationChannel,
} from '@/lib/notifications'
import {
  NotificationEvent as NotificationEventEnum,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_EVENT_CHANNEL_PREFERENCE,
  getDefaultEventPreferences,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'

const EVENT_LABELS: Record<NotificationEvent, string> = {
  job_started: 'Job Started',
  job_completed: 'Job Completed',
  job_failed: 'Job Failed',
  ticket_assigned: 'Ticket Assigned',
  ticket_status_changed: 'Ticket Status Changed',
  pr_created: 'PR Created',
  pr_merged: 'PR Merged',
  test_failed: 'Test Failed',
  coverage_dropped: 'Coverage Dropped',
  pipeline_started: 'Pipeline Started',
  pipeline_completed: 'Pipeline Completed',
  security_alert: 'Security Alert',
  approval_request: 'Approval Request',
  approval_decision: 'Approval Decision',
  prd_approved: 'PRD Approved',
  error_threshold_reached: 'Error Threshold Reached',
}

const EVENT_DESCRIPTIONS: Record<NotificationEvent, string> = {
  job_started: 'When a swarm job begins processing',
  job_completed: 'When a swarm job finishes successfully',
  job_failed: 'When a swarm job encounters an error',
  ticket_assigned: 'When a ticket is assigned to you',
  ticket_status_changed: 'When a ticket you watch changes status',
  pr_created: 'When a pull request is created',
  pr_merged: 'When a pull request is merged',
  test_failed: 'When tests fail in a pipeline',
  coverage_dropped: 'When code coverage decreases',
  pipeline_started: 'When a CI/CD pipeline starts',
  pipeline_completed: 'When a CI/CD pipeline completes',
  security_alert: 'When a security issue is detected',
  approval_request: 'When your approval is needed',
  approval_decision: 'When a decision is made on your request',
  prd_approved: 'When a PRD is approved',
  error_threshold_reached: 'When error count exceeds threshold',
}

const EVENT_CATEGORIES: Record<string, NotificationEvent[]> = {
  Jobs: ['job_started', 'job_completed', 'job_failed'],
  Tickets: ['ticket_assigned', 'ticket_status_changed'],
  'Pull Requests': ['pr_created', 'pr_merged'],
  Testing: ['test_failed', 'coverage_dropped'],
  Pipeline: ['pipeline_started', 'pipeline_completed'],
  Approvals: ['approval_request', 'approval_decision', 'prd_approved'],
  Alerts: ['security_alert', 'error_threshold_reached'],
}

interface NotificationPreferencesProps {
  userId: string
  onSave?: (preferences: NotificationPreferences) => void
}

export function NotificationPreferencesPanel({ userId, onSave }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    userId,
    events: getDefaultEventPreferences(),
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingChannel, setTestingChannel] = useState<NotificationChannel | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const loadPreferences = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.preferences) {
          setPreferences({
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...data.preferences,
            userId,
            events: data.preferences.events || getDefaultEventPreferences(),
          })
        }
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  const updatePreferences = useCallback((update: Partial<NotificationPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...update }))
    setHasChanges(true)
  }, [])

  const updateEventPreference = useCallback(
    (event: NotificationEvent, channel: keyof EventChannelPreference, value: boolean) => {
      setPreferences((prev) => ({
        ...prev,
        events: {
          ...prev.events,
          [event]: {
            ...(prev.events?.[event] || DEFAULT_EVENT_CHANNEL_PREFERENCE),
            [channel]: value,
          },
        },
      }))
      setHasChanges(true)
    },
    []
  )

  const savePreferences = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, preferences }),
      })

      if (!res.ok) {
        throw new Error('Failed to save preferences')
      }

      toast.success('Notification preferences saved')
      setHasChanges(false)
      onSave?.(preferences)
    } catch (error) {
      toast.error('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const sendTestNotification = async (channel: NotificationChannel) => {
    setTestingChannel(channel)
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, channel, action: 'test' }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`Test ${channel} notification sent`)
      } else {
        toast.error(data.error || `Failed to send test ${channel} notification`)
      }
    } catch (error) {
      toast.error(`Failed to send test ${channel} notification`)
    } finally {
      setTestingChannel(null)
    }
  }

  const enableAllForChannel = (channel: keyof EventChannelPreference, enabled: boolean) => {
    const events = NotificationEventEnum.options
    const newEvents = { ...preferences.events }
    for (const event of events) {
      newEvents[event] = {
        ...(newEvents[event] || DEFAULT_EVENT_CHANNEL_PREFERENCE),
        [channel]: enabled,
      }
    }
    setPreferences((prev) => ({ ...prev, events: newEvents }))
    setHasChanges(true)
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Notification Preferences</h2>
        </div>
        <Button
          onClick={savePreferences}
          disabled={saving || !hasChanges}
          size="sm"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Enable Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Master switch for all notifications
            </p>
          </div>
          <Switch
            checked={preferences.enabled}
            onCheckedChange={(enabled) => updatePreferences({ enabled })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Sound</Label>
            <p className="text-sm text-muted-foreground">
              Play sound for in-app notifications
            </p>
          </div>
          <Switch
            checked={preferences.sound}
            onCheckedChange={(sound) => updatePreferences({ sound })}
            disabled={!preferences.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Desktop Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Show browser desktop notifications
            </p>
          </div>
          <Switch
            checked={preferences.desktop}
            onCheckedChange={(desktop) => updatePreferences({ desktop })}
            disabled={!preferences.enabled}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base">Digest Mode</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Batch email and webhook notifications instead of sending immediately
        </p>
        <Select
          value={preferences.digestMode}
          onValueChange={(value: DigestMode) => updatePreferences({ digestMode: value })}
          disabled={!preferences.enabled}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select digest mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Send Immediately</SelectItem>
            <SelectItem value="hourly">Hourly Digest</SelectItem>
            <SelectItem value="daily">Daily Digest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base">Email Notifications</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendTestNotification('email')}
            disabled={!preferences.emailAddress || testingChannel === 'email'}
          >
            {testingChannel === 'email' ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-2 h-3 w-3" />
            )}
            Test
          </Button>
        </div>
        <Input
          type="email"
          placeholder="your@email.com"
          value={preferences.emailAddress || ''}
          onChange={(e) => updatePreferences({ emailAddress: e.target.value || undefined })}
          disabled={!preferences.enabled}
        />
        {preferences.emailAddress && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Email configured
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base">Webhook Notifications</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendTestNotification('webhook')}
            disabled={!preferences.webhookUrl || testingChannel === 'webhook'}
          >
            {testingChannel === 'webhook' ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-2 h-3 w-3" />
            )}
            Test
          </Button>
        </div>
        <div className="space-y-2">
          <Input
            type="url"
            placeholder="https://your-webhook-endpoint.com/notify"
            value={preferences.webhookUrl || ''}
            onChange={(e) => updatePreferences({ webhookUrl: e.target.value || undefined })}
            disabled={!preferences.enabled}
          />
          <Input
            type="password"
            placeholder="Webhook secret (optional, for signature verification)"
            value={preferences.webhookSecret || ''}
            onChange={(e) => updatePreferences({ webhookSecret: e.target.value || undefined })}
            disabled={!preferences.enabled}
          />
        </div>
        {preferences.webhookUrl && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Webhook configured
            {preferences.webhookSecret && ' with signature verification'}
          </div>
        )}
        <div className="flex items-start gap-2 rounded bg-muted/50 p-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Webhooks receive JSON payloads with event type, timestamp, and notification details.
            If a secret is provided, requests include an X-SwarmUI-Signature header.
          </span>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base">In-App Notifications</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendTestNotification('in_app')}
            disabled={testingChannel === 'in_app'}
          >
            {testingChannel === 'in_app' ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-2 h-3 w-3" />
            )}
            Test
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          In-app notifications appear in the notification center and are always available.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">Event Preferences</Label>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => enableAllForChannel('inApp', true)}
              className="text-xs"
            >
              Enable All In-App
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => enableAllForChannel('email', false)}
              className="text-xs"
            >
              Disable All Email
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-6">
            {Object.entries(EVENT_CATEGORIES).map(([category, events]) => (
              <div key={category} className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">{category}</h4>
                <div className="space-y-2">
                  {events.map((event) => {
                    const eventPrefs = preferences.events?.[event] || DEFAULT_EVENT_CHANNEL_PREFERENCE
                    return (
                      <div
                        key={event}
                        className="flex items-center justify-between rounded-md border border-border/50 p-3"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{EVENT_LABELS[event]}</p>
                          <p className="text-xs text-muted-foreground">
                            {EVENT_DESCRIPTIONS[event]}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-3 w-3 text-muted-foreground" />
                            <Switch
                              checked={eventPrefs.inApp}
                              onCheckedChange={(v) => updateEventPreference(event, 'inApp', v)}
                              disabled={!preferences.enabled}
                              aria-label={`In-app for ${EVENT_LABELS[event]}`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <Switch
                              checked={eventPrefs.email}
                              onCheckedChange={(v) => updateEventPreference(event, 'email', v)}
                              disabled={!preferences.enabled || !preferences.emailAddress}
                              aria-label={`Email for ${EVENT_LABELS[event]}`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Webhook className="h-3 w-3 text-muted-foreground" />
                            <Switch
                              checked={eventPrefs.webhook}
                              onCheckedChange={(v) => updateEventPreference(event, 'webhook', v)}
                              disabled={!preferences.enabled || !preferences.webhookUrl}
                              aria-label={`Webhook for ${EVENT_LABELS[event]}`}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {hasChanges && (
        <div className="flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
          <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            You have unsaved changes
          </div>
          <Button onClick={savePreferences} disabled={saving} size="sm">
            Save Changes
          </Button>
        </div>
      )}
    </div>
  )
}
