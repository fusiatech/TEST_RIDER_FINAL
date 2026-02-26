import { Scheduler } from '@/server/scheduler'

async function main(): Promise<void> {
  const s = new Scheduler()
  await s.init()

  console.log('[test] Scheduler initialized')

  const tasks = await s.getTasks()
  console.log(`[test] Loaded ${tasks.length} persisted tasks`)

  s.start()
  console.log('[test] Scheduler started — tick loop is active')

  const testTask = {
    id: 'test-task-1',
    name: 'Test Tick',
    cronExpression: 'every-hour',
    prompt: 'Hello from scheduler test',
    mode: 'chat' as const,
    enabled: true,
    nextRun: Date.now() + 999_999_999,
    createdAt: Date.now(),
  }
  await s.addTask(testTask)
  console.log('[test] Added test task')

  const retrieved = await s.getTask('test-task-1')
  if (!retrieved) {
    console.error('[FAIL] Could not retrieve test task')
    process.exit(1)
  }
  console.log(`[test] Retrieved task: ${retrieved.name} (enabled=${retrieved.enabled})`)

  await s.disableTask('test-task-1')
  const disabled = await s.getTask('test-task-1')
  if (disabled?.enabled !== false) {
    console.error('[FAIL] Task should be disabled')
    process.exit(1)
  }
  console.log('[test] Task disabled successfully')

  await s.enableTask('test-task-1')
  const enabled = await s.getTask('test-task-1')
  if (enabled?.enabled !== true) {
    console.error('[FAIL] Task should be enabled')
    process.exit(1)
  }
  console.log('[test] Task re-enabled successfully')

  await s.removeTask('test-task-1')
  const removed = await s.getTask('test-task-1')
  if (removed) {
    console.error('[FAIL] Task should be removed')
    process.exit(1)
  }
  console.log('[test] Task removed successfully')

  s.stop()
  console.log('[test] Scheduler stopped')
  console.log('[PASS] All scheduler tests passed')
  process.exit(0)
}

main().catch((err) => {
  console.error('[FAIL]', err)
  process.exit(1)
})
