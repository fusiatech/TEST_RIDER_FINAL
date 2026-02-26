'use client'

import { useState } from 'react'
import { useSwarmStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const createProject = useSwarmStore((s) => s.createProject)

  const handleCreate = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    createProject(trimmedName, description.trim())
    toast.success('Project created', { description: `"${trimmedName}" is ready.` })
    setName('')
    setDescription('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Give your project a name and description to get started.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label htmlFor="project-name" className="text-sm font-medium text-foreground">
              Project Name
            </label>
            <Input
              id="project-name"
              placeholder="My awesome project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="project-desc" className="text-sm font-medium text-foreground">
              Description
            </label>
            <textarea
              id="project-desc"
              placeholder="Describe what this project is about..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={!name.trim()}
          >
            Create Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
