'use client'

import { useMemo } from 'react'
import { useSwarmStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NoDataState } from '@/components/ui/no-data-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Lightbulb, Sparkles, FolderPlus, MessageCircle } from 'lucide-react'

const COMPLEXITY_TONE: Record<string, string> = {
  S: 'border-emerald-500/40 text-emerald-500',
  M: 'border-blue-500/40 text-blue-500',
  L: 'border-amber-500/40 text-amber-500',
  XL: 'border-rose-500/40 text-rose-500',
}

export function IdeasWorkspace() {
  const ideas = useSwarmStore((s) => s.ideas)
  const ideasLoading = useSwarmStore((s) => s.ideasLoading)
  const generateIdeas = useSwarmStore((s) => s.generateIdeas)
  const createProject = useSwarmStore((s) => s.createProject)
  const createSession = useSwarmStore((s) => s.createSession)
  const setMode = useSwarmStore((s) => s.setMode)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)

  const totals = useMemo(() => {
    return {
      total: ideas.length,
      large: ideas.filter((idea) => idea.complexity === 'L' || idea.complexity === 'XL').length,
    }
  }, [ideas])

  const handlePromoteToProject = (title: string, description: string) => {
    createProject(title, description)
    setMode('project')
    setActiveTab('dashboard')
  }

  const handleOpenConversation = () => {
    setMode('chat')
    setActiveTab('chat')
    createSession()
  }

  return (
    <section className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Ideas Workspace</p>
          <p className="text-xs text-muted">Generate and promote ideas into project execution.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {totals.total} ideas
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={generateIdeas}
            disabled={ideasLoading}
            data-action-id="ideas-generate"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {ideasLoading ? 'Generating...' : 'Generate ideas'}
          </Button>
        </div>
      </div>

      {ideasLoading ? (
        <div className="min-h-[220px] rounded-xl border border-border/60 bg-background/60 p-4">
          <LoadingState
            variant="workflow"
            size="md"
            text="Generating idea set..."
            steps={['Discover', 'Frame', 'Score', 'Ready']}
            activeStep={2}
          />
        </div>
      ) : ideas.length === 0 ? (
        <NoDataState
          title="No ideas generated yet"
          description="Generate ideas, then promote the best candidate into a project."
          className="min-h-[220px]"
        />
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <div key={idea.id} className="rounded-lg border border-border/70 bg-background/70 p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{idea.title}</p>
                  <p className="mt-1 text-xs text-muted">{idea.description}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${COMPLEXITY_TONE[idea.complexity] ?? ''}`}>
                  {idea.complexity}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => handlePromoteToProject(idea.title, idea.description)}
                  data-action-id={`idea-promote-${idea.id}`}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Promote to project
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleOpenConversation}
                  data-action-id={`idea-conversation-${idea.id}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Open conversation
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totals.large > 0 ? (
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted">
          <Lightbulb className="h-3.5 w-3.5" />
          {totals.large} ideas are large-scope and suited for project mode.
        </p>
      ) : null}
    </section>
  )
}
