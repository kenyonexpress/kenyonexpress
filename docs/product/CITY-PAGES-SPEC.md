# City pages spec

Status: DRAFT · docs only  
Route (PLANNED): `/city/{slug}`  
Filter (LIVE): `?city={slug}` on catalog paths via `CityTags`  
Companions: `docs/CONTENT-SEO-PLAN.md`, `src/lib/geo/cities.ts`, `ARCHITECTURE-GEO-LOCATION.md`

There is no `src/app/**/city/**` route in HEAD. This spec is the landing page to build. Until it exists, hero tags keep using query filters. Do not publish an empty city URL.

Money copy on city pages: coupon price on site, remainder at the business after QR. No "הכי זול בעיר". No fake deal counts.

Brand in title: `קניון Express` once. H1 stays the region display name.

---

## 1. Seventeen regions

Live picker on the old WP site had 17 values. `CITIES` in HEAD has 13 municipal rows (hero five plus supplier cities). Landing pages use the 17-region model. Query filter may keep mapping supplier city names to the nearest region.

Hero tags (LIVE order, population): `tel-aviv`, `jerusalem`, `haifa`, `beer-sheva`, `eilat`. Those five stay under the home hero. The other twelve are in the city index and footer, not in the hero row.

| # | H1 / picker name | slug | In `CITIES` today | Hero |
|---|---|---|---|---|
| 1 | תל אביב | `tel-aviv` | yes (covers תל אביב יפו in body) | yes |
| 2 | רמת גן, גבעתיים, בני ברק | `ramat-gan` | yes (label רמת גן) | no |
| 3 | חולון, בת ים, ראשון לציון | `rishon-lezion` | yes (label ראשון לציון) | no |
| 4 | פתח תקווה | `petah-tikva` | yes | no |
| 5 | השרון | `sharon` | no (הרצליה and כפר סבא fold here) | no |
| 6 | נתניה והסביבה | `netanya` | yes | no |
| 7 | חדרה והסביבה | `hadera` | no | no |
| 8 | ירושלים והסביבה | `jerusalem` | yes | yes |
| 9 | השפלה | `shfela` | no | no |
| 10 | רחובות, נס ציונה | `rehovot` | no | no |
| 11 | אשדוד, אשקלון | `ashdod` | yes (label אשדוד) | no |
| 12 | חיפה והקריות | `haifa` | yes | yes |
| 13 | גליל תחתון | `lower-galilee` | no (טבריה folds here) | no |
| 14 | גליל עליון | `upper-galilee` | no | no |
| 15 | גולן | `golan` | no | no |
| 16 | באר שבע והסביבה | `beer-sheva` | yes | yes |
| 17 | אילת | `eilat` | yes | yes |

Slugs missing from `CITIES` must be added before the page is indexable. Until then: no public URL.

`herzliya`, `kfar-saba`, `tiberias` remain filter keys that redirect or canonical to `sharon` / `lower-galilee`. Do not keep a thin competing landing.

Empty inventory: `noindex,follow` or HTTP 404. Never a city page that invents deals.

Canonical: `https://kenyonexpress.co.il/city/{slug}` with no `?page=` and no `?city=`.

---

## 2. Content blocks (page top to bottom)

RTL. Heebo. Container `--container-page` 1320 on desktop. 380 stacks.

1. **Header chrome** (global).
2. **Breadcrumb:** בית → קופונים לפי אזור → {H1}.
3. **H1:** region display name from the table. Not the SEO title template.
4. **Lead (~80 to 120 words, unique per slug).** Must include: coupon paid on site, remainder at the business after scan. No copied paragraph across cities.
5. **Deal count (optional):** only a live count of `active` coupon products in that region. If 0, skip the number. Never "נשארו 12 דילים" as marketing scarcity.
6. **Category chips:** links to `/category/{cat}?city={slug}` for categories that have at least one active deal in the region.
7. **Deal grid:** same card as category archive (2 col at 380, up to 6 on 1440). Sort: current default catalog sort. Pagination: `?page=` not in canonical.
8. **How it works (3 steps, shared block, not unique SEO text):**
   1. בוחרים דיל ומשלמים באתר את מחיר הקופון.
   2. מציגים QR או קוד בבית העסק.
   3. משלימים יתרה בקופה רק אם היא כתובה בדיל.
9. **Other regions:** links to the 17 slugs (current one not linked). Empty regions omitted or `nofollow`.
10. **Footer.**

Shared block copy (Hebrew):

```
איך מממשים
משלמים באתר רק את מחיר הקופון. את היתרה, אם יש, משלמים בבית העסק אחרי סריקה. הקוד חד פעמי.
```

Do not embed a live customer QR. Do not list supplier phone numbers that are missing from the supplier row.

---

## 3. SEO title and meta per city

Pattern:

```
title: קופונים ב{שם הקצר} | קניון Express
meta:  קופונים ודילים ב{שם המלא} בקניון Express. משלמים באתר את מחיר הקופון, ואת היתרה בבית העסק אחרי סריקה.
```

Title ≤60 characters including spaces. Meta ≤155. H1 can be longer than the title's short name.

| slug | Title | Chars | Meta name used |
|---|---|---|---|
| `tel-aviv` | קופונים בתל אביב \| קניון Express | 32 | תל אביב |
| `ramat-gan` | קופונים ברמת גן והסביבה \| קניון Express | 38 | רמת גן, גבעתיים ובני ברק |
| `rishon-lezion` | קופונים בראשון לציון והסביבה \| קניון Express | 42 | חולון, בת ים וראשון לציון |
| `petah-tikva` | קופונים בפתח תקווה \| קניון Express | 34 | פתח תקווה |
| `sharon` | קופונים בשרון \| קניון Express | 28 | השרון |
| `netanya` | קופונים בנתניה \| קניון Express | 29 | נתניה והסביבה |
| `hadera` | קופונים בחדרה \| קניון Express | 28 | חדרה והסביבה |
| `jerusalem` | קופונים בירושלים \| קניון Express | 32 | ירושלים והסביבה |
| `shfela` | קופונים בשפלה \| קניון Express | 28 | השפלה |
| `rehovot` | קופונים ברחובות \| קניון Express | 30 | רחובות ונס ציונה |
| `ashdod` | קופונים באשדוד \| קניון Express | 29 | אשדוד ואשקלון |
| `haifa` | קופונים בחיפה והקריות \| קניון Express | 36 | חיפה והקריות |
| `lower-galilee` | קופונים בגליל התחתון \| קניון Express | 36 | גליל תחתון |
| `upper-galilee` | קופונים בגליל העליון \| קניון Express | 35 | גליל עליון |
| `golan` | קופונים בגולן \| קניון Express | 27 | גולן |
| `beer-sheva` | קופונים בבאר שבע \| קניון Express | 32 | באר שבע והסביבה |
| `eilat` | קופונים באילת \| קניון Express | 28 | אילת |

Index `/city` (if built): title `קופונים לפי אזור | קניון Express`. List only regions with at least one active deal.

`og:locale` stays `he_IL` until i18n ships. OG image: default site 1200×630, not a fake skyline stock photo.

---

## 4. JSON-LD

Emit on each city page (PLANNED; `src/lib/seo/json-ld.ts` has BreadcrumbList and Organization today, no Place helper yet).

1. `WebPage`
   - `name`: H1
   - `url`: canonical
   - `inLanguage`: `he-IL`
   - `isPartOf`: Organization KenyonExpress
   - `about`: `AdministrativeArea` or `City` with `name` = H1
2. `BreadcrumbList`: Home → Regions → this city
3. `ItemList` of the deals on page 1 only (url, name, offers with **on-site** price in ILS). Do not put till remainder as `price`.

Do not emit `LocalBusiness` for KenyonExpress as if it were the restaurant. Do not emit `LocalBusiness` for a supplier unless the supplier row has a real address.

---

## 5. Internal links

| From | To |
|---|---|
| Home hero tags | PLANNED `/city/{slug}`. Today `?city=` on current path. After launch, hero goes to the landing |
| City page | PDP `/product/{slug}`, category `/category/{cat}?city={citySlug}` |
| Category archive | city chip → `/city/{slug}` when the landing exists |
| Footer | `/city` index |
| Blog / SEO articles | city landing, never a `?city=` canonical |
| Sitemap | include `/city/{slug}` only when indexable (has active deals) |

`/category/{slug}?city=` remains a filter. It does not replace `/city/{slug}`.

---

## 6. Acceptance

- 17 slugs documented. Pages go live only when `CITIES` (or a region table) contains the slug and there is at least one active deal, or the page is 404/`noindex`.
- Unique lead per city. Shared how-to block is identical and not the H1.
- Title and meta match §3.
- JSON-LD price = on-site coupon price.
- No competing URLs for הרצליה / כפר סבא / טבריה once folded.
