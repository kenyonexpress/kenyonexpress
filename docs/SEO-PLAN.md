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
| x-default | **omit** until a second language exists. A lone `x-default` pointing at Hebrew is optional; skip to avoid implying a language picker |
| Regional | no `he-US`. Israel is `he-IL` only |
| Pagination / sort | canonical **without** `?orderby=` / filters. Do not hreflang each sort URL |
| noindex routes | still can carry `lang`. Do **not** list them in the hreflang sitemap |

Self-referencing canonical + matching `hreflang="he-IL"` on every **indexable** URL. Account, cart, checkout, QR, gift token, redeem token, search: noindex, no hreflang cluster.

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

### 3.6 Legal / about

`WebPage` + `Organization` publisher. Accessibility statement may use `WebPage` only.

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
