'use client'

import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@/lib/types'
import { ROLE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { markdownComponents } from '@/components/code-block'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Bot, User, ChevronDown } from 'lucide-react'
import type { Components } from 'react-markdown'

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
    <div className="my-3 overflow-x-auto rounded-lg border border-zinc-800">
      <table className="min-w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-zinc-900/50 text-xs text-zinc-400" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-2 text-left font-medium" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border-t border-zinc-800 px-3 py-2 text-zinc-300" {...props}>
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="hover:bg-zinc-800/30 transition-colors" {...props}>
      {children}
    </tr>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-3 border-l-2 border-primary/50 pl-4 italic text-zinc-400"
      {...props}
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary transition-colors"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  hr: (props) => (
    <hr className="my-4 border-zinc-800" {...props} />
  ),
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [agentSummaryOpen, setAgentSummaryOpen] = useState(false)

  const relativeTime = useMemo(() => formatRelativeTime(message.timestamp), [message.timestamp])

  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <p className="max-w-md text-center text-xs text-muted">{message.content}</p>
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[80%] items-start gap-3">
          <div className="space-y-1">
            <div className="rounded-2xl bg-primary/20 px-4 py-3">
              <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
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
    <div className="flex justify-start">
      <div className="flex max-w-[80%] items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card border border-border">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-card border border-border px-4 py-3">
            <div className="prose prose-invert prose-sm max-w-none text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={extendedMarkdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted/60">{relativeTime}</span>
            {message.confidence !== undefined && (
              <ConfidenceBadge score={message.confidence} sources={message.sources} />
            )}
          </div>

          {message.agents && message.agents.length > 0 && (
            <Collapsible open={agentSummaryOpen} onOpenChange={setAgentSummaryOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors">
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 transition-transform',
                      agentSummaryOpen && 'rotate-180'
                    )}
                  />
                  {message.agents.length} agent{message.agents.length !== 1 ? 's' : ''} used
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.agents.map((agent) => (
                    <Badge
                      key={agent.id}
                      variant="outline"
                      className="text-xs"
                    >
                      {ROLE_LABELS[agent.role]} — {agent.status}
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
