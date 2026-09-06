# SEO content plan

Hebrew keyword clusters, title and meta templates, H1 rules, internal linking, JSON-LD, sitemap and robots for KenyonExpress (`kenyonexpress.co.il`), an Israeli coupons and deals marketplace.

Status: binding for content/SEO in this worktree. Docs only.

Runtime companions: `docs/ARCHITECTURE-SEO.md`, `docs/ARCHITECTURE-SEO-SITEMAP.md`, `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md`. Money and product-type copy: `docs/COPY-HE.md`, `docs/DATA-CONTRACTS.md`. Authority for money: `BUSINESS-MODEL-RULES.md` then `docs/PRODUCT-TYPES.md`.

Locale: `he-IL`, `dir="rtl"`, `lang="he"`. One locale. `metadataBase` from `NEXT_PUBLIC_SITE_URL` (production `https://kenyonexpress.co.il` or www as live). No hardcoded domain in templates.

Prices in JSON-LD and snippets: ILS, from integer agorot via the money formatter. Coupon Offer `price` is the **on-site coupon price**, never the sticker face alone. Description must still say the remainder is paid at the business.

---

## 1. Keyword clusters (Hebrew)

Clusters are intents, not a mandate to stuff H1s. Primary modifier: geographic Israel / city when the page is local.

### 1.1 Core marketplace

| Cluster | Example queries | Primary landing |
|---|---|---|
| Brand | קניון אקספרס, KenyonExpress, קניון express | `/` |
| Coupons generic | קופונים, קופון הנחה, שובר מתנה, דילים, מבצעים | `/` , coupon categories |
| Deals of the day | דילים של היום, מבצע היום | `/` deals block + category hot-deals if it exists |

### 1.2 Verticals (map to `categories.slug` / live names)

Use the **live category `name_he`**, not invented English. Typical Israeli deal verticals (align to catalogue, do not create empty hubs):

| Cluster | Example queries |
|---|---|
| Food | מסעדות, ארוחה זוגית, שובר מסעדה, ארוחה בשרית, בראנץ |
| Spa / wellness | ספא זוגי, עיסוי, שובר ספא, טיפול זוגי |
| Attractions | אטרקציות, בילוי, כרטיס כניסה, שובר אטרקציה |
| Hotels / Zimmer | צימר, לילה זוגי, סופ״ש |
| Beauty | מספרה, טיפולי יופי, קוסמטיקה |
| Electronics / physical | אוזניות, טלפון, מוצר פיזי (only if the catalogue sells it) |

### 1.3 Geo

| Cluster | Example queries | Landing |
|---|---|---|
| National | בפריסה ארצית, קופונים בישראל | `/` |
| City | קופונים `{city}`, מסעדות `{city}` | `/city/{slug}` when the city has suppliers; else do not fake a thin page |
| Supplier + city | `{supplier} {city}` | `/s/{id}` |

### 1.4 Transactional modifiers (use in title/meta, not as extra URLs)

`מחיר בקניון`, `הנחה`, `% הנחה`, `שובר QR`, `מימוש בבית העסק`. Never `נאמנות` / escrow. Never a numbered platform commission.

### 1.5 Do not target

- `/search?q=` (noindex; header has no search field)
- `/cart`, `/checkout*`, `/account/**`, `/coupon/{uuid}` (QR), `/supplier/**`, `/admin/**`
- Duplicate WP query strings (`?orderby=`) as indexable URLs: canonical without sort/filter (`PAGE-ANATOMY` category robots)

---

## 2. Title and meta templates

Length: title ~ 50 to 60 characters when possible; description 150 to 160. `{name}` = `name_he`. `{cat}` = `categories.name_he`. `{city}` = supplier or region city. `{price}` = formatted ILS from agorot. `{brand}` = `קניון אקספרס`.

Root template in layout: `'%s | קניון אקספרס'` except home (full default title).

| Page type | Title template | Meta description template |
|---|---|---|
| Home | Live: `קניון EXPRESS: מסדרים לך בילוי` (keep live if already ranked) else `קניון אקספרס: קופונים, דילים ומבצעים` | קופונים ודילים לבתי עסק בישראל. משלמים באתר, ממשים עם QR בבית העסק. בלי נאמנות. |
| Category | `{cat} | קופונים ומבצעים` | דילים וקופונים בקטגוריית `{cat}` בקניון אקספרס. מחיר בקניון באתר, יתרה בבית העסק בקופונים. |
| Product coupon | `seo_title` or `{name} | קופון {cat}` | `{name}: מחיר בקניון {price}. יתרה לתשלום בבית העסק. תוקף לפי ימי השובר. {city}` |
| Product physical | `seo_title` or `{name} | {cat}` | `{name} בקניון אקספרס. מחיר {price} כולל מע״מ, תשלום מלא באתר. {city}` |
| Supplier | `{name}` (and city in title if it fits: `{name} ב{city}`) | `{name}{ בcity} בקניון אקספרס. קופונים, מבצעים ומוצרים.` (matches `/s/[id]` generateMetadata) |
| City | קופונים ודילים ב{city} | בתי עסק ודילים באזור {city} בקניון אקספרס. |
| Products archive | כל המוצרים | כל הדילים והקופונים בקניון אקספרס. |
| Search | תוצאות חיפוש: `{q}` | noindex, no description targeting |
| 404 | הדף לא נמצא | none |
| Legal | document H1 | first-paragraph summary |
| Account / cart / checkout / voucher QR | short functional title | **noindex** |

Open Graph: `locale: he_IL`, home `type: website`, product `type: product`, supplier `website`. Image: first product image from R2, not a random Electro demo asset.

Canonical: path without trailing slash, **without** `sort` / `min` / `max` / `page=1`. `page>=2` self-canonical, still index,follow. Filtered category: noindex,follow.

---

## 3. H1 rules

One H1 per page. Hebrew. Not the logo.

| Page | H1 |
|---|---|
| Home | Do **not** force a hidden H1 that fights the hero. If a document H1 is required for a11y, use the live welcome line once, visually matching TOKENS hero type, not a second 32px SEO heading that breaks the pixel gate |
| Category | `categories.name_he` only. Not `קופונים זולים {cat} 2026` |
| Product | `products.name_he` only. English `name_en` is not the H1 |
| Supplier | `suppliers.name` |
| City | region name from `REGIONS` |
| Cart | `עגלה` |
| Account | `האזור האישי` / page title from COPY-HE |
| Search | `חיפוש מוצרים` (or results heading). Page is noindex |
| 404 | `הדף שחיפשתם לא נמצא` |
| 500 | `משהו השתבש אצלנו` |

Forbidden: keyword lists in H1, the percent, "Escrow", dual H1 (hero + deals).

---

## 4. Internal linking map

```
Home
  → 11 live categories (sidebar, strip, drawer) → /category/{slug}
  → Deals cards → /product/{slug}
  → Promo banners → product or category (live hrefs)
  → Footer legal, about, contact, city list (region menu)

Category
  → Breadcrumb Home
  → Sibling categories in sidebar
  → Product cards → /product/{slug}
  → Optional supplier name on card → /s/{id}
  → Pagination self links only

Product
  → Breadcrumb Home > {cat} > {name}
  → SupplierInfo → /s/{id} (name)
  → RelatedProducts → other /product/{slug} in the same category
  → City tag → /city/{slug} when used

Supplier /s/{id}
  → Product grid → /product/{slug}
  → City text (not a fake directory)

City
  → All deals CTA → /products or /
  → Listed suppliers → /s/{id}

No header search. Do not add `/search` as a crawl path from 404 (404 goes to `/products` and categories).
```

Link text: category and product **names**, not `לחץ כאן`. Prices in the card are not the anchor.

WP leftover URLs: `seo_redirects` 301 via proxy, not `next.config` redirects. Inventory in WP migration docs. Soft-404s out of sitemap.

---

## 5. JSON-LD plan

Inject as JSON (existing `jsonLdScript` helper). One graph per page. `url` absolute. Currency **ILS**. Prices strings or numbers from agorot conversion in the builder, never a JS float loop.

### 5.1 Home: `Organization` (+ optional `WebSite`)

```
Organization
  @id: {origin}/#organization
  name: קניון אקספרס
  alternateName: KenyonExpress
  url: {origin}/
  logo: absolute logo URL
  sameAs: official social URLs only
WebSite (optional)
  name: קניון אקספרס
  url: {origin}/
  inLanguage: he-IL
  publisher: @id organization
```

Do **not** add `SearchAction` pointing at `/search` while search is noindex and absent from the header. That would advertise a URL we do not want crawled.

### 5.2 Category: `BreadcrumbList` + `CollectionPage` / `ItemList`

```
BreadcrumbList
  Home → {cat}
CollectionPage
  name: {cat}
  url: canonical
  isPartOf: WebSite
ItemList
  itemListElement: first N products (url, name, position)
```

### 5.3 Product: `Product` + `Offer` + breadcrumbs

```
Product
  name: name_he
  image: images[]
  description: short_description_he (plain text)
  sku: omit or only if already public (DATA-CONTRACTS: SKU not in customer DOM; prefer omit)
  brand: Organization or supplier name as Brand
  category: category name_he
Offer
  priceCurrency: ILS
  price: on-site amount (coupon_price for coupon, kenyon_price for physical)
  availability: InStock | OutOfStock
  url: canonical
  seller: Organization KenyonExpress (marketplace), not the supplier as seller of record if that contradicts legal copy
```

Coupon extra in `description` (not a second fake Offer for the remainder): state that `{price}` is paid on the site and the remainder at the business. Do not publish `platform_percent`. Do not use `price` = face value.

AggregateRating only when review count > 0 (approved reviews).

### 5.4 Supplier page

`LocalBusiness` or `Organization` with `name`, `address` (if any), `url` `/s/{id}`, `containedInPlace` city. Plus `ItemList` of products. Breadcrumb Home → ספק → name.

### 5.5 Not on

Cart, checkout, account, `/coupon/{id}`, search, 404, 500.

---

## 6. Sitemap and robots

### 6.1 Sitemap (`src/app/sitemap.ts`)

Include:

| Path | Notes |
|---|---|
| `/` | lastmod max product `updated_at` |
| `/products` | page 1 only |
| `/category/{slug}` | `is_active`, not deleted |
| `/product/{slug}` | `status=active`, not deleted |
| `/s/{id}` | active suppliers with at least one public product (avoid empty 404-like) |
| `/city/{slug}` | only cities that have content |
| `/legal/*`, `/accessibility`, `/about`, `/contact`, `/faq` | if 200 unique |

Exclude forever:

`/account/**`, `/supplier/**`, `/admin/**`, `/checkout*`, `/cart`, `/login`, `/signup`, `/search`, `/coupon/*`, `/redeem/*`, `/gift/*`, debug, filtered category query strings, `?page=` copies if canonical is page 1 only (pick one strategy and stick: either paginated URLs in sitemap with self canonical, or page 1 only).

Admin client for generation so RLS cannot hide a public URL that 200s, and cannot include drafts.

### 6.2 robots

Allow storefront GET. Disallow:

```
/account
/admin
/supplier
/checkout
/cart
/coupon
/redeem
/api
/search
```

Sitemap URL absolute. Staging/preview: `Disallow: /` if a separate Vercel env.

404/500: noindex via metadata, not robots Disallow of the whole site.

---

## 7. Content quality gates

1. Unique `name_he` per product. Duplicate titles → merge or disambiguate with city/supplier in **title**, not keyword salad.
2. Coupon PDP must keep the split table (consumer law). Pixel gate does not override.
3. Thin city pages without suppliers: 404 or a single national CTA, not indexable fluff.
4. Live WP rankings: 301 map in `seo_redirects` before inventing new slugs.
5. `compare.mjs` scores layout vs Electro. Content, prices, images: live KenyonExpress.

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Clusters, templates, H1, linking, JSON-LD (Product, BreadcrumbList, Organization, Offer ILS), sitemap/robots |
