'use client'

import { useRef, useState, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Attachment } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
}

const ACCEPTED_TYPES = 'image/*,.txt,.md,.ts,.tsx,.js,.jsx,.json,.css,.html,.py,.rs,.go,.sh,.yaml,.yml,.toml,.xml,.sql,.csv'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const attachment: Attachment = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      }
      if (isImageType(file.type)) {
        attachment.dataUrl = reader.result as string
      }
      resolve(attachment)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function FileUpload({ attachments, onAttachmentsChange }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const newAttachments = await Promise.all(
        fileArray.map((f) => readFileAsAttachment(f))
      )
      onAttachmentsChange([...attachments, ...newAttachments])
    },
    [attachments, onAttachmentsChange]
  )

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        void handleFiles(e.target.files)
        e.target.value = ''
      }
    },
    [handleFiles]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const removeAttachment = useCallback(
    (index: number) => {
      onAttachmentsChange(attachments.filter((_, i) => i !== index))
    },
    [attachments, onAttachmentsChange]
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative',
        dragOver && 'ring-2 ring-primary/50 rounded-xl'
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        onChange={handleInputChange}
        className="hidden"
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-xl text-muted hover:text-foreground"
        onClick={() => fileInputRef.current?.click()}
        title="Attach file"
        type="button"
      >
        <Paperclip className="h-4 w-4" />
      </Button>

      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/5 border-2 border-dashed border-primary/30">
          <span className="text-xs text-primary font-medium">Drop files here</span>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 flex flex-wrap gap-2 max-w-md">
          {attachments.map((att, idx) => (
            <div
              key={`${att.name}-${idx}`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs"
            >
              {att.dataUrl && isImageType(att.type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  className="h-6 w-6 rounded object-cover"
                />
              ) : isImageType(att.type) ? (
                <ImageIcon className="h-3.5 w-3.5 text-muted" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted" />
              )}
              <span className="max-w-[100px] truncate text-foreground/80">
                {att.name}
              </span>
              <span className="text-muted">{formatFileSize(att.size)}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="ml-0.5 rounded p-0.5 hover:bg-secondary"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
