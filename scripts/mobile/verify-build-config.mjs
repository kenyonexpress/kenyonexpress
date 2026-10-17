#!/usr/bin/env node

/**
 * Mobile Build Configuration Verification Script
 * Validates Capacitor config, iOS, and Android setup before building
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const ERRORS = []
const WARNINGS = []

console.log('🔍 Verifying mobile app build configuration...\n')

// Check Capacitor config
console.log('📱 Checking Capacitor configuration...')
if (!existsSync(path.join(ROOT, 'capacitor.config.ts'))) {
  ERRORS.push('❌ capacitor.config.ts not found')
} else {
  const content = readFileSync(path.join(ROOT, 'capacitor.config.ts'), 'utf-8')
  if (!content.includes('co.kenyonexpress.store')) {
    ERRORS.push('❌ App ID not set to co.kenyonexpress.store')
  } else {
    console.log('✅ capacitor.config.ts configured correctly')
  }

  if (!content.includes('@capacitor/')) {
    WARNINGS.push('⚠️  No Capacitor plugins configured')
  }
}

// Check package.json
console.log('\n📦 Checking package.json...')
const pkgPath = path.join(ROOT, 'package.json')
if (!existsSync(pkgPath)) {
  ERRORS.push('❌ package.json not found')
} else {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

  // Check for Capacitor dependencies
  const hasCapCore = pkg.devDependencies?.['@capacitor/core']
  const hasCapCli = pkg.devDependencies?.['@capacitor/cli']
  const hasCapIos = pkg.devDependencies?.['@capacitor/ios']
  const hasCapAndroid = pkg.devDependencies?.['@capacitor/android']

  if (!hasCapCore || !hasCapCli || !hasCapIos || !hasCapAndroid) {
    ERRORS.push('❌ Capacitor packages missing. Run: pnpm add -D @capacitor/{core,cli,ios,android}')
  } else {
    console.log('✅ All Capacitor packages installed')
  }

  // Check for mobile build scripts
  if (!pkg.scripts?.['mobile:build:web']) {
    WARNINGS.push('⚠️  Mobile build scripts not configured in package.json')
  } else {
    console.log('✅ Mobile build scripts configured')
  }
}

// Check Next.js config for PWA compatibility
console.log('\n⚙️  Checking Next.js configuration...')
const nextConfigPath = path.join(ROOT, 'next.config.ts')
if (!existsSync(nextConfigPath)) {
  ERRORS.push('❌ next.config.ts not found')
} else {
  const content = readFileSync(nextConfigPath, 'utf-8')

  // Ensure no PWA plugin is configured (Capacitor handles it)
  if (content.includes('next-pwa') || content.includes('workbox')) {
    WARNINGS.push('⚠️  Found PWA plugins in next.config.ts. Capacitor may conflict with them.')
  } else {
    console.log('✅ Next.js config PWA-compatible (no conflicting plugins)')
  }
}

// Check manifest route
console.log('\n🎭 Checking web manifest...')
const manifestRoutePath = path.join(ROOT, 'src/app/manifest.webmanifest/route.ts')
if (!existsSync(manifestRoutePath)) {
  WARNINGS.push('⚠️  Manifest route not found at src/app/manifest.webmanifest/route.ts')
} else {
  console.log('✅ Web manifest route configured')
}

// Check service worker
console.log('\n⚙️  Checking service worker...')
const swPath = path.join(ROOT, 'public/sw.js')
if (!existsSync(swPath)) {
  WARNINGS.push('⚠️  Service worker not found at public/sw.js')
} else {
  const content = readFileSync(swPath, 'utf-8')
  if (content.length < 100) {
    WARNINGS.push('⚠️  Service worker appears empty or too small')
  } else {
    console.log('✅ Service worker installed')
  }
}

// Check iOS directory (optional - only if synced)
console.log('\n🍎 Checking iOS configuration...')
if (existsSync(path.join(ROOT, 'ios/App/App.xcworkspace'))) {
  console.log('✅ iOS project initialized (ios/App/App.xcworkspace)')

  // Check Info.plist
  const infoPlist = path.join(ROOT, 'ios/App/App/Info.plist')
  if (existsSync(infoPlist)) {
    const content = readFileSync(infoPlist, 'utf-8')
    if (!content.includes('NSCameraUsageDescription')) {
      WARNINGS.push('⚠️  iOS Info.plist missing camera permission description')
    }
  }
} else {
  console.log('ℹ️  iOS project not yet initialized. Run: pnpm mobile:sync')
}

// Check Android directory (optional - only if synced)
console.log('\n🤖 Checking Android configuration...')
if (existsSync(path.join(ROOT, 'android/app'))) {
  console.log('✅ Android project initialized (android/app)')

  // Check build.gradle
  const buildGradle = path.join(ROOT, 'android/app/build.gradle')
  if (existsSync(buildGradle)) {
    const content = readFileSync(buildGradle, 'utf-8')
    if (!content.includes('signingConfigs')) {
      WARNINGS.push('⚠️  Android build.gradle missing signing configuration')
    } else {
      console.log('✅ Android signing configuration present')
    }
  }

  // Check AndroidManifest.xml
  const manifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml')
  if (existsSync(manifest)) {
    const content = readFileSync(manifest, 'utf-8')
    if (!content.includes('android.permission.CAMERA')) {
      WARNINGS.push('⚠️  Android manifest missing camera permission')
    }
  }
} else {
  console.log('ℹ️  Android project not yet initialized. Run: pnpm mobile:sync')
}

// Check for API endpoints needed by mobile
console.log('\n🔗 Checking required API routes...')
const apiRoutesPath = path.join(ROOT, 'src/app/api')
if (!existsSync(apiRoutesPath)) {
  WARNINGS.push('⚠️  No API routes found')
} else {
  // Check for health check endpoint (used for offline detection)
  if (!existsSync(path.join(ROOT, 'src/app/api/health/route.ts'))) {
    WARNINGS.push('⚠️  /api/health endpoint not found (needed for offline detection)')
  } else {
    console.log('✅ Health check endpoint available')
  }
}

// System requirements check
console.log('\n🛠️  Checking system requirements...')

// Check Node/npm version
try {
  const nodeVersion = execSync('node --version').toString().trim()
  console.log(`✅ Node version: ${nodeVersion}`)
} catch {
  ERRORS.push('❌ Node.js not found in PATH')
}

// Check for iOS tools (macOS only)
if (process.platform === 'darwin') {
  try {
    execSync('xcode-select -p', { stdio: 'ignore' })
    console.log('✅ Xcode Command Line Tools installed')
  } catch {
    WARNINGS.push('⚠️  Xcode Command Line Tools not found. Run: xcode-select --install')
  }

  // Check for CocoaPods
  try {
    execSync('pod --version', { stdio: 'ignore' })
    console.log('✅ CocoaPods installed')
  } catch {
    WARNINGS.push('⚠️  CocoaPods not found. Run: sudo gem install cocoapods')
  }
} else {
  console.log('ℹ️  iOS tools check skipped (not on macOS)')
}

// Check for Android tools (if using Android)
try {
  execSync('java -version', { stdio: 'ignore' })
  console.log('✅ Java installed')
} catch {
  WARNINGS.push('⚠️  Java not found. Required for Android builds.')
}

// Summary
console.log(`\n${'='.repeat(50)}`)
if (ERRORS.length === 0 && WARNINGS.length === 0) {
  console.log('✅ All checks passed! Ready to build.')
  process.exit(0)
}

if (WARNINGS.length > 0) {
  console.log('\n⚠️  Warnings:')
  for (const w of WARNINGS) {
    console.log(`  ${w}`)
  }
}

if (ERRORS.length > 0) {
  console.log('\n❌ Errors:')
  for (const e of ERRORS) {
    console.log(`  ${e}`)
  }
  console.log('\nFix errors before building.')
  process.exit(1)
}

process.exit(0)
