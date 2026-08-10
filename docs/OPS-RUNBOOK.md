# OPS-RUNBOOK.md
# תפעול יומי אחרי השקה

> **עודכן: 2026-08-10.**  
> Runbook תפעולי ליום רגיל אחרי cutover: reconciliation, החזרים, onboarding ספק, קופון תקוע.  
> משלים את `OPS-DAILY-ROUTINE.md` (בוקר 15 דקות) ואת `RUNBOOK-PRODUCTION.md` (תקלה/deploy).

Status: **RUNBOOK** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
Scope: **docs only**. אין שינוי קוד ב-worktree הראשי.

מסמכים קשורים:

```
docs/OPS-DAILY-ROUTINE.md
docs/RUNBOOK-PRODUCTION.md
docs/RUNBOOK-LAUNCH-DAY.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/LEGAL-CONTENT.md
```

עקרון: **Cardcom `GetLpResult` = מקור האמת לתשלום.** אל תסמן `paid` ידנית בלי אימות סליקה.

Package manager: **pnpm**. שורש אפליקציה מאושר לפרוד:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

---

## 0. מי עושה מה

| תפקיד | מותר | אסור |
|---|---|---|
| Support | קריאת הזמנות/שוברים; פתיחת פנייה; ביטול לפי מדיניות אם הוגדר | mark paid; refund מלא בלי admin; שינוי ledger |
| Admin | refund מאושר; אישור ספק; reconcile אחרי אימות Cardcom | מיגרציית prod בלי MCP; המצאת עמלה |
| Super admin | כל האדמין + kill switch checkout | לדלג על גיבוי לפני DDL |

---

## 1. בדיקת reconciliation (יומי)

### 1.1 מטרה

לוודא שכל חיוב שעלה ב-Cardcom יש לו הזמנה `paid` + payment `succeeded` + (לקופון) voucher `issued`.

### 1.2 שאילתות בוקר (Supabase SQL)

**א. הזמנות תקועות (שולמו כנראה, לא נסגרו):**

```sql
select id, status, created_at, now() - created_at as age
from public.orders
where status not in ('paid', 'refunded', 'cancelled')
  and created_at > now() - interval '2 days'
  and created_at < now() - interval '30 minutes'
order by created_at desc;
```

צפי: **0 שורות**.

**ב. payments מול orders:**

```sql
select p.id, p.status, p.cardcom_transaction_id, p.order_id, o.status as order_status
from public.payments p
left join public.orders o on o.id = p.order_id
where p.created_at > now() - interval '2 days'
  and (
    p.status = 'succeeded' and (o.status is distinct from 'paid')
    or p.status <> 'succeeded' and o.status = 'paid'
  );
```

צפי: **0 שורות** (או רשימת חריגים מתועדת).

**ג. קופון ששולם בלי שובר:**

```sql
select oi.id as order_item_id, oi.order_id, oi.product_type, oi.item_status
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status = 'paid'
  and oi.product_type = 'coupon'
  and oi.created_at > now() - interval '2 days'
  and not exists (
    select 1 from public.vouchers v
    where v.order_item_id = oi.id
  );
```

(אם הטבלה החייה היא `coupon_codes` בסביבה מסוימת, להריץ מקבילה עליה. יעד: `vouchers`.)

### 1.3 מה עושים כשיש פער

1. מצא `cardcom_low_profile_id` / transaction מ-`payments` או מלוג webhook.
2. קרא **GetLpResult** (או ממשק Cardcom החי). רק אם הסליקה הצליחה:
3. הרץ מסלול reconcile הרשמי בקוד (לא UPDATE ידני של `orders.status`).
4. אם הסליקה נכשלה אבל הלקוח חושב ששילם: תיעוד + פנייה ללקוח; אל תנפיק שובר.
5. רשום ביומן תפעול: order id, tx id, פעולה, מי ביצע.

פירוט kill switch / rollback: `RUNBOOK-PRODUCTION.md`.

### 1.4 רשימת בדיקה יומית

- [ ] שאילתות א-ג = ריק או מטופל  
- [ ] Sentry: אין spike ב-webhook / finalize  
- [ ] Vercel: ה-deploy האחרון ירוק  

---

## 2. טיפול בהחזר (refund)

### 2.1 לפני הכל

1. קרא `LEGAL-CONTENT.md` חלק ב + `ARCHITECTURE-LEGAL-COMPLIANCE.md`.
2. בדוק מצב voucher: `issued` / `redeemed` / `expired`.
3. חשב דמי ביטול רק אם הדין מתיר: `min(5%, 100 ₪)` מהסכום ששולם **באתר**. פגם/אי-אספקה → 0.
4. Support מעביר ל-admin אם נדרש chargeback או חריג.

### 2.2 זרימה תפעולית

```text
בקשת לקוח (/cancel או פנייה)
  → בדיקת זכאות (14 יום, מצב שובר, סוג מוצר)
  → אישור admin
  → RefundByTransactionId / מסלול Cardcom הרשמי בקוד
  → עדכון payment + order + voucher (refunded) דרך הפעולה בשרת
  → פיזי בלבד: supplier_debit / קיזוז payout אם כבר payable (ראה PAYOUT-MECHANISM)
```

אסור:

- זיכוי ידני ב-Cardcom בלי רשומת מערכת  
- סימון `refunded` ב-DB בלי קריאת סליקה  
- "החזר Escrow לספק" על קופון (אין מסלול כזה)

### 2.3 אחרי החזר

- [ ] הלקוח קיבל אימייל / הודעה  
- [ ] שובר לא ניתן לסריקה  
- [ ] reconciliation למחרת לא מדווח פער על אותו tx  

### 2.4 Chargeback

העבר מיד ל-admin/super_admin. שמור צילומי מסך, GetLpResult, ויומן מימוש אם יש. אל תתווכח מול חברת האשראי בלי תיק מסודר.

---

## 3. ספק חדש: onboarding

מקור מחייב: `ARCHITECTURE-SUPPLIER-ONBOARDING.md`.

### 3.1 צ'קליסט אישור

| שלב | בדיקה | Pass |
|---|---|---|
| 1 | בקשה `pending` עם עוסק/ח.פ, טלפון, כתובת, לוגו | [ ] |
| 2 | אין כפילות ספק חשודה | [ ] |
| 3 | Admin מאשר → נוצרים `suppliers` + `supplier_members(owner)` | [ ] |
| 4 | מייל welcome נשלח | [ ] |
| 5 | פרטי בנק הוזנו לפני payout פיזי (לא חוסם סריקת קופונים) | [ ] |
| 6 | סורק ניסיון (עובד `scanner`) על שובר sandbox/טסט | [ ] |

### 3.2 מוצר ראשון

- חובה `platform_percent` פר מוצר (בלי default).  
- קופון: `coupon_price` מוחלט; גילוי יתרה בעסק ב-PDP.  
- אין להבטיח לספק "שחרור מקדמה מהפלטפורמה" על קופון.

### 3.3 דחייה

דחייה עם סיבת טקסט חובה + אפשרות הגשה מחדש אחרי cooldown. תעד ב-audit.

---

## 4. קופון תקוע

### 4.1 אבחון מהיר

| סימפטום | בדיקה ראשונה |
|---|---|
| שולם, אין QR באזור אישי | האם קיים `vouchers` ל-`order_item`? (§1.2ג) |
| יש שובר, ספק לא מצליח לסרוק | סטטוס שובר; שייכות ספק; תוקף `expires_at` |
| "כבר מומש" בטעות | `redeemed_at` + מי סרק; FRAUD אם חשוד |
| סטטוס `issued` אבל הלקוח רואה שגיאה | קאש/CDN; רענון אזור אישי; השוואת user_id |

### 4.2 תרחיש א: תשלום עבר, שובר לא הונפק

1. אמת Cardcom (GetLpResult).  
2. אם succeeded: הרץ reconcile/finalize הרשמי.  
3. אם נכשל באמצע issue: בדוק לוג Sentry ל-`issueVoucher`; תקן חוסר טבלה/RLS רק דרך תהליך מיגרציה מאושר (MCP).  
4. אל תיצור שורת voucher ידנית ב-SQL אלא אם יש נוהל חירום כתוב + אישור super admin.

### 4.3 תרחיש ב: שובר קיים, סריקה נכשלת

1. ודא שהמשתמש הסורק הוא `supplier_member` של אותו `supplier_id`.  
2. ודא סטטוס `issued` ולא `redeemed`/`expired`/`refunded`.  
3. בדוק שעון מכשיר / תוקף.  
4. אם כפל סריקה: ההגנה היא ייחוד הצלחה ב-`voucher_redemptions`; הסבר לספק שהמימוש כבר נרשם.

### 4.4 תרחיש ג: לקוח טוען שלא מומש, ספק טוען שכן

1. הצג לשני הצדדים `redeemed_at` + מזהה סריקה.  
2. אין "שחזור" שובר ל-`issued` בלי החלטת fraud/admin מתועדת.  
3. כסף: קופון לא מייצר payout מהפלטפורמה; מחלוקת יתרה בעסק היא בין לקוח לספק.

### 4.5 אחרי תיקון

- [ ] הלקוח רואה QR / סטטוס נכון  
- [ ] הספק סורק בהצלחה פעם אחת  
- [ ] אין כפילות voucher לאותו `order_item`  

---

## 5. אזעקות שמחייבות עצירה

עצור מכירות חדשות (`CHECKOUT_ENABLED=false` או הדגל החי) אם:

1. Cardcom מחזיר כשל המוני  
2. כל ה-webhooks נכשלים > 15 דקות  
3. finalize יוצר חיוב בלי שובר באופן שיטתי  
4. חשד דליפת מפתחות  

לאחר מכן: `RUNBOOK-PRODUCTION.md` + הודעה ללקוחות דרך תמיכה.

---

## 6. יומן תפעול (תבנית)

```text
תאריך:
משמרת:
reconciliation: OK / פערים (IDs):
החזרים שבוצעו (order_id, סכום, דמי ביטול):
ספקים שאושרו / נדחו:
קופונים תקועים שטופלו:
Sentry / Vercel:
חתימה:
```

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | Runbook אחרי השקה: reconcile, refund, onboarding, קופון תקוע |
