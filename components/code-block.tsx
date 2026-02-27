'use client'

import React, { useState, useEffect, type ReactNode } from 'react'
import { Copy, Check, FileCode } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [html, setHtml] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki')
        const result = await codeToHtml(code, {
          lang: language ?? 'text',
          theme: 'github-dark',
        })
        if (!cancelled) {
          setHtml(result)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setHtml('')
          setIsLoading(false)
        }
      }
    }

    highlight()
    return () => { cancelled = true }
  }, [code, language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleInsertToVSCode = () => {
    toast.info('Insert is currently unavailable', {
      description: 'The VS Code bridge is not configured in this environment.',
    })
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-zinc-800 bg-[#0d0d0d]">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <span className="text-xs font-medium text-zinc-400">
          {language ?? 'text'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleInsertToVSCode}
            className="h-7 gap-1.5 px-2 text-xs text-zinc-400 hover:text-zinc-200"
          >
            <FileCode className="h-3.5 w-3.5" />
            Insert
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1.5 px-2 text-xs text-zinc-400 hover:text-zinc-200"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-800" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-800" />
          </div>
        ) : html ? (
          <div
            className={cn(
              'text-sm [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!bg-transparent',
              'font-mono leading-relaxed'
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="text-sm font-mono leading-relaxed text-zinc-300">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

export const markdownComponents: Record<string, React.ComponentType<React.HTMLAttributes<HTMLElement> & { children?: ReactNode }>> = {
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: ReactNode }) => {
    const match = /language-(\w+)/.exec(className ?? '')
    if (match) {
      return <CodeBlock code={String(children).trim()} language={match[1]} />
    }
    return (
      <code
        className={cn(
          'rounded bg-zinc-800 px-1.5 py-0.5 text-sm font-mono text-purple-300',
          className
        )}
        {...props}
      >
        {children}
      </code>
    )
  },
}
