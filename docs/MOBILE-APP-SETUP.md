# Mobile App Setup & Build Configuration

This document describes the Capacitor-based native mobile app setup for KenyonExpress iOS and Android builds.

## Overview

KenyonExpress uses **Capacitor** (v8.5.3) to wrap the Next.js PWA as native iOS and Android apps. The web build is served through the native container with full access to native APIs.

### Build Architecture

```
Next.js App (src/)
    ↓
PWA Build (out/ or .next/)
    ↓
Capacitor Wrapper
    ├─ iOS (Xcode project)
    └─ Android (Android Studio project)
```

## Prerequisites

### System Requirements

- **macOS 12+** (for iOS builds)
- **Xcode 14+** (for iOS)
- **Java 11+** and **Android SDK** (API level 30+, for Android)
- **Capacitor CLI**: `pnpm -g add @capacitor/cli` or use `pnpm exec cap`

### Development Tools

```bash
# Recommended global installations
brew install xcode-select
xcode-select --install

# For Android
brew install openjdk@11
export JAVA_HOME=/usr/local/opt/openjdk@11

# Verify
xcode-select -p
java -version
```

## Project Structure

```
kenyonexpress/
├── capacitor.config.ts      # Capacitor configuration
├── out/                      # Static export (next export)
├── .next/                    # Next.js build output
├── ios/                      # iOS Xcode project (generated)
├── android/                  # Android Studio project (generated)
└── docs/
    ├── MOBILE-APP-SETUP.md   # This file
    └── CODE-SIGNING.md       # Code signing & distribution
```

## Configuration

### Capacitor Config (`capacitor.config.ts`)

Key settings:

- **appId**: `co.kenyonexpress.store` (reverse domain notation)
- **appName**: `קניון אקספרס`
- **webDir**: `out` (Next.js static export) or `.next` (for server mode)
- **server**: HTTPS enforced for Android; iOS uses iosSchemeless
- **plugins**: SplashScreen (2s delay, yellow background), StatusBar

### Next.js Config Integration

The Next.js `next.config.ts` should NOT have PWA plugins; Capacitor handles native features:

- ✓ Manifest serving (via `/manifest.webmanifest` route)
- ✓ Service Worker (public/sw.js, registered at runtime)
- ✗ Do NOT add `next-pwa` or similar plugins
- ✗ Do NOT add Workbox plugins

## Build Workflow

### 1. Prepare Web Build

```bash
# Development (server mode)
pnpm build           # Builds .next/ with optimization

# Production (static export, if needed)
next export          # Exports to out/ (NOT recommended for this app)
```

The app uses **server-side rendering** for dynamic catalog and checkout flows. Static export is NOT used.

### 2. Sync to Native Projects

```bash
# First time: initialize iOS & Android projects
pnpm mobile:sync

# Update after web changes
pnpm mobile:sync
```

This copies:
- Web build files
- Capacitor config
- Plugin configs
- Manifest & service worker

### 3. Build iOS App

```bash
# Open Xcode for signing & build
pnpm mobile:ios:open

# Or build directly (requires provisioning profile setup)
pnpm mobile:ios:build
```

**Xcode Location**: `ios/App/App.xcworkspace` (open this, NOT `.xcodeproj`)

**Key Files to Configure**:
- `ios/App/App/Info.plist`: App display name, orientation, permissions
- `ios/App/Podfile`: CocoaPods dependencies
- `ios/App/App.xcworkspace`: Project settings, signing & capabilities

### 4. Build Android App

```bash
# Open Android Studio
pnpm mobile:android:open

# Or build via command line
pnpm mobile:android:build
```

**Android Studio Location**: `android/` folder

**Key Files to Configure**:
- `android/app/build.gradle`: Signing config, SDK versions
- `android/app/src/main/AndroidManifest.xml`: Permissions, activities
- `android/gradle.properties`: JVM & build properties

## iOS Configuration

### File Structure

```
ios/App/
├── App.xcworkspace            # Use this for Xcode
├── Podfile                     # CocoaPods dependencies
├── App/
│   ├── Info.plist             # App metadata
│   ├── Capabilities.json       # iCloud, push, etc.
│   └── Supporting Files/
└── Pods/                       # CocoaPods (generated)
```

### Required Permissions (Info.plist)

```xml
<key>NSCameraUsageDescription</key>
<string>Camera is used to scan QR codes for vouchers and products.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Photo library is used to select product images for reviews.</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>Location is used to filter nearby stores and offers.</string>

<key>NSUserTrackingUsageDescription</key>
<string>Your activity helps us improve your shopping experience.</string>
```

### Build Settings

**Minimum Deployment Target**: iOS 14.0

**Supported Orientations**:
- Portrait
- Landscape (iPad only)

**Status Bar**: Dark content on yellow background (brand color #FED700)

## Android Configuration

### File Structure

```
android/
├── gradle/                  # Gradle wrapper
├── app/
│   ├── build.gradle        # App-level Gradle config
│   ├── src/
│   │   ├── main/
│   │   │   ├── AndroidManifest.xml
│   │   │   ├── res/         # Drawables, strings, layouts
│   │   │   └── java/        # Native code
│   │   └── release/
│   │       └── signing-config.properties
│   └── keystore/            # Signing keys (git-ignored)
└── build.gradle            # Project-level Gradle config
```

### Required Permissions (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Build Settings

**Minimum SDK**: API 26 (Android 8.0)
**Target SDK**: API 35 (Android 15) or higher
**Compile SDK**: API 35+

**Signing Config** (`android/app/build.gradle`):

```gradle
signingConfigs {
    release {
        storeFile file(System.getenv('KEYSTORE_FILE') ?: 'keystore.jks')
        storePassword System.getenv('KEYSTORE_PASSWORD')
        keyAlias System.getenv('KEY_ALIAS')
        keyPassword System.getenv('KEY_PASSWORD')
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

## PWA Hardening for App Store

### Service Worker Security

The app's service worker (`public/sw.js`) should:
- ✓ Cache assets with versioning (immutable hashes)
- ✓ Update check on every app launch
- ✓ Invalidate auth tokens on logout
- ✓ Enforce HTTPS in production

### App Manifest Validation

The web manifest (`/manifest.webmanifest`) includes:
- ✓ Unique app ID (`co.kenyonexpress.store`)
- ✓ Hebrew display names
- ✓ Brand colors (#FED700, #dc3545)
- ✓ Multiple icon sizes (192x192, 512x512)
- ✓ `display: "standalone"` (full screen)

### Safe Area & Notch Support

Capacitor automatically handles:
- ✓ Status bar insets (iOS notch, Android system bars)
- ✓ Bottom nav bar offsets (Android)
- ✓ Landscape safe areas (iPad)

**In CSS**: Use `env(safe-area-inset-*)` for custom adjustments:

```css
.header {
  padding-top: env(safe-area-inset-top);
}

.footer {
  padding-bottom: env(safe-area-inset-bottom);
}
```

### Network Resilience

- ✓ Service worker caches critical paths (`/`, `/products`, `/categories`)
- ✓ Offline fallback page (via service worker)
- ✓ Queue outgoing requests (orders, payments) with retry logic
- ✓ Sync API for background sync (payments on return to online)

### App Store Compliance

#### iOS App Store

- [ ] Privacy policy linked in `Info.plist`
- [ ] Terms of service accessible in-app
- [ ] IDFA disclosure for analytics (PostHog, Sentry)
- [ ] Screenshot validation (3 shots at 4 sizes: iPhones + iPad)
- [ ] Marketing name in App Store metadata

#### Google Play Store

- [ ] Privacy policy URL in Play Console
- [ ] Terms URL (link or in-app)
- [ ] Content rating questionnaire completed
- [ ] Screenshots (4-5 at phone + tablet sizes)
- [ ] Feature graphic (1024x500 banner)
- [ ] Promo graphic (180x120 icon)
- [ ] Signed APK/AAB with proper keystore

## Testing & Verification

### Local Testing

```bash
# 1. Build web
pnpm mobile:build:web

# 2. Sync to native
pnpm mobile:sync

# 3. Test on device/simulator
pnpm mobile:ios:open          # Xcode → Run button
# or
pnpm mobile:android:open      # Android Studio → Run
```

### Device Testing Checklist

- [ ] App launches without crashes
- [ ] Status bar color matches (#FED700 on yellow background)
- [ ] All icons render correctly
- [ ] Service worker caches assets
- [ ] Offline mode shows cached content
- [ ] RTL (Hebrew) layout works on home screen
- [ ] Splash screen displays for 2s
- [ ] Deep links work (product URLs, voucher codes)
- [ ] Camera permissions request shows
- [ ] Payments redirect back correctly from Cardcom

### Build Verification

```bash
pnpm mobile:verify     # Validate config, check for common issues
```

## Troubleshooting

### iOS

**Problem**: Xcode project missing or corrupted

```bash
# Regenerate
rm -rf ios
pnpm mobile:sync
```

**Problem**: Pod dependencies fail

```bash
cd ios/App
pod repo update
pod deintegrate
pod install
```

**Problem**: Code signing errors

See `docs/CODE-SIGNING.md` for detailed signing setup.

### Android

**Problem**: `JAVA_HOME` not set

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 11)
# Add to ~/.zshrc or ~/.bash_profile
```

**Problem**: Gradle sync fails

```bash
cd android
./gradlew clean
./gradlew build
```

**Problem**: Build fails on M1/M2 Mac

```gradle
// android/build.gradle
allprojects {
  // ...
  configurations.all {
    resolutionStrategy {
      force 'com.google.protobuf:protobuf-java:3.21.2'
    }
  }
}
```

## Continuous Integration

### GitHub Actions Workflow

For CI builds, configure:

```bash
# Generate signing credentials
# Stored as GitHub Secrets:
# - KEYSTORE_BASE64: base64-encoded Android keystore
# - SIGNING_CERTIFICATE_BASE64: iOS provisioning profile
# - APPLE_TEAM_ID: Apple Team ID
# - APPLE_BUNDLE_ID: co.kenyonexpress.store
```

See `.github/workflows/build-mobile.yml` for full CI setup.

## Resources

- [Capacitor Documentation](https://capacitorjs.com)
- [iOS App Store Connect](https://appstoreconnect.apple.com)
- [Google Play Console](https://play.google.com/console)
- See `docs/CODE-SIGNING.md` for certificate generation & signing

## Next Steps

1. Complete code signing setup (see `CODE-SIGNING.md`)
2. Build and test on iOS device/simulator
3. Build and test on Android device/emulator
4. Submit to App Store and Play Store
