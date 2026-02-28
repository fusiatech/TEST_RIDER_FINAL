try {
  const { AsyncLocalStorage } = require('node:async_hooks')
  if (!globalThis.AsyncLocalStorage) {
    globalThis.AsyncLocalStorage = AsyncLocalStorage
  }
} catch {
  // Best-effort preload for runtimes that already expose AsyncLocalStorage.
}

