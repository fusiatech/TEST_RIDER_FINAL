import type { ChatMessage, RunLogEntry } from '@/lib/types'

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000
export const CONTEXT_WARN_PERCENT = 70
export const CONTEXT_SOFT_COMPACT_PERCENT = 85
export const CONTEXT_HARD_COMPACT_PERCENT = 95

export type ContextCompactionStatus = 'Idle' | 'Compacting' | 'Compacted'

export interface ContextTelemetry {
  usedTokens: number
  maxTokens: number
  percentUsed: number
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function estimateTokensFromText(text: string): number {
  // Fast client-side approximation: ~4 chars/token.
  const normalized = text.trim()
  if (!normalized) return 0
  return Math.max(1, Math.ceil(normalized.length / 4))
}

function estimateMessageTokens(message: ChatMessage): number {
  const attachmentsTokens =
    message.attachments?.reduce((sum, a) => sum + estimateTokensFromText(a.name), 0) ?? 0
  const logsTokens =
    message.logs?.reduce((sum, log) => sum + estimateTokensFromText(log.text), 0) ?? 0
  return estimateTokensFromText(message.content) + attachmentsTokens + logsTokens
}

export function estimateContextTelemetry(
  messages: ChatMessage[],
  runLogs: RunLogEntry[],
  maxTokens = DEFAULT_CONTEXT_WINDOW_TOKENS
): ContextTelemetry {
  const messageTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
  const logTokens = runLogs.reduce((sum, l) => sum + estimateTokensFromText(l.text), 0)
  const usedTokens = messageTokens + logTokens
  const safeMax = Math.max(1, maxTokens)
  const percentUsed = clampPercent((usedTokens / safeMax) * 100)

  return {
    usedTokens,
    maxTokens: safeMax,
    percentUsed,
  }
}

export interface CompactionResult {
  messages: ChatMessage[]
  removedCount: number
  summaryInserted: boolean
  summaryText?: string
}

function isAlreadyCompactedMarker(message: ChatMessage): boolean {
  return message.role === 'system' && message.content.startsWith('[Context Compact]')
}

function summarizeMessage(message: ChatMessage): string {
  const snippet = message.content.replace(/\s+/g, ' ').trim().slice(0, 140)
  return `- ${message.role}: ${snippet || '(empty)'}`
}

export function compactContextMessages(
  messages: ChatMessage[],
  maxTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
  preserveTailCount = 12
): CompactionResult {
  if (messages.length <= preserveTailCount + 2) {
    return { messages, removedCount: 0, summaryInserted: false }
  }

  const telemetry = estimateContextTelemetry(messages, [], maxTokens)
  if (telemetry.percentUsed < CONTEXT_SOFT_COMPACT_PERCENT) {
    return { messages, removedCount: 0, summaryInserted: false }
  }

  const tailCount = Math.min(messages.length, Math.max(8, preserveTailCount))
  const head = messages.slice(0, messages.length - tailCount)
  const tail = messages.slice(messages.length - tailCount)

  const compactable = head.filter((m) => !isAlreadyCompactedMarker(m))
  if (compactable.length < 3) {
    return { messages, removedCount: 0, summaryInserted: false }
  }

  const summaryItems = compactable.slice(0, 24).map(summarizeMessage)
  const summaryText =
    `[Context Compact] Summarized ${compactable.length} earlier messages to preserve token budget.\n` +
    summaryItems.join('\n')

  const summaryMessage: ChatMessage = {
    id: `context-compact-${Date.now()}`,
    role: 'system',
    content: summaryText,
    timestamp: Date.now(),
  }

  const nextMessages = [summaryMessage, ...tail]
  const removedCount = messages.length - nextMessages.length

  return {
    messages: nextMessages,
    removedCount,
    summaryInserted: true,
    summaryText,
  }
}
