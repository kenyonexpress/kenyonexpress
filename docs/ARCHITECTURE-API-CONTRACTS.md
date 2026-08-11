# ארכיטקטורה: חוזי API (סיכום מחייב)

סיכום חוזי התחבורה והכסף של KenyonExpress. פירוט היסטורי ארוך הוחלף בחוזה קצר ומיושר ל-No Escrow.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held. אין default ל-`platform_percent` ב-zod/DB/קוד.

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

כשסתירה מול SECURITY: SECURITY גובר. כשסתירה מול CONTRADICTIONS: CONTRADICTIONS גובר.

---

## החלטה

| # | הכרעה |
|---|---|
| API-1 | שני תעבורות: **Server Actions** לדפדפן; **Route Handlers** ל-M2M (webhook, cron, redeem scanner, beacon, health). |
| API-2 | מעטפת: `ActionResult<T> = { ok:true, data } \| { ok:false, error }`. אין throw ללקוח. |
| API-3 | טקסונומיית שגיאות סגורה (UNAUTHENTICATED, FORBIDDEN, VALIDATION, NOT_FOUND, CONFLICT, STATE_INVALID, EXPIRED, INSUFFICIENT_*, PAYMENT_*, RATE_LIMITED, IDEMPOTENT_REPLAY, CONSENT_REQUIRED, SIGNATURE_INVALID, INTERNAL). |
| API-4 | Idempotency: מפתחות דטרמיניסטיים בשרת; ב-checkout גם `client_ref`. |
| API-5 | כסף בחוזה ללקוח: `_ils` עם 2 ספרות; פנימית אגורות integer. |
| API-6 | Pagination cursor לחדש; offset רק ב-RPC קטלוג קיימים. |
| API-7 | Zod ב-`src/contracts/` כמקור אמת. |
| API-8 | בלי `/v1` היום; גרסאות מפורשות רק ל-QR / analytics envelope / offline queue. |
| API-9 | Rate tiers: money fail-closed; אחר fail-open. |
| API-10 | `POST /api/supplier/redeem` = Route Handler (service worker). |
| API-11 | **אין מספרי עמלה בחוזה.** אין `.default(5)` / `.default(10)` על `platform_percent`. מוצר בלי אחוז לא נמכר. |
| API-12 | `paid` / הנפקת voucher / wallet: רק בנתיב finalize אחרי אימות Cardcom. Return URL קוסמטי. |

### Auth tiers (תמצית)

| Tier | שימוש |
|---|---|
| guest | עגלה / קטלוג |
| user | checkout, הזמנות, ארנק, קופונים |
| supplier:scanner+ | redeem, הזמנות ספק |
| supplier:owner | בנק, צוות, dispute |
| staff / admin / super_admin | CRUD אדמין; כסף-out ל-super_admin + re-auth |
| service | webhook / cron / delivery |

### משטחי ליבה

| תחום | Transport | הערות |
|---|---|---|
| Cart / Checkout | SA + RH webhook | snapshot `platform_percent`; RL fail-closed |
| Coupons / Redeem | SA + `POST /api/supplier/redeem` | RPC אטומי; HTTP 200 לכל scan_result |
| Wallet | SA read; write רק finalize/cron/admin | idempotency keys |
| Catalog | RSC + RLS | `platform_percent` לא ל-guest |
| Admin upsert | SA | `platform_percent` **חובה** |
| Analytics | `POST /api/a` beacon | consent; 204; בלי PII |

קופון בשורה: `charged_on_site = coupon_price`; `supplier_due` מפלטפורמה = 0 (No Escrow).

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow / held / naman / J5 בשדות או סטטוסים | No Escrow; API-11/API-12. |
| default `platform_percent` ב-zod (5, 10) | API-11. |
| קבלת מחיר/% מלקוח ב-checkout | snapshot בשרת בלבד. |
| כתיבת `paid` מ-return URL | API-12; GetLpResult בלבד. |
| HMAC כתנאי ל-Cardcom | webhook: `?s=` + GetLpResult. |
| חשיפת PAN / raw token ללקוח | SECURITY. |
| `/v1` prefix גלובלי | API-8: לא היום. |
| throw ללקוח על שגיאות | API-2: ActionResult. |

---

## סכמת DB

**אין DDL חדש במסמך זה.** Idempotency ו-webhook dedup על טבלאות קיימות.

| טבלה / מפתח | שימוש |
|---|---|
| `payment_webhook_events (provider, external_event_id)` | dedup webhook |
| `payments` | initiated → succeeded / failed |
| `order_items.platform_percent` | snapshot בקנייה |
| `voucher_redemptions` | UNIQUE success per voucher |
| `audit_log` | admin money-out |

### Idempotency keys

| זרימה | מפתח |
|---|---|
| beginCheckout | `lp:<client_ref>` |
| token charge | `tok:<order_id>:<client_ref>` |
| webhook | `(provider, external_event_id)` |
| wallet spend/cashback | `order:<id>:spend` / `:cashback` |
| refund | `ref:<payment_id>:<n>` |

Statutory cancellation fee (5% או 100₪) = שדה/מסלול משפטי נפרד, לא commission contract.

---

## מקרי קצה

| # | מקרה | התנהגות מחייבת |
|---|---|---|
| CE1 | webhook replay | dedup; no-op |
| CE2 | `amount_mismatch` ב-GetLpResult | לא paid; audit |
| CE3 | redeem כפול על QR | CAS: success + already_redeemed |
| CE4 | admin upsert בלי `platform_percent` | validation נכשל |
| CE5 | guest מבקש `platform_percent` בקטלוג | לא נחשף |
| CE6 | rate limit על checkout | fail-closed |
| CE7 | IDEMPOTENT_REPLAY על beginCheckout | מחזיר תוצאה קודמת |
| CE8 | coupon refund אחרי redeem | STATE_INVALID להחזר מלא לפי מדיניות |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | יישור מלא `src/contracts/` מול API-1..12 | קוד, לא docs |
| O2 | cursor pagination על כל list endpoints | הדרגתי |
| O3 | offline redeem queue schema_version | MOBILE-APP |
| O4 | OpenAPI export | v2 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-17 | טיוטה ארוכה |
| 2026-08-12 | batch-2: סיכום BINDING No Escrow |
| 2026-08-12 | batch-2 pass: 5 סעיפים חובה |
