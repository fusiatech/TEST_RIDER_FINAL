import { NextResponse } from 'next/server'
import { detectInstalledCLIs } from '@/server/cli-detect'

export async function GET(): Promise<NextResponse> {
  const mem = process.memoryUsage()
  let clis: { id: string; installed: boolean }[] = []
  try {
    const detected = await detectInstalledCLIs()
    clis = detected.map((c) => ({ id: c.id, installed: c.installed ?? false }))
  } catch {
    // ignore
  }
  const cliStatus = clis.some((c) => c.installed) ? 'ok' : 'no-cli'

  return NextResponse.json({
    disk: { used: 0, total: 0, unit: 'GB' },
    memory: {
      used: Math.round(mem.heapUsed / 1024 / 1024),
      total: Math.max(1, Math.round(mem.heapTotal / 1024 / 1024)),
      unit: 'MB',
    },
    cliStatus,
  })
}
