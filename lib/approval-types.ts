import { z } from 'zod'
import { UserRoleSchema } from '@/lib/types'

/* ── Approval Chain Types (shared between client and server) ─────── */

export const EscalationRuleSchema = z.object({
  triggerAfterHours: z.number().min(1),
  escalateTo: z.enum(['next_level', 'specific_user', 'admin']),
  targetUserId: z.string().optional(),
  notifyOnEscalation: z.boolean().default(true),
})
export type EscalationRule = z.infer<typeof EscalationRuleSchema>

export const NotificationSettingsSchema = z.object({
  notifyOnCreate: z.boolean().default(true),
  notifyOnApprove: z.boolean().default(true),
  notifyOnReject: z.boolean().default(true),
  notifyOnEscalate: z.boolean().default(true),
  emailEnabled: z.boolean().default(false),
  slackEnabled: z.boolean().default(false),
  slackWebhookUrl: z.string().optional(),
})
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>

export const ApprovalLevelSchema = z.object({
  order: z.number().min(1),
  name: z.string(),
  approverRoles: z.array(UserRoleSchema),
  approverUserIds: z.array(z.string()),
  requiredApprovals: z.number().min(1).default(1),
  timeoutHours: z.number().min(1).optional(),
  escalateTo: z.enum(['next_level', 'specific_user', 'admin']).optional(),
  escalateToUserId: z.string().optional(),
})
export type ApprovalLevel = z.infer<typeof ApprovalLevelSchema>

export const ApprovalChainSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  levels: z.array(ApprovalLevelSchema).min(1),
  escalationRules: z.array(EscalationRuleSchema).optional(),
  notificationSettings: NotificationSettingsSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type ApprovalChain = z.infer<typeof ApprovalChainSchema>

export const ApprovalDecisionSchema = z.enum(['approved', 'rejected'])
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

export const ApprovalEntrySchema = z.object({
  userId: z.string(),
  userEmail: z.string().optional(),
  decision: ApprovalDecisionSchema,
  comment: z.string().optional(),
  timestamp: z.number(),
  levelOrder: z.number(),
})
export type ApprovalEntry = z.infer<typeof ApprovalEntrySchema>

export const ApprovalRequestStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'escalated',
  'cancelled',
])
export type ApprovalRequestStatus = z.infer<typeof ApprovalRequestStatusSchema>

export const ResourceTypeSchema = z.enum([
  'ticket',
  'prd',
  'release',
  'project',
  'epic',
  'deployment',
])
export type ResourceType = z.infer<typeof ResourceTypeSchema>

export const EscalationHistoryEntrySchema = z.object({
  fromLevel: z.number(),
  toLevel: z.number(),
  reason: z.string(),
  timestamp: z.number(),
})
export type EscalationHistoryEntry = z.infer<typeof EscalationHistoryEntrySchema>

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  chainId: z.string(),
  resourceType: ResourceTypeSchema,
  resourceId: z.string(),
  resourceName: z.string().optional(),
  currentLevel: z.number().min(1),
  approvals: z.array(ApprovalEntrySchema),
  status: ApprovalRequestStatusSchema,
  requestedBy: z.string(),
  requestedByEmail: z.string().optional(),
  escalationHistory: z.array(EscalationHistoryEntrySchema).optional(),
  createdAt: z.number(),
  deadline: z.number().optional(),
  completedAt: z.number().optional(),
})
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>

export const ApprovalProgressSchema = z.object({
  currentLevel: z.number(),
  totalLevels: z.number(),
  currentLevelName: z.string(),
  approvalsAtCurrentLevel: z.number(),
  requiredApprovals: z.number(),
  percentComplete: z.number(),
})
export type ApprovalProgress = z.infer<typeof ApprovalProgressSchema>
