import { z } from 'zod'

/* ── Extension Category ─────────────────────────────────────────── */

export const ExtensionCategory = z.enum(['theme', 'language', 'tool', 'integration'])
export type ExtensionCategory = z.infer<typeof ExtensionCategory>

/* ── Theme Contribution ─────────────────────────────────────────── */

export const ThemeContributionSchema = z.object({
  id: z.string(),
  label: z.string(),
  uiTheme: z.enum(['vs', 'vs-dark', 'hc-black', 'hc-light']),
  path: z.string(),
})
export type ThemeContribution = z.infer<typeof ThemeContributionSchema>

/* ── Language Contribution ──────────────────────────────────────── */

export const LanguageContributionSchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()).optional(),
  extensions: z.array(z.string()),
  configuration: z.string().optional(),
})
export type LanguageContribution = z.infer<typeof LanguageContributionSchema>

/* ── Command Contribution ───────────────────────────────────────── */

export const CommandContributionSchema = z.object({
  command: z.string(),
  title: z.string(),
  category: z.string().optional(),
  icon: z.string().optional(),
})
export type CommandContribution = z.infer<typeof CommandContributionSchema>

/* ── Extension Manifest ─────────────────────────────────────────── */

export const ExtensionManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  main: z.string(),
  category: ExtensionCategory.optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  contributes: z.object({
    themes: z.array(ThemeContributionSchema).optional(),
    languages: z.array(LanguageContributionSchema).optional(),
    commands: z.array(CommandContributionSchema).optional(),
  }).optional(),
  activationEvents: z.array(z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
})
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>

/* ── Extension ──────────────────────────────────────────────────── */

export const ExtensionSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  enabled: z.boolean(),
  installed: z.boolean(),
  category: ExtensionCategory,
  config: z.record(z.string(), z.unknown()).optional(),
  installedAt: z.number().optional(),
  updatedAt: z.number().optional(),
  path: z.string().optional(),
  sourceUrl: z.string().optional(),
  manifest: ExtensionManifestSchema.optional(),
  signatureVerified: z.boolean().optional(),
  signedAt: z.number().optional(),
})
export type Extension = z.infer<typeof ExtensionSchema>

/* ── Extension Config ───────────────────────────────────────────── */

export const ExtensionConfigSchema = z.object({
  extensionId: z.string(),
  config: z.record(z.string(), z.unknown()),
})
export type ExtensionConfig = z.infer<typeof ExtensionConfigSchema>

/* ── Extension Install Request ──────────────────────────────────── */

export const ExtensionInstallRequestSchema = z.object({
  source: z.enum(['url', 'local', 'registry']),
  url: z.string().optional(),
  path: z.string().optional(),
  registryId: z.string().optional(),
})
export type ExtensionInstallRequest = z.infer<typeof ExtensionInstallRequestSchema>

/* ── Extension Update Request ───────────────────────────────────── */

export const ExtensionUpdateRequestSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})
export type ExtensionUpdateRequest = z.infer<typeof ExtensionUpdateRequestSchema>

/* ── Extension Registry Entry ───────────────────────────────────── */

export const ExtensionRegistryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  category: ExtensionCategory,
  downloadUrl: z.string(),
  homepage: z.string().optional(),
  downloads: z.number().optional(),
  rating: z.number().optional(),
})
export type ExtensionRegistryEntry = z.infer<typeof ExtensionRegistryEntrySchema>

/* ── Extension Activation Status ───────────────────────────────────── */

export const ExtensionActivationStatusSchema = z.enum(['inactive', 'activating', 'active', 'error'])
export type ExtensionActivationStatus = z.infer<typeof ExtensionActivationStatusSchema>

/* ── Theme Definition ──────────────────────────────────────────────── */

export interface ThemeDefinition {
  id: string
  label: string
  uiTheme: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  colors?: Record<string, string>
  tokenColors?: Array<{
    scope: string | string[]
    settings: Record<string, string>
  }>
}

/* ── Extension API Surface ─────────────────────────────────────────── */

export interface ExtensionCommands {
  registerCommand(id: string, handler: () => void | Promise<void>): void
  executeCommand(id: string): Promise<void>
  getCommands(): string[]
}

export interface ExtensionThemes {
  registerTheme(id: string, theme: ThemeDefinition): void
  getThemes(): Map<string, ThemeDefinition>
}

export interface ExtensionNotifications {
  showInfo(message: string): void
  showError(message: string): void
  showWarning(message: string): void
  showSuccess(message: string): void
}

export interface ExtensionWorkspace {
  openFile(path: string): Promise<void>
  getOpenFiles(): string[]
  getWorkspacePath(): string
}

export interface ExtensionStorage {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void
}

export interface ExtensionAPI {
  commands: ExtensionCommands
  themes: ExtensionThemes
  notifications: ExtensionNotifications
  workspace: ExtensionWorkspace
  storage: ExtensionStorage
  extensionPath: string
}

/* ── Extension Context (passed to activate function) ───────────────── */

export interface ExtensionContext {
  extensionId: string
  extensionPath: string
  api: ExtensionAPI
  subscriptions: Array<{ dispose: () => void }>
}

/* ── Extension Module Interface ────────────────────────────────────── */

export interface ExtensionModule {
  activate(context: ExtensionContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}

/* ── Extension Activate Request ────────────────────────────────────── */

export const ExtensionActivateRequestSchema = z.object({
  action: z.enum(['activate', 'deactivate']),
})
export type ExtensionActivateRequest = z.infer<typeof ExtensionActivateRequestSchema>
