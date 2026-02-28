import { AsyncLocalStorage } from 'node:async_hooks'

if (!(globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage) {
  ;(globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage
}

