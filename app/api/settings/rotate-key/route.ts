import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSettings, saveSettings } from '@/server/storage'
import {
  rotateEncryptionKey,
  getCurrentKeyVersion,
  createKeyMetadata,
  updateKeyMetadataAfterRotation,
  isEncrypted,
} from '@/lib/encryption'

const RotateKeyRequestSchema = z.object({
  oldSecret: z.string().min(16, 'Old secret must be at least 16 characters'),
  newSecret: z.string().min(16, 'New secret must be at least 16 characters'),
  confirmNewSecret: z.string(),
}).refine(data => data.newSecret === data.confirmNewSecret, {
  message: 'New secrets do not match',
  path: ['confirmNewSecret'],
}).refine(data => data.oldSecret !== data.newSecret, {
  message: 'New secret must be different from old secret',
  path: ['newSecret'],
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parseResult = RotateKeyRequestSchema.safeParse(body)
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.message },
        { status: 400 }
      )
    }

    const { oldSecret, newSecret } = parseResult.data
    const settings = await getSettings()

    const encryptedFields: Record<string, string> = {}
    const apiKeys = settings.apiKeys ?? {}
    
    for (const [key, value] of Object.entries(apiKeys)) {
      if (value && isEncrypted(value)) {
        encryptedFields[`apiKeys.${key}`] = value
      }
    }

    if (Object.keys(encryptedFields).length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No encrypted values found to rotate',
        rotatedCount: 0,
      })
    }

    const newKeyVersion = getCurrentKeyVersion() + 1
    const { rotated, result } = rotateEncryptionKey(
      encryptedFields,
      oldSecret,
      newSecret,
      newKeyVersion
    )

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Key rotation failed for some values',
          errors: result.errors,
          rotatedCount: result.rotatedCount,
        },
        { status: 500 }
      )
    }

    const updatedApiKeys = { ...apiKeys }
    for (const [key, value] of Object.entries(rotated)) {
      if (key.startsWith('apiKeys.')) {
        const apiKeyName = key.replace('apiKeys.', '')
        updatedApiKeys[apiKeyName as keyof typeof apiKeys] = value
      }
    }

    const updatedSettings = {
      ...settings,
      apiKeys: updatedApiKeys,
    }

    await saveSettings(updatedSettings)

    const existingMetadata = createKeyMetadata()
    const newMetadata = updateKeyMetadataAfterRotation(existingMetadata, newKeyVersion)

    return NextResponse.json({
      success: true,
      message: `Successfully rotated ${result.rotatedCount} encrypted value(s)`,
      rotatedCount: result.rotatedCount,
      keyMetadata: {
        newVersion: newMetadata.version,
        rotatedAt: newMetadata.rotatedAt,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    
    if (message.includes('Unsupported state') || message.includes('bad decrypt')) {
      return NextResponse.json(
        { error: 'Invalid old secret - decryption failed' },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: `Key rotation failed: ${message}` },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await getSettings()
    const apiKeys = settings.apiKeys ?? {}
    
    let encryptedCount = 0
    const encryptedFields: string[] = []
    
    for (const [key, value] of Object.entries(apiKeys)) {
      if (value && isEncrypted(value)) {
        encryptedCount++
        encryptedFields.push(key)
      }
    }

    return NextResponse.json({
      currentKeyVersion: getCurrentKeyVersion(),
      encryptedFieldCount: encryptedCount,
      encryptedFields,
      canRotate: encryptedCount > 0,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
