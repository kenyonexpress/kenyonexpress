# G113 — PWA

## Already shipped (verified)
- `src/app/manifest.ts`: `display: standalone`, icons 192 + 512 (`any`) + 512 maskable, RTL/he, theme from tokens. Locked by `src/app/manifest.test.ts`.
- `public/sw.js`: cache-first for immutable assets, network-first navigations with `/offline` fallback, bypass list for money/per-user paths.

## Changed
- `public/sw.js` (`ke-v1` -> `ke-v2`, old caches purged on activate): stale-while-revalidate for `/images/**` and `/_next/image`. Cached copy is returned at once; a background fetch refreshes it (only clean same-origin 200s are stored).
- `src/components/pwa/InstallPrompt.tsx`: the banner gate moved from "after first purchase" to the 3rd view. `ke:views` in localStorage counts page loads; the offer appears from view 3 (`INSTALL_AT_VIEW`), still after a real interaction, still never on money paths, still permanently dismissible. `PURCHASED_KEY` remains exported for `PurchaseMarker`.

## Verification
- tsc clean, biome clean, 46 pwa/manifest tests pass (new test: banner absent on views 1-2, present on 3).
- Not run: real-device install, compare.mjs (no visual change; banner is unchanged markup).
- No forbidden files touched (`layout.tsx` already mounts `InstallPrompt`).
