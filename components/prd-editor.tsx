'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Sparkles,
  Save,
  FileText,
  Plus,
  X,
  Loader2,
  Check,
  AlertTriangle,
  RefreshCw,
  Eye,
  Edit,
  MessageSquare,
} from 'lucide-react'

interface PRDEditorProps {
  projectId: string
  initialPRD?: string
  initialStatus?: 'draft' | 'approved' | 'rejected'
  projectName?: string
  projectDescription?: string
  onPRDChange?: (prd: string, status: 'draft' | 'approved' | 'rejected') => void
}

const PRD_STATUS_COLORS: Record<string, string> = {
  draft: '#eab308',
  approved: '#22c55e',
  rejected: '#ef4444',
}

export function PRDEditor({
  projectId,
  initialPRD = '',
  initialStatus = 'draft',
  projectName = '',
  projectDescription = '',
  onPRDChange,
}: PRDEditorProps) {
  const [prd, setPrd] = useState(initialPRD)
  const [prdStatus, setPrdStatus] = useState<'draft' | 'approved' | 'rejected'>(initialStatus)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [showRefineDialog, setShowRefineDialog] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const [generateForm, setGenerateForm] = useState({
    projectName: projectName,
    description: projectDescription,
    targetUsers: '',
    keyFeatures: [''],
    constraints: '',
    existingContext: '',
  })

  const [refineFeedback, setRefineFeedback] = useState('')

  useEffect(() => {
    setPrd(initialPRD)
    setPrdStatus(initialStatus)
  }, [initialPRD, initialStatus])

  const handlePRDChange = useCallback((newPRD: string) => {
    setPrd(newPRD)
    setHasUnsavedChanges(true)
  }, [])

  const handleAddFeature = useCallback(() => {
    setGenerateForm((prev) => ({
      ...prev,
      keyFeatures: [...prev.keyFeatures, ''],
    }))
  }, [])

  const handleRemoveFeature = useCallback((index: number) => {
    setGenerateForm((prev) => ({
      ...prev,
      keyFeatures: prev.keyFeatures.filter((_, i) => i !== index),
    }))
  }, [])

  const handleUpdateFeature = useCallback((index: number, value: string) => {
    setGenerateForm((prev) => ({
      ...prev,
      keyFeatures: prev.keyFeatures.map((f, i) => (i === index ? value : f)),
    }))
  }, [])

  const handleGenerate = useCallback(async () => {
    const filteredFeatures = generateForm.keyFeatures.filter((f) => f.trim())
    if (!generateForm.projectName.trim()) {
      toast.error('Project name is required')
      return
    }
    if (!generateForm.description.trim()) {
      toast.error('Description is required')
      return
    }
    if (!generateForm.targetUsers.trim()) {
      toast.error('Target users is required')
      return
    }
    if (filteredFeatures.length === 0) {
      toast.error('At least one key feature is required')
      return
    }

    setIsGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/prd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generateForm,
          keyFeatures: filteredFeatures,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate PRD')
      }

      const data = await res.json()
      setPrd(data.prd)
      setPrdStatus('draft')
      setHasUnsavedChanges(false)
      onPRDChange?.(data.prd, 'draft')
      setShowGenerateDialog(false)

      if (data.validation && !data.validation.valid) {
        toast.warning('PRD generated with warnings', {
          description: data.validation.issues.join(', '),
        })
      } else {
        toast.success('PRD generated successfully')
      }
    } catch (err) {
      toast.error('Failed to generate PRD', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsGenerating(false)
    }
  }, [generateForm, projectId, onPRDChange])

  const handleSave = useCallback(async () => {
    if (!prd.trim()) {
      toast.error('PRD content is required')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/prd`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prd, status: prdStatus }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save PRD')
      }

      setHasUnsavedChanges(false)
      onPRDChange?.(prd, prdStatus)
      toast.success('PRD saved successfully')
    } catch (err) {
      toast.error('Failed to save PRD', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }, [prd, prdStatus, projectId, onPRDChange])

  const handleRefine = useCallback(async () => {
    if (!refineFeedback.trim()) {
      toast.error('Please provide feedback for refinement')
      return
    }

    setIsRefining(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/prd`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: refineFeedback }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to refine PRD')
      }

      const data = await res.json()
      setPrd(data.prd)
      setPrdStatus('draft')
      setHasUnsavedChanges(false)
      onPRDChange?.(data.prd, 'draft')
      setShowRefineDialog(false)
      setRefineFeedback('')
      toast.success('PRD refined successfully')
    } catch (err) {
      toast.error('Failed to refine PRD', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsRefining(false)
    }
  }, [refineFeedback, projectId, onPRDChange])

  const handleStatusChange = useCallback(
    async (newStatus: 'draft' | 'approved' | 'rejected') => {
      if (!prd.trim()) {
        toast.error('Cannot change status of empty PRD')
        return
      }

      setIsSaving(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/prd`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prd, status: newStatus }),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Failed to update PRD status')
        }

        setPrdStatus(newStatus)
        onPRDChange?.(prd, newStatus)
        toast.success(`PRD ${newStatus}`)
      } catch (err) {
        toast.error('Failed to update PRD status', {
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        setIsSaving(false)
      }
    },
    [prd, projectId, onPRDChange]
  )

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              Product Requirements Document
            </CardTitle>
            {prd && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5"
                style={{
                  color: PRD_STATUS_COLORS[prdStatus],
                  borderColor: PRD_STATUS_COLORS[prdStatus],
                }}
              >
                {prdStatus}
              </Badge>
            )}
            {hasUnsavedChanges && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                Unsaved
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {prd && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setIsPreviewMode(!isPreviewMode)}
                >
                  {isPreviewMode ? (
                    <>
                      <Edit className="h-3 w-3" />
                      Edit
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" />
                      Preview
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowRefineDialog(true)}
                  disabled={isRefining}
                >
                  <RefreshCw className="h-3 w-3" />
                  Refine
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowGenerateDialog(true)}
              disabled={isGenerating}
            >
              <Sparkles className="h-3 w-3" />
              {prd ? 'Regenerate' : 'Generate'} PRD
            </Button>
            {prd && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {prd ? (
          <>
            {isPreviewMode ? (
              <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground rounded-md border border-border p-4 max-h-[500px] overflow-y-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{prd}</ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={prd}
                onChange={(e) => handlePRDChange(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder="Enter or generate your PRD..."
              />
            )}
            {prdStatus === 'draft' && (
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
                  onClick={() => handleStatusChange('approved')}
                  disabled={isSaving}
                >
                  <Check className="h-3 w-3" />
                  Approve PRD
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => handleStatusChange('rejected')}
                  disabled={isSaving}
                >
                  <X className="h-3 w-3" />
                  Reject PRD
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No PRD yet
            </h3>
            <p className="text-sm text-muted mb-4 max-w-md">
              Generate a Product Requirements Document to define your project
              scope, features, and acceptance criteria.
            </p>
            <Button
              onClick={() => setShowGenerateDialog(true)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Generate PRD
            </Button>
          </div>
        )}
      </CardContent>

      {/* Generate PRD Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate PRD
            </DialogTitle>
            <DialogDescription>
              Provide details about your project to generate a comprehensive
              Product Requirements Document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name *</label>
              <Input
                value={generateForm.projectName}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    projectName: e.target.value,
                  }))
                }
                placeholder="My Awesome Project"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description *</label>
              <Textarea
                value={generateForm.description}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="A brief description of what the project does..."
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Users *</label>
              <Input
                value={generateForm.targetUsers}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    targetUsers: e.target.value,
                  }))
                }
                placeholder="e.g., Software developers, Project managers, etc."
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Key Features *</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleAddFeature}
                >
                  <Plus className="h-3 w-3" />
                  Add Feature
                </Button>
              </div>
              <div className="space-y-2">
                {generateForm.keyFeatures.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={feature}
                      onChange={(e) => handleUpdateFeature(idx, e.target.value)}
                      placeholder={`Feature ${idx + 1}`}
                    />
                    {generateForm.keyFeatures.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-400"
                        onClick={() => handleRemoveFeature(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Constraints (optional)
              </label>
              <Textarea
                value={generateForm.constraints}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    constraints: e.target.value,
                  }))
                }
                placeholder="Any technical or business constraints..."
                className="min-h-[60px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Existing Context (optional)
              </label>
              <Textarea
                value={generateForm.existingContext}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    existingContext: e.target.value,
                  }))
                }
                placeholder="Any existing documentation or background information..."
                className="min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGenerateDialog(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate PRD
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refine PRD Dialog */}
      <Dialog open={showRefineDialog} onOpenChange={setShowRefineDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Refine PRD
            </DialogTitle>
            <DialogDescription>
              Provide feedback to refine and improve the existing PRD.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Feedback</label>
              <Textarea
                value={refineFeedback}
                onChange={(e) => setRefineFeedback(e.target.value)}
                placeholder="What would you like to change or improve in the PRD?"
                className="min-h-[120px]"
              />
            </div>
            <div className="flex items-start gap-2 p-3 rounded-md bg-secondary/50">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <p className="text-xs text-muted">
                The AI will regenerate the PRD based on your feedback. The
                current PRD will be replaced with the refined version.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRefineDialog(false)}
              disabled={isRefining}
            >
              Cancel
            </Button>
            <Button onClick={handleRefine} disabled={isRefining}>
              {isRefining ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Refining...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refine PRD
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
