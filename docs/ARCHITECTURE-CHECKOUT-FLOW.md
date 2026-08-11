# ארכיטקטורה: זרימת Checkout

מפת מצבים מלאה מ-
cart
עד
`coupon_redeemed`
: כל מעבר, כל טריגר, כל כישלון.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

מודל כסף: **No Escrow**. מקדמת קופון באתר = הכנסת פלטפורמה; יתרה בבית העסק מחוץ לפלטפורמה; אין payout פלטפורמה→ספק על קופון. אגורות integer. `platform_percent` פר מוצר, snapshot בזמן קנייה.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| CF1 | מקור אמת לתשלום = `GetLpResult` בלבד. Return URL ו-IndicatorUrl הם טריגר/UI. |
| CF2 | `CHECKOUT_ENABLED=false` חוסם Low Profile חדש; finalize של חיוב שכבר הצליח ממשיך. |
| CF3 | אין PAN/CVV אצלנו. SAQ-A דרך Low Profile מתארח. |
| CF4 | `platform_percent` + `supplier_split_percent` מצולמים ל-`order_items` ב-`beginCheckout`. |
| CF5 | קופון: אחרי `paid` → `settlement_status=platform_settled`; `supplier_due` מהפלטפורמה = 0. |
| CF6 | `order_status` = enum מ-`007_orders_schema.sql` בלבד (אין `draft` / `expired` / `pending_payment` ב-DB). |
| CF7 | Webhook: אין HMAC על הגוף. אותנטיות = `?s=<CARDCOM_WEBHOOK_SECRET>` + GetLpResult. |
| CF8 | Idempotency תשלום: `payments.idempotency_key = lp:{client_ref}`. Finalize: `paid_at` IS NULL. |
| CF9 | Voucher: mint רק אחרי `paid`; מימוש קנוני = `redeemed` (לא `used` בכתיבה חדשה). |
| CF10 | `coupon_redeemed` במסמך זה = `vouchers.status=redeemed` + `order_items.settlement_status=redeemed` (לא ערך ב-`order_status`). |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| לסמן `paid` מפרמטרי Return URL בלי GetLpResult | זיוף/חטיפת redirect; אין מקור אמת לסכום. |
| HMAC על גוף webhook של Cardcom | Cardcom לא חותם את הגוף; המצאת חתימה שוברת התאמה לפרוד. |
| Escrow / held פנימי עד סריקה לקופון | סותר C11א; מקדמה היא הכנסת פלטפורמה; יתרה בעסק. |
| ערכי `order_status` נוספים: `draft`, `expired`, `pending_payment` | שוברים enum חי ב-007; ממופים ללוגיקה/pending/cancelled. |
| J5 / הרשאה בלי חיוב כמודל קופון | לא מודל העסק; ChargeOnly / חיוב מלא על on-site. |
| הנפקת voucher לפני `paid` | סיכון הנפקה בלי כסף; mint רק ב-finalize. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

מקור עיקרי:
`supabase/migrations/007_orders_schema.sql`
(+ הרחבות commerce/payments/vouchers שכבר בריפו).

### 2.1 Enums

```text
order_status:
  pending | paid | partially_fulfilled | fulfilled | cancelled | refunded

order_item_status:
  pending | issued | shipped | delivered | cancelled | refunded
  (אין redeemed)

payment_status (לוגי / טבלת payments):
  initiated | redirected | succeeded | failed | cancelled | refunded

voucher.status (קנוני):
  issued | redeemed | expired | refunded
```

### 2.2 טבלאות במסלול

| טבלה | שדות קריטיים למסלול |
|---|---|
| `carts` | `profile_id` / `session_id`, `items` jsonb |
| `orders` | `status`, `paid_at`, totals, `user_id`, `expires_at` (אם קיים) |
| `order_items` | snapshots: `platform_percent` / `commission_percent_snapshot`, סכומי agorot, `item_status`, `settlement_status`, `product_type` |
| `payments` | `idempotency_key`, `status`, `amount_ils`, `cardcom_low_profile_id`, `cardcom_transaction_id` |
| `payment_webhook_events` | `provider`, `external_event_id` UNIQUE, `signature_valid`, `verified_against_api`, `payload` |
| `vouchers` | `status`, `code`, `qr_payload`, `order_item_id`, `expires_at`, `redeemed_at` |
| `voucher_redemptions` / scan log | outcome, actor ספק |
| `wallet_*` | spend/cashback עם idempotency `order:{id}:spend` / `order:{id}:cashback` |

### 2.3 מיפוי תוויות מוצר ↔ DB

| תווית מוצר | DB |
|---|---|
| `draft` | אין שורת order (עגלה בלבד) |
| `pending_payment` | `orders.status=pending` |
| `paid` | `paid` |
| `expired` | `cancelled` |
| `coupon_redeemed` | voucher `redeemed` + settlement `redeemed` |

---

## 3. מפת מצבים מקצה לקצה

```text
[S0] browse / guest cart
        │ addToCart / updateQty / remove
        ▼
[S1] cart (חי; מחיר מהמוצר החי בתצוגה)
        │ login + mergeGuestCart (אם אורח)
        │ validateCart
        ▼
[S2] checkout ready (auth חובה לתשלום)
        │ beginCheckout / submitCheckout
        │ snapshots → order_items; order=pending
        ▼
[S3] order pending + payment initiated
        │ createLowProfile OK
        ▼
[S4] payment redirected  ──► Cardcom hosted page
        │
        ├─ Return success URL ──► reconcileOrderReturn
        ├─ Return failed URL  ──► UI failed / payment failed path
        └─ IndicatorUrl POST  ──► webhook (?s=)
                │
                ▼
[S5] GetLpResult verified + amount match
        │ finalizeOrder
        ▼
[S6] order paid
        │ mint vouchers (coupon lines)
        ▼
[S7] voucher issued (+ item_status=issued, settlement=platform_settled)
        │ לקוח מציג QR / קוד
        │ ספק: POST redeem
        ▼
[S8] coupon_redeemed
        = voucher.status=redeemed
        + settlement_status=redeemed
```

מסלולים מקבילים אחרי
`paid`
(לא חלק מ-coupon_redeemed): פיזי → `partially_fulfilled` / `fulfilled`; refund → `refunded`.

---

## 4. כל מעבר (טבלת מכונה)

### 4.1 עגלה (לוגי)

| מ | אל | טריגר | מי | תנאי | אסור |
|---|---|---|---|---|---|
| S0 | S1 | `addToCart` | server action | מוצר קיים/זמין | מחיר מהלקוח |
| S1 | S1 | update/remove | server | session או user | IDOR על cart זר |
| S1 | S2 | login + merge + validate OK | server | auth לתשלום | דילוג ל-LP בלי auth לקופון |
| S1 | S1 | validate fail | server | מחיר/מלאי/מכסה | יצירת order |

### 4.2 הזמנה (`order_status`)

| מ | אל | טריגר | מי | Idempotency | אסור |
|---|---|---|---|---|---|
| (אין) | `pending` | `beginCheckout` אחרי validate | Next server | `lp:{client_ref}` על payment | `paid` כאן; checkout כבוי |
| `pending` | `paid` | GetLpResult OK + amount match + `finalizeOrder` | webhook ו/או return reconcile | `paid_at` IS NULL | paid מ-query string |
| `pending` | `cancelled` | expiry / ביטול לפני חיוב | cron / server | UPDATE WHERE pending | ביטול אחרי paid בלי refund |
| `pending` | נשאר `pending` | דחיית סליקה / verify fail | server | payment→failed; order עד expiry | order=`refunded` בלי חיוב |
| `paid` | `partially_fulfilled` | חלק פריטי פיזי התקדמו | server | אגרגציית item_status | דילוג ל-refunded בלי Cardcom |
| `paid` / partial | `fulfilled` | כל השורות סופיות (מדיניות) | server | אגרגציה | חזרה ל-pending |
| `paid` / partial / `fulfilled` | `refunded` | refund path + Cardcom confirm | admin/legal | מפתח refund | refund מ-cancelled בלי payment |
| `cancelled` | * | אין | אין | אין | `cancelled`→`paid` |
| `refunded` | * | אין | אין | אין | יציאה מ-refunded |

### 4.3 תשלום (`payment_status`)

| מ | אל | טריגר | מי |
|---|---|---|---|
| (אין) | `initiated` | INSERT payment ב-beginCheckout | server |
| `initiated` | `redirected` | Low Profile נוצר; נשמר LP id + redirect_url | server |
| `initiated` | `failed` | createLow Profile זורק | server |
| `initiated`/`redirected` | `cancelled` | ביטול משתמש לפני חיוב (אם נתמך) | server |
| `redirected` | `succeeded` | GetLpResult OK בתוך finalize path | webhook/return |
| `redirected` | `failed` | דחייה / verify fail / FailedRedirect path | server |
| `succeeded` | `refunded` | זיכוי Cardcom מאושר | refund path |

### 4.4 שובר (עד coupon_redeemed)

| מ | אל | טריגר | מי | הערת settlement |
|---|---|---|---|---|
| (אין) | `issued` | finalize אחרי paid; mint × qty | finalizeOrder | `platform_settled`; `item_status=issued` |
| `issued` | `redeemed` | `redeem_voucher` CAS | ספק RPC | `settlement_status=redeemed` |
| `issued` | `expired` | cron `expires_at<=now()` | job | אין redeem |
| `issued` | `refunded` | refund לפני מימוש | admin/legal | חוסם redeem |
| `redeemed` | * | אין | אין | אין unwind ל-issued |

---

## 5. כל טריגר (רשימה מלאה)

| טריגר | קצה / מקור | מה קורה | מעבר |
|---|---|---|---|
| `addToCart` | server action | כתיבה ל-`carts` | S0→S1 |
| `mergeGuestCart` | אחרי login | איחוד כמויות; מחיקת עגלת אורח | S1 נשמר תחת user |
| `validateCart` | לפני תשלום | שערי מחיר/מלאי/מכסה/כתובת | חוסם או S2 |
| `beginCheckout` | server action | order pending + snapshots + payment | →S3 |
| `submitCheckout` | form wrapper | קורא beginCheckout; redirect | →S4 או return paid |
| `createLowProfile` | Cardcom Interface | LP id + URL | initiated→redirected |
| SuccessRedirect | דפדפן | `reconcileOrderReturn` | מנסה S5→S6 |
| FailedRedirect | דפדפן | UI כשל; לא paid | payment failed path |
| IndicatorUrl POST | Cardcom→`/api/payments/cardcom/webhook?s=` | dedupe event; GetLpResult; finalize | S5→S6 |
| `GetLpResult` | שרת↔Cardcom | מקור אמת סכום/סטטוס/token | שער ל-S6 |
| `finalizeOrder` | webhook/return/wallet-only | paid_at, mint, wallet, clear cart | →S6/S7 |
| wallet covers all | beginCheckout cardCharge=0 | finalize בלי LP | →S6 ישירות |
| cron expiry pending | job | pending→cancelled; שחרור reserve | S3→cancelled |
| cron expire vouchers | job | issued→expired | חוסם redeem |
| `redeem_voucher` | POST supplier redeem | CAS issued→redeemed | →S8 |
| admin refund | מסלול REFUNDS | Cardcom refund + DB | →refunded (אם הותר) |
| `CHECKOUT_ENABLED` toggle | env | חוסם LP חדש | אין S3 חדש |

---

## 6. מקרי קצה וכל כישלון

| קוד | תסמין | טריגר | תוצאת מצב | פעולה |
|---|---|---|---|---|
| `checkout_disabled` | env כבוי | beginCheckout | נשאר S1/S2 | באנר; אין LP |
| `unauthenticated` | אין session | beginCheckout | S1 | login; עגלה נשמרת |
| `cart_invalid` | מחיר/מלאי/מכסה | validate | S1 | רענון עגלה |
| `address_required` | פיזי בלי כתובת | beginCheckout | S2 | דרישת כתובת |
| `rate_limited` | יותר מדי ניסיונות | beginCheckout | S2 | המתנה |
| `idempotent_replay` | אותו client_ref | beginCheckout | מחזיר redirect/paid קיים | לא LP שני |
| `lp_create_failed` | Cardcom/env | createLowProfile | payment failed; order pending | cancellable |
| `user_cancel` | יציאה מדף סליקה | FailedRedirect / cancel | payment failed/cancelled | client_ref חדש לניסיון חדש |
| `3ds_fail` | דחיית 3DS | Cardcom | כמו user_cancel | אין paid |
| `timeout_return` | חזרה לפני webhook | SuccessRedirect מוקדם | pending עד GetLpResult | מסך "בודקים תשלום" |
| `timeout_getlp` | Cardcom down | verify | לא paid | cron reconcile; kill switch אם ממושך |
| `secret_invalid` | `?s=` שגוי | webhook | event נרשם; אין finalize | 200; אלרט spike |
| `payload_unparsed` | גוף לא JSON צפוי | webhook | dedupe unparsed; אין finalize | 200 |
| `unknown_payment` | LP לא ב-DB | webhook | אין finalize | reconcile ידני |
| `provider_decline` | ResponseCode לא success | webhook | payment→failed | order עד expiry |
| `amount_mismatch` | agorot ≠ expected | GetLpResult | **לא** paid; audit P1 | חסימת finalize |
| `webhook_dup` | אותו external_event_id | webhook retry | 200 replay | no-op |
| `return_webhook_race` | שני ערוצים | return+webhook | finalize אחד; השני replay | בטוח ב-paid_at |
| `double_charge_same_ref` | לחיצה כפולה | beginCheckout | אותו payment | אין LP כפול |
| `double_charge_two_refs` | באג שני client_ref | beginCheckout | שני pending אפשריים | רק מי שחויב→paid; השני expiry; אם שני חיובים אמיתיים→refund+INCIDENT |
| `finalize_internal` | DB באמצע finalize | finalizeOrder | מצב חלקי אפשרי | reconcile משלים; אלרט |
| `paid_no_voucher` | paid בלי mint מלא | כשל אחרי paid_at | S6 חלקי | job השלמת הנפקה; לא מבטל paid |
| `quota_race` | יחידה אחרונה | שני checkouts | אחד נכשל במכסה | אין over-sell |
| `scan_race` | שני סורקים | redeem | אחד success; שני already_redeemed | CAS |
| `wrong_shop` | ספק לא בעלים | redeem | not_found אחיד | anti-enum |
| `invalid_qr_sig` | HMAC QR נכשל | redeem route | not_found + log | לא מגיעים ל-RPC |
| `redeem_after_refund` | issued כבר refunded | redeem | refunded/409 | אין redeemed |
| `cardcom_down` | timeouts רחבים | כל verify/create | אין paid חדש | CHECKOUT_ENABLED off + playbook |

אסור מוחלט: `orders.status=paid` בלי GetLpResult (או wallet-only path מפורש בלי Cardcom).

---

## 7. Snapshot ו-No Escrow בזמן מעבר ל-pending

ב-`beginCheckout`, לפני LP:

| שדה | קופון | פיזי |
|---|---|---|
| `platform_percent` snapshot | חובה מהמוצר | חובה מהמוצר |
| חיוב באתר | `coupon_price` | מחיר מלא |
| `supplier_due` מפלטפורמה | **0** | charged − fee |
| יתרת עסק | face − coupon | 0 |

Finalize לא קורא מחדש למוצר החי לפיצול כסף.

---

## 8. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | האם reserve מכסה על `pending` חובה בכל דיל או רק מעל סף | INVENTORY מגדיר; ליישם אחיד בקוד |
| O2 | TTL מדויק ל-`expires_at` של order pending (בקוד מופיע ~30 דק׳) | לקבע ב-env מתועד |
| O3 | האם QStash חובה ל-finalize או רק ל-notification wake | הקוד החי: finalize inline ב-webhook; QStash ל-drain |
| O4 | פער שמות עמודות snapshot (`platform_percent` מול `commission_percent_snapshot`) | ליישר בתיעוד מול DB חי בלי DDL במסמך זה |
| O5 | מדיניות החזרת מלאי פיזי אחרי refund | REFUNDS; לא חלק מ-coupon_redeemed |

עודכן: 2026-08-12. אין להסתיר פערים אלה כסגורים.

---

## 9. Acceptance

- [ ] מפת S0→S8 עד coupon_redeemed  
- [ ] טבלת מעברי order/payment/voucher מלאה  
- [ ] כל טריגר ברשימה  
- [ ] טבלת כישלונות כוללת timeout / double charge / webhook dup / amount_mismatch / scan_race  
- [ ] החלטה + חלופות שנדחו + סכמת DB + פתוחות  
- [ ] No Escrow מפורש  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING ראשון / batch-2 #1 |
| 2026-08-12 | שכתוב מלא לפי DOCS-TEMPLATE-BINDING: כל מעבר, כל טריגר, כל כישלון, חלופות, DB, פתוחות |
