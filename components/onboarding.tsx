'use client'

import { useState, useEffect } from 'react'
import { useSwarmStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MessageCircle, Settings, Terminal, Sparkles } from 'lucide-react'

const STORAGE_KEY = 'swarmui-onboarding-dismissed'

interface StepInfo {
  icon: typeof MessageCircle
  title: string
  description: string
  color: string
}

const STEPS: StepInfo[] = [
  {
    icon: MessageCircle,
    title: 'Choose your mode',
    description:
      'Chat mode for quick Q&A, Swarm mode to dispatch parallel agents on a task, or Project mode to decompose and manage a full project pipeline.',
    color: '#60a5fa',
  },
  {
    icon: Settings,
    title: 'Configure your agents',
    description:
      'Open Settings to enable CLI agents (Cursor, Claude, Gemini, etc.), set parallel counts, and configure testing & security guardrails.',
    color: '#a78bfa',
  },
  {
    icon: Terminal,
    title: 'Start building',
    description:
      'Type a prompt in the input bar to start. In Swarm mode, agents spawn in parallel and stream results live to the dashboard.',
    color: '#34d399',
  },
]

export function Onboarding() {
  const sessions = useSwarmStore((s) => s.sessions)
  const sessionsLoading = useSwarmStore((s) => s.sessionsLoading)
  const [visible, setVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (sessionsLoading) return
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (!dismissed && sessions.length === 0) {
      setVisible(true)
    }
  }, [sessions, sessionsLoading])

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setVisible(false)
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleDismiss()
    }
  }

  if (!visible) return null

  const step = STEPS[currentStep]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md border-border shadow-2xl">
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Welcome to SwarmUI</h2>
            <p className="mt-1 text-sm text-muted">
              Multi-agent orchestration for AI-powered development
            </p>

            <div className="mt-6 w-full">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${step.color}20` }}
                >
                  <step.icon className="h-5 w-5" style={{ color: step.color }} />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-0.5 text-xs text-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: i === currentStep ? 20 : 8,
                    backgroundColor: i === currentStep ? step.color : '#3f3f46',
                  }}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={handleDismiss}>
                Skip
              </Button>
              <Button size="sm" onClick={handleNext}>
                {currentStep < STEPS.length - 1 ? 'Next' : 'Get Started'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
