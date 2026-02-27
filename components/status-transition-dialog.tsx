'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import type { Ticket, TicketStatus, UserRole } from '@/lib/types'

interface TransitionRule {
  id: string
  name: string
  fromStatus: TicketStatus
  toStatus: TicketStatus
  requiredApproval: boolean
  requiredFields: (keyof Ticket)[]
}

interface TransitionValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  missingFields: (keyof Ticket)[]
  blockedByStatuses: TicketStatus[]
}

interface AvailableTransition {
  rule: TransitionRule
  validation: TransitionValidation
}

interface StatusTransitionDialogProps {
  ticket: Ticket
  isOpen: boolean
  onClose: () => void
  onTransition: (toStatus: TicketStatus, comment?: string) => Promise<void>
  availableTransitions: AvailableTransition[]
  userRole: UserRole
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  backlog: 'bg-gray-500',
  in_progress: 'bg-blue-500',
  review: 'bg-yellow-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  done: 'bg-emerald-600',
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  review: 'Review',
  approved: 'Approved',
  rejected: 'Rejected',
  done: 'Done',
}

export function StatusTransitionDialog({
  ticket,
  isOpen,
  onClose,
  onTransition,
  availableTransitions,
  userRole,
}: StatusTransitionDialogProps) {
  const [selectedTransition, setSelectedTransition] = useState<AvailableTransition | null>(null)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())

  const validTransitions = useMemo(
    () => availableTransitions.filter((t) => t.validation.valid),
    [availableTransitions]
  )

  const blockedTransitions = useMemo(
    () => availableTransitions.filter((t) => !t.validation.valid),
    [availableTransitions]
  )

  const toggleErrorExpansion = useCallback((ruleId: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) {
        next.delete(ruleId)
      } else {
        next.add(ruleId)
      }
      return next
    })
  }, [])

  const handleTransition = useCallback(async () => {
    if (!selectedTransition) return

    setIsSubmitting(true)
    try {
      await onTransition(selectedTransition.rule.toStatus, comment || undefined)
      onClose()
    } catch (error) {
      console.error('Transition failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedTransition, comment, onTransition, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transition-dialog-title"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <div>
              <h2
                id="transition-dialog-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                Change Status
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {ticket.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Current Status */}
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">Current status:</span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-white ${STATUS_COLORS[ticket.status]}`}
              >
                {STATUS_LABELS[ticket.status]}
              </span>
            </div>
          </div>

          {/* Available Transitions */}
          <div className="max-h-[400px] overflow-y-auto px-6 py-4">
            {validTransitions.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Available Transitions
                </h3>
                <div className="space-y-2">
                  {validTransitions.map((transition) => (
                    <button
                      key={transition.rule.id}
                      onClick={() => setSelectedTransition(transition)}
                      className={`flex w-full items-center justify-between rounded-lg border-2 p-4 transition-colors ${
                        selectedTransition?.rule.id === transition.rule.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <div className="text-left">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {transition.rule.name}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[transition.rule.fromStatus]}`}
                            />
                            <span>{STATUS_LABELS[transition.rule.fromStatus]}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[transition.rule.toStatus]}`}
                            />
                            <span>{STATUS_LABELS[transition.rule.toStatus]}</span>
                          </div>
                        </div>
                      </div>
                      {transition.rule.requiredApproval ? (
                        <Lock className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Unlock className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {blockedTransitions.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Blocked Transitions
                </h3>
                <div className="space-y-2">
                  {blockedTransitions.map((transition) => (
                    <div
                      key={transition.rule.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
                    >
                      <button
                        onClick={() => toggleErrorExpansion(transition.rule.id)}
                        className="flex w-full items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <AlertCircle className="h-5 w-5 text-red-500" />
                          <div className="text-left">
                            <p className="font-medium text-gray-600 dark:text-gray-400">
                              {transition.rule.name}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-sm text-gray-400">
                              <span>{STATUS_LABELS[transition.rule.fromStatus]}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span>{STATUS_LABELS[transition.rule.toStatus]}</span>
                            </div>
                          </div>
                        </div>
                        {expandedErrors.has(transition.rule.id) ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </button>

                      <AnimatePresence>
                        {expandedErrors.has(transition.rule.id) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                              {transition.validation.errors.map((error, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"
                                >
                                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>{error}</span>
                                </div>
                              ))}
                              {transition.validation.missingFields.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>
                                    Missing required fields:{' '}
                                    {transition.validation.missingFields.join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableTransitions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="mb-3 h-12 w-12 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">
                  No transitions available from the current status.
                </p>
              </div>
            )}
          </div>

          {/* Comment Input */}
          {selectedTransition && (
            <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <label
                htmlFor="transition-comment"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Comment (optional)
              </label>
              <textarea
                id="transition-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment about this status change..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                rows={3}
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            <button
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleTransition}
              disabled={!selectedTransition || isSubmitting}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {selectedTransition
                ? `Move to ${STATUS_LABELS[selectedTransition.rule.toStatus]}`
                : 'Select a transition'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Compact Status Selector ────────────────────────────────────── */

interface StatusSelectorProps {
  ticket: Ticket
  availableTransitions: AvailableTransition[]
  onTransition: (toStatus: TicketStatus) => void
  disabled?: boolean
}

export function StatusSelector({
  ticket,
  availableTransitions,
  onTransition,
  disabled = false,
}: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  const validTransitions = availableTransitions.filter((t) => t.validation.valid)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || validTransitions.length === 0}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white transition-colors ${STATUS_COLORS[ticket.status]} ${
          disabled || validTransitions.length === 0
            ? 'cursor-not-allowed opacity-70'
            : 'hover:opacity-90'
        }`}
      >
        {STATUS_LABELS[ticket.status]}
        {validTransitions.length > 0 && <ChevronDown className="h-3 w-3" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              {validTransitions.map((transition) => (
                <button
                  key={transition.rule.id}
                  onClick={() => {
                    onTransition(transition.rule.toStatus)
                    setIsOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${STATUS_COLORS[transition.rule.toStatus]}`}
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    {transition.rule.name}
                  </span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
