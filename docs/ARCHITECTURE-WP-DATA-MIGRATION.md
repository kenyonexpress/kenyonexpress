# Architecture: WordPress / WooCommerce Data Migration to Supabase

Status: binding operational spec for the WP import track (track W).
Source of truth for extraction, field mapping, image pipeline, SEO
continuity, and cutover of the live catalog.

Context: the live site `https://kenyonexpress.co.il` runs WordPress +
WooCommerce. It is being replaced by the new stack (Next.js App Router +
Supabase) on the same domain with zero catalog loss and full SEO
continuity. This document migrates three entity classes only: products,
product images, and categories. Historical orders and customers are
explicitly out of scope for import (archive only, see section 5.5).

Related docs: `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` (slugs,
seo_redirects consumers), `docs/ARCHITECTURE-PRODUCTION-OPS.md` (DNS,
cutover, backups), `docs/MASTER-ARCHITECTURE.md` (canonical migration
order).

Guiding principles:

1. REST API first. Extraction reads the live WooCommerce REST API. A full
   `mysqldump` is captured as a cold fallback only (section 1.4).
2. Idempotent one-shot. Every stage is re-runnable. Re-running upserts by
   a stable `id_map`, never duplicates.
3. SEO is load-bearing. Every old product and category URL either keeps
   its slug or gets a 301 in `seo_redirects`. No old URL 404s.
4. The live Supabase schema is the target of record. Mapping is validated
   against the live DB, not against migration files.

---

## 0. Target schema (verified live)

`public.products`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | pk, generated |
| `slug` | text | UNIQUE, SEO slug |
| `name_he` | text | display name (Hebrew) |
| `description_he` | text | long description, cleaned |
| `price_ils` | numeric | selling price in ILS |
| `compare_at_price_ils` | numeric | strike-through / was price |
| `supplier_id` | uuid | fk suppliers (merchant entity) |
| `category_id` | uuid | fk categories |
| `type` | product_type | enum: coupon, physical, service |
| `images` | jsonb | array of image objects (section 3.4) |
| `status` | product_status | enum: draft, active, archived |
| `is_coupon_enabled` | boolean | coupon behavior toggle |
| `platform_percent` | numeric | platform take rate |
| `commission_percent` | numeric | supplier commission |
| `coupon_expiry_days` | integer | validity window for coupons |
| `cashback_percent` | numeric | cashback rate |

`public.categories`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | pk |
| `name_he` | text | display name |
| `slug` | text | UNIQUE, SEO slug |
| `icon_url` | text | category icon (storage URL) |
| `sort_order` | integer | display order |

`public.suppliers`: the merchant entity. WooCommerce has no first-class
supplier concept, so every imported product is attached to one synthetic
"Kenyon Express (legacy WP)" supplier row unless a vendor mapping is
supplied (section 2.4).

Storage: Supabase Storage bucket `product-images` (public read). Cloudflare
R2 is an approved alternative behind the same key layout `wp/<wp_id>/...`;
the pipeline in section 3 is storage-agnostic and only the upload adapter
changes.

---

## 1. Extraction

### 1.1 Method: WooCommerce REST API (primary)

Extraction reads the live store over `wp-json/wc/v3`. This is preferred
over a DB dump because it returns fully resolved product JSON (variations,
category terms, image srcs, meta) without reverse-engineering the
`wp_postmeta` key soup, and it works against the live site with read-only
credentials.

Authentication: WooCommerce REST consumer key + secret (read-only scope),
generated in WooCommerce > Settings > Advanced > REST API. Over HTTPS the
credentials may be sent as query params or Basic auth; prefer the Basic
auth header to keep secrets out of logs.

```bash
# environment for the extractor
export WC_BASE="https://kenyonexpress.co.il"
export WC_KEY="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export WC_SECRET="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 1.2 Endpoints and query params

Products list (paginated):

```text
GET {WC_BASE}/wp-json/wc/v3/products
  ?per_page=100          # max page size WooCommerce allows
  &page=1                # 1-based; iterate until empty page
  &status=any            # include draft/private, we decide status on map
  &orderby=id
  &order=asc
  &_fields=id,name,slug,type,status,description,short_description,
           regular_price,sale_price,price,sku,categories,images,
           date_created,date_modified,permalink,meta_data
```

Single product (for retry / spot re-fetch):

```text
GET {WC_BASE}/wp-json/wc/v3/products/{id}
```

Variations (only when `type == variable`, used to derive price range):

```text
GET {WC_BASE}/wp-json/wc/v3/products/{id}/variations?per_page=100&page=N
```

Categories list (paginated):

```text
GET {WC_BASE}/wp-json/wc/v3/products/categories
  ?per_page=100
  &page=1
  &orderby=menu_order
  &order=asc
  &_fields=id,name,slug,parent,menu_order,description,image,count
```

Pagination contract: WooCommerce returns `X-WP-Total` and
`X-WP-TotalPages` response headers. Loop `page` from 1 to `X-WP-TotalPages`.
Treat an empty array or a page beyond `X-WP-TotalPages` as end-of-stream.
Never trust a hardcoded count.

### 1.3 Rate limiting and resilience

- Concurrency: 2 in-flight requests max against the live store.
- Throttle: minimum 250 ms between requests (about 4 req/s), backing off
  to 1 req/s if any 429 or 5xx is seen.
- Retry: exponential backoff (500 ms, 1 s, 2 s, 4 s), max 5 attempts, on
  429 / 500 / 502 / 503 / 504 and network errors. Honor `Retry-After`.
- Checkpoint: after each page, write raw JSON to
  `wp_import/raw/products_page_{n}.json` (and categories likewise) so a
  crash resumes from the last completed page, not from zero.
- All raw responses are archived verbatim before any transform. The raw
  archive is the audit trail (section 5.4).

### 1.4 Fallback: mysqldump (cold only)

If the REST API is unavailable (plugin disabled, host blocks it, or the
site is already frozen for cutover), fall back to a full logical dump plus
an uploads copy. This is a fallback, not the default path.

```bash
mysqldump --single-transaction --quick --default-character-set=utf8mb4 \
  --routines --triggers --hex-blob "$DB_NAME" \
  | gzip > ke-wp-$(date +%Y%m%d).sql.gz

rsync -az user@host:/var/www/wp-content/uploads/ ./wp-uploads/
```

From a dump, products come from `wp_posts` (`post_type='product'`), prices
and meta from `wp_postmeta` (`_regular_price`, `_sale_price`, `_sku`,
`_thumbnail_id`, `_product_image_gallery`), categories from
`wp_terms` + `wp_term_taxonomy` (`taxonomy='product_cat'`) joined via
`wp_term_relationships`. The mapping in section 2 lists both the REST field
and its dump-equivalent column so either source lands on the same target.

---

## 2. Field mapping

### 2.1 products: WooCommerce JSON to public.products

| Target column | WC REST field | Dump source | Transform |
| --- | --- | --- | --- |
| `slug` | `slug` | `wp_posts.post_name` | keep verbatim; if empty, slugify `name`; enforce UNIQUE (section 4.2) |
| `name_he` | `name` | `wp_posts.post_title` | trim; HTML entity decode |
| `description_he` | `description` (fallback `short_description`) | `wp_posts.post_content` | strip HTML to safe subset (section 2.3) |
| `price_ils` | see price logic 2.2 | `_regular_price` / `_sale_price` | numeric parse; 2 dp; reject if NaN |
| `compare_at_price_ils` | see price logic 2.2 | `_regular_price` | null unless on sale |
| `type` | `type` | derived from category / meta | map to enum (2.5) |
| `status` | `status` | `wp_posts.post_status` | `publish` to `active`, `draft`/`pending` to `draft`, `trash`/`private` skipped |
| `images` | `images[]` | `_thumbnail_id` + `_product_image_gallery` | run image pipeline (section 3), store jsonb |
| `category_id` | `categories[0]` | first `product_cat` term | resolve via category id_map (2.6); primary category only |
| `supplier_id` | none | none | synthetic legacy supplier, or vendor map (2.4) |
| `is_coupon_enabled` | derived | derived | true when `type == coupon`, else false |
| `platform_percent` | none | none | config default per category (business rule), not in WP |
| `commission_percent` | none | none | config default per category, not in WP |
| `coupon_expiry_days` | `meta_data[_expiry_days]` if present | `wp_postmeta` | integer parse; config default when absent |
| `cashback_percent` | none | none | config default (0 unless override) |

WooCommerce has no columns for `platform_percent`, `commission_percent`,
or `cashback_percent`. These are new commerce economics and are seeded from
a config default per category, not invented per row. They are recorded in
the import config so the values are auditable, not silently zero.

### 2.2 Price logic

```text
regular = number(regular_price)   # WC _regular_price
sale    = number(sale_price)      # WC _sale_price, may be empty

if sale is present and sale > 0 and sale < regular:
    price_ils            = sale
    compare_at_price_ils = regular      # strike-through the old price
else:
    price_ils            = regular
    compare_at_price_ils = null

# variable products: price_ils = min variation price,
# compare_at_price_ils = null, flagged in report for manual review.
```

Reject rules: a product with no parseable price maps to `status = draft`
and is listed in the validation report. It never lands `active` with a null
price.

### 2.3 HTML cleaning for description_he

`post_content` (WC `description`) is WordPress HTML with shortcodes,
Gutenberg comments, and inline styles. Cleaning steps:

1. Strip WordPress block comments (`<!-- wp:... -->`).
2. Strip shortcodes (`[...]`).
3. Allow-list tags only: `p, br, ul, ol, li, strong, em, a, h2, h3`.
   Everything else is unwrapped, not deleted (keep the text).
4. Rewrite any `wp-content/uploads` image or link URLs to their new
   storage URLs when they were carried through the image pipeline.
5. Decode HTML entities, collapse whitespace, trim.

Result is stored as sanitized HTML in `description_he`.

### 2.4 supplier_id resolution

Default: one synthetic supplier row `Kenyon Express (legacy WP)` is created
once and every imported product points at it. If a WooCommerce multi-vendor
plugin (Dokan, WC Vendors, YITH) is present, its vendor id lives in
`meta_data` or a `post_author` mapping; a `vendor_map.csv`
(`wp_vendor_id,supplier_id`) can be supplied to attach products to real
suppliers. Absent that file, everything attaches to the legacy supplier.

### 2.5 type mapping to product_type enum

| Signal in WP | Target `type` |
| --- | --- |
| category in coupon set, or meta `_is_coupon`, or virtual + downloadable | `coupon` |
| WooCommerce `virtual` service category | `service` |
| everything else (shippable goods) | `physical` |

The coupon category set is an explicit config list of `product_cat` slugs,
resolved once and reviewed before the run. `is_coupon_enabled` follows
`type == coupon`.

### 2.6 categories: WooCommerce product_cat to public.categories

| Target column | WC REST field | Dump source | Transform |
| --- | --- | --- | --- |
| `name_he` | `name` | `wp_terms.name` | trim, entity decode |
| `slug` | `slug` | `wp_terms.slug` | keep verbatim; UNIQUE |
| `icon_url` | `image.src` | term meta `thumbnail_id` | run through image pipeline, store storage URL |
| `sort_order` | `menu_order` | `wp_term_taxonomy` order | integer; default 0 |

Category hierarchy: WooCommerce categories are a tree (`parent`). The target
`public.categories` is flat, so the `parent` chain is flattened to the leaf
category, and each product maps to its most specific (leaf) `product_cat`
term. Parent-only URLs still get 301s (section 4). The `parent` value is
retained in the id_map metadata for redirect construction.

---

## 3. Image pipeline

Images are the largest and slowest part. The pipeline is deterministic and
content-addressed so re-runs never re-upload identical bytes.

### 3.1 Source discovery

For each product, collect image URLs from `images[].src` (REST) or from
`_thumbnail_id` + `_product_image_gallery` attachment ids resolved to
`wp-content/uploads/...` paths (dump). Preserve order; `images[0]` is the
primary. Category `icon_url` sources are collected the same way.

### 3.2 Steps

```text
for each source image URL:
  1. download bytes (same throttle/backoff as section 1.3);
     stream to a temp file, verify content-length and content-type.
  2. sha256(bytes) -> content_hash. Look up content_hash in the
     dedup index. If present, reuse the existing storage key (skip
     conversion and upload). This dedups shared images across products.
  3. convert with sharp:
       - main:  resize to max width 1600px (no upscale), WebP q80
       - og:    1200x630 cover crop, WebP q80  (social / OG derivative)
     strip EXIF and metadata.
  4. compute storage keys under a per-product prefix:
       wp/<wp_id>/<content_hash>.webp
       wp/<wp_id>/<content_hash>.og.webp
  5. upload both derivatives to bucket product-images
     (upsert; content-addressed keys make this idempotent).
  6. record {wp_attachment_id, content_hash, storage keys, width,
     height, alt} in the dedup index and the product image list.
```

### 3.3 Dedup by sha256

The dedup index is a table in the import staging schema:
`(content_hash text primary key, storage_key text, og_key text,
width int, height int, bytes int)`. Step 2 short-circuits on a hit. Because
keys embed the hash, a partial or crashed run re-computes the same keys and
overwrites the same objects: safe to re-run.

### 3.4 images jsonb shape written to products

```json
{
  "images": [
    {
      "url": "https://<project>.supabase.co/storage/v1/object/public/product-images/wp/1234/9f8a...c1.webp",
      "og_url": "https://<project>.supabase.co/storage/v1/object/public/product-images/wp/1234/9f8a...c1.og.webp",
      "alt": "product alt text",
      "width": 1600,
      "height": 1200,
      "sha256": "9f8a...c1",
      "position": 0
    }
  ]
}
```

`position: 0` is the primary image used in listings and OG tags. URLs are
absolute storage URLs so the client needs no rewriting. If R2 is chosen,
`url` and `og_url` point at the R2 public domain; nothing else changes.

---

## 4. Slug preservation and 301 redirect map

### 4.1 Principle

SEO equity lives in the URLs. The rule: keep the WooCommerce slug whenever
it is a valid, unique target slug. Only when a slug must change (collision,
or a deliberate move to a latin slug) do we mint a new slug and write a 301
from the old path to the new path. No old indexed URL may 404.

### 4.2 Slug rules

1. Default: `products.slug = woo.slug`, `categories.slug = woo.slug`.
2. Collision: if two products resolve to the same slug, the second gets a
   deterministic suffix (`-2`, `-3`) and a 301 is written from its old
   path (the old path is unique on WP, so no data is lost).
3. Latin remap (optional): where product owners want ASCII slugs, a
   `slug_overrides.csv` (`wp_id,new_slug`) supplies them; every override
   generates a 301 from the old Woo path to the new path.

### 4.3 URL shape mapping

WooCommerce default permalinks and their new App Router targets:

| Old WP path | New App Router path |
| --- | --- |
| `/product/<slug>/` | `/p/<slug>` |
| `/product-category/<slug>/` | `/c/<slug>` |
| `/product-category/<parent>/<child>/` | `/c/<child>` (leaf) |
| `/shop/` | `/shop` |
| `/?p=<id>` and `/?product=<slug>` | resolved to `/p/<slug>` |

The exact new path prefixes (`/p`, `/c`, `/shop`) are the ones defined in
`docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md`; this doc adopts them. Every old
path in the sitemap and in Search Console is enumerated and gets a row.

### 4.4 seo_redirects DDL

```sql
create table if not exists public.seo_redirects (
  id           uuid primary key default gen_random_uuid(),
  source_path  text not null,             -- old path, normalized, no host, no trailing slash
  target_path  text not null,             -- new path on the same host
  status_code  smallint not null default 301
                 check (status_code in (301, 302, 308, 410)),
  entity_type  text check (entity_type in ('product','category','other')),
  wp_id        bigint,                     -- source WP object id, for audit
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint seo_redirects_source_unique unique (source_path)
);

create index if not exists seo_redirects_source_idx
  on public.seo_redirects (source_path) where is_active;
```

Normalization contract: `source_path` is stored lowercased, host stripped,
query string stripped for path-based matches (query-only sources like
`/?product=slug` are stored with their query and matched separately), and
without a trailing slash. The lookup normalizes the incoming request path
the same way before matching, so `/Product/Foo/` and `/product/foo` both
hit one row.

### 4.5 App Router redirect handling

Redirects are served in `middleware.ts` (edge), not per-page, so they fire
before rendering and cost one indexed lookup:

```ts
// middleware.ts (sketch)
export async function middleware(req: NextRequest) {
  const path = normalize(req.nextUrl.pathname); // lowercase, strip trailing slash
  const hit = await lookupRedirect(path);       // cached seo_redirects lookup
  if (hit) {
    const url = req.nextUrl.clone();
    url.pathname = hit.target_path;
    return NextResponse.redirect(url, hit.status_code); // 301 by default
  }
  return NextResponse.next();
}
```

The `seo_redirects` table is loaded into an edge-cached map (or KV) at
build/deploy and refreshed on change, so the hot path does not hit Postgres
per request. Static bulk redirects can additionally be emitted into
`next.config` `redirects()` at build time from the same table for the
highest-traffic paths.

---

## 5. Execution, validation, rollback

### 5.1 Idempotent one-shot with id_map

A staging schema (`wp_import`) holds the crosswalk and never leaks to
PostgREST:

```sql
create table if not exists wp_import.id_map (
  entity       text not null check (entity in ('product','category','image','supplier')),
  wp_id        bigint not null,
  target_id    uuid   not null,
  content_hash text,               -- for images
  created_at   timestamptz not null default now(),
  primary key (entity, wp_id)
);
```

Every write to `public.*` goes through `id_map`: look up `(entity, wp_id)`,
if present UPDATE the mapped `target_id`, else INSERT and record the new
uuid. Re-running the whole pipeline is a pure upsert. No duplicates, stable
uuids across runs.

### 5.2 Batching and order

Fixed execution order (dependencies first):

1. Suppliers (synthetic legacy row, plus any vendor map).
2. Categories (all, so `category_id` fk resolves).
3. Images (download, convert, dedup, upload; fills the dedup index).
4. Products (map, attach `category_id` / `supplier_id`, write `images` jsonb).
5. seo_redirects (built from id_map + slug decisions).

Products run in batches of 200. Each batch is a transaction: it commits or
rolls back whole. Batch boundaries are recorded so rollback and re-run
operate per batch.

### 5.3 Validation gates

The run does not flip to live until all gates pass:

- Count parity: `count(public.products where status <> 'archived')` equals
  the WooCommerce published/draft count minus explicitly skipped
  (trashed/private) rows. Same for categories.
- Referential integrity: zero products with null `category_id` or
  `supplier_id`; zero `category_id` / `supplier_id` pointing at a missing row.
- Price sanity: zero `active` products with null or non-positive
  `price_ils`; zero rows where `compare_at_price_ils <= price_ils`.
- Slug uniqueness: `products.slug` and `categories.slug` each have zero
  duplicates; count matches distinct count.
- Image checksums: for every product, each `images[].sha256` exists in the
  dedup index and the storage object HEAD returns 200 with a matching byte
  length. Zero dangling image URLs.
- Redirect coverage: every old product/category slug in `id_map` either
  equals its new slug or has an active `seo_redirects` row. Zero old paths
  without a resolution.
- Spot checks: a sampled set (top 25 by traffic + 25 random) is diffed
  field by field against the live REST payload and eyeballed in the UI.

Gate results are written to a run report; a failed gate blocks cutover.

### 5.4 Audit trail

Raw REST responses (section 1.3) and the run report are retained. Any
mapped row can be traced back to its source WP id via `id_map` and to its
raw JSON via `wp_id`. Nothing is transformed without the pre-image kept.

### 5.5 Historical orders and customers: archive only

Orders and customers are NOT imported into the live commerce tables.
Rationale: the new economics (platform / commission / cashback), the new
identity model (`docs/ARCHITECTURE-ACCOUNT-IDENTITY.md`), and the anti-spam
rule (no imported customer is opted-in) make legacy order rows unsafe to
project into live tables. Legacy orders and customers are preserved in a
cold archive (the mysqldump plus an optional read-only
`wp_import.orders_archive` table) for accounting and support lookups only.
They never feed the live schema.

### 5.6 Rollback

The migration is reversible at two levels:

1. Data rollback (pre-cutover, by batch): because every write is keyed by
   `id_map` and batched, a bad batch is reverted by deleting the batch's
   `target_id` rows (products, then their exclusive images from storage by
   `wp/<id>/` prefix) and clearing the batch from `id_map`. Re-run
   re-creates them with the same uuids.
2. Traffic rollback (post-cutover): cutover is a DNS switch
   (`docs/ARCHITECTURE-PRODUCTION-OPS.md`). If a severe issue is found
   after going live, revert DNS to the WordPress origin, then purge the
   CDN / edge cache and the `seo_redirects` edge map by batch so stale
   redirects do not point at the half-migrated new site. Storage objects
   are content-addressed and harmless to leave; they are garbage-collected
   later by prefix.

Because everything is content-addressed and id-mapped, rollback plus re-run
is always safe: no state diverges, no duplicate is created.

---

## 6. Config summary (values reviewed before the run)

| Config | Meaning |
| --- | --- |
| `coupon_category_slugs` | product_cat slugs that map `type = coupon` |
| `default_platform_percent` | per-category platform take rate |
| `default_commission_percent` | per-category supplier commission |
| `default_cashback_percent` | per-category cashback (default 0) |
| `default_coupon_expiry_days` | validity window when WP has no meta |
| `vendor_map.csv` | wp_vendor_id to supplier_id (optional) |
| `slug_overrides.csv` | wp_id to new latin slug (optional) |

All config is version-controlled with the run report so every derived
value (economics, type, supplier) is auditable after the fact.
