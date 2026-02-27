import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTask } from '@/lib/types'

const getScheduledTasksMock = vi.hoisted(() => vi.fn(async () => [] as ScheduledTask[]))
const saveScheduledTaskMock = vi.hoisted(() => vi.fn(async (_task: ScheduledTask) => {}))
const deleteScheduledTaskMock = vi.hoisted(() => vi.fn(async (_id: string) => {}))

vi.mock('@/server/storage', () => ({
  getScheduledTasks: getScheduledTasksMock,
  saveScheduledTask: saveScheduledTaskMock,
  deleteScheduledTask: deleteScheduledTaskMock,
}))

vi.mock('@/server/job-queue', () => ({
  jobQueue: {
    enqueue: vi.fn(),
  },
}))

import { Scheduler } from '@/server/scheduler'

describe('Scheduler.updateTask', () => {
  beforeEach(() => {
    getScheduledTasksMock.mockClear()
    saveScheduledTaskMock.mockClear()
    deleteScheduledTaskMock.mockClear()
  })

  it('updates editable task fields', async () => {
    const scheduler = new Scheduler()
    const baseTask: ScheduledTask = {
      id: 'task-1',
      name: 'Original',
      cronExpression: 'every-hour',
      prompt: 'First prompt',
      mode: 'swarm',
      enabled: true,
      createdAt: Date.now(),
      nextRun: Date.now() + 60_000,
    }

    await scheduler.addTask(baseTask)

    const updated = await scheduler.updateTask(baseTask.id, {
      name: 'Updated',
      cronExpression: 'daily',
      prompt: 'Updated prompt',
      mode: 'project',
      enabled: false,
    })

    expect(updated).toBeDefined()
    expect(updated?.name).toBe('Updated')
    expect(updated?.cronExpression).toBe('daily')
    expect(updated?.prompt).toBe('Updated prompt')
    expect(updated?.mode).toBe('project')
    expect(updated?.enabled).toBe(false)
  })

  it('recalculates nextRun when enabling a disabled task', async () => {
    const scheduler = new Scheduler()
    const baseTask: ScheduledTask = {
      id: 'task-2',
      name: 'Disabled task',
      cronExpression: 'every-hour',
      prompt: 'Prompt',
      mode: 'chat',
      enabled: false,
      createdAt: Date.now(),
      nextRun: 0,
    }

    await scheduler.addTask(baseTask)
    const beforeUpdate = Date.now()
    const updated = await scheduler.updateTask(baseTask.id, { enabled: true })

    expect(updated).toBeDefined()
    expect(updated?.enabled).toBe(true)
    expect(updated?.nextRun).toBeGreaterThanOrEqual(beforeUpdate)
  })
})
