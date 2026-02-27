'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus,
  Save,
  RotateCcw,
  History,
  FileText,
  Trash2,
  RefreshCw,
  ChevronRight,
  GitCompare,
} from 'lucide-react'
import type { Prompt, PromptVersion, PromptCategory } from '@/lib/types'
import { toast } from 'sonner'

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  system: 'System',
  stage: 'Pipeline Stage',
  tool: 'Tool',
  custom: 'Custom',
}

const CATEGORY_COLORS: Record<PromptCategory, string> = {
  system: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  stage: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  tool: 'bg-green-500/20 text-green-700 dark:text-green-400',
  custom: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
}

interface PromptEditorProps {
  className?: string
}

export function PromptEditor({ className }: PromptEditorProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [editContent, setEditContent] = useState('')
  const [versionDescription, setVersionDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showDiffDialog, setShowDiffDialog] = useState(false)
  const [diffVersions, setDiffVersions] = useState<{ v1: PromptVersion | null; v2: PromptVersion | null }>({ v1: null, v2: null })
  
  const [newPrompt, setNewPrompt] = useState({
    name: '',
    category: 'custom' as PromptCategory,
    description: '',
    content: '',
  })

  const fetchPrompts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryFilter && categoryFilter !== 'all') {
        params.set('category', categoryFilter)
      }
      
      const response = await fetch(`/api/prompts?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch prompts')
      }
      
      const data = await response.json()
      setPrompts(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch prompts')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  const selectPrompt = (prompt: Prompt) => {
    setSelectedPrompt(prompt)
    const activeVersion = prompt.versions.find((v) => v.isActive)
    setEditContent(activeVersion?.content ?? '')
    setVersionDescription('')
  }

  const savePrompt = async () => {
    if (!selectedPrompt) return
    
    const activeVersion = selectedPrompt.versions.find((v) => v.isActive)
    if (editContent === activeVersion?.content) {
      toast.info('No changes to save')
      return
    }
    
    setSaving(true)
    try {
      const response = await fetch(`/api/prompts/${selectedPrompt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editContent,
          versionDescription: versionDescription || `Version ${selectedPrompt.currentVersion + 1}`,
        }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to save prompt')
      }
      
      const updatedPrompt = await response.json()
      setSelectedPrompt(updatedPrompt)
      setPrompts((prev) => prev.map((p) => (p.id === updatedPrompt.id ? updatedPrompt : p)))
      setVersionDescription('')
      toast.success('Prompt saved successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save prompt')
    } finally {
      setSaving(false)
    }
  }

  const rollbackToVersion = async (version: number) => {
    if (!selectedPrompt) return
    
    setSaving(true)
    try {
      const response = await fetch(`/api/prompts/${selectedPrompt.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to rollback')
      }
      
      const updatedPrompt = await response.json()
      setSelectedPrompt(updatedPrompt)
      setPrompts((prev) => prev.map((p) => (p.id === updatedPrompt.id ? updatedPrompt : p)))
      const activeVersion = updatedPrompt.versions.find((v: PromptVersion) => v.isActive)
      setEditContent(activeVersion?.content ?? '')
      setShowHistoryDialog(false)
      toast.success(`Rolled back to version ${version}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rollback')
    } finally {
      setSaving(false)
    }
  }

  const createPrompt = async () => {
    if (!newPrompt.name || !newPrompt.content) {
      toast.error('Name and content are required')
      return
    }
    
    setSaving(true)
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrompt),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to create prompt')
      }
      
      const created = await response.json()
      setPrompts((prev) => [...prev, created])
      setSelectedPrompt(created)
      setEditContent(newPrompt.content)
      setShowCreateDialog(false)
      setNewPrompt({ name: '', category: 'custom', description: '', content: '' })
      toast.success('Prompt created successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create prompt')
    } finally {
      setSaving(false)
    }
  }

  const deletePrompt = async () => {
    if (!selectedPrompt) return
    
    if (!confirm(`Are you sure you want to delete "${selectedPrompt.name}"?`)) {
      return
    }
    
    setSaving(true)
    try {
      const response = await fetch(`/api/prompts/${selectedPrompt.id}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to delete prompt')
      }
      
      setPrompts((prev) => prev.filter((p) => p.id !== selectedPrompt.id))
      setSelectedPrompt(null)
      setEditContent('')
      toast.success('Prompt deleted successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete prompt')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const computeDiff = (oldText: string, newText: string): { type: 'add' | 'remove' | 'same'; text: string }[] => {
    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')
    const result: { type: 'add' | 'remove' | 'same'; text: string }[] = []
    
    const maxLen = Math.max(oldLines.length, newLines.length)
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i]
      const newLine = newLines[i]
      
      if (oldLine === newLine) {
        result.push({ type: 'same', text: oldLine ?? '' })
      } else {
        if (oldLine !== undefined) {
          result.push({ type: 'remove', text: oldLine })
        }
        if (newLine !== undefined) {
          result.push({ type: 'add', text: newLine })
        }
      }
    }
    
    return result
  }

  const hasChanges = selectedPrompt && editContent !== selectedPrompt.versions.find((v) => v.isActive)?.content

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 ${className}`}>
      <Card className="lg:col-span-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Prompts
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={fetchPrompts} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Prompt</DialogTitle>
                    <DialogDescription>
                      Add a new prompt template to the system
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={newPrompt.name}
                        onChange={(e) => setNewPrompt((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Enter prompt name..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select
                        value={newPrompt.category}
                        onValueChange={(value) => setNewPrompt((p) => ({ ...p, category: value as PromptCategory }))}
                      >
                        <SelectTrigger id="category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={newPrompt.description}
                        onChange={(e) => setNewPrompt((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Optional description..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="content">Content</Label>
                      <Textarea
                        id="content"
                        value={newPrompt.content}
                        onChange={(e) => setNewPrompt((p) => ({ ...p, content: e.target.value }))}
                        placeholder="Enter prompt content..."
                        rows={8}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={createPrompt} disabled={saving}>
                      {saving ? 'Creating...' : 'Create'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="pt-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {prompts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {loading ? 'Loading prompts...' : 'No prompts found'}
              </div>
            ) : (
              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => selectPrompt(prompt)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedPrompt?.id === prompt.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{prompt.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={CATEGORY_COLORS[prompt.category]}>
                        {CATEGORY_LABELS[prompt.category]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        v{prompt.currentVersion}
                      </span>
                    </div>
                    {prompt.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {prompt.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {selectedPrompt ? selectedPrompt.name : 'Select a Prompt'}
              </CardTitle>
              {selectedPrompt && (
                <CardDescription>
                  Version {selectedPrompt.currentVersion} • Last updated {formatDate(selectedPrompt.updatedAt)}
                </CardDescription>
              )}
            </div>
            {selectedPrompt && (
              <div className="flex items-center gap-2">
                <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <History className="h-4 w-4 mr-1" />
                      History
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Version History</DialogTitle>
                      <DialogDescription>
                        View and rollback to previous versions
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {selectedPrompt.versions
                          .slice()
                          .sort((a, b) => b.version - a.version)
                          .map((version) => (
                            <div
                              key={version.id}
                              className={`p-3 rounded-lg border ${
                                version.isActive ? 'border-primary bg-primary/5' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">Version {version.version}</span>
                                  {version.isActive && (
                                    <Badge variant="default">Active</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const activeVersion = selectedPrompt.versions.find((v) => v.isActive)
                                      if (activeVersion) {
                                        setDiffVersions({ v1: version, v2: activeVersion })
                                        setShowDiffDialog(true)
                                      }
                                    }}
                                    disabled={version.isActive}
                                  >
                                    <GitCompare className="h-4 w-4 mr-1" />
                                    Diff
                                  </Button>
                                  {!version.isActive && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => rollbackToVersion(version.version)}
                                      disabled={saving}
                                    >
                                      <RotateCcw className="h-4 w-4 mr-1" />
                                      Rollback
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {version.description} • {formatDate(version.createdAt)} • by {version.createdBy}
                              </div>
                              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-[100px]">
                                {version.content.slice(0, 300)}
                                {version.content.length > 300 && '...'}
                              </pre>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deletePrompt}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedPrompt ? (
            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="editContent">Prompt Content</Label>
                  <Textarea
                    id="editContent"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={15}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="versionDesc">Version Description (optional)</Label>
                  <Input
                    id="versionDesc"
                    value={versionDescription}
                    onChange={(e) => setVersionDescription(e.target.value)}
                    placeholder="Describe what changed in this version..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {hasChanges ? (
                      <span className="text-yellow-600 dark:text-yellow-400">Unsaved changes</span>
                    ) : (
                      'No changes'
                    )}
                  </div>
                  <Button onClick={savePrompt} disabled={saving || !hasChanges}>
                    <Save className="h-4 w-4 mr-1" />
                    {saving ? 'Saving...' : 'Save New Version'}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="preview">
                <div className="p-4 bg-muted rounded-lg">
                  <pre className="whitespace-pre-wrap font-mono text-sm">
                    {editContent}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              Select a prompt from the list to edit
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Version Diff: v{diffVersions.v1?.version} → v{diffVersions.v2?.version}
            </DialogTitle>
            <DialogDescription>
              Comparing changes between versions
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            {diffVersions.v1 && diffVersions.v2 && (
              <div className="font-mono text-sm">
                {computeDiff(diffVersions.v1.content, diffVersions.v2.content).map((line, idx) => (
                  <div
                    key={idx}
                    className={`px-2 py-0.5 ${
                      line.type === 'add'
                        ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                        : line.type === 'remove'
                        ? 'bg-red-500/20 text-red-700 dark:text-red-400'
                        : ''
                    }`}
                  >
                    <span className="select-none mr-2">
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                    </span>
                    {line.text}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
