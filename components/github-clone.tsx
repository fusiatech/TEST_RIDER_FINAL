'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSwarmStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GitBranch, FolderOpen, Key, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface GitHubCloneProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CloneStatus = 'idle' | 'cloning' | 'success' | 'error'

export function GitHubClone({ open, onOpenChange }: GitHubCloneProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [destination, setDestination] = useState('')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<CloneStatus>('idle')
  const [output, setOutput] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const updateSettings = useSwarmStore((s) => s.updateSettings)
  const settings = useSwarmStore((s) => s.settings)
  
  const terminalIdRef = useRef<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const parseRepoUrl = useCallback((url: string): { owner: string; repo: string } | null => {
    const trimmed = url.trim()
    
    const fullUrlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/)
    if (fullUrlMatch) {
      return { owner: fullUrlMatch[1], repo: fullUrlMatch[2] }
    }
    
    const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/)
    if (shortMatch) {
      return { owner: shortMatch[1], repo: shortMatch[2] }
    }
    
    return null
  }, [])

  const getCloneUrl = useCallback((url: string, authToken?: string): string => {
    const parsed = parseRepoUrl(url)
    if (!parsed) return url
    
    if (authToken) {
      return `https://${authToken}@github.com/${parsed.owner}/${parsed.repo}.git`
    }
    return `https://github.com/${parsed.owner}/${parsed.repo}.git`
  }, [parseRepoUrl])

  const createTerminalSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: 120, rows: 24 }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as { session: { id: string } }
      return data.session.id
    } catch {
      return null
    }
  }, [])

  const writeToTerminal = useCallback(async (terminalId: string, input: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/terminal/${terminalId}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const readTerminalOutput = useCallback(async (terminalId: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/terminal/${terminalId}`, { cache: 'no-store' })
      if (!res.ok) return null
      const data = (await res.json()) as { session: { scrollback: string } }
      return data.session.scrollback
    } catch {
      return null
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const handleClone = useCallback(async () => {
    const parsed = parseRepoUrl(repoUrl)
    if (!parsed) {
      setErrorMessage('Invalid repository URL. Use https://github.com/user/repo or user/repo format.')
      return
    }

    if (!destination.trim()) {
      setErrorMessage('Please specify a destination directory.')
      return
    }

    setStatus('cloning')
    setOutput('')
    setErrorMessage('')

    const terminalId = await createTerminalSession()
    if (!terminalId) {
      setStatus('error')
      setErrorMessage('Failed to create terminal session.')
      return
    }
    terminalIdRef.current = terminalId

    const cloneUrl = getCloneUrl(repoUrl, token.trim() || undefined)
    const destPath = destination.trim()
    
    const command = `git clone ${cloneUrl} "${destPath}" 2>&1; echo "CLONE_EXIT_CODE=$?"\n`
    
    const written = await writeToTerminal(terminalId, command)
    if (!written) {
      setStatus('error')
      setErrorMessage('Failed to execute clone command.')
      return
    }

    let attempts = 0
    const maxAttempts = 120

    pollIntervalRef.current = setInterval(async () => {
      attempts++
      
      const termOutput = await readTerminalOutput(terminalId)
      if (termOutput) {
        const sanitizedOutput = token 
          ? termOutput.replace(new RegExp(token, 'g'), '***TOKEN***')
          : termOutput
        setOutput(sanitizedOutput)

        if (termOutput.includes('CLONE_EXIT_CODE=0')) {
          stopPolling()
          setStatus('success')
          updateSettings({ projectPath: destPath })
          toast.success('Repository cloned successfully', {
            description: `Cloned to ${destPath}`,
          })
        } else if (termOutput.includes('CLONE_EXIT_CODE=')) {
          stopPolling()
          setStatus('error')
          const errorMatch = termOutput.match(/fatal:.*|error:.*/gi)
          setErrorMessage(errorMatch ? errorMatch.join('\n') : 'Clone failed with non-zero exit code.')
        }
      }

      if (attempts >= maxAttempts) {
        stopPolling()
        setStatus('error')
        setErrorMessage('Clone operation timed out.')
      }
    }, 500)
  }, [repoUrl, destination, token, parseRepoUrl, getCloneUrl, createTerminalSession, writeToTerminal, readTerminalOutput, stopPolling, updateSettings])

  const handleCancel = useCallback(() => {
    stopPolling()
    setStatus('idle')
    setOutput('')
    setErrorMessage('')
    onOpenChange(false)
  }, [stopPolling, onOpenChange])

  const resetForm = useCallback(() => {
    setRepoUrl('')
    setDestination('')
    setToken('')
    setStatus('idle')
    setOutput('')
    setErrorMessage('')
    terminalIdRef.current = null
  }, [])

  useEffect(() => {
    if (!open) {
      stopPolling()
      resetForm()
    }
  }, [open, stopPolling, resetForm])

  useEffect(() => {
    if (settings.projectPath && !destination) {
      const parentDir = settings.projectPath.replace(/[/\\][^/\\]+$/, '')
      if (parentDir) {
        setDestination(parentDir + '/')
      }
    }
  }, [settings.projectPath, destination])

  const isValidUrl = parseRepoUrl(repoUrl) !== null
  const canClone = isValidUrl && destination.trim() && status !== 'cloning'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Clone from GitHub
          </DialogTitle>
          <DialogDescription>
            Clone a GitHub repository to your local machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label htmlFor="repo-url" className="flex items-center gap-2 text-sm font-medium text-foreground">
              <GitBranch className="h-3.5 w-3.5 text-muted" />
              Repository URL
            </label>
            <Input
              id="repo-url"
              placeholder="https://github.com/user/repo or user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={status === 'cloning'}
              className={cn(
                repoUrl && !isValidUrl && 'border-destructive focus-visible:ring-destructive'
              )}
            />
            {repoUrl && !isValidUrl && (
              <p className="text-xs text-destructive">
                Invalid format. Use https://github.com/user/repo or user/repo
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="destination" className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FolderOpen className="h-3.5 w-3.5 text-muted" />
              Destination Directory
            </label>
            <Input
              id="destination"
              placeholder="/path/to/clone/directory"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={status === 'cloning'}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="token" className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Key className="h-3.5 w-3.5 text-muted" />
              GitHub Token
              <span className="text-xs text-muted font-normal">(optional, for private repos)</span>
            </label>
            <Input
              id="token"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={status === 'cloning'}
            />
          </div>

          {status === 'cloning' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cloning repository...
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/2 animate-progress-bar bg-primary" />
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              Repository cloned successfully!
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="wrap-break-word">{errorMessage}</span>
            </div>
          )}

          {output && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted">Output</span>
              <ScrollArea className="max-h-32">
                <pre className="rounded-md bg-[#0d0d0d] p-3 font-mono text-xs text-muted overflow-x-auto whitespace-pre-wrap">
                  {output}
                </pre>
              </ScrollArea>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={status === 'cloning'}
            >
              <X className="h-4 w-4" />
              {status === 'success' ? 'Close' : 'Cancel'}
            </Button>
            {status !== 'success' && (
              <Button
                onClick={handleClone}
                disabled={!canClone}
              >
                {status === 'cloning' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cloning...
                  </>
                ) : (
                  <>
                    <GitBranch className="h-4 w-4" />
                    Clone
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
