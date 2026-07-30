# ARCHITECTURE-PWA.md

ארכיטקטורת **PWA** (שלב ביניים לפני/ליד אפליקציה נייטיבית).

Status: BINDING · `ke-arch` · Date: 2026-07-31 · docs only.  
Companion: `ARCHITECTURE-MOBILE-APP.md`.

## Goals
- Installable on Android/iOS (where supported).  
- Offline read of active voucher QR.  
- Push via Web Push if native app delayed (optional).  
- Same Supabase backend; no second DB.

## Scope
| In | Out |
|---|---|
| `manifest.webmanifest`, icons, theme `#fed700` | Full offline checkout |
| Service worker: app shell + voucher cache | Storing PAN |
| Add-to-home UX Hebrew | Replacing SEO web |

## Caching
- Cache-first: shell CSS/JS.  
- Network-first: catalog/prices.  
- Explicit cache: issued vouchers list + QR data URLs for current user only (clear on logout).

## Security
SW never gets service role. Auth tokens in HttpOnly cookies preferred over localStorage when possible with Supabase SSR patterns.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | PWA binding in `ke-arch` (`arch/docs-queue`) |
