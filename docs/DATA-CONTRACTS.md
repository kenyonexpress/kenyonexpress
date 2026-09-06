# Data contracts

Fields, types, nullability, invariants, and which role may read or write each field, for the entities the storefront and settlement depend on.

Status: binding for this worktree. Docs only. Measured companions (2026-09-01 production `ixvwfbuvfxxsjiywhbbb`):

```
docs/DATA-MODEL.md
docs/MONEY-MODEL.md
docs/ROLES-AND-PERMISSIONS.md
docs/VOUCHER-LIFECYCLE.md
docs/PRODUCT-PAGE-SPEC.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
```

Authority for money: `BUSINESS-MODEL-RULES.md` (when present) then `docs/PRODUCT-TYPES.md` then the files above. Application money math is integer agorot via `packages/money.ts` / `src/lib/money.ts`. Never floats. Never a fixed commission rate.

`docs/DB-SCHEMA.md` is a 2026-07-23 snapshot and is **partly stale**. Prefer DATA-MODEL + MONEY-MODEL when they disagree (column counts, voucher table, generated `_agorot` twins).

---

## 0. Roles (product names vs production)

The product brief names four roles. Production does not have a `user_role` value `coupon_partner` and does not have a `user_roles` join table. Mapping:

| Brief name | Production | Where |
|---|---|---|
| `customer` | `profiles.role = customer` | default buyer |
| `content_uploader` | `profiles.role = content_uploader` | catalogue write, **no money** |
| `coupon_partner` | **not** `profiles.role`. Active `supplier_members` row with `member_role = scanner` (or owner/manager when they scan) | read-only redemptions + scan. Cannot see commercial terms |
| `admin` | `profiles.role IN (admin, super_admin)` via `is_admin()` | operations |

Also present on `user_role` and **not** in the brief: `vendor` (legacy, superseded by `supplier_members`), `support` (read customer data, no money writes), `super_admin` (subset of admin).

Three independent layers (ROLES-AND-PERMISSIONS):

1. Postgres: `anon` / `authenticated` / `service_role`
2. Application: `profiles.role`
3. Supplier membership: `supplier_members`

An admin is not a supplier. A scanner is not an elevated customer.

**Role assignment** is `profiles.role`, not a separate entity table. The owner UPDATE policy freezes `role`: a user cannot self-escalate. Only admin (or a server path) changes it. There is no `user_roles` many-to-many; adding one would fork every existing policy.

R/W legend in the tables below:

| Symbol | Meaning |
|---|---|
| R | may read the field on rows the role is allowed to see |
| W | may write (insert/update) under RLS / actions |
| no | neither |
| own | only the caller's rows |
| pub | published / active catalogue only |
| * | never in customer DOM even if the column is readable by a staff session |

`anon` may **write only `carts`**. Logged-in DML grants exist on many tables; **RLS is the real gate**. Treat a missing write policy as a live hole.

---

## 1. Snapshot rule (non-negotiable)

`order_items` carries its **own** `platform_percent` (whole-percent `numeric`, not basis points, not `platform_bp`). It is copied from `products.platform_percent` at purchase / `beginCheckout`. Settlement **never** re-reads the live product row for that rate.

Changing `products.platform_percent` later:

- affects **new** checkouts only
- must **never** alter historical `order_items`
- must **never** rewrite `vouchers.platform_percent` already issued
- must **never** change `paid_on_site_agorot` / `commission_agorot` / `balance_due_agorot` on old lines

The same freeze applies to supplier identity-by-value on the line (`supplier_name`, `supplier_phone`, `supplier_address`, `supplier_logo_url`) and to `commission_percent_snapshot`, `upfront_percent`, `supplier_split_percent`.

There is **no** database default for a live `platform_percent` that would silently sell at 0% or 5%. A physical product without a percent is **unsellable**. A coupon's platform take of the on-site payment is snapshotted too; `supplier_due` from the platform on the coupon path is **0** (remainder is cash at the business). Escrow columns on the line are vestigial: writers must keep `escrow_held_agorot = 0`.

Application code reads generated `*_ils_agorot` twins where they exist. It does not multiply floats by 100.

---

## 2. `product`

Table `products` (81 columns in production). Public SELECT: `status = 'active' AND deleted_at IS NULL`. Writes: `content_uploader` (own `created_by`) or admin.

### 2.1 Identity and catalogue

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | PK | R pub | R own/all via policy | R pub | R W |
| `slug` | text | no in practice | UNIQUE | R | W | R pub | W |
| `name_he` | text | no for publish | required | R | W | R pub | W |
| `name_en` | text | yes | internal / search weight | no in DOM | W | no | W |
| `type` | `product_type` | no for write | `coupon` / `physical` / `service` / `recurring`. Service settles like physical. Recurring is a separate join path | R (as UX, not the enum name) | W | R pub | W |
| `status` | `product_status` | no | `draft, active, paused, sold_out, archived`. Public only `active` | no (sees existence) | W own | no | W |
| `approval_status` | `product_approval_status` | no | publish gate | no | R own | no | W |
| `category_id` | uuid | no for publish | FK categories | R via join | W | R pub | W |
| `supplier_id` | uuid | no for publish | FK suppliers ON DELETE RESTRICT | R via join | W | R pub | W |
| `is_featured` | bool | no | home / sort pin | R as order | W | no | W |
| `is_coupon_enabled` | bool | no | must not drift from `type`; new writes set `type` | no | W | no | W |
| `deleted_at` | timestamptz | yes | soft delete; public filter | no | no | no | W |
| `created_by` | uuid | yes | uploader ownership | no | R own | no | R |
| `images` | jsonb | no default `[]` | `[0]` required to publish | R | W | R pub | W |
| `sku` | text | yes | not in customer DOM | no* | W | no | W |

### 2.2 Money and stock (live catalogue, not history)

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `kenyon_price` / `price_ils` + `*_agorot` twins | numeric + generated bigint | no for publish | display and cart unit; **agorot twin is the app read** | R as `{price}` | W | no | W |
| `full_price` / `compare_at_price_ils` | numeric | yes | strike when greater than kenyon | R as strike | W | no | W |
| `coupon_price_*` | numeric / agorot | **required for coupon publish** | absolute amount on site, **not a percent**. No silent default | R as on-site `{price}` | W | no | W |
| `platform_percent` | numeric whole percent | **required to sell physical; snapshotted at pay** | no fixed rate, no "use 5". Missing → unsellable | **never** | W (catalogue) | **never** | W |
| `supplier_split_percent` | numeric | required with platform | CHECK pair sums to 100 where present | **never** | maybe label only | **never** | W |
| `commission_percent` | numeric | stale default 5 in old snapshots | **do not use as the live rate**. `platform_percent` wins | **never** | no | **never** | R* |
| `cost_ils` | numeric | yes | admin only | no | no | no | R W |
| `cashback_percent` / `cashback_bp` | numeric / bp | default 0 | snapshot at purchase, credit later | R as benefit copy | limited | no | W |
| `stock_quantity` | int | yes | physical; atomic reserve at checkout | R as scarcity / OOS | W | no | W |
| `low_stock_threshold` | int | default 5 | ops email, not customer | no | R | no | W |
| `max_per_order` | int | yes | ceiling | R as qty max | W | no | W |
| `coupon_expiry_days` | int | required for coupon | rolling window at issue | R as `{n}` days | W | no | W |
| `commission_type` | enum | derived | coupon → `coupon_absolute`; else `physical_percent` | no | no | no | R |

Customer-visible prices are VAT-inclusive. `platform_percent` is never painted (COPY-HE forbidden list).

Type change after orders exist: historical `order_items.product_type` stays. Only new sales follow the new type.

---

## 3. `product_variant`

Table `product_variants`. Public read when active and parent product is active.

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | PK | R pub | W | no | W |
| `product_id` | uuid | no | FK CASCADE | R | W | no | W |
| `sku` | text | yes | UNIQUE | no* | W | no | W |
| `name_he` | text | yes | picker label | R | W | no | W |
| `price` / `price_ils` / `price_modifier` + `price_modifier_agorot` | numeric / bigint | modifier may be **negative** (signed on purpose) | cart key `product::variant` | R as `{price}` | W | no | W |
| `stock_quantity` | int | yes | atomic reserve RPC, not SELECT FOR UPDATE in app | R as OOS | W | no | W |
| `attributes` | jsonb | no `{}` | | R | W | no | W |
| `sort_order` | int | no | | R as order | W | no | W |
| `is_active` | bool | no | | via visibility | W | no | W |
| `deleted_at` | timestamptz | yes | soft | no | W | no | W |

Oversell prevention is reservation (`stock_reservations` / RPC), server-only.

---

## 4. `category`

Table `categories`. Public SELECT `is_active = true`.

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | PK | R pub | W own/admin | R pub | W |
| `parent_id` | uuid | yes | self-FK CASCADE | R tree | W | no | W |
| `slug` | text | no in practice | UNIQUE, URL `/category/{slug}` | R | W | R pub | W |
| `name_he` | text | no for nav | H1 / sidebar | R | W | R pub | W |
| `name_en` | text | no default `''` | search weight C | no | W | no | W |
| `description_he` | text | yes | | R | W | no | W |
| `image_url` / `icon_url` | text | yes | | R | W | no | W |
| `sort_order` | int | no 0 | | R as order | W | no | W |
| `is_active` | bool | no | inactive is 404 / hidden | no | W | no | W |
| `created_by` | uuid | yes | uploader own SELECT | no | R own | no | R |

---

## 5. `supplier`

Table `suppliers` (19 columns production). Public read where not soft-deleted. Fossil: `vendors` (do not use for new products; `products.supplier_id` → `suppliers`).

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | PK. Public page `/s/{id}` | R pub | W | R own membership | W |
| `name` | text | no for publish | H1 supplier page, PDP | R | W | R | W |
| `city` | text | required to publish product | PDP / card | R | W | R | W |
| `address` | text | required to publish | omit row if empty in UI | R | W | R | W |
| `contact_phone` | text | yes | `{phone}` LTR | R | W | R | W |
| `contact_email` | text | yes | | no* | W | R own | W |
| `logo` / notes | text | yes | | R logo | W | limited | W |
| `commission_percent` on supplier | numeric | stale | **not** the product rate. Ignore for settlement | **never** | no | **never** | R* |
| lat/lng | numeric | pending/partial | city pages | R as distance when used | W | no | W |
| soft delete | timestamptz | yes | public hide. **Live vouchers remain redeemable** (EDGE-CASES) | no | no | scan still if member | W |

`coupon_partner` does **not** read platform split, payout, or cost. Portal is a scan surface plus history of **this** supplier's redemptions.

Membership (`supplier_members`) is a separate contract: `user_id`, `supplier_id`, `member_role` (`owner` / `manager` / `scanner`), `is_active`, `invited_by`. Scanner = brief `coupon_partner`.

---

## 6. `order`

Table `orders`. Customer SELECT `user_id = auth.uid()`. Writes admin-only at SQL; create path is server `service_role` / actions. Status guarded by `tg_orders_status_guard`.

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | PK | R own | no | no | R W |
| `user_id` | uuid | yes | owner | R own | no | no | R |
| `status` | `order_status` | no | pending → paid / cancelled / refunded / … INSERT unguarded; illegal UPDATE → 23514 | R as chip | no | no | W via allowed transitions |
| money `*_ils` + generated `*_agorot` | numeric / bigint | totals after pay | ILS generation in production. App reads agorot twins | R as `{price}` | no | no | R |
| `currency` | text | no `ILS` | | R | no | no | R |
| `address_id` | uuid | yes | required if any physical line | R own | no | no (physical address: member may see fulfilment, not a general dump) | R |
| `paid_at` | timestamptz | yes | set on finalize | R | no | no | R |
| `invoice_number` | text | yes UNIQUE | | R own link | no | no | R |
| `accepted_terms_at` | timestamptz | yes | | no | no | no | R |
| `affiliate_code` / `referral_code_used` | text | yes | | no | no | no | R |
| `deleted_at` | timestamptz | yes | | no | no | no | W |
| `cardcom_payment_id` | text | yes | not in DOM | no* | no | no | R |

Guest checkout becomes a user order at login-at-pay (`mergeGuestCart`). Empty cart cannot create an order.

---

## 7. `order_item`

Table `order_items` (42 columns). **The money row.** Customer reads via parent order. Supplier reads own lines. Writes admin / server. Settlement status guarded by `tg_order_items_settlement_status_guard`. Dead labels `escrow_held` / `escrow_released` cannot be entered.

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | PK | R own | no | after redeem related | R |
| `order_id` | uuid | no | FK CASCADE | R | no | no | R |
| `product_id` | uuid | yes | SET NULL on product delete. History does not need the live row | R as name snapshot | no | no | R |
| `variant_id` | uuid | yes | SET NULL | R as label | no | no | R |
| `product_type` | `product_type` | snapshot | frozen at pay | R as coupon vs physical UX | no | R coupon lines | R |
| `supplier_id` | uuid | yes | RESTRICT | no | no | own | R |
| `quantity` | int | no ≥ 1 | one voucher per unit on coupon | R `{n}` | no | R | R |
| `unit_price_ils` / `total_price_ils` + twins | numeric / bigint | yes | generated twins non-negative CHECK | R `{price}` | no | no | R |
| **`platform_percent`** | numeric whole percent | snapshot | **immutable after insert**. Settlement uses this, not `products.platform_percent` | **never** | **never** | **never** | R (not a customer screen) |
| `commission_percent_snapshot` | numeric | snapshot | same freeze | never | never | never | R |
| `upfront_percent` | numeric | snapshot | same | never | never | never | R |
| `supplier_split_percent` | numeric | snapshot | same | never | never | never | R |
| `face_value_agorot` | int | yes | coupon face; physical = paid on site | no as named split on physical | no | R remainder context | R |
| `paid_on_site_agorot` | int | yes | what Cardcom charged for the line | R as paid | no | no | R |
| `commission_agorot` | int | yes | platform keep. Coupon: typically all of prepaid | never | never | never | R |
| `supplier_immediate_agorot` | int | yes | coupon: **0** | never | never | never | R |
| `balance_due_agorot` | int | yes | coupon: face − prepaid, cash at till. Physical: 0 | R as remainder | no | R (large number after scan) | R |
| `cashback_amount_agorot` | int | yes | snapshot; credit later | R later as wallet | no | no | R |
| `escrow_held_agorot` / `escrow_release_agorot` | int | yes | **must stay 0**. No writer | never | never | never | R* |
| `settlement_status` | `settlement_status` | no | legal transitions only | R as chip | no | limited | W allowed |
| `item_status` | `order_item_status` | no | pending, issued, shipped, … | R | no | no | W |
| supplier name/phone/address/logo | text | snapshot | rename of supplier does not rename the sale | R name/contact | no | R | R |

**There is no conservation CHECK on `order_items` itself.** Conservation lives on `vouchers`, `split_executions`, `settlement_events`. Direct agorot columns on the line lack sign CHECKs (gap, not a license to write negatives).

`product_id` SET NULL: a deleted catalogue row must not cascade-delete paid lines. Cart must mark the live product unavailable; the order stays.

---

## 8. `voucher`

Canonical issuance table. Fossil: `coupon_codes` (2 rows, do not mint). Confirmation and account lists read **`vouchers` only**. Status enum: `issued, redeemed, expired, cancelled, refunded`. Non-`issued` is terminal. **No status trigger** on this table; single-use is `UPDATE … WHERE status = 'issued'` inside `redeem_voucher()`.

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | URL `/coupon/{id}` is not a secret; RLS + `user_id` | R own | no | no until redeemed_by | R |
| `code` | text | no | UNIQUE, Crockford 10 chars, CHECK alphabet | R own LTR | no | R at scan | R |
| `qr_payload` | text | no | `KEV1.` HMAC. Proves mint, **not** single-use | R own as QR | no | scan input | R |
| `order_id` / `order_item_id` | uuid | no | one voucher per purchased unit; issue idempotent on item+qty | R own | no | no | R |
| `user_id` | uuid | no | owner | R own | no | no | R |
| `product_id` / `supplier_id` | uuid | yes | | R via join | no | own supplier | R |
| `status` | `voucher_status` | no | presentable = issued AND clock before `expires_at` (cron may lag) | R chip | no | R outcome | W via functions |
| `face_value_agorot` | int | no ≥ 0 | CHECK conservation | R `{price}` | no | R | R |
| `coupon_price_agorot` | int | no ≥ 0 | paid on site | R | no | no | R |
| `remaining_amount_due_agorot` | int | no ≥ 0 | cash at business | R | no | R **primary** | R |
| `platform_percent` | numeric | snapshot | frozen at issue, independent of later product edits | never | never | never | R |
| `expires_at` | timestamptz | no | min(rolling window, offer end) | R `{date}` | no | R | R |
| `offer_valid_until` | timestamptz | yes | deal window; **do not show instead of expires_at** | no | no | no | R |
| `redeemed_at` | timestamptz | yes | | R | no | R | R |
| `redeemed_by_supplier_id` / `redeemed_by_user_id` | uuid | yes | supplier SELECT of others' live vouchers is blocked until this is set | no | no | own after scan | R |

Conservation:

```
face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot
```

Split of prepaid across quantity: first unit absorbs remainder (334/333/333), never floats.

---

## 9. `redemption`

Table `voucher_redemptions`. Written only by `redeem_voucher()`. Supplier SELECT. Outcomes enum `voucher_scan_outcome`.

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | PK | no | no | R own supplier | R |
| `voucher_id` | uuid | no | FK | no | no | R | R |
| `supplier_id` | uuid | no | must match voucher supplier (`wrong_supplier` otherwise) | no | no | R own | R |
| `staff` / `supplier_staff` | uuid | yes | till PIN user | no | no | R | R |
| `outcome` | enum | no | success, already_redeemed, expired, … | no (email may tell customer success) | no | R | R |
| `scan_method` | text | yes | `camera` / `manual` | no | no | R | R |
| `idempotency_key` | text | yes | second identical scan is the first result, not a second redeem | no | no | implied | R |
| timestamps | timestamptz | no | | no | no | R | R |

Customer learns of a scan via `voucher_redeemed` email / status on `/coupon/{id}`, not by reading this table.

Duplicate webhook of payment is a different entity (`payment_webhook_events`, server). Duplicate **scan** is this table + conditional UPDATE.

---

## 10. `user` (profile)

`auth.users` plus `profiles` (1:1). `profiles.role` is authoritative, not `app_metadata`.

| Field | Type | Null | Invariants | customer | content_uploader | coupon_partner | admin |
|---|---|---|---|---|---|---|---|
| `id` | uuid | no | = `auth.uid()` | R own | R own | R own | R |
| `email` | text | yes UNIQUE | | R own | R own | R own | R |
| `full_name` | text | yes | | W own | W own | W own | W |
| `phone` | text | yes | Israeli mobile at checkout | W own | W own | W own | W |
| `avatar_url` | text | yes | | W own | W own | W own | W |
| `role` | `user_role` | default customer | **owner cannot change this column** | R own (not a picker) | R own | R own | W |
| `affiliate_code` | text | yes | | R own | R | no | W |
| `wallet_balance` on profile | numeric | fossil-ish | **live wallet is `wallet_accounts` / `wallet_entries`** | R via wallet API `{price}` | no | no | R |
| `total_purchases` | int | yes | denorm | no | no | no | R |

Delete account: anonymise profile; **retain financial rows** (orders, vouchers, payments) as required by law. Unredeemed vouchers: EDGE-CASES (remain redeemable or wallet path; do not silently drop codes).

---

## 11. Role assignment

Not a table. Contract:

| Field | Storage | Who writes | Invariant |
|---|---|---|---|
| Application role | `profiles.role` | admin / server only | CHECK enum. Owner UPDATE WITH CHECK keeps old role |
| Supplier role | `supplier_members.member_role` | supplier owner or admin | `is_active`; scanner cannot grant owner |
| Postgres role | JWT `anon` / `authenticated` | Auth | `service_role` never in a browser |

`has_role('customer')` is **true for every profile**. Do not use it to mean "this user is a shopper". Use `user_id = auth.uid()`.

`has_role('content_uploader')` includes admin/super_admin.

Support is **not** in `has_role` except the customer trap. Use `is_support()`.

Do not add `coupon_partner` to `user_role`. That forks `supplier_members`.

---

## 12. Cross-entity invariants

1. Money stored and calculated as integer agorot. Display ILS via formatter.
2. `platform_percent` is per product, mandatory to sell, snapshotted on `order_items` and on `vouchers`. Historical rows are frozen.
3. Coupon: customer pays coupon price on site; remainder at QR scan; no escrow; platform `supplier_immediate` 0.
4. Physical: full payment on site; immediate split by **snapshotted** percent.
5. No float, no `Math.round` on a money float, no silent 5% default.
6. `product_id` on a paid line may go NULL; the snapshot money stays.
7. Voucher issue is idempotent with the payment webhook. One unit, one code.
8. Catalogue `platform_percent` UPDATE is an admin/uploader catalogue event. It is not an `order_items` UPDATE.

---

## 13. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Initial contracts for product, variant, category, supplier, order, order_item, voucher, redemption, user, role assignment, with snapshot rule |
