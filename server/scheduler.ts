import type { ScheduledTask } from '@/lib/types'
import { getScheduledTasks, saveScheduledTask, deleteScheduledTask as removeStoredTask } from '@/server/storage'
import { jobQueue } from '@/server/job-queue'
import { randomUUID } from 'node:crypto'

const SCHEDULE_INTERVALS: Record<string, number> = {
  'every-hour': 60 * 60 * 1000,
  'every-6-hours': 6 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
  'weekly': 7 * 24 * 60 * 60 * 1000,
}

export class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map()
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private started = false
  private loaded = false

  async init(): Promise<void> {
    await this.ensureLoaded()
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    const persisted = await getScheduledTasks()
    for (const task of persisted) {
      this.tasks.set(task.id, task)
    }
  }

  async addTask(task: ScheduledTask): Promise<void> {
    await this.ensureLoaded()
    this.tasks.set(task.id, task)
    await saveScheduledTask(task)
    if (this.started && task.enabled) {
      this.scheduleTask(task)
    }
  }

  async removeTask(id: string): Promise<void> {
    await this.ensureLoaded()
    this.clearTimer(id)
    this.tasks.delete(id)
    await removeStoredTask(id)
  }

  async enableTask(id: string): Promise<void> {
    await this.ensureLoaded()
    const task = this.tasks.get(id)
    if (!task) return
    const updated: ScheduledTask = {
      ...task,
      enabled: true,
      nextRun: this.getNextRunTime(task.cronExpression),
    }
    this.tasks.set(id, updated)
    await saveScheduledTask(updated)
    if (this.started) {
      this.scheduleTask(updated)
    }
  }

  async disableTask(id: string): Promise<void> {
    await this.ensureLoaded()
    const task = this.tasks.get(id)
    if (!task) return
    this.clearTimer(id)
    const updated: ScheduledTask = { ...task, enabled: false }
    this.tasks.set(id, updated)
    await saveScheduledTask(updated)
  }

  async updateTask(
    id: string,
    patch: Partial<Pick<ScheduledTask, 'name' | 'cronExpression' | 'prompt' | 'mode' | 'enabled'>>
  ): Promise<ScheduledTask | undefined> {
    await this.ensureLoaded()
    const existing = this.tasks.get(id)
    if (!existing) {
      return undefined
    }

    const nextEnabled = patch.enabled ?? existing.enabled
    const cronExpression = patch.cronExpression ?? existing.cronExpression
    const shouldRecalculateNextRun =
      patch.enabled === true ||
      (nextEnabled && patch.cronExpression !== undefined)

    const updated: ScheduledTask = {
      ...existing,
      ...patch,
      cronExpression,
      enabled: nextEnabled,
      ...(shouldRecalculateNextRun ? { nextRun: this.getNextRunTime(cronExpression) } : {}),
    }

    this.tasks.set(id, updated)
    await saveScheduledTask(updated)

    if (!this.started) {
      return updated
    }

    if (updated.enabled) {
      this.scheduleTask(updated)
    } else {
      this.clearTimer(id)
    }

    return updated
  }

  async getTasks(): Promise<ScheduledTask[]> {
    await this.ensureLoaded()
    return Array.from(this.tasks.values())
  }

  async getTask(id: string): Promise<ScheduledTask | undefined> {
    await this.ensureLoaded()
    return this.tasks.get(id)
  }

  start(): void {
    this.started = true
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task)
      }
    }
  }

  stop(): void {
    this.started = false
    for (const id of this.timers.keys()) {
      this.clearTimer(id)
    }
  }

  private getNextRunTime(cron: string): number {
    const intervalMs = SCHEDULE_INTERVALS[cron]
    if (intervalMs) {
      return Date.now() + intervalMs
    }
    return Date.now() + 24 * 60 * 60 * 1000
  }

  private scheduleTask(task: ScheduledTask): void {
    this.clearTimer(task.id)
    const delay = Math.max(0, task.nextRun - Date.now())
    const timer = setTimeout(() => {
      void this.executeTask(task.id)
    }, delay)
    this.timers.set(task.id, timer)
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || !task.enabled) return

    const sessionId = randomUUID()
    jobQueue.enqueue({
      sessionId,
      prompt: task.prompt,
      mode: task.mode,
      source: 'scheduler',
    })

    const now = Date.now()
    const updated: ScheduledTask = {
      ...task,
      lastRun: now,
      nextRun: this.getNextRunTime(task.cronExpression),
    }
    this.tasks.set(taskId, updated)
    await saveScheduledTask(updated)

    if (this.started && updated.enabled) {
      this.scheduleTask(updated)
    }
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
  }
}

export const scheduler = new Scheduler()
