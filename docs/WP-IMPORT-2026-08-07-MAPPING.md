# WordPress import, 2026-08-07: mapping report and what was actually written


> <!-- v1-final-historical:2026-09-01 -->
> 🕯️ **Historical snapshot. Not current guidance.**
>
> This is a WordPress import mapping, true on the date it carries. It is kept as a record of what
> was measured and decided then, and it is **not** maintained against
> production. Numbers, table names and statuses in it may since have changed.
>
> For the current state see `docs/ARCHITECTURE-OVERVIEW.md`, and
> `docs/INDEX.md` for which document is authoritative on a given subject.

Source: `data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml` (5.9 MB, WP 6.8.1).
Every number below was measured, not carried over from the earlier dry-run doc.

## 1. Dry run

`node scripts/wp-dry-run.mjs`

| | |
|---|---|
| product categories | 11 |
| blog terms ignored | 17 |
| products (publish) | 44 |
| products skipped | 4 |
| images referenced | 65 |
| slugs unrelated to their title | 20 |

`node scripts/wp-import/run.mjs` (full pipeline, dry) reports 45 products, 28
categories, 66 media and 103 redirects, and fails three gates:

- `media_uploaded` 66 expected, 0 actual. The media stage is a no-op in a dry run.
- `redirect_coverage` 103 expected, 98 actual.
- `live_count_parity` unknown. Needs the WooCommerce REST API.

It also records five `extract.*.fail` operations: every REST call returns
**401 Unauthorized** because `WC_KEY` / `WC_SECRET` are not set. The pipeline
falls back to the WXR file, which is why the later stages still produce numbers.

## 2. The two things that blocked the pipeline's own `--apply`

**The service key is dead.** `SUPABASE_SECRET_KEY` in `.env.local` answers
`401 {"message":"Invalid API key"}` to a plain `GET /rest/v1/products?limit=1`.
There is no working service key on this machine (`.env.production` has none,
`.env.test` has the literal placeholder `<service...`), and no `psql` and no
`DATABASE_URL`. The only route to the database is the Supabase MCP connection.

**The projection would have invented money.** `scripts/wp-import/04-project-public.mjs`
writes `platform_percent: DEFAULTS.platformPercent` (**10**),
`commission_percent` (**15**) and `couponExpiryDays` (**365**) from
`config.mjs`, and hangs every row off an auto-created supplier
`Kenyon Express (legacy WP)` with no phone, address or logo.

A fixed platform percent is the one thing this codebase forbids outright
(CONTRADICTIONS C1, ADMIN-ARCHITECTURE section 0: the percent is per product and
has no default anywhere). Running that stage would have written a commission
nobody agreed to onto 45 products. **This is the reason the pipeline's project
stage was not used even in the parts where it could have been.**

`scripts/wp-import/emit-missing-products.mjs` was written instead. It emits only
what the export contains and leaves every derived number unset.

## 3. What production already had

61 products, 12 categories, 11 suppliers, 4 orders, 0 media assets.

| | products | picsum images | had supplier |
|---|---|---|---|
| slug present in the WXR export | 25 | 0 | 25 |
| slug absent from it | 36 | 30 | 36 |

So **25 of the 45 export products were already imported** by an earlier run, and
30 of the remaining 36 are the picsum demo catalogue. Four more
(`samsung-galaxy-s24`, `airpods-pro-2`, `macbook-air-m3`, `anker-powerbank-20k`)
are unsplash-image demo rows: **34 demo products in total**.

### Categories were already migrated

Production uses English slugs; the export uses Hebrew ones. The Hebrew *names*
match, so 10 of the 11 product categories pair up exactly:

| WXR slug | production slug |
|---|---|
| `מסעדות-ובתי-קפה` | `restaurants-cafes` |
| `יופי-בריאות-וטיפוח` | `beauty-health` |
| `טלפונים-מחשבים-ואביזרים` | `phones-computers` |
| `תינוקות-וילדים` | `baby-kids` |
| `צימרים-מלונות-ונופש` | `vacation` |
| `ציוד-ומזון-לבעלי-חיים` | `pets` |
| `בעלי-מקצוע` | `professionals` |
| `קורסים-express` | `courses` |
| `hot-deals` | `hot-deals` |
| `עד-99` | `under-99` |

The eleventh, `uncategorized-2` (כללי), has no counterpart and was not created.
**No category was inserted.** The 17 blog taxonomy terms were never candidates.

## 4. What was written

19 products, all as `status = 'draft'`.

| check | result |
|---|---|
| products before / after | 61 → **80** |
| rows carrying `attributes.imported_from` | **19** |
| of those, `status = 'draft'` | **19** |
| of those, with a `platform_percent` | **0** |
| of those, with no category | 13 |
| rows marked `attributes.demo = true` | **34** |
| rows flagged `attributes.slug_title_mismatch` | **5** |
| **`status = 'active'` before / after** | **61 → 61** |

The last line is the one that matters for safety: the storefront shows exactly
what it showed before. Nothing became visible to a customer.

### Choices made in that write, and why

**Draft, no supplier, no percent.** `assertPublishable` refuses to activate a
product whose split is unset or whose supplier is incomplete, so this is the
state that forces a human to set the real commission and attach a real business
before anything sells. `commission_percent` is 0 only because the column is
NOT NULL with no default; `platform_percent` is NULL, and that is the column
the publish gate actually reads.

**Two rows were excluded as scaffolding**, not merchandise: `קופון-טסט`
("coupon test") and `product-template`. They have prices and images, so no
automated gate catches them; only reading the title does.

**Descriptions were converted from HTML to text.** `products.description_he` is
rendered as text at `src/app/(store)/product/[slug]/page.tsx:254` and feeds the
page's meta description. Importing raw `<ul><li>` would have shown customers
literal markup and put tags in search snippets.

**Images use the legacy origin.** All 66 are on `https://kenyonexpress.co.il/wp-content/uploads/...`.
That apex host was NOT in the allowlist - `*.kenyonexpress.co.il` matches one
label and misses the bare domain - so it was added to `REMOTE_IMAGE_PATTERNS`
with tests pinning both the apex and the lookalike rejections. Verified live:
the host answers 200 with `content-length: 33578` for `greg_i.jpg`, byte-for-byte
the size in the export's manifest.

**This is a dependency on the old WordPress site staying up.** It is the
temporary state until the media stage can upload to Supabase Storage, which
needs the service key.

## 5. Open, and not doable from this machine

1. **Upload the 66 images.** 325 derivatives (14 MB) are already downloaded to
   `wp_import/media/`. Uploading needs a valid `service_role` key. Until then
   `media_uploaded` stays 0/66 and product images point at the old site.
2. **Set commission and supplier on the 19 drafts.** By hand, per product, in
   the admin. There is deliberately no bulk default to apply.
3. **13 of the 19 have no category.** Their WooCommerce category was either
   `uncategorized` or a blog term.
4. **5 rows have a slug that describes a different product than their title**
   (`שעון-אפל-חכם-apple-watch-series-7` is a breakfast deal; `ארוחת-שף-במסעדת-אולטרה`
   is a facial; `6253` is a Maldives package). The slug is the URL, so publishing
   one as-is puts a customer on a page whose address contradicts its content.
   Nothing was renamed: a slug is an addressable identity, and re-slugging
   silently would break whatever links to it. Query them with
   `where attributes->>'slug_title_mismatch' = 'true'`.
5. **`redirect_coverage` 98/103 and `live_count_parity`** both need the
   WooCommerce REST credentials.
6. **The 34 demo rows are marked, not deleted.** Deleting is on the
   stop-and-ask list. To remove them later:
   `update products set deleted_at = now() where attributes->>'demo' = 'true';`
