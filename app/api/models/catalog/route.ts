import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getProviderCatalogForUser, getProviderModelsForUser } from '@/server/providers/catalog'

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [providers, models] = await Promise.all([
    getProviderCatalogForUser(session.user.id),
    getProviderModelsForUser(session.user.id),
  ])

  return NextResponse.json({
    providers,
    models,
    updatedAt: Date.now(),
  })
}
