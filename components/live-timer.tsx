'use client'

import { useState, useEffect } from 'react'

interface LiveTimerProps {
  startedAt: number
  stoppedAt?: number
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function LiveTimer({ startedAt, stoppedAt }: LiveTimerProps) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (stoppedAt != null) return

    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [stoppedAt])

  const elapsed = (stoppedAt ?? now) - startedAt
  return <span className="tabular-nums">{formatElapsed(elapsed)}</span>
}
