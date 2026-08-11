# ארכיטקטורה: זרימת Checkout

מפת מצבים מלאה של הזמנה מ-cart עד `coupon_redeemed`, כולל Cardcom Low Profile, webhook signature, idempotency key, snapshot של `platform_percent` על `order_items`, מקרי כשל, ומה קורה בסריקת קופון.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

מודל כסף מחייב: **No Escrow** (C11א). אין held/נאמן/J5. קופון: מקדמה באתר = הכנסת פלטפורמה; יתרה בבית העסק מחוץ לפלטפורמה; אין payout פלטפורמה→ספק על קופון. פיזי: חיוב מלא + ledger לפי snapshot של `platform_percent`. סכומים פנימיים באגורות integer.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| CF1 | מקור אמת לתשלום = `GetLpResult` (שרת↔Cardcom). Return URL ו-webhook הם טריגר/UI בלבד. |
| CF2 | `CHECKOUT_ENABLED=false` חוסם יצירת Low Profile חדש; finalize של חיוב שכבר הצליח ממשיך. |
| CF3 | אין אחסון PAN/CVV. SAQ-A דרך Low Profile מתארח. |
| CF4 | `platform_percent` (+ `supplier_split_percent`) מצולמים ל-`order_items` ב-`beginCheckout`. שינוי מוצר לא משנה הזמנות ישנות. |
| CF5 | קופון: אין Escrow. אחרי `paid` השורה `platform_settled`; יתרה בעסק מחוץ למערכת. |
| CF6 | פיזי: פיצול ledger ב-finalize; payout בנקאי נפרד (לא בתוך checkout). |
| CF7 | ערכי `order_status` ב-DB = enum מ-`007_orders_schema.sql` בלבד. תוויות מוצר (`draft` / `pending_payment` / `expired`) ממופות בסעיף 1. |
| CF8 | Webhook Cardcom: אין HMAC על הגוף. אותנטיות = `?s=<CARDCOM_WEBHOOK_SECRET>` ב-URL + אימות חוזר ב-`GetLpResult`. |
| CF9 | Idempotency מפתח תשלום: `lp:{client_ref}` על `payments.idempotency_key`. Finalize: `paid_at` guard. |
| CF10 | הנפקת voucher רק אחרי `paid`. מימוש = `redeemed` (לא `used` בכתיבה חדשה). |

---

## 1. טבלת enum מלאה: `order_status`

מקור: `supabase/migrations/007_orders_schema.sql` (מחליף את enum של `001`).

```text
public.order_status =
  pending
  | paid
  | partially_fulfilled
  | fulfilled
  | cancelled
  | refunded
```

ברירת מחדל בעמודה: `pending`.

| ערך | משמעות | טרמינלי? | מי כותב |
|---|---|---|---|
| `pending` | הזמנה נוצרה; ממתין לאימות תשלום / expiry | לא | `beginCheckout` |
| `paid` | `GetLpResult` OK + `finalizeOrder` | לא | `finalizeOrder` בלבד |
| `partially_fulfilled` | חלק מפריטי פיזי התקדמו | לא | שרת / ספק (אגרגציית פריטים) |
| `fulfilled` | כל השורות במצב סופי לפי מדיניות | לא (עד refund) | שרת |
| `cancelled` | בוטל לפני תשלום / פקיעת `expires_at` | כן | cron / server |
| `refunded` | החזר מאושר מול Cardcom | כן | מסלול refund |

### 1.1 מיפוי תוויות מוצר ↔ enum

| תווית במפרט מוצר | ערך ב-DB | הערה |
|---|---|---|
| `draft` | **אין ערך** | לפני INSERT (עגלה / validate) |
| `pending_payment` | `pending` | אחרי יצירת הזמנה, לפני finalize |
| `paid` | `paid` | אחרי GetLpResult + finalize |
| `fulfilled` | `fulfilled` | כל הפריטים סופיים |
| (ביניים) | `partially_fulfilled` | נשמר ב-enum; לא מופיע תמיד במפרט מוצר |
| `expired` | `cancelled` | אין `expired` ב-enum |
| `refunded` | `refunded` | אחרי refund path |

### 1.2 Enumים נלווים (לא `order_status`)

`order_item_status` (007):

```text
pending | issued | shipped | delivered | cancelled | refunded
```

הערה: אין `redeemed` ב-`order_item_status`. אחרי מימוש קופון: `item_status` נשאר `issued`; `settlement_status` על השורה → `redeemed`.

`payment_status` (מכונת תשלום בקוד):

```text
initiated → redirected → succeeded | failed | cancelled
succeeded → refunded
```

סטטוס voucher (קנוני בפרוד, ראה COUPON-LIFECYCLE):

```text
issued → redeemed | expired | refunded
```

(כתיבה חדשה: `redeemed`, לא `used`.)

---

## 2. מפת מצבים מקצה לקצה: cart → coupon_redeemed

```text
[browse / guest cart]
        │ addToCart (session cookie או profile)
        ▼
   cart (items חיים מהמוצר; אין מחיר קבוע בעגלה)
        │ login אם צריך + fn_merge_guest_cart
        │ validateCart
        ▼
   beginCheckout / submitCheckout
        │ CHECKOUT_ENABLED, auth, rate limit
        │ snapshot platform_percent → order_items
        │ orders.status = pending
        │ payments: idempotency_key = lp:{client_ref}
        ▼
   payment initiated
        │ Create Low Profile (Interface/LowProfile.aspx)
        │ IndicatorUrl = .../webhook?s=<secret>
        ▼
   payment redirected  ──► redirect לדף Cardcom
        │
        ├─ Return URL (/checkout/return) ──► reconcileOrderReturn
        │                                         │
        └─ IndicatorUrl POST ─────────────────────┤
                                                  ▼
                                    secret ?s= OK?
                                    INSERT payment_webhook_events
                                    GetLpResult (מקור אמת)
                                    amount match (אגורות)
                                                  ▼
                                         finalizeOrder
                              orders.status = paid, paid_at set
                              vouchers status = issued (× quantity)
                              order_items: platform_settled + item_status=issued
                              (פיזי: split_executed + ledger)
                              clear cart
                                                  ▼
                              לקוח מציג QR / קוד באזור אישי
                                                  ▼
                              ספק: POST /api/supplier/vouchers/redeem
                              verify QR HMAC (אם payload)
                              redeem_voucher RPC (CAS issued→redeemed)
                                                  ▼
                              voucher.status = redeemed  ← סוף מסלול קופון
                              settlement_status = redeemed על השורה
                              (יתרה נגבית בבית העסק, מחוץ לפלטפורמה)
```

### 2.1 דיאגרמת מעברי `order_status`

```text
[cart / draft לוגי]
        │ beginCheckout
        ▼
     pending ──(expires_at / ביטול לפני חיוב)──► cancelled
        │
        │ GetLpResult OK + finalizeOrder
        ▼
       paid ──(חלק פיזי)──► partially_fulfilled ──► fulfilled
        │                         │                    │
        └─────────────┬───────────┴────────────────────┘
                      │ refund + Cardcom confirm
                      ▼
                   refunded
```

מעברים אסורים: `paid`/`fulfilled`/`refunded`→`pending`; `cancelled`→`paid`; `refunded`→כל מצב; סימון `paid` מ-query string בלי GetLpResult.

### 2.2 טבלת מעברים

| מ | אל | טריגר | מי | Idempotency | אסור |
|---|---|---|---|---|---|
| (אין) | `pending` | `beginCheckout` אחרי validate + זהות | Next server | `lp:{client_ref}` | יצירה כש-checkout כבוי; `paid` כאן |
| `pending` | `paid` | GetLpResult OK + finalize | webhook ו/או return reconcile | `paid_at` IS NULL; payment status ∈ initiated/redirected | paid מ-return בלבד |
| `pending` | `cancelled` | expiry / ביטול לפני חיוב | cron / server | UPDATE WHERE pending | ביטול אחרי paid בלי refund |
| `paid` | `partially_fulfilled` | חלק פריטי פיזי התקדמו | server | אגרגציית item_status | דילוג ל-refunded בלי Cardcom |
| `paid` / partial | `fulfilled` | כל השורות סופיות | server | אגרגציה | חזרה ל-pending |
| `paid` / partial / `fulfilled` | `refunded` | refund path | admin/legal | מפתח refund יציב | refund מ-cancelled בלי payment |

---

## 3. Snapshot של `platform_percent` על `order_items`

### 3.1 למה

C10: אחרי רכישה האחוזים והסכומים על השורה קבועים. דוחות, payout (פיזי), ו-refund נשענים על מה שנקנה, לא על המוצר החי.

### 3.2 מתי ואיך

ב-`beginCheckout`, לפני יצירת Low Profile:

| שדה (לוגי / קוד) | מקור |
|---|---|
| `platform_percent` / `commission_percent_snapshot` | `products.platform_percent` (חובה; אין default) |
| `supplier_split_percent` | משלים ל-100 עם platform |
| סכום חיוב באתר | קופון: `coupon_price`; פיזי: מחיר מלא (אגורות) |
| עמלת פלטפורמה | לפי אחוז ה-snapshot על הסכום שנגבה באתר |
| `supplier_due` (קופון) | **0** (No Escrow; אין תשלום פלטפורמה→ספק) |
| יתרה בעסק (קופון) | face − coupon; מחוץ לפלטפורמה |

`buildOrderItemSnapshot` / settlement בשרת בלבד. הלקוח שולח ids ו-consent, לא מחירים.

Finalize **לא** קורא מחדש למוצר החי לפיצול כסף. שינוי אחוז באדמין חל רק על הזמנות עתידיות. הזמנת `pending` עם LP פתוח לא מרעננת אחוז (מונע amount_mismatch).

---

## 4. Cardcom Low Profile

קוד חי: legacy form-urlencoded על

```
/Interface/LowProfile.aspx
/Interface/GetLpResult.aspx
```

(לא v11 JSON כמימוש נוכחי; מחקר v11 ב-`CARDCOM-ARCHITECTURE.md`.)

### 4.1 רצף יצירה

1. שערי `CHECKOUT_ENABLED`, auth, validateCart, כתובת אם פיזי.  
2. INSERT `orders` ב-`pending` + שורות `order_items` עם snapshots.  
3. אם `cardCharge === 0` (ארנק מכסה הכל): `finalizeOrder` מיד, בלי LP.  
4. INSERT `payments` (`kind=charge`, `status=initiated`, `idempotency_key=lp:{client_ref}`).  
5. `createLowProfile`: סכום מאגורות→ILS עשרוני, Success/Failed redirect, IndicatorUrl עם `?s=`.  
6. שמירת `cardcom_low_profile_id`, `status=redirected`, `redirect_url` ב-`raw_response`.  
7. Redirect לדף המתארח.

Operation: ChargeOnly / יצירת טוקן לפי `save_card`. **J5 אסור.**

### 4.2 מקור אמת

| ערוץ | תפקיד |
|---|---|
| Success/Failed Redirect | UI בלבד; מפעיל `reconcileOrderReturn` |
| IndicatorUrl (webhook) | טריגר שרת; לא סומכים על גוף ה-POST לסכום/סטטוס |
| `GetLpResult` | **מקור האמת היחיד** לסכום, הצלחה, transaction id, token |

---

## 5. Webhook signature

Cardcom **אינו חותם** את ה-callback (אין HMAC / signature header על הגוף).

שכבות האותנטיות בפועל:

| שכבה | מנגנון | קוד |
|---|---|---|
| 1 | סוד בלתי-ניחוש ב-URL: `?s=<CARDCOM_WEBHOOK_SECRET>` | השוואה ב-`timingSafeEqual` |
| 2 | אימות חוזר שרת↔Cardcom: `GetLpResult` לפי `LowProfileCode` | `verifyLowProfile` |
| 3 | התאמת סכום: `verified.amountAgorot === round(payment.amount_ils * 100)` | mismatch → audit + **לא** finalize |
| 4 | Dedup אירועים | `payment_webhook_events` UNIQUE `(provider, external_event_id)` |

`signature_valid` בטבלת האירועים = תוצאת בדיקת `?s=`, לא חתימת גוף.

אם הסוד שגוי או ה-payload לא parseable: עדיין 200 (מונע retry ספאם), בלי finalize.

`external_event_id` טיפוסי:

```text
{lowprofilecode}:{InternalDealNumber|na}
```

---

## 6. Idempotency key

| שכבה | מפתח | התנהגות |
|---|---|---|
| יצירת תשלום | `payments.idempotency_key = lp:{client_ref}` | replay של אותו `client_ref`: מחזיר redirect קיים / paid / IDEMPOTENT_REPLAY |
| אירוע webhook | `(provider, external_event_id)` UNIQUE | INSERT כפול → 200 replay, בלי עיבוד חוזר |
| Finalize הזמנה | `orders.paid_at` לא null | `finalizeOrder` מחזיר `{ ok: true, replay: true }` |
| עדכון payment ל-succeeded | UPDATE … WHERE status IN (initiated, redirected) | כפילות לא דורסת succeeded |
| הנפקת voucher | ספירת vouchers ל-`order_item_id` ≥ quantity | לא מנפיק מעבר לכמות |
| Wallet spend/cashback | `order:{id}:spend` / `order:{id}:cashback` | RPC ארנק idempotent |
| מימוש קופון | RPC `redeem_voucher` + optional `idempotency_key` | CAS `issued`→`redeemed`; כבר מומש → `already_redeemed` / replayed |

כלל: retry של לקוח / Cardcom / return+webhook במקביל **לא** יוצרים חיוב כפול. LP חדש רק אחרי failed/cancel מפורש ומפתח `client_ref` חדש.

---

## 7. No Escrow (קופון) ופיזי בקצרה

### 7.1 קופון

| כלל | פירוט |
|---|---|
| חיוב באתר | `coupon_price` באגורות |
| כסף באתר | 100% לפלטפורמה ב-`paid` |
| יתרה | face − coupon בבית העסק (מחוץ למערכת) |
| Payout לספק | **0** מהפלטפורמה |
| אחרי finalize | `settlement_status=platform_settled`, vouchers `issued` |
| אסור | Escrow, held לספק, J5, נאמן, שחרור כסף אחרי סריקה |

### 7.2 פיזי

```text
platform_fee = round(charged * platform_percent_snapshot / 100)
supplier_due = charged - platform_fee
```

Finalize: `split_executed` + רישום ledger; העברה בנקאית = מסלול payout נפרד.

---

## 8. מה קורה כשקופון נסרק

קצה: `POST /api/supplier/vouchers/redeem`  
עבודה אטומית: RPC `redeem_voucher` (SECURITY DEFINER; `supplier_id` מ-`auth.uid()` / membership, לא מהבקשה).

```text
ספק מחובר (JWT)
  → qr_payload? verify HMAC (KEV1) קודם; חתימה לא תקינה → not_found + log invalid_signature
  → או code ידני (normalize)
  → redeem_voucher(p_code, p_scan_method, p_idempotency_key)
       SELECT … FOR UPDATE
       רק status=issued ושייך לספק הקורא
       UPDATE status='redeemed', redeemed_at=now()
       INSERT voucher_redemptions / audit
  → markOrderItemRedeemed: settlement_status='redeemed'
       (item_status נשאר issued; אין ערך redeemed ב-order_item_status)
  → outbox: voucher_redeemed (התראות)
```

| תוצאה | HTTP | משמעות |
|---|---|---|
| `success` | 200 | הועבר ל-`redeemed` |
| `already_redeemed` | 409 | כבר מומש (כולל race / retry) |
| `expired` / `cancelled` / `refunded` | 409 | לא ניתן למימוש |
| `not_found` | 404 | קוד לא קיים / wrong shop (תשובה אחידה) |
| `unauthorized` | 401 | אין session ספק |
| `rate_limited` | 429 | יותר מדי סריקות |

כסף בסריקה: הפלטפורמה **לא** מעבירה כסף לספק. המסך מציג ללקוח/ספק את יתרת העסק (`remaining_amount_due_agorot`) לתיעוד גבייה מקומית בלבד.

אחרי `redeemed`: אין unwind אוטומטי ל-`issued`; refund לכרטיס חסום לשוברים שכבר מומשו (ראה REFUNDS).

פירוט מלא: `docs/ARCHITECTURE-COUPON-LIFECYCLE.md`.

---

## 9. מקרי כשל

| קוד | סימפטום | התנהגות נדרשת |
|---|---|---|
| `checkout_disabled` | `CHECKOUT_ENABLED=false` | אין LP חדש; באנר למשתמש |
| `cart_invalid` | מחיר/מלאי השתנו | רענון עגלה; אין LP |
| `auth_required` | אורח בלחיצת תשלום | login; מיזוג עגלה; עגלה נשמרת |
| `lp_create_failed` | Cardcom/env | payment→failed; order נשאר pending/cancellable |
| `user_cancel` / `3ds_fail` | FailedRedirect | return failed; LP חדש עם client_ref חדש |
| `timeout` (משתמש חוזר לפני webhook) | return בלי תוצאה סופית | `reconcileOrderReturn` קורא GetLpResult; מסך "בודקים תשלום" אם עדיין pending |
| `timeout` (GetLpResult / Cardcom down) | verify נכשל זמנית | לא paid; cron reconcile על redirected מעל N דק׳; kill switch אם ממושך |
| `amount_mismatch` | GetLpResult ≠ payment | **לא** finalize; audit P1; order נשאר pending |
| `webhook_dup` | Cardcom שולח שוב | UNIQUE על external_event_id → 200 replay; finalize no-op דרך paid_at |
| `double_charge` (חשש) | לחיצה כפולה / שני טאבים | אותו `client_ref` → אותו payment/redirect; לא שני LP |
| `double_charge` (שני client_ref) | באג לקוח | שני pending אפשריים; רק מה ששולם ב-Cardcom עובר paid; השני expiry→cancelled; reconcile ידני אם שני חיובים אמיתיים |
| `return_and_webhook_race` | שני ערוצים במקביל | שניהם קוראים GetLpResult + finalize; השני replay בטוח |
| `paid_no_voucher` | paid בלי הנפקה מלאה | reconcile job משלים לפי quantity; לא מבטל paid |
| `scan_race` | שני סורקים | UPDATE אחד מצליח; השני already_redeemed |
| `cardcom_down` | timeouts רחבים | CHECKOUT_ENABLED off + playbook INCIDENT |

אסור מוחלט: לסמן `paid` מפרמטרי Return URL בלי GetLpResult.

---

## 10. מיזוג עגלת אורח (רקע לכניסה ל-checkout)

| כלל | פירוט |
|---|---|
| מזהה אורח | cookie session (httpOnly) |
| אחרי login | RPC מיזוג עם lock; כמויות מאוחדות |
| מחיר בקופה | תמיד מהמוצר החי ב-validate/beginCheckout |
| קופון | חשבון חובה לפני LP |

---

## 11. ERD מצומצם

```text
carts / cart_items
        │
        ▼
orders (status: order_status)
   └── order_items
         · platform_percent / commission_percent_snapshot
         · paid_on_site / face / balance_due (agorot)
         · item_status, settlement_status
         └── vouchers (issued → redeemed)
                └── voucher_redemptions

payments
   · idempotency_key = lp:{client_ref}
   · cardcom_low_profile_id
   · cardcom_transaction_id
   └── payment_webhook_events
         · external_event_id UNIQUE per provider
         · signature_valid (?s=)
         · verified_against_api (GetLpResult)
```

אין טבלת escrow פעילה במודל המחייב לקופון.

---

## 12. Acceptance

- [ ] מפת מצבים cart → pending → paid → issued → redeemed  
- [ ] טבלת enum מלאה של `order_status` (6 ערכים) + מיפוי תוויות מוצר  
- [ ] Low Profile + GetLpResult כמקור אמת  
- [ ] Webhook: `?s=` + אין HMAC גוף; dedup אירועים  
- [ ] Idempotency: `lp:{client_ref}`, paid_at, voucher cap, redeem CAS  
- [ ] Snapshot `platform_percent` לפני LP; לא רטרואקטיבי  
- [ ] No Escrow מפורש; supplier_due קופון = 0  
- [ ] כשלי timeout / double charge / webhook כפול מתועדים  
- [ ] סריקת קופון: RPC אטומי → `redeemed` + settlement_status  

---

## 13. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING ראשון: state machine, snapshot, Cardcom |
| 2026-08-12 | הרחבה: QStash/guest/failures/ERD |
| 2026-08-12 | שכתוב מלא: cart→coupon_redeemed, webhook signature, idempotency, timeout/double-charge, scan path, enum מלא, בלי Escrow |
