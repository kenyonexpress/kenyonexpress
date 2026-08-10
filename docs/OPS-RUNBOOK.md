# OPS-RUNBOOK.md
# תפעול יומי אחרי השקה

> **עודכן: 2026-08-10.**  
> מדריך תפעול ליום רגיל אחרי soft-open: reconciliation, החזרים, onboarding ספק, קופון תקוע.  
> משלים את `OPS-DAILY-ROUTINE.md` (15 דקות בוקר) ואת `RUNBOOK-PRODUCTION.md` (deploy/rollback).

Status: **RUNBOOK** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
Scope: **docs only**. אין שינוי קוד ב-worktree הראשי.

שורש אפליקציה מאושר לפקודות (כשמורשה):

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

Package manager: **pnpm** בלבד. מיגרציות prod: **MCP בלבד**.

מסמכים קשורים:

```
docs/OPS-DAILY-ROUTINE.md
docs/RUNBOOK-PRODUCTION.md
docs/RUNBOOK-LAUNCH-DAY.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/LEGAL-CONTENT.md
```

---

## 0. עקרונות

| # | כלל |
|---|---|
| 1 | מקור האמת לתשלום: **Cardcom `GetLpResult`**, לא ה-webhook לבדו ולא UPDATE ידני ל-`paid`. |
| 2 | קופון: אחרי תשלום תקין חייב voucher `issued`. בלי voucher = תקלה תפעולית דחופה. |
| 3 | אין Escrow / held / payout לספק על קופון. |
| 4 | כסף שבור → `CHECKOUT_ENABLED=false` לפני ניסויים. |
| 5 | כל פעולת כסף ידנית: תיעוד ב-`audit_log` / הערת אדמין + מזהה הזמנה. |

---

## 1. בדיקת reconciliation (יומי)

**מטרה:** כל חיוב Cardcom שהצליח משתקף בהזמנה `paid` (+ voucher לקופון). אין כסף בלי שובר / אין שובר בלי כסף.

### 1.1 הזמנות תקועות (חלון 30 דק' עד 48 שעות)

```sql
select id, status, created_at, now() - created_at as age
from public.orders
where status not in ('paid', 'refunded', 'cancelled')
  and created_at > now() - interval '2 days'
  and created_at < now() - interval '30 minutes'
order by created_at desc;
```

**צפוי:** 0 שורות.

**אם יש שורות:**

1. מצא `payment_intents` / `payments` לפי `order_id`.  
2. קרא בשרת או בכלי אדמין ל-`GetLpResult` עם `LowProfileId`.  
3. אם Cardcom = הצלחה וההזמנה לא `paid`: הרץ מסלול reconcile הקיים בקוד (לא SQL `update status`).  
4. אם Cardcom = כישלון/ביטול: סמן לפי המדיניות (cancelled) בלי להנפיק voucher.

### 1.2 שולם בלי voucher (קופון)

```sql
select o.id as order_id, o.paid_at, oi.id as item_id, oi.product_type
from public.orders o
join public.order_items oi on oi.order_id = o.id
left join public.vouchers v on v.order_item_id = oi.id
where o.status = 'paid'
  and oi.product_type = 'coupon'
  and o.paid_at > now() - interval '7 days'
  and v.id is null;
```

**צפוי:** 0.  
**אם יש:** תקלה קריטית. בדוק לוג finalize / Sentry; הנפק voucher במסלול idempotent הקיים; אל תיצור כפילות.

### 1.3 Voucher בלי תשלום

```sql
select v.id, v.status, v.order_item_id, o.status as order_status, o.paid_at
from public.vouchers v
join public.order_items oi on oi.id = v.order_item_id
join public.orders o on o.id = oi.order_id
where o.paid_at is null
  and v.created_at > now() - interval '7 days';
```

**צפוי:** 0. אם יש: הקפא מימוש (status) עד בירור; אל תסרוק לספק.

### 1.4 התאמה יומית מול Cardcom

- ייצוא עסקאות יום קודם ממסוף Cardcom (או `ListTransactions` כשזמין).  
- השווה לסכום `payments` בסטטוס succeeded לאותו יום (אותו מטבע).  
- סטייה מעל סף (למשל עסקה אחת): פתח תקלה עם `cardcom_transaction_id` + `order_id`.

### 1.5 Webhook ללא סוד

ראה שאילתת `payment_webhook_events` ב-`OPS-DAILY-ROUTINE.md`. רעש בודד = בוטים; עשרות = החלף סוד IndicatorUrl.

---

## 2. טיפול בהחזר (refund)

### 2.1 לפני הכל

| בדיקה | פעולה |
|---|---|
| האם בתוך חלון 14 יום / עילת פגם? | לפי `LEGAL-CONTENT.md` §ב (אחרי אישור עו"ד) |
| קופון: האם `issued` או `redeemed`? | `redeemed` → אין החזר אוטומטי |
| פיזי: האם נשלח? | מנע משלוח נוסף לפני זיכוי |
| ארנק שיושם בקופה | החזר ארנק ליתרה פנימית; כרטיס דרך Cardcom |

### 2.2 זרימה תפעולית

```text
בקשת לקוח (/cancel או תמיכה)
  → אדמין מאשר / דוחה עם סיבה
  → חישוב דמי ביטול: min(5%, 100₪) כשמותר; 0 בפגם
  → RefundByTransactionId (או partial) ב-Cardcom
  → עדכון order/items + ledger reversal
  → קופון issued → refunded/cancelled; חסימת QR
  → מייל ללקוח
```

### 2.3 אסור

- זיכוי ב-SQL בלי קריאת Cardcom  
- השארת voucher `issued` אחרי החזר מלא  
- "שחרור Escrow" לספק על קופון (לא קיים במודל)  
- החזר על יתרה ששולמה במזומן בעסק (מחוץ לפלטפורמה) בלי מדיניות נפרדת

### 2.4 אחרי החזר פיזי שכבר יצא payout

אם חלק ספק כבר שולם: רשום `supplier_debit` / קיזוז בבאצ' הבא לפי `ARCHITECTURE-PAYOUT-MECHANISM.md`. תעד ידנית אם הבאצ' כבר נסגר.

### 2.5 אימות

```sql
select o.id, o.status, p.kind, p.status, p.amount_ils, p.created_at
from public.orders o
left join public.payments p on p.order_id = o.id
where o.id = '<order_uuid>'
order by p.created_at;
```

וודא: לקוח קיבל מייל; Cardcom מציג זיכוי; voucher לא ניתן לסריקה.

---

## 3. ספק חדש (onboarding)

לפי `ARCHITECTURE-SUPPLIER-ONBOARDING.md`.

### 3.1 צ'קליסט אישור

| שלב | מי | חובה |
|---|---|---|
| בקשה `pending` | ספק | שם, ח.פ/עוסק, טלפון, אימייל, כתובת |
| מסמכים | ספק | לוגו + אישור עוסק לפי מדיניות |
| אישור אדמין | admin | סיבה אם דחייה |
| יצירת `suppliers` + `supplier_members(owner)` | מערכת | אוטומטי באישור |
| פרטי בנק | ספק | **לפני payout פיזי בלבד**; לא חוסם סריקת קופונים |
| מוצר ראשון | ספק/אדמין | `platform_percent` חובה; קופון: `coupon_price` |
| בדיקת סריקה | ספק | משתמש scanner אחד לפחות |

### 3.2 אחרי אישור (5 דקות)

1. ודא מייל welcome נשלח.  
2. התחברות ספק לפורטל.  
3. צור/אשר מוצר draft → publish רק עם מחיר + percent.  
4. רכישת טסט בסביבת בדיקות (לא prod) אם אפשר; אחרת דיל פנימי עם מחיר נמוך.  
5. סריקת QR במצב scanner.

### 3.3 דגלים אדומים

- ספק מבקש "נאמן" / payout על קופונים → הסבר מודל No Escrow; אל תשנה קוד.  
- חסר `platform_percent` → אל תפרסם.  
- פרטי בנק חסרים → מותר קופונים; חסום באצ' payout פיזי.

---

## 4. קופון תקוע

### 4.1 אבחון מהיר

| תסמין | בדיקה | טיפול |
|---|---|---|
| שולם, אין QR באזור אישי | §1.2 voucher חסר | הנפקה חוזרת idempotent |
| יש QR, ספק לא מצליח לסרוק | סטטוס voucher; תוקף; הרשאת scanner | תקן סטטוס / חברות |
| "כבר מומש" בטעות | `voucher_redemptions` | אם redemption שגוי: ביטול ידני מבוקר + audit (נדיר) |
| תוקף פג | `expires_at` | אין מימוש; החזר לפי מדיניות בלבד |
| לקוח רואה יתרה שגויה | `face` מול `coupon_price` | תקן תצוגה; לא לשנות snapshot אחרי paid בלי הליך |
| ספק דורש כסף מהפלטפורמה על קופון | מודל עסקי | דחה; יתרה נגבית בעסק |

### 4.2 שאילתת סטטוס

```sql
select v.id, v.status, v.expires_at, v.face_value_agorot, v.coupon_price_agorot,
       v.remaining_amount_due_agorot, o.id as order_id, o.status as order_status
from public.vouchers v
join public.order_items oi on oi.id = v.order_item_id
join public.orders o on o.id = oi.order_id
where v.id = '<voucher_uuid>'
   or v.code = '<code>';
```

(התאם שמות עמודות לחי אם עדיין `*_ils`.)

### 4.3 תרחיש: לקוח שילם, finalize נכשל אחרי Cardcom

1. `CHECKOUT_ENABLED` נשאר true אלא אם כשל המוני.  
2. Reconcile לפי LowProfileId.  
3. Issue voucher.  
4. שלח מייל "הקופון שלך" ידני/resend אם נדרש.  
5. פתח Sentry issue + מניעת הישנות.

### 4.4 תרחיש: סריקה כפולה

- ייחודיות הצלחה אחת ל-`voucher_id` ב-`voucher_redemptions`.  
- ניסיון שני = כישלון צפוי; אל תמחק redemption ראשון בלי חקירה.

---

## 5. סדר יום מומלץ (אחרי השקה)

| מתי | מה |
|---|---|
| בוקר (15 דק') | `OPS-DAILY-ROUTINE.md` + §1 reconciliation |
| לפי פנייה | §2 החזר / §4 קופון תקוע |
| כשמגיעה בקשה | §3 onboarding |
| סוף שבוע | התאמת Cardcom שבועית; באצ' payout פיזי אם יש (PAYOUT-MECHANISM) |
| תקרית כסף | כיבוי checkout → `RUNBOOK-PRODUCTION.md` |

---

## 6. אנשי קשר / כלים

| כלי | שימוש |
|---|---|
| Supabase SQL | שאילתות למעלה |
| Cardcom מסוף | GetLpResult / Refund / דוחות |
| Vercel | deploy, env, Instant Rollback |
| Sentry | שגיאות finalize / webhook |
| Resend (או מייל) | resend קופון / אישור החזר |

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | Runbook אחרי השקה: reconcile, refund, onboarding, stuck coupon |
