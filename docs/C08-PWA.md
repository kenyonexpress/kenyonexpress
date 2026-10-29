# C08 — PWA mobile (re-verification)

Item C08 asked for manifest, service worker, offline fallback, install prompt, Web Share and iOS splash. All of it was built in C07/C09 (see `docs/C07-PWA.md`, `docs/L8-PWA-REPORT.md`). C08 adds no code: it re-verifies on a fresh `next start` of the current build and closes the Lighthouse PWA gate.

## Components (unchanged)
- Manifest: `src/app/manifest.ts` (standalone, he/rtl, theme `#fed700`, 192/512/maskable icons).
- Service worker: `public/sw.js`, network-first navigation, `/offline` fallback, money/account/admin paths bypassed.
- Install prompt: `src/components/pwa/InstallPrompt.tsx` (post-purchase, never on checkout).
- Web Share: `src/components/shared/NativeShareButton.tsx` (client-only, rendered when `navigator.share` exists, so absent from SSR HTML).
- iOS splash: 9 images in `public/splash/`, exposed from `src/app/(store)/layout.tsx` (root `layout.tsx` is locked, not touched).
- `next-pwa` is deliberately not used (unmaintained, conflicts with Next 16); the hand-written worker is kept.

## Verification (2026-10-30, `next start` on port 3408)
| Check | Result |
|---|---|
| `/manifest.webmanifest`, `/sw.js`, `/offline`, `/`, `/product/barbecue` | all 200 |
| Manifest name/short_name `קניון EXPRESS`, `display: standalone`, `dir: rtl` | pass |
| `apple-touch-startup-image` links on `/` and `/product/barbecue` | 9 each |
| `/sw.js` headers | `max-age=0, must-revalidate`, `Service-Worker-Allowed: /` |
| `/offline` title | `אין חיבור | קניון EXPRESS` |
| **Lighthouse 11.7.1 PWA category, `/`** | **score 1.00 (100)** — installable-manifest, splash-screen, themed-omnibox, viewport, content-width, maskable-icon all 1 |

## Gate note
The installed Lighthouse 13.5 has no PWA category, so the >=90 gate was measured with `npx lighthouse@11` (last version with the category). Gate passes: 100 vs >=90.

## Not run
- `compare.mjs` visual gate: no layout or CSS changed in this item.
- Real-device iOS Add-to-Home-Screen and a live offline navigation in this run (offline fallback was verified in C09 via Playwright).
- Splash images apply to `(store)` routes only; `(main)` routes use the root appleWebApp without startup images.

No forbidden files touched. No migrations. No money code.
