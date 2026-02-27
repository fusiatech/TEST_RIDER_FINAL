'use client'

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSwarmStore } from '@/lib/store'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageBubble } from '@/components/message-bubble'
import { AgentCard } from '@/components/agent-card'
import { AgentDashboard } from '@/components/agent-dashboard'
import { ProjectDashboard } from '@/components/project-dashboard'
import { TestingDashboard } from '@/components/testing-dashboard'
import { EclipseDashboard } from '@/components/eclipse-dashboard'
import { ObservabilityDashboard } from '@/components/observability-dashboard'
import { LivePreview } from '@/components/live-preview'
import { DevEnvironment } from '@/components/dev-environment'
import { FileUpload } from '@/components/file-upload'
import { VoiceInputButton, VoiceInputIndicator } from '@/components/voice-input-button'
import { SpellCheckInput } from '@/components/spell-check-input'
import { ErrorBoundary } from '@/components/error-boundary'
import { MinimalErrorFallback } from '@/components/error-fallback'
import { ROLE_LABELS } from '@/lib/types'
import type { Attachment } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Send,
  Square,
  Loader2,
  MessageCircle,
  LayoutDashboard,
  Sparkles,
  Code2,
  TestTube2,
  Bug,
  Shield,
  ChevronDown,
  Zap,
  FolderKanban,
  Globe,
  Hammer,
  Rocket,
  Eye,
  CircleHelp,
  Cpu,
  BarChart3,
} from 'lucide-react'

import type { AppMode } from '@/lib/store'

const CHAT_PROMPTS = [
  { icon: Globe, text: 'What is the best way to handle auth?', color: '#60a5fa' },
  { icon: Bug, text: 'Explain this error and how to fix it', color: '#fbbf24' },
  { icon: Code2, text: 'How do I optimize this React component?', color: '#34d399' },
  { icon: Shield, text: 'What security best practices should I follow?', color: '#f87171' },
]

const SWARM_PROMPTS = [
  { icon: Code2, text: 'Refactor the auth module', color: '#34d399' },
  { icon: TestTube2, text: 'Add unit tests for the data layer', color: '#60a5fa' },
  { icon: Bug, text: 'Fix the performance issue in the data table', color: '#fbbf24' },
  { icon: Shield, text: 'Review security of the API endpoints', color: '#f87171' },
]

const PROJECT_PROMPTS = [
  { icon: Rocket, text: 'Build a SaaS dashboard with auth and billing', color: '#a78bfa' },
  { icon: Hammer, text: 'Create a CLI tool that generates boilerplate', color: '#34d399' },
  { icon: Zap, text: 'Build an API for real-time notifications', color: '#fbbf24' },
  { icon: FolderKanban, text: 'Create a project management app', color: '#60a5fa' },
]

const MODE_PROMPTS: Record<AppMode, typeof CHAT_PROMPTS> = {
  chat: CHAT_PROMPTS,
  swarm: SWARM_PROMPTS,
  project: PROJECT_PROMPTS,
}

const MODE_LABELS: Record<AppMode, string> = {
  chat: 'Chat',
  swarm: 'Swarm',
  project: 'Project',
}

const VALID_TABS = ['chat', 'dashboard', 'ide', 'testing', 'eclipse', 'observability'] as const
type TabType = typeof VALID_TABS[number]

function isValidTab(tab: string | null): tab is TabType {
  return tab !== null && VALID_TABS.includes(tab as TabType)
}

export function ChatView() {
  const [input, setInput] = useState('')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const agentDropdownRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const searchParams = useSearchParams()
  const router = useRouter()

  const messages = useSwarmStore((s) => s.messages)
  const agents = useSwarmStore((s) => s.agents)
  const isRunning = useSwarmStore((s) => s.isRunning)
  const sendMessage = useSwarmStore((s) => s.sendMessage)
  const cancelSwarm = useSwarmStore((s) => s.cancelSwarm)
  const activeTab = useSwarmStore((s) => s.activeTab)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const wsConnected = useSwarmStore((s) => s.wsConnected)
  const mode = useSwarmStore((s) => s.mode)
  const settings = useSwarmStore((s) => s.settings)
  const selectedAgent = useSwarmStore((s) => s.selectedAgent)
  const setSelectedAgent = useSwarmStore((s) => s.setSelectedAgent)
  const showPreview = useSwarmStore((s) => s.showPreview)
  const togglePreview = useSwarmStore((s) => s.togglePreview)

  // G-IA-01: Sync tab state with URL on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (isValidTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [searchParams, activeTab, setActiveTab])

  // G-IA-01: Update URL when tab changes
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.push(`?${params.toString()}`, { scroll: false })
  }, [setActiveTab, searchParams, router])

  const enabledCLIs = CLI_REGISTRY.filter((cli) => settings.enabledCLIs.includes(cli.id))
  const currentAgent = enabledCLIs.find((c) => c.id === selectedAgent) ?? enabledCLIs[0] ?? CLI_REGISTRY[0]

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, agents, scrollToBottom])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setAgentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSend = (text?: string) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || isRunning) return
    sendMessage(trimmed, attachments)
    setInput('')
    setAttachments([])
  }

  const handleCancel = () => {
    cancelSwarm()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape' && agentDropdownOpen) {
      setAgentDropdownOpen(false)
    }
  }

  const handleVoiceTranscript = useCallback((transcript: string, _isFinal: boolean) => {
    setInput(transcript)
  }, [])

  const handleVoiceListeningChange = useCallback((listening: boolean) => {
    setIsVoiceListening(listening)
  }, [])

  const runningAgents = agents.filter((a) => a.status === 'running' || a.status === 'spawning')
  const currentPrompts = MODE_PROMPTS[mode]

  const showProjectDashboard = mode === 'project' && activeTab === 'dashboard'

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">SwarmUI</h1>
          <Badge variant="secondary">v1.0.0</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showPreview ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={togglePreview}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
          <div className="flex rounded-lg border border-border bg-secondary/30 p-0.5" role="tablist" aria-label="Main navigation">
            <button
              role="tab"
              aria-selected={activeTab === 'chat'}
              onClick={() => handleTabChange('chat')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'chat'
                  ? 'bg-primary text-background shadow-sm tab-active-indicator'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'dashboard'}
              onClick={() => handleTabChange('dashboard')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'dashboard'
                  ? 'bg-primary text-background shadow-sm tab-active-indicator'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
              {agents.length > 0 && (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] text-primary">
                  {agents.length}
                </span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'testing'}
              onClick={() => handleTabChange('testing')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'testing'
                  ? 'bg-primary text-background shadow-sm tab-active-indicator'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <TestTube2 className="h-3.5 w-3.5" />
              Testing
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'eclipse'}
              onClick={() => handleTabChange('eclipse')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'eclipse'
                  ? 'bg-primary text-background shadow-sm tab-active-indicator'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <Cpu className="h-3.5 w-3.5" />
              Eclipse
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'ide'}
              onClick={() => handleTabChange('ide')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'ide'
                  ? 'bg-primary text-background shadow-sm tab-active-indicator'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              IDE
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'observability'}
              onClick={() => handleTabChange('observability')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'observability'
                  ? 'bg-primary text-background shadow-sm tab-active-indicator'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Observability
            </button>
          </div>
          {isRunning && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted">Swarm running...</span>
            </div>
          )}
          {!wsConnected && (
            <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-600">
              Connecting...
            </Badge>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'ide' ? (
          <motion.div
            key="ide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 min-h-0"
          >
            <ErrorBoundary
              fallback={(props) => (
                <div className="flex h-full items-center justify-center p-8">
                  <MinimalErrorFallback {...props} />
                </div>
              )}
            >
              <DevEnvironment />
            </ErrorBoundary>
          </motion.div>
        ) : activeTab === 'testing' ? (
          <motion.div key="testing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0 overflow-auto">
            <TestingDashboard />
          </motion.div>
        ) : activeTab === 'eclipse' ? (
          <motion.div key="eclipse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0 overflow-auto">
            <EclipseDashboard />
          </motion.div>
        ) : activeTab === 'observability' ? (
          <motion.div key="observability" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-h-0 overflow-auto">
            <ObservabilityDashboard />
          </motion.div>
        ) : activeTab === 'chat' ? (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 min-h-0"
          >
            <ErrorBoundary
              fallback={(props) => (
                <div className="flex h-full items-center justify-center p-8">
                  <MinimalErrorFallback {...props} />
                </div>
              )}
            >
              <ScrollArea className="h-full">
                <div className="mx-auto max-w-3xl space-y-4 p-6">
                  {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 rounded-3xl bg-primary/5 blur-2xl" />
                      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
                        <Sparkles className="h-10 w-10 text-primary" />
                      </div>
                    </div>
                    <h2 className="text-xl font-bold text-foreground">
                      Welcome to SwarmUI
                    </h2>
                    <p className="mt-2 max-w-md text-sm text-muted">
                      {mode === 'chat' && 'Ask questions and get intelligent answers from AI agents.'}
                      {mode === 'swarm' && 'Describe a task and a swarm of AI agents will work together to complete it.'}
                      {mode === 'project' && 'Describe a project and we\'ll decompose it into tasks with a full development pipeline.'}
                    </p>
                    <Badge variant="outline" className="mt-2 text-xs">
                      {MODE_LABELS[mode]} Mode
                    </Badge>

                    <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                      {currentPrompts.map((prompt) => (
                        <button
                          key={prompt.text}
                          onClick={() => handleSend(prompt.text)}
                          className="group flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4 text-left transition-all hover:border-primary/30 hover:bg-card"
                        >
                          <prompt.icon
                            className="mt-0.5 h-4 w-4 shrink-0 transition-colors"
                            style={{ color: prompt.color }}
                          />
                          <span className="text-sm text-muted group-hover:text-foreground transition-colors">
                            {prompt.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <MessageBubble message={message} />
                      {message.role === 'assistant' && message.agents && message.agents.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <AnimatePresence>
                            {message.agents.map((agent) => (
                              <AgentCard key={agent.id} agent={agent} />
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isRunning && agents.length === 0 && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                )}

                {isRunning && agents.length > 0 && (
                  <AnimatePresence mode="popLayout">
                    <div className="space-y-2 animate-fade-in">
                      {agents.map((agent) => (
                        <AgentCard key={agent.id} agent={agent} />
                      ))}
                    </div>
                  </AnimatePresence>
                )}

                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            </ErrorBoundary>
          </motion.div>
        ) : showProjectDashboard ? (
          <motion.div
            key="project-dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 min-h-0"
          >
            <ScrollArea className="h-full">
              <ProjectDashboard />
              <div ref={bottomRef} />
            </ScrollArea>
          </motion.div>
        ) : (
          <motion.div
            key="agent-dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 min-h-0"
          >
            <ScrollArea className="h-full">
              <AgentDashboard />
              {showPreview && (
                <div className="px-6 pb-6">
                  <LivePreview />
                </div>
              )}
              <div ref={bottomRef} />
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      {runningAgents.length > 0 && activeTab === 'chat' && (
        <div className="border-t border-border bg-card/50 px-4 py-2">
          <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto">
            {runningAgents.map((agent) => (
              <Badge
                key={agent.id}
                variant="outline"
                className="shrink-0 animate-pulse-dot gap-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                {ROLE_LABELS[agent.role]} {agent.status === 'spawning' ? 'spawning...' : 'running...'}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border p-4">
        <div className="mx-auto max-w-3xl space-y-2">
          {(input.length > 500 || isVoiceListening) && (
            <div className="flex items-center justify-between px-1">
              {isVoiceListening ? (
                <VoiceInputIndicator isListening={isVoiceListening} />
              ) : (
                <span />
              )}
              {input.length > 500 && (
                <span className={cn(
                  'text-[10px] tabular-nums',
                  input.length > 4000 ? 'text-destructive' : 'text-muted'
                )}>
                  {input.length.toLocaleString()} characters
                </span>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="group relative" title="Attach file">
              <FileUpload
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </div>
            {/* Agent selector dropdown */}
            <div ref={agentDropdownRef} className="relative">
              <button
                onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                aria-label={`Select agent: ${currentAgent.name}`}
                aria-expanded={agentDropdownOpen}
                aria-haspopup="listbox"
                className={cn(
                  'flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-medium transition-all',
                  agentDropdownOpen
                    ? 'border-primary/50 text-foreground ring-2 ring-primary/20'
                    : 'border-border text-muted hover:text-foreground hover:border-border'
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: currentAgent.installed !== false ? '#22c55e' : '#ef4444' }}
                />
                <span className="max-w-[80px] truncate">{currentAgent.name.split(' ')[0]}</span>
                <ChevronDown className={cn(
                  'h-3 w-3 transition-transform',
                  agentDropdownOpen && 'rotate-180'
                )} />
              </button>
              {agentDropdownOpen && (
                <div role="listbox" aria-label="Agent selector" className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl animate-fade-in">
                  <div className="mb-1.5 px-2 py-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted">Select Agent</span>
                  </div>
                  {enabledCLIs.map((cli) => (
                    <button
                      key={cli.id}
                      role="option"
                      aria-selected={selectedAgent === cli.id || (!selectedAgent && cli.id === currentAgent.id)}
                      onClick={() => {
                        setSelectedAgent(cli.id)
                        setAgentDropdownOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                        (selectedAgent === cli.id || (!selectedAgent && cli.id === currentAgent.id))
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted hover:bg-secondary hover:text-foreground'
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
                        style={{ backgroundColor: cli.installed !== false ? '#22c55e' : '#ef4444' }}
                      />
                      <span className="flex-1 text-left">{cli.name}</span>
                      {cli.installed === false && (
                        <span className="text-[10px] text-muted">not found</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative flex-1">
              <label className="sr-only" htmlFor="chat-input">Message input</label>
              <SpellCheckInput
                id="chat-input"
                value={input}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'project' ? 'Describe a feature or task for this project...' : 'Describe your task...'}
                rows={1}
                autoResize
                maxHeight={200}
                minHeight={44}
                showInlineErrors={true}
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-shadow [&_textarea]:bg-transparent [&_textarea]:border-0 [&_textarea]:p-0 [&_textarea]:focus:ring-0 [&_textarea]:focus:ring-offset-0"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl text-muted hover:text-foreground"
              aria-label="Help and keyboard shortcuts"
              title="Help — Enter to send, Shift+Enter for new line"
            >
              <CircleHelp className="h-4 w-4" />
            </Button>

            <VoiceInputButton
              onTranscript={handleVoiceTranscript}
              onListeningChange={handleVoiceListeningChange}
              disabled={isRunning}
              showSettings={false}
              appendMode={true}
            />

            {isRunning ? (
              <Button
                variant="destructive"
                size="icon"
                onClick={handleCancel}
                className="h-11 w-11 shrink-0 rounded-xl"
                aria-label="Cancel running swarm"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={cn(
                  'h-11 w-11 shrink-0 rounded-xl transition-colors btn-press',
                  input.trim() ? 'bg-primary hover:bg-primary/90' : 'bg-muted/50'
                )}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
