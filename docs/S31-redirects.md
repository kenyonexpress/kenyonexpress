# S31: WordPress redirects in next.config.ts

Queue item S31, 06.11.2026. **RESULT: DONE.**

The 20 retired WordPress URLs that moved now answer 301 from `redirects()` in `next.config.ts`.
A random draw of 20 old URLs returned 301 to a live route, 20 of 20, on a production build.

## What was there, and what was missing

The repo already had a liveness-checked legacy map (`scripts/build-legacy-redirects.mjs` writes `data/legacy/redirect-map.json`) and a database path for it: `src/proxy.ts` looks each request up in `public.seo_redirects`.
Production holds 34 active rows there today (20 x 301, 14 x 410).

Two things were missing:

- **A slug map.** Nothing listed, per WordPress entity, its id, its old slug and where it lives now, and nothing proved every permalink in the crawl was accounted for.
- **Redirects that do not need the database.** The proxy lookup sits behind the maintenance gate and a Supabase read. Config redirects are answered by the router before the proxy runs.

## The slug map

`scripts/build-wp-redirects.mjs` joins the crawl's permalinks onto the dispositions the measured map already holds, and writes `data/legacy/wp-slug-map.json`.
It decides nothing about liveness itself, and it fails if a permalink has no disposition.

| Type | Permalinks | 301 | 410 | Unchanged | Lost (404) |
|---|---|---|---|---|---|
| Product | 49 | 1 | 3 | 42 | 3 |
| Category | 11 | 11 | 0 | 0 | 0 |
| Page | 27 | 8 | 10 | 9 | 0 |
| Post | 0 | - | - | - | - |
| **Total** | **87** | **20** | **13** | **51** | **3** |

- **Posts:** the WXR export (`data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml`) has no `post_type=post` items: 28 pages, 48 products, no blog posts. The artefact records the zero.
- **Products:** 42 of 49 kept their slug, so their URLs are served unchanged and need no redirect.
- **Lost:** `/product/restaurants-meat-2`, `/product/restaurants-meat-3` and `/product/קופון-טסט` have no live target. They get no row, which is the existing decision in `legacy-redirects.test.ts`.
- **Source:** the script reads `data/legacy/*.json`, the committed copy of `wp_import/normalized/` (`wp_import/` is gitignored). The product and category permalink sets of the two were compared today and are identical.

## The redirects

`src/lib/seo/wp-redirects.generated.ts` holds the 20 rows.
`src/lib/seo/wp-redirects.ts` turns them into config entries, and `next.config.ts` spreads them into `redirects()`.

- **301, not 308.** Each entry uses `statusCode: 301`. `permanent: true` is a 308 in Next, and the six hand-written aliases keep it.
- **Hebrew sources are written three ways.** The router matches the percent-encoded request path, so a source written in Hebrew never matches. Each of the 11 Hebrew sources is emitted upper-case encoded, lower-case encoded (the form WordPress wrote and Google indexed) and raw. That is 42 rules for 20 paths.
- **Destinations are percent-encoded**, so the `Location` header is ASCII.
- **The 410s stay with the proxy.** A config redirect cannot answer "gone".

### One row the measured map does not have

`/coupon-scanner` maps to `/scan` in the crawl.
`/scan` is not a page here: it is an alias in `next.config.ts` for `/supplier/scan`, so the measured map dropped the row as `target_not_live` and counted the URL as lost.
The new script follows the alias and still requires the destination to be a measured static route.
The visitor gets one 301 to `/supplier/scan`, where the database row gives a 301 onto a 308.
The unit test names this row explicitly, so a second one cannot arrive unnoticed.

## Verification

All on `next build` + `next start` (port 3131), against the production database, 06.11.2026.

### 20 random old URLs

The pool is every moved URL in each form a client sends: 31 forms of 20 paths.
`wp` is WordPress's lower-case encoding, `browser` is upper-case.

```
$ node scripts/test-wp-redirects.mjs --base http://localhost:3131 --n 20 --seed 31
pool 31 URL forms of 20 moved permalinks; testing 20 at random, seed 31

PASS 301 /store-directory [ascii] -> /products -> 200
PASS 301 /product-category/בעלי-מקצוע [wp] -> /category/professionals -> 200
PASS 301 /product-category/טלפונים-מחשבים-ואביזרים [wp] -> /category/phones-computers -> 200
PASS 301 /product-category/צימרים-מלונות-ונופש [browser] -> /category/vacation -> 200
PASS 301 /product-category/טלפונים-מחשבים-ואביזרים [browser] -> /category/phones-computers -> 200
PASS 301 /דף-בית-טסט [wp] -> / -> 200
PASS 301 /product-category/קורסים-express [browser] -> /category/courses -> 200
PASS 301 /product-category/קורסים-express [wp] -> /category/courses -> 200
PASS 301 /product/7388 [ascii] -> /product/קוסמטיקאית -> 200
PASS 301 /קניון-אקספרס-דף-הבית-מסדרים-לך-בילוי [browser] -> / -> 200
PASS 301 /product-category/מסעדות-ובתי-קפה [browser] -> /category/restaurants-cafes -> 200
PASS 301 /product-category/בעלי-מקצוע [browser] -> /category/professionals -> 200
PASS 301 /product-category/ציוד-ומזון-לבעלי-חיים [browser] -> /category/pets -> 200
PASS 301 /product-category/תינוקות-וילדים [browser] -> /category/baby-kids -> 200
PASS 301 /shop [ascii] -> /products -> 200
PASS 301 /product-category/hot-deals [ascii] -> /category/hot-deals -> 200
PASS 301 /product-category/ציוד-ומזון-לבעלי-חיים [wp] -> /category/pets -> 200
PASS 301 /product-category/יופי-בריאות-וטיפוח [browser] -> /category/beauty-health -> 200
PASS 301 /product-category/עד-99 [wp] -> /category/under-99 -> 200
PASS 301 /קניון-אקספרס-דף-הבית-מסדרים-לך-בילוי [wp] -> / -> 200

20/20 return 301 to a live route
```

A second draw with `--seed 7` was also 20 of 20.

### The whole pool

```
$ node scripts/test-wp-redirects.mjs --base http://localhost:3131 --all
31/31 return 301 to a live route
31/31 trailing-slash forms resolve in two hops
```

Four of the 31 land on a signed-in route, and the script counts them as live only on this exact shape:

```
PASS 301 /coupon-scanner [ascii] -> /supplier/scan -> 307 login-gated
PASS 301 /my-account [ascii] -> /account -> 307 login-gated
PASS 301 /my-orders [ascii] -> /account/orders -> 307 login-gated
PASS 301 /track-your-order [ascii] -> /account/orders -> 307 login-gated
```

An anonymous request to `/account` or `/supplier/scan` gets 307 to `/login?next=<route>`.
A 307 to anywhere else fails.

### The config answered, not the proxy

The proxy stamps `x-request-id` on its own redirects and drops the query string.
These responses carry neither mark:

```
$ curl -sD - -o /dev/null 'http://localhost:3131/product/7388?utm=x'
HTTP/1.1 301 Moved Permanently
location: /product/%D7%A7%D7%95%D7%A1%D7%9E%D7%98%D7%99%D7%A7%D7%90%D7%99%D7%AA?utm=x
```

### Nothing else moved

```
/wishlist       410          (proxy, from the table)
/scan           308 -> /supplier/scan
/terms          308 -> /terms-and-conditions
/blog           200
/about          200
/products       200
/category/pets  200
/product/<unchanged WordPress slug>  200
```

### Gates

| Gate | Result |
|---|---|
| `pnpm build` | exit 0. `.next/routes-manifest.json`: 48 redirect rules, 42 of them `statusCode: 301` |
| `pnpm type-check` | exit 0 |
| `pnpm vitest run` | 8226 passed, 13 skipped, 693 files. 17 new tests in `wp-redirects.test.ts` |
| `pnpm lint` | exit 0 |
| `node scripts/build-wp-redirects.mjs --check` | OK, 87 permalinks, 20 x 301, no drift |
| `node scripts/build-legacy-redirects.mjs --check` | OK, 32 redirects, 55 excluded, no drift |
| Freeze gate (`git diff design-locked-2026-10-19 -- <frozen paths>`) | 0 lines |

## Known limits

- **A trailing slash costs two hops.** WordPress served `/shop/`. Next answers 308 to `/shop` before any redirect rule is read, then the 301. Both are permanent and all 31 forms resolve. Removing the first hop means `skipTrailingSlashRedirect`, which changes the whole site.
- **The query string is carried through.** The proxy drops it on purpose; config redirects cannot. `?utm=x` survives onto the destination, and the destination's canonical tag covers it.
- **Only crawled URLs are mapped.** WooCommerce pagination (`/product-category/<slug>/page/2`), `/product-tag/*`, `/feed` and `?p=<id>` short links are not in the inventory and get no rule.
- **Not measured on Vercel.** The test ran on `next start`. Whether Vercel's router is case-insensitive on hex digits is the reason for the three spellings, and it was not measured. Production can be checked with `--no-target` while `MAINTENANCE_MODE` is on, because config redirects answer ahead of the proxy.

## Found on the way

- **`build-legacy-redirects.mjs --check` failed on every day but the one it was written.** The SQL header carries the bare run date and the drift comparison only masked the full timestamp. Fixed: the date is masked too.
- **`redirect-map.json` had drifted.** Its `$targets.products` list was missing the 47 demo and launch products added since 04.10. Regenerated; the 32 redirect rows are unchanged, and `192_seed_seo_redirects.sql` was left as it was.
- **The table holds two rows the map does not:** `/coupon-scanner -> /scan` (301) and `/product/קופון-טסט` (410). Not changed. The first is now answered by the config before the proxy sees it.

## Changed files

| File | Change |
|---|---|
| `next.config.ts` | `redirects()` spreads `toNextRedirects()` after the hand-written aliases |
| `scripts/build-wp-redirects.mjs` | New. Slug map and generated redirect list, with `--check` |
| `scripts/test-wp-redirects.mjs` | New. Live test: random draw, `--all`, `--no-target` |
| `src/lib/seo/wp-redirects.ts` | New. Rows to config entries: 301, three spellings, encoded destination |
| `src/lib/seo/wp-redirects.generated.ts` | New, generated. 20 rows |
| `src/lib/seo/wp-redirects.test.ts` | New. 17 tests |
| `data/legacy/wp-slug-map.json` | New, generated. 87 permalinks |
| `data/legacy/redirect-map.json` | Regenerated: `$targets` only |
| `scripts/build-legacy-redirects.mjs` | `--check` masks the run date |
| `docs/S31-redirects.md`, `docs/INDEX.md`, `README.md`, `STATE.md` | This record, its index row, the document count, the resume line |

No migration, no money code, no frozen path.
