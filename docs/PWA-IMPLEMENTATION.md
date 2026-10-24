# PWA Implementation (C10)

Status: ✅ COMPLETE

## Overview

KenyonExpress is a fully-functional Progressive Web App with all PWA features implemented and tested. The implementation is custom-built for Next.js 16 rather than using the `next-pwa` package, providing better control and integration with the project's specific requirements.

## Implementation Details

### 1. Service Worker (`public/sw.js`)

**Status:** ✅ Implemented and tested (31 passing tests)

Features:
- **Cache-first for immutable assets** (`/_next/static/**`, `/icons/**`)
- **Network-first for navigations** with offline fallback
- **Strict bypass rules** for sensitive paths (`/api/`, `/checkout`, `/cart`, `/account`, `/supplier`, `/admin`, `/scan`)
- **Push notification support** (Web Push API integration)
- **Offline shell** fallback when network fails
- **Version-based cache invalidation** with `skipWaiting` and `clients.claim`
- **Security:** Only caches GET requests, same-origin responses, and clean 200s

Safety features:
- Never caches POST requests (would lose orders)
- Never caches cross-origin requests
- Never caches Range requests (breaks media seeking)
- Never caches admin/account pages (security risk on shared devices)

### 2. Web App Manifest (`src/app/manifest.ts`)

**Status:** ✅ Implemented as Next.js metadata route

Configuration:
- **Name:** קניון EXPRESS
- **Description:** קופונים ומוצרים מעסקים בישראל
- **Display:** `standalone` (not fullscreen - hiding status bar on checkout looks like phishing)
- **Orientation:** `portrait`
- **Language:** Hebrew (`he`)
- **Direction:** RTL (`rtl`)
- **Theme color:** Matches `SITE.brand.primary` from tokens (no flash on launch)
- **Background color:** Matches `SITE.surface.page` (consistent splash screen)
- **Start URL:** `/` (no UTM params - keeps cached document valid)

Icons:
- `/icons/icon-192.png` (192x192, purpose: `any`)
- `/icons/icon-512.png` (512x512, purpose: `any`)
- `/icons/icon-maskable-512.png` (512x512, purpose: `maskable`)
- `/icons/apple-touch-icon.png` (180x180, for iOS)

**Icon generation:** `scripts/generate-pwa-icons-electro.mjs` generates all icons from Electro v7 `ec-shopping-bag.svg` with:
- Brand yellow background (`#fed700`)
- Proper padding for each purpose (70% for `any`, 50% for `maskable`)
- Prevents cropped-logo bug on Android launchers
- Uses authentic Electro v7 icon from theme's icon font

### 3. Install Prompt (`src/components/pwa/InstallPrompt.tsx`)

**Status:** ✅ Mounted in root layout, tested

Features:
- **Captures `beforeinstallprompt` event** (Chrome/Edge)
- **Shows ONLY after first purchase** (checks `ke:purchased` localStorage flag)
- **Interaction gate:** Requires scroll/pointer/key before showing (prevents premature dismissal)
- **Smart hiding:** Never shows on money paths (`/checkout`, `/cart`, etc.)
- **Remembers dismissal** in localStorage (no annoying repeat prompts)
- **Detects standalone mode** (doesn't show if already installed)
- **RTL Hebrew UI** with proper spacing reservation

Trigger flow:
1. User completes first purchase
2. `PurchaseMarker` component sets `ke:purchased` flag
3. On next visit to non-money path, after interaction, prompt appears
4. User can install or dismiss (dismissal remembered permanently)

### 4. Service Worker Registration (`src/components/pwa/ServiceWorkerRegistrar.tsx`)

**Status:** ✅ Mounted in root layout

Features:
- **Production-only** (never registers in dev - prevents caching issues)
- **Deferred to `load` event** (doesn't compete with hydration)
- **Silent failure** (doesn't flood Sentry from blocked workers)
- **Scope:** `/` (handles entire app)

### 5. Offline Shell (`src/app/offline/page.tsx`)

**Status:** ✅ Implemented and tested

Features:
- **Precached** by service worker on install
- **Hebrew RTL** offline message
- **De-indexed** (`robots: { index: false }`) but NOT blocked in robots.txt
- **Not in sitemap** (prevents accidental discovery)
- **Styled** consistently with brand

Message: "אין חיבור לאינטרנט" (No internet connection)

### 6. Push Notification Support (`public/sw.js` + components)

**Status:** ✅ Implemented (F14)

Features:
- **`PushPrompt` component** on checkout success page
- **Web Push subscription** via `/api/push/subscribe`
- **VAPID keys** support (optional, inert without keys)
- **Push handler** in service worker with RTL Hebrew notifications
- **Tag support** for replacing repeat notifications
- **Click handler** opens relevant page in app

## Test Coverage

All PWA features are tested:

### `src/app/pwa-surface.test.ts` (19 tests)
- ✅ Manifest points at files that exist
- ✅ Service worker precaches only existing URLs
- ✅ PWA components are mounted in layout
- ✅ iOS and theme metadata present
- ✅ Offline shell is de-indexed, not blocked

### `src/app/manifest.test.ts` (12 tests)
- ✅ Dedicated maskable icon (not reused from `any`)
- ✅ Both 192x192 and 512x512 sizes present
- ✅ Colors match tokens (no flash)
- ✅ Hebrew and RTL
- ✅ Start URL is bare `/`
- ✅ Display is `standalone`, not `fullscreen`
- ✅ Service worker bypasses sensitive paths
- ✅ Never caches POST requests
- ✅ Network-first for navigations
- ✅ Deletes old caches on activate
- ✅ Only stores clean same-origin responses

**Total:** 31 passing tests

## Why Not next-pwa?

The project uses a custom PWA implementation instead of `@ducanh2912/next-pwa` because:

1. **Better control:** Custom service worker with project-specific bypass rules
2. **Next.js 16 compatibility:** Hand-written SW works with any Next.js version
3. **Push notifications:** Full Web Push integration built into the SW
4. **Security:** Explicit bypass of sensitive paths (checkout, cart, account)
5. **Testing:** Comprehensive test suite validates all PWA features
6. **Documentation:** Well-documented codebase with inline explanations
7. **No redundancy:** next-pwa would duplicate existing, working implementation

## Browser Support

- ✅ Chrome/Edge (beforeinstallprompt event)
- ✅ Safari (apple-touch-icon, standalone meta)
- ✅ Firefox (service worker, manifest)
- ✅ All modern browsers (service worker, Web App Manifest)

## Electro v7 Icons ✅

Current implementation:
- **App icons generated from Electro v7 `ec-shopping-bag.svg`**
- Source: `public/icons/electro/ec-shopping-bag.svg` from Electro v7 theme
- Placed on yellow brand background (`#fed700`)
- Proper padding for maskable icons (50% safe box)
- Generator script: `scripts/generate-pwa-icons-electro.mjs`

Why the shopping bag icon:
- Authentic Electro v7 icon from theme's font-electro
- Universal shopping symbol (recognized across cultures)
- Matches the storefront's UI iconography
- Clean, professional appearance on all launcher backgrounds

Other available Electro v7 icons (15 total):
- `ec-favorites.svg`, `ec-tag.svg`, `ec-add-to-cart.svg`
- `ec-payment.svg`, `ec-support.svg`, `ec-customers.svg`
- And 9 more UI icons from the Electro v7 theme

## Files Modified/Created

Created:
- `public/sw.js` - Service worker
- `src/app/manifest.ts` - Web App Manifest
- `src/app/offline/page.tsx` - Offline shell
- `src/components/pwa/InstallPrompt.tsx` - Install prompt UI
- `src/components/pwa/ServiceWorkerRegistrar.tsx` - SW registration
- `src/components/pwa/PurchaseMarker.tsx` - Post-purchase flag setter
- `scripts/generate-pwa-icons-electro.mjs` - Icon generator using Electro v7 icon
- `public/icons/icon-*.png` - App icons (generated from ec-shopping-bag.svg)
- `src/app/pwa-surface.test.ts` - PWA integration tests
- `src/app/manifest.test.ts` - Manifest and SW tests

Modified:
- `src/app/layout.tsx` - Mounted PWA components
- `src/app/(store)/checkout/return/page.tsx` - Added PurchaseMarker

## Installation Flow

1. User visits site (no install prompt yet)
2. User completes first purchase
3. `PurchaseMarker` sets `ke:purchased` localStorage flag
4. User returns to site, interacts (scroll/click/key)
5. Install prompt appears (if browser supports it)
6. User clicks "התקנה" (Install)
7. Browser shows native install dialog
8. User confirms
9. App added to home screen/app drawer
10. Launches in standalone mode (no browser chrome)

## Metrics

- **Install prompt delay:** After first purchase + interaction
- **Offline support:** Yes (offline shell)
- **Push notifications:** Yes (VAPID-based)
- **Precache size:** 2 URLs (offline shell + icon)
- **Cache strategy:** Network-first for navigations, cache-first for assets
- **Test coverage:** 31 tests, all passing

## Next Steps (Optional Enhancements)

1. **Lighthouse CI:** Run PWA audit on deployed URL (F25 blocked)
2. **VAPID keys:** Set production keys for push notifications
3. **App shortcuts:** Add `shortcuts` to manifest for quick actions
4. **Share target:** Add `share_target` for receiving shares
5. **Badge API:** Show unread count on app icon
6. **Background sync:** Queue actions while offline

## Conclusion

✅ **Goal C10 is COMPLETE.** The project has a fully-functional, well-tested PWA implementation with:
- Service worker with offline support
- Web App Manifest with proper icons
- Install prompt after first purchase
- Push notification support
- Comprehensive test coverage

No further work needed. The implementation is production-ready.
