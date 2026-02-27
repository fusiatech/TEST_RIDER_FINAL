'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { TicketAttachment } from '@/lib/types'
import { 
  ALLOWED_ATTACHMENT_TYPES, 
  MAX_ATTACHMENT_SIZE, 
  MAX_ATTACHMENTS_PER_TICKET 
} from '@/lib/types'
import {
  Upload,
  File,
  FileText,
  Image,
  Trash2,
  Download,
  Loader2,
  X,
  Paperclip,
  Eye,
} from 'lucide-react'

interface AttachmentUploadProps {
  projectId: string
  ticketId: string
  attachments: TicketAttachment[]
  onAttachmentAdded: (attachment: TicketAttachment) => void
  onAttachmentRemoved: (attachmentId: string) => void
  disabled?: boolean
}

const FILE_ICONS: Record<string, typeof File> = {
  'image/png': Image,
  'image/jpeg': Image,
  'image/gif': Image,
  'image/webp': Image,
  'application/pdf': FileText,
  'text/plain': FileText,
  'text/markdown': FileText,
  'application/json': FileText,
  'text/csv': FileText,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentUpload({
  projectId,
  ticketId,
  attachments,
  onAttachmentAdded,
  onAttachmentRemoved,
  disabled = false,
}: AttachmentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canUpload = attachments.length < MAX_ATTACHMENTS_PER_TICKET

  const uploadFile = useCallback(async (file: File) => {
    if (!canUpload) {
      toast.error(`Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments allowed`)
      return
    }

    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as typeof ALLOWED_ATTACHMENT_TYPES[number])) {
      toast.error(`Invalid file type: ${file.type}`)
      return
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast.error(`File too large. Maximum size: ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB`)
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(
        `/api/projects/${projectId}/tickets/${ticketId}/attachments`,
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to upload file')
      }

      const data = await res.json()
      onAttachmentAdded(data.attachment)
      toast.success(`Uploaded ${file.name}`)
    } catch (err) {
      toast.error('Failed to upload file', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsUploading(false)
    }
  }, [projectId, ticketId, canUpload, onAttachmentAdded])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      if (disabled || !canUpload) return

      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        await uploadFile(file)
      }
    },
    [disabled, canUpload, uploadFile]
  )

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      for (const file of files) {
        await uploadFile(file)
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [uploadFile]
  )

  const handleDelete = useCallback(
    async (attachmentId: string) => {
      setDeletingId(attachmentId)
      try {
        const res = await fetch(
          `/api/projects/${projectId}/tickets/${ticketId}/attachments/${attachmentId}`,
          { method: 'DELETE' }
        )

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Failed to delete attachment')
        }

        onAttachmentRemoved(attachmentId)
        toast.success('Attachment deleted')
      } catch (err) {
        toast.error('Failed to delete attachment', {
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        setDeletingId(null)
      }
    },
    [projectId, ticketId, onAttachmentRemoved]
  )

  const handleDownload = useCallback((attachment: TicketAttachment) => {
    const link = document.createElement('a')
    link.href = attachment.url
    link.download = attachment.originalName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const handlePreview = useCallback((attachment: TicketAttachment) => {
    window.open(attachment.url, '_blank')
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 text-muted" />
          <span className="text-xs font-medium text-muted">
            Attachments ({attachments.length}/{MAX_ATTACHMENTS_PER_TICKET})
          </span>
        </div>
      </div>

      {/* Drop Zone */}
      {canUpload && !disabled && (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50',
            isUploading && 'opacity-50 pointer-events-none'
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="h-6 w-6 mx-auto text-primary animate-spin mb-2" />
          ) : (
            <Upload className="h-6 w-6 mx-auto text-muted mb-2" />
          )}
          <p className="text-xs text-muted">
            {isUploading ? (
              'Uploading...'
            ) : isDragging ? (
              'Drop files here'
            ) : (
              <>
                Drag files here or{' '}
                <span className="text-primary">browse</span>
              </>
            )}
          </p>
          <p className="text-[10px] text-muted mt-1">
            Max {MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB per file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={ALLOWED_ATTACHMENT_TYPES.join(',')}
            onChange={handleFileSelect}
            disabled={disabled || isUploading}
          />
        </div>
      )}

      {/* Attachment List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const FileIcon = FILE_ICONS[attachment.mimeType] || File
            const isDeleting = deletingId === attachment.id
            const isImage = attachment.mimeType.startsWith('image/')

            return (
              <div
                key={attachment.id}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-md border border-border bg-secondary/30',
                  isDeleting && 'opacity-50'
                )}
              >
                {isImage ? (
                  <div className="h-10 w-10 rounded overflow-hidden bg-secondary shrink-0">
                    <img
                      src={attachment.url}
                      alt={attachment.originalName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center shrink-0">
                    <FileIcon className="h-5 w-5 text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {attachment.originalName}
                  </p>
                  <p className="text-[10px] text-muted">
                    {formatFileSize(attachment.size)} •{' '}
                    {new Date(attachment.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {isImage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handlePreview(attachment)}
                      disabled={isDeleting}
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDownload(attachment)}
                    disabled={isDeleting}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-400"
                      onClick={() => handleDelete(attachment.id)}
                      disabled={isDeleting}
                      title="Delete"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {attachments.length === 0 && !canUpload && (
        <p className="text-xs text-muted text-center py-2">
          Maximum attachments reached
        </p>
      )}

      {attachments.length === 0 && canUpload && disabled && (
        <p className="text-xs text-muted text-center py-2">
          No attachments
        </p>
      )}
    </div>
  )
}
