import crypto from 'node:crypto'
import { decrypt, encrypt, getEncryptionSecret, isEncrypted } from '@/lib/encryption'
import type {
  BillingCustomer,
  BillingEvent,
  BillingSubscription,
  ExternalIssueLink,
  FeatureEntitlement,
  IntegrationConnection,
  IntegrationProvider,
  IntegrationStatus,
  ManagedMCPServer,
  UserProfile,
  WebhookDeliveryRecord,
} from '@/lib/contracts/backend'
import {
  BillingCustomerSchema,
  BillingEventSchema,
  BillingSubscriptionSchema,
  ExternalIssueLinkSchema,
  FeatureEntitlementSchema,
  IntegrationConnectionSchema,
  ManagedMCPServerSchema,
  UserProfileSchema,
  WebhookDeliveryRecordSchema,
} from '@/lib/contracts/backend'
import { getDb } from '@/server/storage'

interface OAuthStateEntry {
  userId: string
  provider: IntegrationProvider
  createdAt: number
  metadata?: Record<string, unknown>
}

const WEBHOOK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

interface ExtendedDbSchema {
  userProfiles?: Record<string, UserProfile>
  integrationConnections?: IntegrationConnection[]
  billingCustomers?: BillingCustomer[]
  billingSubscriptions?: BillingSubscription[]
  billingEvents?: BillingEvent[]
  userEntitlements?: Record<string, FeatureEntitlement[]>
  webhookDeliveries?: WebhookDeliveryRecord[]
  managedMcpServers?: ManagedMCPServer[]
  externalIssueLinks?: ExternalIssueLink[]
  oauthStates?: Record<string, OAuthStateEntry>
}

function ensureExtendedSchema(data: unknown): ExtendedDbSchema {
  const target = data as ExtendedDbSchema
  if (!target.userProfiles) target.userProfiles = {}
  if (!target.integrationConnections) target.integrationConnections = []
  if (!target.billingCustomers) target.billingCustomers = []
  if (!target.billingSubscriptions) target.billingSubscriptions = []
  if (!target.billingEvents) target.billingEvents = []
  if (!target.userEntitlements) target.userEntitlements = {}
  if (!target.webhookDeliveries) target.webhookDeliveries = []
  if (!target.managedMcpServers) target.managedMcpServers = []
  if (!target.externalIssueLinks) target.externalIssueLinks = []
  if (!target.oauthStates) target.oauthStates = {}
  return target
}

function encryptMap(values: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!values) return undefined
  const secret = getEncryptionSecret()
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue
    out[key] = isEncrypted(value) ? value : encrypt(value, secret)
  }
  return out
}

function decryptMap(values: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!values) return undefined
  const secret = getEncryptionSecret()
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue
    if (isEncrypted(value)) {
      try {
        out[key] = decrypt(value, secret)
      } catch {
        // Preserve encrypted value to avoid data loss in case of key mismatch.
        out[key] = value
      }
    } else {
      out[key] = value
    }
  }
  return out
}

function now(): number {
  return Date.now()
}

function redactConnectionSecrets(connection: IntegrationConnection): IntegrationConnection {
  if (!connection.credentials) return connection
  const redacted = Object.fromEntries(
    Object.keys(connection.credentials).map((key) => [key, '********'])
  )
  return { ...connection, credentials: redacted }
}

function deserializeConnection(connection: IntegrationConnection): IntegrationConnection {
  return {
    ...connection,
    credentials: decryptMap(connection.credentials),
  }
}

function serializeConnection(connection: IntegrationConnection): IntegrationConnection {
  return {
    ...connection,
    credentials: encryptMap(connection.credentials),
  }
}

export async function getOrCreateUserProfile(userId: string, defaults?: Partial<UserProfile>): Promise<UserProfile> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const existing = ext.userProfiles?.[userId]
  if (existing) {
    return UserProfileSchema.parse(existing)
  }

  const timestamp = now()
  const profile = UserProfileSchema.parse({
    userId,
    activePlan: 'free',
    billingStatus: 'inactive',
    providerVisibility: {},
    entitlementVersion: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...defaults,
  })

  ext.userProfiles![userId] = profile
  await db.write()
  return profile
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const profile = ext.userProfiles?.[userId]
  if (!profile) return null
  return UserProfileSchema.parse(profile)
}

export async function saveUserProfile(profile: UserProfile): Promise<UserProfile> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const parsed = UserProfileSchema.parse({
    ...profile,
    updatedAt: now(),
  })
  ext.userProfiles![parsed.userId] = parsed
  await db.write()
  return parsed
}

export async function patchUserProfile(userId: string, patch: Partial<UserProfile>): Promise<UserProfile> {
  const existing = await getOrCreateUserProfile(userId)
  const next = UserProfileSchema.parse({
    ...existing,
    ...patch,
    userId,
    updatedAt: now(),
  })
  return saveUserProfile(next)
}

export async function listIntegrationConnections(userId: string): Promise<IntegrationConnection[]> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  return ext.integrationConnections!
    .filter((conn) => conn.userId === userId)
    .map((conn) => IntegrationConnectionSchema.parse(deserializeConnection(conn)))
}

export async function getIntegrationConnection(
  userId: string,
  provider: IntegrationProvider,
  externalId?: string,
): Promise<IntegrationConnection | null> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const found = ext.integrationConnections!.find(
    (conn) =>
      conn.userId === userId &&
      conn.provider === provider &&
      (externalId ? conn.externalId === externalId : true)
  )
  if (!found) return null
  return IntegrationConnectionSchema.parse(deserializeConnection(found))
}

export async function upsertIntegrationConnection(
  connection: Omit<IntegrationConnection, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string
    createdAt?: number
    updatedAt?: number
  }
): Promise<IntegrationConnection> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const timestamp = now()

  const existingIdx = ext.integrationConnections!.findIndex(
    (conn) =>
      conn.userId === connection.userId &&
      conn.provider === connection.provider &&
      (connection.externalId ? conn.externalId === connection.externalId : true)
  )

  const parsed = IntegrationConnectionSchema.parse({
    id: connection.id ?? crypto.randomUUID(),
    createdAt:
      existingIdx >= 0
        ? ext.integrationConnections![existingIdx].createdAt
        : (connection.createdAt ?? timestamp),
    updatedAt: connection.updatedAt ?? timestamp,
    ...connection,
  })

  const stored = serializeConnection(parsed)

  if (existingIdx >= 0) {
    ext.integrationConnections![existingIdx] = stored
  } else {
    ext.integrationConnections!.push(stored)
  }

  await db.write()
  return parsed
}

export async function updateIntegrationStatus(
  userId: string,
  provider: IntegrationProvider,
  status: IntegrationStatus,
  options?: {
    error?: string
    externalId?: string
    metadata?: Record<string, unknown>
    scopes?: string[]
    displayName?: string
    credentials?: Record<string, string>
  }
): Promise<IntegrationConnection> {
  const existing = await getIntegrationConnection(userId, provider, options?.externalId)
  const timestamp = now()

  const next: Omit<IntegrationConnection, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string
    createdAt?: number
    updatedAt?: number
  } = {
    id: existing?.id,
    userId,
    provider,
    externalId: options?.externalId ?? existing?.externalId,
    status,
    displayName: options?.displayName ?? existing?.displayName,
    scopes: options?.scopes ?? existing?.scopes ?? [],
    metadata: {
      ...(existing?.metadata ?? {}),
      ...(options?.metadata ?? {}),
    },
    credentials: options?.credentials ?? existing?.credentials,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastSyncedAt: status === 'connected' ? timestamp : existing?.lastSyncedAt,
    error: options?.error,
  }

  return upsertIntegrationConnection(next)
}

export async function deleteIntegrationConnection(
  userId: string,
  provider: IntegrationProvider,
  externalId?: string,
): Promise<boolean> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const before = ext.integrationConnections!.length
  ext.integrationConnections = ext.integrationConnections!.filter((conn) => {
    if (conn.userId !== userId || conn.provider !== provider) return true
    if (externalId && conn.externalId !== externalId) return true
    return false
  })
  const changed = ext.integrationConnections.length !== before
  if (changed) {
    await db.write()
  }
  return changed
}

export async function listIntegrationConnectionsRedacted(userId: string): Promise<IntegrationConnection[]> {
  const connections = await listIntegrationConnections(userId)
  return connections.map(redactConnectionSecrets)
}

export async function upsertBillingCustomer(customer: BillingCustomer): Promise<BillingCustomer> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const parsed = BillingCustomerSchema.parse({ ...customer, updatedAt: now() })
  const idx = ext.billingCustomers!.findIndex((c) => c.userId === parsed.userId)
  if (idx >= 0) {
    ext.billingCustomers![idx] = parsed
  } else {
    ext.billingCustomers!.push(parsed)
  }
  await db.write()
  return parsed
}

export async function getBillingCustomerByUser(userId: string): Promise<BillingCustomer | null> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const found = ext.billingCustomers!.find((c) => c.userId === userId)
  return found ? BillingCustomerSchema.parse(found) : null
}

export async function getBillingCustomerByProviderCustomerId(providerCustomerId: string): Promise<BillingCustomer | null> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const found = ext.billingCustomers!.find((c) => c.providerCustomerId === providerCustomerId)
  return found ? BillingCustomerSchema.parse(found) : null
}

export async function upsertBillingSubscription(subscription: BillingSubscription): Promise<BillingSubscription> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const parsed = BillingSubscriptionSchema.parse({ ...subscription, updatedAt: now() })
  const idx = ext.billingSubscriptions!.findIndex((s) => s.userId === parsed.userId)
  if (idx >= 0) {
    ext.billingSubscriptions![idx] = parsed
  } else {
    ext.billingSubscriptions!.push(parsed)
  }
  await db.write()
  return parsed
}

export async function getBillingSubscriptionByUser(userId: string): Promise<BillingSubscription | null> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const found = ext.billingSubscriptions!.find((s) => s.userId === userId)
  return found ? BillingSubscriptionSchema.parse(found) : null
}

export async function getBillingSubscriptionByProviderId(providerSubscriptionId: string): Promise<BillingSubscription | null> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const found = ext.billingSubscriptions!.find((s) => s.providerSubscriptionId === providerSubscriptionId)
  return found ? BillingSubscriptionSchema.parse(found) : null
}

export async function saveBillingEventIfNew(event: BillingEvent): Promise<{ duplicate: boolean; event: BillingEvent }> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const existing = ext.billingEvents!.find((entry) => entry.providerEventId === event.providerEventId)
  if (existing) {
    return { duplicate: true, event: BillingEventSchema.parse(existing) }
  }

  const parsed = BillingEventSchema.parse(event)
  ext.billingEvents!.push(parsed)
  await db.write()
  return { duplicate: false, event: parsed }
}

export async function markBillingEventProcessed(providerEventId: string, status: 'processed' | 'failed', error?: string): Promise<void> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const idx = ext.billingEvents!.findIndex((entry) => entry.providerEventId === providerEventId)
  if (idx < 0) return
  ext.billingEvents![idx] = {
    ...ext.billingEvents![idx],
    status,
    error,
    processedAt: now(),
  }
  await db.write()
}

export async function listBillingEvents(limit = 100): Promise<BillingEvent[]> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  return ext.billingEvents!
    .slice(-limit)
    .map((event) => BillingEventSchema.parse(event))
}

export async function setUserEntitlements(userId: string, entitlements: FeatureEntitlement[]): Promise<FeatureEntitlement[]> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const validated = entitlements.map((item) => FeatureEntitlementSchema.parse(item))
  ext.userEntitlements![userId] = validated
  await db.write()
  return validated
}

export async function getUserEntitlements(userId: string): Promise<FeatureEntitlement[]> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  return (ext.userEntitlements![userId] ?? []).map((item) => FeatureEntitlementSchema.parse(item))
}

export async function recordWebhookDelivery(record: WebhookDeliveryRecord): Promise<WebhookDeliveryRecord> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const cutoff = now() - WEBHOOK_RETENTION_MS
  ext.webhookDeliveries = ext.webhookDeliveries!.filter((entry) => entry.receivedAt >= cutoff)
  const parsed = WebhookDeliveryRecordSchema.parse(record)
  ext.webhookDeliveries!.push(parsed)
  await db.write()
  return parsed
}

export async function isWebhookEventDuplicate(
  provider: WebhookDeliveryRecord['provider'],
  eventId: string,
): Promise<boolean> {
  if (!eventId) return false
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const cutoff = now() - WEBHOOK_RETENTION_MS
  ext.webhookDeliveries = ext.webhookDeliveries!.filter((entry) => entry.receivedAt >= cutoff)
  return ext.webhookDeliveries!.some((entry) => entry.provider === provider && entry.eventId === eventId)
}

export async function listManagedMCPServers(userId: string): Promise<ManagedMCPServer[]> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  return ext.managedMcpServers!
    .filter((server) => server.userId === userId)
    .map((server) => ManagedMCPServerSchema.parse(server))
}

export async function upsertManagedMCPServer(server: ManagedMCPServer): Promise<ManagedMCPServer> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const parsed = ManagedMCPServerSchema.parse({ ...server, updatedAt: now() })
  const idx = ext.managedMcpServers!.findIndex((existing) => existing.userId === parsed.userId && existing.id === parsed.id)
  if (idx >= 0) {
    ext.managedMcpServers![idx] = parsed
  } else {
    ext.managedMcpServers!.push(parsed)
  }
  await db.write()
  return parsed
}

export async function deleteManagedMCPServer(userId: string, id: string): Promise<boolean> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const before = ext.managedMcpServers!.length
  ext.managedMcpServers = ext.managedMcpServers!.filter((server) => !(server.userId === userId && server.id === id))
  const changed = ext.managedMcpServers.length !== before
  if (changed) {
    await db.write()
  }
  return changed
}

export async function upsertExternalIssueLink(link: ExternalIssueLink): Promise<ExternalIssueLink> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const parsed = ExternalIssueLinkSchema.parse({ ...link, updatedAt: now() })
  const idx = ext.externalIssueLinks!.findIndex((existing) => existing.id === parsed.id)
  if (idx >= 0) {
    ext.externalIssueLinks![idx] = parsed
  } else {
    ext.externalIssueLinks!.push(parsed)
  }
  await db.write()
  return parsed
}

export async function listExternalIssueLinks(userId: string): Promise<ExternalIssueLink[]> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  return ext.externalIssueLinks!
    .filter((link) => link.userId === userId)
    .map((link) => ExternalIssueLinkSchema.parse(link))
}

export async function createOAuthState(
  userId: string,
  provider: IntegrationProvider,
  metadata?: Record<string, unknown>
): Promise<string> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const state = crypto.randomBytes(24).toString('hex')
  ext.oauthStates![state] = {
    userId,
    provider,
    metadata,
    createdAt: now(),
  }
  await db.write()
  return state
}

export async function consumeOAuthState(state: string): Promise<OAuthStateEntry | null> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const entry = ext.oauthStates![state]
  if (!entry) return null
  delete ext.oauthStates![state]
  await db.write()
  if (now() - entry.createdAt > 10 * 60 * 1000) {
    return null
  }
  return entry
}

export async function cleanupExpiredOAuthStates(maxAgeMs = 10 * 60 * 1000): Promise<number> {
  const db = await getDb()
  const ext = ensureExtendedSchema(db.data)
  const cutoff = now() - maxAgeMs
  let removed = 0
  for (const [state, entry] of Object.entries(ext.oauthStates!)) {
    if (entry.createdAt < cutoff) {
      delete ext.oauthStates![state]
      removed++
    }
  }
  if (removed > 0) {
    await db.write()
  }
  return removed
}
