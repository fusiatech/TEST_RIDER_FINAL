'use client'

import { useState, useCallback, useMemo } from 'react'
import type { TicketComplexity, AgentRole, Epic, Ticket, TicketLevel } from '@/lib/types'
import { ROLE_LABELS, TICKET_HIERARCHY, validateTicketHierarchy } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { DependencySelector } from '@/components/ticket-dependencies'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'

const COMPLEXITY_OPTIONS: { value: TicketComplexity; label: string }[] = [
  { value: 'S', label: 'Small (S)' },
  { value: 'M', label: 'Medium (M)' },
  { value: 'L', label: 'Large (L)' },
  { value: 'XL', label: 'Extra Large (XL)' },
]

const ROLE_OPTIONS: { value: AgentRole; label: string }[] = [
  { value: 'researcher', label: ROLE_LABELS.researcher },
  { value: 'planner', label: ROLE_LABELS.planner },
  { value: 'coder', label: ROLE_LABELS.coder },
  { value: 'validator', label: ROLE_LABELS.validator },
  { value: 'security', label: ROLE_LABELS.security },
  { value: 'synthesizer', label: ROLE_LABELS.synthesizer },
]

const LEVEL_OPTIONS: { value: TicketLevel; label: string; color: string }[] = [
  { value: 'feature', label: 'Feature', color: '#a855f7' },
  { value: 'epic', label: 'Epic', color: '#3b82f6' },
  { value: 'story', label: 'Story', color: '#22c55e' },
  { value: 'task', label: 'Task', color: '#eab308' },
  { value: 'subtask', label: 'Subtask', color: '#f97316' },
  { value: 'subatomic', label: 'Subatomic', color: '#ef4444' },
]

interface CreateTicketDialogProps {
  projectId: string
  epics: Epic[]
  allTickets: Ticket[]
  onTicketCreated: () => void
  parentId?: string
}

export function CreateTicketDialog({
  projectId,
  epics,
  allTickets,
  onTicketCreated,
  parentId,
}: CreateTicketDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [complexity, setComplexity] = useState<TicketComplexity>('M')
  const [assignedRole, setAssignedRole] = useState<AgentRole>('coder')
  const [epicId, setEpicId] = useState<string>('')
  const [blockedBy, setBlockedBy] = useState<string[]>([])
  const [blocks, setBlocks] = useState<string[]>([])
  const [level, setLevel] = useState<TicketLevel | ''>('')

  const [errors, setErrors] = useState<{ title?: string; level?: string }>({})

  const parentTicket = useMemo(() => {
    if (!parentId) return null
    return allTickets.find(t => t.id === parentId) || null
  }, [parentId, allTickets])

  const validLevelOptions = useMemo(() => {
    if (!parentTicket?.level) return LEVEL_OPTIONS
    const allowedChildren = TICKET_HIERARCHY[parentTicket.level]
    return LEVEL_OPTIONS.filter(opt => allowedChildren.includes(opt.value))
  }, [parentTicket])

  const resetForm = useCallback(() => {
    setTitle('')
    setDescription('')
    setComplexity('M')
    setAssignedRole('coder')
    setEpicId('')
    setBlockedBy([])
    setBlocks([])
    setLevel('')
    setErrors({})
  }, [])

  const validateForm = useCallback((): boolean => {
    const newErrors: { title?: string; level?: string } = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    } else if (title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters'
    }

    if (parentId && parentTicket?.level && level) {
      const validation = validateTicketHierarchy(parentTicket.level, level as TicketLevel)
      if (!validation.valid) {
        newErrors.level = validation.error
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [title, parentId, parentTicket, level])

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return

    setIsSubmitting(true)

    try {
      const now = Date.now()
      const ticketData = {
        id: `ticket-${now}-${Math.random().toString(36).slice(2, 9)}`,
        projectId,
        title: title.trim(),
        description: description.trim(),
        acceptanceCriteria: [],
        complexity,
        status: 'backlog' as const,
        assignedRole,
        epicId: epicId || undefined,
        dependencies: [],
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
        blocks: blocks.length > 0 ? blocks : undefined,
        level: level || undefined,
        parentId: parentId || undefined,
        createdAt: now,
        updatedAt: now,
      }

      const res = await fetch(`/api/projects/${projectId}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create ticket')
      }

      toast.success('Ticket created successfully')
      resetForm()
      setOpen(false)
      onTicketCreated()
    } catch (err) {
      toast.error('Failed to create ticket', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    validateForm,
    projectId,
    title,
    description,
    complexity,
    assignedRole,
    epicId,
    blockedBy,
    blocks,
    level,
    parentId,
    resetForm,
    onTicketCreated,
  ])

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen)
      if (!newOpen) {
        resetForm()
      }
    },
    [resetForm]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="default"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
        data-testid="create-ticket-button"
      >
        <Plus className="h-4 w-4" />
        Create Ticket
      </Button>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Ticket</DialogTitle>
          <DialogDescription>
            Add a new ticket to the project backlog.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (errors.title) setErrors({})
              }}
              placeholder="Enter ticket title"
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && (
              <p className="text-xs text-red-500">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium text-foreground">
              Description
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter ticket description (optional)"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Complexity
              </label>
              <Select value={complexity} onValueChange={(v) => setComplexity(v as TicketComplexity)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select complexity" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Assigned Role
              </label>
              <Select value={assignedRole} onValueChange={(v) => setAssignedRole(v as AgentRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Level {parentId && <span className="text-muted text-xs">(Creating child of {parentTicket?.level || 'ticket'})</span>}
            </label>
            <Select
              value={level}
              onValueChange={(v) => {
                setLevel(v as TicketLevel)
                if (errors.level) setErrors((prev) => ({ ...prev, level: undefined }))
              }}
            >
              <SelectTrigger className={errors.level ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select level (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No Level</SelectItem>
                {validLevelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.level && (
              <p className="text-xs text-red-500">{errors.level}</p>
            )}
            {parentId && validLevelOptions.length === 0 && (
              <p className="text-xs text-muted">
                Parent ticket level does not allow child tickets
              </p>
            )}
          </div>

          {epics.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Epic (Optional)
              </label>
              <Select value={epicId} onValueChange={setEpicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select epic (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Epic</SelectItem>
                  {epics.map((epic) => (
                    <SelectItem key={epic.id} value={epic.id}>
                      {epic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dependencies Section */}
          {allTickets.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-border">
              <DependencySelector
                tickets={allTickets}
                selectedIds={blockedBy}
                onChange={setBlockedBy}
                type="blockedBy"
              />
              <DependencySelector
                tickets={allTickets}
                selectedIds={blocks}
                onChange={setBlocks}
                type="blocks"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Ticket'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
