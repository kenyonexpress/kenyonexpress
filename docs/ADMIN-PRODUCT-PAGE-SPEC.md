# ADMIN-PRODUCT-PAGE-SPEC.md

Spec for the admin product page money + supplier block.

Status: BINDING for `arch/admin-supplier` (2026-07-27)
Scope: docs only. Implementation lives in `src/lib/commerce/product-money.ts`, migration `070_product_dynamic_split.sql`, checkout snapshot in `src/server/actions/payments/checkout.ts`.
Money: agorot integers internally; ILS with 2 decimals on the wire (`*_ils`).

This document decides the admin product form contract. Where older text in `ADMIN-ARCHITECTURE.md` section 0 still says coupons hardcode `platform_percent = 100`, this spec wins: since 070 the same four knobs apply to both product types. A coupon that keeps the whole prepayment is still expressible as `platform_percent = 100`, but that is an admin choice, not a constant.

---

## 0. Non-negotiables

1. There is **no default** for any of the four money knobs. Missing value stays missing. Never coerce empty form input to `0` (a silent `0` means "the supplier gets nothing").
2. The two split halves always sum to **100**. Enforced in app (`completeSplitPair`) and in DB (`products_split_pair_sums_to_100`, `order_items_split_pair_sums_to_100`).
3. Platform fee is rounded **once**, on the on-site line base. Supplier share is the **residual** `base - platformFee`. Never multiply `supplier_split_percent` a second time for money.
4. Publish reports **every** failing reason in one pass (`assertPublishable`). Do not stop at the first blocker.
5. At purchase, every money + supplier identity field written to `order_items` is a **value snapshot**. Later edits to `products` or `suppliers` must not move past rows.

---

## 1. The four dynamic money fields

| DB column | Type | Meaning | No default |
|---|---|---|---|
| `platform_percent` | `numeric(5,2)`, range 0..100 | Platform share of what the customer pays **on site** | Required to publish |
| `supplier_split_percent` | `numeric(5,2)`, range 0..100 | Supplier share of the **same** on-site base (agreement snapshot) | Required to publish |
| `discount_percent` | `numeric(5,2)`, range 0..100 | Saving off sticker `price_ils`, shown to the customer | Required to publish |
| `coupon_price_ils` | `numeric(12,2)` | Absolute amount charged on site for a **coupon** (not a percent) | Required to publish when `type = coupon` |

Canonical wire names use `_ils` / `_percent`. UI may label `coupon_price_ils` as "מחיר קופון" / "מחיר בקניון"; the column is always `coupon_price_ils`.

### 1.1 Split pair (`platform_percent` + `supplier_split_percent`)

- `platform_percent + supplier_split_percent = 100` (tolerance: rounded to 2 decimals).
- Form may send **one** half; the other is filled by arithmetic (`100 - x`). That is not an invented default: the admin supplied one real number.
- Form may send **both**; if they disagree, reject with a Hebrew error naming the current sum. Do not silently pick a winner.
- Applies to **both** `coupon` and `physical`.

### 1.2 `discount_percent`

| Type | Role |
|---|---|
| `physical` | Reduces on-site charge: `price_ils * (1 - discount_percent/100)`, rounded to 2 decimals once at unit level. |
| `coupon` | Display / badge only. Billed amount is always absolute `coupon_price_ils`. Form should keep the badge equal to the saving those two prices imply: `(1 - coupon_price_ils / price_ils) * 100`. |

### 1.3 `coupon_price_ils`

- Coupon only. Absolute shekels charged online.
- Rule: `0 < coupon_price_ils <= price_ils`.
- Balance at business (display / voucher): `price_ils - coupon_price_ils`. Never charged by the platform.
- Physical lines: column may be null; snapshot writes `null`.

### 1.4 On-site charge and split (preview + settlement)

```
coupon:    paidOnline = coupon_price_ils
physical:  paidOnline = price_ils * (1 - discount_percent/100)

platformKeeps = round_once(paidOnline * platform_percent / 100)
supplierGets  = paidOnline - platformKeeps
```

Admin form must show a live preview of: paid online, balance at business (coupon), platform keeps, supplier gets, effective discount badge.

---

## 2. Required supplier fields (publish gate)

`supplier_id` is mandatory for publish. The linked `suppliers` row must also expose all four identity details, and must be `status = 'active'`.

| Field | Source | Publish rule | Snapshot column on `order_items` |
|---|---|---|---|
| `supplier_id` | `products.supplier_id` | Required UUID | FK / id on the line (not duplicated as text) |
| name | `suppliers.name` | Non-empty trim | `supplier_name` |
| phone | `suppliers` contact phone | Non-empty trim | `supplier_phone` |
| address | `suppliers.address` | Non-empty trim | `supplier_address` |
| logo | `suppliers.logo_url` | Non-empty trim | `supplier_logo_url` |
| status | `suppliers.status` | Must be `active` | (not snapshotted; gate only) |

These identity fields are **not** `NOT NULL` in Postgres on purpose: legacy supplier rows are incomplete. Enforcement is application-side on publish so a migration does not unpublish the catalog.

Hebrew blocker messages (exact):

- `supplier_id`: חייב לשייך ספק למוצר
- `supplier_name`: חסר שם העסק של הספק
- `supplier_phone`: חסר טלפון של הספק
- `supplier_address`: חסר כתובת של הספק
- `supplier_logo_url`: חסר לוגו של הספק
- `supplier_status`: הספק אינו פעיל ולכן המוצר לא יכול להתפרסם

PDP and voucher surfaces read supplier identity for display; after purchase they must prefer the `order_items` snapshot (or voucher copy), not a live join that can rename the business under a past order.

---

## 3. Snapshot to `order_items`

Built at checkout via `buildOrderItemSnapshot`. Every field is a **copied value**. Nothing may be re-read from `products` or `suppliers` for money or identity after insert.

### 3.1 Columns written

| `order_items` column | Source at purchase |
|---|---|
| `platform_percent` | Billed percent from settlement (`platformPercentBps / 100`), must match the product pair |
| `supplier_split_percent` | Completing the pair to 100 (agreement snapshot) |
| `discount_percent` | Normalized product discount, or null if missing at snapshot time |
| `coupon_price_ils` | Coupon: normalized absolute unit price. Physical: `null` |
| `supplier_name` | Trimmed supplier name at purchase |
| `supplier_phone` | Trimmed supplier phone at purchase |
| `supplier_address` | Trimmed supplier address at purchase |
| `supplier_logo_url` | Trimmed supplier logo URL at purchase |

Related money amounts on the same row (settlement output, not the four knobs themselves): `face_value_agorot`, `paid_on_site_agorot`, `commission_agorot`, `supplier_immediate_agorot` / `supplier_payout_ils`, `balance_due_agorot`. Escrow columns stay 0 (no escrow).

### 3.2 Immutability rules

1. Editing `products.platform_percent` after sale must not change historical `order_items`.
2. Renaming a supplier must not rewrite `order_items.supplier_name` (or phone / address / logo).
3. A product without a complete split pair **must not** reach purchase. Snapshot throws rather than inventing `100/0`.
4. DB CHECKs: `order_items_split_pair_sums_to_100`, `order_items_discount_percent_range` (may stay `NOT VALID` for pre-070 rows; new inserts are checked).

### 3.3 Why supplier text is duplicated

`supplier_id` alone is not enough for audit / customer / dispute views: the business name and contact as they stood at purchase must survive rename, suspend, or logo change. Join for live catalog pages; read snapshot for past orders.

---

## 4. Validation rules

### 4.1 Normalize helpers

| Helper | Accepts | Rejects (returns null) |
|---|---|---|
| `normalizePercent` | Finite number in `[0, 100]`, rounded to 2 decimals | `null`, `undefined`, `''`, NaN, out of range |
| `normalizeIls` | Finite number `> 0`, rounded to 2 decimals | Missing, non-positive, non-finite |

### 4.2 Draft save vs publish

| Action | Rule |
|---|---|
| Save as `draft` | May leave money / supplier incomplete (DB allows nulls). Prefer surfacing soft warnings in UI. |
| Move to live / publish (`active` / equivalent live status) | Must pass `assertPublishable` with **zero** blockers. |

### 4.3 Publish gate checklist (`assertPublishable`)

Collect all failures:

1. `price_ils` (or equivalent list/face price): positive ILS required. Message: חייב להגדיר מחיר רגיל חיובי
2. Split pair: at least one of `platform_percent` / `supplier_split_percent`; if both, sum to 100. Message if both missing: חייב להגדיר עמלת פלטפורמה או אחוז לספק. אין ברירת מחדל.
3. `discount_percent`: required in 0..100. Message: חייב להגדיר אחוז הנחה בין 0 ל-100
4. If `type = coupon`:
   - `coupon_price_ils` required positive. Message: חייב להגדיר מחיר קופון לתשלום באתר. אין ברירת מחדל.
   - `coupon_price_ils <= price_ils`. Message: מחיר הקופון לא יכול לעלות על המחיר הרגיל
   - `coupon_expiry_days`: positive integer. Message: חייב להגדיר תוקף קופון בימים
5. Supplier identity + active status (section 2)

### 4.4 DB constraints (products)

| Constraint | Rule |
|---|---|
| `products_platform_percent_range` (or equivalent) | null or 0..100 |
| `products_supplier_split_percent_range` | null or 0..100 |
| `products_discount_percent_range` | null or 0..100 |
| `products_split_pair_sums_to_100` | null halves allowed; if both set, sum = 100 |
| `products_coupon_price_within_price` | null or (`> 0` and `<= price_ils`) |

App gate is stricter than DB for publish: live products must have both halves and discount set. Index `products_needs_pricing_idx` supports the admin list filter for incomplete pricing.

### 4.5 Form UX rules

- RTL Hebrew labels and error text.
- Money inputs: ILS, 2 decimals, never agorot in the UI.
- Split inputs: either linked (editing one updates the complement) or dual with immediate sum validation.
- Coupon: show computed balance at business as read-only.
- Coupon badge percent: prefer derived from prices; do not let a typed badge disagree with `coupon_price_ils` / `price_ils`.
- Highlight every field named in `PublishBlocker.field` when publish fails.
- Prefill from `suppliers.default_split_percent` / `commission_percent` is **suggestion only** for new products. Never read those columns at checkout or settlement.

---

## 5. Admin UI field map (labels)

| Hebrew label (admin) | Column |
|---|---|
| מחיר רגיל | `price_ils` (or catalog equivalent `kenyon_price` / face) |
| אחוז הנחה | `discount_percent` |
| עמלת פלטפורמה (%) | `platform_percent` |
| אחוז לספק (%) | `supplier_split_percent` |
| מחיר קופון / לתשלום באתר | `coupon_price_ils` |
| יתרה בבית העסק | computed, display only |
| ספק | `supplier_id` (+ linked name / phone / address / logo) |
| תוקף קופון (ימים) | `coupon_expiry_days` |

---

## 6. Acceptance checklist

- [ ] Cannot publish physical without split pair + `discount_percent` + complete active supplier
- [ ] Cannot publish coupon without the above plus `coupon_price_ils` and `coupon_expiry_days`
- [ ] Empty percent fields do not become `0`
- [ ] Dual percents that do not sum to 100 are rejected with the actual sum in the message
- [ ] Coupon preview: online charge = `coupon_price_ils`; split applies to that prepayment
- [ ] Physical preview: online charge uses discount; split applies to discounted amount
- [ ] Checkout writes all four money knobs (coupon price null on physical) + four supplier identity strings onto `order_items`
- [ ] Changing product percents after purchase leaves prior `order_items` unchanged
- [ ] Renaming supplier leaves prior `order_items.supplier_name` unchanged
- [ ] No code path re-reads `products.*` money knobs to settle or display a past order line

---

## 7. Related docs

- `ADMIN-ARCHITECTURE.md`: roles, routes, approval flow (money section 0 superseded here for the four knobs)
- `SUPPLIER-PORTAL-ARCHITECTURE.md`: redeem / payout after the snapshot exists
- Migration: `070_product_dynamic_split.sql`
- Pure module: `src/lib/commerce/product-money.ts`
