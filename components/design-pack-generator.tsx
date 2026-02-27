'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Palette,
  Plus,
  X,
  Loader2,
  Save,
  Trash2,
  Edit,
  Eye,
  Sparkles,
  Link,
  Image,
  FileCode,
  Layers,
  ExternalLink,
  Check,
  Send,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import type {
  DesignPack,
  DesignPackStatus,
  DesignPackFigmaLink,
  DesignTokens,
  ComponentSpec,
  Ticket,
  PRDSection,
} from '@/lib/types'

interface DesignPackGeneratorProps {
  projectId: string
  tickets?: Ticket[]
  prdSections?: PRDSection[]
  onDesignPackCreated?: (pack: DesignPack) => void
  onDesignPackUpdated?: (pack: DesignPack) => void
}

const STATUS_COLORS: Record<DesignPackStatus, string> = {
  draft: '#eab308',
  review: '#3b82f6',
  approved: '#22c55e',
}

const STATUS_LABELS: Record<DesignPackStatus, string> = {
  draft: 'Draft',
  review: 'In Review',
  approved: 'Approved',
}

interface WizardStep {
  id: string
  title: string
  description: string
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'ticket', title: 'Select Ticket', description: 'Choose the ticket this design pack is for' },
  { id: 'prd', title: 'Link PRD', description: 'Optionally link to a PRD section' },
  { id: 'figma', title: 'Figma Links', description: 'Add Figma design links' },
  { id: 'specs', title: 'Component Specs', description: 'Define component specifications' },
  { id: 'tokens', title: 'Design Tokens', description: 'Extract or define design tokens' },
  { id: 'assets', title: 'Assets', description: 'Upload wireframes and mockups' },
]

export function DesignPackGenerator({
  projectId,
  tickets = [],
  prdSections = [],
  onDesignPackCreated,
  onDesignPackUpdated,
}: DesignPackGeneratorProps) {
  const [designPacks, setDesignPacks] = useState<DesignPack[]>([])
  const [selectedPack, setSelectedPack] = useState<DesignPack | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingSpecs, setIsGeneratingSpecs] = useState(false)
  const [isExtractingTokens, setIsExtractingTokens] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'edit'>('list')

  const [wizardData, setWizardData] = useState<{
    ticketId: string
    prdSectionId: string
    figmaLinks: DesignPackFigmaLink[]
    componentSpecs: ComponentSpec[]
    designTokens: DesignTokens
    wireframes: string[]
    mockups: string[]
  }>({
    ticketId: '',
    prdSectionId: '',
    figmaLinks: [],
    componentSpecs: [],
    designTokens: {},
    wireframes: [],
    mockups: [],
  })

  const [editData, setEditData] = useState<Partial<DesignPack>>({})

  const fetchDesignPacks = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/design-packs`)
      if (!res.ok) throw new Error('Failed to fetch design packs')
      const data = await res.json()
      setDesignPacks(data)
    } catch (err) {
      toast.error('Failed to load design packs', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchDesignPacks()
  }, [fetchDesignPacks])

  const handleCreateDesignPack = useCallback(async () => {
    if (!wizardData.ticketId) {
      toast.error('Please select a ticket')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/design-packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: wizardData.ticketId,
          prdSectionId: wizardData.prdSectionId || undefined,
          figmaLinks: wizardData.figmaLinks,
          componentSpecs: wizardData.componentSpecs,
          designTokens: Object.keys(wizardData.designTokens).length > 0 ? wizardData.designTokens : undefined,
          wireframes: wizardData.wireframes,
          mockups: wizardData.mockups,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create design pack')
      }

      const newPack = await res.json()
      setDesignPacks((prev) => [...prev, newPack])
      onDesignPackCreated?.(newPack)
      setShowWizard(false)
      resetWizard()
      toast.success('Design pack created successfully')
    } catch (err) {
      toast.error('Failed to create design pack', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, wizardData, onDesignPackCreated])

  const handleUpdateDesignPack = useCallback(async () => {
    if (!selectedPack) return

    setIsSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/design-packs/${selectedPack.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update design pack')
      }

      const updatedPack = await res.json()
      setDesignPacks((prev) => prev.map((p) => (p.id === updatedPack.id ? updatedPack : p)))
      setSelectedPack(updatedPack)
      onDesignPackUpdated?.(updatedPack)
      setViewMode('detail')
      toast.success('Design pack updated successfully')
    } catch (err) {
      toast.error('Failed to update design pack', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, selectedPack, editData, onDesignPackUpdated])

  const handleDeleteDesignPack = useCallback(async (packId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/design-packs/${packId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete design pack')
      }

      setDesignPacks((prev) => prev.filter((p) => p.id !== packId))
      if (selectedPack?.id === packId) {
        setSelectedPack(null)
        setViewMode('list')
      }
      toast.success('Design pack deleted')
    } catch (err) {
      toast.error('Failed to delete design pack', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [projectId, selectedPack])

  const handleSubmitForReview = useCallback(async (packId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/design-packs/${packId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'review' }),
      })

      if (!res.ok) throw new Error('Failed to submit for review')

      const updatedPack = await res.json()
      setDesignPacks((prev) => prev.map((p) => (p.id === updatedPack.id ? updatedPack : p)))
      if (selectedPack?.id === packId) setSelectedPack(updatedPack)
      toast.success('Design pack submitted for review')
    } catch (err) {
      toast.error('Failed to submit for review')
    }
  }, [projectId, selectedPack])

  const handleApprove = useCallback(async (packId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/design-packs/${packId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })

      if (!res.ok) throw new Error('Failed to approve')

      const updatedPack = await res.json()
      setDesignPacks((prev) => prev.map((p) => (p.id === updatedPack.id ? updatedPack : p)))
      if (selectedPack?.id === packId) setSelectedPack(updatedPack)
      toast.success('Design pack approved')
    } catch (err) {
      toast.error('Failed to approve design pack')
    }
  }, [projectId, selectedPack])

  const handleGenerateSpecs = useCallback(async () => {
    if (wizardData.figmaLinks.length === 0) {
      toast.error('Add at least one Figma link to generate specs')
      return
    }

    setIsGeneratingSpecs(true)
    try {
      const res = await fetch(`/api/figma/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaLinks: wizardData.figmaLinks }),
      })

      if (!res.ok) throw new Error('Failed to generate specs')

      const data = await res.json()
      setWizardData((prev) => ({
        ...prev,
        componentSpecs: data.componentSpecs || [],
      }))
      toast.success('Component specs generated')
    } catch (err) {
      toast.error('Failed to generate component specs', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsGeneratingSpecs(false)
    }
  }, [wizardData.figmaLinks])

  const handleExtractTokens = useCallback(async () => {
    if (wizardData.figmaLinks.length === 0) {
      toast.error('Add at least one Figma link to extract tokens')
      return
    }

    setIsExtractingTokens(true)
    try {
      const res = await fetch(`/api/figma/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaLinks: wizardData.figmaLinks }),
      })

      if (!res.ok) throw new Error('Failed to extract tokens')

      const data = await res.json()
      setWizardData((prev) => ({
        ...prev,
        designTokens: data.tokens || {},
      }))
      toast.success('Design tokens extracted')
    } catch (err) {
      toast.error('Failed to extract design tokens', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsExtractingTokens(false)
    }
  }, [wizardData.figmaLinks])

  const resetWizard = useCallback(() => {
    setWizardStep(0)
    setWizardData({
      ticketId: '',
      prdSectionId: '',
      figmaLinks: [],
      componentSpecs: [],
      designTokens: {},
      wireframes: [],
      mockups: [],
    })
  }, [])

  const addFigmaLink = useCallback(() => {
    setWizardData((prev) => ({
      ...prev,
      figmaLinks: [...prev.figmaLinks, { url: '', nodeId: '', name: '' }],
    }))
  }, [])

  const updateFigmaLink = useCallback((index: number, field: keyof DesignPackFigmaLink, value: string) => {
    setWizardData((prev) => ({
      ...prev,
      figmaLinks: prev.figmaLinks.map((link, i) =>
        i === index ? { ...link, [field]: value } : link
      ),
    }))
  }, [])

  const removeFigmaLink = useCallback((index: number) => {
    setWizardData((prev) => ({
      ...prev,
      figmaLinks: prev.figmaLinks.filter((_, i) => i !== index),
    }))
  }, [])

  const addComponentSpec = useCallback(() => {
    setWizardData((prev) => ({
      ...prev,
      componentSpecs: [...prev.componentSpecs, { name: '', props: {}, variants: [] }],
    }))
  }, [])

  const updateComponentSpec = useCallback((index: number, spec: ComponentSpec) => {
    setWizardData((prev) => ({
      ...prev,
      componentSpecs: prev.componentSpecs.map((s, i) => (i === index ? spec : s)),
    }))
  }, [])

  const removeComponentSpec = useCallback((index: number) => {
    setWizardData((prev) => ({
      ...prev,
      componentSpecs: prev.componentSpecs.filter((_, i) => i !== index),
    }))
  }, [])

  const getTicketTitle = useCallback((ticketId: string) => {
    const ticket = tickets.find((t) => t.id === ticketId)
    return ticket?.title || ticketId
  }, [tickets])

  const getPRDSectionTitle = useCallback((sectionId: string) => {
    const section = prdSections.find((s) => s.id === sectionId)
    return section?.title || sectionId
  }, [prdSections])

  const renderWizardContent = () => {
    const step = WIZARD_STEPS[wizardStep]

    switch (step.id) {
      case 'ticket':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Ticket *</label>
              <Select
                value={wizardData.ticketId}
                onValueChange={(value) => setWizardData((prev) => ({ ...prev, ticketId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a ticket..." />
                </SelectTrigger>
                <SelectContent>
                  {tickets.map((ticket) => (
                    <SelectItem key={ticket.id} value={ticket.id}>
                      {ticket.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'prd':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Link to PRD Section (Optional)</label>
              <Select
                value={wizardData.prdSectionId}
                onValueChange={(value) => setWizardData((prev) => ({ ...prev, prdSectionId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a PRD section..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {prdSections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'figma':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Figma Links</label>
              <Button variant="outline" size="sm" onClick={addFigmaLink} className="gap-1">
                <Plus className="h-3 w-3" />
                Add Link
              </Button>
            </div>
            {wizardData.figmaLinks.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <Link className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No Figma links added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {wizardData.figmaLinks.map((link, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={link.name}
                          onChange={(e) => updateFigmaLink(idx, 'name', e.target.value)}
                          placeholder="Component name"
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => removeFigmaLink(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        value={link.url}
                        onChange={(e) => updateFigmaLink(idx, 'url', e.target.value)}
                        placeholder="Figma URL (e.g., https://figma.com/design/...)"
                      />
                      <Input
                        value={link.nodeId}
                        onChange={(e) => updateFigmaLink(idx, 'nodeId', e.target.value)}
                        placeholder="Node ID (optional)"
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {wizardData.figmaLinks.length > 0 && wizardData.figmaLinks.some((l) => l.url) && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted mb-2">Preview Figma designs in the viewer after creation</p>
              </div>
            )}
          </div>
        )

      case 'specs':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Component Specifications</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSpecs}
                  disabled={isGeneratingSpecs || wizardData.figmaLinks.length === 0}
                  className="gap-1"
                >
                  {isGeneratingSpecs ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI Generate
                </Button>
                <Button variant="outline" size="sm" onClick={addComponentSpec} className="gap-1">
                  <Plus className="h-3 w-3" />
                  Add Spec
                </Button>
              </div>
            </div>
            {wizardData.componentSpecs.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No component specs defined yet</p>
                <p className="text-xs mt-1">Add Figma links and use AI Generate, or add manually</p>
              </div>
            ) : (
              <div className="space-y-3">
                {wizardData.componentSpecs.map((spec, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={spec.name}
                          onChange={(e) => updateComponentSpec(idx, { ...spec, name: e.target.value })}
                          placeholder="Component name"
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => removeComponentSpec(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={JSON.stringify(spec.props || {}, null, 2)}
                        onChange={(e) => {
                          try {
                            const props = JSON.parse(e.target.value)
                            updateComponentSpec(idx, { ...spec, props })
                          } catch {
                            // Invalid JSON, ignore
                          }
                        }}
                        placeholder='Props (JSON): { "label": { "type": "string", "required": true } }'
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )

      case 'tokens':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Design Tokens</label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExtractTokens}
                disabled={isExtractingTokens || wizardData.figmaLinks.length === 0}
                className="gap-1"
              >
                {isExtractingTokens ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Extract from Figma
              </Button>
            </div>
            <Tabs defaultValue="colors">
              <TabsList className="w-full">
                <TabsTrigger value="colors" className="flex-1">Colors</TabsTrigger>
                <TabsTrigger value="spacing" className="flex-1">Spacing</TabsTrigger>
                <TabsTrigger value="typography" className="flex-1">Typography</TabsTrigger>
              </TabsList>
              <TabsContent value="colors" className="mt-4">
                <Textarea
                  value={JSON.stringify(wizardData.designTokens.colors || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const colors = JSON.parse(e.target.value)
                      setWizardData((prev) => ({
                        ...prev,
                        designTokens: { ...prev.designTokens, colors },
                      }))
                    } catch {
                      // Invalid JSON
                    }
                  }}
                  placeholder='{ "primary": "#3b82f6", "secondary": "#6b7280" }'
                  className="font-mono text-xs min-h-[120px]"
                />
              </TabsContent>
              <TabsContent value="spacing" className="mt-4">
                <Textarea
                  value={JSON.stringify(wizardData.designTokens.spacing || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const spacing = JSON.parse(e.target.value)
                      setWizardData((prev) => ({
                        ...prev,
                        designTokens: { ...prev.designTokens, spacing },
                      }))
                    } catch {
                      // Invalid JSON
                    }
                  }}
                  placeholder='{ "sm": "0.5rem", "md": "1rem", "lg": "1.5rem" }'
                  className="font-mono text-xs min-h-[120px]"
                />
              </TabsContent>
              <TabsContent value="typography" className="mt-4">
                <Textarea
                  value={JSON.stringify(wizardData.designTokens.typography || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const typography = JSON.parse(e.target.value)
                      setWizardData((prev) => ({
                        ...prev,
                        designTokens: { ...prev.designTokens, typography },
                      }))
                    } catch {
                      // Invalid JSON
                    }
                  }}
                  placeholder='{ "heading": { "fontFamily": "Inter", "fontSize": "2rem" } }'
                  className="font-mono text-xs min-h-[120px]"
                />
              </TabsContent>
            </Tabs>
          </div>
        )

      case 'assets':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Wireframe URLs</label>
              <div className="space-y-2">
                {wizardData.wireframes.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={url}
                      onChange={(e) => {
                        const newWireframes = [...wizardData.wireframes]
                        newWireframes[idx] = e.target.value
                        setWizardData((prev) => ({ ...prev, wireframes: newWireframes }))
                      }}
                      placeholder="Wireframe URL"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => {
                        setWizardData((prev) => ({
                          ...prev,
                          wireframes: prev.wireframes.filter((_, i) => i !== idx),
                        }))
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWizardData((prev) => ({ ...prev, wireframes: [...prev.wireframes, ''] }))}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Wireframe
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mockup URLs</label>
              <div className="space-y-2">
                {wizardData.mockups.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={url}
                      onChange={(e) => {
                        const newMockups = [...wizardData.mockups]
                        newMockups[idx] = e.target.value
                        setWizardData((prev) => ({ ...prev, mockups: newMockups }))
                      }}
                      placeholder="Mockup URL"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => {
                        setWizardData((prev) => ({
                          ...prev,
                          mockups: prev.mockups.filter((_, i) => i !== idx),
                        }))
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWizardData((prev) => ({ ...prev, mockups: [...prev.mockups, ''] }))}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Mockup
                </Button>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const renderDesignPackList = () => (
    <div className="space-y-3">
      {designPacks.length === 0 ? (
        <div className="text-center py-12">
          <Palette className="h-12 w-12 mx-auto mb-4 text-muted opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Design Packs</h3>
          <p className="text-sm text-muted mb-4">Create your first design pack to get started</p>
          <Button onClick={() => setShowWizard(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Design Pack
          </Button>
        </div>
      ) : (
        designPacks.map((pack) => (
          <Card
            key={pack.id}
            className="p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
            onClick={() => {
              setSelectedPack(pack)
              setViewMode('detail')
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm">{getTicketTitle(pack.ticketId)}</h4>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5"
                    style={{
                      color: STATUS_COLORS[pack.status],
                      borderColor: STATUS_COLORS[pack.status],
                    }}
                  >
                    {STATUS_LABELS[pack.status]}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Link className="h-3 w-3" />
                    {pack.figmaLinks.length} Figma links
                  </span>
                  <span className="flex items-center gap-1">
                    <FileCode className="h-3 w-3" />
                    {pack.componentSpecs.length} specs
                  </span>
                  <span className="flex items-center gap-1">
                    <Image className="h-3 w-3" />
                    {pack.wireframes.length + pack.mockups.length} assets
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted" />
            </div>
          </Card>
        ))
      )}
    </div>
  )

  const renderDesignPackDetail = () => {
    if (!selectedPack) return null

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedPack(null)
              setViewMode('list')
            }}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {selectedPack.status === 'draft' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSubmitForReview(selectedPack.id)}
                className="gap-1"
              >
                <Send className="h-3 w-3" />
                Submit for Review
              </Button>
            )}
            {selectedPack.status === 'review' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleApprove(selectedPack.id)}
                className="gap-1 text-green-500 border-green-500/30 hover:bg-green-500/10"
              >
                <Check className="h-3 w-3" />
                Approve
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditData(selectedPack)
                setViewMode('edit')
              }}
              className="gap-1"
            >
              <Edit className="h-3 w-3" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteDesignPack(selectedPack.id)}
              className="gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-medium">{getTicketTitle(selectedPack.ticketId)}</h3>
            <Badge
              variant="outline"
              style={{
                color: STATUS_COLORS[selectedPack.status],
                borderColor: STATUS_COLORS[selectedPack.status],
              }}
            >
              {STATUS_LABELS[selectedPack.status]}
            </Badge>
          </div>
          {selectedPack.prdSectionId && (
            <p className="text-sm text-muted mb-4">
              Linked to PRD: {getPRDSectionTitle(selectedPack.prdSectionId)}
            </p>
          )}
        </Card>

        <Tabs defaultValue="figma">
          <TabsList className="w-full">
            <TabsTrigger value="figma" className="flex-1 gap-1">
              <Link className="h-3 w-3" />
              Figma ({selectedPack.figmaLinks.length})
            </TabsTrigger>
            <TabsTrigger value="specs" className="flex-1 gap-1">
              <FileCode className="h-3 w-3" />
              Specs ({selectedPack.componentSpecs.length})
            </TabsTrigger>
            <TabsTrigger value="tokens" className="flex-1 gap-1">
              <Layers className="h-3 w-3" />
              Tokens
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex-1 gap-1">
              <Image className="h-3 w-3" />
              Assets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="figma" className="mt-4">
            {selectedPack.figmaLinks.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <Link className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No Figma links</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedPack.figmaLinks.map((link, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">{link.name || `Link ${idx + 1}`}</h4>
                        <p className="text-xs text-muted truncate max-w-md">{link.url}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(link.url, '_blank')}
                        className="gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </Button>
                    </div>
                    {link.url && (
                      <div className="mt-3 rounded-md bg-secondary/50 p-4 text-center">
                        <p className="text-xs text-muted">Figma embed preview</p>
                        <iframe
                          src={`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(link.url)}`}
                          className="w-full h-[300px] mt-2 rounded border border-border"
                          allowFullScreen
                        />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="specs" className="mt-4">
            {selectedPack.componentSpecs.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No component specs</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedPack.componentSpecs.map((spec, idx) => (
                  <Card key={idx} className="p-3">
                    <h4 className="font-medium text-sm mb-2">{spec.name}</h4>
                    {spec.props && Object.keys(spec.props).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted font-medium">Props:</p>
                        <div className="bg-secondary/50 rounded p-2">
                          <pre className="text-xs font-mono overflow-x-auto">
                            {JSON.stringify(spec.props, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                    {spec.variants && spec.variants.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted font-medium">Variants:</p>
                        <div className="flex flex-wrap gap-1">
                          {spec.variants.map((v, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {v.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tokens" className="mt-4">
            {!selectedPack.designTokens ||
            Object.keys(selectedPack.designTokens).every(
              (k) => !selectedPack.designTokens?.[k as keyof DesignTokens] ||
                Object.keys(selectedPack.designTokens[k as keyof DesignTokens] || {}).length === 0
            ) ? (
              <div className="text-center py-8 text-muted">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No design tokens</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedPack.designTokens.colors && Object.keys(selectedPack.designTokens.colors).length > 0 && (
                  <Card className="p-3">
                    <h4 className="font-medium text-sm mb-2">Colors</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(selectedPack.designTokens.colors).map(([name, value]) => (
                        <div key={name} className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border border-border"
                            style={{ backgroundColor: value }}
                          />
                          <div>
                            <p className="text-xs font-medium">{name}</p>
                            <p className="text-[10px] text-muted">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {selectedPack.designTokens.spacing && Object.keys(selectedPack.designTokens.spacing).length > 0 && (
                  <Card className="p-3">
                    <h4 className="font-medium text-sm mb-2">Spacing</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(selectedPack.designTokens.spacing).map(([name, value]) => (
                        <div key={name} className="flex items-center gap-2">
                          <code className="text-xs bg-secondary px-1 rounded">{name}</code>
                          <span className="text-xs text-muted">{value}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {selectedPack.designTokens.typography && Object.keys(selectedPack.designTokens.typography).length > 0 && (
                  <Card className="p-3">
                    <h4 className="font-medium text-sm mb-2">Typography</h4>
                    <div className="space-y-2">
                      {Object.entries(selectedPack.designTokens.typography).map(([name, styles]) => (
                        <div key={name} className="flex items-start gap-2">
                          <code className="text-xs bg-secondary px-1 rounded">{name}</code>
                          <div className="text-xs text-muted">
                            {Object.entries(styles).map(([k, v]) => `${k}: ${v}`).join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assets" className="mt-4">
            {selectedPack.wireframes.length === 0 && selectedPack.mockups.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No assets uploaded</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedPack.wireframes.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Wireframes</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {selectedPack.wireframes.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-2 rounded border border-border hover:bg-secondary/50 transition-colors"
                        >
                          <div className="aspect-video bg-secondary/50 rounded flex items-center justify-center mb-1">
                            <Image className="h-6 w-6 text-muted" />
                          </div>
                          <p className="text-xs text-muted truncate">Wireframe {idx + 1}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selectedPack.mockups.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Mockups</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {selectedPack.mockups.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-2 rounded border border-border hover:bg-secondary/50 transition-colors"
                        >
                          <div className="aspect-video bg-secondary/50 rounded flex items-center justify-center mb-1">
                            <Image className="h-6 w-6 text-muted" />
                          </div>
                          <p className="text-xs text-muted truncate">Mockup {idx + 1}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  const renderDesignPackEdit = () => {
    if (!selectedPack) return null

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('detail')}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpdateDesignPack}
            disabled={isSaving}
            className="gap-1"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Changes
          </Button>
        </div>

        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select
              value={editData.status || selectedPack.status}
              onValueChange={(value) => setEditData((prev) => ({ ...prev, status: value as DesignPackStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">PRD Section</label>
            <Select
              value={editData.prdSectionId ?? selectedPack.prdSectionId ?? ''}
              onValueChange={(value) => setEditData((prev) => ({ ...prev, prdSectionId: value || undefined }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {prdSections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Figma Links</label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentLinks = editData.figmaLinks || selectedPack.figmaLinks
                setEditData((prev) => ({
                  ...prev,
                  figmaLinks: [...currentLinks, { url: '', nodeId: '', name: '' }],
                }))
              }}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          {(editData.figmaLinks || selectedPack.figmaLinks).map((link, idx) => (
            <div key={idx} className="space-y-2 p-3 rounded border border-border">
              <div className="flex items-center gap-2">
                <Input
                  value={link.name}
                  onChange={(e) => {
                    const links = [...(editData.figmaLinks || selectedPack.figmaLinks)]
                    links[idx] = { ...links[idx], name: e.target.value }
                    setEditData((prev) => ({ ...prev, figmaLinks: links }))
                  }}
                  placeholder="Name"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500"
                  onClick={() => {
                    const links = (editData.figmaLinks || selectedPack.figmaLinks).filter((_, i) => i !== idx)
                    setEditData((prev) => ({ ...prev, figmaLinks: links }))
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={link.url}
                onChange={(e) => {
                  const links = [...(editData.figmaLinks || selectedPack.figmaLinks)]
                  links[idx] = { ...links[idx], url: e.target.value }
                  setEditData((prev) => ({ ...prev, figmaLinks: links }))
                }}
                placeholder="Figma URL"
              />
              <Input
                value={link.nodeId}
                onChange={(e) => {
                  const links = [...(editData.figmaLinks || selectedPack.figmaLinks)]
                  links[idx] = { ...links[idx], nodeId: e.target.value }
                  setEditData((prev) => ({ ...prev, figmaLinks: links }))
                }}
                placeholder="Node ID"
              />
            </div>
          ))}
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Component Specs</label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentSpecs = editData.componentSpecs || selectedPack.componentSpecs
                setEditData((prev) => ({
                  ...prev,
                  componentSpecs: [...currentSpecs, { name: '', props: {}, variants: [] }],
                }))
              }}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          {(editData.componentSpecs || selectedPack.componentSpecs).map((spec, idx) => (
            <div key={idx} className="space-y-2 p-3 rounded border border-border">
              <div className="flex items-center gap-2">
                <Input
                  value={spec.name}
                  onChange={(e) => {
                    const specs = [...(editData.componentSpecs || selectedPack.componentSpecs)]
                    specs[idx] = { ...specs[idx], name: e.target.value }
                    setEditData((prev) => ({ ...prev, componentSpecs: specs }))
                  }}
                  placeholder="Component name"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500"
                  onClick={() => {
                    const specs = (editData.componentSpecs || selectedPack.componentSpecs).filter((_, i) => i !== idx)
                    setEditData((prev) => ({ ...prev, componentSpecs: specs }))
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={JSON.stringify(spec.props || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const props = JSON.parse(e.target.value)
                    const specs = [...(editData.componentSpecs || selectedPack.componentSpecs)]
                    specs[idx] = { ...specs[idx], props }
                    setEditData((prev) => ({ ...prev, componentSpecs: specs }))
                  } catch {
                    // Invalid JSON
                  }
                }}
                placeholder="Props (JSON)"
                className="font-mono text-xs min-h-[80px]"
              />
            </div>
          ))}
        </Card>

        <Card className="p-4 space-y-4">
          <label className="text-sm font-medium">Design Tokens</label>
          <Textarea
            value={JSON.stringify(editData.designTokens || selectedPack.designTokens || {}, null, 2)}
            onChange={(e) => {
              try {
                const tokens = JSON.parse(e.target.value)
                setEditData((prev) => ({ ...prev, designTokens: tokens }))
              } catch {
                // Invalid JSON
              }
            }}
            placeholder="Design tokens (JSON)"
            className="font-mono text-xs min-h-[120px]"
          />
        </Card>
      </div>
    )
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Design Packs</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {designPacks.length}
            </Badge>
          </div>
          {viewMode === 'list' && designPacks.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWizard(true)}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              New
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : viewMode === 'list' ? (
          renderDesignPackList()
        ) : viewMode === 'detail' ? (
          renderDesignPackDetail()
        ) : (
          renderDesignPackEdit()
        )}
      </CardContent>

      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Create Design Pack
            </DialogTitle>
            <DialogDescription>
              Step {wizardStep + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[wizardStep].description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 py-2 overflow-x-auto">
            {WIZARD_STEPS.map((step, idx) => (
              <div
                key={step.id}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap ${
                  idx === wizardStep
                    ? 'bg-primary text-primary-foreground'
                    : idx < wizardStep
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-secondary text-muted'
                }`}
              >
                {idx < wizardStep ? <Check className="h-3 w-3" /> : <span>{idx + 1}</span>}
                <span className="hidden sm:inline">{step.title}</span>
              </div>
            ))}
          </div>

          <div className="py-4">{renderWizardContent()}</div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  if (wizardStep === 0) {
                    setShowWizard(false)
                    resetWizard()
                  } else {
                    setWizardStep((prev) => prev - 1)
                  }
                }}
                className="flex-1 sm:flex-none"
              >
                {wizardStep === 0 ? 'Cancel' : 'Back'}
              </Button>
              {wizardStep < WIZARD_STEPS.length - 1 ? (
                <Button
                  onClick={() => setWizardStep((prev) => prev + 1)}
                  disabled={wizardStep === 0 && !wizardData.ticketId}
                  className="flex-1 sm:flex-none"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreateDesignPack}
                  disabled={isSaving || !wizardData.ticketId}
                  className="flex-1 sm:flex-none"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Design Pack
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
