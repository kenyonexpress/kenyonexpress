# ARCHITECTURE-WP-MIGRATION.md

KenyonExpress WordPress / WooCommerce → Supabase data migration architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` · branch `arch/admin-supplier` (2026-07-28)
Scope: **docs only.** No application code in this change.
Companions: `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-ADMIN.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`.
Grounding (code exists on main line, not edited here): `scripts/wp-import/*`, migrations `032_wp_import_staging.sql`, `057_wp_migration_log.sql`. Older companion name: `docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (superseded on money conflicts by **this** file).

Live site today: `https://kenyonexpress.co.il` (WordPress + WooCommerce). Target: Next.js App Router + Supabase on the **same domain** with zero catalog loss and full SEO equity.

---

## 0. Business model (must drive every mapping)

| Rule | Implication for import |
|---|---|
| KenyonExpress is a **platform**, never a supplier | Synthetic legacy merchant row is a **supplier** entity for PDP disclosure, not "KenyonExpress as seller of record" in copy. Prefer remapping to real `suppliers` via `vendor_map.csv` before go-live of money |
| `platform_percent` dynamic, admin-only, **no fixed rate, no DB default** | **Do not invent** a category default percent. Imported products stay `draft` / needs-pricing until an admin sets `platform_percent` (+ coupon money fields) |
| Coupon | Customer pays absolute online `coupon_price_ils`; remainder at supplier on QR; expires on scan. Import must leave `coupon_price_ils` unset or draft until admin fills |
| Physical | Immediate split by snapshotted `platform_percent` at purchase. Import still blocks publish without percent |
| PDP | Every product page shows supplier details. Publish gate requires name/phone/address/logo on supplier |
| No Escrow | Do not migrate or invent escrow holds |

Guiding pipeline principles:

1. REST API first; mysqldump cold fallback only.
2. Idempotent stages; upsert by stable `wp_import.id_map`.
3. SEO load-bearing: every old product/category URL keeps its slug or gets a **301** in `seo_redirects`.
4. **Dry-run is the default.** Writes require `--apply` **and** `WP_IMPORT_ALLOW_WRITES=1`.
5. Apply schema only via Supabase MCP `apply_migration` (never `db push`).

---

## 1. Inventory of WP entities

| WP / Woo entity | Source | Import into public? | Notes |
|---|---|---|---|
| **Products** | `wc/v3/products` or `wp_posts` product | **Yes** → `public.products` | Primary catalog |
| **Product images** | `images[]` / attachments | **Yes** → R2 (or Storage) + `products.images` jsonb | Content-addressed |
| **Categories** | `wc/v3/products/categories` | **Yes** → `public.categories` | Tree preserved |
| **Coupons (Woo coupons)** | `wc/v3/coupons` | **No as catalog** | Storefront "coupons" are `products.type = coupon`, not Woo coupon codes. Archive Woo coupons if needed for support only |
| **Users / customers** | WP users / WC customers | **Archive only** | No silent auth migration. Customers re-register / OTP / Google. Map emails in staging for support |
| **Orders** | WC orders | **Archive only** | `wp_import.orders_archive` (or equivalent). New orders start on Cardcom stack |
| **Media library** | attachments / uploads | **Yes** as product/category media | Dedup by sha256 |
| **Vendors** (if Dokan/YITH) | meta / vendor plugin | Optional map → `public.suppliers` | Else synthetic legacy supplier |
| **Pages / posts** | WP pages | Out of scope unless marketing pages explicitly listed | |
| **Redirect plugins** | Yoast/RankMath | Merge into `seo_redirects` | |

Stages (from `scripts/wp-import`):

```
extract → transform → load → media → project → validate
```

Only `project` writes `public.*` (and only when both write locks are open).

---

## 2. Field mapping tables (WP → new schema)

### 2.1 Products → `public.products`

| Target column | WC REST | Dump source | Transform |
|---|---|---|---|
| `slug` | `slug` | `wp_posts.post_name` | keep; UNIQUE; collision → suffix + 301 |
| `name_he` | `name` | `post_title` | trim; entity decode |
| `description_he` | `description` / `short_description` | `post_content` | safe HTML subset |
| `price_ils` / face | price logic §2.2 | `_regular_price` / `_sale_price` | numeric; 2 dp |
| `full_price` / compare | when on sale | `_regular_price` | strike when sale &lt; regular |
| `type` | derived §2.4 | category / meta | `coupon` \| `physical` \| `service` |
| `status` | `status` | `post_status` | `publish` → **`draft` until money gate**; never auto-`active` without `platform_percent` |
| `images` | `images[]` | gallery ids | media pipeline §3 |
| `category_id` | `categories[0]` leaf | first `product_cat` | via category id_map |
| `supplier_id` | vendor map or legacy | meta / author | NOT NULL; synthetic or mapped |
| `seo_title` / `seo_description` | Yoast meta if present | postmeta | optional |
| `platform_percent` | **none** | **none** | **NULL; admin must set** (blocking) |
| `supplier_split_percent` | none | none | NULL until admin pair completes |
| `discount_percent` | derived from sale vs regular when possible | computed | else NULL until admin |
| `coupon_price_ils` | none (absolute online price) | none | **NULL for coupons until admin**; required to publish |
| `coupon_expiry_days` | meta if present | postmeta | else NULL; floor rules in product spec |
| `is_coupon_enabled` | derived | derived | true when `type = coupon` |

**Blocking gate (project / validate):**

- Any row projected `active` / published without `platform_percent` → **error**, force `draft`.
- Coupon without `coupon_price_ils` → **error**, force `draft`.
- Supplier missing phone/address/logo → cannot publish (admin gate); import may still stage as draft.

### 2.2 Price logic

```text
regular = number(regular_price)
sale    = number(sale_price)   # may be empty

if sale > 0 and sale < regular:
    selling = sale
    compare = regular
else:
    selling = regular
    compare = null

# variable: min variation as selling; flag manual review
# reject NaN → draft + validation error
```

For coupons, Woo "sale price" is **not** automatically `coupon_price_ils`. Absolute online coupon price is an admin money knob on the new stack.

### 2.3 Categories → `public.categories`

| Target | WC REST | Transform |
|---|---|---|
| `name_he` | `name` | trim |
| `slug` | `slug` | keep; UNIQUE |
| `parent_id` | `parent` | tree preserved; parents-first load |
| `icon_url` | `image.src` | media pipeline |
| `sort_order` | `menu_order` | int |
| `is_active` | derived | default true for published cats |
| `name_en` | none | seed from slug if NOT NULL required |

### 2.4 Type mapping

| WP signal | Target `type` |
|---|---|
| Coupon category set / meta `_is_coupon` / virtual+downloadable deal | `coupon` |
| Explicit service category | `service` |
| Else shippable | `physical` |

Coupon category slug set is config reviewed before run.

### 2.5 Users (archive)

| WP | Staging | Public |
|---|---|---|
| user email, id, display name | `wp_import.customers` (or users archive) | **no auto `auth.users`** |
| billing phones/addresses | archive jsonb | optional later attach after identity proof |

### 2.6 Orders (archive)

| WC order | Staging | Public |
|---|---|---|
| id, totals, line items, status, dates | `wp_import.orders_archive` | **no** `public.orders` import for money continuity |
| Line product ids | id_map to new product uuid when exists | support lookup only |

New paid orders always go through Cardcom + snapshot `platform_percent`. Historical WC money is not re-split.

### 2.7 HTML cleaning (`description_he`)

1. Strip block comments and shortcodes.
2. Allow-list: `p, br, ul, ol, li, strong, em, a, h2, h3`.
3. Rewrite `wp-content/uploads` URLs to R2 URLs when migrated.
4. Entity decode; collapse whitespace.

---

## 3. Media migration to R2

Preferred store: **Cloudflare R2** public HTTPS (matches SEO/image pipeline). Supabase Storage bucket `product-images` acceptable interim with same key layout.

### 3.1 Steps

```text
for each source image URL:
  1. download (throttle/backoff)
  2. sha256 → dedup index hit? reuse keys
  3. sharp: main max 1600px WebP q80; OG 1200×630 WebP; optional AVIF large
  4. keys: wp/<ab>/<content_hash>.webp (+ .og.webp / .avif)
  5. upload upsert to R2
  6. record url, og_url, alt_he, dimensions, sha256, position
```

### 3.2 `images` jsonb shape

```json
[
  {
    "url": "https://{r2}/wp/9f/9f8a….webp",
    "og_url": "https://{r2}/wp/9f/9f8a….og.webp",
    "alt": "…",
    "width": 1600,
    "height": 1200,
    "sha256": "9f8a…",
    "position": 0
  }
]
```

`position: 0` = listing + `og:image`. Deleting a product must not delete shared content-addressed objects.

---

## 4. URL redirect map (301, SEO preserving)

### 4.1 Path mapping (App Router today)

| Old WP path | New path |
|---|---|
| `/product/<slug>/` | `/product/<slug>` |
| `/product-category/<slug>/` | `/category/<slug>` |
| `/product-category/<parent>/<child>/` | `/category/<child>` (leaf) |
| `/shop/` | `/products` |
| `/?p=<id>` / `/?product=<slug>` | resolve → `/product/<slug>` |
| Woo coupon shop URLs | map to `/product/<slug>` when type=coupon |

Keep Woo slug when valid and unique. Collision → `-2`, `-3` + 301 from old path. Optional `slug_overrides.csv` always writes 301.

### 4.2 `seo_redirects`

```sql
create table if not exists public.seo_redirects (
  id           uuid primary key default gen_random_uuid(),
  source_path  text not null,
  target_path  text not null,
  status_code  smallint not null default 301
                 check (status_code in (301, 302, 308, 410)),
  entity_type  text check (entity_type in ('product','category','other')),
  wp_id        bigint,
  hits         bigint not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint seo_redirects_source_unique unique (source_path)
);
```

Normalization: lowercase, strip host, strip trailing slash; query-only sources stored separately. Edge `proxy.ts` / middleware: lookup before render; 301; do not cache as 200.

Staging already tracks decisions in `wp_import.url_inventory`. Project stage writes public `seo_redirects`.

Migration ordinal: next free ≥ 077 via MCP (**Q-WP-MIG**). Same table as SEO doc §9.

---

## 5. Dry-run and validation strategy

### 5.1 Write locks

```bash
# Terminal (repo root on implementation worktree):
node scripts/wp-import/run.mjs                          # dry run
WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs --apply
```

Dry run performs extract/transform/validate planning, including media fetch when configured, **without** mutating public tables.

### 5.2 Validation gates (block cutover on error)

| Gate | Rule |
|---|---|
| Count | staged products ≈ WC published count (± allowlist skips) |
| Slugs | every old product/category path → same slug **or** active `seo_redirects` row |
| Money | zero projected `active` rows with NULL `platform_percent` |
| Coupon money | zero projected active coupons with NULL `coupon_price_ils` |
| Supplier | every product has `supplier_id`; legacy supplier flagged for remap |
| Images | primary image present or explicit allowlist |
| HTML | no broken script tags in `description_he` |
| Id map | stable re-run produces same uuids |

Reports: `wp_import/reports/validation-<batch>.{json,md}` + `wp_import.validation_reports`. Severity `error` blocks cutover; `warn` is reviewable.

### 5.3 Admin post-import money pass

Before DNS cutover for commercial traffic:

1. Admin opens products needing pricing (`products_needs_pricing` index / dashboard count).
2. Sets `platform_percent` (+ pair), `discount_percent`, and for coupons `coupon_price_ils`.
3. Ensures supplier PDP fields complete.
4. Publishes. Revalidate SEO tags per SEO doc.

---

## 6. Rollback plan

### 6.1 Pre-cutover (data)

- Every public write keyed by `import_batch_id` / `id_map`.
- `wp_import.fn_rollback_batch(batch_id, p_dry_run => true|false)` plans then deletes/reverts projected rows for that batch (categories/products/redirects created by batch).
- Media objects are content-addressed: rollback does **not** require deleting R2 bytes (orphans OK; optional GC later).

### 6.2 Post-cutover (traffic)

1. Revert DNS to WordPress origin.
2. Purge CDN / edge cache and redirect map for the batch.
3. Keep Supabase data (do not drop) unless a full purge is explicitly ordered.
4. Communicate freeze window; no dual-write of new orders during rollback.

### 6.3 Partial failure

Re-run failed stage with `--resume` / `--entity`. Idempotent upserts prevent duplicates.

---

## 7. Cutover sequence (kenyonexpress.co.il DNS)

```text
T-7d   Freeze WP catalog edits (or accept delta re-extract)
T-5d   Full dry-run validate green; money admin pass on staging/prod catalog
T-3d   seo_redirects projected; proxy tested on preview host
T-1d   Final extract delta; project; validate; sitemap submitted to GSC (same property)
T-0    Maintenance window:
         1. Put WP in maintenance / read-only
         2. Final delta project + validate
         3. Point DNS A/AAAA / CNAME for kenyonexpress.co.il → Vercel
         4. Confirm TLS, 301 samples, home/PDP/category, Cardcom webhook URL
         5. Monitor GSC + error logs + redirect hits
T+1d   Spot-check top landing URLs from Search Console
T+7d   Decommission WP writes; keep WP read backup ≥ 30d
```

DNS notes:

- Prefer short TTL (300s) for 48h before switch.
- www vs apex: pick one canonical (**Q-SEO-HOST**); 301 the other.
- Cardcom callback / webhook hosts must match the live Next origin before switch.
- Supabase Auth redirect URLs updated to production host.

---

## 8. Migrations (077+, MCP only)

| Object | Status / action |
|---|---|
| `032_wp_import_staging` | Applied (staging schema) |
| `057_wp_migration_log` | Applied (logs / validation / rollback helpers) |
| `seo_redirects` public | **Required** before cutover; next free ≥ 077 via MCP |
| Money columns on products | Already present; **no default** for `platform_percent` |

Never `supabase db push`.

---

## 9. Acceptance checklist

- [ ] Dry-run default; dual write locks documented and enforced
- [ ] Mapping tables match live `public.products` / `categories`
- [ ] No invented `platform_percent`; drafts until admin sets
- [ ] Coupons cannot publish without `coupon_price_ils`
- [ ] Media on R2 with dedup; OG derivative present for position 0
- [ ] Every old URL → same path or 301; zero intentional 404s for indexed catalog
- [ ] Users/orders archived only; no blind auth/order money import
- [ ] Rollback batch function dry-run tested
- [ ] DNS cutover runbook rehearsed on preview
- [ ] Post-import admin money queue cleared before commercial go-live

---

## 10. Open questions

| ID | Question |
|---|---|
| Q-WP-MIG | Exact ordinal for `seo_redirects` on hosted |
| Q-WP-VENDOR | Force remap off legacy supplier before go-live? |
| Q-WP-ORDERS | Retention months for `orders_archive` |
| Q-WP-DELTA | Accept catalog edits during freeze or hard freeze only? |
| Q-SEO-HOST | www vs apex |

---

## 11. Related

| Path | Role |
|---|---|
| `scripts/wp-import/*` | pipeline |
| `supabase/migrations/032_wp_import_staging.sql` | staging |
| `supabase/migrations/057_wp_migration_log.sql` | logs / rollback |
| `docs/ARCHITECTURE-SEO-PERFORMANCE.md` | meta, sitemap, CWV, redirects consumer |
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | money publish gate |
| `docs/ARCHITECTURE-ADMIN.md` | admin money editor after import |
