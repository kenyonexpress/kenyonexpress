# ARCHITECTURE-ORDER-STATE-MACHINE.md

<!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Read with `docs/PAYMENT-FLOW.md` §2.1, which is authoritative for every
> transition (2026-09-01).**
>
> **‏137 הוחלה. שלושה שומרים חיים בפרודקשן** —
> `tg_orders_status_guard`, `tg_order_items_settlement_status_guard`,
> `tg_payments_status_guard` — כולם `BEFORE UPDATE ... FOR EACH ROW`, כולם
> זורקים `23514`. ‏`migrations/pending/` ריקה מבחינת עבודה פתוחה, והכל עד 146
> נמצא בפרודקשן.
>
> **‏השומרים אינם נוגעים ב-`vouchers` ואינם נוגעים ב-`audit_log`.** ‏§7.3 כאן
> טען שכן; זה תוקן.
>
> ‏המעברים המצוירים במסמך הזה הם מה שהקוד כותב. הטבלה שהמסד **אוכף** רחבה
> מהם, והיא ב-§8.
>
> The escrow states discussed here are **dead enum values kept for history**.
> `settlement_status` in production is
> `pending, paid, split_executed, escrow_held, escrow_released, redeemed,
> refunded, cancelled, platform_settled`, but `SettlementState` in
> `src/server/domain/orders/state-machine.ts` deliberately does not admit
> `escrow_held`, `escrow_released` or `platform_settled`, so no transition can
> produce them. `platform_settled` survives only in the redemption read path.
>
> Both product types run `pending -> paid -> split_executed`. A coupon line
> splits 100/0.

מכונות המצב של ההזמנה, הפריט, התשלום והשובר. כל הסטטוסים, כל המעברים החוקיים,
מי מורשה לכל מעבר, מקרי הקצה, ומסלול הביקורת שאי אפשר לערוך.

Status: **BINDING** · branch `docs/architecture-night` · 2026-08-19
Scope: **docs only.**
Companions: `ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md`,
`ARCHITECTURE-REFUNDS-CANCELLATIONS.md`, `ARCHITECTURE-SECURITY-HARDENING.md`.
SQL: `migrations/pending/137_order_transition_guard.sql` — **הוחלה בפרודקשן.**
הקובץ נשאר על הדיסק תחת `pending/` ושורת ה-`NOT APPLIED` בתחתית הכותרת שלו
מיושנת. ‏`ls` אינו ראיה כאן; ראה `docs/MIGRATION-BACKLOG.md`.

---

## 0. חמש מכונות, לא אחת. וזה מכוון

ההזמנה אינה מחזיקה מצב אחד. היא מחזיקה **חמישה צירים בלתי תלויים**, וכל אחד
עונה על שאלה אחרת:

| ציר | העמודה | השאלה שהוא עונה עליה | הטיפוס |
| --- | --- | --- | --- |
| ‏1. ההזמנה | `orders.status` | האם ההזמנה קיימת, שולמה, בוטלה או זוכתה | `order_status` |
| ‏2. מילוי הפריט | `order_items.item_status` | האם הפריט סופק ללקוח | `order_item_status` |
| ‏3. הסדרת הכסף | `order_items.settlement_status` | האם הכסף על השורה הוסדר | `settlement_status` |
| ‏4. התשלום | `payments.status` | מה קרה בסליקה | `payment_status` |
| ‏5. השובר | `vouchers.status` | האם השובר עוד שווה משהו | `voucher_status` |

**למה לא ציר אחד.** "שולם" ו"סופק" ו"הכסף הוסדר" הם שלוש עובדות שונות שיכולות
להיות נכונות בזמנים שונים. הזמנה פיזית משולמת ולא נשלחה, קופון משולם והוסדר
כספית לפני שנסרק, וזיכוי מחזיר כסף מבלי שהמשלוח חוזר. ציר יחיד היה מאלץ אותנו
להמציא מצבים כמו `paid_but_not_shipped_and_settled`, וזה בדיוק המקום שממנו
מגיעות מכונות מצב עם 40 מצבים.

---

## 1. ‏`orders.status` — מכונת ההזמנה

### 1.1 הערכים בסכימה החיה

```
pending | paid | partially_fulfilled | fulfilled | cancelled | refunded
| platform_settled
```

**‏`platform_settled` חסר כאן עד 01.09 והוא ערך חי ב-enum.** הוא גם משתתף
בשלושה מעברים שהשומר מתיר. ראה §8.

### 1.2 המעברים החוקיים

```mermaid
stateDiagram-v2
    [*] --> pending: beginCheckout INSERT
    pending --> paid: finalizeOrder (webhook / reconcile / ארנק מלא)
    pending --> cancelled: מחסור במלאי · כשל reserve · כשל INSERT פריטים · הריפר (expires_at)
    paid --> refunded: refundOrder (אדמין)
    paid --> partially_fulfilled: (מוגדר, לא נכתב היום)
    paid --> fulfilled: (מוגדר, לא נכתב היום)
    paid --> platform_settled: (מוגדר, לא נכתב היום)
    partially_fulfilled --> fulfilled: (מוגדר, לא נכתב היום)
    partially_fulfilled --> refunded: (מוגדר, לא נכתב היום)
    fulfilled --> platform_settled: (מוגדר, לא נכתב היום)
    fulfilled --> refunded: חלון מחווה
    platform_settled --> refunded: (מוגדר, לא נכתב היום)
    cancelled --> [*]
    refunded --> [*]
```

**‏זה בדיוק מה ש-`fn_orders_status_guard` מתיר, לא פחות ולא יותר.** האחת עשרה
הקשתות כאן הן אחת עשרה השורות שבגוף הפונקציה. `cancelled` ו-`refunded` סופיים:
אף כלל אינו יוצא מהם.

### 1.3 טבלת ההרשאות. מי רשאי לבצע כל מעבר

| מ | אל | מי מבצע | הגייט בפועל |
| --- | --- | --- | --- |
| `[*]` | `pending` | משתמש מחובר | `auth.getUser()` + rate limit 10/דקה |
| `pending` | `paid` | **המערכת בלבד** | `finalizeOrder`, מ-webhook מאומת / ‏`reconcileOrderReturn` / מסלול ארנק מלא. אין UI שמעביר. |
| `pending` | `cancelled` | המערכת | מחסור מלאי, כשל שריון, כשל INSERT, ריפר `expires_at` |
| `paid` | `refunded` | **אדמין בלבד** | `requireAdminSession()` ב-`runRefundOrder` |
| `paid` | `partially_fulfilled` / `fulfilled` | **אף אחד היום** | ראה §1.5 |

### 1.4 שלושה שומרי מצב שהם לא קישוט

```
// finalizeOrder
if (order.status === 'paid') return { ok: true, replay: true }

// runRefundOrder
if (order.status === 'refunded') return { ok: true, replay: true }
if (order.status !== 'paid')    return { code: 'STATE_INVALID' }

// כל UPDATE של סטטוס נושא תנאי על ה-from
.update({ status: 'refunded' }).eq('id', order.id).eq('status', 'paid')
```

התנאי `.eq('status', 'paid')` על ה-UPDATE הוא מה שהופך את המעבר ל-**compare-and-swap**.
שתי בקשות זיכוי במקביל: הראשונה מעדכנת שורה אחת, השנייה מעדכנת אפס שורות.
בלי התנאי הזה שתיהן היו מצליחות, ושתיהן היו קוראות ל-Cardcom.

### 1.5 ‏`partially_fulfilled` ו-`fulfilled` קיימים ואינם נכתבים

חיפוש על `src/` מראה שאף קוד לא כותב את שני הערכים האלה. הם קיימים ב-enum מאז
הסכימה המקורית ומחכים למסלול המילוי הפיזי (`ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`).

**מה זה אומר בפועל:** הזמנה פיזית ששולמה ונשלחה נשארת `paid` לנצח. מבחינת הכסף
זה נכון; מבחינת הלקוח, "האם זה נשלח" לא נמצא ב-`orders.status` ולכן ה-UI חייב
לקרוא את `order_items.item_status`. זה פער מתועד, לא באג.

---

## 2. ‏`order_items.item_status` — מכונת המילוי

### 2.1 הערכים

```
pending | issued | shipped | delivered | cancelled | refunded
```

### 2.2 המעברים, ומה באמת קורה היום

```mermaid
stateDiagram-v2
    [*] --> pending: INSERT ב-beginCheckout
    pending --> issued: finalizeOrder, שורת קופון
    pending --> shipped: הספק סימן שנשלח  (טרם ממומש)
    shipped --> delivered: אישור מסירה  (טרם ממומש)
    pending --> cancelled: ביטול ההזמנה
    issued --> refunded: זיכוי
    shipped --> refunded: החזרה
    delivered --> refunded: החזרה בתוך 14 יום
```

| מעבר | מי | מצב היום |
| --- | --- | --- |
| `pending -> issued` | המערכת (`finalizeOrder`) | **קיים.** קופון בלבד. |
| `pending -> shipped` | ספק | **לא קיים.** אין כותב. |
| `shipped -> delivered` | ספק / שליח | **לא קיים.** |
| `* -> refunded` | אדמין (`runRefundOrder`) | **קיים.** |
| `* -> cancelled` | המערכת | קיים דרך ביטול ההזמנה |

**‏שורה פיזית שמשולמת נשארת `pending` לנצח היום.** `finalizeOrder` מעביר
ל-`issued` רק שורות קופון. הפער הזה הוא מדוע `orders.status` לעולם לא מגיע
ל-`fulfilled`: אין מי שיזין את הציר. זה החוסם היחיד בין המודל הפיזי לבין
מכירה פיזית אמיתית, והוא מסמך אחר.

---

## 3. ‏`order_items.settlement_status` — מכונת הכסף

זו המכונה היחידה שממומשת כקוד טהור עם בדיקות, ב-`src/server/domain/orders/state-machine.ts`.

### 3.1 הערכים ב-enum החי, ומי מהם חי

```
pending | paid | split_executed | escrow_held | escrow_released
| redeemed | refunded | cancelled | platform_settled
```

מכונת המצב בקוד מכירה **שישה** מהם:

| מצב | מעמד | הערה |
| --- | --- | --- |
| `pending` | חי | ההתחלה |
| `paid` | חי | קיים לרגע בתוך `finalizeOrder` |
| `split_executed` | חי | **מצב המנוחה של כל שורה משולמת**, לשני הטיפוסים |
| `refunded` | חי, סופי | |
| `cancelled` | חי, סופי | |
| `redeemed` | **legacy**, סופי | מודל `coupon_codes` שקדם לשוברים, שרשם צריכה על השורה במקום על השובר |
| `platform_settled` | **legacy** | נכתב על ידי כלל C11(a) שבוטל. **אין מעבר שנכנס אליו** במכונה, רק יוצא. אפס שורות נושאות אותו. |
| `escrow_held` / `escrow_released` | **מבוטלים** | קיימים ב-enum, לא מוכרים במכונה, ואין מי שכותב אותם. ראה §3.4 |

### 3.2 המעברים החוקיים, מילה במילה מהקוד

```mermaid
stateDiagram-v2
    pending --> paid: PAYMENT_CONFIRMED
    pending --> cancelled: CANCEL
    paid --> split_executed: EXECUTE_SPLIT
    paid --> refunded: REFUND
    split_executed --> refunded: REFUND
    redeemed --> [*]
    refunded --> [*]
    cancelled --> [*]
```

ארבעה אירועים בלבד: `PAYMENT_CONFIRMED`, `EXECUTE_SPLIT`, `REFUND`, `CANCEL`.
‏`redeemed` אינו נכתב על ידי המכונה הזו כלל; הוא נכתב בנפרד ב-`mark-order-item-redeemed.ts`.

**‏המסד אוכף טבלה רחבה יותר.** ‏`fn_order_items_settlement_status_guard` מכיר
שמונה עשר מעברים, כי הוא חייב לשרת גם שורות legacy:

```
escrow_held       -> escrow_released, redeemed, refunded
escrow_released   -> redeemed, refunded
paid              -> cancelled, platform_settled, redeemed, refunded, split_executed
pending           -> cancelled, paid, refunded, split_executed
platform_settled  -> redeemed, refunded
split_executed    -> redeemed, refunded
סופיים: cancelled, redeemed, refunded
```

**‏שום מעבר אינו נכנס ל-`escrow_held`.** הוא מופיע רק בצד השמאלי. זה מה שכלל
ה-no-escrow נראה כמו כשכותבים אותו כשומר: אי אפשר להיכנס, ומותר לצאת, כדי ששורה
שנכתבה לפני 24.07.26 לא תיתקע בלי דרך למימוש או לזיכוי. **שומר שאוסר לצאת אינו
אוכף את הכלל, הוא מקפיא את השורה.**

**שני הטיפוסים נוחתים באותו `split_executed`, וזה עיקר המודל.** שורה פיזית
מתפצלת לפי `platform_percent` שצולם; שורת קופון "מתפצלת" ‏100/0, כי הפלטפורמה
שומרת את כל התשלום המקוון והספק גובה את חלקו במזומן בקופה. **אין מצב ביניים בין
`paid` לבין מוסדר**, כי אין מה לדחות ואין מה להחזיק.

### 3.3 ‏`transition()` זורק, ולא מחזיר `false`

```ts
transition(from, event)    // -> SettlementState | throws SettlementTransitionError
canTransition(from, event) // -> boolean
```

**‏⚠️ תוקן ב-01.09: אין `productType` ואין `WRONG_PRODUCT_TYPE`.** המסמך תיאר
חתימה בת שלושה פרמטרים ושתי שגיאות. בקוד יש חתימה בת שניים ושגיאה אחת,
`ILLEGAL_TRANSITION`. שדה ה-`productType` היה שריד לכלל C11(a), שבו לשורת קופון
היה מסלול משלה; ‏C11(b) ביטל אותו, שני הטיפוסים רצים
`pending -> paid -> split_executed`, ואף כלל לא הציב את השדה שוב. **החוק:** קוד שמחליט
מה לכתוב חייב לעבור דרך `transition()`. קוד ש**שואל** משתמש ב-`canTransition()`.
‏`UPDATE` ישיר על `settlement_status` בלי אחד מהשניים הוא הפרה.

### 3.4 הסתירה בין התיעוד לקוד — ✅ נסגרה ב-19.08

**מה היה:** ה-docblock בראש `src/server/domain/orders/state-machine.ts` תיאר את
מודל C11(b) ("a coupon prepayment is held for the supplier until the voucher is
scanned"), כולל מסלול `pending -> paid -> escrow_held -> escrow_released`.
‏`TRANSITIONS` באותו קובץ מעולם לא מימש את זה, אין `escrow_held` במכונה,
ו-`redeem_voucher()` בפרודקשן אינו מזיז כסף. הסעיף הזה נכתב כאזהרה בלבד, כי
תיקון ההערה הוא שינוי קוד ולכן היה מחוץ לתחום ענף התיעוד.

**מה נעשה (‏(12) PAYMENTS VERIFY, ענף `feat/payments-verify`):** ה-docblock נכתב
מחדש ומתאר עכשיו את המודל המחייב — שני סוגי המוצר רצים
`pending -> paid -> split_executed`, והקופון "מתפצל" ‏100/0. נוסף בו סעיף מפורש
שמסביר **למה** `escrow_held`, ‏`escrow_released` ו-`platform_settled` עדיין
קיימים ב-enum של פרודקשן ובכל זאת חסרים מ-`SettlementState`: ערך שהטיפוס אינו
מכיר הוא שורה שהקוד לא יכול לכתוב. גם ההערה ב-`checkout-flow.test.ts`, שאמרה
שחלק הספק בקופון "goes into escrow", תוקנה.

**מה מחייב, ללא שינוי:** הקוד. אין Escrow. ההבדל היחיד הוא שהתיעוד בקוד כבר לא
סותר אותו.

‏`125_expire_vouchers_drop_escrow.sql` **הוחלה**, והיא מסיימת את אותו ניקוי בצד
ה-DB. הטענה הקודמת כאן — ש-`expire_vouchers()` בפרודקשן עדיין נוגע
ב-`escrow_holds` — מיושנת. ‏`escrow_holds` נשארה כטבלה היסטורית עם שתי שורות
ובלי כותב.

### 3.5 הגלגול לרמת ההזמנה, והמלכודת שבו

```ts
deriveOrderStatus(lineStates): SettlementState
// יש pending -> pending
// יש paid -> paid
// יש redeemed -> redeemed
// כולן cancelled -> cancelled
// כולן refunded/cancelled -> refunded
// אחרת -> split_executed
```

**‏⚠️ הוא מחזיר `SettlementState`, לא `order_status`.** `split_executed`
ו-`redeemed` **אינם ערכים חוקיים** ב-`order_status`. הפונקציה משמשת ב-`queries/orders.ts`
כשדה תצוגה בשם `settlementStatus` וב-`refund.ts` כשדה בשם `orderStatus` בתוך
ה-plan. **אף אחד מהם אינו נכתב ל-`orders.status`.**

**החוק:** תוצאת `deriveOrderStatus` **לעולם** לא נכתבת ל-`orders.status`. מי
שיכתוב אותה יקבל `22P02 invalid input value for enum order_status`. השם
`orderStatus` בתוך `RefundPlan` הוא שם מטעה שכדאי לשנות, וזה שינוי קוד.

---

## 4. ‏`payments.status` — מכונת הסליקה

```
initiated | redirected | succeeded | failed | refunded | platform_settled
```

**‏`platform_settled` חסר כאן עד 01.09.** הוא ערך חי,
‏`terminal-reconciliation.ts` מתייחס אליו כאל אותה תוצאה כמו `succeeded`, ושני
מעברים נוגעים בו.

```mermaid
stateDiagram-v2
    [*] --> initiated: INSERT לפני createLowProfile
    initiated --> redirected: הדף המתארח נוצר
    initiated --> failed: createLowProfile זרק
    redirected --> succeeded: GetLpResult אישר + הסכום תואם
    redirected --> failed: Cardcom דיווח כישלון
    initiated --> succeeded: chargeWithToken הצליח (בלי דף מתארח)
    initiated --> failed: chargeWithToken נדחה
    succeeded --> refunded: זיכוי מלא
    succeeded --> platform_settled: התאמה סימנה כהכנסת פלטפורמה
    platform_settled --> refunded: זיכוי אחרי הסדרה
```

שמונה קשתות, והן בדיוק שמונה השורות ב-`fn_payments_status_guard`. `failed`
ו-`refunded` סופיים.

| מעבר | מי | תנאי |
| --- | --- | --- |
| `-> initiated` | `beginCheckout` | אחרי שריון מלאי |
| `initiated -> redirected` | `beginCheckout` | `createLowProfile` החזיר `LowProfileCode` |
| `* -> succeeded` | **ה-webhook בלבד**, אחרי `GetLpResult` | `verified.success` **וגם** `amountAgorot === expectedAgorot` |
| `* -> failed` | ה-webhook / ה-catch | `.in('status', ['initiated','redirected'])` |
| `succeeded -> refunded` | אדמין | `.eq('status', payment.status)` |

**‏`succeeded` נכתב ממקום אחד ואחרי בדיקה אחת.** לא מגוף הקולבק, לא מה-redirect,
לא מהלקוח. ‏`GetLpResult` בלבד, וסכום זהה לאגורה.

**זיכוי חלקי אינו מעביר את שורת החיוב.** הוא יוצר **שורת `payments` נוספת** עם
`kind = 'refund'`. השורה המקורית נשארת `succeeded`. `payments.status = 'refunded'`
נכתב רק על זיכוי מלא. ראה `ARCHITECTURE-REFUNDS-CANCELLATIONS.md`.

---

## 5. ‏`vouchers.status` — מכונת השובר

```
issued | redeemed | expired | cancelled | refunded
```

### 5.1 **כל מצב שאינו `issued` הוא סופי.** בלי יוצא מן הכלל

```mermaid
stateDiagram-v2
    [*] --> issued: finalizeOrder
    issued --> redeemed: REDEEM (סריקה בעסק)
    issued --> expired: EXPIRE (סוואפ, expires_at עבר)
    issued --> cancelled: CANCEL (ביטול הזמנה)
    issued --> refunded: REFUND (זיכוי לפני מימוש)
    redeemed --> [*]
    expired --> [*]
    cancelled --> [*]
    refunded --> [*]
```

**למה הכל סופי.** אין Escrow ואין payout. ברגע שהשובר עוזב את `issued` אין מה
להזיז: הערך נצרך בעסק, או שהכסף חזר ללקוח, או שהוא פקע. שובר "פעיל שוב" היה
שובר שאפשר לממש פעמיים.

### 5.2 השומרים על `REDEEM`, ומי נושא כל אחד

| שומר | היכן | כישלון |
| --- | --- | --- |
| משתמש מחובר | `auth.uid() IS NULL` | `unauthorized` |
| חבר בספק פעיל | `supplier_members ... is_active` | `unauthorized` |
| ‏idempotency | `voucher_redemptions.idempotency_key` | התשובה הראשונה, עם `replayed: true` |
| rate limit | ‏30 סריקות לדקה למשתמש | `rate_limited` |
| **הספק הנכון** | `v.supplier_id IN (memberships)` | `wrong_supplier`, שמוצג כ-`not_found` |
| **סטטוס `issued`** | בתוך ה-`WHERE` של ה-UPDATE | `already_redeemed` / `cancelled` / `refunded` |
| **טרם פג** | `v.expires_at > now()` בתוך אותו `WHERE` | `expired` |

### 5.3 השורה שהיא כל ההגנה מפני מימוש כפול

```sql
UPDATE public.vouchers v
SET status = 'redeemed', redeemed_at = now(), ...
WHERE v.code = v_code
  AND v.status = 'issued'
  AND v.expires_at > now()
  AND v.supplier_id IN (SELECT supplier_id FROM supplier_members WHERE user_id = auth.uid() AND is_active)
RETURNING v.* INTO v_voucher;
```

**‏`UPDATE ... WHERE status='issued'` יחיד ואטומי.** שתי סריקות בו-זמנית:
Postgres מסדר אותן, הראשונה מוצאת `issued` ומעדכנת, השנייה מוצאת `redeemed`
ומעדכנת אפס שורות ונופלת ל-`already_redeemed`. **אין `SELECT` ואחר כך `UPDATE`,
כי בין השניים יש חלון.**

### 5.4 ‏`not_found` ו-`wrong_supplier` מתמזגים בתשובה

```
outcome 'wrong_supplier' נרשם ב-voucher_redemptions
התשובה ללקוח: { outcome: 'not_found' }
```

**אנטי-enumeration.** ספק שיכול להבחין בין "קוד לא קיים" ל"קוד של עסק אחר" יכול
למפות את מרחב הקודים של המתחרים. הרישום הפנימי מדויק; התשובה החוצה לא.

### 5.5 ‏`offer_valid_until` מול `expires_at`

| שדה | משמעות | מי אוכף |
| --- | --- | --- |
| `offer_valid_until` | עד מתי **ההצעה נמכרת**. חוק הגנת הצרכן: מוצג ללקוח לפני הרכישה. | ה-UI + הקטלוג |
| `expires_at` | עד מתי **השובר שנרכש ניתן למימוש**. `issued_at + coupon_expiry_days`. | `redeem_voucher()` |

הם **אינם** אותו דבר, ו-`voucher_success_payload` מחזיר את שניהם בתשובת `expired`,
כדי שהעסק יוכל להסביר ללקוח מה בדיוק פג.

**‏`coupon_expiry_days` חובה, בלי ברירת מחדל.** `finalizeOrder` זורק אם הוא חסר,
במקום להמציא 90 יום. ראה `ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` §7.2.

---

## 6. ‏Edge cases. מה קורה בדיוק בכל אחד

### 6.1 ביטול או זיכוי **אחרי** סריקה

**התשובה: לא ניתן להחזיר לכרטיס. נקודה.**

```ts
// refund.ts
const consumed = input.vouchers.filter(v => v.status === 'redeemed' || v.status === 'expired')
// consumed חוסם את התוכנית
```

הלקוח כבר קיבל את הערך בעסק. משיכת הכסף מהכרטיס תשאיר את הפלטפורמה בחסר מול
עסק שכבר נתן שירות. `describeRefundBlockers` מחזיר חוסם בעברית שמוצג לאדמין.

**מה כן אפשר:** **זיכוי לארנק** כמחווה. זו תנועת כסף אחרת לגמרי, היא אינה נוגעת
ב-`vouchers` ואינה עוברת ב-`planOrderRefund`. הארנק פנימי בלבד ולא יוצא החוצה.

**‏`expired` נחסם באותה שורה כמו `redeemed`.** שובר שפג הוא breakage שכבר הוכר
כהכנסה. **‏⚠️ יש כאן מתח משפטי מתועד (C6):** לקוח ששילם ולא מימש בגלל שהעסק
נסגר אינו "צרך ערך". `credit_expired_vouchers()` קיים בדיוק בשביל המקרה, והוא
מזכה לארנק ולא לכרטיס. הגבול בין השניים הוא החלטה עסקית שמסמך ההחזרים מפרט.

### 6.2 זיכוי חלקי

```ts
partialAmountAgorot // כשמוגדר: אין דמי ביטול, ו-cancelOnly תמיד false
```

| כלל | למה |
| --- | --- |
| **אין דמי ביטול על חלקי** | דמי הביטול החוקיים הם על ביטול העסקה, לא על התאמת סכום |
| **`cancelOnly` תמיד `false`** | "חצי עסקה לא ניתן לבטל לפני שידור". ביטול לפני שידור הוא הכל או כלום. |
| **שורת `payments` חדשה** עם `kind='refund'` | שורת החיוב נשארת `succeeded` |
| **`orders.status` נשאר `paid`** | ההזמנה לא זוכתה, רק חלק ממנה |
| השוברים אינם משתנים | זיכוי חלקי אינו מבטל שובר |

### 6.3 תשלום כפול

**שני חיובים שהצליחו על אותה הזמנה.** שלוש הגנות, ואחת שנשארת ידנית:

| שכבה | מה תופסת | מה לא |
| --- | --- | --- |
| `idempotency_key = lp:{client_ref}` | לחיצה כפולה על "שלם" | לא תופסת שני `client_ref` שונים |
| `UNIQUE(provider, external_event_id)` | קולבק שנשלח פעמיים | לא תופסת שתי עסקאות שונות |
| `finalizeOrder`: `status === 'paid'` -> replay | ‏finalize שני | **הכרטיס כבר חויב פעמיים** |
| ההתאמה היומית (`ListTransactions`) | עסקה בטרמינל בלי שורה אצלנו | **ידני** |

**מה שלא מכוסה:** לקוח שפתח שתי לשוניות, קיבל שני `client_ref`, ושילם בשתיהן.
שתי ההזמנות תקינות ושתיהן ייסגרו. ההגנה היחידה היא הזיהוי היומי והזיכוי הידני.
**זה פער ידוע**, וההצעה לסגירתו:

```sql
-- טיוטה בלבד, לא ב-006 ולא ב-007
create unique index orders_one_open_per_user_idx
  on public.orders (user_id)
  where status = 'pending' and deleted_at is null;
```

**זה לא נכתב כמיגרציה בכוונה.** הוא ימנע גם מקרה לגיטימי (לקוח שנטש הזמנה
ומתחיל חדשה לפני שהריפר ניקה), ולכן הוא דורש שינוי בקוד שיבטל הזמנה תלויה לפני
יצירת חדשה. **החלטה: לא לפני שיש מדידה כמה כפילויות באמת קורות.**

### 6.4 השובר פג בין התשלום להנפקה

לא ייתכן: `expires_at` מחושב **בזמן ההנפקה** מ-`issued_at + coupon_expiry_days`,
לא מזמן ההזמנה.

### 6.5 העסק נסגר והשובר עדיין `issued`

אין מעבר לזה. `CANCEL` הוא הכלי (`cancel_vouchers_for_order`), והוא מחייב אדמין.
הכסף חוזר דרך מסלול הזיכוי הרגיל, כי השובר עדיין `issued`.

### 6.6 ‏`finalizeOrder` הצליח חלקית

הפעולות אינן בטרנזקציה אחת. שובר שהונפק ושורה שהתעדכנה נשארים; ‏`orders.status`
נשאר `pending` אם השלב שלו לא הגיע. **הריצה החוזרת בטוחה:** ה-cap על הכמות +
`vouchers UNIQUE(code)` מונעים שובר שני, וכל UPDATE נושא תנאי `from`.

### 6.7 המלאי נצרך והתשלום נכשל

`consume_order_stock` נקרא רק בתוך `finalizeOrder`, כלומר **אחרי** שהתשלום אומת.
מה שקורה לפני זה הוא **שריון** עם TTL של 15 דקות, שמשתחרר לבד.

---

## 7. מסלול ביקורת append-only

### 7.1 מה קיים היום, ומה חסר בו

| טבלה | מה נרשם | append-only? |
| --- | --- | --- |
| `audit_log` | שינויי סטטוס, override ידני, הרשאות, כניסות | **לא נאכף** |
| `payment_webhook_events` | כל קולבק, גולמי | דה-פקטו (רק `processed_at` מתעדכן) |
| `voucher_redemptions` | **כל סריקה, כולל כישלונות** | דה-פקטו |
| `split_executions` | הפיצול בזמן התשלום | דה-פקטו |
| `wallet_entries` | תנועות ארנק | ספר חשבונות |
| `payment_events` | **חי בפרודקשן** (‏130 הוחלה) | **כן, בטריגר `payment_events_append_only`** |

`voucher_redemptions` היא הטובה שבהן: היא רושמת גם `not_found`, גם `wrong_supplier`
וגם `rate_limited`, עם `ip_address` ו-`user_agent`. **יומן שרושם רק הצלחות לא
עונה על השאלה מי ניסה.**

### 7.2 שלוש הבעיות ב-`audit_log`

1. **אין אכיפה. עדיין.** אין טריגר שחוסם UPDATE/DELETE על `audit_log`. נבדק מול
   `pg_trigger` ב-01.09: הטבלה נושאת אפס טריגרים. יומן שאפשר לערוך אינו ראיה.
   ‏**137 אינה סוגרת את זה** — היא נוגעת ב-`orders`, ב-`order_items`
   וב-`payments` בלבד.
2. **‏`actor_id: null` על פעולת הזיכוי.** ב-`src/server/actions/payments/refund.ts:325`
   עדיין נכתב `actor_id: null, actor_role: 'admin'`, למרות ש-`requireAdminSession()`
   יודע מי המשתמש. היומן אומר "אדמין כלשהו", וזו בדיוק השאלה שיומן קיים כדי
   לענות עליה.

   **‏שאר מסלולי האדמין תוקנו.** עשרה מודולים תחת `src/server/actions/admin/`
   כותבים דרך `writeAuditLog` ב-`src/lib/admin/audit.ts`, שמעביר `actorId`
   אמיתי וגם ממלא `ip_address` ו-`user_agent` מתוך ה-headers. שלושה מקומות
   עוקפים את ה-helper ומבצעים `insert` ישיר: ה-webhook של Cardcom,
   ‏`finalize.ts` ו-`refund.ts`. לשניים הראשונים אין אדם לרשום; לשלישי יש.
3. **אזעקות כסף מעורבבות עם כניסות.** `cardcom_amount_mismatch` נרשם כ-`manual_override`
   עם ה-alarm ב-`metadata`, לצד logins. זה מה ש-`payment_events` בא לפתור.

### 7.3 הכלל המחייב, מכאן והלאה

> **כל מעבר סטטוס על מסלול הכסף נרשם, עם `actor_id` אמיתי כשיש אדם,
> ל-טבלה שאי אפשר לערוך.**

**‏137 הוחלה ומכסה חלק מזה, פחות ממה שנטען כאן קודם.** מה שחי בפרודקשן הוא
שלושה טריגרים בלבד:

| טריגר | טבלה |
| --- | --- |
| `tg_orders_status_guard` | `orders` |
| `tg_order_items_settlement_status_guard` | `order_items` |
| `tg_payments_status_guard` | `payments` |

**‏אין טריגר על `vouchers` ואין טריגר על `audit_log`.** הגרסה הקודמת של הסעיף
הזה טענה ששניהם כלולים ב-137; הקובץ מעולם לא הכיל אותם, וגם הפרודקשן לא. שתי
הפרצות פתוחות:

- **מימוש כפול נחסם באפליקציה בלבד**, על ידי ה-`UPDATE ... WHERE status='issued'`
  האטומי של §5.3. זה מספיק כנגד מרוץ, ואינו מספיק כנגד `UPDATE` ידני מ-service role.
- **‏`audit_log` עדיין ניתן לעריכה ולמחיקה.** זו הפרצה הרצינית מבין השתיים, כי
  היא הופכת את היומן מראיה להצהרה.

שני התיקונים הנותרים בצד הקוד (‏`actor_id` אמיתי ב-`refund.ts`, כתיבה
ל-`payment_events`) הם שינויי קוד ולא נעשו כאן.

---

## 8. שתי טבלאות, ולא אחת

**‏8.1 מה שהקוד כותב, ומי רשאי.** זו הטבלה לעותק שתולים על הקיר: היא צרה
מהטבלה שהמסד אוכף, כי היא מתארת מסלולים שיש להם כותב.

| ישות | מ | אל | אירוע | מי | תנאי |
| --- | --- | --- | --- | --- | --- |
| order | `[*]` | pending | INSERT | משתמש | auth + rate limit |
| order | pending | paid | finalize | מערכת | webhook מאומת |
| order | pending | cancelled | cancel | מערכת | מלאי / ריפר |
| order | paid | refunded | refund | **אדמין** | אין שובר נצרך |
| item | `[*]` | pending | INSERT | משתמש | |
| item | pending | issued | finalize | מערכת | קופון בלבד |
| item | * | refunded | refund | אדמין | |
| settlement | pending | paid | PAYMENT_CONFIRMED | מערכת | |
| settlement | pending | cancelled | CANCEL | מערכת | |
| settlement | paid | split_executed | EXECUTE_SPLIT | מערכת | |
| settlement | paid | refunded | REFUND | אדמין | |
| settlement | split_executed | refunded | REFUND | אדמין | |
| payment | `[*]` | initiated | INSERT | מערכת | |
| payment | initiated | redirected | LP נוצר | מערכת | |
| payment | initiated/redirected | succeeded | webhook | מערכת | **GetLpResult + סכום זהה** |
| payment | initiated/redirected | failed | webhook/catch | מערכת | |
| payment | succeeded | refunded | refund | אדמין | זיכוי מלא בלבד |
| voucher | `[*]` | issued | finalize | מערכת | `coupon_expiry_days` קיים |
| voucher | issued | redeemed | REDEEM | **ספק בעל חברות פעילה** | ספק נכון + טרם פג + rate limit |
| voucher | issued | expired | EXPIRE | ‏cron | `expires_at` עבר |
| voucher | issued | cancelled | CANCEL | אדמין | |
| voucher | issued | refunded | REFUND | אדמין | |

**‏8.2 מה שהמסד אוכף.** זו הטבלה שקובעת אם `UPDATE` יעבור או יזרוק `23514`.
היא **מעתק מילה במילה** מגוף שלוש פונקציות השומר בפרודקשן, נקראו מ-`pg_proc`
ב-01.09. אם ציור כלשהו במסמך כלשהו מראה קשת שאינה כאן, הציור שגוי.

```
orders.status
  fulfilled            -> platform_settled, refunded
  paid                 -> fulfilled, partially_fulfilled, platform_settled, refunded
  partially_fulfilled  -> fulfilled, refunded
  pending              -> cancelled, paid
  platform_settled     -> refunded
  סופיים: cancelled, refunded

order_items.settlement_status
  escrow_held       -> escrow_released, redeemed, refunded
  escrow_released   -> redeemed, refunded
  paid              -> cancelled, platform_settled, redeemed, refunded, split_executed
  pending           -> cancelled, paid, refunded, split_executed
  platform_settled  -> redeemed, refunded
  split_executed    -> redeemed, refunded
  סופיים: cancelled, redeemed, refunded

payments.status
  initiated         -> failed, redirected, succeeded
  platform_settled  -> refunded
  redirected        -> failed, succeeded
  succeeded         -> platform_settled, refunded
  סופיים: failed, refunded
```

שלוש הערות שנושאות משקל:

1. **‏no-op תמיד חוקי.** כל שומר יוצא מוקדם כש-`NEW = OLD` וכש-אחד הצדדים
   ‏`NULL`. בלי זה כל כתיבה של `set_updated_at` ל-`orders` הייתה נכשלת.
2. **‏`INSERT` אינו נשמר.** שלושת הטריגרים הם `BEFORE UPDATE` בלבד. המצב
   ההתחלתי הוא עניינו של הכותב; המעברים הם עניינו של השומר.
3. **‏`vouchers.status` אינו בטבלה הזו.** אין עליו שומר. §5 הוא חוזה של
   האפליקציה, לא של המסד.

---

## 9. תשע החלטות שלא ישתנו בלי מסמך שגובר

1. **חמישה צירים, לא אחד.** אין מיזוג ל-`status` יחיד.
2. **כל UPDATE של סטטוס נושא תנאי `from`.** compare-and-swap, לא read-modify-write.
3. **`succeeded` נכתב רק מ-`GetLpResult` עם סכום זהה לאגורה.**
4. **כל מצב שאינו `issued` בשובר הוא סופי.**
5. **מימוש הוא `UPDATE ... WHERE status='issued'` אטומי יחיד.**
6. **שובר נצרך או שפג חוסם החזר לכרטיס.** המסלול היחיד הוא זיכוי לארנק.
7. **זיכוי חלקי: בלי דמי ביטול, בלי `cancelOnly`, שורת `payments` חדשה.**
8. **`deriveOrderStatus` לעולם לא נכתב ל-`orders.status`.**
9. **אין Escrow.** ה-docblock ב-`state-machine.ts` תוקן ב-19.08 ותואם לקוד (‏§3.4),
   ומ-01.09 גם המסד אומר זאת: אין ולו מעבר אחד שנכנס ל-`escrow_held`.
