# SEO-STRATEGY

Hebrew SEO for KenyonExpress, written against the code that actually ships
(`src/lib/seo/`, `src/app/sitemap.ts`, `src/app/robots.ts`,
`src/lib/seo/json-ld.ts`) and against the live title measured on 2026-09-07.
Where a brief asked for a tag that is not emitted, that is named rather than
invented.

Locale is one language. `dir="rtl"`. There is no English site.

Companion documents: `docs/SEO-PLAN.md` (meta templates audited against source),
`docs/ARCHITECTURE-SEO-SITEMAP.md`.

---

## 1. Israeli-market keyword research (Hebrew coupon and deal terms)

The catalogue is Israeli deals and coupons. Queries that convert here are
intent-plus-place, not brand.

| Cluster | Example queries | Landing |
|---|---|---|
| Deal / coupon generic | קופון, דיל, מבצע, שובר, הנחה | `/`, `/products` |
| Category + deal | קופון מסעדה, דיל ספא, צימר בהנחה | `/category/{slug}` |
| Place | דילים בתל אביב, קופונים בחיפה | `/city/{slug}` |
| Business | קופון {שם עסק} | `/s/{id}` and the product |
| Price band | דילים עד 99 שקל | `/category/under-99` |
| Urgency | דילים חמים, החדשים | `/category/hot-deals`, `/category/new` |

Do not target English deal words. Do not put `platform_percent` or any
commission number in a title, description, or JSON-LD node.

Coupon copy must say two prices: what is paid on this site, and what is still
due at the business. A snippet that only says the online amount is a false
promise of a whole meal for the deposit.

---

## 2. URL structure

| Surface | Pattern | Notes |
|---|---|---|
| Home | `/` | Brand title only |
| Shop | `/products` | H1 `חנות` |
| Category | `/category/{slug}` | English kebab slug, Hebrew name in the title |
| Product | `/product/{slug}` | Hebrew or mixed slug as stored; encoded in JSON-LD |
| Supplier | `/s/{id}` | UUID, not a pretty slug |
| City | `/city/{slug}` | From `src/lib/geo/cities.ts` |
| Search | `/search?q=` | **noindex** |
| Coupon (owned) | `/coupon/{id}` | **noindex**, disallowed in robots |
| Cart / checkout / account / admin / supplier / scan | as named | **noindex** |

Slug format: lowercase kebab-case for categories (`restaurants-cafes`,
`beauty-health`). Product slugs are whatever the catalogue stored, including
Hebrew. Do not rewrite a live slug to "improve SEO": the WordPress cutover
depends on `seo_redirects`.

Category hierarchy in the URL is **flat**. There is no
`/category/{parent}/{child}`. Parent/child, when it exists, is a `categories`
row relationship, not a path segment. Filtered and sorted views
(`?orderby=`, city chips) must canonicalise to the clean category URL.

Internal IDs (`/s/{uuid}`, `/coupon/{uuid}`) stay as IDs. Pretty-slug for
suppliers is not shipped.

---

## 3. Meta tag templates per page type

Length: title about 50 to 60 characters when possible; description 150 to 160.
`{name}` is `name_he`. `{brand}` is `קניון אקספרס`. Root template is
`'%s | קניון אקספרס'` except home.

| Page | Title | Description | robots |
|---|---|---|---|
| Home `/` | `קניון אקספרס` (live) | `המקום למבצעים חמים במגוון תחומים, בילוי, תיירות, צריכה ועוד.` | index, follow |
| `/products` | `חנות \| קניון אקספרס` | כל הדילים והקופונים בקניון אקספרס. | index |
| Category | `{cat} \| קופונים ומבצעים` | דילים וקופונים בקטגוריית `{cat}`. מחיר בקניון באתר, יתרה בבית העסק בקופונים. | index; **noindex** if filtered |
| Product coupon | `seo_title` or `{name} \| קופון {cat}` | `{name}: מחיר בקניון {price}. יתרה לתשלום בבית העסק.` | index if active |
| Product physical | `seo_title` or `{name} \| {cat}` | `{name} בקניון אקספרס. מחיר {price} כולל מע״מ, תשלום מלא באתר.` | index if active |
| Supplier `/s/[id]` | `{name}` or `{name} ב{city}` | `{name}` בקניון אקספרס. קופונים, מבצעים ומוצרים. | index if active |
| City `/city/[slug]` | `דילים ב{name}` | קופונים ומבצעים מבתי עסק ב{name}. | index |
| Search | `תוצאות חיפוש: {q}` | none | **noindex** |
| Cart, checkout, account, `/coupon/{id}`, gift, redeem | short functional | none | **noindex, nofollow** on QR and tokens |

Open Graph: home `website`, product `product`. Locale `he_IL`. Image from the
catalogue (R2 or the stored URL), never an Electro demo asset.

Do not put money floats or percents into title or description. Prices, when
they appear, come from the same integer-agorot path the cart charges.

`generateMetadata` covers `category/[slug]`, `product/[slug]`, `s/[id]`,
`city/[slug]`, `search`, `coupons/[id]`. Static `metadata` covers the rest of
the indexable and noindex shells. The one route with neither is
`checkout/confirmation`.

---

## 4. schema.org markup plan

Built in `src/lib/seo/json-ld.ts`. Derived from the same values the page
renders. A JSON-LD price that is computed separately from checkout is how this
repo once advertised `price * 0.1` while the cart charged the real amount.

### Product + Offer

`buildProductJsonLd`:

- `@type`: `Product`
- `brand`: the supplier name, never the platform name
- `offers.@type`: `Offer`
- `priceCurrency`: `ILS`
- Coupon: `price` is `paidOnlineIls` (what this site charges). `highPrice` is
  the sticker when it is higher. An unsellable coupon gets `OutOfStock` and
  **no price**, never a zero.
- Physical: `price` is the on-site charge. `highPrice` is the compare-at when
  higher. Null or non-positive price: no Offer node.
- `availability`: `InStock` / `OutOfStock`. Null stock is "not tracked", not
  out of stock.

### AggregateRating

Emitted only when `rating.count > 0`. An aggregate of zero reviews is a
fabricated claim. `bestRating` 5, `worstRating` 1.

### LocalBusiness

Not on the product node. City pages (`/city/[slug]`) attach `LocalBusiness`
for the supplier's branch (name, city, coordinates when present). A product
page that called every deal a LocalBusiness would tell Google the platform
is a restaurant.

### Other nodes

| Node | Where |
|---|---|
| `Organization` + `WebSite` + `SearchAction` | home (`buildSiteJsonLd`). SearchAction target is `/search?q={search_term_string}`, a route that exists |
| `BreadcrumbList` | category, product, city |

Never publish `platform_percent` in structured data.

---

## 5. Sitemap generation

`src/app/sitemap.ts`, cached one hour (`cacheLife('hours')`), tagged
`CATALOGUE_TAG` so an admin save refreshes it.

Included:

- Static entry points (home, about, legal slugs, blog posts)
- Active categories (`is_active`)
- Active, undeleted products with a slug (cap 45,000; Google's file limit is
  50,000)
- Active suppliers

Deliberately absent: `/account/**`, `/supplier/**`, `/admin/**`, `/checkout`,
`/cart`, `/coupon/**`, `/redeem/[token]`. Publishing a redeem URL is publishing
somebody's voucher.

Reads go through `createPublicClient` (anon), the same catalogue the storefront
caches. A failed read **throws** so `use cache` keeps the last good sitemap
instead of storing an empty list (an empty sitemap is a deindexing request).

---

## 6. robots.txt rules

`src/app/robots.ts`. A request to well-behaved crawlers, not access control.
Everything listed is also gated server-side.

Disallow:

- `/redeem/` (signed voucher tokens; listed first on purpose)
- `/coupon/` (a customer's own voucher, code and QR)
- `/account/`
- `/supplier/`
- `/scan`
- `/admin/`
- `/checkout`
- `/cart`
- `/auth/`
- `/api/`
- `/reset-password`
- `/forgot-password`

Allow: `/`. Sitemap: `{siteUrl}/sitemap.xml`. Host: the canonical origin.

---

## 7. Canonical URL policy

Every indexable route sets `alternates.canonical` to itself, without query
string. Pagination, sort, and filter parameters are stripped.

`metadataBase` comes from the site URL helper, not a hardcoded domain.

Non-indexable routes still have a canonical so they do not inherit the home
URL. They also send `robots: noindex`.

---

## 8. hreflang: not needed (he-IL only)

One locale. Do not advertise `en`. Do not emit `he-US`.

The runtime plan in older docs (`alternates.languages` with `he-IL` and
`x-default` both pointing at the same canonical) is **not shipped**. Audited
2026-09-07: `alternates` appears across `src/app` and every occurrence sets
`canonical` only. HTML is `<html lang="he" dir="rtl">`. Open Graph locale is
`he_IL`.

A lone self-referencing `hreflang` is inert. A lone `x-default` is a market
hint, not a requirement. Leave it unshipped unless a second language appears.
Do not "restore" a tag that was never there.

---

## 9. Internal linking map

| From | To | Why |
|---|---|---|
| Home hero and department strip | `/category/{slug}` | the eleven live departments in `KE_LIVE_CATEGORIES` |
| Home deal cards | `/product/{slug}` | product as the money URL |
| Category card | `/product/{slug}` | |
| Product breadcrumb | `/` then `/category/{slug}` then the product | BreadcrumbList matches the trail |
| Product | `/s/{supplierId}` | the business, not a second product URL |
| City page | products in that city, supplier cards | local pack |
| Product coupon block | `/category/{slug}` siblings | more deals in the same intent |
| Footer | legal, about, contact, supplier join | crawl equity without mixing noindex account links |
| Search results | `/product/{slug}` only | search itself is noindex |

Do not link from indexable pages into `/coupon/{id}`, `/redeem/`, `/cart`, or
`/checkout`. Those are session or token URLs.

The header search box is a form GET to `/search`. It is a feature, not an
internal link target for equity.
