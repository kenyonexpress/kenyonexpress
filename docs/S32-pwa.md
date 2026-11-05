# S32: PWA, extended and measured

Queue item S32, 06.11.2026. **RESULT: DONE.**

The PWA from W14, S21 and G7 was kept as it is and extended in four places.
On a production build it scores 100 in the Lighthouse PWA category (Lighthouse 11.7.1, the last version that has one), passes the installability gate 31 of 31, and passes a new in-browser offline check 12 of 12.

## What was there, and what was missing

Already in the repo, and not replaced:

| Spec line | Where it lives | Since |
|---|---|---|
| `manifest.webmanifest`, `he`, `rtl`, `standalone`, theme | `src/app/manifest.ts`, a typed metadata route that Next serves at `/manifest.webmanifest` | W14 |
| Icons 192 / 512 / maskable | `public/icons/`, written by `scripts/generate-pwa-icons.mjs` from `public/logo.png` | W14 |
| Install prompt after first purchase | `<InstallPrompt moment="first-purchase" />` on `/checkout/return`, inside the `isFirstPaidOrder` branch | W14 |
| Offline shell page | `/offline` (rendered) and `public/offline.html` (static, script-free), both precached by `public/sw.js` (`ke-v4`) | G7 |
| Push upkeep in the worker | `public/sw.js`, end of file | S21 |

Missing, and added here:

1. **The name.** The manifest said `name: 'קניון אקספרס'`. The spec asks for `Kenyon EXPRESS`.
2. **A browser measurement of offline.** Nothing drove a real browser offline. The existing gate reads the wire only.
3. **Tests on the first-purchase gate.** `isFirstPaidOrder` had no test, and nothing locked that the invitation sits inside its branch.
4. **A Lighthouse PWA number.** The repo's Lighthouse is 13.5, which has no PWA category.

## Changed files

| File | Change |
|---|---|
| `src/app/manifest.ts` | `name: 'Kenyon EXPRESS'`. `short_name` stays `קניון`. Nothing else moved. |
| `src/app/manifest.test.ts` | Asserts the new `name`; the Hebrew rule now applies to `short_name`, the launcher label. |
| `scripts/pwa-installability.mjs` | The "name is Hebrew" check became two: `name` is the brand name, `short_name` is Hebrew. 31 checks, was 30. |
| `scripts/pwa-offline-check.mjs` | New. Chromium against a running build: worker control, precache, a visited browse page offline, an unvisited page offline, a money path offline. `pnpm pwa:offline`. |
| `package.json` | The `pwa:offline` script. |
| `src/server/queries/first-purchase.test.ts` | New, 6 tests: one paid order is true; repeat customer, guest, missing order, failed read and unpaid are all false. |
| `src/app/(store)/checkout/return/install-after-first-purchase.test.ts` | New, 3 tests: the invitation is rendered once, only in the branch `isFirstPaidOrder` answered true, and under the first-purchase banner. |
| `e2e/pwa.spec.ts` | Asserts `name`, a Hebrew `short_name` and `theme_color`. One assertion that was already failing is fixed (see below). |

`public/sw.js`, `public/offline.html`, `src/app/offline/page.tsx`, `InstallPrompt.tsx` and the icons are byte-identical to before.
No frozen path was touched: `git diff design-locked-2026-10-19 -- <frozen paths>` is empty.

## Verification

All on `VERCEL= CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3332 pnpm build` (exit 0) and `pnpm start` on port 3332, headless Chrome 156, 06.11.2026.

### Manifest

```
GET /manifest.webmanifest  200  content-type: application/manifest+json
{"id":"/","name":"Kenyon EXPRESS","short_name":"קניון","start_url":"/","scope":"/",
 "display":"standalone","orientation":"portrait","theme_color":"#fed700",
 "background_color":"#ffffff","lang":"he","dir":"rtl", ... 3 shortcuts, 3 icons}
```

### Lighthouse PWA

`npx lighthouse@11.7.1 <url> --only-categories=pwa`, run from outside the repo. Nothing was added to `package.json`.

| Page | PWA score | installable-manifest | splash-screen | themed-omnibox | content-width | viewport | maskable-icon |
|---|---|---|---|---|---|---|---|
| `/` | 100 | pass | pass | pass | pass | pass | pass |
| `/products` | 100 | pass | pass | pass | pass | pass | pass |

No runtime error and no run warnings. The three remaining audits in the category are manual ones and carry no score.

### Installability gate

```
$ LOCAL_BASE=http://localhost:3332 pnpm pwa:installable
PASS  manifest name is the brand name  (Kenyon EXPRESS)
PASS  manifest short_name (the launcher label) is Hebrew  (קניון)
PASS  icon /icons/icon-192.png is a PNG of its declared size  (status 200, file 192x192, declared 192x192)
PASS  icon /icons/icon-512.png is a PNG of its declared size  (status 200, file 512x512, declared 512x512)
PASS  icon /icons/icon-maskable-512.png is a PNG of its declared size  (status 200, file 512x512, declared 512x512)
...
pwa installability: 31/31 checks pass against http://localhost:3332
```

### Offline, in a browser

```
$ LOCAL_BASE=http://localhost:3332 pnpm pwa:offline
PASS  worker controls the page after one visit  (http://localhost:3332/sw.js)
PASS  precache holds /offline  (ke-v4-static)
PASS  precache holds /offline.html  (ke-v4-static)
PASS  precache holds /icons/icon-192.png  (ke-v4-static)
PASS  /products answers 200 online  (status 200)
PASS  /products is in the pages cache
PASS  offline: /products is served from the pages cache  (status 200, fromServiceWorker true, title "חנות | קניון אקספרס")
PASS  offline: /terms-and-conditions gets the offline shell  (status 200, fromServiceWorker true, h1 "אין חיבור לאינטרנט")
PASS  offline shell is lang=he dir=rtl  (lang he dir rtl)
PASS  offline shell offers a retry link  (/)
PASS  offline shell has no horizontal scroll at 380  (0px)
PASS  offline: /cart is not answered from any cache  (page.goto: net::ERR_INTERNET_DISCONNECTED at http://localhost:3332/cart)
pwa offline: 12/12 checks pass against http://localhost:3332
```

### Icons

`node scripts/generate-pwa-icons.mjs` was rerun and the four files came out byte-identical to the committed ones (sha256 compared before and after), so the shipped icons are exactly what `public/logo.png` produces.

| File | Size | Purpose | sha256 (first 12) |
|---|---|---|---|
| `icon-192.png` | 192x192 | any | `7674eca6097a` |
| `icon-512.png` | 512x512 | any | `09977adf4e89` |
| `icon-maskable-512.png` | 512x512 | maskable, mark inside a 60% safe box | `37b164541187` |
| `apple-touch-icon.png` | 180x180 | iOS | `997628043692` |

### Tests

| Check | Result |
|---|---|
| `e2e/pwa.spec.ts`, chromium, against the same build | 4 of 4 pass |
| vitest, the eight PWA test files (manifest, install prompt and the rest of `components/pwa`, worker, worker push, first purchase x2) | 101 pass |
| vitest, whole suite | 8235 pass, 13 skipped, 0 fail (695 files) |
| `pnpm type-check` | exit 0 |
| `pnpm lint` | exit 0, docs-index-gate 352 documents |
| Freeze gate | empty |

`compare.mjs` was not run. No page changed: the diff is a manifest string, tests and scripts.

## Decisions taken alone

- **`name` is `Kenyon EXPRESS`, `short_name` stays `קניון`.** The spec names `name` only. `name` is what the install dialog and the splash screen print, next to the logo. `short_name` is the label under the icon, and W14 made it Hebrew on purpose. The iOS title in the frozen `layout.tsx` is `קניון` as well, so the launcher label is the same on both platforms.
- **Icons kept, not regenerated from another file.** See the next section.
- **The worker's bypass list was not widened.** Offline, `/cart`, `/checkout`, `/account`, `/supplier` and `/admin` still fail in the browser instead of showing the offline shell. The worker's header calls that list the feature, `service-worker.test.ts` asserts it, and the item says extend, not replace. The offline check now measures it as intended behaviour.
- **One pre-existing e2e failure fixed.** `e2e/pwa.spec.ts` expected one of `mobile-web-app-capable` / `apple-mobile-web-app-capable`. The layout has shipped both since W14, deliberately, so the selector matched 2 and the test failed before this item. It now expects each tag once.
- **Lighthouse 11.7.1 through `npx`, not as a dependency.** It is the only way to get a "Lighthouse PWA" number: the category was removed in 12.0.

## Not verified

- **The logo's origin in `wp_import`.** `wp_import/raw/attachment_page_0001.json` lists the WordPress logo as attachment 5511, `wp-content/uploads/2021/10/logo.png`, by URL only. The binary is not in `wp_import/media/` (that folder holds the 66 product images). The old origin answers 403 now, and the Wayback Machine has no copy of that file. So `public/logo.png` (133x102, in the repo since 04.06.2026 and the source of every icon, splash screen and the JSON-LD logo) could not be compared byte for byte with attachment 5511. The only logo-like file the archive does hold is attachment 5666, the old site favicon (a cart on a yellow disc, 208x228). It is a different mark from the header logo and was not used.
- **A real install on a phone.** Headless Chrome never fires `beforeinstallprompt`. What was measured is Chrome's own installability verdict (through Lighthouse) and the component's behaviour on a synthetic event (vitest). The first-purchase invitation was not seen on a device after a real paid order.
- **Production.** It answers 503 under `MAINTENANCE_MODE`, so every number here is from the local build.
