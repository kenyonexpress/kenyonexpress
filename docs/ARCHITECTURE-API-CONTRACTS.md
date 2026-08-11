# ארכיטקטורה: חוזי API (סיכום מחייב)

סיכום חוזי התחבורה והכסף של KenyonExpress. פירוט היסטורי ארוך הוחלף כאן בחוזה קצר ומיושר ל-No Escrow.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #38/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-ANALYTICS.md
docs/CONTRADICTIONS.md
src/contracts/   (יעד)
```

מודל כסף: **No Escrow**. אין held. אין default ל-`platform_percent` ב-zod/DB/קוד.

כשסתירה מול SECURITY: SECURITY גובר. כשסתירה מול MASTER/CONTRADICTIONS: CONTRADICTIONS + MASTER.

---

## 0. הכרעות (API-*)

| # | הכרעה |
|---|---|
| API-1 | שני תעבורות: **Server Actions** לדפדפן מחובר; **Route Handlers** ל-M2M (webhook, cron, redeem scanner offline, beacon, health). |
| API-2 | מעטפת: `ActionResult<T> = { ok:true, data } \| { ok:false, error }`. אין throw ללקוח. |
| API-3 | טקסונומיית שגיאות סגורה (UNAUTHENTICATED, FORBIDDEN, VALIDATION, NOT_FOUND, CONFLICT, STATE_INVALID, EXPIRED, INSUFFICIENT_*, PAYMENT_*, RATE_LIMITED, IDEMPOTENT_REPLAY, CONSENT_REQUIRED, SIGNATURE_INVALID, INTERNAL). |
| API-4 | Idempotency: מפתחות דטרמיניסטיים בשרת; ב-checkout גם `client_ref` מהלקוח. |
| API-5 | כסף בחוזה ללקוח: `_ils` עם 2 ספרות; פנימית אגורות integer. |
| API-6 | Pagination cursor לחדש; offset רק ב-RPC קטלוג קיימים. |
| API-7 | Zod ב-`src/contracts/` כמקור אמת. |
| API-8 | בלי `/v1` היום; גרסאות מפורשות רק ל-QR / analytics envelope / offline queue. |
| API-9 | Rate tiers: money fail-closed; אחר fail-open. |
| API-10 | `POST /api/supplier/redeem` = Route Handler (service worker). |
| API-11 | **אין מספרי עמלה בחוזה.** אין `.default(5)` / `.default(10)` על `platform_percent`. מוצר בלי אחוז לא נמכר. `coupon_price` מוחלט (לא אחוז). |
| API-12 | `paid` / הנפקת voucher / wallet: רק בנתיב finalize אחרי אימות Cardcom (או wallet-covers-all בשרת). Return URL קוסמטי. |

---

## 1. Auth tiers (תמצית)

| Tier | שימוש |
|---|---|
| guest | עגלה / קטלוג |
| user | checkout, הזמנות, ארנק, קופונים שלי |
| supplier:scanner+ | redeem, הזמנות ספק |
| supplier:owner | בנק, חברי צוות, dispute |
| staff / admin / super_admin | CRUD אדמין; כסף-out ל-super_admin + re-auth |
| service | webhook / cron / delivery |

הרשאת ספק = `supplier_members`, לא `profiles.role` לבד.

---

## 2. משטחי ליבה

### 2.1 Cart / Checkout

| Endpoint | Transport | הערות |
|---|---|---|
| getCart / add / update / clear | SA | מחירים חיים מהשרת |
| mergeGuestCart | פנימי אחרי login | cookie → RPC; לא userId מהלקוח |
| beginCheckout | SA | snapshot `platform_percent`; אין מחיר מהלקוח; RL fail-closed |
| chargeWithToken | SA | אותה finalize כמו webhook |
| POST Cardcom webhook | RH | persist → `?s=` → `GetLpResult` → finalize; **בלי HMAC גוף** |
| refundPayment | SA admin | idempotent; קופון `used` = STATE_INVALID להחזר מלא לפי מדיניות |

קופון בשורה: `charged_on_site = coupon_price`; `supplier_due` מפלטפורמה = 0 (No Escrow).  
פיזי: חיוב מלא; fee מ-snapshot percent.

### 2.2 Coupons / Redeem

| Endpoint | הערות |
|---|---|
| getMyCoupons / getCouponDetail | owner RLS; QR חתום לתצוגה |
| POST /api/supplier/redeem | RPC אטומי; vocabulary scan_result; HTTP 200 לכל תוצאת סריקה מעובדת |

### 2.3 Wallet

אין endpoint לקוח לזכות/לחייב ידנית.  
Earn/spend רק ב-finalize/cron/admin adjust עם idempotency keys.

### 2.4 Catalog reads

RSC ישיר + RLS.  
Autocomplete יכול להיות RH עם cache CDN.  
שדות פנימיים (`platform_percent`, עלות) לא ל-guest/user.

### 2.5 Admin

upsert מוצר: `platform_percent` **חובה** (nullable אסור כברירת מחדל ממציאה מספר).  
`suppliers.commission_*` הצעה לטופס בלבד, לא קלט settlement.

### 2.6 Analytics / Ops

| Endpoint | הערות |
|---|---|
| POST /api/a | beacon; consent; בלי PII; תשובה 204 |
| GET /api/health | DB probe |
| POST /api/cron/* | `CRON_SECRET` |

---

## 3. Idempotency (מפתחות עיקריים)

| זרימה | מפתח |
|---|---|
| beginCheckout | `lp:<client_ref>` |
| token charge | `tok:<order_id>:<client_ref>` |
| webhook | `(provider, external_event_id)` |
| wallet spend/cashback | `order:<id>:spend` / `:cashback` |
| redeem | UNIQUE success per voucher |
| refund | `ref:<payment_id>:<n>` |
| notifications | `dedupe_key` |

---

## 4. אסור בחוזים

- Escrow / held / naman / J5 בשדות או סטטוסים  
- default `platform_percent` ב-zod (כולל 5 ו-10)  
- קבלת מחיר/% מלקוח ב-checkout  
- כתיבת `paid` מ-return URL  
- HMAC כתנאי ל-Cardcom  
- חשיפת PAN / raw token ללקוח  

Statutory cancellation fee (5% או 100₪) = שדה/מסלול משפטי נפרד, לא commission contract.

---

## 5. Acceptance

- [ ] API-1..12 מתועדים  
- [ ] No Escrow בשורות קופון  
- [ ] אין default percent בחוזה  
- [ ] Webhook: `?s=` + GetLpResult  
- [ ] redeem כ-RH  
- [ ] כסף רק עם idempotency מפורש  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-17 | טיוטה ארוכה + תיקון QA ל-default 10 ב-zod |
| 2026-08-12 | batch-2 #38: סיכום BINDING מיושר No Escrow; בלי default commission |
