# Alerts spec

Status: DRAFT · docs only  
Companions: `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md`

Customer UI is Hebrew. Kind names stay English. Money in payloads is agorot; display is ₪. No QR as `data:` URI. No PAN.

30א: marketing alerts need opt-in. Transactional order/voucher/refund/cashback do not.

---

## 0. Live vs this spec

| Alert | Live | This spec |
|---|---|---|
| `voucher_expiring` | 7 days and 1 day, kind `voucher_expiring`, dedupe `voucher_expiring:<id>:<bucket>` | keep |
| Abandoned cart | 1 email, once per cart, default 3h idle, newsletter confirmed | **3 steps** (product). Marketing doc rejected a 3rd touch as harmful. This spec adds step 3 only with opt-in, skip-if-paid, and a hard cap |
| Price drop | not built | PLANNED |
| Back in stock | `low_stock` is **operator** only | customer PLANNED |
| Preferences UI | newsletter confirm/unsub only | PLANNED flags below |
| WhatsApp | no live send path in `src/` | same kinds, Twilio templates, opt-in for marketing |

Outbox kinds already live: `order_paid`, `supplier_sale`, `voucher_issued`, `voucher_gifted`, `voucher_redeemed`, `voucher_expiring`, `cashback_credited`, `refund_completed`, `welcome`, plus operator `invoice_dead`, `low_stock`, `reconciliation_gap`.

Pushable today: `voucher_issued`, `voucher_expiring`, `cashback_credited`.

---

## 1. Price drop (PLANNED)

Trigger: `products` on-site price (`coupon_price` / charged-on-site field) **decreases** for an `active` coupon the user has on a wishlist or has viewed ≥2 times in 14 days. Do not fire on till remainder changes. Do not fire on a price **increase**.

Minimum drop: 500 agorot (₪5) and at least 5% of the previous on-site price.

Channel: email, and push if PWA permission. WhatsApp only with `marketing_whatsapp`.

Hebrew subject:

```
המחיר באתר ירד: {product}
```

Body:

```
שלום {name},
מחיר הקופון באתר ל-{product} ירד מ-{old} ל-{new}.
יתרה בבית העסק, אם יש, מופיעה בעמוד הדיל.
{url}
```

CTA: `לדיל באתר`

Dedupe: `price_drop:<user_id>:<product_id>:<new_price_agorot>`  
Cap: one price-drop mail per product per user per 7 days.

If the product is no longer `active` or stock 0: do not send. That is back-in-stock or silence, not a drop.

---

## 2. Back in stock (PLANNED)

Trigger: product was unavailable (`stock_quantity = 0` or not sellable) and becomes sellable. User must have an explicit waitlist flag (wishlist "הודעה כשחוזר" or sold-out PDP signup). Browsing alone is not consent.

Operator `low_stock` stays admin-only. Do not reuse that kind for customers.

Hebrew subject:

```
חזר למלאי: {product}
```

Body:

```
שלום {name},
{product} חזר לזמין באתר. מלאי אמיתי בלבד. אין הבטחה כמה זמן יישאר.
{url}
```

Dedupe: `back_in_stock:<user_id>:<product_id>:<restock_event_id>`  
One shot per restock event. If they already have the product in a paid cart/order: skip.

Copy on PDP signup:

```
הודעה כשחוזר למלאי
נשלח מייל כשהדיל יהיה שוב זמין. אפשר להסיר בכל עת.
```

---

## 3. Abandoned cart, 3 steps

Live: one email after `ABANDONED_CART_HOURS` (default 3), unique on `abandoned_cart_nudges.cart_id`, requires confirmed newsletter.

Product sequence (replace the single shot):

| Step | Idle | Channel | Consent | Dedupe |
|---|---|---|---|---|
| 1 | 1 hour after last cart update | email | transactional-lite: only if `marketing_email` OR confirmed newsletter. If neither, **skip the whole journey** | `abandoned_cart:1:<cart_id>:<cart_updated_at_date>` |
| 2 | 24 hours | email | same | `abandoned_cart:2:<cart_id>:<cart_updated_at_date>` |
| 3 | 72 hours | email (no WhatsApp) | `marketing_email` **required** (stricter than step 1–2) | `abandoned_cart:3:<cart_id>:<cart_updated_at_date>` |

Stop the journey when: any `paid_at` for that user after the cart touch, cart empty, line no longer `active`, stock 0, or checkout kill switch.

WhatsApp: at most **one** abandoned message in 24 hours, step 1 only, `marketing_whatsapp`. Not on step 3.

Hebrew, step 1:

```
נושא: העגלה שלך בקניון Express ממתינה
שלום {name},
נשאר בסל: {product} אצל {supplier}.
מחיר הקופון באתר: {coupon_price}.
יתרה בבית העסק במעמד המימוש: {remainder}.
{cart_url}
```

Step 2:

```
נושא: {product} עדיין בסל
הדיל בעגלה עדיין פעיל לפי המלאי הנוכחי. המחיר המחייב הוא זה שבמסך התשלום.
{cart_url}
```

Step 3:

```
נושא: הסל יישמר עוד קצת
זו התזכורת האחרונה על העגלה הזו. לא נשלח שוב על אותם פריטים.
{cart_url}
הסרה מדיוור: {unsub}
```

Forbidden: "נשארו 2 במלאי" without a real number. Forbidden: discount code on abandon in v1. Forbidden: saying the card was charged.

---

## 4. Voucher expiring

Keep live buckets: **7 days** and **1 day** (calendar, Asia/Jerusalem). Kind `voucher_expiring`. Dedupe `voucher_expiring:<voucher_id>:<bucket>`.

Transactional. No marketing consent. Skip if `redeemed`, refunded, or no real `expires_at`.

Hebrew (align with email sequences):

7 days:

```
נושא: {product} פג בעוד 7 ימים
{product} ב{supplier} עדיין לא מומש. תאריך התפוגה: {date}.
/account/coupons
```

1 day:

```
נושא: {product} פג מחר
אחרי התאריך הקוד לא ייסרק.
/coupon/{id}
```

Push: allowed for this kind. Body without the QR payload. WhatsApp UTILITY if the user gave a phone for order updates.

Gift unclaimed: send expiry to the **buyer**, not the recipient, until claim. After claim, recipient only.

---

## 5. Preferences (PLANNED UI at `/account/notifications`)

| Flag | Default | Controls |
|---|---|---|
| `order_updates_email` | on | issued, redeemed, refund, cashback, gift |
| `order_updates_whatsapp` | off | same, Twilio |
| `coupon_expiry_email` | on | voucher expiring |
| `coupon_expiry_push` | off until permission | same |
| `marketing_email` | off until 30א opt-in | abandon 1–3, price drop, win-back |
| `marketing_whatsapp` | off | abandon step 1, price drop |
| `back_in_stock_email` | off until PDP signup | back in stock |
| `price_drop_email` | off until wishlist toggle | price drop |

Transactional flags may be turned off except legal invoices. Turning off `order_updates_email` still allows refund and voucher-issued (money). Document that as:

```
הודעות על הזמנה, קופון והחזר יישלחו תמיד למייל של החשבון.
אפשר לבטל תזכורות שיווקיות ותזכורות מלאי.
```

Locale on prefs: `he` default. See i18n spec for `en`/`ar`/`ru`.

---

## 6. Dedupe

| Kind | Key |
|---|---|
| order paid | `order_paid:<order_id>` |
| voucher issued | `voucher_issued:<voucher_id>` |
| gift | `gift:<voucher_id>` |
| expiring | `voucher_expiring:<voucher_id>:<bucket>` |
| cashback | `cashback_credited:<entry_id>` |
| refund | `refund_completed:<refund_id>` |
| abandon step | `abandoned_cart:<step>:<cart_id>:<cart_updated_at_date>` |
| price drop | `price_drop:<user_id>:<product_id>:<new_price_agorot>` |
| back in stock | `back_in_stock:<user_id>:<product_id>:<restock_event_id>` |

Outbox UNIQUE + `ON CONFLICT DO NOTHING`. Resend Idempotency-Key = `dedupe_key`.

Also: one marketing email per user per 6 hours wall clock (Asia/Jerusalem), except transactional. Step 3 abandon counts as marketing.

---

## 7. Acceptance

- Expiry stays 7d + 1d with existing dedupe.
- Abandon is 1h / 24h / 72h, stop on pay, step 3 opt-in only.
- Price drop and back in stock never fire without a stored preference or waitlist row.
- No third abandon WhatsApp. No QR in any alert body.
