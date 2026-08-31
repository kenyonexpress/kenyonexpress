# ARCHITECTURE-WP-IMPORT-PIPELINE.md

Importing the WooCommerce catalogue: what maps to what, what is refused, and how
to undo it.

Status: BINDING. Branch `docs/architecture-night`, 2026-08-19.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed, and no
import run.
Code this describes: `scripts/wp-import/` (six stages plus `config.mjs`),
`scripts/wp-dry-run.mjs`, `scripts/wp-import/emit-missing-products.mjs`.
Schema: `supabase/migrations/032_wp_import_staging.sql`,
`057_wp_migration_log.sql`.
Source: `data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml`, 5.9 MB, WP 6.8.1.
Prior measurements: `docs/WP-IMPORT-2026-08-07-MAPPING.md`,
`docs/WP-EXPORT-2026-07-29-DRY-RUN.md`.

---

## 0. Two locks, and why

```bash
node scripts/wp-import/run.mjs                                     # dry run
WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs --apply    # writes
```

Writing requires **both** the `--apply` flag **and** the environment variable.
**One lock is a typo away from a live import. Two locks cannot both be tripped
by accident.**

A dry run does all the reading, transforming, image fetching and validating, and
prints the exact plan it would apply. It is not a preview mode with reduced
fidelity; it is the same pipeline with the last write suppressed.

---

## 1. The stages

```
extract -> transform -> load -> media -> project -> validate
```

| Stage | Reads | Writes | Touches `public.*`? |
|---|---|---|---|
| `extract` | WooCommerce REST, or a dump, or the WXR file | `wp_import/raw/` | no |
| `transform` | `wp_import/raw/` | `wp_import/normalized/` | no |
| `load` | `wp_import/normalized/` | `wp_import.*` staging tables | no |
| `media` | `wp_import/normalized/media.json` | storage bucket, `wp_import.media` | no |
| `project` | `wp_import.*` staging | `public.categories`, `public.products` | **yes** |
| `validate` | everything | `wp_import/reports/`, `wp_import.validation_reports` | no |

**Exactly one stage touches the live catalogue.** Every other stage can be run,
re-run and inspected with no possible effect on what a customer sees. That is
the whole point of the staging schema: `project` is a small, reviewable step
that reads rows a human has already looked at.

Sources are selectable (`--source rest | dump | xml | csv`), and a single entity
or a row limit can be pinned for spot re-runs. `--resume` continues into an
existing `import_batches` id rather than starting a new one.

---

## 2. The field mapping

### 2.1 Product core

| WooCommerce / WXR | KenyonExpress | Notes |
|---|---|---|
| `post_title` | `name_he` | |
| `post_name` | `slug` | **never rewritten.** §5.3 |
| `post_content` | `description_he` | HTML stripped to text. §3 |
| `post_excerpt` | `short_description_he` | truncated to 300; **not a second description** |
| `_sku` | `sku` | |
| `_regular_price` | `full_price` | |
| `_sale_price` / `_price` | `kenyon_price` | the effective site price |
| `_stock` | `stock_quantity` | |
| `_stock_status` | `status` contribution | `outofstock` does not by itself archive a product |
| `_weight` | `weight_grams` | lb/kg normalised to whole grams |
| `_length`/`_width`/`_height` | `length_mm`/`width_mm`/`height_mm` | **millimetres**, per migration 112 |
| `_virtual`, `_downloadable` | `requires_shipping` | inverted |
| product category terms | `category_id` | matched by Hebrew **name**, not slug. §2.3 |
| `_thumbnail_id`, gallery | `product_images`, `products.images` | §4 |
| Yoast/RankMath title | `seo_title` | truncated to 70 |
| Yoast/RankMath description | `seo_description` | truncated to 170 |
| post tags | `tags` | |
| `post_status` | **always `draft`** on import. §5.1 | |

### 2.2 What has no source, and is therefore left unset

This is the most important table in the document.

| Field | Why it cannot be derived |
|---|---|
| **`platform_percent`** | **There is no WooCommerce equivalent and no default anywhere in this project.** §2.4 |
| `supplier_split_percent` | same |
| `supplier_id` | WooCommerce has no supplier concept in this export |
| `coupon_price_ils` | the absolute on-site price of a coupon is a commercial decision |
| `coupon_expiry_days` | no source. An invented value is a consumer-facing promise nobody made |
| `offer_valid_until` | same |
| `city`, `latitude`, `longitude` | zero addresses exist to geocode. See `ARCHITECTURE-GEO-LOCATION.md` §0 |
| `cashback_percent` | commercial |

Every one of these stays **NULL**, and the product stays **draft**, which is
exactly the state that forces a human to set the real numbers before anything
sells.

### 2.3 Categories were matched by name, not by slug

Production uses English slugs; the export uses Hebrew ones. The Hebrew **names**
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

The eleventh, `uncategorized-2` (כללי), has no counterpart and **was not
created**. The 17 blog taxonomy terms were never candidates. **No category was
inserted at all.**

### 2.4 The stage that was refused

`scripts/wp-import/04-project-public.mjs` writes, from `config.mjs`:

```
platform_percent:  DEFAULTS.platformPercent   -> 10
commission_percent:                           -> 15
couponExpiryDays:                             -> 365
supplier: auto-created "Kenyon Express (legacy WP)", no phone, no address, no logo
```

**A fixed platform percent is the one thing this codebase forbids outright.**
Running that stage would have written a commission nobody agreed to onto 45
products, and hung them all off a supplier that is not a business.

`scripts/wp-import/emit-missing-products.mjs` was written instead. It emits only
what the export contains and leaves every derived number unset. **This is why
the pipeline's `project` stage was not used even in the parts where it could
have been**, and it is the correct precedent: a pipeline stage that invents
money is not a stage to fix later, it is a stage not to run.

---

## 3. HTML cleanup

`products.description_he` is rendered **as text** at
`src/app/(store)/product/[slug]/page.tsx` and feeds the page's meta description.
Importing raw `<ul><li>` would show customers literal markup and put tags in
search snippets.

The conversion, in order:

1. Decode entities (`&nbsp;`, `&#8211;`, and the Hebrew-heavy `&quot;`).
2. Convert structure to text: `<br>` and `</p>` to newlines, `<li>` to a bullet
   line, headings to a line with a blank line after.
3. Strip every remaining tag.
4. Drop WordPress shortcodes (`[vc_row]`, `[/vc_column]` and friends) entirely.
   A shortcode is not content; it is a rendering instruction for a plugin that
   does not exist here.
5. Collapse runs of whitespace and blank lines.
6. Trim.

Then `short_description_he` is taken from `post_excerpt` when present, and
otherwise derived as the first sentence of the cleaned description, capped at
300 characters on a word boundary.

**One description field.** Per `ARCHITECTURE-ADMIN-PRODUCT-FORM.md` §2.2,
`short_description_he` is a summary with a length budget, not a second body.
WooCommerce's two fields collapse into one description plus a derived summary,
and that collapse happens here rather than being pushed onto an admin later.

### 3.1 What is deliberately not converted

- **No Markdown.** The field is plain text and the renderer treats it as such.
  Emitting Markdown would mean the stored value renders differently in the two
  places that read it.
- **No link preservation.** A link in a WordPress description points at the old
  site. Keeping it would ship dead links; rewriting it would guess.
- **No image extraction from the body.** Body images are handled by §4 through
  the manifest, not by scraping `<img>` out of prose.

---

## 4. Images

### 4.1 What was measured

- 66 images referenced by the export, all on
  `https://kenyonexpress.co.il/wp-content/uploads/...`
- 325 derivatives (14 MB) already downloaded to `wp_import/media/`
- `media_uploaded`: **0 of 66**

### 4.2 The allowlist trap

That apex host was **not** in `REMOTE_IMAGE_PATTERNS`: `*.kenyonexpress.co.il`
matches one label and **misses the bare domain**. It was added, with tests
pinning both the apex and the lookalike rejections.

Verified live rather than assumed: the host answers 200 with
`content-length: 33578` for `greg_i.jpg`, byte-for-byte the size in the export's
manifest.

### 4.3 The current state is a dependency on the old site

Product images currently point at `kenyonexpress.co.il/wp-content/uploads/`.
**That is the old WordPress site, which is still serving through Cloudflare and
is the thing the DNS cutover replaces.** When DNS moves, those URLs break.

The ordering constraint that follows is not negotiable:

> **The media upload must complete before the DNS cutover.**

It is listed in `MASTER-ARCHITECTURE-v3.md` as a hard edge in the launch
sequence, not as a nice-to-have.

### 4.4 The target: R2, through the same path as an admin upload

```
wp_import/media/<file>
   -> validate: MIME sniffed from bytes, not from the extension
   -> key: products/<product_id>/<uuid>.<ext>
   -> PUT to R2 with the SigV4 presigner in src/lib/storage/r2.ts
   -> record in media_assets and product_images
   -> rewrite products.images to the CDN URL
```

Two rules:

1. **MIME is sniffed from the bytes.** A WordPress upload directory contains
   whatever was uploaded to it over the years, and an extension is a claim.
2. **The key is a fresh uuid, never the original filename.** Filenames from a
   ten-year-old media library collide, contain spaces and Hebrew, and would
   become a path.

Falls back to Supabase Storage when R2 is unconfigured, exactly as the admin
upload does.

### 4.5 Why it has not run

It needs a valid `service_role` key. `SUPABASE_SECRET_KEY` in `.env.local`
answers `401 {"message":"Invalid API key"}` to a plain
`GET /rest/v1/products?limit=1`. There is no working service key on this
machine, no `psql`, and no `DATABASE_URL`. The only route to the database is the
Supabase MCP connection, which cannot upload bytes.

---

## 5. Duplicates, identity, and the four hard cases

### 5.1 Everything imports as `draft`

```
products before / after : 61 -> 80
rows with attributes.imported_from : 19
of those, status='draft' : 19
of those, with a platform_percent : 0
status='active' before / after : 61 -> 61
```

**The last line is the one that matters for safety: the storefront showed
exactly what it showed before. Nothing became visible to a customer.**

`assertPublishable` refuses to activate a product whose split is unset or whose
supplier is incomplete, so draft is not a convention here, it is what the
publish gate produces.

`commission_percent` is `0` only because the column is `NOT NULL` with no
default. **`platform_percent` is NULL, and that is the column the publish gate
actually reads.** Anyone reading a `0` as an agreed commission is reading the
wrong column.

### 5.2 Deduplication, by slug, against the live catalogue

Measured before the write:

| | products | picsum images | had supplier |
|---|---|---|---|
| slug present in the WXR export | 25 | 0 | 25 |
| slug absent from it | 36 | 30 | 36 |

So **25 of the 45 export products were already imported** by an earlier run.
Another 30 are the picsum demo catalogue, plus 4 unsplash demo rows:
**34 demo products in total**, marked `attributes.demo = true` and **not
deleted**, because deleting is on the stop-and-ask list.

The dedup key is the **slug**, and the rule is:

```
slug exists in public.products  -> skip, record as already_imported
slug is new                     -> insert as draft
```

Never "update the existing row". An existing row may have been edited by a human
since the last import, and an import that overwrites human edits is a data-loss
event with a progress bar.

### 5.3 Slugs are never rewritten

**Five rows carry a slug that describes a different product than their title**,
and 20 of the 44 recycle another product's address:

- `שעון-אפל-חכם-apple-watch-series-7` is a breakfast deal
- `ארוחת-שף-במסעדת-אולטרה` is a facial
- `6253` is a Maldives package

**Nothing was renamed.** A slug is an addressable identity, and re-slugging
silently would break whatever links to it, from Google to a customer's bookmark.
The rows are flagged instead:

```sql
select slug, name_he from public.products
 where attributes->>'slug_title_mismatch' = 'true';
```

Publishing one as-is puts a customer on a page whose address contradicts its
content, so **the flag is a publish blocker**, resolved by a human choosing
between renaming with a 301 and leaving it.

### 5.4 Two rows excluded as scaffolding

`קופון-טסט` ("coupon test") and `product-template`. They have prices and images,
so **no automated gate catches them; only reading the title does.** They are
excluded by name, and the exclusion list is in the pipeline rather than applied
by hand, so a re-run excludes them again.

---

## 6. Validation gates

`validate` writes to `wp_import/reports/` and `wp_import.validation_reports`.
The three gates that currently fail, and what each means:

| Gate | Expected | Actual | Meaning |
|---|---|---|---|
| `media_uploaded` | 66 | 0 | the media stage is a no-op in a dry run, and blocked on the service key in a real one |
| `redirect_coverage` | 103 | 98 | five old URLs would 404 after cutover |
| `live_count_parity` | - | unknown | needs the WooCommerce REST API |

The extract stage also records five `extract.*.fail` operations: **every REST
call returns 401** because `WC_KEY` / `WC_SECRET` are unset. The pipeline falls
back to the WXR file, which is why the later stages still produce numbers. That
fallback is a feature, and it is also why `live_count_parity` cannot be
computed: there is nothing live to compare against.

### 6.1 Gates that should exist and do not

| Gate | Why it matters |
|---|---|
| **money sanity** | no imported row may carry a `platform_percent`, a `coupon_price_ils` or a `coupon_expiry_days`. The one failure mode of this whole pipeline is inventing money, and nothing currently asserts that it did not |
| **no active** | `count(*) where status='active' and attributes ? 'imported_from'` must be 0 after any run |
| **description is text** | no `<` in `description_he` for imported rows |
| **image reachability** | every referenced URL answers 200 before the row is written, not after |
| **slug collision with a redirect** | an imported slug must not collide with a redirect target |

These are listed rather than added, because adding them means editing
`scripts/`, which this branch does not do.

---

## 7. Rollback

### 7.1 What makes rollback possible

`057_wp_migration_log.sql` gives every run a batch id, and every projected row
carries `attributes.imported_from` plus the batch. Rollback is therefore a
**query**, not a reconstruction.

### 7.2 The plan, in order

```sql
-- 1. What would be undone. ALWAYS run this first.
select id, slug, name_he, status
  from public.products
 where attributes->>'import_batch' = :batch_id;

-- 2. Soft delete, never hard delete. Deleting rows is on the stop-and-ask list,
--    and a soft delete is reversible while a DELETE is not.
update public.products
   set deleted_at = now(), status = 'archived'
 where attributes->>'import_batch' = :batch_id
   and status = 'draft';           -- refuse to touch anything a human published

-- 3. The images belonging to those products.
update public.product_images
   set deleted_at = now()
 where product_id in (
   select id from public.products where attributes->>'import_batch' = :batch_id
 );

-- 4. Categories: nothing to undo. No category was ever inserted.

-- 5. Redirects created by the run, if any.
delete from public.seo_redirects where created_by_batch = :batch_id;
```

Three properties:

- **`and status = 'draft'`** in step 2 is the safety catch. If a human published
  an imported product between the run and the rollback, that product is theirs
  now and the rollback leaves it alone and reports it.
- **Soft delete**, so the rows can be restored by clearing `deleted_at`.
- **Storage objects are not deleted.** An orphaned object in R2 costs
  fractions of a cent; a deleted object referenced by a row that turns out to
  have been published is a broken product page.

### 7.3 What rollback cannot undo

- **Uploaded media.** See above: deliberately left.
- **A human's edits** to an imported draft. Step 2 refuses to touch published
  rows, but an edited draft is silently reverted. Mitigation: run the rollback
  soon, or not at all.
- **Search index documents**, if the products were ever active. The
  `search_index_outbox` trigger in `ARCHITECTURE-SEARCH-DISCOVERY.md` §7.4 would
  handle this automatically; today it must be triggered by touching the rows.

---

## 8. The remaining work, and who can do it

| # | Task | Blocked on |
|---|---|---|
| 1 | Upload the 66 images to R2 or Supabase Storage | a valid `service_role` key |
| 2 | Set commission and supplier on the 19 drafts | a human, per product. **There is deliberately no bulk default to apply** |
| 3 | Categorise 13 of the 19 | their WooCommerce category was `uncategorized` or a blog term |
| 4 | Resolve the 5 slug/title mismatches | a human decision: rename with a 301, or leave |
| 5 | Close `redirect_coverage` 98/103 | WooCommerce REST credentials |
| 6 | Decide on the 34 demo rows | `update products set deleted_at = now() where attributes->>'demo' = 'true';` is on the stop-and-ask list |
| 7 | Reindex Meilisearch after any of the above | the index job, once products go active |

Item 2 is the one that cannot be automated and must not be. Item 1 is the one
with a **deadline**: it must finish before the DNS cutover, per §4.3.
