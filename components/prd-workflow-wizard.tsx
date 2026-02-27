'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Layers,
  ListTodo,
  CheckSquare,
  Palette,
  Code,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Loader2,
  AlertCircle,
  Play,
  Pause,
  SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Epic, Ticket, DesignPack, DevPack } from '@/lib/types'

interface WorkflowStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  items?: Array<{ id: string; title: string; approved?: boolean }>
}

interface PRDWorkflowWizardProps {
  projectId: string
  projectName: string
  hasPRD: boolean
  onComplete?: () => void
  onClose?: () => void
}

export function PRDWorkflowWizard({
  projectId,
  projectName,
  hasPRD,
  onComplete,
  onClose,
}: PRDWorkflowWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)

  const [config, setConfig] = useState({
    generateStories: true,
    generateTasks: true,
    generateSubtasks: false,
    generateDesignPacks: false,
    generateDevPacks: false,
    autoApprove: false,
  })

  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'epics',
      title: 'Generate Epics',
      description: 'Extract major feature areas from PRD',
      icon: <Layers className="w-5 h-5" />,
      status: 'pending',
    },
    {
      id: 'stories',
      title: 'Generate User Stories',
      description: 'Create user stories for each epic',
      icon: <FileText className="w-5 h-5" />,
      status: 'pending',
    },
    {
      id: 'tasks',
      title: 'Generate Tasks',
      description: 'Break down stories into implementation tasks',
      icon: <ListTodo className="w-5 h-5" />,
      status: 'pending',
    },
    {
      id: 'subtasks',
      title: 'Generate Subtasks',
      description: 'Create atomic work items from tasks',
      icon: <CheckSquare className="w-5 h-5" />,
      status: 'pending',
    },
    {
      id: 'design_packs',
      title: 'Generate Design Packs',
      description: 'Create UI/UX specifications',
      icon: <Palette className="w-5 h-5" />,
      status: 'pending',
    },
    {
      id: 'dev_packs',
      title: 'Generate Dev Packs',
      description: 'Create technical specifications',
      icon: <Code className="w-5 h-5" />,
      status: 'pending',
    },
  ])

  const [generatedData, setGeneratedData] = useState<{
    epics: Epic[]
    stories: Ticket[]
    tasks: Ticket[]
    subtasks: Ticket[]
    designPacks: DesignPack[]
    devPacks: DevPack[]
  }>({
    epics: [],
    stories: [],
    tasks: [],
    subtasks: [],
    designPacks: [],
    devPacks: [],
  })

  const updateStepStatus = useCallback(
    (stepId: string, status: WorkflowStep['status'], items?: WorkflowStep['items']) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, status, items: items ?? s.items } : s))
      )
    },
    []
  )

  const runWorkflowStep = useCallback(
    async (action: string, targetId?: string) => {
      const response = await fetch(`/api/projects/${projectId}/prd-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          targetId,
          config,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Workflow step failed')
      }

      return response.json()
    },
    [projectId, config]
  )

  const runFullWorkflow = useCallback(async () => {
    setIsRunning(true)
    setError(null)

    try {
      // Step 1: Generate Epics
      updateStepStatus('epics', 'in_progress')
      const epicResult = await runWorkflowStep('epics')
      setWorkflowId(epicResult.workflowId)
      setGeneratedData((prev) => ({ ...prev, epics: epicResult.epics }))
      updateStepStatus(
        'epics',
        'completed',
        epicResult.epics.map((e: Epic) => ({ id: e.id, title: e.title }))
      )

      if (isPaused) return

      // Step 2: Generate Stories
      if (config.generateStories) {
        updateStepStatus('stories', 'in_progress')
        const allStories: Ticket[] = []

        for (const epic of epicResult.epics) {
          if (isPaused) break
          const storyResult = await runWorkflowStep('stories', epic.id)
          allStories.push(...storyResult.stories)
        }

        setGeneratedData((prev) => ({ ...prev, stories: allStories }))
        updateStepStatus(
          'stories',
          'completed',
          allStories.map((s) => ({ id: s.id, title: s.title }))
        )
      } else {
        updateStepStatus('stories', 'skipped')
      }

      if (isPaused) return

      // Step 3: Generate Tasks
      if (config.generateTasks && config.generateStories) {
        updateStepStatus('tasks', 'in_progress')
        const allTasks: Ticket[] = []

        for (const story of generatedData.stories.length > 0 ? generatedData.stories : []) {
          if (isPaused) break
          const taskResult = await runWorkflowStep('tasks', story.id)
          allTasks.push(...taskResult.tasks)
        }

        setGeneratedData((prev) => ({ ...prev, tasks: allTasks }))
        updateStepStatus(
          'tasks',
          'completed',
          allTasks.map((t) => ({ id: t.id, title: t.title }))
        )
      } else {
        updateStepStatus('tasks', 'skipped')
      }

      if (isPaused) return

      // Step 4: Generate Subtasks
      if (config.generateSubtasks && config.generateTasks) {
        updateStepStatus('subtasks', 'in_progress')
        const allSubtasks: Ticket[] = []

        for (const task of generatedData.tasks) {
          if (isPaused) break
          const subtaskResult = await runWorkflowStep('subtasks', task.id)
          allSubtasks.push(...subtaskResult.subtasks)
        }

        setGeneratedData((prev) => ({ ...prev, subtasks: allSubtasks }))
        updateStepStatus(
          'subtasks',
          'completed',
          allSubtasks.map((st) => ({ id: st.id, title: st.title }))
        )
      } else {
        updateStepStatus('subtasks', 'skipped')
      }

      // Design and Dev packs are optional and can be generated per-ticket later
      if (!config.generateDesignPacks) {
        updateStepStatus('design_packs', 'skipped')
      }
      if (!config.generateDevPacks) {
        updateStepStatus('dev_packs', 'skipped')
      }

      onComplete?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      const currentStep = steps.find((s) => s.status === 'in_progress')
      if (currentStep) {
        updateStepStatus(currentStep.id, 'failed')
      }
    } finally {
      setIsRunning(false)
    }
  }, [
    config,
    isPaused,
    generatedData,
    steps,
    runWorkflowStep,
    updateStepStatus,
    onComplete,
  ])

  const handleApproveItem = useCallback((stepId: string, itemId: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
              ...s,
              items: s.items?.map((item) =>
                item.id === itemId ? { ...item, approved: true } : item
              ),
            }
          : s
      )
    )
  }, [])

  const handleRejectItem = useCallback((stepId: string, itemId: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
              ...s,
              items: s.items?.filter((item) => item.id !== itemId),
            }
          : s
      )
    )
  }, [])

  const currentStep = steps[currentStepIndex]
  const completedSteps = steps.filter((s) => s.status === 'completed').length
  const progress = (completedSteps / steps.length) * 100

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">PRD Workflow Wizard</h2>
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-2 border-b">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-sm text-muted-foreground">
            {completedSteps} of {steps.length} steps
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Step List */}
        <div className="w-64 border-r p-4 overflow-y-auto">
          <div className="space-y-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStepIndex(index)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                  currentStepIndex === index
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                }`}
              >
                <div
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    step.status === 'completed'
                      ? 'bg-green-500/20 text-green-500'
                      : step.status === 'failed'
                        ? 'bg-red-500/20 text-red-500'
                        : step.status === 'in_progress'
                          ? 'bg-blue-500/20 text-blue-500'
                          : step.status === 'skipped'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step.status === 'completed' ? (
                    <Check className="w-4 h-4" />
                  ) : step.status === 'failed' ? (
                    <X className="w-4 h-4" />
                  ) : step.status === 'in_progress' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    step.icon
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{step.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {step.items?.length
                      ? `${step.items.length} items`
                      : step.status === 'skipped'
                        ? 'Skipped'
                        : step.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Step Detail */}
        <div className="flex-1 p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  {currentStep.icon}
                  {currentStep.title}
                </h3>
                <p className="text-muted-foreground mt-1">{currentStep.description}</p>
              </div>

              {/* Configuration (only show before running) */}
              {!isRunning && currentStepIndex === 0 && (
                <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-3">Workflow Configuration</h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.generateStories}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, generateStories: e.target.checked }))
                        }
                        className="rounded"
                      />
                      <span className="text-sm">Generate User Stories</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.generateTasks}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, generateTasks: e.target.checked }))
                        }
                        className="rounded"
                      />
                      <span className="text-sm">Generate Tasks</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.generateSubtasks}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, generateSubtasks: e.target.checked }))
                        }
                        className="rounded"
                      />
                      <span className="text-sm">Generate Subtasks</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.autoApprove}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, autoApprove: e.target.checked }))
                        }
                        className="rounded"
                      />
                      <span className="text-sm">Auto-approve generated items</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-500">Error</p>
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                </div>
              )}

              {/* Generated Items Preview */}
              {currentStep.items && currentStep.items.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">
                    Generated Items ({currentStep.items.length})
                  </h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {currentStep.items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          item.approved
                            ? 'bg-green-500/10 border-green-500/20'
                            : 'bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.approved && (
                            <Check className="w-4 h-4 text-green-500" />
                          )}
                          <span className="text-sm">{item.title}</span>
                        </div>
                        {!config.autoApprove && !item.approved && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleApproveItem(currentStep.id, item.id)}
                            >
                              <Check className="w-4 h-4 text-green-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRejectItem(currentStep.id, item.id)}
                            >
                              <X className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {currentStep.status === 'pending' && !isRunning && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Click "Start Workflow" to begin generating items</p>
                </div>
              )}

              {/* In Progress State */}
              {currentStep.status === 'in_progress' && (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Generating {currentStep.title}...</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between p-4 border-t">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStepIndex((i) => Math.max(0, i - 1))}
            disabled={currentStepIndex === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            disabled={currentStepIndex === steps.length - 1}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 mr-1" />
                    Pause
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentIdx = steps.findIndex((s) => s.status === 'in_progress')
                  if (currentIdx >= 0 && currentIdx < steps.length - 1) {
                    updateStepStatus(steps[currentIdx].id, 'skipped')
                    setCurrentStepIndex(currentIdx + 1)
                  }
                }}
              >
                <SkipForward className="w-4 h-4 mr-1" />
                Skip Step
              </Button>
            </>
          ) : (
            <>
              {!hasPRD && (
                <p className="text-sm text-amber-500 mr-4">
                  Generate a PRD first to start the workflow
                </p>
              )}
              <Button
                onClick={runFullWorkflow}
                disabled={!hasPRD || isRunning}
              >
                <Play className="w-4 h-4 mr-2" />
                Start Workflow
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
