'use client'

import { useSwarmStore } from '@/lib/store'
import type { Idea } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lightbulb,
  X,
  Sparkles,
  Rocket,
  ArrowRight,
} from 'lucide-react'

const COMPLEXITY_COLORS: Record<string, string> = {
  S: '#22c55e',
  M: '#3b82f6',
  L: '#f59e0b',
  XL: '#ef4444',
}

const COMPLEXITY_LABELS: Record<string, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
}

function IdeaCard({ idea, index }: { idea: Idea; index: number }) {
  const createProject = useSwarmStore((s) => s.createProject)
  const setMode = useSwarmStore((s) => s.setMode)
  const setActivePanel = useSwarmStore((s) => s.setActivePanel)

  const handleStart = () => {
    createProject(idea.title, idea.description)
    setMode('project')
    setActivePanel(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="rounded-xl border border-border bg-card/50 p-4 transition-colors hover:bg-card hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${COMPLEXITY_COLORS[idea.complexity]}15` }}
          >
            <Lightbulb className="h-3.5 w-3.5" style={{ color: COMPLEXITY_COLORS[idea.complexity] }} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{idea.title}</h3>
        </div>
        <Badge
          variant="outline"
          className="shrink-0 text-[10px] px-1.5 py-0"
          style={{ color: COMPLEXITY_COLORS[idea.complexity], borderColor: COMPLEXITY_COLORS[idea.complexity] }}
        >
          {idea.complexity} — {COMPLEXITY_LABELS[idea.complexity]}
        </Badge>
      </div>

      <p className="text-xs text-muted leading-relaxed mb-3">{idea.description}</p>

      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs w-full border-primary/30 text-primary hover:bg-primary/10"
        onClick={handleStart}
      >
        <Rocket className="h-3 w-3" />
        Start This Project
        <ArrowRight className="h-3 w-3 ml-auto" />
      </Button>
    </motion.div>
  )
}

export function IdeationBot({ onClose }: { onClose: () => void }) {
  const ideas = useSwarmStore((s) => s.ideas)
  const generateIdeas = useSwarmStore((s) => s.generateIdeas)

  return (
    <div className="flex h-full flex-col border-l border-border bg-background" style={{ width: 420 }}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-foreground">Idea Generator</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={generateIdeas}
          >
            <Sparkles className="h-3 w-3" />
            Generate Ideas
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        {ideas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-2xl bg-yellow-400/5 blur-2xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400/20 to-yellow-400/5 border border-yellow-400/10">
                <Lightbulb className="h-8 w-8 text-yellow-400" />
              </div>
            </div>
            <p className="text-sm font-medium text-foreground">Need project ideas?</p>
            <p className="text-xs text-muted mt-1 max-w-[240px]">
              Click &quot;Generate Ideas&quot; to get AI-powered project suggestions you can start building immediately.
            </p>
            <Button
              className="mt-4 gap-1.5"
              size="sm"
              onClick={generateIdeas}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate Ideas
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {ideas.map((idea, i) => (
                <IdeaCard key={idea.id} idea={idea} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
