# ADMIN-PRODUCT-PAGE-SPEC.md

<!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Partly stale 2026-09-01. See `docs/ARCHITECTURE-OVERVIEW.md` §0 and §3.**
>
> The coupon price field is an **absolute shekel amount**
> (`products.coupon_price_ils`), not a percentage, and it has no default. A
> product saved without it cannot be sold, only described. `platform_percent` is
> separately mandatory on both product types.
>
> Escrow is not a product setting; it does not exist.

מפרט דף המוצר באדמין: ארבעת שדות הכסף הדינמיים, שדות ספק חובה, snapshot ל-
`order_items`, וכללי validation.

Status: BINDING for `arch/admin-supplier` (עודכן 2026-07-29)
Scope: docs only in `ke-arch`. Implementation references (do not edit from this worktree): `src/lib/commerce/product-money.ts`, migration `070_product_dynamic_split.sql`, checkout insert into `order_items`.
Hierarchy: `docs/CONTRADICTIONS.md` wins. Binding money model is **28.07** (C11 version א): coupon prepayment stays entirely with the platform; physical splits immediately by `platform_percent`.

Money: agorot integers internally; ILS with 2 decimals on the wire (`*_ils`). Percents: `numeric(5,2)`, range 0..100.

---

## 0. Non-negotiables

1. There is **no fixed commission** and **no database DEFAULT** on any of the four money knobs (C1).
2. A missing value stays missing. Never coerce empty form input to `0` (a silent 0 means "the supplier gets nothing").
3. Platform fee is rounded **once**, on the on-site base. For physical lines, supplier share is the residual `base - platformFee`. Never multiply `supplier_split_percent` a second time for money.
4. At purchase, money knobs and supplier identity are **copied by value** onto `order_items` (C10). Later edits to `products` or `suppliers` must not move past rows.
5. Publish reports **every** failing reason in one response, not only the first.
6. Coupon settlement (28.07): the entire on-site prepayment is `platform_settled`. Supplier gets **0 from the platform** on coupons; their income is the till balance collected at scan. Setting `platform_percent = 100` / `supplier_split_percent = 0` on a coupon is the expected live pair, not a hidden constant in code.

---

## 1. The four dynamic money fields

Stored on `products`. Edited on `/admin/products` (create + edit). Required before a product may go live.

| DB column | Wire / form name | Meaning | Type |
|---|---|---|---|
| `platform_percent` | `platform_percent` | Platform share of what the customer pays **on site** | percent 0..100, no default |
| `supplier_split_percent` | `supplier_split_percent` | Supplier share of the same base (agreement / reporting snapshot) | percent 0..100, no default |
| `discount_percent` | `discount_percent` | Saving off sticker `price_ils`, shown to the customer | percent 0..100, no default |
| `coupon_price_ils` | `coupon_price` / `coupon_price_ils` | Absolute ILS charged on site for a **coupon** (C4) | `numeric(12,2)`, no default |

UI labels (Hebrew; match storefront where applicable):

| Label | Field |
|---|---|
| מחיר רגיל | `price_ils` (sticker / face; not one of the four knobs, but required) |
| עמלת פלטפורמה | `platform_percent` |
| אחוז לספק | `supplier_split_percent` |
| אחוז הנחה | `discount_percent` |
| מחיר בקניון / לתשלום באתר | `coupon_price_ils` (coupon only) |
| יתרה בבית העסק | computed `price_ils - coupon_price_ils` (display only; cash at scan) |

### 1.1 Split pair (`platform_percent` + `supplier_split_percent`)

- Both columns are stored (not "derive and discard").
- Must sum to exactly **100** (`SPLIT_TOTAL`).
- DB CHECK: `products_split_pair_sums_to_100`.
- Form behavior (`completeSplitPair`):
  - Only platform sent → supplier = `100 - platform`.
  - Only supplier sent → platform = `100 - supplier`.
  - Both sent and sum ≠ 100 → reject (do not pick a winner).
  - Neither sent → reject: "חייב להגדיר עמלת פלטפורמה או אחוז לספק. אין ברירת מחדל."
- Applies to **both** `coupon` and `physical` as stored fields.
- **Settlement meaning differs by type** (section 1.4). The pair is always snapshotted; coupon money does not pay the supplier from the platform under 28.07 even if the pair is not 100/0 (admin should set 100/0 on coupons; checkout must not invent a payout).

### 1.2 `discount_percent`

| Product type | Role |
|---|---|
| `physical` | Reduces on-site charge: `price_ils * (1 - discount_percent/100)`. |
| `coupon` | Display badge only. Billed amount is always absolute `coupon_price_ils`. Form must keep the badge equal to `deriveDiscountPercent(price_ils, coupon_price_ils)` so the page cannot quote a discount checkout will not honour. |

Required on publish for both types (range 0..100 inclusive after normalize).

### 1.3 `coupon_price_ils` (form: `coupon_price`)

- Coupon only. Absolute shekel amount the customer pays online (C4).
- Rule: `0 < coupon_price_ils <= price_ils`.
- No default. Missing → publish blocked.
- Physical lines: leave NULL (do not invent 0).
- DB CHECK: `products_coupon_price_within_price`.
- Never derive billed amount from `discount_percent` (that is how quote and charge came apart before).

### 1.4 On-site charge and settlement (preview)

```
coupon:
  paidOnline          = coupon_price_ils
  balanceAtBusiness   = price_ils - coupon_price_ils   (cash at scan, never through us)
  platformKeeps       = paidOnline                     (28.07: entire prepayment)
  supplierFromPlatform = 0

physical:
  paidOnline          = price_ils * (1 - discount_percent/100)
  balanceAtBusiness   = 0
  base                = paidOnline (agorot, rounded once)
  platformFee         = percentageOf(base, platform_percent)
  supplierImmediate   = base - platformFee
```

Admin form must show a live preview of: paid online, balance at business (coupon), platform keeps, supplier from platform (0 on coupon; residual on physical), effective discount percent.

`suppliers.commission_percent` / `default_split_percent` (if present) are **prefills only**. Never read at checkout or settlement.

---

## 2. Required supplier fields (publish gate)

Every live product must name an **active** supplier with full identity (business rule: every PDP shows supplier details). Enforced in application on publish (not as blanket `NOT NULL` on every historical `suppliers` row), so incomplete legacy suppliers do not break migrations.

| Requirement | Field key (blocker) | Source |
|---|---|---|
| Linked supplier | `supplier_id` | `products.supplier_id` |
| Business name | `supplier_name` | `suppliers.name` |
| Phone | `supplier_phone` | `suppliers.contact_phone` (or equivalent contact phone column) |
| Address | `supplier_address` | `suppliers.address` |
| City / area (PDP geo) | `supplier_city` / location fields | `suppliers.city` (and area if used) |
| Logo | `supplier_logo_url` | `suppliers.logo_url` |
| Active status | `supplier_status` | `suppliers.status === 'active'` |

Hebrew blocker messages (exact):

| Field | Message |
|---|---|
| `supplier_id` | חייב לשייך ספק למוצר |
| `supplier_name` | חסר שם העסק של הספק |
| `supplier_phone` | חסר טלפון של הספק |
| `supplier_address` | חסר כתובת של הספק |
| `supplier_city` | חסרה עיר של הספק |
| `supplier_logo_url` | חסר לוגו של הספק |
| `supplier_status` | הספק אינו פעיל ולכן המוצר לא יכול להתפרסם |

Storefront PDP reads live supplier identity for the public page. Order history and admin order detail must prefer the **snapshotted** identity on `order_items` (section 3).

---

## 3. Snapshot onto `order_items` at purchase

Written once at checkout (`buildOrderItemSnapshot` + settlement billed percent). Immutable thereafter (C10).

### 3.1 Columns copied by value

| `order_items` column | Source at purchase | Notes |
|---|---|---|
| `platform_percent` | Settlement billed percent (`platformPercentBps / 100`), else completed product pair | Prefer billed arithmetic so snapshot cannot drift by a rounding step |
| `supplier_split_percent` | `products.supplier_split_percent` (via completed pair) | Agreement / reporting share; must still sum to 100 with platform |
| `discount_percent` | `products.discount_percent` | Normalized 0..100; should not reach purchase if missing |
| `coupon_price_ils` | `products.coupon_price_ils` | Per unit; **NULL on physical** |
| `supplier_id` | Product supplier at purchase | FK identity |
| `supplier_name` | Supplier name at purchase | Trimmed; null if empty |
| `supplier_phone` | Supplier phone at purchase | Trimmed; null if empty |
| `supplier_address` | Supplier address at purchase | Trimmed; null if empty |
| `supplier_logo_url` | Supplier logo URL at purchase | Trimmed; null if empty |

Related settlement money columns (not the four knobs themselves) stay as today: `supplier_payout_ils`, `face_value_agorot`, `paid_on_site_agorot`, `commission_agorot`, `balance_due_agorot`, `settlement_status`, etc.

Coupon lines under 28.07: `supplier_payout_ils` / supplier due from platform = **0**. Do not write `escrow_holds`.

> <!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Corrected 2026-09-01.** This line previously said
> `settlement_status = platform_settled` at payment. The code writes
> **`split_executed`**, for both coupon and physical lines:
> `pending -> paid -> split_executed`, a coupon simply splitting 100/0.
> `SettlementState` in `src/server/domain/orders/state-machine.ts` does not
> admit `platform_settled` as a writable value at all; it survives only in the
> redemption **read** path (`REDEEMABLE_SETTLEMENT_STATUSES`), which has to keep
> recognising rows written before the rule changed.

### 3.2 Semantics

- A line bought at 70/30 keeps reading 70/30 after the product moves to 85/15.
- An order keeps naming the business it was bought from after that business is renamed.
- Refusing to snapshot beats inventing 100/0. A line that reaches purchase without a split pair is an upstream bug; do not paper it over.
- DB CHECKs on `order_items`: `order_items_split_pair_sums_to_100`, `order_items_discount_percent_range` (may stay `NOT VALID` for pre-070 rows; new lines are checked).

### 3.3 What must never happen

- Re-read `products.platform_percent` (or any of the four knobs) when rendering a past order.
- Join live `suppliers` for historical name/phone/address/logo when snapshot columns are present.
- Hardcode a silent default percent on insert.
- On coupon: invent a platform→supplier transfer from the prepayment (28.07 forbids it).

---

## 4. Validation rules

Canonical pure functions (implementation reference): `normalizePercent`, `normalizeIls`, `completeSplitPair`, `assertPublishable`, `buildOrderItemSnapshot`, `previewProductMoney`, `deriveDiscountPercent` in `src/lib/commerce/product-money.ts`. Admin server action and checkout must call these; do not re-implement in the form or in SQL triggers beyond the CHECKs below.

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
| `type = coupon` | discount sync | Displayed `discount_percent` must match `deriveDiscountPercent(price_ils, coupon_price_ils)` |
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
3. Coupon only: `coupon_price_ils`, `coupon_expiry_days`, redemption copy. When price or coupon price changes, sync displayed `discount_percent` from `deriveDiscountPercent`. Prefer defaulting the split UI to 100/0 for new coupons (editable, not hardcoded in settlement).
4. Physical only: stock / shipping as elsewhere; on-site charge preview uses discounted price; split preview shows platform fee + supplier immediate.
5. Live money preview under the knobs (section 1.4), including explicit "ספק מהפלטפורמה: ₪0" on coupons.
6. Publish / activate: call `assertPublishable`; highlight every failing field; Hebrew messages as listed.
7. RTL Hebrew shell; money always ₪ with 2 decimals; never show agorot in the UI.

---

## 6. Acceptance checklist

- [ ] Cannot publish coupon without `coupon_price_ils`, split pair, `discount_percent`, `coupon_expiry_days`, and complete active supplier.
- [ ] Cannot publish physical without split pair, `discount_percent`, and complete active supplier.
- [ ] Sending only one half of the split fills the other; sending both that disagree is rejected.
- [ ] Empty percent / price fields stay null (never become 0).
- [ ] Coupon on-site charge equals `coupon_price_ils`; physical equals discounted `price_ils`.
- [ ] Coupon: platform keeps entire prepayment; supplier from platform is 0.
- [ ] Physical: supplier due on a line equals `paidOnSite - platformFee` (residual).
- [ ] After purchase, changing product percents or supplier name does not change that `order_items` row.
- [ ] `order_items` stores all four knobs (coupon price null on physical) plus supplier identity snapshot.
- [ ] Admin incomplete filter can find products missing platform, supplier split, or discount.

---

## 7. Related docs

| Doc | Role |
|---|---|
| `docs/CONTRADICTIONS.md` | Binding business rulings (28.07 wins for coupon settlement). |
| `ADMIN-ARCHITECTURE.md` / `docs/ARCHITECTURE-ADMIN.md` | Broader admin dashboard. |
| `docs/ARCHITECTURE-SUPPLIER-PORTAL.md` / `SUPPLIER-PORTAL-ARCHITECTURE.md` | Supplier scan; till balance still cash at business. |
| `docs/PRODUCT-PAGE-SPEC.md` | Full public PDP + admin form field map (broader than this money-focused spec). |
| Migration `070_product_dynamic_split.sql` | Schema + CHECKs + snapshot columns. |
| `src/lib/commerce/product-money.ts` | Pure implementation this spec describes. |
