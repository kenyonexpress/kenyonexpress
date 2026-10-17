/**
 * PWA hardening for App Store submission
 * Security measures for offline operation, update management, and native wrapper compatibility
 */

export const PWA_HARDENING_CONFIG = {
  // Service worker update check interval (30 minutes)
  SW_UPDATE_CHECK_INTERVAL: 30 * 60 * 1000,

  // Offline fallback page cache expiration (7 days)
  OFFLINE_CACHE_TTL: 7 * 24 * 60 * 60 * 1000,

  // Maximum number of pages to cache for offline browsing
  OFFLINE_PAGE_LIMIT: 50,

  // Maximum number of images to cache for offline display
  OFFLINE_IMAGE_LIMIT: 100,

  // Minimum TLS version required (1.3 for production)
  MIN_TLS_VERSION: '1.3',

  // Certificate pinning enabled for API calls
  CERTIFICATE_PINNING_ENABLED: true,

  // Secure storage for authentication tokens in native wrapper
  SECURE_TOKEN_STORAGE: true,

  // Enable content security policy for offline pages
  OFFLINE_CSP_ENABLED: true,

  // Require HTTPS for all resources (even in development, Capacitor enforces it)
  FORCE_HTTPS: true,

  // Background sync queue for offline purchases and carts
  BACKGROUND_SYNC_ENABLED: true,

  // Maximum retries for failed sync operations
  MAX_SYNC_RETRIES: 5,

  // Timeout for sync operations (30 seconds)
  SYNC_TIMEOUT: 30 * 1000,

  // Token refresh interval (60 minutes before expiration)
  TOKEN_REFRESH_BUFFER: 60 * 60 * 1000,

  // Session timeout in native wrapper (15 minutes of inactivity)
  SESSION_TIMEOUT: 15 * 60 * 1000,

  // Require biometric authentication for payments (if available)
  REQUIRE_BIOMETRIC_FOR_PAYMENTS: false, // Set to true in future STEP 83

  // Deep linking security: validate URLs against whitelist
  DEEP_LINK_VALIDATION_ENABLED: true,

  // Prohibited deep link patterns (reject these URLs)
  DEEP_LINK_BLOCKLIST: [
    /^https?:\/\/[^/]*login/i,
    /^https?:\/\/[^/]*admin/i,
    /^https?:\/\/[^/]*supplier/i,
  ],

  // App-specific schemes (for Capacitor native linking)
  NATIVE_SCHEMES: ['kenyonexpress://', 'kenyonexpress-checkout://'],

  // Notification security: only allow app-initiated notifications
  NOTIFICATION_VALIDATION_ENABLED: true,

  // Data encryption for offline storage (via IndexedDB)
  OFFLINE_STORAGE_ENCRYPTION: true,

  // Compression for offline cached pages
  OFFLINE_PAGE_COMPRESSION: true,

  // Manifest validation on app launch
  MANIFEST_VALIDATION_ENABLED: true,
} as const

/**
 * Check if running in native wrapper (Capacitor app)
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as unknown as Record<string, unknown>
  return !!(win.capacitor || win.Capacitor)
}

/**
 * Validate manifest compliance for App Store submission
 */
export function validatePWAManifest(manifest: Record<string, unknown>): string[] {
  const errors: string[] = []

  if (!manifest.name) errors.push('Manifest missing: name')
  if (!manifest.short_name) errors.push('Manifest missing: short_name')
  if (!manifest.start_url) errors.push('Manifest missing: start_url')
  if (!manifest.display) errors.push('Manifest missing: display')
  if (manifest.display !== 'standalone') {
    errors.push(`Manifest display must be 'standalone', got: ${manifest.display}`)
  }

  if (!manifest.icons || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    errors.push('Manifest missing: icons array')
  } else {
    const icons = manifest.icons as Array<Record<string, unknown>>
    const sizes = icons.map((i) => String(i.sizes || ''))
    if (!sizes.includes('192x192')) errors.push('Manifest missing: 192x192 icon')
    if (!sizes.includes('512x512')) errors.push('Manifest missing: 512x512 icon')
  }

  if (!manifest.theme_color) errors.push('Manifest missing: theme_color')
  if (!manifest.background_color) errors.push('Manifest missing: background_color')

  return errors
}

/**
 * Validate deep link URL against security policy
 */
export function validateDeepLink(url: string): boolean {
  if (!PWA_HARDENING_CONFIG.DEEP_LINK_VALIDATION_ENABLED) return true

  try {
    // Validate URL structure
    new URL(url)

    // Allow only app-specific schemes in native wrapper
    if (isNativeApp()) {
      const isValidScheme = PWA_HARDENING_CONFIG.NATIVE_SCHEMES.some((scheme) =>
        url.startsWith(scheme),
      )
      if (!isValidScheme && !url.startsWith('https://')) return false
    }

    // Check blocklist
    for (const pattern of PWA_HARDENING_CONFIG.DEEP_LINK_BLOCKLIST) {
      if (pattern.test(url)) {
        console.warn(`[PWA] Blocked deep link (matches blocklist): ${url}`)
        return false
      }
    }

    return true
  } catch {
    console.error(`[PWA] Invalid deep link URL: ${url}`)
    return false
  }
}

/**
 * Secure token storage helper for native wrapper
 */
export const secureTokenStorage = {
  /**
   * Store auth token in secure storage (Keychain on iOS, Keystore on Android)
   */
  async setToken(key: string, value: string): Promise<void> {
    if (!PWA_HARDENING_CONFIG.SECURE_TOKEN_STORAGE || !isNativeApp()) {
      // Fallback to localStorage in PWA mode
      try {
        localStorage.setItem(`token:${key}`, value)
      } catch {
        console.error('[PWA] Failed to store token')
      }
      return
    }

    // Use Capacitor secure storage in native wrapper
    try {
      const win = window as unknown as Record<string, unknown>
      const Capacitor = win.Capacitor as unknown as Record<string, unknown>
      const isAvailable = (Capacitor?.isPluginAvailable as (name: string) => boolean)?.(
        'SecureStoragePlugin',
      )
      if (isAvailable) {
        const plugins = Capacitor.plugins as unknown as Record<string, unknown>
        const storagePlugin = plugins.SecureStoragePlugin as unknown as {
          set: (opts: { key: string; value: string }) => Promise<void>
        }
        await storagePlugin.set({ key, value })
      }
    } catch (error) {
      console.error('[PWA] Secure storage unavailable:', error)
    }
  },

  /**
   * Retrieve auth token from secure storage
   */
  async getToken(key: string): Promise<string | null> {
    if (!PWA_HARDENING_CONFIG.SECURE_TOKEN_STORAGE || !isNativeApp()) {
      // Fallback to localStorage in PWA mode
      try {
        return localStorage.getItem(`token:${key}`)
      } catch {
        return null
      }
    }

    try {
      const win = window as unknown as Record<string, unknown>
      const Capacitor = win.Capacitor as unknown as Record<string, unknown>
      const isAvailable = (Capacitor?.isPluginAvailable as (name: string) => boolean)?.(
        'SecureStoragePlugin',
      )
      if (isAvailable) {
        const plugins = Capacitor.plugins as unknown as Record<string, unknown>
        const storagePlugin = plugins.SecureStoragePlugin as unknown as {
          get: (opts: { key: string }) => Promise<{ value: string }>
        }
        const result = await storagePlugin.get({ key })
        return result?.value || null
      }
    } catch (error) {
      console.error('[PWA] Failed to retrieve token:', error)
    }

    return null
  },

  /**
   * Remove auth token from secure storage
   */
  async removeToken(key: string): Promise<void> {
    if (!PWA_HARDENING_CONFIG.SECURE_TOKEN_STORAGE || !isNativeApp()) {
      try {
        localStorage.removeItem(`token:${key}`)
      } catch {
        console.error('[PWA] Failed to remove token')
      }
      return
    }

    try {
      const win = window as unknown as Record<string, unknown>
      const Capacitor = win.Capacitor as unknown as Record<string, unknown>
      const isAvailable = (Capacitor?.isPluginAvailable as (name: string) => boolean)?.(
        'SecureStoragePlugin',
      )
      if (isAvailable) {
        const plugins = Capacitor.plugins as unknown as Record<string, unknown>
        const storagePlugin = plugins.SecureStoragePlugin as unknown as {
          remove: (opts: { key: string }) => Promise<void>
        }
        await storagePlugin.remove({ key })
      }
    } catch (error) {
      console.error('[PWA] Failed to remove token:', error)
    }
  },
}

/**
 * Check PWA installation status
 */
export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false

  // Check if running as standalone app (installed PWA on iOS/Android)
  const nav = navigator as unknown as Record<string, unknown>
  if (nav.standalone === true) return true

  // Check if running in Capacitor native wrapper
  if (isNativeApp()) return true

  // Check display mode in match media (some browsers support this)
  if (typeof window.matchMedia !== 'undefined') {
    const mql = window.matchMedia('(display-mode: standalone)')
    if (mql.matches) return true
  }

  return false
}

/**
 * Request PWA installation (shows install prompt on supported browsers)
 */
export function requestPWAInstall(): void {
  if (typeof window === 'undefined') return

  // Trigger the before install prompt if available
  const win = window as unknown as Record<string, unknown>
  const event = win.__beforeInstallPromptEvent as unknown as { prompt?: () => void }
  if (event?.prompt) {
    event.prompt()
  }
}

/**
 * Logout hook that clears all secure storage and service worker cache
 */
export async function pwaLogout(): Promise<void> {
  // Clear secure tokens
  await secureTokenStorage.removeToken('auth_token')
  await secureTokenStorage.removeToken('refresh_token')

  // Clear service worker cache (if available)
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      const deletions: Promise<boolean>[] = []
      for (const name of cacheNames) {
        // Clear app cache, keep static assets
        if (name.includes('app-') || name.includes('api-')) {
          deletions.push(caches.delete(name))
        }
      }
      await Promise.all(deletions)
    } catch (error) {
      console.error('[PWA] Failed to clear caches:', error)
    }
  }

  // Clear localStorage (except preferences)
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && !['theme', 'locale', 'consent'].some((p) => key.includes(p))) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch (error) {
    console.error('[PWA] Failed to clear localStorage:', error)
  }
}
