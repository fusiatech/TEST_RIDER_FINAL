'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, Check, X, GitMerge, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface ConflictFile {
  path: string
  ours: string
  theirs: string
  base: string
  merged: string
}

interface ConflictEditorProps {
  conflict: ConflictFile
  projectPath: string
  onResolved: () => void
  onCancel: () => void
}

export function ConflictEditor({ conflict, projectPath, onResolved, onCancel }: ConflictEditorProps) {
  const [resolution, setResolution] = useState(conflict.merged)
  const [saving, setSaving] = useState(false)

  const acceptOurs = () => setResolution(conflict.ours)
  const acceptTheirs = () => setResolution(conflict.theirs)
  const resetToMerged = () => setResolution(conflict.merged)

  const saveResolution = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/git/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          file: conflict.path, 
          resolution,
          projectPath,
        }),
      })
      
      if (res.ok) {
        toast.success(`Resolved ${conflict.path}`)
        onResolved()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save resolution')
      }
    } catch {
      toast.error('Failed to save resolution')
    } finally {
      setSaving(false)
    }
  }

  const fileName = conflict.path.split('/').pop() || conflict.path

  return (
    <Card className="border-yellow-500/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <span className="truncate flex-1" title={conflict.path}>
            {fileName}
          </span>
          <Badge variant="destructive" className="text-[10px]">Conflict</Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto"
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
        <p className="text-xs text-muted truncate">{conflict.path}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-green-500">Ours (Current)</span>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={acceptOurs}
                className="h-6 text-xs px-2"
              >
                <Check className="h-3 w-3 mr-1" /> Accept
              </Button>
            </div>
            <ScrollArea className="h-40">
              <pre className="bg-green-500/10 border border-green-500/20 rounded p-2 text-[10px] font-mono whitespace-pre-wrap break-all">
                {conflict.ours || '(empty)'}
              </pre>
            </ScrollArea>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-blue-500">Theirs (Incoming)</span>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={acceptTheirs}
                className="h-6 text-xs px-2"
              >
                <Check className="h-3 w-3 mr-1" /> Accept
              </Button>
            </div>
            <ScrollArea className="h-40">
              <pre className="bg-blue-500/10 border border-blue-500/20 rounded p-2 text-[10px] font-mono whitespace-pre-wrap break-all">
                {conflict.theirs || '(empty)'}
              </pre>
            </ScrollArea>
          </div>
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium">Resolution (edit below)</span>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={resetToMerged}
              className="h-6 text-xs px-2"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
          </div>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className={cn(
              "w-full h-40 font-mono text-[10px] bg-background border rounded p-2 resize-none",
              "focus:outline-none focus:ring-1 focus:ring-primary"
            )}
            spellCheck={false}
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={saveResolution} disabled={saving}>
            <GitMerge className="h-3.5 w-3.5 mr-1" />
            {saving ? 'Saving...' : 'Mark Resolved'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface ConflictListProps {
  conflicts: ConflictFile[]
  projectPath: string
  onConflictResolved: () => void
}

export function ConflictList({ conflicts, projectPath, onConflictResolved }: ConflictListProps) {
  const [selectedConflict, setSelectedConflict] = useState<ConflictFile | null>(null)

  if (selectedConflict) {
    return (
      <ConflictEditor
        conflict={selectedConflict}
        projectPath={projectPath}
        onResolved={() => {
          setSelectedConflict(null)
          onConflictResolved()
        }}
        onCancel={() => setSelectedConflict(null)}
      />
    )
  }

  return (
    <div className="space-y-1">
      {conflicts.map((conflict) => {
        const fileName = conflict.path.split('/').pop() || conflict.path
        const dirPath = conflict.path.includes('/') 
          ? conflict.path.slice(0, conflict.path.lastIndexOf('/'))
          : ''

        return (
          <button
            key={conflict.path}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-yellow-500/10 transition-colors"
            onClick={() => setSelectedConflict(conflict)}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            <span className="truncate flex-1 text-left">
              <span className="text-foreground">{fileName}</span>
              {dirPath && (
                <span className="text-muted ml-1">{dirPath}</span>
              )}
            </span>
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
              Conflict
            </Badge>
          </button>
        )
      })}
    </div>
  )
}
