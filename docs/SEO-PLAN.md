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

## 2.1 Section 2 audited against source (pass 14)

The table above is the plan. This is what `generateMetadata` and the static
`metadata` exports actually ship.

### 2.1.1 Coverage is near-total

| Mechanism | Routes |
|---|---|
| `generateMetadata` (dynamic) | `category/[slug]`, `product/[slug]`, `s/[id]`, `city/[slug]`, `search`, `coupons/[id]` |
| `export const metadata` (static) | 24 routes, including all twelve account pages, all four checkout pages, `/`, `/about`, `/blog`, `/cart`, `/coupons` |
| **Neither** | `checkout/confirmation` only |

`checkout/confirmation` is a redirect alias to `/checkout/return`, so inheriting
the root default is harmless. **Every route that renders has its own title.**

Root template, `src/app/layout.tsx:50`:

```
default:  קניון אקספרס | קופונים ומבצעים
template: '%s | קניון אקספרס'
```

### 2.1.2 Shipped titles

| Route | Shipped `title` |
|---|---|
| `/` | **`קניון EXPRESS — מסדרים לך בילוי`** (see 2.1.3) |
| `/products` | none of its own; root default |
| `/category/[slug]` | `category.name_he`, and `קטגוריה לא נמצאה` on the miss branch |
| `/product/[slug]` | product name, `מוצר לא נמצא` on the miss branch |
| `/s/[id]` | supplier name, `ספק לא נמצא` on the miss branch |
| `/city/[slug]` | `` `דילים ב${region.name}` `` |
| `/cart` | `סל הקניות` |
| `/checkout` | `תשלום` |
| `/coupons` | `קופונים` |
| `/suppliers` | `הצטרפו כספקים` |
| `/about` | `אודות` |
| `/faq` | `שאלות נפוצות` |
| `/contact` | `צור קשר` |
| `/blog` | `הבלוג` |

`robots: { index: false }` ships on `search`, and `{ index: false, follow: true }`
on the three not-found branches, which is the correct pairing: do not index a
miss, do keep crawling its links.

### 2.1.3 The home title contradicts section 0 twice

Section 0 of this document says, of `קניון EXPRESS: מסדרים לך בילוי`:

> Older plan guessed `קניון EXPRESS: מסדרים לך בילוי`. That string is **not**
> the current `<title>`.

and separately:

> Do not copy U+2014 into new titles (use a colon).

**The shipped home title is that string, with the em-dash.** From
`src/app/(store)/page.tsx`:

```
קניון EXPRESS — מסדרים לך בילוי
```

The separator is **U+2014**, verified by codepoint, not U+002D and not a colon.

So three values are in play and the document should stop implying there are two:

| | Value |
|---|---|
| Live WordPress today | `קניון אקספרס` |
| Root default in `layout.tsx` | `קניון אקספרס \| קופונים ומבצעים` |
| **What `/` actually renders** | `קניון EXPRESS — מסדרים לך בילוי` |

Section 0's table has a "Next template" column recommending the live short title
or the `'%s | קניון אקספרס'` pattern. Neither is what ships on the home page.
Section 2's own row for Home says "live: `קניון אקספרס`", which describes
WordPress rather than this app.

This is the one row in section 2 where plan and implementation disagree
outright. It is also cheap to settle, being one string, and it carries a
character the same document forbids elsewhere.

Recorded, not changed: the fix is in `.tsx`.

## 2.1 Section 2 audited against `generateMetadata` (pass 14)

Completing the set: section 5 was audited in pass 12, section 3 in pass 13, this
is section 2. Read off the root layout and the per-route `generateMetadata`.

**The root template is confirmed exactly:**

```
title.default   קניון אקספרס | קופונים ומבצעים
title.template  %s | קניון אקספרס
description     קופונים, מבצעים ומוצרים במחיר הכי טוב. בפריסה ארצית.
```

So every inner route that sets a bare `title` gets `… | קניון אקספרס` appended
by Next automatically. That is what section 2's "Root: `'%s | קניון אקספרס'`
except home" describes, and it holds.

### Three rows do not match

| Route | Section 2 says | Actually ships |
|---|---|---|
| Home `/` | live: `קניון אקספרס` | **`קניון אקספרס \| קופונים ומבצעים`** (the root `default`) |
| Category | `{cat} \| קופונים ומבצעים` | `category.name_he` + root template = **`{cat} \| קניון אקספרס`** |
| Product | `seo_title` or `{name} \| קופון {cat}` | `seo_title \|\| name_he \|\| 'מוצר'` + root template = **`{name} \| קניון אקספרס`**. There is no `קופון {cat}` suffix, and no coupon/physical split in the title at all |

`/products` **does** match: `PAGE_TITLE = 'חנות'` plus the template gives
`חנות | קניון אקספרס`, exactly as specified.

### What to make of each

**Home** is the only one with a live-parity dimension. Section 0 measured the
live `<title>` as the bare `קניון אקספרס` and said to keep it *or* use the
template on inner pages. We ship the longer form. That is a defensible choice
(the suffix carries two keywords the bare brand does not) and it **is** a
divergence from live, so it belongs in section 0's table rather than being
discovered later as a regression.

**Category and product** are the same shape of gap: section 2 specifies a
keyword-bearing suffix, and the code relies on the generic root template.
Neither is broken; both are less specific than planned. Fixing them means
setting a full `title` string per route rather than a bare one, since the
template appends to whatever is returned.

### One thing the code does better than the plan

The product description is a **fallback chain**, not a single field:

```
seo_description  ->  short_description_he  ->  (a generated fallback)
```

Its comment records why: Lighthouse SEO fails the whole page when
`<meta name="description">` is absent, and the chain guarantees every active PDP
has one **without inventing marketing copy**. Section 2 specifies only the first
option. The chain is the better rule and should be written into section 2 rather
than the other way round.

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

## 3.9 Section 3 audited against the source (pass 13)

Section 3 prescribes JSON-LD per page. This is what `src/lib/seo/json-ld.ts`
actually builds and which routes actually call `jsonLdScript`.

**Routes that emit JSON-LD** (six): `/`, `/category/[slug]`, `/product/[slug]`,
`/city/[slug]`, `/faq`, `/blog`.

**Types that ship:** `Organization`, `WebSite`, `SearchAction`, `EntryPoint`,
`Product`, `Offer` (x3), `Brand` (x2), `BreadcrumbList`, `ListItem`,
`FAQPage`, `Question`, `Answer`, `Blog`, `BlogPosting`.

### Finding 1: `SearchAction` ships, and section 3.1 forbids it

Section 3.1 says, in bold, **"No `SearchAction` (search is noindex and absent
from the header)"**. `src/lib/seo/json-ld.ts:223` emits one on every home page
render, inside `WebSite.potentialAction`, targeting
`{site}/search?q={search_term_string}`.

The code carries its own reasoning, and it is not careless:

> `SearchAction` points at the search route that exists (`/search?q=`). A
> sitelinks searchbox declared against a route that does not answer is worse
> than none: it is a promise the site fails in front of the person who uses it.

Both positions are defensible and they cannot both be shipped:

| Position | Argument |
|---|---|
| Section 3.1 (omit) | `/search` is `robots: { index: false }`. Advertising a search endpoint Google is told not to index is incoherent, and there is no header search box for a user to find. |
| The code (keep) | The route *works*. A sitelinks searchbox is a query interface, not an indexable page, and pointing it at a live route is honest. |

**This document is binding for this worktree, so the discrepancy is real and
unresolved.** It is recorded rather than decided here, because it is a product
call: either delete the `potentialAction` block or amend 3.1. What must not
happen is the next reader "fixing" one side without noticing the other.

### Finding 2: `LocalBusiness` does not ship at all

Section 3.4 specifies `LocalBusiness` for `/s/[id]` with
`@id: {origin}/s/{id}#business`, and the pass 9 revision row records a
"LocalBusiness data gate". Grepped across `src/`: the string `LocalBusiness`
appears **once**, in a comment in `city/[slug]/page.tsx` describing a planned
feature. No file builds it.

`/s/[id]/page.tsx` emits `title`, `description` and `openGraph` and **no JSON-LD
at all**: it is not among the six routes that call `jsonLdScript`.

So section 3.4 describes an intention, not an implementation. Marked as such
rather than left reading like a shipped contract.

### Finding 3: `CollectionPage` and `ItemList` do not ship

Section 3.2 specifies `BreadcrumbList` + `CollectionPage` + `ItemList` for
category and `/products`. Only `BreadcrumbList` ships (with `ListItem`, which is
its own child type, not `ItemList`). `AggregateRating` from 3.3 is likewise
absent, which is consistent with 3.3's own condition that it appear only when
the approved review count is above zero.

### Corrected status table

| Section | Prescribes | Ships | Status |
|---|---|---|---|
| 3.1 Home | `Organization` + `WebSite`, **no** `SearchAction` | both, **plus `SearchAction`** | **conflict, finding 1** |
| 3.2 Category | `BreadcrumbList` + `CollectionPage` + `ItemList` | `BreadcrumbList` only | partial |
| 3.3 Product | `Product` + `Offer` + `BreadcrumbList` | all three, plus `Brand` | **holds** |
| 3.3 `AggregateRating` | only when reviews > 0 | absent | consistent |
| 3.4 Supplier `/s/[id]` | `LocalBusiness` with `#business` `@id` | **nothing** | **not implemented** |
| (unlisted) `/faq` | not in section 3 | `FAQPage` + `Question` + `Answer` | **ships, undocumented** |
| (unlisted) `/blog` | not in section 3 | `Blog` + `BlogPosting` | **ships, undocumented** |
| (unlisted) `/city/[slug]` | not in section 3 | emits JSON-LD | **ships, undocumented** |

Same shape as the section 5 audit: the plan is incomplete in **both**
directions. Three routes emit structured data this document does not mention,
and two types this document specifies do not exist.

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

### 5.1 Audited against source (2026-09-07)

The two paragraphs above are the **plan**. `src/app/sitemap.ts` and
`src/app/robots.ts` are what **ships**. They differ, and the differences run in
both directions.

#### What the sitemap actually emits

| Entry | `changeFrequency` | `priority` | In the plan above? |
|---|---|---|---|
| `/` | daily | 1 | yes |
| `/products` | daily | 0.9 | yes |
| `/coupons` | daily | 0.9 | **no, plan omits it** |
| `/suppliers` | monthly | 0.7 | **no, plan omits it** |
| `/blog` | weekly | 0.6 | yes (blog index) |
| `/blog/{slug}` | monthly | 0.5 | **no, plan omits posts** |
| `/about` `/contact` `/faq` | monthly | 0.5 | yes |
| legal slugs (`LEGAL_PAGE_SLUGS`) | yearly | 0.3 | yes |
| `/category/{slug}` | daily | 0.8 | yes |
| `/product/{slug}` | weekly | 0.7 | yes |
| `/s/{id}` | weekly | 0.6 | yes |

`lastModified` is set on `/` (from `catalogueTouched`), on blog posts, and on
the legal pages. The legal ones carry a real `updatedAt` field on the document,
which is why they are dated where `/contact` is not, and they are listed rather
than left to be discovered because they are the four addresses the old site
already has indexed.

#### The gap: `/city/{slug}` is planned and not shipped

**`src/app/sitemap.ts` contains no `city` entry at all.** Verified by grep:
zero occurrences.

That matters because the city pages are indexable. `generateMetadata` in
`src/app/(store)/city/[slug]/page.tsx` sets
`alternates: { canonical: '/city/' + encodeURIComponent(region.slug) }` and sets
**no `robots` directive**, so the default applies. Only an unknown slug is
noindexed, and only because `notFound()` emits that itself.

So there are **17 indexable region landing pages with self-canonicals and no
sitemap entry**. `REGIONS` in `src/lib/regions.ts` holds exactly 17:

```
תל-אביב                    נתניה-והסביבה        גליל-תחתון
רמת-גן-גבעתיים-בני-ברק      חדרה-והסביבה         גליל-עליון
חולון-בת-ים-ראשון-לציון     ירושלים-והסביבה       גולן
פתח-תקוה                   השפלה                באר-שבע-והסביבה
השרון                      רחובות-נס-ציונה       אילת
                          אשדוד-אשקלון
```

**Every region slug is Hebrew**, so each URL is percent-encoded on the wire.
The page already calls `encodeURIComponent` for its own canonical; a sitemap
entry must encode identically, or the canonical and the sitemap URL will not
match and the entry is wasted.

This is the one actionable SEO finding in this pass. It is a `.ts` change, so
it is recorded here and not made.

#### robots.ts: the plan holds, and the file is stricter

| Plan says | robots.ts |
|---|---|
| Keep `Disallow` for account and checkout | **holds**: `/account/`, `/checkout` |
| Do not `Disallow` `/products` | **holds**: not listed |
| `hreflang` is not a robots directive | **holds**: none present |

The shipped `disallow` list is longer than the plan's:

```
/redeem/   /coupon/   /account/   /supplier/   /scan   /admin/
/checkout  /cart      /auth/      /api/        /reset-password
/forgot-password
```

`/redeem/` is deliberately first, and the file says why: **that path IS a signed
voucher token.** A crawler fetching one is fetching somebody's coupon, and an
indexed one is a coupon in a search result. It is the outermost of three layers,
the others being the page's own noindex and the supplier-session requirement.
The file also states the principle plainly: robots.txt is a request, not access
control, and everything listed is gated server-side as well.

#### Three plan exclusions that are absent from robots, correctly

`/search`, `/gift/*` and `/offline` appear in the plan's exclude list and **not**
in the shipped `disallow`. That is not a defect: two of them use the stronger
control instead.

| Route | Control |
|---|---|
| `/search` | `robots: { index: false }` in `page.tsx:32` |
| `/gift/[token]` | `robots: { index: false, follow: false }` in `page.tsx:18` |
| `/offline` | neither. Covered elsewhere; see section 3's note that it is omitted from JSON-LD |

A `Disallow` and a `noindex` are not interchangeable. A disallowed URL cannot be
crawled, so its `noindex` is never read, and a disallowed page can still be
indexed URL-only from inbound links. For `/gift/[token]`, where the token is
secret, `Disallow` is the right outer layer *and* `noindex` the right inner one,
which is exactly the belt-and-braces `/redeem/` already gets. `/gift/` currently
has only the inner layer.

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

## 8. Pass 14: silo graph, FAQPage, and the two sitemap decisions that stay decisions

Section 4 is a from/to table. This is the same map as a silo, plus the schema
and robots choices pass 12 measured and this pass will not silently "fix" in
`.ts`.

### 8.1 Silo (Hebrew storefront, one locale `he-IL`)

```
                         Home `/`
              (hub: deals, strip, footer)
                 /        |         \
        `/category/{slug}` `/products`  `/city/{slug}`
                 \        |         /
                    `/product/{slug}`
                           |
                      `/s/{id}`  (public shop)
                           |
                    city chip URLs `/products?city=`  (noindex)
```

Rules that keep the silo from leaking money or tokens:

| Edge | Allow | Deny |
|---|---|---|
| Home card → PDP | product `name_he`, link `#0062bd` | `platform_percent` in the anchor |
| PDP → `/s/{id}` | supplier name | `/supplier/{uuid}` (portal) |
| PDP coupon → `/coupon/{uuid}` | **after purchase only** | before pay (the QR is a capability) |
| City → `/s/{id}` | when a public supplier exists | inventing a thin city for a missing region |
| City → `/products?city=` | chips, **noindex** | hreflang on the query URL |
| Empty city → `/` or `/products` | recovery | `/search` |
| 404 → `/` and `/products` | recovery | `/search` |
| Account empty wishlist | `/products` (`לכל המוצרים`) | home Electro English |
| Account empty subscriptions | `/` (`לדילים באתר`) | `/products` |
| Checkout success | `/coupon/{id}`, `/account/orders/{id}` | public index of those URLs |
| Gift success | `/account/coupons` | indexing the gift token |

Home is the only page that may carry Electro home-v7 structure. City, supplier,
legal, account, gift, redeem do not grow a 241px departments column to "look
like home" for internal PageRank.

`hreflang="he-IL"` and `x-default` (same canonical) stay a **runtime plan**.
Pass 12 confirmed they are unshipped. Do not advertise `en`. HTML `lang="he"`
with OG `he_IL` is the shipped pair.

### 8.2 Schema additions that section 3 skipped

| Page | `@type` | Notes |
|---|---|---|
| `/faq` | `FAQPage` + `Question`/`AcceptedAnswer` **only** for visible Q&A in the DOM | Do not emit answers that are not on the page. Hebrew `inLanguage: he-IL` |
| `/about` | `AboutPage` + `Organization` `@id` `{origin}/#organization` | Same org node as home, do not mint a second Organization |
| `/contact` | `ContactPage`. `telephone` LTR only if real | No `LocalBusiness` for the marketplace itself |
| `/blog` index | `Blog` + `ItemList` of posts | Posts already in sitemap (pass 12 finding 2) |
| `/blog/{slug}` | `BlogPosting` + `Organization` publisher | `datePublished` / `dateModified` from the document |
| `/coupons` (listing) | `CollectionPage` + `ItemList` | Shipped in sitemap, omitted from the old include list. Treat as a deals index, not a second home |
| `/suppliers` join-us | `WebPage` only | **Not** `LocalBusiness`. It is a prospect form |

Still omitted from JSON-LD (section 3.7): cart, checkout, account, QR, gift
token, redeem token, search, 404, 500. `/offline`: pass 12 found it is **not**
noindex in source. Until that `.ts` change ships, do not emit JSON-LD on it
anyway (a service-worker tile is not a document).

Prices in any `Offer`: ILS from integer agorot. Coupon `Offer.price` is the
on-site amount. Remainder is a sentence, not a second Offer.

### 8.3 Two sitemap decisions, restated as rules (not silent `.ts` edits)

This worktree does not edit `.ts`. The two findings from pass 12 stay findings
until a code agent takes them.

| Finding | Rule until the code changes |
|---|---|
| `/city/{slug}`: 17 indexable Hebrew slugs, self-canonical, **absent from `sitemap.ts`** | Keep the pages indexable. Do not noindex them to make the sitemap look complete. When adding entries, percent-encode identically to the page's own `encodeURIComponent` |
| `/offline` has no `robots` key | Recorded as a gap. Manual QA still treats it as a PWA tile, not a landing page. Do not add it to the sitemap |
| `/gift/[token]` has `noindex,nofollow` and no `Disallow` | Correct for a token that must be crawlable to read noindex, **except** the token is secret. `/redeem/` already has both layers. Prefer matching `/redeem/` (Disallow + noindex) when a code agent next touches `robots.ts`. Until then, do not "fix" it by adding Disallow in a docs-only pass |

`/coupons`, `/suppliers`, `/blog/{slug}` ship in the sitemap and belong in
section 5's include list. This pass treats that as a plan correction, not a
code change.

Include (corrected): `/`, `/products`, `/coupons`, `/suppliers`, `/blog`,
`/blog/{slug}`, `/about`, `/contact`, `/faq`, legal slugs, `/category/{slug}`,
`/product/{slug}`, `/s/{id}`, and `/city/{slug}` **once the sitemap emits them**.

Exclude: account, cart, checkout, QR, gift, redeem, admin, supplier portal,
scan, auth, search (via noindex), filtered category and `?city=` (via noindex).

## 7. Core Web Vitals vs pixel gate

`compare.mjs` under 11 percent is **not** a CWV gate. LCP/CLS/INP still apply. Heebo `display: swap`, `preload: false` so the LCP paragraph can stay Arial on purpose. Consent banner is a known LCP risk on home.

### 7.1 `SearchAction` vs no header search (pass 15)

Pass 13 on this file found `SearchAction` **ships** in JSON-LD while section
3.1 forbids it. QA 10d rows 11-12 track the conflict. Until a code agent
settles it:

| If | Then |
|---|---|
| Keep `SearchAction` | `/search?q=` must 200, stay **noindex**, and must not grow a header field. The target is the page-level form |
| Drop `SearchAction` | section 3.1 already matches the standing chrome rule (no masthead search). Update QA 10d row 11 to expect 0 |

Do not "fix" this by restoring header search. That costs the home pixel gate
(534×41 yellow field) for a noindex route.

`Organization.@id` stays `{origin}/#organization` on home, about, contact,
faq, blog. One node. `LocalBusiness` still does not ship on `/s/{id}` (QA 10d
row 13). Do not mint a second Organization to fill that gap.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Plan with live title `קניון אקספרס`, `lang="he-IL"`, no live hreflang; schema per page; linking including account empties |
| 2026-09-07 | Pass 9: LocalBusiness data gate; `@id` `/s/{id}#business`; hreflang `x-default` matches ARCHITECTURE-SEO (same canonical) |
| 2026-09-07 | Pass 10: city seventeen regions; empty indexable; query chips noindex |
| 2026-09-07 | Pass 11: legal alias canonical; offline omitted from JSON-LD |
| 2026-09-07 | hreflang audited against source: lang="he" and og locale confirmed, hreflang/x-default confirmed unshipped in all 15 canonical routes |
| 2026-09-07 | Pass 12: section 5 audited against src/app/sitemap.ts and robots.ts. Four findings: /city missing from sitemap, three groups ship unlisted, /offline is NOT noindex, and the exclude list vs disallow list are different tools |
| 2026-09-07 | Pass 12: sitemap and robots audited against source. /city/{slug} indexable but absent from sitemap.ts (17 Hebrew slugs); /gift/[token] has noindex but no Disallow, unlike /redeem/ |
| 2026-09-07 | Pass 14: silo graph; FAQPage/AboutPage/ContactPage/BlogPosting; city stays indexable until sitemap.ts emits it; gift Disallow is a code-agent follow-up matching `/redeem/` |
| 2026-09-07 | Pass 13: section 3 audited against src/lib/seo/json-ld.ts. SearchAction ships though 3.1 forbids it; LocalBusiness does not ship at all; three routes emit undocumented JSON-LD |
| 2026-09-07 | Pass 15: SearchAction vs no header search is a settle-or-drop, not a restore-the-field; one Organization @id |
| 2026-09-07 | Pass 14: section 2 audited against source. Coverage is near-total (one redirect alias aside), and the shipped home title is the exact string section 0 says is not live, with the U+2014 section 0 forbids |
| 2026-09-07 | Pass 14: section 2 audited against generateMetadata. Root template confirmed; home, category and product titles differ from plan; the product description fallback chain is better than the spec |
