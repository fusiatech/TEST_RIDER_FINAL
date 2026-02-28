import './als-polyfill'
import { initTelemetry } from '@/lib/telemetry'

export async function registerNodeInstrumentation(): Promise<void> {
  initTelemetry()
}

