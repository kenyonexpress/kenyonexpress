# ADMIN-ARCHITECTURE.md

KenyonExpress production admin dashboard architecture.

Status: BINDING for `feat/admin-core` (2026-08-02)
Stack: Next.js App Router (`src/app/(admin)`), Supabase Postgres + RLS, Cardcom, Server Actions + Route Handlers
Money: agorot integers internally; ILS with 2 decimals on the wire (`*_ils`)
Branch:

```
feat/admin-core
```

This document decides. Where it conflicts with older drafts that mention a fixed
10% or 5% commission, a coupon `platform_percent` pinned at 100, or external
escrow, the rules in section 0 win.

Origin: this file supersedes `ADMIN-ARCHITECTURE.md` on branch `arch/admin-supplier`
(commit `0710180`). That draft is kept only as history. Two of its rules are
revoked here, in section 0.1.

---

## 0. Final business rules (admin must enforce)

### 0.1 There is no fixed commission. Every knob is per product.

Four values are set by the admin on the product page, per product, for every
product type. None of them has a default, in the database or in the code.

| Field | Meaning | Range |
|---|---|---|
| `platform_percent` | The platform's share of what the customer pays on site | 0 to 100 |
| `supplier_split_percent` | The supplier's share of the same base | 0 to 100 |
| `discount_percent` | Saving off the sticker price, shown to the customer | 0 to 100 |
| `coupon_price_ils` | Absolute shekel amount the customer pays on this site for a coupon | > 0 and <= `price_ils` |

`platform_percent + supplier_split_percent = 100`. The pair is stored, not
derived, because both halves are snapshotted onto the order line and a
settlement report has to be able to state the supplier's agreed share without
recomputing it from the platform's. A CHECK constraint enforces the sum, so the
two can never disagree.

Two rules from the `arch/admin-supplier` draft are revoked:

1. Revoked: "Coupon platform take: 100% of the online coupon charge stays with
   the platform. Supplier gets 0." The coupon prepayment now splits by the
   product's own pair, exactly like a physical line. A coupon where the platform
   keeps everything is still expressible, as `platform_percent = 100`, but it is
   now one admin choice among many rather than a hardcoded constant.
2. Revoked: "`platform_percent` must be stored as 100 for coupons. UI hides the
   percent splitter; DB CHECK enforces." Both percents are editable on every
   product page, coupon and physical alike.

Why this is not a regression against `docs/CONTRADICTIONS.md` C1 and C2: C1
forbids *invented defaults*, and that still holds, nothing here falls back to a
constant. C2 asked for one split knob; there are now two, but they are one
degree of freedom held to a sum by the database, which is what C2 was protecting
against.

### 0.2 Measured state of the live database (2026-07-27)

Reason the model above matches reality better than the draft did:

| Fact | Count |
|---|---|
| `products` rows | 61 |
| rows with `supplier_split_percent` set | 61 |
| rows with `platform_percent` set | 0 |
| rows with `coupon_price_ils` set | 16 |
| distinct `supplier_split_percent` values | 70, 75, 85 |
| `suppliers` rows | 11 |
| `suppliers` rows missing address or logo | 11 |
| `vendors` rows (legacy) | 6 |
| `products` pointing at `suppliers` | 61 of 61 |

The live catalog has always been driven by a per-product supplier split. Migration
`050_platform_percent_required.sql` could never have run against it: its guard
raises when any live product has a NULL `platform_percent`, and all 61 do.
Migration `070` backfills `platform_percent = 100 - supplier_split_percent`,
which derives from a value the admin already chose rather than inventing one.

### 0.3 Money flow by type

| Rule | Detail |
|---|---|
| Coupon online charge | Absolute `products.coupon_price_ils`. Not a percent. No default. |
| Coupon at business | Customer pays `price_ils - coupon_price_ils` at redemption, in cash, and it never passes through us. |
| Coupon split | `coupon_price_ils` splits by the product's own pair. Platform keeps `platform_percent` of it; the rest is the supplier's. |
| Physical online charge | `price_ils` reduced by `discount_percent`. |
| Physical split | Same pair, applied to the full on-site charge. |
| Rounding | The platform fee is rounded once, on the line total. The supplier's share is the residual, `base - platform_fee`, so no agorot is created or lost. `supplier_split_percent` is the snapshot of the agreement, never the arithmetic. |
| Escrow | None. Held is an internal ledger flag only. |
| Supplier identity | Name, phone, address and logo are required to publish, coupon and physical alike. |

### 0.4 Snapshot, not reference

At purchase every one of these is copied onto `order_items` as a value:

`platform_percent`, `supplier_split_percent`, `discount_percent`,
`coupon_price_ils`, and the supplier's `name`, `phone`, `address`, `logo_url`.

Editing a product or a supplier afterwards must not move a single past row. The
admin product page therefore states plainly that changes apply to future orders
only.

---

## 1. Roles and section matrix

Postgres enum `user_role`: `customer`, `content_uploader`, `vendor`, `support`, `admin`, `super_admin`.

Admin UI gate: `requireAdminSession` / `requireSection` in `src/lib/admin/rbac.ts`.
JWT role is a coarse gate only. Money writes never go through client RLS; they
use the service-role client after the gate, or `SECURITY DEFINER` RPCs.

| Section | Route prefix | content_uploader | support | admin | super_admin |
|---|---|---|---|---|---|
| Dashboard / queues | `/admin/dashboard` | no | read | full | full |
| Products | `/admin/products` | draft catalog | read | full | full |
| Categories | `/admin/categories` | no | read | full | full |
| Suppliers | `/admin/suppliers` | no | read | full | full |
| Vendors (legacy) | `/admin/vendors` | no | read | full | full |
| Approvals | `/admin/approvals` | no | read | approve/reject | full |
| Coupons / codes | `/admin/coupons` | no | read | full | full |
| Orders | `/admin/orders` | no | read | full | full |
| Payments / stuck | `/admin/payments` | no | read | full | full |
| Users / roles | `/admin/users` | no | read | role changes except elevating to super_admin | full |
| Affiliates | `/admin/affiliates` | no | read | full | full |
| Analytics | `/admin/analytics` | no | read (no PII export) | full | full |
| Audit log | `/admin/audit-log` | no | read | read | read |

Sensitive mutations require re-auth within 15 minutes: role elevation, wallet
adjust, mark payout paid, force refund.

---

## 2. Two supplier tables, and which one is real

`public.suppliers` and `public.vendors` both exist and both have an admin screen.
They are not the same thing and must not be conflated.

| | `suppliers` | `vendors` |
|---|---|---|
| Rows | 11 | 6 |
| Referenced by | `products`, `order_items`, `coupon_codes`, `escrow_holds`, `split_executions` | `coupons`, `coupon_deals` |
| On the purchase path | yes | no |
| Carries the identity shown on a product page | yes | no |
| Carries bank details for payout | no | yes |

Consequence, and the reason this section exists: before `feat/admin-core`,
`/admin/suppliers` edited `vendors`, so nothing an admin typed there could ever
reach a product page or an order line. The section now edits `suppliers`. The
legacy vendor screens moved to `/admin/vendors` unchanged.

Merging the two tables is a data migration with real risk and is deliberately
out of scope here. It is tracked in `docs/CONTRADICTIONS.md`.

### 2.1 Supplier identity fields (`public.suppliers`)

| Column | Required to publish a product | Shown to customer |
|---|---|---|
| `name` | yes | yes |
| `contact_phone` | yes | yes, opens WhatsApp |
| `address` | yes | yes, opens Waze |
| `logo_url` | yes | yes |
| `city` | no | yes, on the deal image |
| `contact_email` | no | no |
| `business_id` | no | in the legal disclosure |
| `status` | must be `active` | no |

All 11 live suppliers are missing `address` and `logo_url`, and 6 are missing
`contact_phone`. The gate is therefore enforced in the application on publish,
not as a NOT NULL constraint: adding NOT NULL would fail the migration or
silently unpublish the catalog. The admin sees exactly which fields are missing,
on the product page, and can fill them there.

---

## 3. Product management

### 3.0 Dynamic money fields (UI contract)

The product edit form (`src/components/admin/ProductForm.tsx`) is the only place
an admin sets commission. There is no global default and no vendor-level override
that wins at purchase time.

| UI label (Hebrew) | Column | Behavior |
|---|---|---|
| עמלת פלטפורמה (%) | `platform_percent` | Required. Editing it auto-fills `supplier_split_percent = 100 - value`. |
| אחוז לספק (%) | `supplier_split_percent` | Required pair half. Editing it auto-fills the platform side. |
| אחוז הנחה (%) | `discount_percent` | Physical: reduces on-site charge. Coupon: derived badge only. |
| מחיר הקופון באתר (₪) | `coupon_price_ils` | Coupon only. Absolute. Required to publish. |
| תוקף השובר (ימים) | `coupon_expiry_days` | Coupon only. From purchase day. |

Server path:

```
FormData
  → src/server/actions/admin/products.ts (Zod)
  → buildProductMoneyWrite / assertPublishable (src/lib/commerce/product-money.ts)
  → products row update
```

Live preview on the form uses the same pure functions as checkout
(`completeSplitPair`, coupon-offer helpers), so the admin never sees a split
that the money engine will refuse.

Products list (`/admin/products`) shows `platform_percent` and, for coupons, the
on-site `coupon_price_ils` in the price column, so incomplete money is visible
without opening each row.

### 3.1 Shared fields (both types)

- Identity: `name_he`, `name_en`, `slug`, `short_description_he`, `description_he`, gallery
- Taxonomy: `category_id`, `brand`, geo through the supplier
- Supplier: `supplier_id`, required to publish
- Pricing: `price_ils` (sticker), the four knobs from section 0.1
- Publish: `status` (`draft` / `active` / `paused` / `archived`), `offer_valid_until`
- Legal disclosure: cancellation terms, business identity, expiry rules
- SEO: title, meta description, keywords

### 3.2 Coupon-only fields

| Field | Rule |
|---|---|
| `type = 'coupon'` | Discriminator |
| `coupon_price_ils` | Absolute online charge, `0 < coupon_price_ils <= price_ils`. Required to publish. |
| `coupon_expiry_days` | Voucher validity in days from purchase. |
| `coupon_terms_he`, `redemption_instructions_he` | Shown on the product page and on the voucher |
| `min_purchase_ils` | Minimum spend at the business |

`discount_percent` on a coupon is the badge only. The billed number is always
`coupon_price_ils`. The form keeps the two consistent by computing the badge from
the prices, so the page can never quote a saving the checkout does not honour.
This is the failure `src/lib/commerce/coupon-offer.ts` was written to stop.

### 3.3 Physical-only fields

| Field | Rule |
|---|---|
| `type = 'physical'` | Discriminator |
| `discount_percent` | Reduces the charge: on-site charge is `price_ils * (1 - discount_percent / 100)`, rounded to agorot. |
| Stock / variants | Inventory rows; out of stock blocks add to cart |
| Shipping | `weight_grams`, dimensions, `requires_shipping` |

### 3.4 Publish gate

A product may sit in `draft` half finished. Moving it to `active` requires all of:

1. `supplier_id` set, and that supplier `active`
2. supplier `name`, `contact_phone`, `address`, `logo_url` all non-empty
3. `platform_percent` and `supplier_split_percent` both set and summing to 100
4. `discount_percent` set and in range
5. coupon only: `coupon_price_ils` set, positive, and at most `price_ils`
6. coupon only: `coupon_expiry_days` set and positive

The gate lives in one pure function, `assertPublishable` in
`src/lib/commerce/product-money.ts`, called by the server action and covered by
tests. The form surfaces every failing reason at once, in Hebrew, rather than the
first one.

---

## 4. Admin screens (route inventory)

| Route | Purpose | Money-sensitive |
|---|---|---|
| `/admin` / `/admin/dashboard` | Queues, KPIs, stuck payments | yes |
| `/admin/products` | Catalog table + filters; shows `platform_percent` | yes |
| `/admin/products/new`, `/admin/products/[id]/edit` | Dynamic money fields (§3.0) | yes |
| `/admin/categories` | Taxonomy | no |
| `/admin/suppliers` | Canonical supplier CRUD (not legacy vendors) | publish gate |
| `/admin/vendors` | Legacy bridge only | read / migrate |
| `/admin/orders` | Orders, notes, refunds | yes |
| `/admin/payments` | Reconciliation (charged without closed order) | yes |
| `/admin/coupons` | Codes / vouchers read path | yes |
| `/admin/approvals` | Content approval | no |
| `/admin/users` | Staff roles | yes (RBAC) |
| `/admin/analytics` | Sales views | yes (read) |
| `/admin/affiliates` | Affiliate ops | no |
| `/admin/audit-log` | Append-only audit | yes (read) |

### 4.1 Orders, payments, vouchers (detail)

| Screen | Source of truth | Admin actions |
|---|---|---|
| Orders list / detail | `orders`, `order_items` | filter, note, force cancel pre-fulfillment, initiate refund |
| Payments / stuck | `payments`, webhook events | reconcile, retry finalize (idempotent) |
| Voucher codes | `coupon_codes` / `vouchers` | read-only status, expiry sweep status |

Order detail shows the snapshotted knobs from `order_items`, never a live join
back to `products`. A line bought at 70/30 keeps reading 70/30 after the product
moves to 85/15.

Refund rule: if any voucher on the order is redeemed or expired, card refund of
that value is blocked, and the UI names the blocker.

---

## 5. UI / UX constraints

- Hebrew RTL admin shell, `dir="rtl"`, Heebo
- Logical Tailwind properties only (`ps`/`pe`, `ms`/`me`, `text-start`/`text-end`)
- `dir="ltr"` only on numbers, slugs, SKUs, URLs
- Server-rendered tables with keyset pagination, limit 1 to 50
- Design tokens, no raw hex
- Touch targets at least 44px on mobile
- Empty states and errors in Hebrew
- Money always `₪` with 2 decimals, `he-IL` locale, never agorot in the UI

---

## 6. Transport

1. Browser mutations: Server Actions under `src/server/actions/admin/**`
2. Machine traffic (cron, webhooks): Route Handlers under `src/app/api/**`
3. List pages: RSC direct queries after `requireSection`

Do not add a general `/api/admin/*` CRUD surface.

Error codes: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`,
`CONFLICT`, `STATE_INVALID`, `EXPIRED`, `RATE_LIMITED`, `IDEMPOTENT_REPLAY`,
`INTERNAL`.

---

## 7. Security

1. Enable and force RLS on every public table.
2. Admin money writes: no permissive INSERT/UPDATE/DELETE for `authenticated`.
   Service role after the gate.
3. Staff reads of money tables: service role in RSC, or narrow SELECT policies on
   `public.is_admin()` / `public.has_role('support')`.
4. Users cannot UPDATE their own `profiles.role` or `profiles.supplier_id`.
5. `audit_log` is INSERT only, through a `SECURITY DEFINER` path. No client
   UPDATE or DELETE.
6. Session reads use `supabase.auth.getUser()`, never `getSession()` alone.

The exact policy SQL is unchanged from the `arch/admin-supplier` draft and lives
in migrations `053` and `064`.

---

## 8. Implementation map

| Area | Code home |
|---|---|
| Money core, publish gate, snapshot builder | `src/lib/commerce/product-money.ts` |
| Coupon display derivation | `src/lib/commerce/coupon-offer.ts` |
| Purchase-time settlement | `src/server/domain/orders/settlement.ts` |
| Purchase snapshot write | `src/server/actions/payments/checkout.ts` |
| Admin pages | `src/app/(admin)/admin/**` |
| RBAC | `src/lib/admin/rbac.ts`, `src/lib/admin/permissions.ts` |
| Admin actions | `src/server/actions/admin/**` |
| Migration | `supabase/migrations/070_product_dynamic_split.sql` |

---

## 9. Acceptance checklist

- [x] Both percents are per product, editable on every product page, no default anywhere
- [x] `platform_percent + supplier_split_percent = 100` enforced by CHECK
- [x] Coupon prepayment splits by the product's own pair, not by a constant
- [x] `discount_percent` per product, reducing the charge on physical and badging on coupon
- [x] `coupon_price_ils` absolute, per product, required to publish a coupon
- [x] Supplier name, phone, address and logo required to publish, both types
- [x] All eight values snapshotted onto `order_items` at purchase
- [x] Editing a product or supplier does not move a past order line
- [x] `/admin/suppliers` edits the table `products` actually reference
- [x] Full CRUD: products, categories, suppliers, orders, coupons
- [x] Publish gate reports every failing reason at once, in Hebrew
- [x] Products list shows `platform_percent` (and coupon on-site price when type=coupon)

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-07-27 | Binding admin architecture: per-product split pair, publish gate, snapshot rules |
| 2026-08-02 | §3.0 UI contract for dynamic money fields; §4 screen inventory; products list shows commission |
