import crypto from 'node:crypto'
import type {
  BillingPlan,
  BillingStatus,
  BillingSubscription,
  FeatureEntitlement,
} from '@/lib/contracts/backend'
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePortalSession,
  getStripePriceForPlan,
  hashPayload,
  resolvePlanFromPriceId,
  verifyStripeWebhookSignature,
  type StripeEventPayload,
} from '@/server/billing/stripe-client'
import {
  getBillingCustomerByProviderCustomerId,
  getBillingCustomerByUser,
  getBillingSubscriptionByProviderId,
  getBillingSubscriptionByUser,
  getOrCreateUserProfile,
  getUserEntitlements,
  listBillingEvents,
  markBillingEventProcessed,
  patchUserProfile,
  recordWebhookDelivery,
  saveBillingEventIfNew,
  setUserEntitlements,
  upsertBillingCustomer,
  upsertBillingSubscription,
} from '@/server/integrations/store'

function now(): number {
  return Date.now()
}

function normalizeBillingStatus(status: string | undefined): BillingStatus {
  const value = (status ?? '').toLowerCase()
  if (value === 'trialing') return 'trialing'
  if (value === 'active') return 'active'
  if (value === 'past_due') return 'past_due'
  if (value === 'canceled') return 'canceled'
  if (value === 'unpaid') return 'unpaid'
  if (value === 'incomplete') return 'incomplete'
  return 'inactive'
}

function deriveEntitlements(plan: BillingPlan, status: BillingStatus): FeatureEntitlement[] {
  const active = status === 'active' || status === 'trialing'
  const freeEntitlements: FeatureEntitlement[] = [
    { key: 'projects.max', enabled: true, limit: 3 },
    { key: 'users.max', enabled: true, limit: 1 },
    { key: 'api.rate_limit_multiplier', enabled: true, limit: 1 },
  ]

  if (!active) {
    return freeEntitlements
  }

  if (plan === 'pro') {
    return [
      { key: 'projects.max', enabled: true, limit: 25 },
      { key: 'users.max', enabled: true, limit: 3 },
      { key: 'api.rate_limit_multiplier', enabled: true, limit: 2 },
      { key: 'integrations.enabled', enabled: true },
    ]
  }

  if (plan === 'team') {
    return [
      { key: 'projects.max', enabled: true, limit: 200 },
      { key: 'users.max', enabled: true, limit: 20 },
      { key: 'api.rate_limit_multiplier', enabled: true, limit: 5 },
      { key: 'integrations.enabled', enabled: true },
      { key: 'sso.enabled', enabled: true },
    ]
  }

  if (plan === 'enterprise') {
    return [
      { key: 'projects.max', enabled: true, limit: 5000 },
      { key: 'users.max', enabled: true, limit: 500 },
      { key: 'api.rate_limit_multiplier', enabled: true, limit: 20 },
      { key: 'integrations.enabled', enabled: true },
      { key: 'sso.enabled', enabled: true },
      { key: 'audit.retention_days', enabled: true, limit: 365 },
    ]
  }

  return freeEntitlements
}

export async function ensureStripeCustomerForUser(user: { id: string; email: string; name?: string | null }): Promise<{ providerCustomerId: string }> {
  const existing = await getBillingCustomerByUser(user.id)
  if (existing) {
    return { providerCustomerId: existing.providerCustomerId }
  }

  const created = await createStripeCustomer({
    userId: user.id,
    email: user.email,
    name: user.name,
  })

  await upsertBillingCustomer({
    id: crypto.randomUUID(),
    userId: user.id,
    provider: 'stripe',
    providerCustomerId: created.id,
    email: user.email,
    createdAt: now(),
    updatedAt: now(),
  })

  await patchUserProfile(user.id, {
    stripeCustomerId: created.id,
  })

  return { providerCustomerId: created.id }
}

export async function createCheckoutSessionForUser(params: {
  user: { id: string; email: string; name?: string | null }
  plan: BillingPlan
  successUrl: string
  cancelUrl: string
}): Promise<{ sessionId: string; url: string | null }> {
  await getOrCreateUserProfile(params.user.id)
  const customer = await ensureStripeCustomerForUser(params.user)
  const priceId = getStripePriceForPlan(params.plan)
  const session = await createStripeCheckoutSession({
    customerId: customer.providerCustomerId,
    priceId,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    userId: params.user.id,
    userEmail: params.user.email,
  })

  return {
    sessionId: session.id,
    url: session.url,
  }
}

export async function createPortalSessionForUser(params: {
  user: { id: string }
  returnUrl: string
}): Promise<{ url: string }> {
  const customer = await getBillingCustomerByUser(params.user.id)
  if (!customer) {
    throw new Error('No Stripe customer found for user')
  }

  const portal = await createStripePortalSession({
    customerId: customer.providerCustomerId,
    returnUrl: params.returnUrl,
  })

  return { url: portal.url }
}

async function applySubscriptionState(params: {
  userId: string
  providerSubscriptionId: string
  providerCustomerId?: string
  plan: BillingPlan
  status: BillingStatus
  currentPeriodStart?: number
  currentPeriodEnd?: number
  cancelAtPeriodEnd?: boolean
  raw: Record<string, unknown>
}): Promise<void> {
  const existing = await getBillingSubscriptionByUser(params.userId)
  const subscription: BillingSubscription = {
    id: existing?.id ?? crypto.randomUUID(),
    userId: params.userId,
    provider: 'stripe',
    providerSubscriptionId: params.providerSubscriptionId,
    providerCustomerId: params.providerCustomerId,
    plan: params.plan,
    status: params.status,
    currentPeriodStart: params.currentPeriodStart,
    currentPeriodEnd: params.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(params.cancelAtPeriodEnd),
    metadata: params.raw,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  }

  await upsertBillingSubscription(subscription)

  const profile = await getOrCreateUserProfile(params.userId)
  const nextEntitlementVersion = (profile.entitlementVersion ?? 0) + 1
  const entitlements = deriveEntitlements(params.plan, params.status)

  await setUserEntitlements(params.userId, entitlements)
  await patchUserProfile(params.userId, {
    activePlan: params.plan,
    billingStatus: params.status,
    stripeSubscriptionId: params.providerSubscriptionId,
    stripeCustomerId: params.providerCustomerId,
    entitlementVersion: nextEntitlementVersion,
  })
}

function extractPrimaryPriceId(obj: Record<string, unknown>): string | undefined {
  const items = obj.items as { data?: Array<{ price?: { id?: string } }> } | undefined
  return items?.data?.[0]?.price?.id
}

function maybeNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

async function handleSubscriptionLikeObject(obj: Record<string, unknown>): Promise<void> {
  const providerSubscriptionId = String(obj.id ?? '')
  if (!providerSubscriptionId) return

  const providerCustomerId = typeof obj.customer === 'string' ? obj.customer : undefined
  const status = normalizeBillingStatus(typeof obj.status === 'string' ? obj.status : undefined)
  const priceId = extractPrimaryPriceId(obj)
  const plan = resolvePlanFromPriceId(priceId)

  let userId: string | undefined
  const metadata = (obj.metadata as Record<string, unknown> | undefined) ?? {}
  if (typeof metadata.userId === 'string') {
    userId = metadata.userId
  }

  if (!userId && providerCustomerId) {
    const customer = await getBillingCustomerByProviderCustomerId(providerCustomerId)
    userId = customer?.userId
  }

  if (!userId) {
    const existing = await getBillingSubscriptionByProviderId(providerSubscriptionId)
    userId = existing?.userId
  }

  if (!userId) return

  await applySubscriptionState({
    userId,
    providerSubscriptionId,
    providerCustomerId,
    plan,
    status,
    currentPeriodStart: maybeNumber(obj.current_period_start),
    currentPeriodEnd: maybeNumber(obj.current_period_end),
    cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
    raw: obj,
  })
}

export async function processStripeWebhook(payload: string, signatureHeader: string | null): Promise<{ ok: boolean; duplicate?: boolean }> {
  let event: StripeEventPayload
  try {
    event = verifyStripeWebhookSignature(payload, signatureHeader)
  } catch (error) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'stripe',
      eventId: undefined,
      signatureValid: false,
      processed: false,
      receivedAt: now(),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  const payloadHash = hashPayload(payload)
  const saved = await saveBillingEventIfNew({
    id: crypto.randomUUID(),
    userId: undefined,
    provider: 'stripe',
    eventType: event.type,
    providerEventId: event.id,
    payloadHash,
    status: 'received',
    receivedAt: now(),
  })

  if (saved.duplicate) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'stripe',
      eventId: event.id,
      signatureValid: true,
      processed: true,
      receivedAt: now(),
    })
    return { ok: true, duplicate: true }
  }

  try {
    if (event.type.startsWith('customer.subscription.')) {
      await handleSubscriptionLikeObject(event.data.object)
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : undefined
      const displayItems = (session as { display_items?: Array<{ price?: string }> }).display_items ?? []
      const sessionPriceId = displayItems[0]?.price
      if (subscriptionId) {
        const simulatedSubscription = {
          id: subscriptionId,
          customer: session.customer,
          status: 'active',
          metadata: {
            userId: (session.metadata as Record<string, unknown> | undefined)?.userId,
          },
          items: {
            data: [
              {
                price: {
                  id: sessionPriceId,
                },
              },
            ],
          },
        } as Record<string, unknown>
        await handleSubscriptionLikeObject(simulatedSubscription)
      }
    }

    await markBillingEventProcessed(event.id, 'processed')
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'stripe',
      eventId: event.id,
      signatureValid: true,
      processed: true,
      receivedAt: now(),
    })

    return { ok: true }
  } catch (error) {
    await markBillingEventProcessed(event.id, 'failed', error instanceof Error ? error.message : String(error))
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'stripe',
      eventId: event.id,
      signatureValid: true,
      processed: false,
      receivedAt: now(),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function getSubscriptionForUser(userId: string): Promise<BillingSubscription | null> {
  return getBillingSubscriptionByUser(userId)
}

export async function getEntitlementsForUser(userId: string): Promise<FeatureEntitlement[]> {
  const existing = await getUserEntitlements(userId)
  if (existing.length > 0) return existing

  const profile = await getOrCreateUserProfile(userId)
  const derived = deriveEntitlements(profile.activePlan, profile.billingStatus)
  await setUserEntitlements(userId, derived)
  return derived
}

export async function getBillingDebug(userId: string): Promise<{ events: number }> {
  const events = await listBillingEvents(200)
  return {
    events: events.filter((event) => event.userId === userId || event.userId === undefined).length,
  }
}
