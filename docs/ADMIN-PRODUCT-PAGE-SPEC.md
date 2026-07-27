# ADMIN-PRODUCT-PAGE-SPEC.md

KenyonExpress admin product page: money fields, supplier gate, and order_items snapshot.

Status: BINDING for `arch/admin-supplier` (2026-07-27)
Scope: docs only. Implementation lives in `src/lib/commerce/product-money.ts`, migration `070_product_dynamic_split.sql`, checkout insert into `order_items`.
Supersedes: the coupon-forced `platform_percent = 100` rule in `ADMIN-ARCHITECTURE.md` section 0. Coupons now use the same admin-chosen split pair as physical products. Setting 100/0 remains a valid choice, not a constant.

Money: agorot integers internally; ILS with 2 decimals on the wire (`*_ils`). Percents: `numeric(5,2)`, range 0..100.

---

## 0. Non-negotiables

1. There is **no fixed commission** and **no database default** on any of the four money knobs.
2. A missing value stays missing. Never coerce empty form input to `0` (a silent 0 means "the supplier gets nothing").
3. Platform fee is rounded **once**, on the on-site base. Supplier share is always the residual `base - platformFee`, never a second multiplication of `supplier_split_percent`.
4. At purchase, money and supplier identity are **copied by value** onto `order_items`. Later edits to `products` or `suppliers` must not move past rows.
5. Publish reports **every** failing reason in one response, not only the first.

---

## 1. The four dynamic money fields

Stored on `products`. Edited on `/admin/products` (create + edit). Required before a product may go live.

| DB column | Wire / form name | Meaning | Type |
|---|---|---|---|
| `platform_percent` | `platform_percent` | Platform share of what the customer pays **on site** | percent 0..100, no default |
| `supplier_split_percent` | `supplier_split_percent` | Supplier share of the same base (agreement snapshot) | percent 0..100, no default |
| `discount_percent` | `discount_percent` | Saving off sticker `price_ils`, shown to the customer | percent 0..100, no default |
| `coupon_price_ils` | `coupon_price` / `coupon_price_ils` | Absolute ILS charged on site for a **coupon** | `numeric(12,2)`, no default |

UI labels (Hebrew, match storefront language):

| Label | Field |
|---|---|
| מחיר רגיל | `price_ils` (sticker / face; not one of the four knobs, but required) |
| עמלת פלטפורמה | `platform_percent` |
| אחוז לספק | `supplier_split_percent` |
| אחוז הנחה | `discount_percent` |
| מחיר בקניון / לתשלום באתר | `coupon_price_ils` (coupon only) |
| יתרה בבית העסק | computed `price_ils - coupon_price_ils` (display only) |

### 1.1 Split pair (`platform_percent` + `supplier_split_percent`)

- Must sum to exactly **100** (`SPLIT_TOTAL`).
- DB CHECK: `products_split_pair_sums_to_100`.
- Form behavior (`completeSplitPair`):
  - Only platform sent → supplier = `100 - platform`.
  - Only supplier sent → platform = `100 - supplier`.
  - Both sent and sum ≠ 100 → reject (do not pick a winner).
  - Neither sent → reject: "חייב להגדיר עמלת פלטפורמה או אחוז לספק. אין ברירת מחדל."
- Applies to **both** `coupon` and `physical`. Same knob, same arithmetic.

### 1.2 `discount_percent`

| Product type | Role |
|---|---|
| `physical` | Reduces on-site charge: `price_ils * (1 - discount_percent/100)`. |
| `coupon` | Display badge only. Billed amount is always absolute `coupon_price_ils`. Form must keep the badge equal to `deriveDiscountPercent(price_ils, coupon_price_ils)` so the page cannot quote a discount checkout will not honour. |

Required on publish for both types (range 0..100 inclusive after normalize).

### 1.3 `coupon_price_ils` (form: `coupon_price`)

- Coupon only. Absolute shekel amount the customer pays online.
- Rule: `0 < coupon_price_ils <= price_ils`.
- No default. Missing → publish blocked.
- Physical lines: leave NULL (do not invent 0).
- DB CHECK: `products_coupon_price_within_price`.

### 1.4 On-site charge and split (preview + settlement)

```
coupon:   paidOnline = coupon_price_ils
          balanceAtBusiness = price_ils - coupon_price_ils   (cash at scan, never through us)
physical: paidOnline = price_ils * (1 - discount_percent/100)
          balanceAtBusiness = 0

base        = paidOnline (in agorot, rounded once)
platformFee = percentageOf(base, platform_percent)
supplierDue = base - platformFee
```

Admin form must show a live preview of: paid online, balance at business (coupon), platform keeps, supplier gets, effective discount percent.

`suppliers.commission_percent` / `default_split_percent` (if present) are **prefills only**. Never read at checkout or settlement.

---

## 2. Required supplier fields (publish gate)

Every live product must name an **active** supplier with full identity. Enforced in application on publish (not as `NOT NULL` on `suppliers`), so legacy incomplete supplier rows do not break migrations or silently unpublish the catalog.

| Requirement | Field key (blocker) | Source |
|---|---|---|
| Linked supplier | `supplier_id` | `products.supplier_id` |
| Business name | `supplier_name` | `suppliers.name` |
| Phone | `supplier_phone` | `suppliers.contact_phone` (or equivalent contact phone column) |
| Address | `supplier_address` | `suppliers.address` |
| Logo | `supplier_logo_url` | `suppliers.logo_url` |
| Active status | `supplier_status` | `suppliers.status === 'active'` |

Hebrew blocker messages (exact):

| Field | Message |
|---|---|
| `supplier_id` | חייב לשייך ספק למוצר |
| `supplier_name` | חסר שם העסק של הספק |
| `supplier_phone` | חסר טלפון של הספק |
| `supplier_address` | חסר כתובת של הספק |
| `supplier_logo_url` | חסר לוגו של הספק |
| `supplier_status` | הספק אינו פעיל ולכן המוצר לא יכול להתפרסם |

Storefront PDP shows supplier identity / location from the live supplier row. Order history and admin order detail must prefer the **snapshotted** identity on `order_items` (section 3).

---

## 3. Snapshot onto `order_items` at purchase

Written once at checkout (`buildOrderItemSnapshot` + settlement billed percent). Immutable thereafter.

### 3.1 Columns copied by value

| `order_items` column | Source at purchase | Notes |
|---|---|---|
| `platform_percent` | Settlement billed percent (`platformPercentBps / 100`) | Prefer billed arithmetic over raw product so snapshot cannot drift by a rounding step |
| `supplier_split_percent` | `products.supplier_split_percent` (via completed pair) | Agreement share for reporting; money paid is residual |
| `discount_percent` | `products.discount_percent` | Normalized 0..100 or null if missing (should not reach purchase) |
| `coupon_price_ils` | `products.coupon_price_ils` | Per unit; **NULL on physical** |
| `supplier_name` | Supplier name at purchase | Trimmed; null if empty |
| `supplier_phone` | Supplier phone at purchase | Trimmed; null if empty |
| `supplier_address` | Supplier address at purchase | Trimmed; null if empty |
| `supplier_logo_url` | Supplier logo URL at purchase | Trimmed; null if empty |

Also related (settlement money, not the four knobs themselves): `supplier_id`, `supplier_payout_ils`, `face_value_agorot`, `paid_on_site_agorot`, `commission_agorot`, `balance_due_agorot`, etc. Those remain as today; this spec binds the money-knob + identity snapshot.

### 3.2 Semantics

- A line bought at 70/30 keeps reading 70/30 after the product moves to 85/15.
- An order keeps naming the business it was bought from after that business is renamed.
- Refusing to snapshot beats inventing 100/0. A line that reaches purchase without a split pair is an upstream bug; do not paper it over.
- DB CHECKs on `order_items`: `order_items_split_pair_sums_to_100`, `order_items_discount_percent_range` (may stay `NOT VALID` for pre-070 rows; new lines are checked).

### 3.3 What must never happen

- Re-read `products.platform_percent` (or any of the four knobs) when rendering a past order.
- Join live `suppliers` for historical display of name/phone/address/logo when snapshot columns are present.
- Hardcode coupon `platform_percent = 100` on insert (pre-070 behavior; removed).

---

## 4. Validation rules

Canonical pure functions: `normalizePercent`, `normalizeIls`, `completeSplitPair`, `assertPublishable`, `buildOrderItemSnapshot`, `previewProductMoney` in `src/lib/commerce/product-money.ts`. Admin server action and checkout must call these; do not re-implement in the form or in SQL triggers beyond the CHECKs below.

### 4.1 Normalize

| Helper | Accepts | Rejects → null |
|---|---|---|
| `normalizePercent` | finite number in [0, 100], rounded to 2 decimals | empty string, null, undefined, NaN, out of range |
| `normalizeIls` | finite number **> 0**, rounded to 2 decimals | empty, null, ≤ 0, non-finite |

### 4.2 Publish gate (`assertPublishable`)

Runs before status may leave `draft` / before live statuses (`active`, `paused`, or equivalent published set). Collects **all** blockers.

| When | Field | Rule / message |
|---|---|---|
| Always | `price_ils` | Positive required. "חייב להגדיר מחיר רגיל חיובי" |
| Always | split pair | Via `completeSplitPair` (section 1.1) |
| Always | `discount_percent` | Normalize must succeed. "חייב להגדיר אחוז הנחה בין 0 ל-100" |
| `type = coupon` | `coupon_price_ils` | Required positive. "חייב להגדיר מחיר קופון לתשלום באתר. אין ברירת מחדל." |
| `type = coupon` | `coupon_price_ils` | Must be ≤ `price_ils`. "מחיר הקופון לא יכול לעלות על המחיר הרגיל" |
| `type = coupon` | `coupon_expiry_days` | Positive integer. "חייב להגדיר תוקף קופון בימים" |
| Always | supplier block | Section 2 |

Draft save may persist incomplete money fields. Publish / go-live must not.

### 4.3 Database CHECKs (migration 070 + 054)

| Constraint | Table | Rule |
|---|---|---|
| `products_split_pair_sums_to_100` | `products` | nulls allowed OR sum = 100 |
| `products_supplier_split_percent_range` | `products` | null OR 0..100 |
| `products_discount_percent_range` | `products` | null OR 0..100 |
| `products_coupon_price_within_price` | `products` | null OR (`> 0` AND `<= price_ils`) |
| `order_items_split_pair_sums_to_100` | `order_items` | nulls allowed OR sum = 100 |
| `order_items_discount_percent_range` | `order_items` | null OR 0..100 |

Index helper for admin incomplete pricing: `products_needs_pricing_idx` (live rows missing platform, supplier split, or discount).

### 4.4 Checkout refusal

If a cart line resolves a product without a usable split pair or (for coupon) without `coupon_price_ils`, checkout fails. Do not substitute defaults.

---

## 5. Admin UI requirements (product page)

Route: `/admin/products/new` and `/admin/products/[id]`.

1. Type discriminator: `coupon` | `physical` (controls which fields show).
2. Always show: `price_ils`, split pair (both halves or one + live complement), `discount_percent`, supplier picker.
3. Coupon only: `coupon_price_ils`, `coupon_expiry_days`, redemption copy. On coupon, when price or coupon price changes, sync displayed `discount_percent` from `deriveDiscountPercent`.
4. Physical only: stock / shipping as elsewhere; on-site charge preview uses discounted price.
5. Live money preview under the knobs (section 1.4).
6. Publish / activate: call `assertPublishable`; highlight every failing field; Hebrew messages as listed.
7. RTL Hebrew shell; money always ₪ with 2 decimals; never show agorot in the UI.

---

## 6. Acceptance checklist

- [ ] Cannot publish coupon without `coupon_price_ils`, split pair, `discount_percent`, `coupon_expiry_days`, and complete active supplier.
- [ ] Cannot publish physical without split pair, `discount_percent`, and complete active supplier.
- [ ] Sending only one half of the split fills the other; sending both that disagree is rejected.
- [ ] Empty percent / price fields stay null (never become 0).
- [ ] Coupon on-site charge equals `coupon_price_ils`; physical equals discounted `price_ils`.
- [ ] Supplier due on a line equals `paidOnSite - platformFee` (residual).
- [ ] After purchase, changing product percents or supplier name does not change that `order_items` row.
- [ ] Coupon lines may store any valid split (including 100/0); nothing hardcodes 100 on insert.
- [ ] Admin incomplete filter can find products missing platform, supplier split, or discount.

---

## 7. Related docs

| Doc | Role |
|---|---|
| `ADMIN-ARCHITECTURE.md` | Broader admin dashboard. Section 0 coupon-forced-100 is superseded by this file for money knobs. |
| `SUPPLIER-PORTAL-ARCHITECTURE.md` | Supplier portal / redeem. Balance at business still cash; platform/supplier split of the online charge follows this spec. |
| Migration `070_product_dynamic_split.sql` | Schema + CHECKs + snapshot columns. |
| `src/lib/commerce/product-money.ts` | Pure implementation this spec describes. |
