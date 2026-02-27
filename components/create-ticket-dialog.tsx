'use client'

import { useState, useCallback } from 'react'
import type { TicketComplexity, AgentRole, Epic, Ticket } from '@/lib/types'
import { ROLE_LABELS } from '@/lib/types'
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

interface CreateTicketDialogProps {
  projectId: string
  epics: Epic[]
  allTickets: Ticket[]
  onTicketCreated: () => void
}

export function CreateTicketDialog({
  projectId,
  epics,
  allTickets,
  onTicketCreated,
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

  const [errors, setErrors] = useState<{ title?: string }>({})

  const resetForm = useCallback(() => {
    setTitle('')
    setDescription('')
    setComplexity('M')
    setAssignedRole('coder')
    setEpicId('')
    setBlockedBy([])
    setBlocks([])
    setErrors({})
  }, [])

  const validateForm = useCallback((): boolean => {
    const newErrors: { title?: string } = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    } else if (title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [title])

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
