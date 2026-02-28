import crypto from 'node:crypto'
import type { BillingPlan } from '@/lib/contracts/backend'

export interface StripeEventPayload {
  id: string
  type: string
  created: number
  data: {
    object: Record<string, unknown>
  }
}

interface StripeApiOptions {
  method?: 'GET' | 'POST'
  form?: Record<string, string | number | boolean | undefined>
}

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return key
}

function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }
  return secret
}

async function stripeApi<T>(path: string, options: StripeApiOptions = {}): Promise<T> {
  const method = options.method ?? 'POST'
  const key = getStripeSecretKey()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  }

  let body: string | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const params = new URLSearchParams()
    for (const [field, value] of Object.entries(options.form ?? {})) {
      if (value === undefined) continue
      params.append(field, String(value))
    }
    body = params.toString()
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Stripe API ${path} failed (${response.status}): ${text}`)
  }

  return (await response.json()) as T
}

export async function createStripeCustomer(params: {
  email: string
  name?: string | null
  userId: string
}): Promise<{ id: string }> {
  return stripeApi<{ id: string }>('/v1/customers', {
    method: 'POST',
    form: {
      email: params.email,
      name: params.name ?? undefined,
      'metadata[userId]': params.userId,
    },
  })
}

export async function createStripeCheckoutSession(params: {
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
  userId: string
  userEmail: string
}): Promise<{ id: string; url: string | null }> {
  return stripeApi<{ id: string; url: string | null }>('/v1/checkout/sessions', {
    method: 'POST',
    form: {
      mode: 'subscription',
      customer: params.customerId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      'line_items[0][price]': params.priceId,
      'line_items[0][quantity]': 1,
      allow_promotion_codes: true,
      'subscription_data[metadata][userId]': params.userId,
      'metadata[userEmail]': params.userEmail,
    },
  })
}

export async function createStripePortalSession(params: {
  customerId: string
  returnUrl: string
}): Promise<{ id: string; url: string }> {
  return stripeApi<{ id: string; url: string }>('/v1/billing_portal/sessions', {
    method: 'POST',
    form: {
      customer: params.customerId,
      return_url: params.returnUrl,
      configuration: process.env.STRIPE_PORTAL_CONFIGURATION,
    },
  })
}

export async function retrieveStripeSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
  return stripeApi<Record<string, unknown>>(`/v1/subscriptions/${subscriptionId}`, {
    method: 'GET',
  })
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null): StripeEventPayload {
  if (!signatureHeader) {
    throw new Error('Missing Stripe-Signature header')
  }

  const timestampMatch = signatureHeader.match(/(?:^|,)t=(\d+)/)
  const signatures = Array.from(signatureHeader.matchAll(/(?:^|,)v1=([a-fA-F0-9]+)/g)).map((match) => match[1])

  if (!timestampMatch || signatures.length === 0) {
    throw new Error('Invalid Stripe-Signature header format')
  }

  const timestamp = Number(timestampMatch[1])
  if (!Number.isFinite(timestamp)) {
    throw new Error('Invalid Stripe signature timestamp')
  }

  const toleranceSeconds = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS ?? 300)
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp)
  if (ageSeconds > toleranceSeconds) {
    throw new Error(`Stripe signature outside tolerance (${ageSeconds}s)`)
  }

  const signedPayload = `${timestamp}.${payload}`
  const expected = crypto
    .createHmac('sha256', getStripeWebhookSecret())
    .update(signedPayload, 'utf8')
    .digest('hex')

  const expectedBuffer = Buffer.from(expected, 'utf8')
  const isValid = signatures.some((sig) => {
    const sigBuffer = Buffer.from(sig, 'utf8')
    if (sigBuffer.length !== expectedBuffer.length) return false
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  })

  if (!isValid) {
    throw new Error('Stripe signature verification failed')
  }

  return JSON.parse(payload) as StripeEventPayload
}

export function resolvePlanFromPriceId(priceId: string | null | undefined): BillingPlan {
  if (!priceId) return 'free'

  const pro = process.env.STRIPE_PRICE_PRO?.trim()
  const team = process.env.STRIPE_PRICE_TEAM?.trim()
  const enterprise = process.env.STRIPE_PRICE_ENTERPRISE?.trim()

  if (enterprise && priceId === enterprise) return 'enterprise'
  if (team && priceId === team) return 'team'
  if (pro && priceId === pro) return 'pro'

  if (priceId.toLowerCase().includes('team')) return 'team'
  if (priceId.toLowerCase().includes('enterprise')) return 'enterprise'
  if (priceId.toLowerCase().includes('pro')) return 'pro'
  return 'free'
}

export function getStripePriceForPlan(plan: BillingPlan): string {
  if (plan === 'enterprise') {
    const id = process.env.STRIPE_PRICE_ENTERPRISE
    if (id) return id
  }
  if (plan === 'team') {
    const id = process.env.STRIPE_PRICE_TEAM
    if (id) return id
  }
  if (plan === 'pro') {
    const id = process.env.STRIPE_PRICE_PRO
    if (id) return id
  }

  throw new Error(`Stripe price ID is not configured for plan: ${plan}`)
}

export function hashPayload(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex')
}
