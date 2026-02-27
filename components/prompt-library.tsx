'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
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
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Save,
  RotateCcw,
  History,
  FileText,
  Trash2,
  RefreshCw,
  Search,
  X,
  Tag,
  Copy,
  MoreVertical,
  GitCompare,
  Clock,
  User,
  Filter,
  SortAsc,
  SortDesc,
  BookOpen,
  Sparkles,
  ChevronLeft,
} from 'lucide-react'
import type { Prompt, PromptVersion, PromptCategory } from '@/lib/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  system: 'System',
  stage: 'Pipeline Stage',
  tool: 'Tool',
  custom: 'Custom',
}

const CATEGORY_COLORS: Record<PromptCategory, string> = {
  system: 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
  stage: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
  tool: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
  custom: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
}

const CATEGORY_ICONS: Record<PromptCategory, typeof FileText> = {
  system: Sparkles,
  stage: BookOpen,
  tool: FileText,
  custom: Tag,
}

interface PromptWithTags extends Prompt {
  tags?: string[]
}

type SortField = 'name' | 'updatedAt' | 'category'
type SortDirection = 'asc' | 'desc'

interface PromptLibraryProps {
  onClose: () => void
}

export function PromptLibrary({ onClose }: PromptLibraryProps) {
  const [prompts, setPrompts] = useState<PromptWithTags[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<PromptWithTags | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [versionDescription, setVersionDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showDiffDialog, setShowDiffDialog] = useState(false)
  const [diffVersions, setDiffVersions] = useState<{ v1: PromptVersion | null; v2: PromptVersion | null }>({ v1: null, v2: null })
  
  const [newPrompt, setNewPrompt] = useState({
    name: '',
    category: 'custom' as PromptCategory,
    description: '',
    content: '',
    tags: [] as string[],
  })
  const [newPromptTag, setNewPromptTag] = useState('')

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    prompts.forEach((p) => {
      p.tags?.forEach((t) => tagSet.add(t))
    })
    return Array.from(tagSet).sort()
  }, [prompts])

  const filteredPrompts = useMemo(() => {
    let result = [...prompts]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags?.some((t) => t.toLowerCase().includes(query))
      )
    }
    
    if (categoryFilter !== 'all') {
      result = result.filter((p) => p.category === categoryFilter)
    }
    
    if (tagFilter !== 'all') {
      result = result.filter((p) => p.tags?.includes(tagFilter))
    }
    
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case 'category':
          comparison = a.category.localeCompare(b.category)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
    
    return result
  }, [prompts, searchQuery, categoryFilter, tagFilter, sortField, sortDirection])

  const fetchPrompts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/prompts')
      if (!response.ok) {
        throw new Error('Failed to fetch prompts')
      }
      const data = await response.json()
      const promptsWithTags = data.map((p: Prompt) => ({
        ...p,
        tags: extractTagsFromDescription(p.description),
      }))
      setPrompts(promptsWithTags)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch prompts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  const extractTagsFromDescription = (description?: string): string[] => {
    if (!description) return []
    const tagMatch = description.match(/\[tags:(.*?)\]/)
    if (tagMatch) {
      return tagMatch[1].split(',').map((t) => t.trim()).filter(Boolean)
    }
    return []
  }

  const encodeTagsInDescription = (description: string, tags: string[]): string => {
    const cleanDesc = description.replace(/\s*\[tags:.*?\]/, '').trim()
    if (tags.length === 0) return cleanDesc
    return `${cleanDesc} [tags:${tags.join(',')}]`
  }

  const selectPrompt = (prompt: PromptWithTags) => {
    setSelectedPrompt(prompt)
    const activeVersion = prompt.versions.find((v) => v.isActive)
    setEditContent(activeVersion?.content ?? '')
    setEditTags(prompt.tags ?? [])
    setVersionDescription('')
  }

  const savePrompt = async () => {
    if (!selectedPrompt) return
    
    const activeVersion = selectedPrompt.versions.find((v) => v.isActive)
    const tagsChanged = JSON.stringify(editTags) !== JSON.stringify(selectedPrompt.tags)
    const contentChanged = editContent !== activeVersion?.content
    
    if (!contentChanged && !tagsChanged) {
      toast.info('No changes to save')
      return
    }
    
    setSaving(true)
    try {
      const newDescription = encodeTagsInDescription(
        selectedPrompt.description?.replace(/\s*\[tags:.*?\]/, '') ?? '',
        editTags
      )
      
      const response = await fetch(`/api/prompts/${selectedPrompt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: contentChanged ? editContent : undefined,
          description: newDescription,
          versionDescription: versionDescription || `Version ${selectedPrompt.currentVersion + 1}`,
        }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to save prompt')
      }
      
      const updatedPrompt = await response.json()
      const promptWithTags = {
        ...updatedPrompt,
        tags: editTags,
      }
      setSelectedPrompt(promptWithTags)
      setPrompts((prev) => prev.map((p) => (p.id === updatedPrompt.id ? promptWithTags : p)))
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
      const promptWithTags = {
        ...updatedPrompt,
        tags: extractTagsFromDescription(updatedPrompt.description),
      }
      setSelectedPrompt(promptWithTags)
      setPrompts((prev) => prev.map((p) => (p.id === updatedPrompt.id ? promptWithTags : p)))
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
      const description = encodeTagsInDescription(newPrompt.description, newPrompt.tags)
      
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPrompt,
          description,
        }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to create prompt')
      }
      
      const created = await response.json()
      const promptWithTags = {
        ...created,
        tags: newPrompt.tags,
      }
      setPrompts((prev) => [...prev, promptWithTags])
      setSelectedPrompt(promptWithTags)
      setEditContent(newPrompt.content)
      setEditTags(newPrompt.tags)
      setShowCreateDialog(false)
      setNewPrompt({ name: '', category: 'custom', description: '', content: '', tags: [] })
      toast.success('Prompt created successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create prompt')
    } finally {
      setSaving(false)
    }
  }

  const deletePrompt = async () => {
    if (!selectedPrompt) return
    
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
      setEditTags([])
      toast.success('Prompt deleted successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete prompt')
    } finally {
      setSaving(false)
    }
  }

  const duplicatePrompt = async () => {
    if (!selectedPrompt) return
    
    setNewPrompt({
      name: `${selectedPrompt.name} (Copy)`,
      category: selectedPrompt.category,
      description: selectedPrompt.description?.replace(/\s*\[tags:.*?\]/, '') ?? '',
      content: editContent,
      tags: [...editTags],
    })
    setShowCreateDialog(true)
  }

  const copyToClipboard = async () => {
    if (!editContent) return
    try {
      await navigator.clipboard.writeText(editContent)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const addTag = (tag: string, isNewPrompt = false) => {
    const trimmedTag = tag.trim().toLowerCase()
    if (!trimmedTag) return
    
    if (isNewPrompt) {
      if (!newPrompt.tags.includes(trimmedTag)) {
        setNewPrompt((p) => ({ ...p, tags: [...p.tags, trimmedTag] }))
      }
      setNewPromptTag('')
    } else {
      if (!editTags.includes(trimmedTag)) {
        setEditTags((prev) => [...prev, trimmedTag])
      }
      setNewTag('')
    }
  }

  const removeTag = (tag: string, isNewPrompt = false) => {
    if (isNewPrompt) {
      setNewPrompt((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }))
    } else {
      setEditTags((prev) => prev.filter((t) => t !== tag))
    }
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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

  const hasChanges = selectedPrompt && (
    editContent !== selectedPrompt.versions.find((v) => v.isActive)?.content ||
    JSON.stringify(editTags) !== JSON.stringify(selectedPrompt.tags)
  )

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Prompt Library</h1>
          </div>
          <Badge variant="secondary" className="ml-2">
            {filteredPrompts.length} prompts
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPrompts} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Prompt
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r border-border flex flex-col">
          <div className="p-3 space-y-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            
            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="flex-1">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="flex-1">
                  <Tag className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Sort by:</span>
              <div className="flex items-center gap-1">
                <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                  <SelectTrigger className="h-7 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updatedAt">Updated</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  {sortDirection === 'asc' ? (
                    <SortAsc className="h-3.5 w-3.5" />
                  ) : (
                    <SortDesc className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))
              ) : filteredPrompts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No prompts found</p>
                  {(searchQuery || categoryFilter !== 'all' || tagFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setSearchQuery('')
                        setCategoryFilter('all')
                        setTagFilter('all')
                      }}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                filteredPrompts.map((prompt) => {
                  const CategoryIcon = CATEGORY_ICONS[prompt.category]
                  return (
                    <button
                      key={prompt.id}
                      onClick={() => selectPrompt(prompt)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg transition-colors',
                        selectedPrompt?.id === prompt.id
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-muted border border-transparent'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <CategoryIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate text-sm">{prompt.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              v{prompt.currentVersion}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] px-1.5 py-0', CATEGORY_COLORS[prompt.category])}
                            >
                              {CATEGORY_LABELS[prompt.category]}
                            </Badge>
                            {prompt.tags?.slice(0, 2).map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {(prompt.tags?.length ?? 0) > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{(prompt.tags?.length ?? 0) - 2}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedPrompt ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                  <h2 className="font-semibold">{selectedPrompt.name}</h2>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(selectedPrompt.updatedAt)}
                    </span>
                    <span>Version {selectedPrompt.currentVersion}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowHistoryDialog(true)}>
                    <History className="h-4 w-4 mr-1" />
                    History
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={copyToClipboard}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Content
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={duplicatePrompt}>
                        <Plus className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={deletePrompt}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <Tabs defaultValue="edit" className="h-full flex flex-col">
                  <div className="px-4 pt-2">
                    <TabsList>
                      <TabsTrigger value="edit">Edit</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="edit" className="flex-1 overflow-auto p-4 space-y-4 mt-0">
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {editTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="gap-1 pr-1"
                          >
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <div className="flex items-center gap-1">
                          <Input
                            placeholder="Add tag..."
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                addTag(newTag)
                              }
                            }}
                            className="h-6 w-24 text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => addTag(newTag)}
                            disabled={!newTag.trim()}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 flex-1">
                      <Label htmlFor="editContent">Prompt Content</Label>
                      <Textarea
                        id="editContent"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="font-mono text-sm min-h-[300px] resize-y"
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

                    <div className="flex items-center justify-between pt-2">
                      <div className="text-sm">
                        {hasChanges ? (
                          <span className="text-yellow-600 dark:text-yellow-400">Unsaved changes</span>
                        ) : (
                          <span className="text-muted-foreground">No changes</span>
                        )}
                      </div>
                      <Button onClick={savePrompt} disabled={saving || !hasChanges}>
                        <Save className="h-4 w-4 mr-1" />
                        {saving ? 'Saving...' : 'Save New Version'}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="preview" className="flex-1 overflow-auto p-4 mt-0">
                    <div className="p-4 bg-muted rounded-lg">
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {editContent}
                      </pre>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">Select a prompt to edit</p>
                <p className="text-sm mt-1">Or create a new one to get started</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Prompt</DialogTitle>
            <DialogDescription>
              Add a new prompt template to the library
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="newName">Name *</Label>
              <Input
                id="newName"
                value={newPrompt.name}
                onChange={(e) => setNewPrompt((p) => ({ ...p, name: e.target.value }))}
                placeholder="Enter prompt name..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newCategory">Category</Label>
              <Select
                value={newPrompt.category}
                onValueChange={(value) => setNewPrompt((p) => ({ ...p, category: value as PromptCategory }))}
              >
                <SelectTrigger id="newCategory">
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
              <Label htmlFor="newDescription">Description</Label>
              <Input
                id="newDescription"
                value={newPrompt.description}
                onChange={(e) => setNewPrompt((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional description..."
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5">
                {newPrompt.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button
                      onClick={() => removeTag(tag, true)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="Add tag..."
                    value={newPromptTag}
                    onChange={(e) => setNewPromptTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag(newPromptTag, true)
                      }
                    }}
                    className="h-6 w-24 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => addTag(newPromptTag, true)}
                    disabled={!newPromptTag.trim()}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newContent">Content *</Label>
              <Textarea
                id="newContent"
                value={newPrompt.content}
                onChange={(e) => setNewPrompt((p) => ({ ...p, content: e.target.value }))}
                placeholder="Enter prompt content..."
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createPrompt} disabled={saving || !newPrompt.name || !newPrompt.content}>
              {saving ? 'Creating...' : 'Create Prompt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View and rollback to previous versions of &quot;{selectedPrompt?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {selectedPrompt?.versions
                .slice()
                .sort((a, b) => b.version - a.version)
                .map((version) => (
                  <div
                    key={version.id}
                    className={cn(
                      'p-3 rounded-lg border',
                      version.isActive ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Version {version.version}</span>
                        {version.isActive && <Badge>Active</Badge>}
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
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(version.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {version.createdBy}
                      </span>
                    </div>
                    {version.description && (
                      <p className="text-sm text-muted-foreground mt-1">{version.description}</p>
                    )}
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-[80px]">
                      {version.content.slice(0, 200)}
                      {version.content.length > 200 && '...'}
                    </pre>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

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
                    className={cn(
                      'px-2 py-0.5',
                      line.type === 'add' && 'bg-green-500/20 text-green-700 dark:text-green-400',
                      line.type === 'remove' && 'bg-red-500/20 text-red-700 dark:text-red-400'
                    )}
                  >
                    <span className="select-none mr-2 text-muted-foreground">
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
