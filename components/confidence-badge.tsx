'use client'

import { useEffect, useState } from 'react'

interface ConfidenceBadgeProps {
  score: number
  sources?: string[]
}

function getColor(score: number): string {
  if (score < 40) return '#ef4444'
  if (score <= 70) return '#eab308'
  return '#22c55e'
}

export function ConfidenceBadge({ score, sources }: ConfidenceBadgeProps) {
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimatedScore(score)
    }, 100)
    return () => clearTimeout(timeout)
  }, [score])

  const radius = 32
  const strokeWidth = 5
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedScore / 100) * circumference
  const color = getColor(score)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-20 w-20">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.3s ease',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-zinc-100 animate-count-up">{score}</span>
        </div>
      </div>
      <span className="text-xs text-zinc-400">confidence</span>
      {sources && sources.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {sources.map((source) => (
            <span
              key={source}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {source}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
