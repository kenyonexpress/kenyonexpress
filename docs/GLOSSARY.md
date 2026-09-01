# Glossary

Every domain term, Hebrew and English, with the exact meaning it carries in
this system.

The point of this file is that several of these words mean something narrower
here than they do in general commerce vocabulary, and two of them mean the
opposite of what a reader would assume.

---

## 1. Money

| English | עברית | Meaning here |
|---|---|---|
| **Agora / agorot** | אגורה / אגורות | 1/100 of a shekel. **The only unit money is ever stored or calculated in.** Always an integer. |
| **Shekel, ILS** | שקל, ש״ח | ₪. Displayed to users; never used for arithmetic. |
| **Basis point (bp)** | נקודת בסיס | 1/100 of a percent. 10% = `1000`, 100% = `10000`. All rates are integer bp. |
| **Face value** | שווי מלא / שווי הדיל | `face_value_agorot`. What the deal is worth at the business. |
| **Coupon price** | מחיר הקופון | `coupon_price_ils`. **An absolute shekel amount set by an admin, never a percentage.** What the customer pays on the site. |
| **Balance due** | יתרה לתשלום בעסק | `balance_due_agorot` / `remaining_amount_due_agorot`. Collected **in cash at the counter** and never touches the platform. |
| **Platform percent** | אחוז פלטפורמה | `platform_percent`. Per product, mandatory, no default, snapshotted onto `order_items` at purchase. A whole-percent `numeric`. |
| **Commission** | עמלה | `commission_agorot`. What the platform keeps. On a coupon this is the whole prepayment. |
| **Supplier due** | לתשלום לספק | What the platform owes the supplier. **On the coupon path this is always zero.** |
| **Cashback** | קאשבק | Credit earned toward the wallet. **Snapshotted at purchase, credited later**, not at once. |
| **Wallet** | ארנק | Store credit. A **payment source only**: it reduces the card charge and never alters settlement, commission or the cashback snapshot. |
| **Settlement** | הסדרה / התחשבנות | Recording who ended up with which part of a payment. Not a transfer of funds to anyone. |
| **VAT** | מע״מ | 18%, `VAT_RATE_BP = 1800`. Extracted from a VAT-inclusive gross by subtraction so `net + vat = gross` exactly. The platform books VAT **only on its own commission**. |

### Two words that do not mean what you expect

**Escrow / נאמנות.** In this system, **there is no escrow.** No third-party
agent, no J5, no card hold, and no internal hold either. The `escrow_holds`
table exists with 2 legacy rows and no writer, and `escrow_held` /
`escrow_released` are dead `settlement_status` labels that nothing can write.
Any document describing money held for a supplier and released on redemption is
describing the model abandoned on 2026-07-24.

**Payout / תשלום לספק.** There is no payout system. No `supplier_payouts`
table exists or ever has in this lineage. On the coupon model the platform owes
the supplier nothing, so there is nothing to pay out. The `payout_status` and
`payout_line_type` enums survive with no tables behind them.

---

## 2. Products and the catalogue

| English | עברית | Meaning here |
|---|---|---|
| **Deal** | דיל | Informal, for a coupon product as the customer sees it. |
| **Coupon** | קופון | `product_type = 'coupon'`. Prepay a small amount online, pay the balance at the business. |
| **Physical** | מוצר פיזי | `product_type = 'physical'`. Pay 100% online, shipped. Not yet live. |
| **Service** | שירות | `product_type = 'service'`. Schema support, settles like physical. |
| **Recurring** | מנוי / חיוב חוזר | `product_type = 'recurring'`. Backed by `subscriptions` and `subscription_charges`. |
| **Voucher** | שובר / ואוצ׳ר | `vouchers`. **The thing the customer actually buys.** One per purchased unit. |
| **Coupon code** | קוד קופון | Ambiguous, avoid. May mean a voucher's 10-character short code, a `coupon_codes` row (the pre-voucher model), or a `discount_campaigns` promo code. |
| **Supplier** | ספק / בית עסק | `suppliers`. The business that honours the voucher. |
| **Vendor** | ספק (ישן) | `vendors`. **Legacy.** Still populated and referenced by `coupon_deals`, but `products` and `order_items` scope to `suppliers`. |
| **Branch** | סניף | `supplier_branches`. One supplier, many physical locations. |
| **Kenyon price** | מחיר קניון | `kenyon_price`. The site's price, against `compare_at_price`. |

---

## 3. Orders and state

| English | עברית | Meaning here |
|---|---|---|
| **Order** | הזמנה | `orders`. One checkout. |
| **Order item / line** | שורת הזמנה | `order_items`. **The money row.** 42 columns, carrying the full snapshot. |
| **Snapshot** | צילום מצב | Values copied onto `order_items` at purchase so settlement never reads a live product. Immutable thereafter. |
| **Settlement status** | סטטוס הסדרה | `order_items.settlement_status`. Where the money on this line stands. |
| **Split** | פיצול | Dividing a charge between platform and supplier. A coupon splits 100/0. |
| **`split_executed`** | פוצל | The terminal happy state of a line. Both product types reach it: `pending -> paid -> split_executed`. |
| **`platform_settled`** | הוסדר לפלטפורמה | A live enum value on `orders.status`, `payments.status` and `settlement_status`. **Not writable** by `SettlementState`; survives in the redemption read path for rows written before the rule changed. |
| **Redemption** | מימוש | The scan at the counter. Moves a voucher `issued -> redeemed`. |
| **Finalize** | סגירת הזמנה | `finalizeOrder`. **The only writer of the transition to `paid`.** Idempotent. |
| **Dead letter** | מכתב מת | A `payment_webhook_events` row with `verified_against_api = true AND processed_at IS NULL`: charged, confirmed with Cardcom, and finalize did not complete. |

---

## 4. Platform and security

| English | עברית | Meaning here |
|---|---|---|
| **RLS** | אבטחה ברמת השורה | Row Level Security. On for all 61 tables. **The only database-level defence on the money tables**, since the `authenticated` DML grant is still present. |
| **`SECURITY DEFINER`** | | A function running as its owner rather than its caller. 61 of 69 functions, all with a pinned `search_path`. |
| **Deny-all** | חסימה מלאה | RLS on with no permissive policy. Denies every client role. Nine tables, in two shapes. |
| **`anon` / `authenticated` / `service_role`** | | The three Postgres roles. `service_role` bypasses RLS and is server-side only. |
| **Supplier member** | חבר צוות ספק | A row in `supplier_members`. **This, not `profiles.role`, is what makes someone a supplier.** |
| **Staff PIN** | קוד עובד | `supplier_staff.pin_hash`. **Not a login.** The device is already authenticated; the PIN buys an answerable audit trail. |
| **Outbox** | תור יוצא | A table holding work to be done, written in the same transaction as the change that caused it. `notification_outbox`, `search_index_outbox`. |
| **DLQ** | תור מכתבים מתים | Dead letter queue. Where work goes after retries are exhausted. |
| **Idempotency key** | מפתח אידמפוטנטיות | Makes a retried request return the first answer rather than acting twice. |

---

## 5. Project vocabulary

| Term | Meaning |
|---|---|
| **The generation probe** | `src/lib/commerce/order-money-columns.ts`, which asks the database at runtime whether it has `ils` or `agorot` money columns. Production is the **`ils` generation**. |
| **Phantom table** | A table name used in documentation that does not exist in production. 31 of them. See `docs/SCHEMA-REALITY-CHECK.md`. |
| **The pixel gate** | Comparison against `refs/ke_live_singlefile.html`; must stay under **11%**. |
| **The four stop-and-ask situations** | A production push to Vercel; deleting a database or files; running a migration against production; a second code agent on the same repository. |
| **Pending migration** | A file in `migrations/pending/`. **The name is now a lie.** All 23 `.sql` files there are applied in production, several under other numbers. Nothing in that directory is outstanding, and `ls` on it is not evidence. See `docs/ARCHITECTURE-OVERVIEW.md` §8.1. |
| **The transition guards** | The three `BEFORE UPDATE` triggers migration 137 put on `orders`, `order_items` and `payments`. They refuse a status move that is not in their table and raise `23514` naming both ends. They are a **superset** of `state-machine.ts`, because they also govern rows written under rules that no longer apply. Tables in `docs/PAYMENT-FLOW.md` §2.1. |

---

## 6. Terms to avoid

| Do not say | Say instead | Why |
|---|---|---|
| Escrow, נאמנות | nothing; there is none | §1 |
| Payout, "release money to the supplier" | nothing on the coupon path | §1 |
| `cart_items` | `carts.items` (jsonb) | there is no such table |
| `coupon_redemptions`, `coupon_scan_events` | `voucher_redemptions` | renamed |
| `notifications_outbox` | `notification_outbox` | singular |
| `platform_bp` | `platform_percent` | `_bp` exists only on `discount_campaigns.percent_bp` |
| "middleware" | `src/proxy.ts` | Next 16 removed `middleware.ts` |
| Coupon "used" | voucher `redeemed` | `used` is `coupon_status`, the old enum |

The customer support playbook additionally forbids saying "escrow", "trustee",
"we will release money to the supplier" or "immediate refund" to a customer. A
card refund takes up to 14 business days after approval.
