import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { createLogger } from './logger'
import {
  verifyExtension,
  getSignatureConfig,
  initSignatureVerificationFromEnv,
  type VerificationResult,
} from './extension-signature'

export {
  signExtension,
  verifyExtension,
  generateKeyPair,
  configureSignatureVerification,
  getSignatureConfig,
  addTrustedPublicKey,
  removeTrustedPublicKey,
  isExtensionSigned,
  getExtensionSignatureInfo,
  type SignatureData,
  type VerificationResult,
  type ExtensionSignatureConfig,
} from './extension-signature'
import type {
  Extension,
  ExtensionManifest,
  ExtensionConfig,
  ExtensionAPI,
  ExtensionContext,
  ExtensionModule,
  ExtensionActivationStatus,
  ThemeDefinition,
} from '@/lib/extensions'
import { ExtensionManifestSchema, ExtensionCategory } from '@/lib/extensions'

const logger = createLogger('extension-manager')

const EXTENSIONS_DIR = path.join(process.cwd(), 'extensions')

const ACTIVATION_TIMEOUT_MS = 10000

/* ── Capability-Based Security System ─────────────────────────────── */

export type ExtensionCapability = 'filesystem' | 'network' | 'commands' | 'themes' | 'notifications' | 'storage'

export interface ExtensionPermissions {
  capabilities: ExtensionCapability[]
  allowedPaths?: string[]
  allowedHosts?: string[]
  maxStorageBytes?: number
  maxCpuTimeMs?: number
  maxMemoryBytes?: number
}

export interface SandboxConfig {
  enabled: boolean
  permissions: ExtensionPermissions
  auditLog: boolean
}

export interface AuditLogEntry {
  timestamp: number
  extensionId: string
  action: string
  capability: ExtensionCapability
  details: Record<string, unknown>
  allowed: boolean
  reason?: string
}

const DEFAULT_PERMISSIONS: ExtensionPermissions = {
  capabilities: ['themes', 'notifications', 'storage'],
  maxStorageBytes: 5 * 1024 * 1024,
  maxCpuTimeMs: 5000,
  maxMemoryBytes: 50 * 1024 * 1024,
}

const extensionPermissions = new Map<string, ExtensionPermissions>()
const auditLog: AuditLogEntry[] = []
const MAX_AUDIT_LOG_SIZE = 1000

const extensionResourceUsage = new Map<string, {
  storageBytes: number
  cpuTimeMs: number
  apiCallCount: number
  lastApiCall: number
}>()

function logAuditEntry(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  const fullEntry: AuditLogEntry = {
    ...entry,
    timestamp: Date.now(),
  }
  
  auditLog.push(fullEntry)
  
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_LOG_SIZE)
  }
  
  if (!entry.allowed) {
    logger.warn(`Extension ${entry.extensionId} blocked: ${entry.action}`, {
      capability: entry.capability,
      reason: entry.reason,
    })
  } else if (process.env.NODE_ENV === 'development') {
    logger.debug(`Extension ${entry.extensionId}: ${entry.action}`, {
      capability: entry.capability,
    })
  }
}

function checkCapability(
  extensionId: string,
  capability: ExtensionCapability,
  action: string,
  details: Record<string, unknown> = {}
): boolean {
  const permissions = extensionPermissions.get(extensionId) ?? DEFAULT_PERMISSIONS
  const allowed = permissions.capabilities.includes(capability)
  
  logAuditEntry({
    extensionId,
    action,
    capability,
    details,
    allowed,
    reason: allowed ? undefined : `Missing capability: ${capability}`,
  })
  
  return allowed
}

function checkPathAccess(extensionId: string, targetPath: string): boolean {
  const permissions = extensionPermissions.get(extensionId) ?? DEFAULT_PERMISSIONS
  
  if (!permissions.capabilities.includes('filesystem')) {
    logAuditEntry({
      extensionId,
      action: 'filesystem_access',
      capability: 'filesystem',
      details: { path: targetPath },
      allowed: false,
      reason: 'Missing filesystem capability',
    })
    return false
  }
  
  const allowedPaths = permissions.allowedPaths ?? [EXTENSIONS_DIR]
  const normalizedTarget = path.normalize(targetPath)
  
  const allowed = allowedPaths.some(allowedPath => {
    const normalizedAllowed = path.normalize(allowedPath)
    return normalizedTarget.startsWith(normalizedAllowed)
  })
  
  logAuditEntry({
    extensionId,
    action: 'filesystem_access',
    capability: 'filesystem',
    details: { path: targetPath, allowedPaths },
    allowed,
    reason: allowed ? undefined : 'Path not in allowed list',
  })
  
  return allowed
}

function trackResourceUsage(extensionId: string, type: 'storage' | 'cpu' | 'api', amount: number): boolean {
  let usage = extensionResourceUsage.get(extensionId)
  if (!usage) {
    usage = { storageBytes: 0, cpuTimeMs: 0, apiCallCount: 0, lastApiCall: 0 }
    extensionResourceUsage.set(extensionId, usage)
  }
  
  const permissions = extensionPermissions.get(extensionId) ?? DEFAULT_PERMISSIONS
  
  switch (type) {
    case 'storage': {
      const newTotal = usage.storageBytes + amount
      const maxBytes = permissions.maxStorageBytes ?? DEFAULT_PERMISSIONS.maxStorageBytes!
      if (newTotal > maxBytes) {
        logAuditEntry({
          extensionId,
          action: 'storage_limit_exceeded',
          capability: 'storage',
          details: { current: usage.storageBytes, requested: amount, max: maxBytes },
          allowed: false,
          reason: `Storage limit exceeded: ${newTotal} > ${maxBytes}`,
        })
        return false
      }
      usage.storageBytes = newTotal
      break
    }
    case 'cpu': {
      const maxCpu = permissions.maxCpuTimeMs ?? DEFAULT_PERMISSIONS.maxCpuTimeMs!
      if (usage.cpuTimeMs + amount > maxCpu) {
        logAuditEntry({
          extensionId,
          action: 'cpu_limit_exceeded',
          capability: 'commands',
          details: { current: usage.cpuTimeMs, requested: amount, max: maxCpu },
          allowed: false,
          reason: `CPU time limit exceeded`,
        })
        return false
      }
      usage.cpuTimeMs += amount
      break
    }
    case 'api': {
      usage.apiCallCount += amount
      usage.lastApiCall = Date.now()
      break
    }
  }
  
  return true
}

/* ── Extension Store Types ────────────────────────────────────────── */

interface ExtensionStore {
  extensions: Extension[]
  configs: ExtensionConfig[]
}

interface ActivatedExtension {
  id: string
  status: ExtensionActivationStatus
  module: ExtensionModule | null
  context: ExtensionContext | null
  error?: string
  activatedAt?: number
  sandboxConfig?: SandboxConfig
}

let extensionStore: ExtensionStore = {
  extensions: [],
  configs: [],
}

const activatedExtensions = new Map<string, ActivatedExtension>()
const registeredCommands = new Map<string, () => void | Promise<void>>()
const registeredThemes = new Map<string, ThemeDefinition>()
const extensionStorage = new Map<string, Map<string, unknown>>()
const notificationListeners: Array<(type: string, message: string) => void> = []

export function addNotificationListener(
  listener: (type: string, message: string) => void
): () => void {
  notificationListeners.push(listener)
  return () => {
    const idx = notificationListeners.indexOf(listener)
    if (idx >= 0) notificationListeners.splice(idx, 1)
  }
}

function emitNotification(type: string, message: string): void {
  for (const listener of notificationListeners) {
    try {
      listener(type, message)
    } catch {
      // Ignore listener errors
    }
  }
}

function createSandboxedExtensionAPI(
  extensionId: string,
  extensionPath: string,
  sandboxConfig: SandboxConfig
): ExtensionAPI {
  const storageKey = `ext:${extensionId}`
  if (!extensionStorage.has(storageKey)) {
    extensionStorage.set(storageKey, new Map())
  }
  const storage = extensionStorage.get(storageKey)!

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapWithPermissionCheck = <T extends (...args: any[]) => any>(
    capability: ExtensionCapability,
    action: string,
    fn: T
  ): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((...args: any[]) => {
      trackResourceUsage(extensionId, 'api', 1)
      
      if (!checkCapability(extensionId, capability, action, { args })) {
        throw new Error(`Permission denied: ${capability} capability required for ${action}`)
      }
      return fn(...args)
    }) as T
  }

  return {
    commands: {
      registerCommand: wrapWithPermissionCheck(
        'commands',
        'registerCommand',
        (id: string, handler: () => void | Promise<void>): void => {
          const fullId = `${extensionId}.${id}`
          registeredCommands.set(fullId, handler)
          logger.info(`Extension ${extensionId} registered command: ${fullId}`)
        }
      ),
      executeCommand: wrapWithPermissionCheck(
        'commands',
        'executeCommand',
        async (id: string): Promise<void> => {
          const handler = registeredCommands.get(id)
          if (!handler) {
            throw new Error(`Command not found: ${id}`)
          }
          const startTime = Date.now()
          await handler()
          trackResourceUsage(extensionId, 'cpu', Date.now() - startTime)
        }
      ),
      getCommands(): string[] {
        trackResourceUsage(extensionId, 'api', 1)
        return Array.from(registeredCommands.keys()).filter((cmd) =>
          cmd.startsWith(`${extensionId}.`)
        )
      },
    },
    themes: {
      registerTheme: wrapWithPermissionCheck(
        'themes',
        'registerTheme',
        (id: string, theme: ThemeDefinition): void => {
          const fullId = `${extensionId}.${id}`
          registeredThemes.set(fullId, theme)
          logger.info(`Extension ${extensionId} registered theme: ${fullId}`)
        }
      ),
      getThemes(): Map<string, ThemeDefinition> {
        trackResourceUsage(extensionId, 'api', 1)
        const extThemes = new Map<string, ThemeDefinition>()
        for (const [id, theme] of registeredThemes) {
          if (id.startsWith(`${extensionId}.`)) {
            extThemes.set(id, theme)
          }
        }
        return extThemes
      },
    },
    notifications: {
      showInfo: wrapWithPermissionCheck(
        'notifications',
        'showInfo',
        (message: string): void => {
          logger.info(`[${extensionId}] INFO: ${message}`)
          emitNotification('info', message)
        }
      ),
      showError: wrapWithPermissionCheck(
        'notifications',
        'showError',
        (message: string): void => {
          logger.error(`[${extensionId}] ERROR: ${message}`)
          emitNotification('error', message)
        }
      ),
      showWarning: wrapWithPermissionCheck(
        'notifications',
        'showWarning',
        (message: string): void => {
          logger.warn(`[${extensionId}] WARNING: ${message}`)
          emitNotification('warning', message)
        }
      ),
      showSuccess: wrapWithPermissionCheck(
        'notifications',
        'showSuccess',
        (message: string): void => {
          logger.info(`[${extensionId}] SUCCESS: ${message}`)
          emitNotification('success', message)
        }
      ),
    },
    workspace: {
      async openFile(_path: string): Promise<void> {
        trackResourceUsage(extensionId, 'api', 1)
        if (!checkPathAccess(extensionId, _path)) {
          throw new Error(`Permission denied: Cannot access path ${_path}`)
        }
        logger.info(`[${extensionId}] Request to open file: ${_path}`)
      },
      getOpenFiles(): string[] {
        trackResourceUsage(extensionId, 'api', 1)
        return []
      },
      getWorkspacePath(): string {
        trackResourceUsage(extensionId, 'api', 1)
        return process.cwd()
      },
    },
    storage: {
      get<T>(key: string): T | undefined {
        trackResourceUsage(extensionId, 'api', 1)
        if (!checkCapability(extensionId, 'storage', 'storage.get', { key })) {
          throw new Error('Permission denied: storage capability required')
        }
        return storage.get(key) as T | undefined
      },
      set<T>(key: string, value: T): void {
        trackResourceUsage(extensionId, 'api', 1)
        if (!checkCapability(extensionId, 'storage', 'storage.set', { key })) {
          throw new Error('Permission denied: storage capability required')
        }
        const valueSize = JSON.stringify(value).length
        if (!trackResourceUsage(extensionId, 'storage', valueSize)) {
          throw new Error('Storage limit exceeded')
        }
        storage.set(key, value)
      },
      delete(key: string): void {
        trackResourceUsage(extensionId, 'api', 1)
        if (!checkCapability(extensionId, 'storage', 'storage.delete', { key })) {
          throw new Error('Permission denied: storage capability required')
        }
        storage.delete(key)
      },
    },
    extensionPath,
  }
}

function createExtensionAPI(extensionId: string, extensionPath: string): ExtensionAPI {
  const defaultSandboxConfig: SandboxConfig = {
    enabled: true,
    permissions: DEFAULT_PERMISSIONS,
    auditLog: true,
  }
  return createSandboxedExtensionAPI(extensionId, extensionPath, defaultSandboxConfig)
}

function createExtensionContext(
  extensionId: string,
  extensionPath: string,
  api: ExtensionAPI
): ExtensionContext {
  return {
    extensionId,
    extensionPath,
    api,
    subscriptions: [],
  }
}

export async function initExtensionManager(): Promise<void> {
  logger.info('Initializing extension manager')
  
  initSignatureVerificationFromEnv()
  
  try {
    await fs.mkdir(EXTENSIONS_DIR, { recursive: true })
  } catch {
    // Directory may already exist
  }
  
  await loadExtensions()
}

export async function loadExtensions(): Promise<Extension[]> {
  logger.info('Loading extensions from disk')
  
  const extensions: Extension[] = []
  const signatureConfig = getSignatureConfig()
  
  try {
    const entries = await fs.readdir(EXTENSIONS_DIR, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      
      const extPath = path.join(EXTENSIONS_DIR, entry.name)
      const manifestPath = path.join(extPath, 'manifest.json')
      
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8')
        const manifestData = JSON.parse(manifestContent)
        const parseResult = ExtensionManifestSchema.safeParse(manifestData)
        
        if (!parseResult.success) {
          logger.warn(`Invalid manifest in ${entry.name}: ${parseResult.error.message}`)
          continue
        }
        
        const manifest = parseResult.data
        
        const verificationResult = await verifyExtension(extPath)
        if (!verificationResult.valid && signatureConfig.requireSignatures) {
          logger.warn(`Extension ${manifest.name} failed signature verification: ${verificationResult.error}`)
          continue
        }
        
        if (!verificationResult.valid && verificationResult.error !== 'Unsigned extension (allowed in development)') {
          logger.warn(`Extension ${manifest.name} signature issue: ${verificationResult.error}`)
        }
        
        const existingExt = extensionStore.extensions.find(e => e.id === manifest.id)
        
        const extension: Extension = {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          enabled: existingExt?.enabled ?? true,
          installed: true,
          category: manifest.category ?? 'tool',
          config: existingExt?.config,
          installedAt: existingExt?.installedAt ?? Date.now(),
          updatedAt: Date.now(),
          path: extPath,
          manifest,
          signatureVerified: verificationResult.valid && !verificationResult.error?.includes('Unsigned'),
          signedAt: verificationResult.signedAt,
        }
        
        extensions.push(extension)
        logger.info(`Loaded extension: ${manifest.name} v${manifest.version}`, {
          signatureVerified: extension.signatureVerified,
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logger.warn(`Failed to load extension from ${entry.name}: ${errMsg}`)
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error(`Failed to read extensions directory: ${errMsg}`)
  }
  
  extensionStore.extensions = extensions
  return extensions
}

export async function getExtensions(): Promise<Extension[]> {
  if (extensionStore.extensions.length === 0) {
    await loadExtensions()
  }
  return extensionStore.extensions
}

export async function getExtension(id: string): Promise<Extension | undefined> {
  const extensions = await getExtensions()
  return extensions.find(e => e.id === id)
}

export async function enableExtension(id: string): Promise<Extension | null> {
  const extension = await getExtension(id)
  if (!extension) return null
  
  extension.enabled = true
  extension.updatedAt = Date.now()
  
  logger.info(`Enabled extension: ${extension.name}`)
  return extension
}

export async function disableExtension(id: string): Promise<Extension | null> {
  const extension = await getExtension(id)
  if (!extension) return null
  
  extension.enabled = false
  extension.updatedAt = Date.now()
  
  logger.info(`Disabled extension: ${extension.name}`)
  return extension
}

export async function installExtensionFromPath(sourcePath: string): Promise<Extension> {
  logger.info(`Installing extension from path: ${sourcePath}`)
  
  const manifestPath = path.join(sourcePath, 'manifest.json')
  const manifestContent = await fs.readFile(manifestPath, 'utf-8')
  const manifestData = JSON.parse(manifestContent)
  const parseResult = ExtensionManifestSchema.safeParse(manifestData)
  
  if (!parseResult.success) {
    throw new Error(`Invalid manifest: ${parseResult.error.message}`)
  }
  
  const manifest = parseResult.data
  
  const signatureConfig = getSignatureConfig()
  const verificationResult = await verifyExtension(sourcePath)
  
  if (!verificationResult.valid && signatureConfig.requireSignatures) {
    throw new Error(`Extension signature verification failed: ${verificationResult.error}`)
  }
  
  const targetPath = path.join(EXTENSIONS_DIR, manifest.id)
  
  const existing = await getExtension(manifest.id)
  if (existing) {
    throw new Error(`Extension ${manifest.id} is already installed`)
  }
  
  await copyDirectory(sourcePath, targetPath)
  
  const extension: Extension = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    enabled: true,
    installed: true,
    category: manifest.category ?? 'tool',
    installedAt: Date.now(),
    updatedAt: Date.now(),
    path: targetPath,
    manifest,
    signatureVerified: verificationResult.valid && !verificationResult.error?.includes('Unsigned'),
    signedAt: verificationResult.signedAt,
  }
  
  extensionStore.extensions.push(extension)
  logger.info(`Installed extension: ${manifest.name} v${manifest.version}`, {
    signatureVerified: extension.signatureVerified,
  })
  
  return extension
}

export async function installExtensionFromUrl(url: string): Promise<Extension> {
  logger.info(`Installing extension from URL: ${url}`)
  
  const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
  if (!githubMatch) {
    throw new Error('Only GitHub URLs are supported')
  }
  
  const [, owner, repo] = githubMatch
  const repoName = repo.replace(/\.git$/, '')
  
  const tempDir = path.join(tmpdir(), `ext-${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  
  try {
    logger.info(`Cloning repository ${owner}/${repoName} to ${tempDir}`)
    execSync(`git clone --depth 1 "${url}" "${tempDir}"`, { stdio: 'pipe' })
    
    const manifestPath = path.join(tempDir, 'manifest.json')
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    const manifestData = JSON.parse(manifestContent)
    
    const parseResult = ExtensionManifestSchema.safeParse(manifestData)
    if (!parseResult.success) {
      throw new Error(`Invalid manifest: ${parseResult.error.message}`)
    }
    
    const manifest = parseResult.data
    
    const signatureConfig = getSignatureConfig()
    const verificationResult = await verifyExtension(tempDir)
    
    if (!verificationResult.valid && signatureConfig.requireSignatures) {
      throw new Error(`Extension signature verification failed: ${verificationResult.error}`)
    }
    
    const existing = await getExtension(manifest.id)
    if (existing) {
      throw new Error(`Extension ${manifest.id} is already installed`)
    }
    
    const extDir = path.join(EXTENSIONS_DIR, manifest.id)
    await fs.mkdir(extDir, { recursive: true })
    
    const files = await fs.readdir(tempDir)
    for (const file of files) {
      if (file === '.git') continue
      const src = path.join(tempDir, file)
      const dest = path.join(extDir, file)
      await fs.cp(src, dest, { recursive: true })
    }
    
    const extension: Extension = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author || owner,
      enabled: true,
      installed: true,
      category: manifest.category ?? 'tool',
      installedAt: Date.now(),
      updatedAt: Date.now(),
      path: extDir,
      sourceUrl: url,
      manifest,
      signatureVerified: verificationResult.valid && !verificationResult.error?.includes('Unsigned'),
      signedAt: verificationResult.signedAt,
    }
    
    extensionStore.extensions.push(extension)
    logger.info(`Installed extension from URL: ${manifest.name} v${manifest.version}`, {
      signatureVerified: extension.signatureVerified,
    })
    
    return extension
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (cleanupErr) {
      logger.warn(`Failed to cleanup temp directory: ${cleanupErr}`)
    }
  }
}

export async function uninstallExtension(id: string): Promise<boolean> {
  const extension = await getExtension(id)
  if (!extension) {
    logger.warn(`Extension not found: ${id}`)
    return false
  }
  
  if (!extension.path) {
    logger.warn(`Extension has no path: ${id}`)
    return false
  }
  
  try {
    await fs.rm(extension.path, { recursive: true, force: true })
    extensionStore.extensions = extensionStore.extensions.filter(e => e.id !== id)
    logger.info(`Uninstalled extension: ${extension.name}`)
    return true
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error(`Failed to uninstall extension ${id}: ${errMsg}`)
    return false
  }
}

export async function getExtensionConfig(id: string): Promise<Record<string, unknown> | undefined> {
  const config = extensionStore.configs.find(c => c.extensionId === id)
  return config?.config
}

export async function setExtensionConfig(
  id: string,
  config: Record<string, unknown>
): Promise<Extension | null> {
  const extension = await getExtension(id)
  if (!extension) return null
  
  extension.config = config
  extension.updatedAt = Date.now()
  
  const existingConfig = extensionStore.configs.find(c => c.extensionId === id)
  if (existingConfig) {
    existingConfig.config = config
  } else {
    extensionStore.configs.push({ extensionId: id, config })
  }
  
  logger.info(`Updated config for extension: ${extension.name}`)
  return extension
}

export async function getExtensionsByCategory(
  category: typeof ExtensionCategory._type
): Promise<Extension[]> {
  const extensions = await getExtensions()
  return extensions.filter(e => e.category === category)
}

export async function getEnabledExtensions(): Promise<Extension[]> {
  const extensions = await getExtensions()
  return extensions.filter(e => e.enabled)
}

export function getExtensionsDirectory(): string {
  return EXTENSIONS_DIR
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

/* ── Extension Activation ──────────────────────────────────────────── */

export async function activateExtension(
  extensionId: string
): Promise<{ success: boolean; error?: string }> {
  const extension = await getExtension(extensionId)
  if (!extension) {
    return { success: false, error: 'Extension not found' }
  }

  if (!extension.enabled) {
    return { success: false, error: 'Extension is disabled' }
  }

  const existing = activatedExtensions.get(extensionId)
  if (existing?.status === 'active') {
    return { success: true }
  }

  if (extension.path) {
    const signatureConfig = getSignatureConfig()
    const verificationResult = await verifyExtension(extension.path)
    
    if (!verificationResult.valid && signatureConfig.requireSignatures) {
      logger.error(`Cannot activate extension ${extension.name}: signature verification failed`, {
        error: verificationResult.error,
      })
      return { success: false, error: `Signature verification failed: ${verificationResult.error}` }
    }
  }

  activatedExtensions.set(extensionId, {
    id: extensionId,
    status: 'activating',
    module: null,
    context: null,
  })

  logger.info(`Activating extension: ${extension.name}`)

  try {
    if (!extension.path || !extension.manifest?.main) {
      throw new Error('Extension has no main entry point')
    }

    const mainPath = path.join(extension.path, extension.manifest.main)

    try {
      await fs.access(mainPath)
    } catch {
      throw new Error(`Main entry point not found: ${mainPath}`)
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Extension activation timed out after ${ACTIVATION_TIMEOUT_MS}ms`))
      }, ACTIVATION_TIMEOUT_MS)
    })

    const activationPromise = (async () => {
      const moduleUrl = `file://${mainPath.replace(/\\/g, '/')}`
      const extensionModule = (await import(moduleUrl)) as ExtensionModule

      if (typeof extensionModule.activate !== 'function') {
        throw new Error('Extension does not export an activate function')
      }

      const api = createExtensionAPI(extensionId, extension.path!)
      const context = createExtensionContext(extensionId, extension.path!, api)

      await extensionModule.activate(context)

      return { module: extensionModule, context }
    })()

    const result = await Promise.race([activationPromise, timeoutPromise])

    activatedExtensions.set(extensionId, {
      id: extensionId,
      status: 'active',
      module: result.module,
      context: result.context,
      activatedAt: Date.now(),
    })

    logger.info(`Extension activated: ${extension.name}`)
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(`Failed to activate extension ${extension.name}: ${errorMessage}`)

    activatedExtensions.set(extensionId, {
      id: extensionId,
      status: 'error',
      module: null,
      context: null,
      error: errorMessage,
    })

    return { success: false, error: errorMessage }
  }
}

export async function deactivateExtension(
  extensionId: string
): Promise<{ success: boolean; error?: string }> {
  const activated = activatedExtensions.get(extensionId)
  if (!activated || activated.status !== 'active') {
    return { success: true }
  }

  const extension = await getExtension(extensionId)
  logger.info(`Deactivating extension: ${extension?.name ?? extensionId}`)

  try {
    if (activated.module?.deactivate) {
      await Promise.race([
        activated.module.deactivate(),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ])
    }

    if (activated.context?.subscriptions) {
      for (const sub of activated.context.subscriptions) {
        try {
          sub.dispose()
        } catch {
          // Ignore disposal errors
        }
      }
    }

    for (const [cmdId] of registeredCommands) {
      if (cmdId.startsWith(`${extensionId}.`)) {
        registeredCommands.delete(cmdId)
      }
    }

    for (const [themeId] of registeredThemes) {
      if (themeId.startsWith(`${extensionId}.`)) {
        registeredThemes.delete(themeId)
      }
    }

    activatedExtensions.set(extensionId, {
      id: extensionId,
      status: 'inactive',
      module: null,
      context: null,
    })

    logger.info(`Extension deactivated: ${extension?.name ?? extensionId}`)
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(`Failed to deactivate extension ${extensionId}: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

export function getExtensionActivationStatus(
  extensionId: string
): ExtensionActivationStatus {
  const activated = activatedExtensions.get(extensionId)
  return activated?.status ?? 'inactive'
}

export function getExtensionActivationError(extensionId: string): string | undefined {
  return activatedExtensions.get(extensionId)?.error
}

export async function activateAllEnabledExtensions(): Promise<void> {
  logger.info('Auto-activating enabled extensions')
  const extensions = await getEnabledExtensions()

  for (const ext of extensions) {
    const result = await activateExtension(ext.id)
    if (!result.success) {
      logger.warn(`Failed to auto-activate ${ext.name}: ${result.error}`)
    }
  }
}

export async function deactivateAllExtensions(): Promise<void> {
  logger.info('Deactivating all extensions')
  for (const [extensionId] of activatedExtensions) {
    await deactivateExtension(extensionId)
  }
}

/* ── Extension API Access ──────────────────────────────────────────── */

export function getRegisteredCommands(): Map<string, () => void | Promise<void>> {
  return new Map(registeredCommands)
}

export function getRegisteredThemes(): Map<string, ThemeDefinition> {
  return new Map(registeredThemes)
}

export async function executeCommand(commandId: string): Promise<void> {
  const handler = registeredCommands.get(commandId)
  if (!handler) {
    throw new Error(`Command not found: ${commandId}`)
  }
  await handler()
}

export function getAllActivationStatuses(): Map<string, ActivatedExtension> {
  return new Map(activatedExtensions)
}

/* ── Sandbox & Permission Management ──────────────────────────────── */

/**
 * Set permissions for an extension
 */
export function setExtensionPermissions(
  extensionId: string,
  permissions: ExtensionPermissions
): void {
  extensionPermissions.set(extensionId, permissions)
  logger.info(`Updated permissions for extension ${extensionId}`, {
    capabilities: permissions.capabilities,
  })
}

/**
 * Get permissions for an extension
 */
export function getExtensionPermissions(extensionId: string): ExtensionPermissions {
  return extensionPermissions.get(extensionId) ?? DEFAULT_PERMISSIONS
}

/**
 * Grant a capability to an extension
 */
export function grantCapability(
  extensionId: string,
  capability: ExtensionCapability
): void {
  const current = extensionPermissions.get(extensionId) ?? { ...DEFAULT_PERMISSIONS }
  if (!current.capabilities.includes(capability)) {
    current.capabilities.push(capability)
    extensionPermissions.set(extensionId, current)
    logger.info(`Granted ${capability} capability to extension ${extensionId}`)
  }
}

/**
 * Revoke a capability from an extension
 */
export function revokeCapability(
  extensionId: string,
  capability: ExtensionCapability
): void {
  const current = extensionPermissions.get(extensionId)
  if (current) {
    current.capabilities = current.capabilities.filter(c => c !== capability)
    extensionPermissions.set(extensionId, current)
    logger.info(`Revoked ${capability} capability from extension ${extensionId}`)
  }
}

/**
 * Get audit log entries for an extension (or all if no extensionId provided)
 */
export function getAuditLog(
  extensionId?: string,
  options: { limit?: number; since?: number; capability?: ExtensionCapability } = {}
): AuditLogEntry[] {
  let entries = [...auditLog]
  
  if (extensionId) {
    entries = entries.filter(e => e.extensionId === extensionId)
  }
  
  if (options.since) {
    entries = entries.filter(e => e.timestamp >= options.since!)
  }
  
  if (options.capability) {
    entries = entries.filter(e => e.capability === options.capability)
  }
  
  entries.sort((a, b) => b.timestamp - a.timestamp)
  
  if (options.limit) {
    entries = entries.slice(0, options.limit)
  }
  
  return entries
}

/**
 * Get denied audit log entries (security violations)
 */
export function getSecurityViolations(
  extensionId?: string,
  limit = 50
): AuditLogEntry[] {
  return getAuditLog(extensionId, { limit }).filter(e => !e.allowed)
}

/**
 * Get resource usage for an extension
 */
export function getExtensionResourceUsage(extensionId: string): {
  storageBytes: number
  cpuTimeMs: number
  apiCallCount: number
  lastApiCall: number
} | null {
  return extensionResourceUsage.get(extensionId) ?? null
}

/**
 * Reset resource usage counters for an extension
 */
export function resetExtensionResourceUsage(extensionId: string): void {
  extensionResourceUsage.delete(extensionId)
  logger.info(`Reset resource usage for extension ${extensionId}`)
}

/**
 * Get all available capabilities
 */
export function getAvailableCapabilities(): ExtensionCapability[] {
  return ['filesystem', 'network', 'commands', 'themes', 'notifications', 'storage']
}

/**
 * Clear audit log
 */
export function clearAuditLog(): void {
  auditLog.length = 0
  logger.info('Cleared extension audit log')
}
