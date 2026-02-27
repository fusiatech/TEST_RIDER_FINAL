import { NextResponse } from 'next/server'

/**
 * Kubernetes Liveness Probe
 * Returns 200 if the process is running and can handle requests.
 * This is a minimal check - if this fails, Kubernetes should restart the pod.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: 'alive',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  )
}
