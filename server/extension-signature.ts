import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from './logger'

const logger = createLogger('extension-signature')

const SIGNATURE_FILENAME = 'extension.sig'
const MANIFEST_FILENAME = 'manifest.json'

export interface SignatureData {
  algorithm: 'ed25519'
  publicKey: string
  signature: string
  timestamp: number
  files: FileHash[]
}

export interface FileHash {
  path: string
  hash: string
}

export interface VerificationResult {
  valid: boolean
  error?: string
  signedAt?: number
  signedBy?: string
}

export interface ExtensionSignatureConfig {
  requireSignatures: boolean
  trustedPublicKeys: string[]
  allowUnsignedInDevelopment: boolean
}

const DEFAULT_CONFIG: ExtensionSignatureConfig = {
  requireSignatures: process.env.NODE_ENV === 'production',
  trustedPublicKeys: [],
  allowUnsignedInDevelopment: process.env.NODE_ENV !== 'production',
}

let signatureConfig: ExtensionSignatureConfig = { ...DEFAULT_CONFIG }

export function configureSignatureVerification(config: Partial<ExtensionSignatureConfig>): void {
  signatureConfig = { ...signatureConfig, ...config }
  logger.info('Signature verification configured', {
    requireSignatures: signatureConfig.requireSignatures,
    trustedKeyCount: signatureConfig.trustedPublicKeys.length,
    allowUnsignedInDev: signatureConfig.allowUnsignedInDevelopment,
  })
}

export function getSignatureConfig(): ExtensionSignatureConfig {
  return { ...signatureConfig }
}

export function addTrustedPublicKey(publicKey: string): void {
  if (!signatureConfig.trustedPublicKeys.includes(publicKey)) {
    signatureConfig.trustedPublicKeys.push(publicKey)
    logger.info('Added trusted public key', { keyPrefix: publicKey.slice(0, 16) + '...' })
  }
}

export function removeTrustedPublicKey(publicKey: string): boolean {
  const index = signatureConfig.trustedPublicKeys.indexOf(publicKey)
  if (index >= 0) {
    signatureConfig.trustedPublicKeys.splice(index, 1)
    logger.info('Removed trusted public key', { keyPrefix: publicKey.slice(0, 16) + '...' })
    return true
  }
  return false
}

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  
  logger.info('Generated new Ed25519 key pair')
  return { publicKey, privateKey }
}

async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function getExtensionFiles(extensionPath: string): Promise<string[]> {
  const files: string[] = []
  
  async function walkDir(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(extensionPath, fullPath)
      
      if (entry.name === SIGNATURE_FILENAME) continue
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      
      if (entry.isDirectory()) {
        await walkDir(fullPath)
      } else {
        files.push(relativePath)
      }
    }
  }
  
  await walkDir(extensionPath)
  return files.sort()
}

async function computeExtensionHash(extensionPath: string): Promise<FileHash[]> {
  const files = await getExtensionFiles(extensionPath)
  const hashes: FileHash[] = []
  
  for (const file of files) {
    const filePath = path.join(extensionPath, file)
    const hash = await hashFile(filePath)
    hashes.push({ path: file.replace(/\\/g, '/'), hash })
  }
  
  return hashes
}

function createSignaturePayload(files: FileHash[], timestamp: number): string {
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))
  return JSON.stringify({ files: sortedFiles, timestamp })
}

export async function signExtension(
  extensionPath: string,
  privateKey: string
): Promise<SignatureData> {
  logger.info('Signing extension', { path: extensionPath })
  
  const manifestPath = path.join(extensionPath, MANIFEST_FILENAME)
  try {
    await fs.access(manifestPath)
  } catch {
    throw new Error(`Extension manifest not found at ${manifestPath}`)
  }
  
  const files = await computeExtensionHash(extensionPath)
  const timestamp = Date.now()
  const payload = createSignaturePayload(files, timestamp)
  
  const privateKeyObj = crypto.createPrivateKey(privateKey)
  const signature = crypto.sign(null, Buffer.from(payload), privateKeyObj)
  
  const publicKeyObj = crypto.createPublicKey(privateKeyObj)
  const publicKeyPem = publicKeyObj.export({ type: 'spki', format: 'pem' }) as string
  
  const signatureData: SignatureData = {
    algorithm: 'ed25519',
    publicKey: publicKeyPem,
    signature: signature.toString('base64'),
    timestamp,
    files,
  }
  
  const signaturePath = path.join(extensionPath, SIGNATURE_FILENAME)
  await fs.writeFile(signaturePath, JSON.stringify(signatureData, null, 2))
  
  logger.info('Extension signed successfully', {
    path: extensionPath,
    fileCount: files.length,
    timestamp,
  })
  
  return signatureData
}

export async function verifyExtension(
  extensionPath: string,
  trustedKeys?: string[]
): Promise<VerificationResult> {
  const keysToTrust = trustedKeys ?? signatureConfig.trustedPublicKeys
  
  logger.debug('Verifying extension signature', { path: extensionPath })
  
  const signaturePath = path.join(extensionPath, SIGNATURE_FILENAME)
  
  let signatureData: SignatureData
  try {
    const content = await fs.readFile(signaturePath, 'utf-8')
    signatureData = JSON.parse(content) as SignatureData
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (signatureConfig.allowUnsignedInDevelopment && process.env.NODE_ENV !== 'production') {
        logger.warn('Extension is unsigned, allowing in development mode', { path: extensionPath })
        return { valid: true, error: 'Unsigned extension (allowed in development)' }
      }
      return { valid: false, error: 'Extension signature file not found' }
    }
    return { valid: false, error: `Failed to read signature file: ${(err as Error).message}` }
  }
  
  if (signatureData.algorithm !== 'ed25519') {
    return { valid: false, error: `Unsupported signature algorithm: ${signatureData.algorithm}` }
  }
  
  if (keysToTrust.length > 0) {
    const normalizedSignerKey = signatureData.publicKey.trim()
    const isTrusted = keysToTrust.some(key => key.trim() === normalizedSignerKey)
    
    if (!isTrusted) {
      return { valid: false, error: 'Extension signed by untrusted key' }
    }
  }
  
  const currentFiles = await computeExtensionHash(extensionPath)
  
  const signedFileMap = new Map(signatureData.files.map(f => [f.path, f.hash]))
  const currentFileMap = new Map(currentFiles.map(f => [f.path, f.hash]))
  
  for (const [filePath, hash] of currentFileMap) {
    const signedHash = signedFileMap.get(filePath)
    if (!signedHash) {
      return { valid: false, error: `New file detected after signing: ${filePath}` }
    }
    if (signedHash !== hash) {
      return { valid: false, error: `File modified after signing: ${filePath}` }
    }
  }
  
  for (const [filePath] of signedFileMap) {
    if (!currentFileMap.has(filePath)) {
      return { valid: false, error: `Signed file missing: ${filePath}` }
    }
  }
  
  const payload = createSignaturePayload(signatureData.files, signatureData.timestamp)
  
  try {
    const publicKeyObj = crypto.createPublicKey(signatureData.publicKey)
    const signatureBuffer = Buffer.from(signatureData.signature, 'base64')
    
    const isValid = crypto.verify(null, Buffer.from(payload), publicKeyObj, signatureBuffer)
    
    if (!isValid) {
      return { valid: false, error: 'Signature verification failed' }
    }
  } catch (err) {
    return { valid: false, error: `Signature verification error: ${(err as Error).message}` }
  }
  
  logger.info('Extension signature verified', {
    path: extensionPath,
    signedAt: signatureData.timestamp,
  })
  
  return {
    valid: true,
    signedAt: signatureData.timestamp,
    signedBy: signatureData.publicKey.slice(0, 50) + '...',
  }
}

export async function isExtensionSigned(extensionPath: string): Promise<boolean> {
  const signaturePath = path.join(extensionPath, SIGNATURE_FILENAME)
  try {
    await fs.access(signaturePath)
    return true
  } catch {
    return false
  }
}

export async function getExtensionSignatureInfo(extensionPath: string): Promise<SignatureData | null> {
  const signaturePath = path.join(extensionPath, SIGNATURE_FILENAME)
  try {
    const content = await fs.readFile(signaturePath, 'utf-8')
    return JSON.parse(content) as SignatureData
  } catch {
    return null
  }
}

export function initSignatureVerificationFromEnv(): void {
  const trustedKeysEnv = process.env.EXTENSION_TRUSTED_PUBLIC_KEYS
  if (trustedKeysEnv) {
    const keys = trustedKeysEnv.split(',').map(k => k.trim()).filter(Boolean)
    for (const key of keys) {
      addTrustedPublicKey(key)
    }
  }
  
  const requireSignatures = process.env.EXTENSION_REQUIRE_SIGNATURES
  if (requireSignatures !== undefined) {
    signatureConfig.requireSignatures = requireSignatures === 'true'
  }
  
  const allowUnsigned = process.env.EXTENSION_ALLOW_UNSIGNED_DEV
  if (allowUnsigned !== undefined) {
    signatureConfig.allowUnsignedInDevelopment = allowUnsigned === 'true'
  }
  
  logger.info('Signature verification initialized from environment', {
    requireSignatures: signatureConfig.requireSignatures,
    trustedKeyCount: signatureConfig.trustedPublicKeys.length,
    allowUnsignedInDev: signatureConfig.allowUnsignedInDevelopment,
  })
}
