# C07 — Mobile shell PWA

## Already in place (audited, unchanged)
- Manifest: `src/app/manifest.ts` (standalone, RTL/he, any + maskable icons).
- Service worker: `public/sw.js`, network-first navigations, `/offline` fallback, money/account paths bypassed; registered by `components/pwa/ServiceWorkerRegistrar.tsx`.
- Install prompt: `components/pwa/InstallPrompt.tsx` (deferred `beforeinstallprompt`, post-purchase, never on checkout).
- No `next-pwa` dependency: the hand-written worker is kept on purpose (unmaintained package, conflicts with Next 16 / Turbopack, and the worker's exclusions are the safety feature).

## Added
- Web Share: `components/shared/NativeShareButton.tsx`, mounted on the product page beside the WhatsApp button. Renders only when `navigator.share` exists.
- iOS splash: 9 launch images in `public/splash/` from `scripts/generate-pwa-splash.mjs`; device table and media queries in `src/lib/pwa/splash.ts`; exposed via `metadata.appleWebApp.startupImage` in `src/app/(store)/layout.tsx` because root `layout.tsx` is locked. Pinned by `src/lib/pwa/splash.test.ts`.

## Gate
- Lighthouse 13.5 has no PWA category, so a numeric PWA score >= 90 cannot be produced (see `docs/L8-PWA-REPORT.md`). Installability criteria (manifest, icons, worker, offline) pass.
- Not measured this run: a live Lighthouse run and the splash `<link>` output in rendered HTML (no dev server started). tsc, biome and vitest (94 tests in the touched areas) pass.
- Splash only applies to routes under the `(store)` group; `(main)` routes use the root appleWebApp without startup images.
