# VOUCHER-LIFECYCLE.md

מחזור חיי שובר (`vouchers`): מ-`issued` עד `redeemed` / `expired` / `cancelled` / `refunded`.

Status: **BINDING** · Updated: 2026-08-12  
Scope: **docs only** · worktree `ke-docs-pack` · branch `arch/docs-queue`  
אין שינוי קוד במסמך הזה.

## מקורות מחייבים למצבים

| מקור | תפקיד |
| --- | --- |
| `src/types/database.ts` → `Enums.voucher_status` | enum חי בפרודקשן |
| `src/server/domain/vouchers/state-machine.ts` | מעברים חוקיים + guards |
| `finalizeOrder` → `issueVoucher` | הנפקה אחרי תשלום |
| RPC `public.redeem_voucher` via `POST /api/supplier/vouchers/redeem` | מימוש |
| RPC `expire_vouchers` / `credit_expired_vouchers` | פקיעה (+ זיכוי ארנק אם קיים) |
| `refund_vouchers_for_order` במסלול refund | החזר |

Companions:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/COUPON-STOREFRONT-SPEC.md
docs/ADMIN-ARCHITECTURE.md
```

השופט תחת מקביליות הוא ה-SQL (UPDATE מותנה / RPC). מודול ה-TypeScript הוא השופט של מה חוקי לפני הקריאה.

---

## 0. Enum חי (`voucher_status`)

מתוך `database.ts` (פרודקשן):

```text
voucher_status =
  issued
  | redeemed
  | expired
  | cancelled
  | refunded
```

כל כתיבה ל-`vouchers.status` חייבת להיות אחד מחמשת הערכים האלה. אין `used` על טבלת `vouchers`.

### אל תבלבל עם enums סמוכים

| Enum | ערכים רלוונטיים | תפקיד |
| --- | --- | --- |
| `voucher_status` | למעלה | מצב השובר הבודד (יחידת מימוש) |
| `coupon_status` | `issued`, `used`, `expired`, `refunded` | טבלת `coupons` (קודי הנחה / ישות אחרת). **לא** מחליף `vouchers.status` |
| `order_item_status` | כולל `issued`, `refunded`, … | שורת הזמנה; מקביל לשובר, לא במקומו |
| `settlement_status` | `split_executed`, `escrow_held`, … | כסף על שורת הזמנה |
| `escrow_status` | `held`, `released`, `refunded` | ישות escrow אם קיימת; מודל מחייב: **אין Escrow חיצוני** (ADMIN §0) |

קריאה ישנה במסמכים: `used` כמימוש → ב-`vouchers` הקנוני הוא **`redeemed`**.

---

## 1. מכונת מצבים

```text
                    REDEEM (supplier scan)
         ┌──────────────────────────────────► redeemed  (טרמינלי)
         │
         │          EXPIRE (cron, expires_at עבר)
         ├──────────────────────────────────► expired   (טרמינלי)
         │
 issued ─┼────────── CANCEL (admin / ops) ──► cancelled (טרמינלי)
         │
         └────────── REFUND (refund path) ──► refunded  (טרמינלי)
```

| מצב | טרמינלי? | אירועים יוצאים |
| --- | --- | --- |
| `issued` | לא | REDEEM, EXPIRE, CANCEL, REFUND |
| `redeemed` | כן | אין |
| `expired` | כן | אין |
| `cancelled` | כן | אין |
| `refunded` | כן | אין |

חוקים:

1. כל מצב חוץ מ-`issued` הוא **טרמינלי**. אין חזרה ל-`issued`.
2. `REDEEM` רק מ-`issued`, רק לספק של השובר (`actingSupplierId === supplierId`), ורק לפני `expires_at`.
3. `EXPIRE` רק מ-`issued` ורק כש-`now >= expires_at`.
4. `CANCEL` ו-`REFUND` רק מ-`issued` (לפני סריקה). אחרי `redeemed` אין unwind של השובר; זיכוי רצון טוב הוא ארנק / מחלוקת ידנית.
5. בלי הקשר ספק / תאריך: `REDEEM` ו-`EXPIRE` נחסמים (אין guard context = סירוב).

### קודי סירוב (guards)

| קוד | מתי |
| --- | --- |
| `WRONG_SUPPLIER` | ספק סורק ≠ `supplier_id` של השובר |
| `PAST_EXPIRY` | `REDEEM` אחרי / ב-`expires_at` |
| `NOT_YET_EXPIRED` | `EXPIRE` לפני `expires_at` |
| `ILLEGAL_TRANSITION` | אירוע לא חוקי ממצב נתון |

---

## 2. מי מעדכן מה

| מעבר | מי / מה מפעיל | מה נכתב | מה לא |
| --- | --- | --- | --- |
| → `issued` | `finalizeOrder` אחרי Cardcom מאומת; `issueVoucher` per unit | שורת `vouchers`: `status=issued`, `code`, `qr_payload`, snapshots כסף, `expires_at`, קישורי order/product/supplier/user; `order_items.item_status` ל-`issued` | לא נוגע ב-`coupon_status` של טבלת coupons; לא יוצר `escrow_holds` במודל הנוכחי |
| `issued` → `redeemed` | ספק scanner+ קורא `redeem_voucher` עם JWT | `status=redeemed`, `redeemed_at`, `redeemed_by`; אירוע סריקה; התראת `coupon_redeemed` | לא מעביר יתרת קופה דרך הפלטפורמה; לא יוצר payout על יתרת הקופה |
| `issued` → `expired` | Job / RPC `expire_vouchers` (+ `credit_expired_vouchers` לפי מדיניות) | `status=expired` על שורות שפג תוקפן ועדיין `issued` | לא נוגע ב-`redeemed` / `refunded` / `cancelled` |
| `issued` → `cancelled` | ops / ביטול יזום לפני סריקה (`CANCEL`) | `status=cancelled` | לא תחליף ל-refund כספי |
| `issued` → `refunded` | מסלול החזר הזמנה: `refund_vouchers_for_order` אחרי אימות Cardcom | `status=refunded` על שוברים שעדיין `issued` | אם כבר `redeemed`: MANUAL_RESOLUTION, בלי עדכון סטטוס אחורה |

### שדות נלווים (מי כותב)

| שדה | נכתב ב- | הערות |
| --- | --- | --- |
| `code`, `qr_payload`, `qr_key_id` | הנפקה | סוד ללקוח; לא ללוג גולמי |
| `face_value_agorot`, מחירי קופון, יתרה | הנפקה (snapshot) | immutable אחרי יצירה |
| `platform_percent` (או bp) | הנפקה | snapshot; דינמי פר מוצר (ADMIN §0) |
| `expires_at` | הנפקה מ-`coupon_expiry_days` / תוקף הצעה | בסיס ל-EXPIRE |
| `redeemed_at`, `redeemed_by` | `redeem_voucher` | מזהה חבר ספק / סורק |
| `frozen_at` | chargeback / fraud על `issued` | חוסם redeem בלי בהכרח cancelled |
| `order_items.item_status` | finalize / refund / fulfillment | מקביל ל-`vouchers.status` |

---

## 3. כסף לפי מצב

| מצב | מה קרה לכסף |
| --- | --- |
| `issued` | הלקוח שילם באתר את המקדמה (`coupon_price`); יתרת הפנים עדיין אצל הקופה |
| `redeemed` | הקופה גבתה את היתרה ישירות; השובר חד-פעמי; אין payout פלטפורמה→ספק על היתרה |
| `expired` | לא מומש; זיכוי ארנק אפשרי דרך `credit_expired_vouchers` (לא בהכרח החזר אשראי) |
| `cancelled` | בוטל לפני מימוש; צמוד בדרך כלל להחזר הזמנה אם כבר חויב כרטיס |
| `refunded` | מקדמה חזרה במסלול Cardcom refund; רק מ-`issued` |

אגורות integer בכל המסלול. אין float. אין Escrow חיצוני.

---

## 4. אחריות לפי תפקיד

| תפקיד | מותר |
| --- | --- |
| מערכת (`finalizeOrder`) | יצירת `issued` |
| לקוח | צפייה בשוברים + QR; **לא** משנה status |
| ספק scanner+ | `REDEEM` על `supplier_id` שלו בלבד |
| Cron / worker | `EXPIRE` |
| Admin / refund worker | `REFUND` / `CANCEL` עם audit |
| anon | כלום על עדכון status |

---

## 5. מקרי קצה

| # | מקרה | תוצאה |
| --- | --- | --- |
| CE1 | שני redeem במקביל על אותו code | אחד מצליח; השני `already_redeemed` |
| CE2 | סריקה אחרי `expires_at` | `PAST_EXPIRY` / expired; בלי side effects |
| CE3 | ספק אחר סורק | `WRONG_SUPPLIER` |
| CE4 | Refund על `redeemed` | MANUAL_RESOLUTION; נשאר `redeemed` |
| CE5 | Cron על שורות לא-`issued` | no-op |
| CE6 | Chargeback | `frozen_at` על `issued`; redeem נחסם |
| CE7 | חתימת QR לא תקינה | לא קוראים ל-RPC; לוג `invalid_signature` |
| CE8 | `EXPIRE` לפני תוקף | `NOT_YET_EXPIRED` |

---

## 6. התראות (עובדות, לא תבניות)

| מעבר | Kind לדוגמה |
| --- | --- |
| הנפקה | `coupon_issued` / voucher issued |
| מימוש | `coupon_redeemed` |
| פקיעה | `coupon_expired` |
| החזר | `coupon_refunded` |

פרטים ב-`ARCHITECTURE-NOTIFICATIONS.md`.

---

## 7. Acceptance

| # | קריטריון |
| --- | --- |
| A1 | כל כתיבה ל-`vouchers.status` היא אחד מחמשת ערכי ה-enum החי |
| A2 | אין מעבר מטרמינלי חזרה ל-`issued` |
| A3 | Redeem רק ב-`redeem_voucher` עם זהות ספק |
| A4 | מסמכים ישנים עם `used` על voucher מתורגמים ל-`redeemed` |
| A5 | אין הבטחת Escrow release במעבר ל-`redeemed` |
| A6 | Guards תואמים ל-`state-machine.ts` (WRONG_SUPPLIER, PAST_EXPIRY, NOT_YET_EXPIRED) |

---

## Revision

| תאריך | שינוי |
| --- | --- |
| 2026-08-12 | יצירה: FSM מול enum חי + מי מעדכן מה |
| 2026-08-12 | הרחבה: טבלת guards, אחריות תפקידים, CE8, יישור ל-ADMIN §0 |
