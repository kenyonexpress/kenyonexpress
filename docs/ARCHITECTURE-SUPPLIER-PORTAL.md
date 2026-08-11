# ARCHITECTURE-SUPPLIER-PORTAL.md

KenyonExpress supplier-facing portal architecture.

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only (docs). No application code in this change.
Companions: `ADMIN-ARCHITECTURE.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, root `SUPPLIER-PORTAL-ARCHITECTURE.md` (shorter redeem-focused notes).
Supersedes: any draft that introduces third-party Escrow, fixed commission, or coupon payout lines from the platform. Also supersedes the escrow-release reading in main-repo `docs/ARCHITECTURE-SUPPLIER-PORTAL.md` (C11b era).

Stack: Next.js App Router (`src/app/(supplier)`), Supabase Postgres + RLS, Cardcom (customer charge only), Resend (email), Route Handlers + Server Actions, PWA scanner.
Money: **integer agorot** internally. Wire/UI may show ILS with 2 decimals; never mix units in one column.
Canonical redeem RPC: `public.redeem_voucher` (migrations 073/074; 5-arg audit form in 085 when applied).

---

## 0. Platform identity and money model

### 0.1 First principles

1. **KenyonExpress is a platform, never a supplier.** It does not appear in `suppliers`, does not hold inventory, and does not redeem vouchers as a merchant.
2. **`platform_percent` is dynamic per product**, set only by an admin on the admin product page. No fixed rate. No database default. Snapshotted onto `order_items` at purchase.
3. **No Escrow.** There is no third-party hold agent, no J5 authorization hold, and no "held until redeem" ledger that later pays the supplier for coupon prepaid money. "Held" language in older migrations is historical only.
4. **Every product page (PDP) shows supplier identity** (name, phone, address, logo) for both coupon and physical. Publish requires those fields (see `docs/ADMIN-PRODUCT-PAGE-SPEC.md`).
5. **Supplier authorization is membership**, not `profiles.role`. `vendor` is a coarse routing label only.

### 0.2 Money by product type (supplier view)

| Product type | Customer pays online | Customer pays at merchant | What the platform keeps | What the supplier receives from the platform |
|---|---|---|---|---|
| **Coupon** | Absolute `coupon_price` (stored `coupon_price_ils` / `coupon_price_agorot`), admin-set, no default | Balance `face - coupon_price` in cash/card at the till when QR is scanned | **The entire online coupon charge** | **0** (income is the till balance, outside the platform) |
| **Physical** | On-site charge (discounted sticker) | 0 | `platform_percent` of the on-site charge (snapshotted) | Residual `paid_on_site - platform_fee`, after T+3 business days and min payout threshold |

Split arithmetic (physical only for platform→supplier transfer):

```
platformFee = round_once(paidOnSite * platform_percent / 100)
supplierDue = paidOnSite - platformFee   -- residual; never a second multiplication
```

On coupons, voucher rows still store `platform_percent` for audit consistency with the product snapshot, but **payout generation never creates a coupon line**. Redeem sets the voucher to terminal `redeemed` and shows the till collection amount; it does not move platform money to the supplier.

### 0.3 Snapshot rule

At purchase, checkout copies by value onto `order_items`:

- `platform_percent`, `supplier_split_percent`, `discount_percent`, `coupon_price_ils` (null on physical)
- `supplier_id`, `supplier_name`, `supplier_phone`, `supplier_address`, `supplier_logo_url`
- settlement agorot: `face_value_agorot`, `paid_on_site_agorot`, `commission_agorot`, `supplier_immediate_agorot` / payout residual, `balance_due_agorot`

Later edits to `products` or `suppliers` must not rewrite past order lines. Portal order views prefer snapshot columns for identity and money.

---

## 1. Supplier identity, onboarding, verification, approval

### 1.1 Entities

| Entity | Table | Purpose |
|---|---|---|
| Live business | `public.suppliers` | Canonical merchant the catalog and vouchers point at |
| Application | `public.supplier_applications` | Self-service request before a `suppliers` row exists |
| Membership | `public.supplier_members` | Which users act for which supplier, and in which portal role |
| Bank | `public.supplier_bank_accounts` | Payout destination (owner-only read; admin verify) |

`public.vendors` remains legacy (old coupon_deals). New work uses `suppliers` only.

### 1.2 Approval state machine (`supplier_applications.status`)

Enum: `supplier_application_status = ('pending', 'approved', 'rejected')`.

```
                submit
  (none) -----------------> pending
                              |
              +---------------+---------------+
              | approve                       | reject (reason required)
              v                               v
           approved                        rejected
              |                               |
              | creates suppliers +           | applicant may re-apply
              | supplier_members(owner) +     | after cooldown (app rule)
              | profiles.role = vendor        |
              v                               v
         suppliers.status=active          (new application row)
```

Rules:

- Partial unique index: at most one `pending` application per `user_id`.
- Approve is admin-only (`approve_supplier_application` SECURITY DEFINER or admin Server Action with service role after `requireAdminSession`).
- Approve is idempotent on `application_id`: second call returns the existing supplier.
- Reject requires non-empty `rejection_reason`; sets `reviewed_by`, `reviewed_at`.
- Soft-close a live supplier: `suppliers.status = 'suspended' | 'closed'` and deactivate memberships (`is_active = false`). Suspend blocks redeem and product go-live.

### 1.3 Verification (business + bank)

| Check | When | Who | Storage |
|---|---|---|---|
| Israeli business id (`business_id`) present | Application submit | Applicant | `supplier_applications.business_id` → copied to `suppliers.business_id` |
| Contact phone / email reachable | Manual admin review | Admin | application + supplier contact columns |
| Logo, address, name for PDP | Before any product publish | Admin product publish gate | `suppliers.name`, `contact_phone`, `address`, `logo_url` |
| Bank account format | Owner saves bank | Owner write; admin verify | `supplier_bank_accounts` CHECKs on bank/branch/account; `verified_by` / `verified_at` set by admin |
| One active bank account | Always | DB | unique partial index `(supplier_id) WHERE is_active` |

No automated Companies Registrar scrape in v1. Admin checklist is the gate.

### 1.4 Live supplier status (`supplier_status`)

Enum (027 design): `'active' | 'suspended' | 'closed'`.

| Status | Catalog | Redeem | Payouts |
|---|---|---|---|
| `active` | Products may publish if other gates pass | Allowed for active members | Statements generate |
| `suspended` | Own products force-unpublished / blocked | Memberships deactivated or redeem membership check fails | No new statements; existing drafts cancelled |
| `closed` | Same as suspended, terminal | Blocked | Terminal; no reopen without admin |

---

## 2. Roles, permissions, composition with platform RBAC

### 2.1 Platform `user_role` (coarse)

Enum: `customer | content_uploader | vendor | support | admin | super_admin`.

| Role | Supplier portal meaning |
|---|---|
| `customer` | May submit `supplier_applications` |
| `vendor` | Routing hint after approval; **not** sufficient alone to call redeem or read orders |
| `content_uploader` / `support` / `admin` / `super_admin` | Admin shell (`/admin/**`), not the supplier PWA, unless they also hold `supplier_members` |

Admin money writes never go through supplier JWT RLS; they use service role after `requireAdminSession` / `requireRecentAuth` as in `ADMIN-ARCHITECTURE.md`.

### 2.2 Portal `supplier_member_role` (fine)

Enum: `'owner' | 'manager' | 'scanner'`.

Authorization helper (app): `requireSupplierMember({ minRole })` on top of `getSupplierSession` / `getSupplierMemberships` (`src/lib/supplier/rbac.ts`). SQL truth: `is_supplier_member`, `is_supplier_owner`.

| Capability | scanner | manager | owner |
|---|---|---|---|
| Home / today stats | yes | yes | yes |
| Scan / redeem | yes | yes | yes |
| Redemption history (own supplier) | yes | yes | yes |
| Physical order queue + mark shipped | no | yes | yes |
| Product list (read) / limited content edit | no | yes | yes |
| Submit product for review | no | yes | yes |
| Team invite / deactivate | no | no | yes |
| Bank profile | no | no | yes |
| Payout statements (non-draft) | no | no | yes |
| Business settings (non-bank) | no | no | yes |

Role rank: `scanner < manager < owner`. `minRole` checks are inclusive upward.

### 2.3 Composition rules

1. A user may be `admin` and also `supplier_members.owner` of a test supplier. Admin routes and supplier routes stay separate shells.
2. Suspend sets `is_active = false` on memberships (or status check inside redeem). RLS helpers require `is_active`.
3. Multi-supplier membership is allowed. `current_supplier_id()` returns the earliest active membership for UI default; **redeem matches the full membership set** (never only the first).
4. Elevating `profiles.role` to `vendor` without a membership grants no portal data.

---

## 3. Row Level Security design

All supplier tables: `ENABLE ROW LEVEL SECURITY` and prefer `FORCE ROW LEVEL SECURITY` on money/audit tables. Policies below are the binding predicates.

### 3.1 Helpers (SECURITY DEFINER, `search_path = public`)

```sql
-- Applied via 072 (subset of 027)
is_supplier_member(p_supplier_id uuid) RETURNS boolean
  -- EXISTS supplier_members
  --   WHERE supplier_id = p_supplier_id
  --     AND user_id = auth.uid()
  --     AND is_active

is_supplier_owner(p_supplier_id uuid) RETURNS boolean
  -- same + member_role = 'owner'

current_supplier_id() RETURNS uuid
  -- first active membership for auth.uid() ORDER BY created_at LIMIT 1

-- 077/078
is_supplier_order(p_order_id uuid) RETURNS boolean
  -- EXISTS live order_items for that order whose supplier_id
  --   satisfies is_supplier_member(supplier_id)

is_supplier_shipping_order(p_order_id uuid) RETURNS boolean
  -- is_supplier_order AND at least one physical line for that member supplier
```

`REVOKE ALL ... FROM PUBLIC, anon;` `GRANT EXECUTE ... TO authenticated;` on helpers.

### 3.2 Policy matrix (exact intent)

| Table | Op | Role | Predicate |
|---|---|---|---|
| `supplier_members` | SELECT | authenticated | `user_id = auth.uid() OR is_supplier_owner(supplier_id)` |
| `supplier_members` | ALL | authenticated | `USING / WITH CHECK (is_supplier_owner(supplier_id))` |
| `suppliers` | SELECT | authenticated | `deleted_at IS NULL AND is_supplier_member(id)` |
| `suppliers` | UPDATE | authenticated | owner only; column allow-list in Server Action (not raw PostgREST of bank fields) |
| `supplier_bank_accounts` | SELECT | authenticated | `is_supplier_owner(supplier_id)` |
| `supplier_bank_accounts` | INSERT/UPDATE | authenticated | `is_supplier_owner(supplier_id)` AND format CHECKs; `verified_*` null on write |
| `supplier_applications` | INSERT | authenticated | `user_id = auth.uid()` AND status forced `pending` |
| `supplier_applications` | SELECT | authenticated | `user_id = auth.uid()` OR `is_admin()` |
| `products` | SELECT | authenticated | `supplier_id IS NOT NULL AND is_supplier_member(supplier_id)` |
| `products` | INSERT/UPDATE | authenticated | manager+ via Server Action with service role **or** definer RPC; **never** allow `platform_percent` / `supplier_split_percent` / `coupon_price_ils` / `discount_percent` from supplier JWT |
| `order_items` | SELECT | authenticated | `deleted_at IS NULL AND supplier_id IS NOT NULL AND is_supplier_member(supplier_id)` |
| `orders` | SELECT | authenticated | `deleted_at IS NULL AND status IN ('paid','partially_fulfilled','fulfilled') AND is_supplier_order(id)` (refunded/cancelled visibility: read-only optional later; v1 excludes money disputes from queue) |
| `user_addresses` | SELECT | authenticated | only if `is_supplier_shipping_order(order_id)` for the related order (078) |
| `vouchers` | SELECT | authenticated | own customer: `user_id = auth.uid()`; supplier: `redeemed_by_supplier_id IS NOT NULL AND is_supplier_member(redeemed_by_supplier_id)` (issued vouchers of other shops are **not** listed) |
| `voucher_redemptions` | SELECT | authenticated | `supplier_id IS NOT NULL AND is_supplier_member(supplier_id)` |
| `voucher_redemptions` | INSERT/UPDATE | n/a | **none** for authenticated; RPC only |
| `vouchers` | UPDATE | n/a | **none** for authenticated; `redeem_voucher` only |
| `payout_statements` | SELECT | authenticated | `deleted_at IS NULL AND status <> 'draft' AND is_supplier_member(supplier_id)` |
| `payout_statement_lines` | SELECT | authenticated | parent statement visible under above |
| `payout_statements` | INSERT/UPDATE | n/a | admin / SECURITY DEFINER generate + mark-paid only |

Admin policies (`is_admin()` / `is_support()`) remain additive and are defined in admin architecture; they are not duplicated here.

### 3.3 Why suppliers cannot UPDATE vouchers directly

Single-use and wrong-supplier protection live in one conditional `UPDATE ... WHERE status = 'issued' AND supplier_id IN (memberships)`. Client UPDATEs would race and skip membership intersection. PostgREST must expose no UPDATE policy.

---

## 4. Product submission and approval (supplier vs admin)

### 4.1 Workflow

```
supplier manager creates draft product (supplier_id = own)
  -> optional content fields (name, description, images, stock)
  -> submit -> approval_status = pending_review (or products.status pending)
  -> admin reviews on /admin/approvals or /admin/products
  -> admin sets money knobs (platform_percent, supplier_split_percent,
       discount_percent, coupon_price_ils) + publish gate
  -> published / active
```

Supplier **cannot** publish. Admin publish runs `assertPublishable` (`product-money.ts`).

### 4.2 Field ownership after approval

| Field group | Supplier manager edit after publish | Admin |
|---|---|---|
| Content: name, description, images, highlights, redemption copy | Yes, may require re-review flag | Yes |
| Stock / variants / shipping dimensions | Yes | Yes |
| `supplier_id` | No (fixed to own; cannot reassign) | Yes |
| `platform_percent` | **Never** | **Only** |
| `supplier_split_percent` | **Never** | **Only** |
| `discount_percent` | **Never** (admin; coupon badge derived from prices) | **Only** |
| `coupon_price_ils` | **Never** | **Only** |
| `price_ils` / face | Suggest-only in v1; admin confirms | **Only** for live |
| `status` live transitions | Submit for review only | Publish / pause / archive |

Enforcement:

1. Server Action allow-list strips money columns from supplier payloads.
2. Optional DB trigger `REJECT` on `UPDATE OF platform_percent, supplier_split_percent, discount_percent, coupon_price_ils` when `current_setting('request.jwt.claim.role')` is not service and caller is not admin (defense in depth). Prefer app allow-list + service role for admin writes.
3. RLS SELECT lets suppliers see their `platform_percent` (read transparency); write path denies.

### 4.3 PDP supplier block

Storefront always renders snapshotted-capable live supplier fields: name, phone, address, logo. Missing any → product fails publish gate (admin). Supplier settings UI is how owners keep those fields current for **future** products and PDPs; past `order_items` keep old snapshots.

---

## 5. Order visibility and physical fulfillment

### 5.1 Visibility

Manager+ sees `order_items` where `supplier_id` is in memberships and parent `orders.status` is paid (or partially/fully fulfilled). Columns shown:

- Snapshot identity and money residual owed to supplier
- Product name, quantity, SKU/variant
- Shipping address (only via `is_supplier_shipping_order`)
- Fulfillment state on the line / order

Customer PII beyond shipping needs: minimize. Email/phone of buyer only if required for delivery coordination (feature-flag; default off in v1).

### 5.2 Fulfillment state machine (physical lines)

```
paid
  -> packing (optional internal)
  -> shipped | ready_for_pickup
  -> fulfilled
```

Transitions via Server Action (service role or SECURITY DEFINER), never client UPDATE on `orders`. Each transition writes `audit_log`.

Supplier notifications (section 8): `supplier.order.paid`, `supplier.order.cancelled`.

### 5.3 Money timing

Physical `supplierDue` becomes eligible for payout statements after `payout_available_at(paid_at, payout_hold_business_days)` (default **3** business days, `suppliers.payout_hold_business_days`) and only when cumulative eligible amount ≥ `suppliers.min_payout_ils` (default **100** ILS / 10000 agorot). Below threshold: `rolled_over = true` on generation attempt.

---

## 6. Coupon redemption

### 6.1 Code lifecycle (`voucher_status`)

```
issued -> redeemed     (scan success; terminal)
issued -> expired      (expiry sweep; terminal)
issued -> cancelled    (order cancel before redeem; terminal)
issued -> refunded     (refund path; terminal)
```

Conservation CHECK: `face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot`.

On successful redeem:

- Set `redeemed_at`, `redeemed_by_supplier_id`, `redeemed_by_user_id`
- `redeemed_amount_collected_agorot = remaining_amount_due_agorot` (till amount; platform does not collect it)
- Status `redeemed` (expires-on-scan: no further use)

### 6.2 Scan flow (transport)

Live route today: `POST /api/supplier/vouchers/redeem` (user JWT). Binding contract also accepts alias `POST /api/supplier/redeem`.

```json
{
  "code": "AB12CD34EF",
  "scan_method": "camera",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

QR: `KEV1.<base64url payload>.<base64url HMAC-SHA256>`. HMAC proves minting; **not** authorization. Supplier id never taken from QR body.

### 6.3 RPC steps (`redeem_voucher`)

1. `auth.uid()` required else `unauthorized`.
2. Active membership required else audit `unauthorized`.
3. Idempotency: same key + same code → replay prior outcome; same key + different code → `invalid_request`.
4. Rate limit: `check_user_rate_limit(uid, 'voucher_scan', 30, 60)` → `rate_limited`.
5. **Atomic single-use:**

```sql
UPDATE public.vouchers v
SET status = 'redeemed',
    redeemed_at = now(),
    redeemed_by_user_id = auth.uid(),
    redeemed_by_supplier_id = <membership supplier matching v.supplier_id>,
    redeemed_amount_collected_agorot = v.remaining_amount_due_agorot,
    updated_at = now()
WHERE v.code = normalized_code
  AND v.status = 'issued'
  AND v.expires_at > now()
  AND v.supplier_id IN (
    SELECT supplier_id FROM supplier_members
    WHERE user_id = auth.uid() AND is_active
  )
RETURNING *;
```

6. If row updated → insert `voucher_redemptions` (`outcome = success`), return success payload highlighting `remaining_amount_due_agorot`.
7. Else probe and classify: `already_redeemed`, `expired`, `cancelled`, `refunded`, `not_found`. Store honest `wrong_supplier` in audit; **collapse to `not_found` in API JSON** (anti-enumeration).

### 6.4 Concurrent scans (race)

Two scanners (or double-tap) hit the same code:

- Both transactions attempt the conditional UPDATE.
- Exactly one gets `ROW_COUNT = 1`.
- The other gets `ROW_COUNT = 0` → `already_redeemed`.
- Partial unique index `voucher_redemptions_one_success_per_voucher` on `(voucher_id) WHERE outcome = 'success'` is a second belt if two success inserts were ever attempted.

Offline queue: IndexedDB intents with stable `idempotency_key`; drain through the same Route Handler. Replay is safe.

### 6.5 Success UI contract

Show product name, face, **יתרה לגבייה בבית העסק** (`remaining_amount_due_agorot`), never "transfer expected from KenyonExpress" for that coupon.

---

## 7. Payout statements

### 7.1 Tables

- `payout_statements`: period, totals, status, bank snapshot, approval/paid provenance
- `payout_statement_lines`: one row per eligible **physical** `order_item` (or `adjustment`)

`payout_line_type` retains `'coupon_redemption'` in the enum for history, but **081+ generators must not insert coupon lines**.

### 7.2 Status state machine (`payout_status`)

Canonical values (026 + 083): `'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled'`.

```
generate_payout_statement
        |
        v
      draft ----cancel----> cancelled
        |
        | submit for approval (admin finance)
        v
 pending_approval ----reject/cancel----> cancelled (or back to draft)
        |
        | admin approve
        v
     approved
        |
        | super_admin mark paid (requireRecentAuth)
        v
       paid
```

Unique period: `(supplier_id, period_start, period_end) WHERE status <> 'cancelled'`.

### 7.3 Generation rules (`generate_payout_statement`)

Inputs: `p_supplier_id`, `p_period_start`, `p_period_end`, `p_as_of`.

Include physical `order_items` where:

- `supplier_id = p_supplier_id`
- Parent order paid
- Snapshot residual `supplier_payout_agorot` (or equivalent) > 0
- `payout_available_at(paid_at, hold_days) <= p_as_of`
- Not already on a non-cancelled statement line (`order_item_id` unique on lines)

Totals in agorot (persist as integer; wire may convert):

- `total_gross_agorot`
- `total_platform_fee_agorot`
- `total_payout_agorot`

If `total_payout_agorot < min_payout` (supplier setting, default 10000 agorot): mark `rolled_over`, leave draft empty or cancel draft, keep items eligible for next period.

### 7.4 Approval, reconciliation, audit

| Step | Actor | Control |
|---|---|---|
| Generate | Cron or admin action | SECURITY DEFINER; idempotent per period |
| Approve | admin / finance | Sets `approved_by`, `approved_at`; freezes lines |
| Mark paid | `super_admin` + recent auth | Sets `paid_at`, `payment_reference`; snapshots bank JSON |
| Reconcile | admin | Match `payment_reference` to bank export; disputes table optional |
| Audit | all transitions | `audit_log` with actor, before/after status, statement id |

Supplier owner sees statements with `status <> 'draft'` only (RLS).

---

## 8. Notification architecture

### 8.1 Pipeline

```
DB trigger / domain event
  -> fn_emit_notification_event
  -> notification_events (fact)
  -> fn_fanout_notification_events (respect user_notification_preferences)
  -> notifications_outbox (dedupe_key UNIQUE)
  -> worker (Route Handler cron or Edge Function)
  -> Resend (email) / optional in-app
  -> notification_delivery_events
```

Migrations **029/031** define the pipeline (may still be draft on some hosts). Binding design even when undeployed: do not send email inline from redeem RPC.

### 8.2 Supplier-relevant kinds

| `kind` | Trigger | Audience | Channel |
|---|---|---|---|
| `supplier.application.approved` | application approve | owner user | email |
| `supplier.application.rejected` | reject | applicant | email |
| `supplier.order.paid` | physical order paid with their items | manager+ digests or immediate | email |
| `supplier.order.cancelled` | cancel affecting their items | manager+ | email |
| `supplier.payout.approved` | statement approved | owner | email |
| `supplier.payout.paid` | mark paid | owner | email |
| `supplier.member.invited` | invite | invitee | email |
| `supplier.redeem.success` | optional; default **off** (scanner UI is enough) | scanner | in-app |

### 8.3 Resend + Edge Functions

- Worker loads template from `notification_templates` (`template_key`, `channel`, `locale`, `version`).
- Sends via Resend API key in server env (`RESEND_API_KEY`). From-address platform domain.
- Edge Function optional for webhook ingestion of Resend delivery events into `notification_delivery_events`.
- Cron: `POST /api/cron/notifications-worker` with shared secret.
- Dedup: `notifications_outbox.dedupe_key` e.g. `supplier.order.paid:{order_id}:{supplier_id}`.

### 8.4 Preferences

`user_notification_preferences`: per-user channel booleans + `locale` (`he`|`en`). Supplier digest frequency is an additive column when 029 is extended; until then, immediate send for payout/application, batched daily for order.paid optional.

---

## 9. Full data model

Money columns below are **integer agorot** unless noted as legacy `numeric` still present pre-059 cleanup. Binding target is agorot integers; migrations must not reintroduce float money.

### 9.1 Enums

| Enum | Values |
|---|---|
| `user_role` | `customer`, `content_uploader`, `vendor`, `support`, `admin`, `super_admin` |
| `supplier_status` | `active`, `suspended`, `closed` |
| `supplier_application_status` | `pending`, `approved`, `rejected` |
| `supplier_member_role` | `owner`, `manager`, `scanner` |
| `voucher_status` | `issued`, `redeemed`, `expired`, `cancelled`, `refunded` |
| `voucher_scan_outcome` | `success`, `already_redeemed`, `expired`, `cancelled`, `refunded`, `wrong_supplier`, `not_found`, `invalid_signature`, `invalid_request`, `unauthorized`, `rate_limited` |
| `payout_status` | `draft`, `pending_approval`, `approved`, `paid`, `cancelled` |
| `payout_line_type` | `physical_delivery`, `coupon_redemption`, `adjustment` |
| `notification_status` | `queued`, `sent`, `failed`, `cancelled`, `dead`, `skipped` |

### 9.2 `suppliers`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `name` | `text` | NOT NULL |
| `legal_name` | `text` | |
| `business_id` | `text` | |
| `contact_name` | `text` | |
| `contact_email` | `text` | |
| `contact_phone` | `text` | |
| `address` | `text` | |
| `city` | `text` | |
| `logo_url` | `text` | |
| `website` | `text` | |
| `whatsapp` | `text` | |
| `status` | `supplier_status` / text | NOT NULL DEFAULT `active` |
| `commission_percent` | `numeric(5,2)` | legacy suggestion only; **never** read at checkout |
| `default_split_percent` | `numeric(5,2)` | form prefill for new products only; **never** checkout/settlement; not a platform default rate |
| `min_payout_ils` | `numeric(12,2)` | NOT NULL DEFAULT 100; `>= 0` |
| `payout_hold_business_days` | `int` | NOT NULL DEFAULT 3 |
| `payout_terms_days` | `int` | legacy; prefer hold_business_days |
| `application_id` | `uuid` | FK → `supplier_applications(id)` ON DELETE SET NULL |
| `approved_by` | `uuid` | FK → `auth.users` |
| `approved_at` | `timestamptz` | |
| `notes` | `text` | |
| `deleted_at` | `timestamptz` | |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL DEFAULT now() |

Indexes: `suppliers_status_idx`, `suppliers_deleted_at_idx` (partial live).

### 9.3 `supplier_applications`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | NOT NULL FK → `auth.users` ON DELETE CASCADE |
| `business_name` | `text` | NOT NULL |
| `legal_name` | `text` | |
| `business_id` | `text` | NOT NULL |
| `contact_name` / `email` / `phone` | `text` | NOT NULL |
| `address` / `city` / `business_summary` | `text` | |
| `status` | `supplier_application_status` | NOT NULL DEFAULT `pending` |
| `reviewed_by` | `uuid` | FK → `auth.users` |
| `reviewed_at` | `timestamptz` | |
| `rejection_reason` | `text` | required when rejected (app) |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL |

Indexes: `supplier_applications_pending_uq` UNIQUE `(user_id) WHERE status = 'pending'`; `supplier_applications_status_idx (status, created_at DESC)`.

### 9.4 `supplier_members`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `supplier_id` | `uuid` | NOT NULL FK → `suppliers` ON DELETE CASCADE |
| `user_id` | `uuid` | NOT NULL FK → `auth.users` ON DELETE CASCADE |
| `member_role` | `supplier_member_role` | NOT NULL DEFAULT `scanner` |
| `is_active` | `boolean` | NOT NULL DEFAULT true |
| `invited_by` | `uuid` | FK → `auth.users` ON DELETE SET NULL |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL |

UNIQUE `(supplier_id, user_id)`. Indexes: partial active on `supplier_id`, `user_id`.

### 9.5 `supplier_bank_accounts`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `supplier_id` | `uuid` | FK → `suppliers` ON DELETE CASCADE |
| `account_holder_name` | `text` | NOT NULL |
| `holder_id_number` | `text` | |
| `bank_code` | `text` | NOT NULL CHECK `^[0-9]{2}$` |
| `branch_code` | `text` | NOT NULL CHECK `^[0-9]{3}$` |
| `account_number` | `text` | NOT NULL CHECK `^[0-9]{4,9}$` |
| `is_active` | `boolean` | NOT NULL DEFAULT true |
| `verified_by` / `verified_at` | uuid / timestamptz | admin only |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL |

UNIQUE `(supplier_id) WHERE is_active`.

### 9.6 `products` (supplier-relevant)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `supplier_id` | `uuid` | FK → `suppliers`; required to publish |
| `platform_percent` | `numeric(5,2)` | admin-only write; no default |
| `supplier_split_percent` | `numeric(5,2)` | pair sums to 100 (`products_split_pair_sums_to_100`) |
| `discount_percent` | `numeric(5,2)` | 0..100 |
| `coupon_price_ils` | `numeric(12,2)` | coupon; `products_coupon_price_within_price` |
| `price_ils` / face | money | sticker |
| `approval_status` / `status` | text/enum | draft → review → live |
| content / SEO / stock | … | supplier-editable subset |

Index: `products_needs_pricing_idx` for incomplete money; `idx_products_supplier`.

### 9.7 `order_items` (supplier-relevant)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `order_id` | `uuid` | FK → `orders` |
| `product_id` / `variant_id` | `uuid` | FKs |
| `supplier_id` | `uuid` | FK → `suppliers` |
| `platform_percent` | `numeric(5,2)` | snapshot |
| `supplier_split_percent` | `numeric(5,2)` | snapshot; pair CHECK |
| `discount_percent` | `numeric(5,2)` | snapshot |
| `coupon_price_ils` | `numeric(12,2)` | snapshot; null physical |
| `supplier_name` / `phone` / `address` / `logo_url` | `text` | identity snapshot |
| `face_value_agorot` | `integer` | |
| `paid_on_site_agorot` | `integer` | |
| `commission_agorot` | `integer` | platform fee |
| `supplier_payout_agorot` / `supplier_immediate_agorot` | `integer` | residual owed |
| `balance_due_agorot` | `integer` | coupon till amount |
| `escrow_held_agorot` | `integer` | **always 0** under this model |
| `settlement_status` | enum/text | |
| `item_status` | text | fulfillment |

Indexes: `order_id`, `supplier_id`.

### 9.8 `vouchers`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `code` | `text` | UNIQUE; format CHECK Crockford-ish 10 chars |
| `qr_payload` / `qr_key_id` | `text` | |
| `order_id` / `order_item_id` / `product_id` / `supplier_id` / `user_id` | `uuid` | FKs NOT NULL |
| `status` | `voucher_status` | NOT NULL DEFAULT `issued` |
| `face_value_agorot` | `integer` | `>= 0` |
| `coupon_price_agorot` | `integer` | `>= 0` |
| `remaining_amount_due_agorot` | `integer` | `>= 0` |
| `platform_percent` | `numeric(5,2)` | audit; range CHECK |
| `expires_at` / `offer_valid_until` / `issued_at` | `timestamptz` | |
| redemption provenance | uuid/timestamptz/int | set only on redeem |
| `cancelled_at` / `refunded_at` / `status_reason` | | |

CHECKs: `vouchers_conservation`, `vouchers_code_format`, `vouchers_redeemed_fields`, expiry within offer.
Indexes: code, supplier+status, user+status, active expiry partial, redeemed_by_supplier partial.

### 9.9 `voucher_redemptions`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `voucher_id` | `uuid` | FK ON DELETE SET NULL |
| `code_entered` | `text` | NOT NULL |
| `supplier_id` | `uuid` | FK SET NULL |
| `scanned_by` | `uuid` | FK → `auth.users` SET NULL |
| `scan_method` | `text` | CHECK IN (`camera`,`manual`) |
| `outcome` | `voucher_scan_outcome` | NOT NULL |
| `idempotency_key` | `text` | unique partial when present |
| `amount_collected_agorot` | `integer` | `>= 0` or null |
| `metadata` | `jsonb` | NOT NULL DEFAULT `{}` |
| `ip_address` / `user_agent` | inet / text | audit (085) |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |

Unique success-per-voucher partial index. Indexes by voucher/supplier/scanner/`created_at`.

### 9.10 `payout_statements` / `payout_statement_lines`

**statements:** `id`, `statement_number` UNIQUE, `supplier_id` FK RESTRICT, `period_start`/`period_end` dates CHECK end > start, `status payout_status`, totals (agorot integers target), `available_at`, `min_payout_ils`, `rolled_over boolean`, `approved_by`/`approved_at`, `paid_at`, `payment_reference`, `bank_snapshot jsonb`, `notes`, `deleted_at`, timestamps.

**lines:** `id`, `statement_id` FK, `line_type`, `order_item_id` FK UNIQUE when present, `coupon_code_id` nullable legacy, amounts agorot, CHECK at least one of order_item / coupon_code / adjustment.

### 9.11 Notifications (029/031)

`user_notification_preferences`, `notification_templates`, `notification_events`, `notifications_outbox` (`dedupe_key` UNIQUE, `status notification_status`), `notification_delivery_events`, `notification_conversions`.

---

## 10. API surface

Envelope for Server Actions:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
```

### 10.1 Routes and actions

| Method | Path / Action | Min auth | Body / result |
|---|---|---|---|
| `POST` | `/api/supplier/vouchers/redeem` | scanner+ JWT | `{ code, scan_method, idempotency_key }` → redeem outcome JSON + HTTP map |
| `POST` | `/api/supplier/redeem` | alias of above | same |
| RPC | `redeem_voucher(...)` | authenticated member | same outcomes |
| RPC | `log_voucher_scan(...)` | authenticated member | audit pre-DB rejects |
| RSC | `/supplier` | scanner+ | today stats |
| RSC | `/supplier/scan` | scanner+ | PWA scanner |
| RSC | `/supplier/redemptions` | scanner+ | list via RLS |
| RSC | `/supplier/orders` | manager+ | physical queue |
| Action | `markOrderItemShipped` | manager+ | `{ order_item_id, tracking? }` |
| Action | `markOrderItemReadyForPickup` | manager+ | `{ order_item_id }` |
| RSC | `/supplier/products` | manager+ | own catalog |
| Action | `upsertSupplierProductDraft` | manager+ | content/stock only; money fields stripped |
| Action | `submitSupplierProduct` | manager+ | `{ product_id }` → pending review |
| RSC | `/supplier/team` | owner | members |
| Action | `inviteSupplierMember` | owner | `{ email, member_role }` |
| Action | `setSupplierMemberActive` | owner | `{ member_id, is_active }` |
| RSC | `/supplier/payouts` | owner | statements `status <> draft` |
| RSC | `/supplier/settings` | owner | profile |
| Action | `updateSupplierProfile` | owner | non-bank fields |
| Action | `upsertSupplierBankAccount` | owner | bank fields; clears verified_* |
| `POST` | `/api/supplier/applications` | authenticated customer | application create |
| Admin Action | `approveSupplierApplication` | admin+ | creates supplier + owner membership |
| Admin Action | `rejectSupplierApplication` | admin+ | reason required |
| Admin Action | `generatePayoutStatement` | admin+ | period + supplier |
| Admin Action | `approvePayoutStatement` | admin+ | |
| Admin Action | `markPayoutPaid` | super_admin + recent auth | `{ payment_reference }` |
| Cron | `/api/cron/notifications-worker` | shared secret | drain outbox → Resend |
| Cron | `/api/cron/expire-vouchers` | shared secret | `expire_vouchers` |
| Cron | `/api/cron/generate-payouts` | shared secret | weekly generate per active supplier |

### 10.2 Redeem HTTP mapping

| Outcome | HTTP |
|---|---|
| `success` (+ optional `replayed`) | 200 |
| `unauthorized` | 401 |
| `invalid_request` | 400 |
| `rate_limited` | 429 |
| `already_redeemed` / `cancelled` / `refunded` | 409 |
| `expired` | 410 |
| `not_found` (includes collapsed `wrong_supplier`) | 404 |
| unexpected | 500 |

### 10.3 Redeem success payload

```json
{
  "outcome": "success",
  "voucher_id": "uuid",
  "code": "AB12CD34EF",
  "status": "redeemed",
  "product_name": "…",
  "supplier_name": "…",
  "customer_name": "…",
  "face_value_agorot": 10000,
  "coupon_price_agorot": 900,
  "remaining_amount_due_agorot": 9100,
  "redeemed_at": "2026-07-28T00:00:00Z",
  "replayed": false
}
```

---

## 11. Security threat model

| Attempt | Control |
|---|---|
| Forge QR for another shop and redeem | Conditional UPDATE requires `v.supplier_id` ∈ caller's active memberships; API collapses wrong shop to `not_found` |
| Pass `supplier_id` in body to escalate | Ignored; identity from `supplier_members` + `auth.uid()` only |
| Double-scan / parallel redeem | Conditional UPDATE on `status = 'issued'` + unique success redemption index |
| Replay offline drain | `idempotency_key` unique partial; replay returns prior outcome |
| Enumerate valid codes via wrong-supplier errors | Collapse `wrong_supplier` → `not_found` externally; rate limit 30/min/user |
| Direct PostgREST UPDATE on `vouchers` | No UPDATE policy for authenticated; RPC SECURITY DEFINER only |
| Read another supplier's orders | `order_items` / `orders` RLS via `is_supplier_member` / `is_supplier_order` |
| Read buyer addresses for non-shipping or other shops | `is_supplier_shipping_order` gate |
| Edit `platform_percent` as supplier | Stripped in Server Action; admin-only write path; optional DB reject trigger |
| Publish without admin money knobs | `assertPublishable` + admin-only status transition |
| Self-approve supplier application | Approve RPC requires admin |
| See draft payouts or invent lines | RLS hides `draft`; inserts only via definer generate |
| Mark payout paid without recent auth | `requireRecentAuth` + `super_admin` |
| Steal bank details as scanner/manager | Bank SELECT policy `is_supplier_owner` only |
| Act after suspend | `is_active = false` fails membership helpers; redeem unauthorized |
| Brute-force codes | Rate limit + code space + HMAC minting |
| Use expired/cancelled/refunded code | Status/expiry predicates on UPDATE; typed outcomes |
| CSRF on cookies | Same-site cookies + origin checks on Route Handlers; Server Actions framework tokens |
| Inject Resend spam | Outbox dedupe keys; worker auth secret; template allow-list |

---

## 12. Rollout sequencing and migration path

### 12.1 What is already live (grounded)

| Piece | Migration / code | State |
|---|---|---|
| `suppliers` base | 005 | live |
| `supplier_members` + helpers + product SELECT RLS | **072** | live |
| Dynamic product split pair | **070** | live |
| Vouchers + redemptions tables | **073** (054 adapted) | live |
| `redeem_voucher` / `log_voucher_scan` | **074** (+ **085** audit args when applied) | live RPC |
| Supplier order read helpers/policies | **077/078** | live intent |
| Portal UI | `(supplier)/supplier/scan` + redeem API | **scan only** |
| App guard | `src/lib/supplier/rbac.ts` | live |

### 12.2 Must not apply verbatim

| Migration | Why |
|---|---|
| Full **027** as originally written | Would regress `product_platform_percent()` to `COALESCE(..., 10)` (fixed commission). Port remaining objects as **new numbered migrations** that preserve 070 semantics |
| **079** escrow payout release | Cancelled; model has no coupon platform→supplier payout |
| Any "held until redeem then pay supplier" path | Conflicts with section 0 |

### 12.3 Forward sequence

1. **Docs freeze** (this file + `ADMIN-PRODUCT-PAGE-SPEC.md`).
2. **027 remainder as additive migrations** (applications, bank, payout tables, approve/reject RPCs) without touching split functions.
3. **051 + 083 + 081** payout engine on agorot, physical lines only, T+3 + min 100.
4. **085** scan audit columns if not on host.
5. **029/031** notifications + Resend worker cron.
6. **Portal pages**: redemptions → orders → products (read/limited) → team → settings/bank → payouts.
7. **Admin**: applications queue, bank verify, payout approve/mark-paid, product approval with money knobs.
8. **Backfill**: ensure every live product has supplier identity + split pair; index `products_needs_pricing_idx`.
9. **Cutover**: stop reading `vendors` for new admin supplier UI; leave legacy coupon_deals until migrated.

### 12.4 Compatibility notes

- Pre-070 order lines may have incomplete snapshots; portal displays best-effort and never recomputes money from live `products.platform_percent`.
- `commission_percent` on suppliers remains display/prefill junk data for checkout (forbidden fallback).
- Wire may still expose `*_ils` aliases; internal settlement and new columns are agorot.

---

## 13. Acceptance checklist

- [ ] KenyonExpress never appears as a `suppliers` row used for redeem
- [ ] Coupon success UI shows till balance; no platform transfer promise
- [ ] Physical residual uses snapshotted `platform_percent`; supplier due is residual
- [ ] Double-scan → one `redeemed` + one `already_redeemed`
- [ ] Wrong shop → external `not_found`
- [ ] Supplier cannot write money knobs; admin can
- [ ] Suspended membership cannot redeem
- [ ] Payout statements contain physical lines only; T+3 + min threshold + rollover
- [ ] Notifications go through outbox + Resend worker, not inline RPC email
- [ ] RLS blocks cross-supplier order/voucher reads
- [ ] Offline redeem drain is idempotent

---

## 14. Related documents

| Doc | Role |
|---|---|
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | Admin money knobs, publish gate, order_items snapshot |
| `ADMIN-ARCHITECTURE.md` | Admin shell, RBAC sections, approvals |
| `SUPPLIER-PORTAL-ARCHITECTURE.md` | Shorter redeem-focused companion in this worktree |
| Migrations 070, 072, 073, 074, 077, 078, 081, 085 | Schema and RPC truth |
| `src/lib/commerce/product-money.ts` | Pure money + publish helpers (implementation lives on feature branches) |
