# EMAIL-TEMPLATES-SPEC

All customer and operator mail is Hebrew, RTL, inline-styled. Builders live in
`src/lib/email/notifications.ts` and `src/lib/email/voucher-email.ts`. Transport
is Resend's REST API from `src/lib/email/resend.ts`. There are **no Resend
dashboard template IDs**. The identifier is the outbox `kind` plus an
idempotency key. A missing `RESEND_API_KEY` skips send and must not fail a
paid order.

HTML is `dir="rtl"` on the elements themselves (Outlook ignores a wrapper).
Brand yellow is `#fed700`. Ink `#1a1a1a`. Drain: `/api/cron/notifications`.

Password reset is **not** in this set: `resetPasswordForEmail` is Supabase Auth
mail. Supplier payout mail does **not** exist: there is no payout subsystem.
The closest supplier mail is `supplier_sale` (a sale happened, not a transfer).

---

## Resend identifier convention

| Piece | Rule |
|---|---|
| From | `EMAIL_FROM` or `KenyonExpress <noreply@kenyonexpress.co.il>` |
| Idempotency | `{kind}:{stable-id}` (welcome uses `welcome:{user id}`; Resend header plus outbox UNIQUE) |
| Dashboard template | none. Body is built in process |
| Locale | he-IL only |
| Preview text | first sentence of the text body, before the CTA URL |

Kinds the CHECK and the builder agree on:
`order_paid`, `supplier_sale`, `voucher_redeemed`, `voucher_issued`,
`voucher_gifted`, `voucher_expiring`, `cashback_credited`, `invoice_dead`,
`low_stock`, `reconciliation_gap`, `refund_completed`, `welcome`.

---

## 1. Order confirmation (`order_paid`)

One template for coupon and physical. The split is in the **next** mail
(`voucher_issued` only for coupon lines). Do not fork `order_paid` into two
HTML trees that can drift on total.

| Field | Value |
|---|---|
| Subject | `ההזמנה שלך התקבלה · {order_ref}` |
| Preview | greeting plus "ההזמנה התקבלה" |
| Body | greeting, order ref, item count, total paid on site (`formatAgorot`) |
| CTA | link to `/account/orders/{order_id}` |
| Variables | `order_id`, `order_ref`, `customer_name`, `total_agorot`, `item_count` |

Coupon variant (same mail): total is the online prepayment, never face value.
Physical variant: total is the full on-site charge. The body does not list
shipment tracking; that is a later notification if it exists.

---

## 2. Voucher delivery (`voucher_issued`)

| Field | Value |
|---|---|
| Subject | one: `הקופון שלך מוכן: {productName}`; many: `{n} קופונים מוכנים לך ב-KenyonExpress` |
| Preview | `הקופון שלך מוכן לשימוש.` |
| Body | per voucher: product, supplier, **code** (grouped), paid on site, still due at the business, expiry |
| CTA | `/coupon/{id}` per voucher ("הצגת הקופון") |
| Variables | `id`, `code`, `productName`, `supplierName`, `supplierAddress`, `supplierPhone`, `faceValueAgorot`, `couponPriceAgorot`, `remainingDueAgorot`, `expiresAt`, optional `invoiceNumber` |

**No QR image in the email.** Gmail and Outlook strip `data:` URIs. The code
always types. The QR lives on `/coupon/{id}`.

Both amounts, in this order: paid on the site, then remaining at the business.
An email that only says "שילמת ₪22" starts an argument at the till.

Invoice: number only, link through the account route so a forward does not
hand a stranger a tax document.

---

## 3. Voucher expiry T-7 and T-1 (`voucher_expiring`)

Queued by the expiry-reminder sweep with `days_remaining` in the payload.
The builder renders whatever day count it is given. Day 1 subject is
`{product} פג מחר`. Other days: `{product} פג בעוד {n} ימים` (day 2: `בעוד
יומיים`).

| Field | Value |
|---|---|
| Subject | as above |
| Preview | still unused, expiry coming |
| Body | product, supplier, when it lapses, optional exact `expires_at` |
| CTA | `/account/coupons` |
| Variables | `product_name`, `supplier_name`, `days_remaining`, `expires_at` |

A payload with no usable day count and no date returns null: better no mail
than a blank nag. T-7 and T-1 are the intended buckets of the sweep, not two
templates.

---

## 4. Refund confirmation (`refund_completed`)

| Field | Value |
|---|---|
| Subject | `הזיכוי שלך בוצע: {amount}` |
| Preview | credit went through |
| Body | amount, optional cancellation fee line ("נוכו דמי ביטול לפי התקנון"), note that the card issuer decides when it shows |
| CTA | `/account/orders` ("להזמנות שלי") |
| Variables | `refunded_agorot`, `cancellation_fee_agorot`, `order_id` |

This is a **card** credit. Wallet goodwill is a different movement
(`cashback_credited` / ledger), not this template.

---

## 5. Password reset

Not a KenyonExpress HTML template. `sendPasswordReset` calls
`supabase.auth.resetPasswordForEmail` with redirect to `/auth/callback`.
Subject and body are the Supabase Auth template in the dashboard. Rate limit:
`reset` 5 / hour / IP and `reset-address` 5 / hour / address.

Do not duplicate this as a Resend template. Two reset mails is how users get
the stale link.

---

## 6. Signup welcome (`welcome`)

| Field | Value |
|---|---|
| Subject | `ברוכים הבאים ל-KenyonExpress` |
| Preview | account is ready |
| Body | greeting, what the shop is, where coupons will live. **No offer, no coupon code.** |
| CTA | `/account/coupons` |
| Variables | `full_name` (optional) |

Deduped on `welcome:{user id}` from the auth callback. Every login attempts
enqueue; only the first row lands.

---

## 7. Supplier payout notification

**Not implemented.** There is no `supplier_payouts` table and no mail kind for
a transfer. Do not invent a "your payout left the account" email.

What the supplier does get:

| Kind | Subject | Meaning |
|---|---|---|
| `supplier_sale` | `מכירה חדשה ב-KenyonExpress · הזמנה {ref}` | a customer paid; CTA is the supplier portal |
| `voucher_redeemed` | `הקופון מומש · {product}` | the till burned a code |

Coupon money stays with the platform. A payout mail would describe a transfer
that the ledger does not make.

---

## 8. Related customer mails (not in the brief, live)

| Kind | Subject | CTA |
|---|---|---|
| `voucher_gifted` | `{sender} שלח לך מתנה: {product}` | coupon page |
| `cashback_credited` | `נכנס לך קאשבק של {amount}` | `/account/wallet` |

Operator-only (not customer): `invoice_dead`, `low_stock`,
`reconciliation_gap`.

---

## 9. Shared rules

1. Money in every payload is agorot. Only `formatAgorot` / `shekels` turns it
   into shekels. Nothing divides by 100 in a template.
2. Payload is frozen at enqueue time. A rename after the sale must not rewrite
   the email.
3. `sendEmail` never throws. Finalize has already charged the card.
4. Cron drain is the only sender of voucher email. If cron is off, nobody
   receives a code by mail. The `/coupon/{id}` page still works.
