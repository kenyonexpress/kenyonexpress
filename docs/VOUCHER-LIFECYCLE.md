# VOUCHER-LIFECYCLE.md

מחזור חיי שובר (voucher) מקצה לקצה: הנפקה עד מימוש / פקיעה / ביטול / החזר.

Status: **BINDING** · Updated: 2026-08-12  
Scope: **docs only** · worktree `ke-docs-pack` · branch `arch/docs-queue`  
אין שינוי קוד במסמך הזה.

מקורות מחייבים למצבים:

- enum חי בטיפוסים: `src/types/database.ts` → `Enums.voucher_status`
- מכונת מצבים בקוד: `src/server/domain/vouchers/state-machine.ts`
- הנפקה: `finalizeOrder` → `issueVoucher`
- מימוש: RPC `public.redeem_voucher` דרך `POST /api/supplier/vouchers/redeem`
- פקיעה: RPC `expire_vouchers` / `credit_expired_vouchers`
- החזר: `refund_vouchers_for_order` במסלול refund

Companions:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/COUPON-STOREFRONT-SPEC.md
docs/ADMIN-ARCHITECTURE.md
```

---

## 0. Enum חי (פרודקשן לפי database.ts)

```text
voucher_status =
  issued
  | redeemed
  | expired
  | cancelled
  | refunded
```

זה ה-enum על טבלת `vouchers`. כל כתיבה חייבת להיות אחד מהערכים האלה.

### אל תבלבל עם enums סמוכים

| Enum | ערכים רלוונטיים | תפקיד |
| --- | --- | --- |
| `voucher_status` | למעלה | מצב השובר הבודד (יחידת מימוש) |
| `coupon_status` | `issued`, `used`, `expired`, `refunded` | טבלת `coupons` (קודי הנחה / ישות אחרת). **לא** מחליף את `vouchers.status` |
| `order_item_status` | כולל `issued`, `refunded`, … | שורת הזמנה; מתעדכן לצד השובר, לא במקומו |
| `settlement_status` | `split_executed`, `escrow_held`, … | כסף/סליקה על שורת הזמנה |
| `escrow_status` | `held`, `released`, `refunded` | ישות escrow אם קיימת; המודל המחייב: **אין Escrow חיצוני** |

קריאה ישנה: בחלק מהמסמכים מופיע `used` כמימוש. ב-`vouchers` הקנוני הוא **`redeemed`**. ב-`coupon_status` נשאר `used` כערך היסטורי של ישות אחרת.

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

חוקים:

1. כל המצבים חוץ מ-`issued` הם **טרמינליים**. אין חזרה ל-`issued`.
2. `REDEEM` רק מ-`issued`, רק לספק של השובר, ורק לפני `expires_at`.
3. `EXPIRE` רק מ-`issued` ורק אחרי ש-`now >= expires_at`.
4. `CANCEL` ו-`REFUND` רק מ-`issued` (לפני סריקה). אחרי `redeemed` אין unwind אוטומטי של השובר; זיכוי רצון טוב הוא ארנק / מחלוקת ידנית, לא מעבר מצב אחורה.
5. השופט תחת מקביליות הוא ה-SQL (UPDATE מותנה / RPC), לא ה-UI.

---

## 2. מי מעדכן מה

| מעבר | מי / מה מפעיל | מה נכתב | מה לא |
| --- | --- | --- | --- |
| → `issued` | `finalizeOrder` אחרי תשלום Cardcom מאומת; `issueVoucher` per unit | שורת `vouchers` חדשה: `status=issued`, `code`, `qr_payload`, snapshots כסף, `expires_at`, קישורי order/product/supplier/user | לא נוגע ב-`coupon_status` של טבלת coupons; לא יוצר escrow_holds במודל הנוכחי |
| `issued` → `redeemed` | ספק (תפקיד scanner+) קורא `redeem_voucher` עם JWT משתמש | `status=redeemed`, `redeemed_at`, `redeemed_by`; אירוע סריקה; התראת `coupon_redeemed` | לא מעביר יתרת קופה דרך הפלטפורמה; לא יוצר payout line לקופון |
| `issued` → `expired` | Job / RPC `expire_vouchers` (ואולי `credit_expired_vouchers` לזכות ארנק לפי מדיניות) | `status=expired` על שורות שפג תוקפן ועדיין `issued` | לא נוגע ב-`redeemed` / `refunded` / `cancelled` |
| `issued` → `cancelled` | נתיב ops / ביטול יזום לפני סריקה (אירוע `CANCEL` במכונה) | `status=cancelled` | לא תחליף ל-refund כספי; refund הוא מסלול נפרד |
| `issued` → `refunded` | מסלול החזר הזמנה: `refund_vouchers_for_order` אחרי אימות Cardcom | `status=refunded` על שוברים שעדיין `issued` | אם כבר `redeemed`: התשובה היא MANUAL_RESOLUTION, לא עדכון סטטוס אחורה |

### שדות נלווים (מי כותב)

| שדה | נכתב ב- | הערות |
| --- | --- | --- |
| `code`, `qr_payload`, `qr_key_id` | הנפקה | סוד ללקוח; לא ללוג גולמי |
| `face_value_agorot`, `coupon_price_*`, יתרה | הנפקה (snapshot) | immutable אחרי יצירה |
| `platform_percent` (או bp) | הנפקה | snapshot מהמוצר/שורת הזמנה |
| `expires_at` | הנפקה מ-`coupon_expiry_days` / תוקף הצעה | בסיס ל-EXPIRE |
| `redeemed_at`, `redeemed_by` | redeem_voucher | מזהה חבר ספק / משתמש סורק |
| `frozen_at` | chargeback / fraud על `issued` | חוסם redeem בלי בהכרח להעביר ל-cancelled |
| `order_items.item_status` | finalize (`issued`) / refund / fulfillment | מקביל, לא תחליף ל-`vouchers.status` |

---

## 3. כסף לפי מצב

| מצב | מה קרה לכסף |
| --- | --- |
| `issued` | הלקוח שילם באתר את המקדמה; יתרת הפנים עדיין לא נגבתה בקופה |
| `redeemed` | הקופה גבתה את היתרה ישירות; השובר חד-פעמי ומת; אין payout פלטפורמה→ספק על היתרה |
| `expired` | לא מומש; מדיניות זיכוי ארנק (אם קיימת) דרך `credit_expired_vouchers`, לא החזר אשראי אוטומטי בהכרח |
| `cancelled` | בוטל לפני מימוש; תלוי אם כבר חויב כרטיס (בדרך כלל לצמוד להחזר הזמנה) |
| `refunded` | כסף המקדמה חזר במסלול Cardcom refund; רק מ-`issued` |

אגורות integer בכל המסלול. אין float.

---

## 4. אחריות לפי תפקיד

| תפקיד | מותר |
| --- | --- |
| מערכת (finalize) | יצירת `issued` |
| לקוח | צפייה בשוברים שלו + QR; לא משנה status |
| ספק scanner+ | `REDEEM` על שוברים של `supplier_id` שלו בלבד |
| Cron / worker | `EXPIRE` |
| Admin / refund worker | `REFUND` / `CANCEL` לפי מדיניות, עם audit |
| anon | כלום על עדכון status |

---

## 5. מקרי קצה

| # | מקרה | תוצאה |
| --- | --- | --- |
| CE1 | שני redeem במקביל על אותו code | אחד מצליח; השני `already_redeemed` (UPDATE מותנה) |
| CE2 | סריקה אחרי `expires_at` | סירוב `expired` / PAST_EXPIRY; בלי side effects |
| CE3 | ספק אחר סורק | WRONG_SUPPLIER |
| CE4 | Refund על `redeemed` | MANUAL_RESOLUTION; השורה נשארת `redeemed` |
| CE5 | Cron על שורות לא-`issued` | no-op |
| CE6 | Chargeback | `frozen_at` על `issued`; redeem נחסם |
| CE7 | חתימת QR לא תקינה | לא קוראים ל-RPC; לוג `invalid_signature` |

---

## 6. התראות (עובדות, לא תבניות)

| מעבר | Kind לדוגמה |
| --- | --- |
| הנפקה | `coupon_issued` / voucher issued |
| מימוש | `coupon_redeemed` |
| פקיעה | `coupon_expired` |
| החזר | `coupon_refunded` |

הפרטים ב-`ARCHITECTURE-NOTIFICATIONS.md`.

---

## 7. Acceptance לתיעוד/בדיקות

| # | קריטריון |
| --- | --- |
| A1 | כל כתיבה ל-`vouchers.status` היא אחד מחמשת ערכי ה-enum החי |
| A2 | אין מעבר מטרמינלי חזרה ל-`issued` |
| A3 | Redeem עובר רק ב-`redeem_voucher` עם זהות ספק |
| A4 | מסמכים ישנים שאומרים `used` על voucher מתורגמים ל-`redeemed` בקריאה |
| A5 | אין הבטחת Escrow release במעבר ל-`redeemed` |

---

## Revision

| תאריך | שינוי |
| --- | --- |
| 2026-08-12 | יצירה ב-`arch/docs-queue`: FSM מול enum חי + מי מעדכן מה |
