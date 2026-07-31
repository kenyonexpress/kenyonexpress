# ARCHITECTURE-ADMIN-DASHBOARD.md

KenyonExpress admin dashboard architecture (platform control center).

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only (docs). No application code in this change.
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, root `ADMIN-ARCHITECTURE.md`.
Stack: Next.js App Router `src/app/(admin)`, Supabase Postgres + RLS, Cardcom, Server Actions + cron Route Handlers.
Money: **integer agorot** internally. UI shows ₪ with 2 decimals. Never mix units in one column.

This document decides. Where older drafts mention fixed commission, Escrow payout of coupon prepaid money, or `vendors` as the live supplier entity, this file wins for admin operations. Catalog launch scope: **coupons only** (physical remains in schema/UI for later).

---

## 0. Fixed platform model (admin must enforce)

| Rule | Detail |
|---|---|
| Platform identity | KenyonExpress is a platform, never a supplier. No `suppliers` row for the platform used in redeem or payout. |
| `platform_percent` | Dynamic per product. Admin-only write on the product page. No fixed rate. No DB default. Snapshotted onto `order_items` at purchase. |
| Escrow | None. `escrow_held_agorot` on lines stays 0. |
| Coupon | Customer pays absolute `coupon_price_ils` online; **that money stays with the platform**. Balance `face - coupon_price` paid at merchant on QR scan. Voucher expires on scan (`redeemed`). |
| Physical | Immediate split by snapshotted `platform_percent`. Supplier residual after T+3 + min payout. Supplier notified and ships. |
| PDP | Every product page shows supplier name/phone/address/logo. Publish blocked without them. |
| Launch catalog | Coupons first. |

**Open question Q-ADMIN-1:** `docs/ADMIN-PRODUCT-PAGE-SPEC.md` allows a coupon split pair other than 100/0. This dashboard doc binds supplier economics to "coupon online charge stays with platform" (aligns with `ARCHITECTURE-SUPPLIER-PORTAL.md` and migration 081: no coupon payout lines). Decide whether admin UI forces `platform_percent = 100` on coupons or allows other values that still do not create supplier payout lines.

---

## 1. Product management

### 1.1 Editor surface

Routes (live): `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit`.
Action module: `src/server/actions/admin/products.ts`.
Form: `src/components/admin/ProductForm.tsx`.
Pure money gate: `src/lib/commerce/product-money.ts` (`assertPublishable`).

### 1.2 Field inventory (binding labels)

| UI / concept | Column(s) | Type notes | Who writes |
|---|---|---|---|
| Type | `products.type` | `'coupon' \| 'physical'` | admin / staff create |
| Name HE | `name_he` | text | staff |
| Slug | `slug` | unique URL key | staff |
| Short / long description | `short_description_he`, `description_he` | | staff |
| Gallery | `images` jsonb (URLs) | R2/CDN | staff via `admin/images` |
| Category | `category_id` | FK categories | staff |
| Badges / featured | `is_featured`, highlights array | | staff |
| Brand / SEO | `brand`, `seo_title`, `seo_description`, `seo_keywords` | | staff |
| Supplier assignment | `supplier_id` | FK `suppliers` | admin (required to publish) |
| Face / list price | `price_ils` / kenyon_price legacy alias | | admin for live |
| Coupon online price | `coupon_price_ils` | absolute; CHECK within price | **admin only** |
| Discount badge | `discount_percent` | 0..100; coupon derived from prices | **admin only** |
| Platform take | `platform_percent` | 0..100; no default | **admin only** |
| Supplier share (agreement) | `supplier_split_percent` | pair sums to 100 (070) | **admin only** |
| Coupon expiry | `coupon_expiry_days`, `offer_valid_until` | | admin |
| Stock | `stock_quantity`, variants | physical | staff |
| Shipping dims | `weight_grams`, `length_cm`, … | physical | staff |
| Terms / redemption copy | `coupon_terms_he`, `redemption_instructions_he` | | staff |
| Status | `status` / `approval_status` | draft → review → live | see §1.3 |
| Cashback hint | `cashback_bp` (059; was `cashback_percent`) | product-level | admin |

Canonical money rules: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`.

### 1.3 Field-level permissions after approval

| Field group | content_uploader | admin | after `active`/`published` |
|---|---|---|---|
| Content, gallery, SEO | write drafts | write | editable; may set `pending_review` again (**open Q-ADMIN-2**: auto re-review or silent publish?) |
| Stock / variants | write | write | yes |
| Money knobs (`platform_percent`, `supplier_split_percent`, `discount_percent`, `coupon_price_ils`, face) | **no** | **yes** | admin only; every change → `audit_log` `action=updated` with before/after |
| `supplier_id` | no after create | yes | rare; audit required |
| Live status transitions | submit only | publish/pause/archive | admin |

Enforcement: Server Action allow-list strips money columns for non-admin; service-role write after `requireSection('catalog','write')` + role check. Optional DB trigger reject non-service writes to money columns (planned).

### 1.4 Bulk, import, WordPress migration

| Capability | Design | Schema / gap |
|---|---|---|
| Bulk status pause/archive | Server Action + selected ids | exists partially via per-row actions |
| Bulk assign category | Action | PLANNED |
| CSV import | Admin-only job writing drafts with `approval_status=pending_review`; money columns null until admin fills | Need `product_import_jobs` table (migration PLANNED) |
| WordPress → products | Map WP product/coupon posts → `products` + images to R2; preserve slugs for redirects (see SEO doc) | Use existing migration scripts under `docs/` / ops; do not invent commission defaults |

**Open Q-ADMIN-3:** Exact WP post types and ACF field map for coupon face vs platform price (live site uses storefront language "מחיר בקניון").

### 1.5 Categories and taxonomy

Routes: `/admin/categories`, `/admin/categories/new`, `/admin/categories/[id]`.
Action: `src/server/actions/admin/categories.ts`.
Table: `categories` (slug, name_he, parent, sort, image). Soft delete via `deleted_at` where present.
Tags: if `product_tags` / join table exists use it; otherwise store in product highlights until migration adds `tags` + `product_tags`.

---

## 2. Order and payment operations

### 2.1 Order list and filters

Route: `/admin/orders`, `/admin/orders/[id]`.
Sources: `orders`, `order_items`, `payments`, `vouchers`.
Filters: status, date range, supplier_id (via items), q (order id / email), product type, payment stuck.

`order_status` (007): `'pending' | 'paid' | 'partially_fulfilled' | 'fulfilled' | 'cancelled' | 'refunded'`.

`order_item_status` (007): `'pending' | 'issued' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'`.

### 2.2 Order state machine

```
pending --(Cardcom capture + finalize)--> paid
paid --> partially_fulfilled --> fulfilled
paid|partially_fulfilled --> cancelled   (pre-fulfillment / admin; voucher rules)
paid|… --> refunded                      (Cardcom refund path; blockers apply)
```

Transitions via Server Actions / SECURITY DEFINER only. Each writes `audit_log` (`status_change`).

### 2.3 Payment reconciliation (Cardcom)

| Concept | Table / path |
|---|---|
| Payment rows | `payments` (046+) |
| Webhook | `POST /api/payments/cardcom/webhook` (signature verified) |
| Stuck queue | `/admin/payments` |
| Reconcile | admin action calling idempotent finalize |

Partial captures: admin shows captured amount vs order `customer_pays_now_agorot` and flags mismatch. **J5 / authorization-hold Escrow is out of scope and forbidden** (final money model). Low Profile capture + GetLpResult only.

Refunds: blocked if any related `vouchers.status IN ('redeemed','expired')` for that value (`STATE_INVALID`, `blocker=voucher_consumed`). Disputes: admin opens dispute record (**gap**: `disputes` enum exists in 027 draft; confirm table applied).

### 2.4 Split ledger view (per order)

For each `order_items` row show (agorot integers; UI ÷100):

| Field | Meaning |
|---|---|
| `face_value_agorot` | Sticker / face |
| `paid_on_site_agorot` | Charged on site |
| `commission_agorot` | Platform take |
| `supplier_payout_agorot` / `supplier_immediate_agorot` | Residual to supplier (0 for coupon under fixed model) |
| `balance_due_agorot` | Till collection (coupon) |
| `platform_percent`, `supplier_split_percent` | Snapshots |
| `coupon_price_ils` / agorot snapshot | Coupon prepaid |
| `escrow_held_agorot` | Always 0 |

Never recompute from live `products.platform_percent`.

---

## 3. Supplier operations

Compose with `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`.

### 3.1 Directory and onboarding

| UI | Data |
|---|---|
| `/admin/suppliers` | Today may still list legacy `vendors`; **binding target** is `suppliers` + `supplier_applications` |
| Approval queue | `supplier_applications.status = pending` |
| Approve | creates `suppliers` + `supplier_members(owner)` + `profiles.role='vendor'` |
| Reject | reason required |
| Verify bank | `supplier_bank_accounts.verified_by/at` |
| Suspend | `suppliers.status='suspended'`; deactivate memberships; unpublish products |

### 3.2 Payouts

Route: `/admin/payouts` (live UI partial).
Tables: `payout_statements`, `payout_statement_lines` (027 remainder; may need additive apply).
Status: `draft → pending_approval → approved → paid` (+ `cancelled`).
Generator: `generate_payout_statement` (081): **physical lines only**, T+3, min 100 ILS, rollover.
Mark paid: `super_admin` + recent auth only.
Permissions gap: `AdminSection` in `permissions.ts` has no `payouts` key yet; matrix in this doc requires adding it (read admin+, write super_admin for mark-paid).

---

## 4. Coupon / voucher operations

| Concern | Source of truth |
|---|---|
| Catalog coupons | `products` where `type='coupon'` (canonical). Legacy `coupon_deals` + `/admin/coupons` is bridge only. |
| Issued codes | `vouchers` |
| Scan audit | `voucher_redemptions` |
| Expiry sweep | `expire_vouchers` cron `/api/cron/expire-vouchers` |

Admin views: inventory counts by status; redemption timeline; fraud signals (rate_limited bursts, wrong_supplier collapsed attempts, multi-IP same code from 085 `ip_address`).

Single-use monitoring: alert if >1 success row per voucher (unique index should prevent; alert on constraint violation logs).

---

## 5. Finance and reporting

### 5.1 Revenue dashboards

Route: `/admin/analytics` (056 analytics views where applied).
Metrics (admin money-visible roles only; `canSeeMoney`):

- Platform take: sum `order_items.commission_agorot` for paid orders in period
- Coupon prepaid revenue: sum coupon `paid_on_site_agorot`
- Physical residual owed / paid via statements
- Breakdown by `product_id`, `supplier_id`, day

### 5.2 Digital wallet oversight

Internal only. Never withdraws to bank/card.

| Table | Role |
|---|---|
| `wallet_accounts` | per-user balance (+ platform codes `platform:revenue`, `platform:cashback_reserve`, `platform:adjustments`) |
| `wallet_entries` | double-entry; `idempotency_key` UNIQUE; amounts → **agorot** post-059/089 |
| `v_wallet_ledger` | read model for account UI |
| `cashback_rules` (052) | rules engine; wire to finalize is open |

Admin: list ledger, adjust via `adminAdjustWallet` (super_admin + recent auth + reason), never negative user balance (`wallet_accounts_user_nonneg_agorot`).

### 5.3 Export / accounting

CSV/JSON export of orders and payout statements for period. PII export: admin+ only; support blocked.
**Open Q-ADMIN-5:** external accounting system (Hashavshevet / Priority) vs manual CSV only for v1.

---

## 6. Platform administration

### 6.1 Users and RBAC

`user_role`: `customer | content_uploader | vendor | support | admin | super_admin`.
Guards: `requirePanelSession`, `requireSection`, `requireStaffSession`, `requireAdminSession`, `requireAdminPage` in `src/lib/admin/rbac.ts`.
Section matrix: `src/lib/admin/permissions.ts` (extend with `payouts`, `approvals`, `coupons` as first-class if not folded into `catalog`).

Sensitive mutations: recent auth window (15 min) for role elevation, wallet adjust, mark payout paid, force refund.

### 6.2 Audit logging

Canonical table `public.audit_log` (011; `admin_audit_log` dropped via 025):

| Column | Type |
|---|---|
| `id` | uuid PK |
| `actor_id` | uuid → auth.users |
| `actor_role` | text |
| `action` | `audit_action` enum |
| `entity_type` / `entity_id` | text / uuid |
| `changes` / `metadata` | jsonb |
| `ip_address` / `user_agent` | inet / text |
| `created_at` | timestamptz |

Indexes: actor, entity, action, created_at.
RLS: `is_admin()` SELECT; INSERT only via SECURITY DEFINER; no UPDATE/DELETE policies for clients.
UI: `/admin/audit-log`.

Every money-knob change, role change, refund, payout approve/paid, supplier suspend must write here.

### 6.3 Feature flags and settings

**Gap:** no first-class `feature_flags` table in applied migrations. Binding design:

```sql
-- MIGRATION NEEDED
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Until then, env vars (`NEXT_PUBLIC_*` / server env) are the only flags. Admin settings page: PLANNED.

---

## 7. Admin-specific data model (additions and grounding)

### 7.1 Already grounded (do not reinvent)

`products`, `product_variants`, `categories`, `orders`, `order_items`, `payments`, `suppliers`, `supplier_members`, `supplier_applications`, `supplier_bank_accounts`, `vouchers`, `voucher_redemptions`, `payout_statements`, `payout_statement_lines`, `wallet_accounts`, `wallet_entries`, `audit_log`, `profiles`, `affiliates` (if present).

### 7.2 Migrations needed for gaps

| Object | Why |
|---|---|
| Additive 027 remainder (applications, bank, payouts) without regressing 070 split functions | Onboarding + payouts |
| `product_import_jobs` | Bulk WP/CSV import tracking |
| `feature_flags` | Admin toggles |
| `disputes` table if 027 not applied | Chargebacks / voucher disputes |
| `AdminSection` + RLS alignment for payouts | Code + policy |
| Ensure `order_items` agorot columns + snapshots complete (059/070) | Ledger view |

---

## 8. Complete API surface (admin)

Envelope:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
```

### 8.1 Server Actions (`src/server/actions/admin/*`)

| Action | Auth | Notes | Status |
|---|---|---|---|
| `upsertProduct` | staff/admin; money fields admin | EXISTS |
| `approveProduct` / `rejectProduct` | admin | EXISTS (`approvals.ts`) |
| `archiveProduct` | admin | PLANNED |
| `upsertCategory` | staff | EXISTS |
| `listOrders` / order status actions | support+ / admin | EXISTS partial |
| `adminCancelOrder` / `adminRefundOrder` | admin + recent | PLANNED |
| `reconcilePayment` | admin | PARTIAL |
| vendor/supplier CRUD + approve application | admin | EXISTS on vendors; migrate to suppliers |
| `updateUserRole` | admin / super_admin rules | EXISTS |
| `adminAdjustWallet` | super_admin + recent | PLANNED |
| payout generate / approve / `markPayoutPaid` | admin / super_admin | PARTIAL (`payouts.ts`) |
| `processAndUploadImage` | staff | EXISTS |
| coupon-deals bridge | admin | EXISTS legacy |

### 8.2 Route Handlers

| Method | Route | Auth |
|---|---|---|
| `POST` | `/api/payments/cardcom/webhook` | Cardcom signature |
| `POST` | `/api/cron/expire-vouchers` | `CRON_SECRET` |
| `POST` | `/api/cron/payout-statements` | `CRON_SECRET` |
| `POST` | `/api/cron/notifications-worker` | `CRON_SECRET` |
| `POST` | `/api/admin/revalidate` | admin or deploy secret |

No public `/api/admin/*` CRUD.

---

## 9. RLS for admin access

Helpers: `is_admin()`, `has_role()`, `current_user_role()`, `is_support()` (053).

Pattern:

- Staff reads via policies `USING (is_admin() OR is_support())` where support allowed.
- Money mutations: **no** authenticated UPDATE policies on `order_items` money columns, `payout_statements`, `wallet_entries`. Service role / SECURITY DEFINER after app gate.
- `audit_log`: SELECT `is_admin()`; INSERT denied to clients.
- `payments`: admin select; writes from webhook definer only.
- Prefer `FORCE ROW LEVEL SECURITY` on money tables.

---

## 10. Security threat model

| Attempt | Control |
|---|---|
| Privilege escalation to `super_admin` | `canAssignRole` + DB trigger 035; recent auth; audit |
| Unauthorized `platform_percent` change | Action strip + admin-only; audit before/after; optional trigger |
| Ledger tampering via PostgREST | No client write policies on `wallet_entries` / payout lines; definer + idempotency keys |
| Refund after redeem | App blocker + voucher status check |
| Support exporting PII/money | `canSeeMoney` false; export gated |
| Mark payout paid without auth | super_admin + `requireRecentAuth` |
| CSRF / session steal | SameSite cookies; re-auth for sensitive |
| Supplier posing as admin | Separate shells; membership ≠ `is_admin()` |

---

## 11. Real-time vs polling

| View | Mode |
|---|---|
| Order/payment stuck queues | RSC + 10-30s client poll or `router.refresh` |
| Redeem fraud signals | Poll redemptions feed 15s on dashboard widget |
| Payout approval | On-demand refresh after action |
| Analytics | Pre-aggregated views; refresh on load / manual |
| True realtime (Supabase channel) | Optional later for payments stuck; not required for coupons-first launch |

---

## 12. Rollout sequencing

1. Freeze money model docs (this + product page + supplier portal).
2. Finish admin product editor money knobs against `product-money.ts` + 070.
3. Switch `/admin/suppliers` from `vendors` → `suppliers` + applications.
4. Apply payout additive migrations (051/081/083) safely.
5. Order detail split ledger UI (read snapshots only).
6. Voucher admin inventory (replace legacy coupon_deals emphasis).
7. Wallet adjust + audit completeness.
8. Feature flags table + settings page.
9. Exports and analytics money gates.
10. Physical fulfillment admin (after coupons-stable).

---

## 13. Open questions (business)

| ID | Question |
|---|---|
| Q-ADMIN-1 | Force coupon `platform_percent=100` in UI vs allow other values without payout lines? |
| Q-ADMIN-2 | Content edit after publish: silent vs forced re-approval? |
| Q-ADMIN-3 | Exact WP field map for import |
| Q-ADMIN-4 | Partial capture / dispute UI scope for v1 |
| Q-ADMIN-5 | Accounting export target system |
| Q-ADMIN-6 | Support read of voucher PII (customer name on redeem)? |
| Q-ADMIN-7 | Min coupon expiry floor (architecture mentions 120 days): legal confirmation |

---

## 14. Related docs

| Doc | Role |
|---|---|
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | Money fields + publish gate |
| `docs/ARCHITECTURE-SUPPLIER-PORTAL.md` | Supplier portal composition |
| `ADMIN-ARCHITECTURE.md` | Earlier binding notes; superseded on Escrow/coupon-take conflicts by this file + product/supplier specs |
| Migrations 007, 011, 046, 052, 053, 056, 059, 070, 072-074, 081, 085, 089 | Schema truth |
