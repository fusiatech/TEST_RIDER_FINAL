'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { DevPack, DevPackStatus, ApiSpec, TestCase, Ticket, PRDSection } from '@/lib/types'
import {
  Sparkles,
  Save,
  Plus,
  X,
  Loader2,
  Check,
  Eye,
  Edit,
  Trash2,
  Code2,
  Database,
  FileCode,
  TestTube2,
  Package,
  ChevronDown,
  ChevronUp,
  GitBranch,
  FileText,
  Link2,
  RefreshCw,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'

interface DevPackGeneratorProps {
  projectId: string
  tickets: Ticket[]
  prdSections?: PRDSection[]
  onDevPackCreated?: (devPack: DevPack) => void
  onDevPackUpdated?: (devPack: DevPack) => void
}

const STATUS_COLORS: Record<DevPackStatus, string> = {
  draft: '#eab308',
  review: '#3b82f6',
  approved: '#22c55e',
}

const STATUS_ICONS: Record<DevPackStatus, React.ReactNode> = {
  draft: <Clock className="h-3 w-3" />,
  review: <Eye className="h-3 w-3" />,
  approved: <CheckCircle className="h-3 w-3" />,
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const TEST_TYPES = ['unit', 'integration', 'e2e', 'performance', 'security'] as const
const TEST_PRIORITIES = ['low', 'medium', 'high'] as const

const COMMON_TECH_STACKS = [
  'React', 'Next.js', 'TypeScript', 'Node.js', 'Express', 'PostgreSQL', 'MongoDB',
  'Redis', 'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'REST API', 'Tailwind CSS',
  'Prisma', 'tRPC', 'Zod', 'Jest', 'Vitest', 'Playwright', 'Cypress',
]

export function DevPackGenerator({
  projectId,
  tickets,
  prdSections = [],
  onDevPackCreated,
  onDevPackUpdated,
}: DevPackGeneratorProps) {
  const [devPacks, setDevPacks] = useState<DevPack[]>([])
  const [selectedDevPack, setSelectedDevPack] = useState<DevPack | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [isEditing, setIsEditing] = useState(false)

  const [wizardData, setWizardData] = useState({
    ticketId: '',
    prdSectionId: '',
    techStack: [] as string[],
    customTech: '',
  })

  const [editData, setEditData] = useState<Partial<DevPack>>({})
  const [expandedApiSpecs, setExpandedApiSpecs] = useState<Set<number>>(new Set())
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadDevPacks()
  }, [projectId])

  const loadDevPacks = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/dev-packs`)
      if (!res.ok) throw new Error('Failed to load dev packs')
      const data = await res.json()
      setDevPacks(data)
    } catch (err) {
      toast.error('Failed to load dev packs', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  const selectedTicket = useMemo(() => {
    return tickets.find((t) => t.id === wizardData.ticketId)
  }, [tickets, wizardData.ticketId])

  const selectedPrdSection = useMemo(() => {
    return prdSections.find((s) => s.id === wizardData.prdSectionId)
  }, [prdSections, wizardData.prdSectionId])

  const handleStartWizard = useCallback(() => {
    setWizardData({
      ticketId: '',
      prdSectionId: '',
      techStack: [],
      customTech: '',
    })
    setWizardStep(0)
    setShowWizard(true)
  }, [])

  const handleGenerateDevPack = useCallback(async () => {
    if (!wizardData.ticketId) {
      toast.error('Please select a ticket')
      return
    }

    setIsGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/dev-packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: wizardData.ticketId,
          prdSectionId: wizardData.prdSectionId || undefined,
          techStack: wizardData.techStack,
          generateAI: true,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate dev pack')
      }

      const devPack = await res.json()
      setDevPacks((prev) => [...prev, devPack])
      setSelectedDevPack(devPack)
      setShowWizard(false)
      onDevPackCreated?.(devPack)
      toast.success('Dev pack generated successfully')
    } catch (err) {
      toast.error('Failed to generate dev pack', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, wizardData, onDevPackCreated])

  const handleSaveDevPack = useCallback(async () => {
    if (!selectedDevPack) return

    setIsSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/dev-packs/${selectedDevPack.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save dev pack')
      }

      const updatedDevPack = await res.json()
      setDevPacks((prev) =>
        prev.map((dp) => (dp.id === updatedDevPack.id ? updatedDevPack : dp))
      )
      setSelectedDevPack(updatedDevPack)
      setIsEditing(false)
      onDevPackUpdated?.(updatedDevPack)
      toast.success('Dev pack saved successfully')
    } catch (err) {
      toast.error('Failed to save dev pack', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, selectedDevPack, editData, onDevPackUpdated])

  const handleDeleteDevPack = useCallback(async (devPackId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/dev-packs/${devPackId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete dev pack')
      }

      setDevPacks((prev) => prev.filter((dp) => dp.id !== devPackId))
      if (selectedDevPack?.id === devPackId) {
        setSelectedDevPack(null)
      }
      toast.success('Dev pack deleted')
    } catch (err) {
      toast.error('Failed to delete dev pack', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [projectId, selectedDevPack])

  const handleStatusChange = useCallback(async (status: DevPackStatus) => {
    if (!selectedDevPack) return

    setIsSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/dev-packs/${selectedDevPack.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update status')
      }

      const updatedDevPack = await res.json()
      setDevPacks((prev) =>
        prev.map((dp) => (dp.id === updatedDevPack.id ? updatedDevPack : dp))
      )
      setSelectedDevPack(updatedDevPack)
      toast.success(`Status changed to ${status}`)
    } catch (err) {
      toast.error('Failed to update status', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, selectedDevPack])

  const handleStartEditing = useCallback(() => {
    if (!selectedDevPack) return
    setEditData({ ...selectedDevPack })
    setIsEditing(true)
  }, [selectedDevPack])

  const handleCancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditData({})
  }, [])

  const toggleTechStack = useCallback((tech: string) => {
    setWizardData((prev) => ({
      ...prev,
      techStack: prev.techStack.includes(tech)
        ? prev.techStack.filter((t) => t !== tech)
        : [...prev.techStack, tech],
    }))
  }, [])

  const addCustomTech = useCallback(() => {
    if (wizardData.customTech.trim()) {
      setWizardData((prev) => ({
        ...prev,
        techStack: [...prev.techStack, prev.customTech.trim()],
        customTech: '',
      }))
    }
  }, [wizardData.customTech])

  const toggleApiSpecExpanded = useCallback((index: number) => {
    setExpandedApiSpecs((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const toggleTestCaseExpanded = useCallback((id: string) => {
    setExpandedTestCases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }, [])

  const addApiSpec = useCallback(() => {
    setEditData((prev) => ({
      ...prev,
      apiSpecs: [
        ...(prev.apiSpecs || []),
        {
          endpoint: '/api/',
          method: 'GET',
          description: '',
        },
      ],
    }))
  }, [])

  const updateApiSpec = useCallback((index: number, updates: Partial<ApiSpec>) => {
    setEditData((prev) => ({
      ...prev,
      apiSpecs: (prev.apiSpecs || []).map((spec, i) =>
        i === index ? { ...spec, ...updates } : spec
      ),
    }))
  }, [])

  const removeApiSpec = useCallback((index: number) => {
    setEditData((prev) => ({
      ...prev,
      apiSpecs: (prev.apiSpecs || []).filter((_, i) => i !== index),
    }))
  }, [])

  const addTestCase = useCallback(() => {
    setEditData((prev) => ({
      ...prev,
      testPlan: [
        ...(prev.testPlan || []),
        {
          id: `test-${Date.now()}`,
          name: '',
          description: '',
          type: 'unit',
          steps: [],
          expectedResult: '',
          priority: 'medium',
        },
      ],
    }))
  }, [])

  const updateTestCase = useCallback((id: string, updates: Partial<TestCase>) => {
    setEditData((prev) => ({
      ...prev,
      testPlan: (prev.testPlan || []).map((tc) =>
        tc.id === id ? { ...tc, ...updates } : tc
      ),
    }))
  }, [])

  const removeTestCase = useCallback((id: string) => {
    setEditData((prev) => ({
      ...prev,
      testPlan: (prev.testPlan || []).filter((tc) => tc.id !== id),
    }))
  }, [])

  const addDependency = useCallback(() => {
    setEditData((prev) => ({
      ...prev,
      dependencies: [...(prev.dependencies || []), ''],
    }))
  }, [])

  const updateDependency = useCallback((index: number, value: string) => {
    setEditData((prev) => ({
      ...prev,
      dependencies: (prev.dependencies || []).map((dep, i) =>
        i === index ? value : dep
      ),
    }))
  }, [])

  const removeDependency = useCallback((index: number) => {
    setEditData((prev) => ({
      ...prev,
      dependencies: (prev.dependencies || []).filter((_, i) => i !== index),
    }))
  }, [])

  const addTechStackItem = useCallback(() => {
    setEditData((prev) => ({
      ...prev,
      techStack: [...(prev.techStack || []), ''],
    }))
  }, [])

  const updateTechStackItem = useCallback((index: number, value: string) => {
    setEditData((prev) => ({
      ...prev,
      techStack: (prev.techStack || []).map((tech, i) =>
        i === index ? value : tech
      ),
    }))
  }, [])

  const removeTechStackItem = useCallback((index: number) => {
    setEditData((prev) => ({
      ...prev,
      techStack: (prev.techStack || []).filter((_, i) => i !== index),
    }))
  }, [])

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">Dev Packs</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {devPacks.length}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handleStartWizard}
            >
              <Plus className="h-3 w-3" />
              Create Dev Pack
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {devPacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Code2 className="h-10 w-10 text-muted mb-3" />
              <h3 className="text-sm font-medium text-foreground mb-1">No dev packs yet</h3>
              <p className="text-xs text-muted mb-4 max-w-sm">
                Create a dev pack to generate architecture diagrams, API specs, and test plans for your tickets.
              </p>
              <Button onClick={handleStartWizard} size="sm" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Create Dev Pack
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {devPacks.map((devPack) => {
                const ticket = tickets.find((t) => t.id === devPack.ticketId)
                return (
                  <div
                    key={devPack.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedDevPack?.id === devPack.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedDevPack(devPack)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICONS[devPack.status]}
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5"
                          style={{
                            color: STATUS_COLORS[devPack.status],
                            borderColor: STATUS_COLORS[devPack.status],
                          }}
                        >
                          {devPack.status}
                        </Badge>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {ticket?.title || 'Unknown Ticket'}
                        </p>
                        <p className="text-xs text-muted">
                          {devPack.techStack.slice(0, 3).join(', ')}
                          {devPack.techStack.length > 3 && ` +${devPack.techStack.length - 3}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDevPack(devPack.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dev Pack Viewer/Editor */}
      {selectedDevPack && (
        <DevPackViewer
          devPack={selectedDevPack}
          ticket={tickets.find((t) => t.id === selectedDevPack.ticketId)}
          prdSection={prdSections.find((s) => s.id === selectedDevPack.prdSectionId)}
          isEditing={isEditing}
          editData={editData}
          isSaving={isSaving}
          expandedApiSpecs={expandedApiSpecs}
          expandedTestCases={expandedTestCases}
          onStartEditing={handleStartEditing}
          onCancelEditing={handleCancelEditing}
          onSave={handleSaveDevPack}
          onStatusChange={handleStatusChange}
          onClose={() => setSelectedDevPack(null)}
          onToggleApiSpec={toggleApiSpecExpanded}
          onToggleTestCase={toggleTestCaseExpanded}
          onCopy={copyToClipboard}
          onEditDataChange={setEditData}
          onAddApiSpec={addApiSpec}
          onUpdateApiSpec={updateApiSpec}
          onRemoveApiSpec={removeApiSpec}
          onAddTestCase={addTestCase}
          onUpdateTestCase={updateTestCase}
          onRemoveTestCase={removeTestCase}
          onAddDependency={addDependency}
          onUpdateDependency={updateDependency}
          onRemoveDependency={removeDependency}
          onAddTechStack={addTechStackItem}
          onUpdateTechStack={updateTechStackItem}
          onRemoveTechStack={removeTechStackItem}
        />
      )}

      {/* Creation Wizard */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create Dev Pack
            </DialogTitle>
            <DialogDescription>
              Generate a comprehensive development pack with architecture diagrams, API specs, and test plans.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((step) => (
                <div
                  key={step}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    wizardStep >= step ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Select Ticket */}
            {wizardStep === 0 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Ticket *</label>
                  <Select
                    value={wizardData.ticketId}
                    onValueChange={(value) =>
                      setWizardData((prev) => ({ ...prev, ticketId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a ticket..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tickets.map((ticket) => (
                        <SelectItem key={ticket.id} value={ticket.id}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {ticket.complexity}
                            </Badge>
                            <span className="truncate">{ticket.title}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTicket && (
                  <div className="rounded-lg border border-border p-3 bg-secondary/30">
                    <p className="text-sm font-medium text-foreground mb-1">
                      {selectedTicket.title}
                    </p>
                    <p className="text-xs text-muted line-clamp-2">
                      {selectedTicket.description || 'No description'}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Link to PRD Section (optional)</label>
                  <Select
                    value={wizardData.prdSectionId}
                    onValueChange={(value) =>
                      setWizardData((prev) => ({ ...prev, prdSectionId: value }))
                    }
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
            )}

            {/* Step 2: Tech Stack */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tech Stack</label>
                  <p className="text-xs text-muted">
                    Select the technologies that will be used in this implementation.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {COMMON_TECH_STACKS.map((tech) => (
                    <Badge
                      key={tech}
                      variant={wizardData.techStack.includes(tech) ? 'default' : 'outline'}
                      className="cursor-pointer transition-colors"
                      onClick={() => toggleTechStack(tech)}
                    >
                      {wizardData.techStack.includes(tech) && (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      {tech}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={wizardData.customTech}
                    onChange={(e) =>
                      setWizardData((prev) => ({ ...prev, customTech: e.target.value }))
                    }
                    placeholder="Add custom technology..."
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustomTech()
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addCustomTech}
                    disabled={!wizardData.customTech.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {wizardData.techStack.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">Selected:</label>
                    <div className="flex flex-wrap gap-1">
                      {wizardData.techStack.map((tech) => (
                        <Badge key={tech} variant="secondary" className="gap-1">
                          {tech}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-red-500"
                            onClick={() => toggleTechStack(tech)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Review & Generate */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Review & Generate</label>
                  <p className="text-xs text-muted">
                    Review your selections and generate the dev pack. AI will create architecture diagrams, API specs, database schemas, and test plans.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-muted">Ticket</p>
                      <p className="text-sm text-foreground">{selectedTicket?.title}</p>
                    </div>
                  </div>

                  {selectedPrdSection && (
                    <div className="flex items-start gap-3">
                      <Link2 className="h-4 w-4 text-muted mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-muted">PRD Section</p>
                        <p className="text-sm text-foreground">{selectedPrdSection.title}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <Package className="h-4 w-4 text-muted mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-muted">Tech Stack</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {wizardData.techStack.length > 0 ? (
                          wizardData.techStack.map((tech) => (
                            <Badge key={tech} variant="secondary" className="text-[10px]">
                              {tech}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted italic">None selected</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs text-foreground">
                    <Sparkles className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                    AI will generate: Architecture diagram (Mermaid), API specifications, database schema, implementation notes, and test plan.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between">
            <div>
              {wizardStep > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setWizardStep((prev) => prev - 1)}
                  disabled={isGenerating}
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowWizard(false)}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              {wizardStep < 2 ? (
                <Button
                  onClick={() => setWizardStep((prev) => prev + 1)}
                  disabled={wizardStep === 0 && !wizardData.ticketId}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={handleGenerateDevPack} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Dev Pack
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface DevPackViewerProps {
  devPack: DevPack
  ticket?: Ticket
  prdSection?: PRDSection
  isEditing: boolean
  editData: Partial<DevPack>
  isSaving: boolean
  expandedApiSpecs: Set<number>
  expandedTestCases: Set<string>
  onStartEditing: () => void
  onCancelEditing: () => void
  onSave: () => void
  onStatusChange: (status: DevPackStatus) => void
  onClose: () => void
  onToggleApiSpec: (index: number) => void
  onToggleTestCase: (id: string) => void
  onCopy: (text: string, label: string) => void
  onEditDataChange: (data: Partial<DevPack>) => void
  onAddApiSpec: () => void
  onUpdateApiSpec: (index: number, updates: Partial<ApiSpec>) => void
  onRemoveApiSpec: (index: number) => void
  onAddTestCase: () => void
  onUpdateTestCase: (id: string, updates: Partial<TestCase>) => void
  onRemoveTestCase: (id: string) => void
  onAddDependency: () => void
  onUpdateDependency: (index: number, value: string) => void
  onRemoveDependency: (index: number) => void
  onAddTechStack: () => void
  onUpdateTechStack: (index: number, value: string) => void
  onRemoveTechStack: (index: number) => void
}

function DevPackViewer({
  devPack,
  ticket,
  prdSection,
  isEditing,
  editData,
  isSaving,
  expandedApiSpecs,
  expandedTestCases,
  onStartEditing,
  onCancelEditing,
  onSave,
  onStatusChange,
  onClose,
  onToggleApiSpec,
  onToggleTestCase,
  onCopy,
  onEditDataChange,
  onAddApiSpec,
  onUpdateApiSpec,
  onRemoveApiSpec,
  onAddTestCase,
  onUpdateTestCase,
  onRemoveTestCase,
  onAddDependency,
  onUpdateDependency,
  onRemoveDependency,
  onAddTechStack,
  onUpdateTechStack,
  onRemoveTechStack,
}: DevPackViewerProps) {
  const data = isEditing ? editData : devPack

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-base font-semibold text-foreground">
                {ticket?.title || 'Dev Pack'}
              </CardTitle>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5"
                style={{
                  color: STATUS_COLORS[devPack.status],
                  borderColor: STATUS_COLORS[devPack.status],
                }}
              >
                {STATUS_ICONS[devPack.status]}
                <span className="ml-1">{devPack.status}</span>
              </Badge>
            </div>
            {prdSection && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Link2 className="h-3 w-3" />
                Linked to: {prdSection.title}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onStartEditing}
                  title="Edit dev pack"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-500 hover:text-green-400"
                  onClick={onSave}
                  disabled={isSaving}
                  title="Save changes"
                >
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-400"
                  onClick={onCancelEditing}
                  disabled={isSaving}
                  title="Cancel editing"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Architecture Diagram */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Architecture Diagram</span>
            </div>
            {!isEditing && data.architectureDiagram && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={() => onCopy(data.architectureDiagram || '', 'Mermaid diagram')}
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            )}
          </div>
          {isEditing ? (
            <Textarea
              value={editData.architectureDiagram || ''}
              onChange={(e) =>
                onEditDataChange({ ...editData, architectureDiagram: e.target.value })
              }
              placeholder="Enter Mermaid diagram code..."
              className="font-mono text-xs min-h-[200px]"
            />
          ) : data.architectureDiagram ? (
            <MermaidDiagram code={data.architectureDiagram} />
          ) : (
            <p className="text-sm text-muted italic">No architecture diagram</p>
          )}
        </div>

        {/* API Specs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">API Specifications</span>
              <Badge variant="secondary" className="text-[10px] px-1">
                {(data.apiSpecs || []).length}
              </Badge>
            </div>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={onAddApiSpec}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
          {(data.apiSpecs || []).length > 0 ? (
            <div className="space-y-2">
              {(data.apiSpecs || []).map((spec, index) => (
                <ApiSpecRow
                  key={index}
                  spec={spec}
                  index={index}
                  isEditing={isEditing}
                  isExpanded={expandedApiSpecs.has(index)}
                  onToggle={() => onToggleApiSpec(index)}
                  onUpdate={(updates) => onUpdateApiSpec(index, updates)}
                  onRemove={() => onRemoveApiSpec(index)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted italic">No API specifications</p>
          )}
        </div>

        {/* Database Schema */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Database Schema</span>
            </div>
            {!isEditing && data.databaseSchema && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={() => onCopy(data.databaseSchema || '', 'Database schema')}
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            )}
          </div>
          {isEditing ? (
            <Textarea
              value={editData.databaseSchema || ''}
              onChange={(e) =>
                onEditDataChange({ ...editData, databaseSchema: e.target.value })
              }
              placeholder="Enter database schema..."
              className="font-mono text-xs min-h-[150px]"
            />
          ) : data.databaseSchema ? (
            <pre className="rounded-md bg-secondary/50 p-3 text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
              {data.databaseSchema}
            </pre>
          ) : (
            <p className="text-sm text-muted italic">No database schema</p>
          )}
        </div>

        {/* Tech Stack */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Tech Stack</span>
            </div>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={onAddTechStack}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              {(editData.techStack || []).map((tech, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={tech}
                    onChange={(e) => onUpdateTechStack(index, e.target.value)}
                    placeholder="Technology..."
                    className="flex-1 h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-400"
                    onClick={() => onRemoveTechStack(index)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (data.techStack || []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(data.techStack || []).map((tech, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tech}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted italic">No tech stack defined</p>
          )}
        </div>

        {/* Dependencies */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Dependencies</span>
            </div>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={onAddDependency}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              {(editData.dependencies || []).map((dep, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={dep}
                    onChange={(e) => onUpdateDependency(index, e.target.value)}
                    placeholder="package@version"
                    className="flex-1 h-8 text-sm font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-400"
                    onClick={() => onRemoveDependency(index)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (data.dependencies || []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(data.dependencies || []).map((dep, index) => (
                <Badge key={index} variant="outline" className="text-xs font-mono">
                  {dep}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted italic">No dependencies listed</p>
          )}
        </div>

        {/* Implementation Notes */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-muted" />
            <span className="text-xs font-medium text-muted">Implementation Notes</span>
          </div>
          {isEditing ? (
            <Textarea
              value={editData.implementationNotes || ''}
              onChange={(e) =>
                onEditDataChange({ ...editData, implementationNotes: e.target.value })
              }
              placeholder="Enter implementation notes..."
              className="text-sm min-h-[100px]"
            />
          ) : data.implementationNotes ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {data.implementationNotes}
            </p>
          ) : (
            <p className="text-sm text-muted italic">No implementation notes</p>
          )}
        </div>

        {/* Test Plan */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TestTube2 className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Test Plan</span>
              <Badge variant="secondary" className="text-[10px] px-1">
                {(data.testPlan || []).length}
              </Badge>
            </div>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={onAddTestCase}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
          {(data.testPlan || []).length > 0 ? (
            <div className="space-y-2">
              {(data.testPlan || []).map((testCase) => (
                <TestCaseRow
                  key={testCase.id}
                  testCase={testCase}
                  isEditing={isEditing}
                  isExpanded={expandedTestCases.has(testCase.id)}
                  onToggle={() => onToggleTestCase(testCase.id)}
                  onUpdate={(updates) => onUpdateTestCase(testCase.id, updates)}
                  onRemove={() => onRemoveTestCase(testCase.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted italic">No test cases</p>
          )}
        </div>

        {/* Status Actions */}
        {!isEditing && devPack.status !== 'approved' && (
          <div className="flex items-center gap-2 pt-4 border-t border-border">
            {devPack.status === 'draft' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                onClick={() => onStatusChange('review')}
                disabled={isSaving}
              >
                <Eye className="h-3 w-3" />
                Submit for Review
              </Button>
            )}
            {devPack.status === 'review' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
                onClick={() => onStatusChange('approved')}
                disabled={isSaving}
              >
                <Check className="h-3 w-3" />
                Approve
              </Button>
            )}
          </div>
        )}

        {/* Timestamps */}
        <div className="flex items-center gap-2 text-[10px] text-muted pt-2">
          <Clock className="h-3 w-3" />
          <span>Created {new Date(devPack.createdAt).toLocaleString()}</span>
          {devPack.updatedAt !== devPack.createdAt && (
            <>
              <span className="text-border">|</span>
              <span>Updated {new Date(devPack.updatedAt).toLocaleString()}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface ApiSpecRowProps {
  spec: ApiSpec
  index: number
  isEditing: boolean
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<ApiSpec>) => void
  onRemove: () => void
}

function ApiSpecRow({
  spec,
  isEditing,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: ApiSpecRowProps) {
  const methodColors: Record<string, string> = {
    GET: '#22c55e',
    POST: '#3b82f6',
    PUT: '#f59e0b',
    PATCH: '#8b5cf6',
    DELETE: '#ef4444',
    HEAD: '#6b7280',
    OPTIONS: '#6b7280',
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-secondary/30"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 font-mono"
            style={{
              color: methodColors[spec.method],
              borderColor: methodColors[spec.method],
            }}
          >
            {spec.method}
          </Badge>
          <span className="text-sm font-mono text-foreground">{spec.endpoint}</span>
        </div>
        <div className="flex items-center gap-1">
          {isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-500 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3 bg-secondary/20">
          {isEditing ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Method</label>
                  <Select
                    value={spec.method}
                    onValueChange={(value) =>
                      onUpdate({ method: value as ApiSpec['method'] })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HTTP_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Endpoint</label>
                  <Input
                    value={spec.endpoint}
                    onChange={(e) => onUpdate({ endpoint: e.target.value })}
                    className="h-8 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Description</label>
                <Textarea
                  value={spec.description || ''}
                  onChange={(e) => onUpdate({ description: e.target.value })}
                  placeholder="API endpoint description..."
                  className="text-sm min-h-[60px]"
                />
              </div>
            </>
          ) : (
            <>
              {spec.description && (
                <p className="text-sm text-foreground">{spec.description}</p>
              )}
              {spec.requestSchema && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted">Request Schema</span>
                  <pre className="rounded bg-secondary/50 p-2 text-xs overflow-x-auto">
                    {JSON.stringify(spec.requestSchema, null, 2)}
                  </pre>
                </div>
              )}
              {spec.responseSchema && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted">Response Schema</span>
                  <pre className="rounded bg-secondary/50 p-2 text-xs overflow-x-auto">
                    {JSON.stringify(spec.responseSchema, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface TestCaseRowProps {
  testCase: TestCase
  isEditing: boolean
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<TestCase>) => void
  onRemove: () => void
}

function TestCaseRow({
  testCase,
  isEditing,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: TestCaseRowProps) {
  const priorityColors: Record<string, string> = {
    low: '#6b7280',
    medium: '#f59e0b',
    high: '#ef4444',
  }

  const typeColors: Record<string, string> = {
    unit: '#22c55e',
    integration: '#3b82f6',
    e2e: '#8b5cf6',
    performance: '#f59e0b',
    security: '#ef4444',
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-secondary/30"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {testCase.type && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5"
              style={{
                color: typeColors[testCase.type],
                borderColor: typeColors[testCase.type],
              }}
            >
              {testCase.type}
            </Badge>
          )}
          <span className="text-sm text-foreground">{testCase.name || 'Unnamed test'}</span>
          {testCase.priority && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1"
              style={{ color: priorityColors[testCase.priority] }}
            >
              {testCase.priority}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-500 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3 bg-secondary/20">
          {isEditing ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Name</label>
                  <Input
                    value={testCase.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Type</label>
                  <Select
                    value={testCase.type || 'unit'}
                    onValueChange={(value) =>
                      onUpdate({ type: value as TestCase['type'] })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Priority</label>
                <Select
                  value={testCase.priority || 'medium'}
                  onValueChange={(value) =>
                    onUpdate({ priority: value as TestCase['priority'] })
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEST_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Description</label>
                <Textarea
                  value={testCase.description || ''}
                  onChange={(e) => onUpdate({ description: e.target.value })}
                  placeholder="Test case description..."
                  className="text-sm min-h-[60px]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Expected Result</label>
                <Textarea
                  value={testCase.expectedResult || ''}
                  onChange={(e) => onUpdate({ expectedResult: e.target.value })}
                  placeholder="Expected result..."
                  className="text-sm min-h-[60px]"
                />
              </div>
            </>
          ) : (
            <>
              {testCase.description && (
                <p className="text-sm text-foreground">{testCase.description}</p>
              )}
              {testCase.steps && testCase.steps.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted">Steps</span>
                  <ol className="list-decimal list-inside space-y-1">
                    {testCase.steps.map((step, index) => (
                      <li key={index} className="text-sm text-foreground">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {testCase.expectedResult && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted">Expected Result</span>
                  <p className="text-sm text-foreground">{testCase.expectedResult}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface MermaidDiagramProps {
  code: string
}

function MermaidDiagram({ code }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let mounted = true

    async function renderMermaid() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
        })

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${Date.now()}`,
          code
        )

        if (mounted) {
          setSvg(renderedSvg)
          setError('')
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
          setSvg('')
        }
      }
    }

    renderMermaid()

    return () => {
      mounted = false
    }
  }, [code])

  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm text-red-500 mb-2">Failed to render diagram:</p>
        <pre className="text-xs text-muted overflow-x-auto">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-muted cursor-pointer">Show source</summary>
          <pre className="mt-2 rounded bg-secondary/50 p-2 text-xs overflow-x-auto">
            {code}
          </pre>
        </details>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    )
  }

  return (
    <div
      className="rounded-md bg-secondary/30 p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
