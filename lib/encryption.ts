import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 32
const KEY_LENGTH = 32
const ITERATIONS = 100000

const CURRENT_KEY_VERSION = 2
const ENCRYPTED_PREFIX_V1 = 'enc:v1:'
const ENCRYPTED_PREFIX_V2 = 'enc:v2:'

export interface KeyMetadata {
  version: number
  createdAt: number
  rotatedAt?: number
  previousVersions: number[]
}

export interface RotationResult {
  success: boolean
  rotatedCount: number
  errors: string[]
}

/**
 * Derive a 256-bit encryption key from a secret using PBKDF2
 */
export function deriveKey(secret: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const useSalt = salt ?? crypto.randomBytes(SALT_LENGTH)
  const key = crypto.pbkdf2Sync(secret, useSalt, ITERATIONS, KEY_LENGTH, 'sha256')
  return { key, salt: useSalt }
}

/**
 * Encrypt plaintext using AES-256-GCM with versioning
 * Returns: enc:v2:<version>:<salt>:<iv>:<authTag>:<ciphertext> (all base64)
 */
export function encrypt(plaintext: string, secret: string, keyVersion?: number): string {
  if (!plaintext) return plaintext
  
  const version = keyVersion ?? CURRENT_KEY_VERSION
  const { key, salt } = deriveKey(secret)
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()
  
  return [
    'enc',
    'v2',
    version.toString(),
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

/**
 * Encrypt with v1 format (for backward compatibility)
 */
export function encryptV1(plaintext: string, secret: string): string {
  if (!plaintext) return plaintext
  
  const { key, salt } = deriveKey(secret)
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()
  
  return [
    'enc',
    'v1',
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

/**
 * Decrypt ciphertext encrypted with encrypt()
 * Supports both v1 and v2 formats
 */
export function decrypt(ciphertext: string, secret: string): string {
  if (!ciphertext) return ciphertext
  if (!isEncrypted(ciphertext)) return ciphertext
  
  const parts = ciphertext.split(':')
  if (parts[0] !== 'enc') {
    throw new Error('Invalid encrypted format')
  }

  if (parts[1] === 'v1') {
    if (parts.length !== 6) {
      throw new Error('Invalid v1 encrypted format')
    }
    const salt = Buffer.from(parts[2], 'base64')
    const iv = Buffer.from(parts[3], 'base64')
    const authTag = Buffer.from(parts[4], 'base64')
    const encrypted = Buffer.from(parts[5], 'base64')
    
    const { key } = deriveKey(secret, salt)
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    
    return decrypted.toString('utf8')
  }

  if (parts[1] === 'v2') {
    if (parts.length !== 7) {
      throw new Error('Invalid v2 encrypted format')
    }
    const salt = Buffer.from(parts[3], 'base64')
    const iv = Buffer.from(parts[4], 'base64')
    const authTag = Buffer.from(parts[5], 'base64')
    const encrypted = Buffer.from(parts[6], 'base64')
    
    const { key } = deriveKey(secret, salt)
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    
    return decrypted.toString('utf8')
  }

  throw new Error(`Unsupported encryption version: ${parts[1]}`)
}

/**
 * Check if a string is already encrypted (v1 or v2)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  return value.startsWith(ENCRYPTED_PREFIX_V1) || value.startsWith(ENCRYPTED_PREFIX_V2)
}

/**
 * Get the encryption version from an encrypted string
 */
export function getEncryptionVersion(ciphertext: string): number | null {
  if (!isEncrypted(ciphertext)) return null
  
  const parts = ciphertext.split(':')
  if (parts[1] === 'v1') return 1
  if (parts[1] === 'v2') {
    return parseInt(parts[2], 10)
  }
  return null
}

/**
 * Check if a value needs re-encryption (old key version)
 */
export function needsReEncryption(ciphertext: string, currentKeyVersion: number = CURRENT_KEY_VERSION): boolean {
  const version = getEncryptionVersion(ciphertext)
  if (version === null) return false
  return version < currentKeyVersion
}

/**
 * Re-encrypt a value with a new key
 */
export function reEncrypt(
  ciphertext: string,
  oldSecret: string,
  newSecret: string,
  newKeyVersion?: number
): string {
  const plaintext = decrypt(ciphertext, oldSecret)
  return encrypt(plaintext, newSecret, newKeyVersion)
}

/**
 * Rotate encryption key for a set of encrypted values
 */
export function rotateEncryptionKey(
  values: Record<string, string>,
  oldSecret: string,
  newSecret: string,
  newKeyVersion?: number
): { rotated: Record<string, string>; result: RotationResult } {
  const rotated: Record<string, string> = {}
  const result: RotationResult = {
    success: true,
    rotatedCount: 0,
    errors: [],
  }

  for (const [key, value] of Object.entries(values)) {
    if (!isEncrypted(value)) {
      rotated[key] = value
      continue
    }

    try {
      rotated[key] = reEncrypt(value, oldSecret, newSecret, newKeyVersion)
      result.rotatedCount++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to rotate ${key}: ${message}`)
      result.success = false
      rotated[key] = value
    }
  }

  return { rotated, result }
}

/**
 * Create key metadata for tracking rotation history
 */
export function createKeyMetadata(previousVersions: number[] = []): KeyMetadata {
  return {
    version: CURRENT_KEY_VERSION,
    createdAt: Date.now(),
    previousVersions,
  }
}

/**
 * Update key metadata after rotation
 */
export function updateKeyMetadataAfterRotation(
  metadata: KeyMetadata,
  newVersion: number
): KeyMetadata {
  return {
    version: newVersion,
    createdAt: metadata.createdAt,
    rotatedAt: Date.now(),
    previousVersions: [...metadata.previousVersions, metadata.version],
  }
}

/**
 * Get the current key version
 */
export function getCurrentKeyVersion(): number {
  return CURRENT_KEY_VERSION
}

/**
 * Get the encryption secret from environment
 */
export function getEncryptionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    console.warn('[encryption] NEXTAUTH_SECRET not set, using fallback key (not secure for production)')
    return 'swarm-ui-default-encryption-key-change-me'
  }
  return secret
}
