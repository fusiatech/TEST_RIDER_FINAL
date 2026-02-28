import { z } from 'zod'

export const IntegrationProviderSchema = z.enum([
  'github',
  'figma',
  'mcp',
  'slack',
  'linear',
  'billing',
])
export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>

export const IntegrationStatusSchema = z.enum([
  'disconnected',
  'pending',
  'connected',
  'error',
])
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>

export const BillingPlanSchema = z.enum(['free', 'pro', 'team', 'enterprise'])
export type BillingPlan = z.infer<typeof BillingPlanSchema>

export const BillingStatusSchema = z.enum([
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
])
export type BillingStatus = z.infer<typeof BillingStatusSchema>

export const IntegrationConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tenantId: z.string().optional(),
  provider: IntegrationProviderSchema,
  externalId: z.string().optional(),
  status: IntegrationStatusSchema.default('disconnected'),
  displayName: z.string().optional(),
  scopes: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.string()).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastSyncedAt: z.number().optional(),
  error: z.string().optional(),
})
export type IntegrationConnection = z.infer<typeof IntegrationConnectionSchema>

export const UserProfileSchema = z.object({
  userId: z.string(),
  tenantId: z.string().optional(),
  displayName: z.string().optional(),
  providerVisibility: z.record(z.string(), z.boolean()).default({}),
  activePlan: BillingPlanSchema.default('free'),
  billingStatus: BillingStatusSchema.default('inactive'),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  entitlementVersion: z.number().min(0).default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type UserProfile = z.infer<typeof UserProfileSchema>

export const BillingCustomerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.literal('stripe'),
  providerCustomerId: z.string(),
  email: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type BillingCustomer = z.infer<typeof BillingCustomerSchema>

export const BillingSubscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.literal('stripe'),
  providerSubscriptionId: z.string(),
  providerCustomerId: z.string().optional(),
  plan: BillingPlanSchema,
  status: BillingStatusSchema,
  currentPeriodStart: z.number().optional(),
  currentPeriodEnd: z.number().optional(),
  cancelAtPeriodEnd: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type BillingSubscription = z.infer<typeof BillingSubscriptionSchema>

export const BillingEventSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  provider: z.literal('stripe'),
  eventType: z.string(),
  providerEventId: z.string(),
  payloadHash: z.string(),
  status: z.enum(['received', 'processed', 'failed']).default('received'),
  receivedAt: z.number(),
  processedAt: z.number().optional(),
  error: z.string().optional(),
})
export type BillingEvent = z.infer<typeof BillingEventSchema>

export const FeatureEntitlementSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  limit: z.number().optional(),
})
export type FeatureEntitlement = z.infer<typeof FeatureEntitlementSchema>

export const WebhookDeliveryRecordSchema = z.object({
  id: z.string(),
  provider: z.enum(['stripe', 'github', 'slack', 'linear']),
  eventId: z.string().optional(),
  signatureValid: z.boolean(),
  processed: z.boolean(),
  receivedAt: z.number(),
  error: z.string().optional(),
})
export type WebhookDeliveryRecord = z.infer<typeof WebhookDeliveryRecordSchema>

export const ProviderCatalogEntrySchema = z.object({
  provider: z.string(),
  label: z.string(),
  supportsApi: z.boolean(),
  isEnabledByUser: z.boolean(),
  isConfiguredByUser: z.boolean(),
  runtimeAvailable: z.boolean(),
})
export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntrySchema>

export const ProviderModelEntrySchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  source: z.enum(['api', 'fallback']),
})
export type ProviderModelEntry = z.infer<typeof ProviderModelEntrySchema>

export const MCPServerPolicySchema = z.object({
  allowedTransports: z.array(z.enum(['stdio', 'sse', 'http'])).default(['stdio']),
  commandAllowlist: z.array(z.string()).default([]),
  hostAllowlist: z.array(z.string()).default([]),
  toolAllowlist: z.array(z.string()).default([]),
  requireApproval: z.boolean().default(false),
  timeoutMs: z.number().min(1000).max(300000).default(30000),
})
export type MCPServerPolicy = z.infer<typeof MCPServerPolicySchema>

export const ManagedMCPServerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tenantId: z.string().optional(),
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
  policy: MCPServerPolicySchema.default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type ManagedMCPServer = z.infer<typeof ManagedMCPServerSchema>

export const ExternalIssueLinkSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.literal('linear'),
  projectId: z.string(),
  ticketId: z.string(),
  externalIssueId: z.string(),
  externalIssueKey: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type ExternalIssueLink = z.infer<typeof ExternalIssueLinkSchema>

export const IntegrationHealthStatusSchema = z.object({
  provider: IntegrationProviderSchema,
  status: IntegrationStatusSchema,
  message: z.string().optional(),
  checkedAt: z.number(),
})
export type IntegrationHealthStatus = z.infer<typeof IntegrationHealthStatusSchema>
