# L8 / C09 - PWA report

Date: 2026-10-25. Branch: closeout/v1-final. Verified on `pnpm build` + `next start` (port 3311), Chromium via Playwright.

## What already existed (verified, not rebuilt)
- `src/app/manifest.ts` -> `/manifest.webmanifest`: name/short_name `קניון EXPRESS`, standalone, RTL/he, theme `#fed700`, 192 / 512 / 512-maskable icons (all present under `public/icons/`).
- `public/sw.js`: network-first navigations, cache-first `/_next/static` + `/icons`, `/offline` precached, bypass for non-GET, `/api`, `/checkout`, `/cart`, `/account`, `/supplier`, `/admin`, `/scan`, cross-origin and Range. Push + notificationclick handlers.
- `src/app/offline/page.tsx` (noindex, not in robots/sitemap), `ServiceWorkerRegistrar`, `InstallPrompt` (shown only after a first purchase and a real interaction; iOS variant is instructions only), apple-touch-icon + theme-color metadata.

## Found and fixed
1. **Site did not hydrate under the production CSP (critical, from C75).** `src/proxy.ts` emitted `script-src 'self' 'nonce-...' 'strict-dynamic'`. With `cacheComponents` the shell is prerendered, so Next's chunk `<script src>` tags and inline bootstrap carry no nonce and were all blocked: 23-74 blocked scripts per route (`/`, `/offline`, `/login`, `/cart`, `/terms`, `/c`), no hydration, `$RC is not defined`, and the service worker never registered. Fix: proxy now emits the no-nonce policy (`'unsafe-inline'`) from `contentSecurityPolicyFor(pathname)`. Nonce header plumbing is kept for when the shell can be rendered per request. Security trade-off: script-src is back to the pre-C75 level; the C75 A+ target on securityheaders.com is not met until per-request rendering exists.
2. **`/sw.js` was served with `max-age=3600`** by the catch-all header rule, delaying worker updates and the `VERSION` kill switch. Added a last-in-list `/sw.js` rule: `public, max-age=0, must-revalidate` + `Service-Worker-Allowed: /` (`next.config.ts`).
3. Install banner text said `KenyonExpress`; now `קניון EXPRESS`.
4. `pwa-surface.test.ts` now pins that `sw.js` keeps the fetch, push and notificationclick handlers together.

## Verification
| Check | Result |
|---|---|
| Manifest fetched, 0 manifest errors (CDP `Page.getAppManifest`) | pass |
| Chrome installability errors (`Page.getInstallabilityErrors`) | `[]` |
| Icons 192 / 512 / maskable / apple-touch, `/offline`, `/sw.js` | all 200 |
| SW registers on load, scope `/`, state `activated`, controls page after reload | pass |
| Offline navigation to an uncached `/c/...` URL | 200, shows `אין חיבור | קניון EXPRESS`, `dir=rtl` |
| `sw.js` Cache-Control | `max-age=0, must-revalidate` |
| Hydration under production CSP | pass (was failing) |
| `pnpm build`, `tsc --noEmit` | pass |
| vitest `src/app src/components/pwa src/lib/security` | 76 files / 700 tests pass |

## Lighthouse PWA 90+
Lighthouse 13.5 (installed) removed the PWA category; there is no PWA score to read. The equivalent checks are the installability and service-worker criteria above, all passing with zero errors. Performance, accessibility and SEO scores are tracked in the C33 / G23 reports.

## Not run
- `compare.mjs` visual gate: no layout/CSS changed by this item. Note that fixing hydration can change what renders on the production build, so the next compare run on a prod build may differ from earlier numbers (C08 was BLOCKED on that gate independently).
- Real-device iOS Add-to-Home-Screen.
