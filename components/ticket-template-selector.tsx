'use client'

import { useState, useMemo, useCallback } from 'react'
import type { TicketTemplate, TicketLevel, TicketTemplateCategory, CustomField } from '@/lib/types'
import {
  getAllTemplates,
  getTemplatesByLevel,
  getTemplatesByCategory,
  applyTemplate,
} from '@/lib/ticket-templates'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bug,
  Lightbulb,
  Wrench,
  Shield,
  Gauge,
  FileText,
  CheckCircle,
  ListChecks,
  ChevronRight,
  Search,
} from 'lucide-react'

const CATEGORY_ICONS: Record<TicketTemplateCategory, React.ReactNode> = {
  bug: <Bug className="h-4 w-4" />,
  feature: <Lightbulb className="h-4 w-4" />,
  enhancement: <Wrench className="h-4 w-4" />,
  chore: <ListChecks className="h-4 w-4" />,
}

const CATEGORY_COLORS: Record<TicketTemplateCategory, string> = {
  bug: 'text-red-500',
  feature: 'text-blue-500',
  enhancement: 'text-green-500',
  chore: 'text-gray-500',
}

const LEVEL_LABELS: Record<TicketLevel, string> = {
  feature: 'Feature',
  epic: 'Epic',
  story: 'Story',
  task: 'Task',
  subtask: 'Subtask',
  subatomic: 'Subatomic',
}

interface TicketTemplateSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTemplate: (template: TicketTemplate, appliedValues: ReturnType<typeof applyTemplate>) => void
  filterLevel?: TicketLevel
  filterCategory?: TicketTemplateCategory
}

export function TicketTemplateSelector({
  open,
  onOpenChange,
  onSelectTemplate,
  filterLevel,
  filterCategory,
}: TicketTemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<TicketTemplate | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | TicketTemplateCategory>('all')

  const templates = useMemo(() => {
    let result = getAllTemplates()

    if (filterLevel) {
      result = getTemplatesByLevel(filterLevel)
    }

    if (filterCategory) {
      result = getTemplatesByCategory(filterCategory)
    }

    if (activeTab !== 'all') {
      result = result.filter(t => t.category === activeTab)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      )
    }

    return result
  }, [filterLevel, filterCategory, activeTab, searchQuery])

  const handleSelectTemplate = useCallback((template: TicketTemplate) => {
    setSelectedTemplate(template)
  }, [])

  const handleUseTemplate = useCallback(() => {
    if (!selectedTemplate) return

    const appliedValues = applyTemplate(selectedTemplate.id)
    if (appliedValues) {
      onSelectTemplate(selectedTemplate, appliedValues)
      onOpenChange(false)
      setSelectedTemplate(null)
      setSearchQuery('')
    }
  }, [selectedTemplate, onSelectTemplate, onOpenChange])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setSelectedTemplate(null)
    setSearchQuery('')
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Ticket Template</DialogTitle>
          <DialogDescription>
            Choose a template to pre-fill your ticket with relevant fields and structure.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {!filterCategory && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="bug" className="gap-1">
                  <Bug className="h-3 w-3" /> Bug
                </TabsTrigger>
                <TabsTrigger value="feature" className="gap-1">
                  <Lightbulb className="h-3 w-3" /> Feature
                </TabsTrigger>
                <TabsTrigger value="enhancement" className="gap-1">
                  <Wrench className="h-3 w-3" /> Enhancement
                </TabsTrigger>
                <TabsTrigger value="chore" className="gap-1">
                  <ListChecks className="h-3 w-3" /> Chore
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="flex-1 overflow-hidden grid grid-cols-2 gap-4">
            <div className="overflow-y-auto border rounded-lg p-2 space-y-1">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No templates found
                </div>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`w-full text-left p-3 rounded-md transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'bg-primary/10 border border-primary'
                        : 'hover:bg-muted border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={CATEGORY_COLORS[template.category]}>
                        {CATEGORY_ICONS[template.category]}
                      </span>
                      <span className="font-medium">{template.name}</span>
                      {template.isDefault && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          Built-in
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span className="bg-muted px-1.5 py-0.5 rounded">
                        {LEVEL_LABELS[template.level]}
                      </span>
                      <span>{template.requiredFields.length} required fields</span>
                      {template.customFields.length > 0 && (
                        <span>{template.customFields.length} custom fields</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="overflow-y-auto border rounded-lg p-4">
              {selectedTemplate ? (
                <TemplatePreview template={selectedTemplate} />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Select a template to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleUseTemplate} disabled={!selectedTemplate}>
            Use Template
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface TemplatePreviewProps {
  template: TicketTemplate
}

function TemplatePreview({ template }: TemplatePreviewProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={CATEGORY_COLORS[template.category]}>
            {CATEGORY_ICONS[template.category]}
          </span>
          <h3 className="font-semibold text-lg">{template.name}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{template.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Level:</span>{' '}
          <span className="font-medium">{LEVEL_LABELS[template.level]}</span>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Category:</span>{' '}
          <span className="font-medium capitalize">{template.category}</span>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Complexity:</span>{' '}
          <span className="font-medium">{template.defaultFields.complexity || 'M'}</span>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground">Role:</span>{' '}
          <span className="font-medium capitalize">{template.defaultFields.assignedRole || 'coder'}</span>
        </div>
      </div>

      {template.requiredFields.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Required Fields
          </h4>
          <div className="flex flex-wrap gap-1">
            {template.requiredFields.map((field) => (
              <span
                key={field}
                className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 rounded"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {template.customFields.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2">Custom Fields</h4>
          <div className="space-y-2">
            {template.customFields.map((field) => (
              <CustomFieldPreview key={field.name} field={field} />
            ))}
          </div>
        </div>
      )}

      {template.defaultFields.acceptanceCriteria && template.defaultFields.acceptanceCriteria.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2">Default Acceptance Criteria</h4>
          <ul className="text-sm space-y-1">
            {template.defaultFields.acceptanceCriteria.map((criteria, i) => (
              <li key={i} className="flex items-start gap-2 text-muted-foreground">
                <span className="text-green-500 mt-0.5">•</span>
                {criteria}
              </li>
            ))}
          </ul>
        </div>
      )}

      {template.defaultFields.description && (
        <div>
          <h4 className="font-medium text-sm mb-2">Description Template</h4>
          <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {template.defaultFields.description}
          </pre>
        </div>
      )}
    </div>
  )
}

interface CustomFieldPreviewProps {
  field: CustomField
}

function CustomFieldPreview({ field }: CustomFieldPreviewProps) {
  const typeLabel = {
    text: 'Text',
    textarea: 'Text Area',
    select: 'Dropdown',
    multiselect: 'Multi-select',
    number: 'Number',
    date: 'Date',
    checkbox: 'Checkbox',
    url: 'URL',
  }[field.type]

  return (
    <div className="text-sm bg-muted/30 rounded p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{field.label || field.name}</span>
        <span className="text-xs text-muted-foreground">
          {typeLabel}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </span>
      </div>
      {field.options && field.options.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {field.options.slice(0, 5).map((opt) => (
            <span key={opt} className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {opt}
            </span>
          ))}
          {field.options.length > 5 && (
            <span className="text-xs text-muted-foreground">
              +{field.options.length - 5} more
            </span>
          )}
        </div>
      )}
      {field.defaultValue !== undefined && (
        <div className="mt-1 text-xs text-muted-foreground">
          Default: {String(field.defaultValue)}
        </div>
      )}
    </div>
  )
}

interface TemplateButtonProps {
  onClick: () => void
  className?: string
}

export function TemplateButton({ onClick, className }: TemplateButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={className}
    >
      <FileText className="h-4 w-4 mr-2" />
      Use Template
    </Button>
  )
}
