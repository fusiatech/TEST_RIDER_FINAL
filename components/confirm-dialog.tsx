'use client'

import { useState, useEffect } from 'react'
import { useSwarmStore } from '@/lib/store'
import { wsClient } from '@/lib/ws-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShieldAlert, Check, X } from 'lucide-react'

interface PendingConfirmation {
  requestId: string
  filePath: string
  diff: string
}

export function ConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const initWebSocket = useSwarmStore((s) => s.initWebSocket)

  useEffect(() => {
    initWebSocket()
    const unsubscribe = wsClient.addMessageListener((msg) => {
      if (msg.type === 'confirm-write') {
        setPending({
          requestId: msg.requestId,
          filePath: msg.filespath,
          diff: msg.diff,
        })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [initWebSocket])

  const handleApprove = () => {
    if (!pending) return
    wsClient.send({
      type: 'confirm-response',
      requestId: pending.requestId,
      approved: true,
    })
    setPending(null)
  }

  const handleReject = () => {
    if (!pending) return
    wsClient.send({
      type: 'confirm-response',
      requestId: pending.requestId,
      approved: false,
    })
    setPending(null)
  }

  return (
    <Dialog open={pending !== null} onOpenChange={() => setPending(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-yellow-400" />
            Confirm File Write
          </DialogTitle>
        </DialogHeader>

        {pending && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">File:</span>
              <Badge variant="outline" className="font-mono text-xs">
                {pending.filePath}
              </Badge>
            </div>

            <ScrollArea className="max-h-64">
              <pre className="rounded-lg bg-[#0d0d0d] p-4 font-mono text-xs leading-relaxed text-muted overflow-x-auto">
                {pending.diff || 'No diff available'}
              </pre>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleReject} className="gap-1.5">
                <X className="h-4 w-4" />
                Reject
              </Button>
              <Button onClick={handleApprove} className="gap-1.5">
                <Check className="h-4 w-4" />
                Approve
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
