import { NextResponse } from 'next/server'
import { MODEL_CATALOG } from '@/lib/model-catalog'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    providers: MODEL_CATALOG,
    updatedAt: Date.now(),
  })
}
