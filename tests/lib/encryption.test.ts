import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  deriveKey,
  encrypt,
  encryptV1,
  decrypt,
  isEncrypted,
  getEncryptionVersion,
  needsReEncryption,
  reEncrypt,
  rotateEncryptionKey,
  createKeyMetadata,
  updateKeyMetadataAfterRotation,
  getCurrentKeyVersion,
  getEncryptionSecret,
} from '@/lib/encryption'

describe('encryption.ts', () => {
  const testSecret = 'test-secret-key-for-encryption'
  const testPlaintext = 'Hello, World! This is sensitive data.'

  describe('deriveKey', () => {
    it('derives a 32-byte key from a secret', () => {
      const { key, salt } = deriveKey(testSecret)
      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)
      expect(salt).toBeInstanceOf(Buffer)
      expect(salt.length).toBe(32)
    })

    it('generates different salts for each call', () => {
      const result1 = deriveKey(testSecret)
      const result2 = deriveKey(testSecret)
      expect(result1.salt.equals(result2.salt)).toBe(false)
    })

    it('derives same key when same salt is provided', () => {
      const { key: key1, salt } = deriveKey(testSecret)
      const { key: key2 } = deriveKey(testSecret, salt)
      expect(key1.equals(key2)).toBe(true)
    })

    it('derives different keys for different secrets', () => {
      const salt = Buffer.alloc(32, 'a')
      const { key: key1 } = deriveKey('secret1', salt)
      const { key: key2 } = deriveKey('secret2', salt)
      expect(key1.equals(key2)).toBe(false)
    })

    it('derives different keys for different salts', () => {
      const salt1 = Buffer.alloc(32, 'a')
      const salt2 = Buffer.alloc(32, 'b')
      const { key: key1 } = deriveKey(testSecret, salt1)
      const { key: key2 } = deriveKey(testSecret, salt2)
      expect(key1.equals(key2)).toBe(false)
    })

    it('handles empty secret', () => {
      const { key, salt } = deriveKey('')
      expect(key.length).toBe(32)
      expect(salt.length).toBe(32)
    })

    it('handles unicode secrets', () => {
      const { key, salt } = deriveKey('密码🔐パスワード')
      expect(key.length).toBe(32)
      expect(salt.length).toBe(32)
    })
  })

  describe('encrypt', () => {
    it('returns empty string for empty input', () => {
      expect(encrypt('', testSecret)).toBe('')
    })

    it('encrypts plaintext to v2 format', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      expect(encrypted.startsWith('enc:v2:')).toBe(true)
    })

    it('produces different ciphertext for same plaintext (random IV/salt)', () => {
      const encrypted1 = encrypt(testPlaintext, testSecret)
      const encrypted2 = encrypt(testPlaintext, testSecret)
      expect(encrypted1).not.toBe(encrypted2)
    })

    it('includes version number in v2 format', () => {
      const encrypted = encrypt(testPlaintext, testSecret, 5)
      const parts = encrypted.split(':')
      expect(parts[0]).toBe('enc')
      expect(parts[1]).toBe('v2')
      expect(parts[2]).toBe('5')
    })

    it('uses current key version by default', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      const parts = encrypted.split(':')
      expect(parseInt(parts[2], 10)).toBe(getCurrentKeyVersion())
    })

    it('produces valid base64 components', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      const parts = encrypted.split(':')
      expect(parts.length).toBe(7)
      
      const salt = parts[3]
      const iv = parts[4]
      const authTag = parts[5]
      const ciphertext = parts[6]
      
      expect(() => Buffer.from(salt, 'base64')).not.toThrow()
      expect(() => Buffer.from(iv, 'base64')).not.toThrow()
      expect(() => Buffer.from(authTag, 'base64')).not.toThrow()
      expect(() => Buffer.from(ciphertext, 'base64')).not.toThrow()
    })

    it('handles unicode plaintext', () => {
      const unicodeText = '你好世界 🌍 مرحبا'
      const encrypted = encrypt(unicodeText, testSecret)
      expect(encrypted.startsWith('enc:v2:')).toBe(true)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(unicodeText)
    })

    it('handles very long plaintext', () => {
      const longText = 'A'.repeat(100000)
      const encrypted = encrypt(longText, testSecret)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(longText)
    })

    it('handles special characters', () => {
      const specialText = '`~!@#$%^&*()_+-=[]{}|;\':",./<>?\n\t\r'
      const encrypted = encrypt(specialText, testSecret)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(specialText)
    })
  })

  describe('encryptV1', () => {
    it('returns empty string for empty input', () => {
      expect(encryptV1('', testSecret)).toBe('')
    })

    it('encrypts plaintext to v1 format', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      expect(encrypted.startsWith('enc:v1:')).toBe(true)
    })

    it('produces 6-part format (no version number)', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      const parts = encrypted.split(':')
      expect(parts.length).toBe(6)
      expect(parts[0]).toBe('enc')
      expect(parts[1]).toBe('v1')
    })

    it('can be decrypted', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(testPlaintext)
    })
  })

  describe('decrypt', () => {
    it('returns empty string for empty input', () => {
      expect(decrypt('', testSecret)).toBe('')
    })

    it('returns non-encrypted strings unchanged', () => {
      const plaintext = 'not encrypted'
      expect(decrypt(plaintext, testSecret)).toBe(plaintext)
    })

    it('decrypts v2 encrypted strings', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(testPlaintext)
    })

    it('decrypts v1 encrypted strings', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(testPlaintext)
    })

    it('throws for invalid encrypted format prefix', () => {
      expect(() => decrypt('invalid:v1:data', testSecret)).toThrow('Invalid encrypted format')
    })

    it('throws for invalid v1 format (wrong part count)', () => {
      expect(() => decrypt('enc:v1:a:b:c', testSecret)).toThrow('Invalid v1 encrypted format')
      expect(() => decrypt('enc:v1:a:b:c:d:e', testSecret)).toThrow('Invalid v1 encrypted format')
    })

    it('throws for invalid v2 format (wrong part count)', () => {
      expect(() => decrypt('enc:v2:1:a:b:c', testSecret)).toThrow('Invalid v2 encrypted format')
      expect(() => decrypt('enc:v2:1:a:b:c:d:e', testSecret)).toThrow('Invalid v2 encrypted format')
    })

    it('throws for unsupported version', () => {
      expect(() => decrypt('enc:v3:data', testSecret)).toThrow('Unsupported encryption version: v3')
    })

    it('throws for wrong secret', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      expect(() => decrypt(encrypted, 'wrong-secret')).toThrow()
    })

    it('throws for tampered ciphertext', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      const parts = encrypted.split(':')
      parts[6] = Buffer.from('tampered').toString('base64')
      const tampered = parts.join(':')
      expect(() => decrypt(tampered, testSecret)).toThrow()
    })

    it('throws for tampered auth tag', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      const parts = encrypted.split(':')
      parts[5] = Buffer.from('tamperedtag12345').toString('base64')
      const tampered = parts.join(':')
      expect(() => decrypt(tampered, testSecret)).toThrow()
    })

    it('throws for tampered IV', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      const parts = encrypted.split(':')
      parts[4] = Buffer.from('tamperediv123456').toString('base64')
      const tampered = parts.join(':')
      expect(() => decrypt(tampered, testSecret)).toThrow()
    })
  })

  describe('isEncrypted', () => {
    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false)
    })

    it('returns false for null/undefined', () => {
      expect(isEncrypted(null as unknown as string)).toBe(false)
      expect(isEncrypted(undefined as unknown as string)).toBe(false)
    })

    it('returns false for plain text', () => {
      expect(isEncrypted('plain text')).toBe(false)
      expect(isEncrypted('enc:notvalid')).toBe(false)
    })

    it('returns true for v1 encrypted strings', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('returns true for v2 encrypted strings', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('returns true for strings starting with v1 prefix', () => {
      expect(isEncrypted('enc:v1:anything')).toBe(true)
    })

    it('returns true for strings starting with v2 prefix', () => {
      expect(isEncrypted('enc:v2:anything')).toBe(true)
    })
  })

  describe('getEncryptionVersion', () => {
    it('returns null for non-encrypted strings', () => {
      expect(getEncryptionVersion('plain text')).toBeNull()
      expect(getEncryptionVersion('')).toBeNull()
    })

    it('returns 1 for v1 encrypted strings', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      expect(getEncryptionVersion(encrypted)).toBe(1)
    })

    it('returns key version for v2 encrypted strings', () => {
      const encrypted = encrypt(testPlaintext, testSecret, 5)
      expect(getEncryptionVersion(encrypted)).toBe(5)
    })

    it('returns current key version for default v2 encryption', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      expect(getEncryptionVersion(encrypted)).toBe(getCurrentKeyVersion())
    })
  })

  describe('needsReEncryption', () => {
    it('returns false for non-encrypted strings', () => {
      expect(needsReEncryption('plain text')).toBe(false)
    })

    it('returns true for v1 encrypted strings', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      expect(needsReEncryption(encrypted)).toBe(true)
    })

    it('returns true for v2 with old key version', () => {
      const encrypted = encrypt(testPlaintext, testSecret, 1)
      expect(needsReEncryption(encrypted, 2)).toBe(true)
    })

    it('returns false for v2 with current key version', () => {
      const currentVersion = getCurrentKeyVersion()
      const encrypted = encrypt(testPlaintext, testSecret, currentVersion)
      expect(needsReEncryption(encrypted, currentVersion)).toBe(false)
    })

    it('returns false for v2 with newer key version', () => {
      const encrypted = encrypt(testPlaintext, testSecret, 5)
      expect(needsReEncryption(encrypted, 3)).toBe(false)
    })
  })

  describe('reEncrypt', () => {
    it('re-encrypts with new secret', () => {
      const oldSecret = 'old-secret'
      const newSecret = 'new-secret'
      const encrypted = encrypt(testPlaintext, oldSecret)
      
      const reEncrypted = reEncrypt(encrypted, oldSecret, newSecret)
      
      expect(() => decrypt(reEncrypted, oldSecret)).toThrow()
      expect(decrypt(reEncrypted, newSecret)).toBe(testPlaintext)
    })

    it('updates key version', () => {
      const encrypted = encrypt(testPlaintext, testSecret, 1)
      const reEncrypted = reEncrypt(encrypted, testSecret, testSecret, 5)
      expect(getEncryptionVersion(reEncrypted)).toBe(5)
    })

    it('handles v1 to v2 upgrade', () => {
      const encrypted = encryptV1(testPlaintext, testSecret)
      expect(getEncryptionVersion(encrypted)).toBe(1)
      
      const reEncrypted = reEncrypt(encrypted, testSecret, testSecret, 3)
      expect(getEncryptionVersion(reEncrypted)).toBe(3)
      expect(decrypt(reEncrypted, testSecret)).toBe(testPlaintext)
    })
  })

  describe('rotateEncryptionKey', () => {
    const oldSecret = 'old-secret'
    const newSecret = 'new-secret'

    it('rotates encrypted values', () => {
      const values = {
        key1: encrypt('value1', oldSecret),
        key2: encrypt('value2', oldSecret),
      }

      const { rotated, result } = rotateEncryptionKey(values, oldSecret, newSecret)

      expect(result.success).toBe(true)
      expect(result.rotatedCount).toBe(2)
      expect(result.errors).toHaveLength(0)
      expect(decrypt(rotated.key1, newSecret)).toBe('value1')
      expect(decrypt(rotated.key2, newSecret)).toBe('value2')
    })

    it('skips non-encrypted values', () => {
      const values = {
        encrypted: encrypt('secret', oldSecret),
        plain: 'plain text',
      }

      const { rotated, result } = rotateEncryptionKey(values, oldSecret, newSecret)

      expect(result.rotatedCount).toBe(1)
      expect(rotated.plain).toBe('plain text')
    })

    it('handles empty object', () => {
      const { rotated, result } = rotateEncryptionKey({}, oldSecret, newSecret)

      expect(result.success).toBe(true)
      expect(result.rotatedCount).toBe(0)
      expect(Object.keys(rotated)).toHaveLength(0)
    })

    it('reports errors for failed rotations', () => {
      const values = {
        valid: encrypt('value', oldSecret),
        invalid: 'enc:v2:1:invalid:base64:data:here',
      }

      const { rotated, result } = rotateEncryptionKey(values, oldSecret, newSecret)

      expect(result.success).toBe(false)
      expect(result.rotatedCount).toBe(1)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('invalid')
      expect(rotated.invalid).toBe(values.invalid)
    })

    it('continues rotation after error', () => {
      const values = {
        first: encrypt('first', oldSecret),
        invalid: 'enc:v2:1:bad:data:here:now',
        last: encrypt('last', oldSecret),
      }

      const { rotated, result } = rotateEncryptionKey(values, oldSecret, newSecret)

      expect(result.rotatedCount).toBe(2)
      expect(decrypt(rotated.first, newSecret)).toBe('first')
      expect(decrypt(rotated.last, newSecret)).toBe('last')
    })

    it('updates key version during rotation', () => {
      const values = {
        key1: encrypt('value1', oldSecret, 1),
      }

      const { rotated } = rotateEncryptionKey(values, oldSecret, newSecret, 5)

      expect(getEncryptionVersion(rotated.key1)).toBe(5)
    })
  })

  describe('createKeyMetadata', () => {
    it('creates metadata with current version', () => {
      const metadata = createKeyMetadata()
      expect(metadata.version).toBe(getCurrentKeyVersion())
    })

    it('includes creation timestamp', () => {
      const before = Date.now()
      const metadata = createKeyMetadata()
      const after = Date.now()
      
      expect(metadata.createdAt).toBeGreaterThanOrEqual(before)
      expect(metadata.createdAt).toBeLessThanOrEqual(after)
    })

    it('initializes empty previous versions', () => {
      const metadata = createKeyMetadata()
      expect(metadata.previousVersions).toEqual([])
    })

    it('accepts previous versions', () => {
      const metadata = createKeyMetadata([1, 2, 3])
      expect(metadata.previousVersions).toEqual([1, 2, 3])
    })

    it('does not include rotatedAt initially', () => {
      const metadata = createKeyMetadata()
      expect(metadata.rotatedAt).toBeUndefined()
    })
  })

  describe('updateKeyMetadataAfterRotation', () => {
    it('updates version', () => {
      const metadata = createKeyMetadata()
      const updated = updateKeyMetadataAfterRotation(metadata, 5)
      expect(updated.version).toBe(5)
    })

    it('preserves creation timestamp', () => {
      const metadata = createKeyMetadata()
      const updated = updateKeyMetadataAfterRotation(metadata, 5)
      expect(updated.createdAt).toBe(metadata.createdAt)
    })

    it('adds rotation timestamp', () => {
      const metadata = createKeyMetadata()
      const before = Date.now()
      const updated = updateKeyMetadataAfterRotation(metadata, 5)
      const after = Date.now()
      
      expect(updated.rotatedAt).toBeDefined()
      expect(updated.rotatedAt).toBeGreaterThanOrEqual(before)
      expect(updated.rotatedAt).toBeLessThanOrEqual(after)
    })

    it('appends old version to previous versions', () => {
      const metadata = createKeyMetadata([1])
      metadata.version = 2
      const updated = updateKeyMetadataAfterRotation(metadata, 3)
      expect(updated.previousVersions).toEqual([1, 2])
    })

    it('does not mutate original metadata', () => {
      const metadata = createKeyMetadata()
      const originalVersion = metadata.version
      updateKeyMetadataAfterRotation(metadata, 5)
      expect(metadata.version).toBe(originalVersion)
    })
  })

  describe('getCurrentKeyVersion', () => {
    it('returns a positive integer', () => {
      const version = getCurrentKeyVersion()
      expect(Number.isInteger(version)).toBe(true)
      expect(version).toBeGreaterThan(0)
    })

    it('returns consistent value', () => {
      expect(getCurrentKeyVersion()).toBe(getCurrentKeyVersion())
    })
  })

  describe('getEncryptionSecret', () => {
    const originalEnv = process.env.NEXTAUTH_SECRET

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.NEXTAUTH_SECRET = originalEnv
      } else {
        delete process.env.NEXTAUTH_SECRET
      }
    })

    it('returns NEXTAUTH_SECRET when set', () => {
      process.env.NEXTAUTH_SECRET = 'my-secret-key'
      expect(getEncryptionSecret()).toBe('my-secret-key')
    })

    it('returns fallback when NEXTAUTH_SECRET not set', () => {
      delete process.env.NEXTAUTH_SECRET
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const secret = getEncryptionSecret()
      
      expect(secret).toBe('swarm-ui-default-encryption-key-change-me')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('NEXTAUTH_SECRET not set')
      )
      
      consoleWarnSpy.mockRestore()
    })

    it('returns fallback when NEXTAUTH_SECRET is empty string', () => {
      process.env.NEXTAUTH_SECRET = ''
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const secret = getEncryptionSecret()
      
      expect(secret).toBe('swarm-ui-default-encryption-key-change-me')
      
      consoleWarnSpy.mockRestore()
    })
  })

  describe('version compatibility', () => {
    it('v1 and v2 produce different formats', () => {
      const v1 = encryptV1(testPlaintext, testSecret)
      const v2 = encrypt(testPlaintext, testSecret)
      
      expect(v1.split(':').length).toBe(6)
      expect(v2.split(':').length).toBe(7)
    })

    it('both v1 and v2 decrypt to same plaintext', () => {
      const v1 = encryptV1(testPlaintext, testSecret)
      const v2 = encrypt(testPlaintext, testSecret)
      
      expect(decrypt(v1, testSecret)).toBe(testPlaintext)
      expect(decrypt(v2, testSecret)).toBe(testPlaintext)
    })

    it('can upgrade v1 to v2 via reEncrypt', () => {
      const v1 = encryptV1(testPlaintext, testSecret)
      expect(v1.startsWith('enc:v1:')).toBe(true)
      
      const v2 = reEncrypt(v1, testSecret, testSecret)
      expect(v2.startsWith('enc:v2:')).toBe(true)
      
      expect(decrypt(v2, testSecret)).toBe(testPlaintext)
    })
  })

  describe('edge cases and security', () => {
    it('handles null bytes in plaintext', () => {
      const textWithNull = 'before\0after'
      const encrypted = encrypt(textWithNull, testSecret)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(textWithNull)
    })

    it('handles binary-like content', () => {
      const binaryLike = String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))
      const encrypted = encrypt(binaryLike, testSecret)
      const decrypted = decrypt(encrypted, testSecret)
      expect(decrypted).toBe(binaryLike)
    })

    it('ciphertext is longer than plaintext', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      expect(encrypted.length).toBeGreaterThan(testPlaintext.length)
    })

    it('different plaintexts produce different ciphertexts', () => {
      const salt = Buffer.alloc(32, 'a')
      const encrypted1 = encrypt('plaintext1', testSecret)
      const encrypted2 = encrypt('plaintext2', testSecret)
      expect(encrypted1).not.toBe(encrypted2)
    })

    it('auth tag prevents bit flipping attacks', () => {
      const encrypted = encrypt(testPlaintext, testSecret)
      const parts = encrypted.split(':')
      
      const ciphertextBuffer = Buffer.from(parts[6], 'base64')
      ciphertextBuffer[0] ^= 0x01
      parts[6] = ciphertextBuffer.toString('base64')
      
      const tampered = parts.join(':')
      expect(() => decrypt(tampered, testSecret)).toThrow()
    })
  })
})
