# Blog spec

Status: DRAFT · docs only  
Companions: `docs/CONTENT-SEO-PLAN.md`, `src/content/blog/index.ts`

Customer copy is Hebrew. Slugs are Latin. Money in articles: on-site coupon price, never face value as "price". No "הכי זול בארץ". No Escrow.

---

## 0. Live model

| Piece | Live |
|---|---|
| Index | `/blog` + `Blog` JSON-LD |
| Post | MDX folder `src/app/(store)/blog/{slug}/page.mdx` + `BlogPostHeader` |
| Registry | `src/content/blog/index.ts` type `BlogPost` |
| Posts in HEAD | one: `how-coupons-work` (tags: קופונים, מדריך) |
| Editor | git / MDX, not an admin CMS |
| RSS `/feed.xml` | **deals** feed, not blog |
| Related products | PDP only, not wired into MDX |

There is no dynamic `[slug]` route. Each post is its own folder. Tests: `blog.test.ts` registry ↔ disk.

---

## 1. Article model

```
BlogPost
  slug            Latin, kebab, unique
  title           Hebrew H1, ≤60 target
  description     meta ≤155
  publishedAt     ISO date
  updatedAt       optional
  readingMinutes  integer
  tags[]          Hebrew labels
  category        slug from §3
  status          draft | published   (published = in registry + folder)
  relatedProductIds  uuid[] max 4, must be active coupons
  schema          Article | HowTo | FAQPage | ItemList
```

Unpublished = not in the registry. Do not add a `draft` public URL.

Canonical: `https://kenyonexpress.co.il/blog/{slug}`  
Indexable. Sitemap: `/blog` + each slug, priority ~0.5 to 0.6.

MDX must not duplicate title/date (header component owns them).

Required first-paragraph rule for commercial posts: coupon is paid on site, remainder at the business after QR.

---

## 2. Editor

v1 (LIVE): MDX in repo. PR review. `content_uploader` does not publish blog from `/admin`.

v2 (PLANNED): `/admin/blog` for `admin+` only.

| Field | UI | Notes |
|---|---|---|
| title | text | Hebrew |
| slug | `dir=ltr` | immutable after publish |
| description | textarea | meta |
| body | Markdown / MDX subset | no `dangerouslySetInnerHTML` of partner HTML |
| category | select | §3 |
| tags | chips | |
| related products | picker | active coupons only |
| SEO title override | optional | else `title` |
| schema type | select | |
| status | draft/publish | human only, no AI auto-publish |

AI assist may draft body in Hebrew. Publish still wants a human. Prices must come from product fields, not from the model.

Forbidden in body: PAN, live QR of a customer, invented stock, competitor paste.

---

## 3. Categories

Blog categories are **not** product categories. Do not create `/blog/restaurants-cafes` as a shadow catalog.

| slug | Hebrew | Intent |
|---|---|---|
| `guides` | מדריכים | HowTo, redemption, prices |
| `cities` | אזורים | links to `/city/{slug}` when those pages exist |
| `food` | אוכל | commercial investigation |
| `wellness` | יופי וספא | same |
| `travel` | נופש | same |
| `legal` | צרכנות | returns, privacy, 30א (no pretending to be counsel) |
| `partners` | לבתי עסק | onboarding, not a lead-spam blog |

Index filters: `/blog?topic={slug}` with canonical `/blog` when unfiltered, or `/blog/topic/{slug}` if we add it. Do not noindex guides.

WP blog taxonomy is ignored on import. Do not revive it.

---

## 4. SEO

Every published post:

- `title` / `description` from registry
- `og:type` article, `publishedTime`, image 1200×630
- `inLanguage` `he-IL`
- JSON-LD: `BlogPosting` + `BreadcrumbList`. Add `FAQPage` or `HowTo` when the body has that structure
- Internal links: at least one category or city + one of `/account/coupons`, `/legal` returns, or a live PDP
- No `?utm` on canonical

Title template if the layout appends brand: do not also put `קניון Express` in `title` twice.

H1 = `title`. Do not keyword-stuff English into H1.

Courses category: no "קנו קורס" article until a deal is `active`.

---

## 5. RSS

Today `/feed.xml` is deals. Keep it.

Add (PLANNED) `/blog/rss.xml`:

- Last 20 published posts
- Title, description, link, `pubDate`
- Language `he`
- No full body of legal posts if counsel forbids (guides OK)

`<link rel="alternate" type="application/rss+xml">` on `/blog` pointing at the **blog** feed, not the deals feed.

Do not merge deals items into the blog RSS.

---

## 6. Related products

Max 4. Must be `type=coupon`, `status=active`, with supplier completeness (name, phone, address, logo).

Render under the article as the same cards as PDP related (RTL, on-site price `dir=ltr`).

If fewer than 2 live matches: show category links instead of empty cards. Never picsum. Never a `physical` product on a coupon guide.

Manual MDX links are allowed in addition to the picker.

Hebrew heading:

```
דילים קשורים
מחיר הקופון באתר. יתרה, אם יש, בבית העסק אחרי סריקה.
```

---

## 7. Acceptance

- Registry and disk stay in lockstep (existing test).
- No blog CMS required for v1; v2 admin is optional.
- RSS for blog is a new URL; `/feed.xml` stays deals.
- Related products are live coupons only, on-site price only.
