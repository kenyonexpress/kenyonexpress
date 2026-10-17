# Code Signing Setup for iOS & Android Builds

This document provides step-by-step instructions for setting up code signing for KenyonExpress native app builds.

## Overview

Code signing ensures that:
- ✓ Your app is authentic and hasn't been tampered with
- ✓ Users can trust the app came from you
- ✓ The app can be distributed via App Store and Play Store
- ✓ In-app purchases and push notifications work

### Key Concepts

- **iOS**: Requires Apple Developer account, certificates, provisioning profiles, and team ID
- **Android**: Requires a keystore file (JKS format) with signing key and password

## iOS Code Signing

### Prerequisites

- Apple Developer account ($99/year)
- Xcode 14+
- macOS 12+
- Apple device for testing (iPad/iPhone) or simulator

### Step 1: Apple Developer Setup

1. Go to [developer.apple.com](https://developer.apple.com)
2. Sign in with Apple ID
3. Enroll in Apple Developer Program ($99/year)
4. Navigate to "Certificates, Identifiers & Profiles"

### Step 2: Create App ID

1. Click "Identifiers" in left sidebar
2. Click "+" to create new identifier
3. Select "App IDs"
4. Choose "App"
5. Fill in:
   - **Description**: "KenyonExpress"
   - **Bundle ID**: `co.kenyonexpress.store` (Explicit)
6. Select capabilities:
   - ✓ App Groups (for sharing data with extensions)
   - ✓ Associated Domains (for universal links)
   - ✓ Push Notifications
   - ✓ In-App Purchase
   - ✓ HealthKit (if needed)
7. Click "Register"

### Step 3: Create Certificate

#### Development Certificate (for testing)

1. Click "Certificates" in sidebar
2. Click "+" to create new
3. Select "Apple Development"
4. Follow prompts to upload CSR (Certificate Signing Request)

#### To Generate CSR in Xcode

```bash
# In Xcode: Xcode → Settings → Accounts → Your Apple ID
# Click "Manage Certificates"
# Click "+" → "Apple Development"
```

Or use Keychain Access:

```bash
# Open Keychain Access → Certificate Assistant → Request a Certificate
# Enter email and save to disk as request.certSigningRequest
# Upload to developer.apple.com when prompted
```

#### Production Certificate (for App Store)

1. Click "+" → "Apple Distribution"
2. Upload CSR
3. Download certificate
4. Double-click to install in Keychain Access

### Step 4: Create Provisioning Profile

#### Development Profile

1. Click "Profiles" in sidebar
2. Click "+"
3. Select "iOS App Development"
4. Select the App ID created above (`co.kenyonexpress.store`)
5. Select your Development certificate
6. Select devices to test on (or "All Devices")
7. Name it: `KenyonExpress Development`
8. Download and drag into Xcode

#### Distribution Profile

1. Click "+" → "App Store Connect"
2. Select App ID
3. Select your Distribution certificate
4. Name it: `KenyonExpress Distribution`
5. Download and install

### Step 5: Configure Xcode

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select "App" in left sidebar
3. Go to "Signing & Capabilities" tab
4. Under "Signing":
   - **Team ID**: Select your Apple Team
   - **Bundle Identifier**: Should be `co.kenyonexpress.store`
   - **Provisioning Profile**: Select "KenyonExpress Development" (for dev) or "KenyonExpress Distribution" (for App Store)
5. Click "+ Capability" and add:
   - Push Notifications
   - In-App Purchase
   - Associated Domains (for deep linking)

### Step 6: Build & Test

```bash
# Connect an iOS device via USB
# Or use simulator (Xcode → Open Simulator)

cd ios/App

# List connected devices
xcrun xcode-select --print-path

# Build for device
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -derivedDataPath build \
  -destination 'generic/platform=iOS' \
  build

# Build for App Store
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -derivedDataPath build \
  archive \
  -archivePath build/App.xcarchive
```

### Step 7: Submit to App Store

1. Ensure build is signed for distribution
2. In Xcode: Product → Scheme → Edit Scheme
3. Set Release configuration to use Distribution provisioning profile
4. Archive: Product → Archive
5. In Organizer: Click "Upload to App Store"
6. Follow prompts to submit
7. Log into App Store Connect to verify submission

### Troubleshooting iOS Signing

**Error**: "Code signing required"

```bash
# Ensure provisioning profile is installed
open ~/Library/MobileDevice/Provisioning\ Profiles/

# Or reinstall from Xcode:
# Xcode → Settings → Accounts → Manage Certificates
```

**Error**: "Bundle ID doesn't match"

```bash
# Update Bundle ID in Xcode project to: co.kenyonexpress.store
# Xcode → Target → General → Bundle Identifier
```

**Error**: "No matching provisioning profile found"

```bash
# Download profile from developer.apple.com
# Drag into Xcode or double-click to install
# Refresh in Xcode: Xcode → Settings → Accounts → Download Profiles
```

## Android Code Signing

### Prerequisites

- Android SDK (API 26+)
- Java 11+
- keytool (included with JDK)
- Android Gradle Plugin 8+

### Step 1: Generate Keystore

A keystore is a file containing your signing key and certificate. Generate one ONCE and keep it safe.

```bash
# Generate keystore
keytool -genkey -v -keystore android/app/keystore/release.jks \
  -keyalg RSA \
  -keysize 4096 \
  -validity 9125 \
  -alias kenyonexpress

# You'll be prompted for:
# - Keystore password: [Create strong password, e.g., 32 chars]
# - Key password: [Same as keystore password]
# - First and last name: KenyonExpress
# - Organization unit: Engineering
# - Organization: KenyonExpress
# - City: Tel Aviv
# - State: IL
# - Country code: IL
```

### Step 2: Store Credentials Securely

**Option A: Environment Variables (Local Development)**

```bash
# Add to ~/.zshrc or ~/.bash_profile
export KEYSTORE_FILE="$PWD/android/app/keystore/release.jks"
export KEYSTORE_PASSWORD="your_keystore_password"
export KEY_ALIAS="kenyonexpress"
export KEY_PASSWORD="your_key_password"

# Or create a .env.local (git-ignored):
KEYSTORE_FILE=android/app/keystore/release.jks
KEYSTORE_PASSWORD=your_keystore_password
KEY_ALIAS=kenyonexpress
KEY_PASSWORD=your_key_password
```

**Option B: CI/CD Secrets (GitHub Actions)**

```bash
# Encode keystore as base64
base64 -i android/app/keystore/release.jks -o keystore.b64

# Add to GitHub Secrets:
# - KEYSTORE_BASE64: [contents of keystore.b64]
# - KEYSTORE_PASSWORD: [password]
# - KEY_ALIAS: kenyonexpress
# - KEY_PASSWORD: [key password]
```

### Step 3: Configure Gradle

Edit `android/app/build.gradle`:

```gradle
android {
  // ... existing config

  signingConfigs {
    release {
      storeFile file(System.getenv('KEYSTORE_FILE') ?: 'keystore/release.jks')
      storePassword System.getenv('KEYSTORE_PASSWORD')
      keyAlias System.getenv('KEY_ALIAS') ?: 'kenyonexpress'
      keyPassword System.getenv('KEY_PASSWORD')
    }
  }

  buildTypes {
    release {
      signingConfig signingConfigs.release
      minifyEnabled true
      shrinkResources true
      proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
  }
}
```

### Step 4: Build Signed APK/AAB

```bash
# Build APK (for direct distribution or testing)
cd android
./gradlew assembleRelease

# Output: app/build/outputs/apk/release/app-release.apk

# Build AAB (for Google Play Store - required)
./gradlew bundleRelease

# Output: app/build/outputs/bundle/release/app-release.aab
```

### Step 5: Verify Signature

```bash
# Check APK signature
jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-release.apk

# Check keystore contents
keytool -list -v -keystore android/app/keystore/release.jks
```

### Step 6: Submit to Google Play

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create new app or select existing
3. Navigate to "Release" → "Production"
4. Click "Create new release"
5. Upload `app-release.aab` (AAB is mandatory for Play Store)
6. Fill in:
   - Release notes (Hebrew)
   - Version number
   - Rollout percentage (start with 1%, then 100%)
7. Review and publish

### Troubleshooting Android Signing

**Error**: "KEYSTORE_PASSWORD not set"

```bash
# Set environment variables
export KEYSTORE_PASSWORD="your_password"
export KEY_PASSWORD="your_password"

# Or edit build.gradle to handle missing env vars
storePassword System.getenv('KEYSTORE_PASSWORD') ?: 'default'
```

**Error**: "APK not signed"

```bash
# Check keystore exists and is readable
ls -la android/app/keystore/release.jks

# Verify keytool can read it
keytool -list -keystore android/app/keystore/release.jks
```

**Error**: "Wrong key password"

```bash
# Reset password (destructive - loses existing key)
# Safer: create new keystore with correct password
# Old keystore will no longer work for updates

# Generate new keystore with proper password
keytool -genkey -v -keystore android/app/keystore/release-new.jks \
  -keyalg RSA \
  -keysize 4096 \
  -validity 9125 \
  -alias kenyonexpress
```

**Important**: Once you publish an app, you MUST use the same keystore for updates. If lost:
1. You cannot update the app on Play Store
2. You must request an exception from Google
3. Better to keep backups in secure storage

## Security Best Practices

### Keystore Security

1. **Back up your keystore**
   ```bash
   # Create encrypted backup
   gpg -c android/app/keystore/release.jks
   # Encrypted as: release.jks.gpg
   ```

2. **Never commit to git**
   ```bash
   # Ensure .gitignore includes
   android/app/keystore/
   .env.local
   *.jks
   ```

3. **Use strong passwords**
   - Minimum 20 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Store in password manager (1Password, LastPass, etc.)

4. **Limit access**
   - Only share password through secure channels
   - Revoke access when team members leave
   - Audit who can sign releases

### Certificate Pinning (Advanced)

For extra security, pin the signing certificate in your app:

```typescript
// src/lib/security/certificate-pinning.ts
const CERTIFICATE_HASH = 'sha256/YOUR_CERT_HASH_HERE'

// Use with Capacitor's native bridge to verify SSL
```

## Renewal & Rotation

### iOS Certificates

- **Development**: No expiration
- **Distribution**: Expires in 1 year, must renew in App Store Connect

**To renew**:
1. Create new certificate (Steps above)
2. Download and install
3. Update Xcode project signing settings
4. Archive and submit

### Android Keystore

- **Validity**: 25 years (from generation date)
- **Action required**: None until expiration

**After expiration**:
- Cannot update existing app on Play Store
- Must request exception or publish as new app
- Better to plan far ahead

## Compliance & Legal

### App Store Requirements

- [ ] Privacy policy URL in app metadata
- [ ] Terms of service accessible in app
- [ ] Age rating (PEGI, ESRB, etc.)
- [ ] Content rating questionnaire
- [ ] Minimum iOS 14.0 deployment target

### Google Play Requirements

- [ ] Privacy policy published and linked
- [ ] Terms of service accessible
- [ ] Content rating questionnaire
- [ ] Declare use of sensitive permissions (camera, location)
- [ ] Follow Play Store Developer policies

## Resources

- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [Google Play Console Help](https://support.google.com/googleplay/answer)
- [Capacitor iOS App Signing](https://capacitorjs.com/docs/ios)
- [Capacitor Android Signing](https://capacitorjs.com/docs/android)
- [Code Signing Best Practices](https://developer.apple.com/support/code-signing/)

## Checklist for Release

- [ ] Test on physical iOS device
- [ ] Test on physical Android device
- [ ] Verify all permissions requests work
- [ ] Test deep linking (product URLs, voucher codes)
- [ ] Check app version number is incremented
- [ ] Sign with distribution certificates
- [ ] Build APK/AAB for Android
- [ ] Archive for iOS
- [ ] Submit to App Store Connect / Google Play
- [ ] Monitor for crashes in Sentry & App Store
- [ ] Plan for next release cycle (quarterly or monthly)
