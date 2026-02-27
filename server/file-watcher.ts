import chokidar, { type FSWatcher } from 'chokidar'
import { createLogger } from '@/server/logger'

const logger = createLogger('file-watcher')

export type FileChangeEvent = 'add' | 'change' | 'unlink'

export interface FileChangeInfo {
  event: FileChangeEvent
  path: string
}

export type FileChangeCallback = (info: FileChangeInfo) => void

const DEBOUNCE_MS = 300

const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.log',
  '**/.DS_Store',
  '**/Thumbs.db',
]

let activeWatcher: FSWatcher | null = null
let currentProjectPath: string | null = null

const pendingChanges = new Map<string, { event: FileChangeEvent; timer: ReturnType<typeof setTimeout> }>()

function emitDebouncedChange(
  filePath: string,
  event: FileChangeEvent,
  callback: FileChangeCallback
): void {
  const existing = pendingChanges.get(filePath)
  if (existing) {
    clearTimeout(existing.timer)
  }

  const timer = setTimeout(() => {
    pendingChanges.delete(filePath)
    callback({ event, path: filePath })
  }, DEBOUNCE_MS)

  pendingChanges.set(filePath, { event, timer })
}

export function startFileWatcher(
  projectPath: string,
  onEvent: FileChangeCallback
): FSWatcher {
  if (activeWatcher && currentProjectPath === projectPath) {
    logger.info('File watcher already running for project', { projectPath })
    return activeWatcher
  }

  stopFileWatcher()

  logger.info('Starting file watcher', { projectPath })

  const watcher = chokidar.watch(projectPath, {
    ignored: IGNORED_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
    usePolling: false,
    followSymlinks: false,
    depth: 20,
  })

  watcher.on('add', (filePath) => {
    emitDebouncedChange(filePath, 'add', onEvent)
  })

  watcher.on('change', (filePath) => {
    emitDebouncedChange(filePath, 'change', onEvent)
  })

  watcher.on('unlink', (filePath) => {
    emitDebouncedChange(filePath, 'unlink', onEvent)
  })

  watcher.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('File watcher error', { error: message })
  })

  watcher.on('ready', () => {
    logger.info('File watcher ready', { projectPath })
  })

  activeWatcher = watcher
  currentProjectPath = projectPath

  return watcher
}

export function stopFileWatcher(): void {
  if (activeWatcher) {
    logger.info('Stopping file watcher', { projectPath: currentProjectPath })
    
    for (const { timer } of pendingChanges.values()) {
      clearTimeout(timer)
    }
    pendingChanges.clear()

    void activeWatcher.close()
    activeWatcher = null
    currentProjectPath = null
  }
}

export function isWatcherActive(): boolean {
  return activeWatcher !== null
}

export function getWatchedPath(): string | null {
  return currentProjectPath
}
