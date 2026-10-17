import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PWA_HARDENING_CONFIG,
  isNativeApp,
  isPWAInstalled,
  pwaLogout,
  secureTokenStorage,
  validateDeepLink,
  validatePWAManifest,
} from './hardening'

describe('PWA Hardening', () => {
  describe('Configuration', () => {
    it('should have hardening settings configured', () => {
      expect(PWA_HARDENING_CONFIG.SW_UPDATE_CHECK_INTERVAL).toBeGreaterThan(0)
      expect(PWA_HARDENING_CONFIG.FORCE_HTTPS).toBe(true)
      expect(PWA_HARDENING_CONFIG.CERTIFICATE_PINNING_ENABLED).toBe(true)
    })

    it('should have security timeouts configured', () => {
      expect(PWA_HARDENING_CONFIG.SESSION_TIMEOUT).toBeGreaterThan(0)
      expect(PWA_HARDENING_CONFIG.SYNC_TIMEOUT).toBeGreaterThan(0)
      expect(PWA_HARDENING_CONFIG.TOKEN_REFRESH_BUFFER).toBeGreaterThan(0)
    })

    it('should disable biometric requirement by default (future STEP 83)', () => {
      expect(PWA_HARDENING_CONFIG.REQUIRE_BIOMETRIC_FOR_PAYMENTS).toBe(false)
    })
  })

  describe('isNativeApp()', () => {
    beforeEach(() => {
      const global = globalThis as unknown as Record<string, unknown>
      global.capacitor = undefined
      global.Capacitor = undefined
    })

    it('should return false when not in native app', () => {
      expect(isNativeApp()).toBe(false)
    })

    it('should return true when Capacitor is available', () => {
      const global = globalThis as unknown as Record<string, unknown>
      global.Capacitor = {}
      expect(isNativeApp()).toBe(true)
    })

    it('should handle missing window gracefully', () => {
      // isNativeApp checks typeof window === 'undefined'
      // In Node.js test env, window is undefined, but function handles it
      expect(isNativeApp()).toBe(false)
    })
  })

  describe('validatePWAManifest()', () => {
    const validManifest = {
      name: 'קניון אקספרס',
      short_name: 'קניון אקספרס',
      description: 'Shopping app',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#FED700',
      background_color: '#FFFFFF',
      lang: 'he',
      dir: 'rtl',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    }

    it('should validate correct manifest', () => {
      const errors = validatePWAManifest(validManifest)
      expect(errors).toHaveLength(0)
    })

    it('should report missing name', () => {
      const manifest = { ...validManifest, name: undefined }
      const errors = validatePWAManifest(manifest)
      expect(errors).toContain('Manifest missing: name')
    })

    it('should report missing icons', () => {
      const manifest = { ...validManifest, icons: [] }
      const errors = validatePWAManifest(manifest)
      expect(errors.some((e) => e.includes('Manifest missing: icons'))).toBe(true)
    })

    it('should report missing required icon sizes', () => {
      const manifest = {
        ...validManifest,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        ],
      }
      const errors = validatePWAManifest(manifest)
      expect(errors.some((e) => e.includes('512x512 icon'))).toBe(true)
    })

    it('should report incorrect display mode', () => {
      const manifest = { ...validManifest, display: 'fullscreen' }
      const errors = validatePWAManifest(manifest)
      expect(errors.some((e) => e.includes("must be 'standalone'"))).toBe(true)
    })
  })

  describe('validateDeepLink()', () => {
    it('should allow valid product URLs', () => {
      expect(validateDeepLink('https://kenyonexpress.co.il/product/test-product')).toBe(true)
    })

    it('should allow valid category URLs', () => {
      expect(validateDeepLink('https://kenyonexpress.co.il/category/electronics')).toBe(true)
    })

    it('should block login URLs', () => {
      expect(validateDeepLink('https://kenyonexpress.co.il/login')).toBe(false)
      expect(validateDeepLink('http://example.com/login')).toBe(false)
    })

    it('should block admin URLs', () => {
      expect(validateDeepLink('https://kenyonexpress.co.il/admin')).toBe(false)
    })

    it('should block supplier URLs', () => {
      expect(validateDeepLink('https://kenyonexpress.co.il/supplier')).toBe(false)
    })

    it('should handle invalid URLs gracefully', () => {
      expect(validateDeepLink('not-a-url')).toBe(false)
    })

    it('should be bypassable when validation is disabled', () => {
      const originalConfig = PWA_HARDENING_CONFIG.DEEP_LINK_VALIDATION_ENABLED
      const config = PWA_HARDENING_CONFIG as unknown as Record<string, unknown>
      config.DEEP_LINK_VALIDATION_ENABLED = false
      expect(validateDeepLink('https://evil.com/phishing')).toBe(true)
      config.DEEP_LINK_VALIDATION_ENABLED = originalConfig
    })
  })

  describe('isPWAInstalled()', () => {
    beforeEach(() => {
      const global = globalThis as unknown as Record<string, unknown>
      global.capacitor = undefined
      global.Capacitor = undefined
      Object.defineProperty(navigator, 'standalone', {
        value: false,
        configurable: true,
      })
    })

    it('should return false when PWA not installed', () => {
      expect(isPWAInstalled()).toBe(false)
    })

    it('should return true when Capacitor is available', () => {
      const global = globalThis as unknown as Record<string, unknown>
      global.Capacitor = {}
      expect(isPWAInstalled()).toBe(true)
    })

    it('should return true when navigator.standalone is true', () => {
      Object.defineProperty(navigator, 'standalone', {
        value: true,
        configurable: true,
      })
      expect(isPWAInstalled()).toBe(true)
    })
  })

  describe('secureTokenStorage', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      if (typeof localStorage !== 'undefined') {
        localStorage.clear()
      }
    })

    it('should store token in localStorage (PWA mode)', async () => {
      await secureTokenStorage.setToken('auth', 'token123')
      const value = await secureTokenStorage.getToken('auth')
      expect(value).toBe('token123')
    })

    it('should remove token from storage', async () => {
      await secureTokenStorage.setToken('auth', 'token123')
      await secureTokenStorage.removeToken('auth')
      const value = await secureTokenStorage.getToken('auth')
      expect(value).toBeNull()
    })

    it('should handle storage errors gracefully', async () => {
      // Mock localStorage to throw
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage full')
      })

      // Should not throw
      await expect(secureTokenStorage.setToken('auth', 'token123')).resolves.toBeUndefined()

      localStorage.setItem = originalSetItem
    })
  })

  describe('pwaLogout()', () => {
    beforeEach(() => {
      localStorage.clear()
      vi.clearAllMocks()
    })

    it('should clear auth-related localStorage items', async () => {
      localStorage.setItem('token:auth_token', 'token')
      localStorage.setItem('cart', 'items')
      localStorage.setItem('theme', 'dark')

      await pwaLogout()

      expect(localStorage.getItem('token:auth_token')).toBeNull()
      expect(localStorage.getItem('cart')).toBeNull()
      expect(localStorage.getItem('theme')).toBe('dark') // Preferences preserved
    })

    it('should handle missing caches API gracefully', async () => {
      // caches API may not be available in test environment
      await expect(pwaLogout()).resolves.toBeUndefined()
    })

    it('should remove tokens from secure storage', async () => {
      await secureTokenStorage.setToken('auth_token', 'token')
      await secureTokenStorage.setToken('refresh_token', 'refresh')

      await pwaLogout()

      const authToken = await secureTokenStorage.getToken('auth_token')
      const refreshToken = await secureTokenStorage.getToken('refresh_token')

      expect(authToken).toBeNull()
      expect(refreshToken).toBeNull()
    })
  })

  describe('App Store compliance', () => {
    it('should have all required configuration for App Store submission', () => {
      // iOS App Store requirements
      expect(PWA_HARDENING_CONFIG.FORCE_HTTPS).toBe(true)
      expect(PWA_HARDENING_CONFIG.MIN_TLS_VERSION).toBe('1.3')

      // Offline support
      expect(PWA_HARDENING_CONFIG.OFFLINE_CACHE_TTL).toBeGreaterThan(0)
      expect(PWA_HARDENING_CONFIG.OFFLINE_PAGE_LIMIT).toBeGreaterThan(0)

      // Security
      expect(PWA_HARDENING_CONFIG.CERTIFICATE_PINNING_ENABLED).toBe(true)
      expect(PWA_HARDENING_CONFIG.SECURE_TOKEN_STORAGE).toBe(true)
      expect(PWA_HARDENING_CONFIG.BACKGROUND_SYNC_ENABLED).toBe(true)
    })

    it('should validate manifest for App Store compliance', () => {
      const manifest = {
        name: 'App Name',
        short_name: 'App',
        display: 'standalone',
        start_url: '/',
        theme_color: '#000000',
        background_color: '#FFFFFF',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', purpose: 'any' },
        ],
      }

      const errors = validatePWAManifest(manifest)
      expect(errors.filter((e) => e.includes('Manifest missing'))).toHaveLength(0)
    })
  })
})
