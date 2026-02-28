let deferredPrompt: BeforeInstallPromptEvent | null = null;

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

async function unregisterAllServiceWorkers(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

async function clearSwarmCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return;
  }

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith('swarmui-'))
      .map((name) => caches.delete(name))
  );
}

export async function cleanupDevServiceWorkers(): Promise<void> {
  if (isProductionRuntime()) {
    return;
  }

  try {
    const hadController = typeof navigator !== 'undefined' && navigator.serviceWorker.controller !== null;
    await unregisterAllServiceWorkers();
    await clearSwarmCaches();
    console.log('[PWA] Development cleanup complete (service workers + caches removed)');

    // If a stale SW was controlling this page, one reload is required to detach it.
    if (hadController && typeof window !== 'undefined') {
      const reloadKey = 'swarmui-dev-sw-cleanup-reloaded';
      if (sessionStorage.getItem(reloadKey) !== '1') {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }
    }
  } catch (error) {
    console.warn('[PWA] Development cleanup failed:', error);
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  if (!isProductionRuntime()) {
    void cleanupDevServiceWorkers();
    return Promise.resolve(null);
  }

  return navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      console.log('[PWA] Service worker registered:', registration.scope);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('swarmui:update-available'));
            }
          });
        }
      });

      return registration;
    })
    .catch((error) => {
      console.error('[PWA] Service worker registration failed:', error);
      return null;
    });
}

export async function checkForUpdates(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  if (!isProductionRuntime()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
      return registration.waiting !== null;
    }
    return false;
  } catch (error) {
    console.error('[PWA] Update check failed:', error);
    return false;
  }
}

export function applyUpdate(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  if (!isProductionRuntime()) {
    return;
  }

  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration?.waiting) {
      registration.waiting.postMessage('skipWaiting');
      window.location.reload();
    }
  });
}

export function setupInstallPrompt(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!isProductionRuntime()) {
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('swarmui:install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('swarmui:installed'));
  });
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    return false;
  }

  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  } catch (error) {
    console.error('[PWA] Install prompt failed:', error);
    return false;
  }
}

export function isInstallable(): boolean {
  return deferredPrompt !== null;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isOnline(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return navigator.onLine;
}

export async function clearCache(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  if (!isProductionRuntime()) {
    await clearSwarmCaches();
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.active) {
    registration.active.postMessage('clearCache');
  }

  await clearSwarmCaches();
}

export function getCacheSize(): Promise<number> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return Promise.resolve(0);
  }

  return caches.keys().then(async (cacheNames) => {
    let totalSize = 0;
    for (const name of cacheNames.filter((n) => n.startsWith('swarmui-'))) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.clone().blob();
          totalSize += blob.size;
        }
      }
    }
    return totalSize;
  });
}
