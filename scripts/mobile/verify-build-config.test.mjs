/**
 * Tests for mobile build configuration verification
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

describe('Mobile Build Configuration', () => {
  describe('Capacitor config', () => {
    it('should have capacitor.config.ts', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toBeTruthy()
    })

    it('should have correct app ID', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('co.kenyonexpress.store')
    })

    it('should have Hebrew app name', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('קניון אקספרס')
    })

    it('should configure plugins', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('plugins:')
    })

    it('should have iOS configuration', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('ios:')
      expect(content).toContain('iosSchemeless:')
    })

    it('should have Android configuration', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('android:')
      expect(content).toContain('androidScheme:')
    })
  })

  describe('Package configuration', () => {
    it('should have Capacitor dependencies', () => {
      const pkgPath = path.join(ROOT, 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      expect(pkg.devDependencies['@capacitor/core']).toBeTruthy()
      expect(pkg.devDependencies['@capacitor/cli']).toBeTruthy()
      expect(pkg.devDependencies['@capacitor/ios']).toBeTruthy()
      expect(pkg.devDependencies['@capacitor/android']).toBeTruthy()
    })

    it('should have mobile build scripts', () => {
      const pkgPath = path.join(ROOT, 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      expect(pkg.scripts['mobile:build:web']).toBeTruthy()
      expect(pkg.scripts['mobile:sync']).toBeTruthy()
      expect(pkg.scripts['mobile:ios:build']).toBeTruthy()
      expect(pkg.scripts['mobile:android:build']).toBeTruthy()
    })

    it('should have mobile:verify script', () => {
      const pkgPath = path.join(ROOT, 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      expect(pkg.scripts['mobile:verify']).toBeTruthy()
    })
  })

  describe('Documentation', () => {
    it('should have MOBILE-APP-SETUP.md', () => {
      const docPath = path.join(ROOT, 'docs/MOBILE-APP-SETUP.md')
      const content = readFileSync(docPath, 'utf-8')
      expect(content).toContain('Mobile App Setup')
      expect(content).toContain('Capacitor')
      expect(content).toContain('iOS')
      expect(content).toContain('Android')
    })

    it('should have CODE-SIGNING.md', () => {
      const docPath = path.join(ROOT, 'docs/CODE-SIGNING.md')
      const content = readFileSync(docPath, 'utf-8')
      expect(content).toContain('Code Signing')
      expect(content).toContain('iOS')
      expect(content).toContain('Android')
      expect(content).toContain('Apple Developer')
      expect(content).toContain('Google Play')
    })

    it('CODE-SIGNING.md should cover keystore generation', () => {
      const docPath = path.join(ROOT, 'docs/CODE-SIGNING.md')
      const content = readFileSync(docPath, 'utf-8')
      expect(content).toContain('keytool')
      expect(content).toContain('release.jks')
    })

    it('CODE-SIGNING.md should cover provisioning profiles', () => {
      const docPath = path.join(ROOT, 'docs/CODE-SIGNING.md')
      const content = readFileSync(docPath, 'utf-8')
      expect(content).toContain('Provisioning Profile')
      expect(content).toContain('developer.apple.com')
    })
  })

  describe('PWA Integration', () => {
    it('should have manifest route', () => {
      const manifestRoute = path.join(ROOT, 'src/app/manifest.webmanifest/route.ts')
      const content = readFileSync(manifestRoute, 'utf-8')
      expect(content).toBeTruthy()
    })

    it('should have service worker', () => {
      const swPath = path.join(ROOT, 'public/sw.js')
      const content = readFileSync(swPath, 'utf-8')
      expect(content.length).toBeGreaterThan(100)
    })

    it('layout should register service worker', () => {
      const layoutPath = path.join(ROOT, 'src/app/layout.tsx')
      const content = readFileSync(layoutPath, 'utf-8')
      expect(content).toContain('ServiceWorkerRegistrar')
    })

    it('layout should have PWA metadata', () => {
      const layoutPath = path.join(ROOT, 'src/app/layout.tsx')
      const content = readFileSync(layoutPath, 'utf-8')
      expect(content).toContain('manifest')
      expect(content).toContain('appleWebApp')
    })
  })

  describe('Security', () => {
    it('should not commit keystore files', () => {
      const gitignorePath = path.join(ROOT, '.gitignore')
      const content = readFileSync(gitignorePath, 'utf-8')
      expect(content).toContain('*.jks')
      expect(content).toContain('.env')
    })

    it('capacitor.config.ts should enforce HTTPS', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('https')
      expect(content).toContain("androidScheme: 'https'")
    })

    it('capacitor.config.ts should disable web debugging in Android production', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('webContentsDebuggingEnabled: false')
    })

    it('capacitor.config.ts should not allow mixed content', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('allowMixedContent: false')
    })
  })

  describe('Configuration Values', () => {
    it('should have brand colors configured', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      // Splash screen color should match brand yellow
      expect(content).toContain('#FED700')
    })

    it('should have reasonable splash screen timeout', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      // 2000ms = 2 seconds is reasonable
      expect(content).toContain('launchShowDuration: 2000')
    })

    it('should auto-hide splash screen', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('launchAutoHide: true')
    })

    it('should enable immersive mode on Android', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      expect(content).toContain('splashImmersive: true')
    })
  })

  describe('Build Directory Configuration', () => {
    it('should point to static export (out) or server build (.next)', () => {
      const configPath = path.join(ROOT, 'capacitor.config.ts')
      const content = readFileSync(configPath, 'utf-8')
      // Either 'out' or '.next' is valid depending on export strategy
      const isOutOrNext = content.includes("webDir: 'out'") || content.includes("webDir: '.next'")
      expect(isOutOrNext).toBe(true)
    })
  })
})
