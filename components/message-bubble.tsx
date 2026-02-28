'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { ChatMessage } from '@/lib/types'
import { ROLE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { sanitizeOutputText } from '@/lib/output-sanitize'
import { useSwarmStore } from '@/lib/store'
import { markdownComponents } from '@/components/code-block'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Bot, User, ChevronDown } from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const extendedMarkdownComponents: Components = {
  ...markdownComponents,
  table: ({ children, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-card/50 text-xs text-muted" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-2 text-left font-medium" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border-t border-border px-3 py-2 text-muted" {...props}>
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="transition-colors hover:bg-zinc-800/30" {...props}>
      {children}
    </tr>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-3 border-l-2 border-primary/50 pl-4 italic text-muted" {...props}>
      {children}
    </blockquote>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  hr: (props) => <hr className="my-4 border-border" {...props} />,
}

function stripRunnerNoise(content: string): string {
  const noiseLine = /^\s*(\[?(api runner|gemini model|provider|runtime|confidence score|confidence)\]?)(\s*[:=].*)?\s*$/i
  return content
    .split('\n')
    .filter((line) => !noiseLine.test(line.trim()))
    .join('\n')
    .trim()
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const uiPreferences = useSwarmStore((s) => s.uiPreferences)
  const [contentExpanded, setContentExpanded] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [agentSummaryOpen, setAgentSummaryOpen] = useState(false)
  const [showCodeSnippets, setShowCodeSnippets] = useState(true)

  const relativeTime = useMemo(() => formatRelativeTime(message.timestamp), [message.timestamp])
  const safeContent = useMemo(() => sanitizeOutputText(message.content), [message.content])
  const cleanedContent = useMemo(() => stripRunnerNoise(safeContent), [safeContent])
  const containsCodeSnippets = /```[\s\S]*?```/.test(cleanedContent)
  const isLongResponse = cleanedContent.length > 1800
  const guided = uiPreferences.experienceLevel === 'guided'
  const showConfidenceInline = !guided || uiPreferences.responseStyle === 'technical'

  useEffect(() => {
    const nextVisible =
      uiPreferences.codeSnippetPolicy === 'always' ||
      (!guided && uiPreferences.codeSnippetPolicy !== 'on_demand')
    setShowCodeSnippets(nextVisible)
  }, [guided, uiPreferences.codeSnippetPolicy])

  const displayContent = useMemo(() => {
    if (!containsCodeSnippets || showCodeSnippets || uiPreferences.codeSnippetPolicy === 'always') {
      return cleanedContent
    }
    return cleanedContent.replace(
      /```[\s\S]*?```/g,
      '```text\nCode snippet hidden for guided readability. Use "Show code snippets" to expand.\n```'
    )
  }, [containsCodeSnippets, cleanedContent, showCodeSnippets, uiPreferences.codeSnippetPolicy])

  if (message.role === 'system') {
    return (
      <div className="flex justify-center" data-testid="message">
        <p className="max-w-md text-center text-xs text-muted">{message.content}</p>
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-testid="message">
        <div className="flex max-w-[80%] items-start gap-3">
          <div className="space-y-1">
            <div className="rounded-2xl bg-primary/20 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm text-foreground">{message.content}</p>
            </div>
            <span className="block text-right text-[10px] text-muted/60">{relativeTime}</span>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
            <User className="h-4 w-4 text-primary" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start" data-testid="message">
      <div className="flex max-w-[90%] items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Assistant</span>
                {guided ? (
                  <p className="text-[10px] text-muted">Summary-first response</p>
                ) : null}
              </div>
              {showConfidenceInline && message.outputQualityPassed !== false && message.confidence !== undefined && (
                <ConfidenceBadge score={message.confidence} sources={message.sources} />
              )}
            </div>

            <div
              className={cn(
                'prose prose-sm max-w-none text-foreground dark:prose-invert [&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_pre]:rounded-lg [&_ul]:my-1.5',
                !contentExpanded && isLongResponse && 'max-h-[420px] overflow-y-auto pr-2'
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={extendedMarkdownComponents}>
                {displayContent}
              </ReactMarkdown>
            </div>

            {containsCodeSnippets && uiPreferences.codeSnippetPolicy !== 'always' && (
              <div className="mt-3 border-t border-border/70 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCodeSnippets((value) => !value)}
                  className="text-xs text-primary hover:underline"
                >
                  {showCodeSnippets ? 'Hide code snippets' : 'Show code snippets'}
                </button>
              </div>
            )}

            {isLongResponse && (
              <div className="mt-3 border-t border-border/70 pt-2">
                <button
                  type="button"
                  onClick={() => setContentExpanded((value) => !value)}
                  className="text-xs text-primary hover:underline"
                >
                  {contentExpanded ? 'Show compact view' : 'Expand full response'}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted/60">{relativeTime}</span>
            {!showConfidenceInline && message.outputQualityPassed !== false && message.confidence !== undefined ? (
              <span className="text-[10px] text-muted/60">Confidence: {Math.round(message.confidence)}%</span>
            ) : null}
          </div>

          {message.logs && message.logs.length > 0 && (
            <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-foreground"
                >
                  <ChevronDown className={cn('h-3 w-3 transition-transform', logsOpen && 'rotate-180')} />
                  Runtime Logs ({message.logs.length})
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-border bg-background/80 p-2 font-mono text-[11px] leading-5">
                  {message.logs.map((entry, index) => (
                    <div
                      key={`${entry.timestamp}-${index}`}
                      className="mb-2 rounded-md border border-border/70 bg-card/40 px-2 py-1.5 last:mb-0"
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.08em] text-muted">
                        <span>{entry.level}</span>
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                      {entry.agentId ? (
                        <div className="mb-1 text-[10px] text-muted">{entry.agentId}</div>
                      ) : null}
                      <div className="whitespace-pre-wrap break-words text-foreground/95">
                        {sanitizeOutputText(entry.text)}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {message.agents && message.agents.length > 0 && (
            <Collapsible open={agentSummaryOpen} onOpenChange={setAgentSummaryOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-foreground"
                >
                  <ChevronDown className={cn('h-3 w-3 transition-transform', agentSummaryOpen && 'rotate-180')} />
                  {message.agents.length} agent{message.agents.length !== 1 ? 's' : ''} used
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.agents.map((agent) => (
                    <Badge key={agent.id} variant="outline" className="text-xs">
                      {ROLE_LABELS[agent.role]} - {agent.status}
                    </Badge>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  )
}
