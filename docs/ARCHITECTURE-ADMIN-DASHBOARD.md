# ARCHITECTURE-ADMIN-DASHBOARD.md

KenyonExpress admin dashboard architecture (platform control center).

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only (docs). No application code in this change.
Companions: `ADMIN-ARCHITECTURE.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`
Supersedes (for admin money UX): coupon-forced `platform_percent = 100` UI hide in older `ADMIN-ARCHITECTURE.md` §2.2 when it conflicts with launch coupon rule below. Launch rule: coupon online charge stays with the platform; physical uses snapshotted `platform_percent`.

Stack: Next.js App Router `src/app/(admin)`, Server Actions `src/server/actions/admin/**`, Supabase Postgres + RLS, Cardcom, service-role after RBAC gate.
Money: **integer agorot** internally. UI shows ₪ with 2 decimals. Never mix units in one column.
Catalog scope (launch): **coupons only** in production merchandising. Physical type remains in schema and admin UI for readiness.

---

## 0. Fixed platform model (admin must enforce)

1. KenyonExpress is a **platform, never a supplier**. No `suppliers` row for the platform; no redeem as merchant.
2. `products.platform_percent` is **dynamic per product**, set only by admin on the product page. No fixed rate. No DB default. Copied onto `order_items` at purchase.
3. **No Escrow.** `order_items.escrow_held_agorot` stays 0 under this model.
4. **Coupon:** customer pays absolute `coupon_price_ils` online; that money stays with the platform. Balance `price_ils - coupon_price_ils` paid at merchant on QR scan. Voucher expires on scan (`vouchers.status = redeemed`).
5. **Physical:** immediate split by snapshotted `platform_percent`; supplier notified and ships; payout after T+3 + min threshold (see supplier portal doc).
6. Every PDP shows supplier identity (name, phone, address, logo). Publish gate in `assertPublishable` (`src/lib/commerce/product-money.ts`).

---

## 1. Existing surface (grounded)

### 1.1 Routes live today (`src/app/(admin)/`)

| Route | File | Purpose today |
|---|---|---|
| `/admin` | `admin/page.tsx` | Panel entry |
| `/admin/dashboard` | `admin/dashboard/page.tsx` | Ops home |
| `/admin/products` | `admin/products/page.tsx` | Catalog list |
| `/admin/products/new` | `admin/products/new/page.tsx` | Create |
| `/admin/products/[id]/edit` | `admin/products/[id]/edit/page.tsx` | Edit |
| `/admin/categories` (+ new/id) | `admin/categories/**` | Taxonomy |
| `/admin/approvals` | `admin/approvals/page.tsx` | Review queue |
| `/admin/coupons` (+ new/id/codes) | `admin/coupons/**` | Legacy `coupon_deals` UI |
| `/admin/orders` (+ `[id]`) | `admin/orders/**` | Orders |
| `/admin/payments` | `admin/payments/page.tsx` | Payments / stuck |
| `/admin/suppliers` (+ new/id) | `admin/suppliers/**` | Still largely **vendors** legacy |
| `/admin/users` (+ `[id]`) | `admin/users/**` | Roles |
| `/admin/affiliates` | `admin/affiliates/**` | Affiliates |
| `/admin/analytics` | `admin/analytics/page.tsx` | Analytics |
| `/admin/audit-log` | `admin/audit-log/page.tsx` | Reads `audit_log` |
| `/admin/payouts` | `admin/payouts/**` | Generate / approve / mark paid |

### 1.2 Server actions live today

`products`, `categories`, `approvals`, `coupon-deals`, `orders`, `users`, `vendors`, `affiliates`, `payouts`, `images`, `upload`.

### 1.3 RBAC code truth

| Helper | File | Who |
|---|---|---|
| `requirePanelSession` | `src/lib/admin/rbac.ts` | staff + support |
| `requireStaffSession` | same | admin, super_admin, content_uploader (catalog writes) |
| `requireAdminSession` / `requireAdminPage` | same | admin, super_admin |
| `requireSection(section, read\|write)` | same | matrix in `src/lib/admin/permissions.ts` |

`user_role` enum (003 + 053): `customer | content_uploader | vendor | support | admin | super_admin`.

**Gap:** `AdminSection` today is `dashboard|catalog|orders|users|payments|affiliates|analytics|audit-log|suppliers`. Missing explicit `payouts` and `coupons`/`vouchers` sections in the TypeScript matrix (payouts UI exists; coupons folded into catalog mentally). Binding design adds them (section 10).

---

## 2. Product management

### 2.1 Full product editor fields

Canonical table: `public.products` (005 + 048 content + 052 approval + 054 coupon price + 070 split). Discriminator: `type` ∈ `{coupon, physical}` (and/or `is_coupon_enabled` legacy; binding UI uses `type`).

#### Shared (both types)

| Field | Column | Notes |
|---|---|---|
| Name HE | `name_he` | required |
| Name EN | `name_en` | optional |
| Slug | `slug` | unique; `[a-z0-9-]+` |
| Short description | `short_description_he` | max 300 |
| Description | `description_he` | rich text |
| Gallery | `images` (jsonb/array) | upload via `actions/admin/images` + `upload` |
| Category | `category_id` | FK categories |
| Tags / badges | content fields / flags (`is_featured`, condition badges) | |
| Supplier | `supplier_id` | required to publish; FK `suppliers` |
| Face / sticker | `price_ils` (or legacy `kenyon_price` / `full_price` until fully renamed) | positive |
| Status | `status` | `draft \| active \| paused \| archived` (live set) |
| Approval | `approval_status`, `submitted_at`, `approved_by`, `approved_at`, `approval_note` | 052 |
| Offer end | `offer_valid_until` | 054 |
| SEO | `seo_title`, `seo_description`, `seo_keywords` | |
| Brand, highlights, video, barcode | 048 columns | |
| Legal / redemption copy | `coupon_terms_he`, `redemption_instructions_he` | coupon-heavy |

#### Admin-only money knobs (never supplier-writable)

| Field | Column | Rule |
|---|---|---|
| Platform take % | `platform_percent` | 0..100, no default; required to publish |
| Supplier share % | `supplier_split_percent` | pair sums to 100 (`products_split_pair_sums_to_100`) |
| Discount % | `discount_percent` | 0..100; coupon badge derived from prices |
| Coupon online price | `coupon_price_ils` | coupon only; `0 < x <= price_ils` |
| Cashback bp | `cashback_bp` (059; was `cashback_percent`) | optional merchandising; wallet internal only |

See `docs/ADMIN-PRODUCT-PAGE-SPEC.md` for normalize/publish/snapshot rules and `src/lib/commerce/product-money.ts`.

#### Coupon-only

| Field | Column | Rule |
|---|---|---|
| Online charge | `coupon_price_ils` | absolute; no default |
| Expiry days | `coupon_expiry_days` (or equivalent) | positive int |
| Min purchase | `min_purchase_ils` | optional |

Launch economics: platform keeps 100% of online coupon charge (supplier due from platform = 0). Admin may still store `platform_percent = 100` for audit consistency with snapshots.

#### Physical-only

| Field | Column | Rule |
|---|---|---|
| Stock | `stock_quantity`, variants in `product_variants` | |
| Low stock / max per order | `low_stock_threshold`, `max_per_order` | |
| Shipping | `requires_shipping`, `weight_grams`, `length_cm`, `width_cm`, `height_cm` | |
| Warranty / condition | `warranty_months`, `condition` | |

### 2.2 Field-level permissions after approval

| Field group | content_uploader | admin / super_admin | supplier (portal) |
|---|---|---|---|
| Content / gallery / SEO | yes (may re-queue review) | yes | limited content only |
| Stock / variants / shipping | yes | yes | manager+ |
| `supplier_id` | no after live (admin only) | yes | never reassign |
| Money knobs (`platform_percent`, `supplier_split_percent`, `discount_percent`, `coupon_price_ils`, face) | **no** | **yes only** | **never** |
| Publish / pause / archive | submit only | yes | submit only |

Enforcement: Server Action allow-list + service role; optional DB trigger reject on money columns when JWT is not service/admin. Audit every money change (`audit_log.action = 'updated'`, `entity_type = 'product'`, `changes` jsonb before/after).

### 2.3 Bulk ops, import, WordPress migration

| Capability | Design | Schema ground |
|---|---|---|
| Bulk status pause/archive | Admin action on selected ids | `products.status` |
| Bulk category assign | Admin action | `category_id` |
| CSV import (drafts) | Staging table then upsert | needs migration: `product_import_batches` (open: exact columns) |
| WP migration | `wp_migration_log` (057) | map WP product → `products` + images + redirects |

**Open question:** Is WP import one-shot historical or continuous sync? Do not invent; freeze redirects in `wp_redirects` / Next middleware map before cutting DNS.

### 2.4 Category and taxonomy

Routes: `/admin/categories`. Actions: `src/server/actions/admin/categories.ts`. Table: `categories` (slug, name_he, parent, sort, image). Binding: tree with single parent; soft-delete; products cannot publish without `category_id` when category is required by merchandising (open: is category mandatory on coupons today?).

---

## 3. Order and payment operations

### 3.1 Order list and filters

Source: `orders`, `order_items`. Filters: status, date range, supplier_id (via items), product type, payment stuck, has redeemed voucher.

`order_status` (007): `pending | paid | partially_fulfilled | fulfilled | cancelled | refunded`.

`order_item_status` (007): `pending | issued | shipped | delivered | cancelled | refunded`.

### 3.2 Order state machine

```
pending --payment capture--> paid
paid --> partially_fulfilled --> fulfilled
paid|partially_fulfilled|fulfilled --> refunded (policy gated)
any pre-fulfillment --> cancelled (force-cancel admin)
```

Transitions via Server Action (`actions/admin/orders.ts`) with service role / definer. Each writes `audit_log` (`status_change`).

### 3.3 Payment reconciliation (Cardcom)

| Screen | Tables | Actions |
|---|---|---|
| Payments / stuck | `payments`, webhook/event store if present | reconcile, retry finalize (idempotent) |
| Order detail | `orders.cardcom_*` / payment FKs | show capture status |

Refunds: if any linked `vouchers.status IN ('redeemed','expired')`, block card refund of that face/prepaid slice; UI must show blocker (ADMIN-ARCHITECTURE §3). Partial captures: **open question** (Cardcom LowProfile capabilities vs full capture only).

### 3.4 Split ledger view (per order, agorot)

For each `order_items` row show immutable snapshots:

| Column | Meaning |
|---|---|
| `paid_on_site_agorot` | What customer paid online for the line |
| `commission_agorot` | Platform take |
| `supplier_payout_agorot` / `supplier_immediate_agorot` | Residual to supplier (0 on coupon launch model) |
| `balance_due_agorot` | Till amount (coupon) |
| `platform_percent`, `supplier_split_percent`, `discount_percent`, `coupon_price_ils` | Snapshots |
| `escrow_held_agorot` | Always 0 |

Never recompute from live `products.platform_percent`.

---

## 4. Supplier operations

Compose with `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`.

| Admin screen | Source | Actions |
|---|---|---|
| Directory | `suppliers` (not legacy `vendors` long-term) | view, suspend, edit verification fields |
| Applications queue | `supplier_applications` (027 remainder; often unapplied) | approve / reject |
| Bank verify | `supplier_bank_accounts` | set `verified_by` / `verified_at` |
| Payouts | `payout_statements` / lines | generate, approve, mark paid (`super_admin` + recent auth) |

Payout status: `draft → pending_approval → approved → paid` (or `cancelled`). Physical lines only (081). T+3 via `payout_hold_business_days`; min via `min_payout_ils`.

**Gap today:** `/admin/suppliers` still talks to `vendors` in places (`actions/admin/vendors.ts`). Migration path: cut over UI to `suppliers` + `supplier_members` (072 live).

---

## 5. Coupon / voucher operations

| Concern | Source of truth | Admin UI |
|---|---|---|
| Catalog coupon products | `products` where `type = 'coupon'` | `/admin/products` |
| Legacy deals | `coupon_deals` | `/admin/coupons` (deprecate toward products) |
| Issued codes | `vouchers` | new `/admin/vouchers` (gap: not a first-class route yet) |
| Scan audit | `voucher_redemptions` | filter by outcome, supplier, IP (085) |

Lifecycle: `issued → redeemed|expired|cancelled|refunded`. Single-use: conditional UPDATE in `redeem_voucher` + unique success index on redemptions.

Fraud signals (dashboard widgets):

- Burst `rate_limited` / `wrong_supplier` collapsed as `not_found`
- Same IP many failures (`voucher_redemptions.ip_address`)
- Redeem after refund attempt

**Open question:** Should admin be able to manually expire a voucher, or only the sweep RPC?

---

## 6. Finance and reporting

### 6.1 Revenue dashboards

Ground: migration **056** analytics views + `src/app/(admin)/admin/analytics`. Metrics (agorot):

- Platform take by day/week/month = sum `order_items.commission_agorot` for paid orders
- Per product / per supplier breakdown from snapshots
- Coupon prepaid revenue vs physical residual owed

Support role: dashboard without money (`canSeeMoney` in permissions.ts).

### 6.2 Digital wallet oversight

Tables: `wallet_accounts`, `wallet_entries`, views `v_wallet_ledger` (055/046 lineage; 059 agorot renames; repairs in later migrations per STATE). Reasons include `order_cashback`, `order_spend`.

Rules: cashback is **internal only**; never withdraws to bank/card. Admin adjust requires `requireRecentAuth` + audit.

**Open question:** Is manual wallet credit allowed in production, or only automated cashback paths?

### 6.3 Export / accounting

CSV export of statements and order ledger for date range (admin+). No third-party accounting sync in v1. **Open question:** Priority Soft / Hashavshevet / CSV-only?

---

## 7. Platform administration

### 7.1 Users and roles

`/admin/users`: list profiles, assign roles via `actions/admin/users.ts` + `assignableRoles`. DB trigger (035 lineage) blocks illegal elevation. `super_admin` only may assign `admin` / `super_admin`.

### 7.2 Audit log

Canonical: `public.audit_log` (011; 025 dropped `admin_audit_log`).

| Column | Type |
|---|---|
| `id` | uuid PK |
| `actor_id` | uuid → auth.users |
| `actor_role` | text |
| `action` | `audit_action` enum: created, updated, deleted, restored, login, logout, permission_change, status_change, manual_override |
| `entity_type` | text |
| `entity_id` | uuid |
| `changes` / `metadata` | jsonb |
| `ip_address` / `user_agent` | inet / text |
| `created_at` | timestamptz |

Indexes: actor, entity, action, created_at. Writes: SECURITY DEFINER only. RLS: admin SELECT; no client INSERT/UPDATE/DELETE.

### 7.3 Feature flags and settings

**Gap:** no first-class `feature_flags` table in applied core. Binding design:

```sql
-- MIGRATION NEEDED (proposed name: 09x_feature_flags.sql)
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Until then: env-based flags only. **Open question:** which flags must be runtime-toggleable without deploy?

---

## 8. Admin-specific / related data model (summary)

| Table | Role | Migration ground |
|---|---|---|
| `profiles.role` | coarse RBAC | 003 |
| `audit_log` | append-only admin trail | 011/025 |
| `products` + money cols | catalog | 005/048/052/054/070 |
| `categories` | taxonomy | catalog migrations |
| `orders` / `order_items` | commerce + snapshots | 007/042/046/059/070 |
| `payments` | Cardcom | checkout migrations |
| `vouchers` / `voucher_redemptions` | coupon ops | 073/074/085 |
| `suppliers` / `supplier_members` | directory | 005/072 (+027 remainder) |
| `supplier_applications` / bank / payouts | onboarding + finance | 027/051/081/083 (often draft) |
| `wallet_accounts` / `wallet_entries` | internal cashback | 046/055/059+ |
| `wp_migration_log` | WP import | 057 |
| `feature_flags` | settings | **needed** |

---

## 9. API surface (admin)

Envelope:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
```

| Method | Path / Action | Auth | Payload (shape) |
|---|---|---|---|
| RSC | `/admin/**` | `requireSection` | — |
| Action | `upsertProduct` | staff; money fields admin-only | FormData / zod schema in `products.ts` |
| Action | `submitProductForReview` / approve / reject | matrix | `{ product_id, note? }` |
| Action | `upsertCategory` | staff catalog | category fields |
| Action | `updateOrderStatus` | admin+ | `{ order_id, status }` |
| Action | `initiateRefund` | admin+ + recent auth | `{ order_id, amount_agorot?, reason }` |
| Action | `reconcilePayment` | admin+ | `{ payment_id }` |
| Action | `approveSupplierApplication` | admin+ | `{ application_id }` |
| Action | `rejectSupplierApplication` | admin+ | `{ application_id, reason }` |
| Action | `generatePayoutStatement` | admin+ | `{ supplier_id, period_start, period_end }` |
| Action | `approvePayoutStatement` | admin+ | `{ statement_id }` |
| Action | `markPayoutPaid` | super_admin + recent auth | `{ statement_id, payment_reference }` |
| Action | `assignUserRole` | admin+ (bounded) | `{ user_id, role }` |
| Action | `adjustWallet` | super_admin + recent auth | `{ user_id, amount_agorot, reason }` |
| Cron | `/api/cron/*` | shared secret | expire vouchers, payouts, notifications |

Money mutations: service-role after gate; never browser JWT UPDATE on money tables.

---

## 10. RLS for admin access

Helpers (003/053): `is_admin()`, `has_role(role)`, `is_support()`, `current_user_role()`.

Pattern:

```sql
-- Staff read example
CREATE POLICY orders_admin_read ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_role('support'));

-- Money write: no authenticated UPDATE policy; service role / definer only
```

`audit_log`: SELECT if `is_admin()`; INSERT policy `WITH CHECK (false)` for authenticated.

**Open question:** Should `support` gain read on `voucher_redemptions` and `payments` without amounts? Align permissions.ts (`payments: none` for support today) with product need.

Extend `AdminSection` with `payouts` and `vouchers`; map support read / admin write explicitly.

---

## 11. Security threat model

| Attempt | Control |
|---|---|
| Escalate to `super_admin` as admin | `assignableRoles` + DB trigger; recent auth |
| content_uploader sets `platform_percent` | Stripped in action; admin-only path; audit |
| Supplier JWT edits money via PostgREST | No UPDATE policy; portal allow-list |
| Tamper `order_items.commission_agorot` after paid | No client UPDATE; immutable snapshot convention + audit on any definer fix |
| Mark payout paid without oversight | `super_admin` + `requireRecentAuth(15)` |
| Support exports PII + money | `canSeeMoney` false; analytics no PII export |
| Replay refund | Idempotent refund keys; voucher redeemed blocker |
| Delete audit rows | No DELETE policy; FORCE RLS |
| CSRF on admin actions | Next Server Action tokens + same-site cookies |

---

## 12. Real-time vs polling

| View | Mode | Why |
|---|---|---|
| Dashboard queues (stuck payments, pending approvals) | Polling 15–30s or on focus | Simple; low volume |
| Order detail during support call | Manual refresh + optional Supabase realtime on `orders.id` | Optional |
| Voucher fraud feed | Polling 30s on redemptions insert time | |
| Analytics | On demand / cron materialized | 056 views |

Binding v1: **polling**. Realtime only if ops proves lag pain. **Open question:** is realtime required before launch?

---

## 13. Rollout sequencing

1. Freeze money model docs (this + product page + supplier portal).
2. Align `products.ts` + ProductForm with four knobs + publish gate (070 already in DB).
3. Cut suppliers admin from `vendors` → `suppliers` / applications.
4. Apply 027 remainder + 051/081/083 for payouts if missing on host.
5. Add `/admin/vouchers` over `vouchers` + `voucher_redemptions`.
6. Extend permissions matrix (`payouts`, `vouchers`).
7. Wallet admin oversight page grounded on agorot columns (post-059 repairs).
8. `feature_flags` migration when needed.
9. Deprecate `coupon_deals` admin toward `products.type = 'coupon'`.
10. WP redirect freeze before SEO cutover (see SEO doc).

---

## 14. Open questions (business, not inventable)

1. Is category mandatory on every coupon before publish?
2. Exact legal floor for `coupon_expiry_days` (120 mentioned historically)?
3. Cardcom partial capture / partial refund product policy?
4. Manual wallet credit in production: yes/no?
5. Accounting export format and cadence?
6. Support visibility into payments and redemption IPs?
7. One-shot vs continuous WP sync?
8. Runtime feature flags required pre-launch?
9. When do physical products leave "schema only" and enter merchandising?

---

## 15. Related docs

| Doc | Role |
|---|---|
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | Money knobs + publish + snapshot |
| `docs/ARCHITECTURE-SUPPLIER-PORTAL.md` | Supplier side composition |
| `ADMIN-ARCHITECTURE.md` | Earlier binding notes; defer to this file on conflicts |
| Migrations 003,007,011,052,053,054,056,059,070,072–074,081,085 | Schema truth |
