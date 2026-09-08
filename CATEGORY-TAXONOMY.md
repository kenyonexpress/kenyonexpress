# CATEGORY-TAXONOMY

The storefront IA is the eleven rows in `KE_LIVE_CATEGORIES`
(`src/lib/ke-live-hero-data.ts`). The same list paints the desktop sidebar,
the top department strip, and the phone drawer, so they cannot drift.

The database table `categories` is wider: `parent_id`, `sort_order`,
`is_active`, Hebrew name, slug. `sort_order` is **not unique** on purpose;
the admin tree reorders by rewriting numbers. URL hierarchy is still flat:
`/category/{slug}` only.

Merchandising rows (`hot-deals`, `under-99`, `new`) are storefront entries.
They may be implemented as real rows, virtual filters, or both. They are not
a third `product_type`.

---

## 1. Full tree (Hebrew), as the live nav orders it

| # | Hebrew name | slug | Kind | Coupon | Physical | Notes |
|---|---|---|---|---|---|---|
| 1 | דילים חמים | `hot-deals` | merchandising | both | both | Highlight. Seasonal slot |
| 2 | עד ₪99 | `under-99` | merchandising | both | both | Price-band archive |
| 3 | החדשים | `new` | merchandising | both | both | Recency, not a vertical |
| 4 | מסעדות ובתי קפה | `restaurants-cafes` | vertical | primary | rare | Core coupon market |
| 5 | יופי בריאות וטיפוח | `beauty-health` | vertical | primary | both | Spa, clinic, cosmetics |
| 6 | טלפונים מחשבים ואביזרים | `phones-computers` | vertical | secondary | primary | Physical-leaning |
| 7 | תינוקות וילדים | `baby-kids` | vertical | both | both | |
| 8 | צימרים ובתי מלון | `vacation` | vertical | primary | no ship | Stay is a voucher, not a parcel |
| 9 | ציוד ומזון לבעלי חיים | `pets` | vertical | both | both | |
| 10 | בעלי מקצוע | `professionals` | vertical | primary | service-like | |
| 11 | קורסים Express – בקרוב . . . | `courses` | coming soon | n/a | n/a | Muted in the nav, not a shoppable archive yet |

"Which allow coupon vs physical" is **not** a CHECK on `categories`. A
product's `type` is `coupon` | `physical` | `service` | `recurring`. A
restaurant coupon and a physical gift box can share `restaurants-cafes` if
an admin files them there. The table above is IA guidance, not a database
lock.

Child categories (example: `restaurants-meat-2` in fixtures) live under a
parent via `parent_id`. They do not get their own top-nav row. Archive URL
stays `/category/{child-slug}`. Breadcrumb: home > parent name > child name.

---

## 2. Slug rules

- English kebab-case for departments (`restaurants-cafes`, `beauty-health`).
- Do not rename a live slug. Redirects from WordPress sit in `seo_redirects`.
- Hebrew in `name_he` only.
- `hot-deals` / `under-99` / `new` keep those slugs even if the Hebrew label
  changes for a campaign.

---

## 3. Icon assignment

Drawer and sidebar use the live Electro category art under
`public/images/hero/category/` (and CMS `homepage` / banner rows when
configured). Do not invent a new icon set that the pixel gate will fail.

Admin `CategoryForm` can store an icon URL. Empty icon: the archive still
renders; the nav falls back to the shared list without a custom glyph.

---

## 4. Sort order

Nav order is the array order in `KE_LIVE_CATEGORIES` (1 to 11 above).
Database `categories.sort_order` is the admin tree. They can disagree; the
**customer** sees the hardcoded live list until an explicit decision is made
to drive the header from the table. Do not half-switch: header from DB and
drawer from the constant is how eleven items become twelve on a phone only.

---

## 5. Seasonal plan

| Window | Use |
|---|---|
| Always | `hot-deals` as the first highlight |
| Summer | push `vacation` in home modules; keep the slug |
| Back to school | `baby-kids`, `phones-computers` |
| Holidays | merchandising copy on `hot-deals` and `under-99`, not a twelfth nav item |
| Ramadan / Jewish holidays | campaign rows and banners, not a new department |

Do not add `chanukah` as a permanent slug. Seasonal is a banner + the first
three merchandising slots.

`courses` stays "coming soon" until there are sellable rows. A live archive
of zero products is a soft 404 in search.

---

## 6. Category page SEO copy template

Title: `{name_he} | קופונים ומבצעים`

Description:

`דילים וקופונים בקטגוריית {name_he} בקניון אקספרס. מחיר בקניון באתר, יתרה בבית העסק בקופונים.`

H1: the Hebrew name, not the slug.

Intro paragraph (optional, CMS): one to two sentences, no `platform_percent`,
no English "Archive".

Canonical: `/category/{slug}` with sort and filter query stripped.
JSON-LD: `BreadcrumbList` plus product offers on cards as the product pages
already build them. Do not emit a fake `ItemList` of 10,000 offers.

Filtered views (city, price): `noindex`. The clean department URL stays the
indexable one.
