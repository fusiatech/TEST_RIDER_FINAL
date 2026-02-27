'use client'

import { useState, useCallback, useMemo } from 'react'
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
  FileText,
  Bug,
  TrendingUp,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  Download,
  Eye,
  Edit,
  Wand2,
  Copy,
  AlertCircle,
} from 'lucide-react'
import {
  PRD_TEMPLATES,
  PRDTemplateType,
  type PRDTemplate,
  type PRDSection,
  validatePRDSections,
  generateMarkdownFromSections,
  generateAIPromptForSection,
  generateFullPRDPrompt,
} from '@/lib/prd-templates'

interface PRDGeneratorProps {
  projectId?: string
  onPRDGenerated?: (prd: string, type: PRDTemplateType) => void
  onClose?: () => void
}

const TEMPLATE_ICONS: Record<PRDTemplateType, typeof Sparkles> = {
  feature: Sparkles,
  bug_fix: Bug,
  enhancement: TrendingUp,
}

const TEMPLATE_COLORS: Record<PRDTemplateType, string> = {
  feature: '#8b5cf6',
  bug_fix: '#ef4444',
  enhancement: '#3b82f6',
}

type Step = 'select_template' | 'fill_sections' | 'preview'

export function PRDGenerator({
  projectId,
  onPRDGenerated,
  onClose,
}: PRDGeneratorProps) {
  const [step, setStep] = useState<Step>('select_template')
  const [selectedTemplate, setSelectedTemplate] = useState<PRDTemplateType | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sectionContent, setSectionContent] = useState<Record<string, string>>({})
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingSection, setGeneratingSection] = useState<string | null>(null)
  const [isPreviewMode, setIsPreviewMode] = useState(false)

  const template = useMemo(() => {
    return selectedTemplate ? PRD_TEMPLATES[selectedTemplate] : null
  }, [selectedTemplate])

  const currentSection = useMemo(() => {
    return template?.sections[currentSectionIndex] ?? null
  }, [template, currentSectionIndex])

  const validation = useMemo(() => {
    if (!selectedTemplate) return { valid: false, missingRequired: [] }
    return validatePRDSections(selectedTemplate, sectionContent)
  }, [selectedTemplate, sectionContent])

  const generatedMarkdown = useMemo(() => {
    if (!selectedTemplate || !title) return ''
    return generateMarkdownFromSections(selectedTemplate, title, sectionContent)
  }, [selectedTemplate, title, sectionContent])

  const handleSelectTemplate = useCallback((type: PRDTemplateType) => {
    setSelectedTemplate(type)
    setSectionContent({})
    setCurrentSectionIndex(0)
    setStep('fill_sections')
  }, [])

  const handleSectionChange = useCallback((sectionId: string, value: string) => {
    setSectionContent((prev) => ({
      ...prev,
      [sectionId]: value,
    }))
  }, [])

  const handleGenerateSection = useCallback(async () => {
    if (!selectedTemplate || !currentSection || !title.trim()) {
      toast.error('Please provide a title first')
      return
    }

    setGeneratingSection(currentSection.id)
    try {
      const prompt = generateAIPromptForSection(selectedTemplate, currentSection.id, {
        title,
        description,
        existingSections: sectionContent,
      })

      const res = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 1000 }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate content')
      }

      const data = await res.json()
      handleSectionChange(currentSection.id, data.summary || data.content || '')
      toast.success('Content generated')
    } catch (err) {
      toast.error('Failed to generate content', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setGeneratingSection(null)
    }
  }, [selectedTemplate, currentSection, title, description, sectionContent, handleSectionChange])

  const handleGenerateAll = useCallback(async () => {
    if (!selectedTemplate || !title.trim()) {
      toast.error('Please provide a title first')
      return
    }

    setIsGenerating(true)
    try {
      const prompt = generateFullPRDPrompt(selectedTemplate, {
        title,
        description,
        additionalContext: description,
      })

      const res = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 4000 }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate PRD')
      }

      const data = await res.json()
      const content = data.summary || data.content || ''

      const newSectionContent: Record<string, string> = {}
      const template = PRD_TEMPLATES[selectedTemplate]

      for (const section of template.sections) {
        const regex = new RegExp(`##\\s*${section.title}\\s*\\n([\\s\\S]*?)(?=##|$)`, 'i')
        const match = content.match(regex)
        if (match && match[1]) {
          newSectionContent[section.id] = match[1].trim()
        }
      }

      setSectionContent(newSectionContent)
      setStep('preview')
      toast.success('PRD generated successfully')
    } catch (err) {
      toast.error('Failed to generate PRD', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsGenerating(false)
    }
  }, [selectedTemplate, title, description])

  const handleExportMarkdown = useCallback(() => {
    if (!generatedMarkdown) return

    const blob = new Blob([generatedMarkdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-prd.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('PRD exported')
  }, [generatedMarkdown, title])

  const handleCopyToClipboard = useCallback(async () => {
    if (!generatedMarkdown) return

    try {
      await navigator.clipboard.writeText(generatedMarkdown)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }, [generatedMarkdown])

  const handleFinish = useCallback(() => {
    if (!validation.valid) {
      toast.error('Please fill in all required sections', {
        description: `Missing: ${validation.missingRequired.join(', ')}`,
      })
      return
    }

    if (selectedTemplate && onPRDGenerated) {
      onPRDGenerated(generatedMarkdown, selectedTemplate)
    }
    onClose?.()
  }, [validation, selectedTemplate, generatedMarkdown, onPRDGenerated, onClose])

  const handleBack = useCallback(() => {
    if (step === 'fill_sections') {
      setStep('select_template')
      setSelectedTemplate(null)
    } else if (step === 'preview') {
      setStep('fill_sections')
    }
  }, [step])

  const handleNext = useCallback(() => {
    if (step === 'fill_sections') {
      if (!title.trim()) {
        toast.error('Please provide a title')
        return
      }
      setStep('preview')
    }
  }, [step, title])

  const filledSectionsCount = useMemo(() => {
    if (!template) return 0
    return template.sections.filter((s) => sectionContent[s.id]?.trim()).length
  }, [template, sectionContent])

  const requiredFilledCount = useMemo(() => {
    if (!template) return 0
    return template.sections.filter((s) => s.required && sectionContent[s.id]?.trim()).length
  }, [template, sectionContent])

  const requiredCount = useMemo(() => {
    if (!template) return 0
    return template.sections.filter((s) => s.required).length
  }, [template])

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">PRD Generator</CardTitle>
            {selectedTemplate && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5"
                style={{
                  color: TEMPLATE_COLORS[selectedTemplate],
                  borderColor: TEMPLATE_COLORS[selectedTemplate],
                }}
              >
                {PRD_TEMPLATES[selectedTemplate].name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step !== 'select_template' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleBack}
              >
                <ChevronLeft className="h-3 w-3" />
                Back
              </Button>
            )}
            {step === 'fill_sections' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleGenerateAll}
                  disabled={isGenerating || !title.trim()}
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                  Generate All
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleNext}
                  disabled={!title.trim()}
                >
                  Preview
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </>
            )}
            {step === 'preview' && (
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
                  onClick={handleCopyToClipboard}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleExportMarkdown}
                >
                  <Download className="h-3 w-3" />
                  Export
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={handleFinish}
                  disabled={!validation.valid}
                >
                  <Check className="h-3 w-3" />
                  Finish
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'select_template' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Select a template to get started with your PRD.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.entries(PRD_TEMPLATES) as [PRDTemplateType, PRDTemplate][]).map(
                ([type, tmpl]) => {
                  const Icon = TEMPLATE_ICONS[type]
                  return (
                    <Card
                      key={type}
                      className="border-border cursor-pointer hover:border-primary/50 transition-all"
                      onClick={() => handleSelectTemplate(type)}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="p-2 rounded-md"
                            style={{ backgroundColor: `${TEMPLATE_COLORS[type]}20` }}
                          >
                            <Icon
                              className="h-5 w-5"
                              style={{ color: TEMPLATE_COLORS[type] }}
                            />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-foreground">
                              {tmpl.name}
                            </h3>
                            <p className="text-xs text-muted">{tmpl.sections.length} sections</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted">{tmpl.description}</p>
                      </CardContent>
                    </Card>
                  )
                }
              )}
            </div>
          </div>
        )}

        {step === 'fill_sections' && template && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter PRD title..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description..."
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-y border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Progress:</span>
                <Badge variant="secondary" className="text-xs">
                  {requiredFilledCount}/{requiredCount} required
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {filledSectionsCount}/{template.sections.length} total
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {template.sections.map((section, idx) => (
                  <button
                    key={section.id}
                    className={`w-6 h-6 rounded text-[10px] font-medium transition-all ${
                      currentSectionIndex === idx
                        ? 'bg-primary text-primary-foreground'
                        : sectionContent[section.id]?.trim()
                        ? 'bg-green-500/20 text-green-500'
                        : section.required
                        ? 'bg-secondary text-muted hover:bg-secondary/80'
                        : 'bg-secondary/50 text-muted/50 hover:bg-secondary/80'
                    }`}
                    onClick={() => setCurrentSectionIndex(idx)}
                    title={section.title}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {currentSection && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {currentSection.title}
                    </h3>
                    {currentSection.required && (
                      <Badge variant="destructive" className="text-[10px] px-1">
                        Required
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={handleGenerateSection}
                    disabled={generatingSection === currentSection.id || !title.trim()}
                  >
                    {generatingSection === currentSection.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Generate
                  </Button>
                </div>
                <Textarea
                  value={sectionContent[currentSection.id] || ''}
                  onChange={(e) => handleSectionChange(currentSection.id, e.target.value)}
                  placeholder={currentSection.placeholder}
                  className="min-h-[200px] font-mono text-sm"
                />
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setCurrentSectionIndex(Math.max(0, currentSectionIndex - 1))}
                    disabled={currentSectionIndex === 0}
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted">
                    Section {currentSectionIndex + 1} of {template.sections.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() =>
                      setCurrentSectionIndex(
                        Math.min(template.sections.length - 1, currentSectionIndex + 1)
                      )
                    }
                    disabled={currentSectionIndex === template.sections.length - 1}
                  >
                    Next
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {!validation.valid && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-yellow-500">Missing Required Sections</p>
                  <p className="text-xs text-muted">
                    {validation.missingRequired.join(', ')}
                  </p>
                </div>
              </div>
            )}
            {isPreviewMode ? (
              <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground rounded-md border border-border p-4 max-h-[500px] overflow-y-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {generatedMarkdown}
                </ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={generatedMarkdown}
                readOnly
                className="min-h-[400px] font-mono text-sm"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PRDGeneratorDialog({
  open,
  onOpenChange,
  projectId,
  onPRDGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: string
  onPRDGenerated?: (prd: string, type: PRDTemplateType) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <PRDGenerator
          projectId={projectId}
          onPRDGenerated={onPRDGenerated}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
