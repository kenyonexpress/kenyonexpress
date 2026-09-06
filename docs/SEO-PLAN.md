# SEO plan

Hebrew SEO for KenyonExpress: schema per page, meta templates, internal linking, `hreflang` `he-IL`. Locale is one language. `dir="rtl"`. `metadataBase` from `NEXT_PUBLIC_SITE_URL`. No hardcoded domain in templates.

Prices in JSON-LD: ILS, from integer agorot. Coupon `Offer.price` is the **on-site** amount, never face value alone. Description still says the remainder is paid at the business. Never publish `platform_percent`.

Status: binding for this worktree. Docs only.

Companions: `docs/SEO-CONTENT-PLAN.md`, `docs/ARCHITECTURE-SEO-SITEMAP.md`, `docs/STOREFRONT-ROUTES.md`, `docs/COPY-HE.md`, `docs/LIVE-HOME-2026-09.md`.

---

## 0. Live home check (2026-09-07)

Fetched `https://kenyonexpress.co.il/` HTML (WooCommerce still on the public origin).

| Field | Live now | Next template |
|---|---|---|
| `<title>` | `קניון אקספרס` | Keep this short brand title **or** `'%s \| קניון אקספרס'` on inner pages. Older plan guessed `קניון EXPRESS: מסדרים לך בילוי`. That string is **not** the current `<title>`. Full GET notes: `docs/LIVE-HOME-2026-09.md`. Do not copy U+2014 into new titles (use a colon). `/shop/` live H1 is `חנות` (agrees with `/products`). Live shop meta still contains the English word Archive. **Do not port Archive** |
| meta description | `המקום למבצעים חמים במגוון תחומים, בילוי, תיירות, צריכה ועוד.` | Keep while ranked. New copy may add the pay-on-site / redeem-at-business sentence without dropping the live opener |
| `og:title` | `קניון אקספרס` | match `<title>` |
| `<html>` | `dir="rtl"` `lang="he-IL"` | Next root may use `lang="he"`. Locale token remains `he-IL` / Open Graph `he_IL` |
| `link rel="alternate" hreflang` | **absent** | emit §4 |

Hero still contains Electro English demo (`SIMPLY THE BEST` reversed by RTL). That hurts snippet quality. Replace with Hebrew USP when content ops can, without changing token geometry (UI-PARITY-LOG home landmarks).

---

## 1. `hreflang` `he-IL`

One locale. No English site. Do not advertise `en`.

| Tag | Value |
|---|---|
| HTML | `lang="he-IL"` (live) or `lang="he"` (valid). Open Graph `locale: he_IL` |
| Alternate | `<link rel="alternate" hreflang="he-IL" href="{canonical}" />` |
| x-default | **Runtime plan** (`docs/ARCHITECTURE-SEO.md` §5.1): `alternates.languages` ships `'he-IL'` and `'x-default'` **both pointing at the same canonical**. That is not a second language. It is a market signal. Live WP (2026-09-07) has **neither** tag |
| Regional | no `he-US`. Israel is `he-IL` only |
| Pagination / sort | canonical **without** `?orderby=` / filters. Do not hreflang each sort URL |
| noindex routes | still can carry `lang`. Do **not** list them in the hreflang sitemap |

Self-referencing canonical + matching `hreflang="he-IL"` on every **indexable** URL. Account, cart, checkout, QR, gift token, redeem token, search: noindex, no hreflang cluster.

### 1.1 Audited against source, 2026-09-07

Three claims in this section were checked against the code rather than
restated.

| Claim | Source | Verdict |
|---|---|---|
| `lang` | `src/app/layout.tsx:111` ships `<html lang="he" dir="rtl">` | **confirmed.** The valid short form, not `he-IL`. Live WP uses `he-IL`; both are valid and this is not a parity defect |
| Open Graph locale | root `metadata.openGraph.locale: 'he_IL'` | **confirmed** |
| `alternates.languages` | **not present in any file under `src/`** | **confirmed UNSHIPPED** |

The third is the one worth stating positively. This document already calls
`x-default` a "runtime plan", which is accurate, but the stronger fact is now
checked: **no `hreflang` tag of any kind is emitted anywhere on the site.**
`alternates` appears 15 times across `src/app`, and every occurrence sets
`canonical` only. The single richer one is the root layout, which adds
`types` for the RSS feed and still no `languages`.

So the current state is:

```
canonical      shipped, 15 routes
hreflang he-IL NOT shipped
x-default      NOT shipped
```

That is a defensible position for a one-locale site: `hreflang` with a single
self-referencing language is inert, and Google treats a lone `x-default` as a
market hint rather than a requirement. It is recorded here so nobody
"restores" a tag that was never there and then reports it as a regression when
it disappears again.

Where it would go, if it is ever wanted: `alternates.languages` in the root
layout's `metadata`, with `'he-IL'` and `'x-default'` both pointing at the same
canonical. One place, not fifteen: Next merges nested `alternates` over the
root, so a per-route `canonical` does not erase a root `languages`.

---

## 2. Meta templates

Length: title ~50 to 60 characters when possible; description 150 to 160. `{name}` = `name_he`. `{brand}` = `קניון אקספרס`. Root: `'%s | קניון אקספרס'` except home.

| Page | Title | Description | robots |
|---|---|---|---|
| Home `/` | live: `קניון אקספרס` | live description (0) | index, follow |
| `/products` | `חנות \| קניון אקספרס` or live archive title | כל הדילים והקופונים בקניון אקספרס. | index page 1; later pages as implemented |
| Category | `{cat} \| קופונים ומבצעים` | דילים וקופונים בקטגוריית `{cat}` בקניון אקספרס. מחיר בקניון באתר, יתרה בבית העסק בקופונים. | index; **noindex** if filtered |
| Product coupon | `seo_title` or `{name} \| קופון {cat}` | `{name}: מחיר בקניון {price}. יתרה לתשלום בבית העסק. תוקף לפי ימי השובר.` | index if active |
| Product physical | `seo_title` or `{name} \| {cat}` | `{name} בקניון אקספרס. מחיר {price} כולל מע״מ, תשלום מלא באתר.` | index if active |
| Supplier `/s/[id]` | `{name}` or `{name} ב{city}` | `{name}` בקניון אקספרס. קופונים, מבצעים ומוצרים. | index if active |
| City `/city/[slug]` | `דילים ב{name}` | קופונים ומבצעים מבתי עסק ב{name}. כל שובר נסרק פעם אחת, והתוקף מוצג לפני הרכישה. | index |
| Legal | document H1 | first paragraph | index |
| `/about` `/contact` `/faq` `/blog` | H1 \| brand | first paragraph | index |
| `/suppliers` (join-us) | marketing H1 | prospect copy, not a product index | index |
| Search | `תוצאות חיפוש: {q}` | none | **noindex** |
| Cart / checkout* / account/** / `/coupon/{id}` / gift / redeem | short functional | none | **noindex, nofollow** on QR and tokens |
| 404 | הדף לא נמצא | none | noindex |

Open Graph: home `website`, product `product`, image from R2 (not Electro demo). Twitter card summary_large_image when an image exists.

Do not put money floats or percent into title/description.

---

## 3. Schema (JSON-LD) per page

Inject via the existing `jsonLdScript` helper (JSON, not a string-concat of user HTML). One graph. Absolute `url`. Currency `ILS`.

### 3.1 Home

`Organization` + optional `WebSite`.

- `@id`: `{origin}/#organization`
- `name`: קניון אקספרס
- `alternateName`: KenyonExpress
- `url`, `logo`, `sameAs` (official only)
- `WebSite.inLanguage`: `he-IL`
- **No** `SearchAction` (search is noindex and absent from the header)

### 3.2 Category / `/products`

`BreadcrumbList` (Home → {cat} or חנות) + `CollectionPage` + `ItemList` of first N products (`url`, `name`, `position`).

### 3.3 Product

`Product` + `Offer` + `BreadcrumbList`.

- `name`: `name_he`
- `image`: array
- `description`: plain `short_description_he` plus remainder sentence on coupons
- `sku`: **omit** (not in customer DOM)
- `brand`: Organization or supplier as Brand
- `Offer.priceCurrency`: ILS
- `Offer.price`: on-site amount only
- `availability`: InStock or OutOfStock
- `AggregateRating`: only if approved review count > 0

No second Offer for the remainder. No `platform_percent`.

### 3.4 Supplier `/s/[id]` (not `/supplier/{id}`)

Public URL is `/s/{id}`. `@id` for the place: `{origin}/s/{id}#business`. Do not mint `/supplier/{uuid}` in JSON-LD (that path is the partner portal).

`LocalBusiness` is **gated on data** (`docs/ARCHITECTURE-SEO-SITEMAP.md` §2.7):

| Column | Required for LocalBusiness |
|---|---|
| `name` | yes |
| `address` + `city` | yes (street + locality). Guessing a street is how a customer drives to the wrong door |
| `lat` + `lng` | optional `GeoCoordinates` only when both exist |
| `opening_hours` | optional `openingHoursSpecification` only when real |
| `contact_phone` | optional `telephone` LTR |

If address/city are missing: emit `Organization` with `name` + `url` only. **No** `LocalBusiness`. KenyonExpress itself is a marketplace, not a shop with a public storefront address. Do not mark the platform as `LocalBusiness`.

Also: `ItemList` of products + breadcrumbs Home → ספק → name. `containedInPlace` city when the city slug page exists.

On **product** JSON-LD, when the supplier place exists, `Offer.availableAtOrFrom` / `areaServed` may point at that `@id`. Coupon remainder is still not a second Offer.

Test/junk catalogue rows (`קופון טסט`, empty `₪`, `Reverse Withdrawal Payment`): stay out of sitemap and out of Product+Offer. Zero or missing ILS: no Offer.

### 3.5 City `/city/[slug]`

Keep existing `BreadcrumbList` (`buildBreadcrumbJsonLd`). Do not emit a second breadcrumb graph. `CollectionPage` optional. Per-branch `LocalBusiness` is still queue, not required on day one.

Seventeen `REGIONS` only. Empty region still **indexable** (it answers the query). Unknown slug: 404, noindex. Internal chips go to `/products?city=` which is **noindex**; do not hreflang those query URLs. Link `/s/{id}` when a supplier in that region exists. Do not mint thin extra city landing pages.

Title: `דילים ב{name}`. Description: remainder-at-business sentence. `hreflang="he-IL"` (+ `x-default` same canonical).

### 3.6 Legal / about / contact / faq / blog

`WebPage` + `Organization` publisher. Accessibility statement may use `WebPage` only.

Canonical + `hreflang="he-IL"` (and `x-default` same URL). Both `/legal/terms` and `/terms-and-conditions` must not compete: one canonical, the other 301. Footer ships the 200 URL. Same for privacy, returns, accessibility.

About/contact/faq/blog: index. Contact form errors are noindex (same URL). `/offline`: **no** JSON-LD (already in §3.7).

### 3.7 Do not emit JSON-LD on

Cart, checkout, account (including wallet, coupons, wishlist), `/coupon/{id}`, `/gift/{token}`, `/redeem/{token}`, search, 404, 500, `/offline`.

---

## 4. Internal linking map

| From | To | Anchor idea |
|---|---|---|
| Home deals cards | `/product/{slug}` | product `name_he` (`#0062bd`) |
| Home category strip | `/category/{slug}` | category `name_he` |
| Home footer | legal, about, contact, `/products` | live footer labels |
| Category card | PDP | name |
| Category control | pagination, sort (canonical without sort) | |
| PDP | category crumbs, related PDP, `/s/{id}` | crumbs + supplier name |
| PDP coupon | do **not** link `/coupon/{uuid}` before purchase | |
| Supplier | city if any, product grid | city name |
| City | `/s/{id}`, `/` | supplier name, כל הדילים |
| Account empty wishlist | `/products` | לכל המוצרים |
| Account empty orders | `/products` | לחנות |
| Account empty subscriptions | `/` | לדילים באתר |
| 404 | `/` and `/products` (not `/search`) | לדף הבית |
| Checkout success | `/coupon/{id}`, `/account/orders/{id}` | הצגת הקופון ו-QR |
| Gift success | `/account/coupons` | בקופונים שלי |

No header search link. No `platform_percent` in anchors. Footer WhatsApp / Facebook marks are not SEO links to invent extra landing pages.

Silo: vertical category ↔ PDP ↔ supplier ↔ city. Home is the hub. Do not orphan city pages without suppliers (empty copy already points back to the hub).

---

## 5. Sitemap and robots

Include: `/`, indexable categories, active products, `/s/{id}` public, `/city/{slug}` with suppliers, legal, about, contact, faq, blog index, `/products`.

Exclude: `/search`, `/cart`, `/checkout*`, `/account/**`, `/coupon/*`, `/gift/*`, `/redeem/*`, `/admin/**`, `/supplier/**`, `/scan`, `/login*`, `/offline`, filtered category URLs.

`lastmod` from product `updated_at` where cheap. Money fields never appear as sitemap metadata.

robots: `hreflang` is not a robots directive. Keep `Disallow` for account and checkout. Do not `Disallow` `/products`.

---

## 5.1 Section 5 audited against the source (pass 12)

Section 5 above states what the sitemap and robots **should** contain. This is
what they **do** contain, read off `src/app/sitemap.ts` and `src/app/robots.ts`.

### What `sitemap.ts` actually emits

| Group | Entries | `changeFrequency` | `priority` |
|---|---|---|---|
| `/` | 1, `lastModified` = `catalogueTouched` | daily | 1 |
| `/products` | 1 | daily | 0.9 |
| `/coupons` | 1 | daily | 0.9 |
| `/suppliers` | 1 | monthly | 0.7 |
| `/blog` | 1 | weekly | 0.6 |
| `/about`, `/contact`, `/faq` | 3 | monthly | 0.5 |
| `/category/{slug}` | per category | daily | 0.8 |
| `/product/{slug}` | per active product | weekly | 0.7 |
| `/s/{id}` | per public supplier | weekly | 0.6 |
| `/blog/{slug}` | per post | monthly | 0.5 |
| legal (`LEGAL_PAGE_SLUGS`) | 4, `lastModified` = the document's own `updatedAt` | yearly | 0.3 |

Legal carries a real date because the document has one, which `/contact` does
not; the file's comment records that they are also the four addresses the old
site already has indexed, which is why they are listed rather than left to be
discovered.

### Finding 1: `/city/{slug}` is in the plan and not in the sitemap

Section 5 lists "`/city/{slug}` with suppliers" as included. `sitemap.ts`
contains **no occurrence of `city` at all**. Pass 10 documented the seventeen
region landings as real, indexable pages, and `city/[slug]/page.tsx` confirms
it: the only `noindex` in that file is a comment explaining that an unknown
slug is handled by `notFound()`, which emits its own.

So seventeen indexable pages are absent from the sitemap. Either add them or
change section 5; today the two documents disagree.

### Finding 2: three groups ship and are not in the plan

`/coupons`, `/suppliers` and `/blog/{slug}` are emitted and section 5's include
list does not mention them. The plan's list is incomplete in both directions.

### Finding 3: `/offline` is indexable

Section 9 of this file and the pass 11 revision row both record `/offline` as
noindex. It is not. `src/app/offline/page.tsx` declares:

```
export const metadata = { title: 'אין חיבור' }
```

No `robots` key. It has no layout of its own, the root layout sets no `robots`
default, it is **not** in the `robots.txt` disallow list, and it is **not** in
the sitemap. A page absent from the sitemap is still indexable if it is linked
or discovered; absence is not a directive. Add `robots: { index: false }` to
that file, or stop recording it as noindex.

### What `robots.ts` actually disallows

```
/redeem/   /coupon/   /account/   /supplier/   /scan   /admin/
/checkout  /cart      /auth/      /api/        /reset-password  /forgot-password
```

`/redeem/` is first deliberately: **that path is a signed voucher token**. A
crawler fetching one is fetching somebody's coupon, and an indexed one is a
coupon in a search result. The file states the principle plainly, and it is the
right one: **robots.txt is a request, not access control.** Every path listed is
also gated server-side, so this only stops well-behaved crawlers from spending
budget. `/redeem/` additionally sets its own noindex and requires a supplier
session, making robots the outermost of three layers.

### Finding 4: the plan's exclude list and the disallow list are different tools

Section 5 lists `/search`, `/gift/*` and filtered category URLs as excluded.
None of them is in the disallow list, and **that is correct**, not a gap:

| Path | How it is actually excluded |
|---|---|
| `/search` | `robots: { index: false }` in its own `generateMetadata` |
| `/gift/[token]` | `robots: { index: false, follow: false }` |

Using `Disallow` for these would be **worse**, and the reason is worth stating
because it is a common mistake: a crawler blocked by robots.txt never fetches
the page, so it never sees the `noindex`, and a URL discovered from an external
link can still be indexed URL-only. Noindex requires the crawl to work.

The two directives the plan does assert about robots both hold: account and
checkout are disallowed, and `/products` is not.

### Corrected summary

| Claim in section 5 | Status |
|---|---|
| include `/`, categories, products, `/s/{id}`, legal, about, contact, faq, blog index, `/products` | **holds** |
| include `/city/{slug}` | **does not ship** (finding 1) |
| exclude `/search`, `/gift/*` | holds, via noindex rather than disallow (finding 4) |
| exclude `/offline` | **does not ship**, and it is not noindex either (finding 3) |
| `Disallow` account and checkout | **holds** |
| do not `Disallow` `/products` | **holds** |
| `lastmod` from `updated_at` where cheap | holds; legal uses the document's own `updatedAt` |

## 6. H1 rules (short)

One H1. Hebrew. Live category/product names, not English slugs. Account H1s are functional (`הארנק שלי`, `הקופונים שלי`, `רשימת המשאלות שלי`) and noindex, so they do not compete with commercial H1s.

Home: do not replace the live brand title with a stuffed “קופונים דילים מבצעים ישראל” H1 if the visual H1 is the hero headline. Hero copy should become real Hebrew (Electro English is a content bug).

---

## 7. Core Web Vitals vs pixel gate

`compare.mjs` under 11 percent is **not** a CWV gate. LCP/CLS/INP still apply. Heebo `display: swap`, `preload: false` so the LCP paragraph can stay Arial on purpose. Consent banner is a known LCP risk on home.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Plan with live title `קניון אקספרס`, `lang="he-IL"`, no live hreflang; schema per page; linking including account empties |
| 2026-09-07 | Pass 9: LocalBusiness data gate; `@id` `/s/{id}#business`; hreflang `x-default` matches ARCHITECTURE-SEO (same canonical) |
| 2026-09-07 | Pass 10: city seventeen regions; empty indexable; query chips noindex |
| 2026-09-07 | Pass 11: legal alias canonical; offline omitted from JSON-LD |
| 2026-09-07 | hreflang audited against source: lang="he" and og locale confirmed, hreflang/x-default confirmed unshipped in all 15 canonical routes |
| 2026-09-07 | Pass 12: section 5 audited against src/app/sitemap.ts and robots.ts. Four findings: /city missing from sitemap, three groups ship unlisted, /offline is NOT noindex, and the exclude list vs disallow list are different tools |
