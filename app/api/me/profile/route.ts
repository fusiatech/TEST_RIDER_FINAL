import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditSettingsUpdate } from '@/lib/audit'
import { UserProfileSchema } from '@/lib/contracts/backend'
import { isFeatureEnabled, requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import {
  getOrCreateUserProfile,
  listIntegrationConnectionsRedacted,
  patchUserProfile,
} from '@/server/integrations/store'

const ProfilePatchSchema = z.object({
  tenantId: z.string().optional(),
  displayName: z.string().max(120).optional(),
  providerVisibility: z.record(z.string(), z.boolean()).optional(),
})

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('BACKEND_INTEGRATIONS')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const profile = await getOrCreateUserProfile(authResult.user.id)
  const integrations = await listIntegrationConnectionsRedacted(authResult.user.id)

  return NextResponse.json({
    profile: UserProfileSchema.parse(profile),
    integrations,
    legacyMirror: {
      subscriptionTier: profile.activePlan,
      billingStatus: profile.billingStatus,
    },
  })
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('BACKEND_INTEGRATIONS')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const body = await request.json().catch(() => null)
  const parsed = ProfilePatchSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(`Invalid profile patch: ${parsed.error.message}`)
  }

  const profile = await patchUserProfile(authResult.user.id, parsed.data)

  await auditSettingsUpdate({
    target: 'user_profile',
    userId: authResult.user.id,
    changedFields: Object.keys(parsed.data),
    featureEnabled: isFeatureEnabled('BACKEND_INTEGRATIONS'),
  })

  return NextResponse.json({ profile })
}
