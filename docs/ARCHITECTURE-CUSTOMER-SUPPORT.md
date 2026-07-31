# ARCHITECTURE-CUSTOMER-SUPPORT.md

ארכיטקטורת **שירות לקוחות**: טיקטים, החזרים, ביטול קופון, מדיניות.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev C)  
Scope: docs בלבד.  
Companions: legal, checkout-cardcom, coupon-redemption, account-area, AI-AGENTS-SUPPORT, shipping-returns, `MASTER-ARCHITECTURE-v2.md`.

---

## 0. מודל כסף לתמיכה (דורס מקרואים)

| כלל | מה אומרים ללקוח / סוכן |
|---|---|
| קופון | שילמת באתר את מחיר הקופון במלואו; יתרה משולמת בבית העסק בסריקה |
| אין Escrow | אין "שחרור נאמן"; המקדמה לא מוחזקת לספק |
| `platform_percent` | דינמי; לא ממציאים 5%/10%; לא מסבירים ללקוח את מרווח הספק |
| ארנק | קרדיט אתר בלבד; לא משיכה לבנק |
| סוכן | לא מבצע charge/refund בלי מסלול כסף מאושר |

---

## 1. ערוצים וטיקטים

ערוצים: צ'אט באתר, אימייל (Resend), WhatsApp עתידי, הערות פנימיות.  
מודל: `support_tickets` + `support_messages` (סטטוסים: open → pending → waiting_customer → resolved → closed).  
SLA: first response / resolution לפי עדיפות (פירוט טכני נשמר מהמפרט הקודם; לא חוסם מדיניות כסף).

RLS: לקוח רואה רק את שלו; staff לפי RBAC; ספק לא כותב לטיקטי KE.

---

## 2. מדיניות החזרים (Refunds)

### 2.1 עקרונות

1. Refund כספי לכרטיס רק דרך `refund` server path + Cardcom על אותו `cardcom_account_key`.
2. אלטרנטיבה: זיכוי ארנק פנימי (במיוחד פקיעת קופון C6).
3. כל החלטה נרשמת ב-`audit_log` + הודעה ללקוח.
4. סוכן AI יכול לפתוח בקשה; **אדם מאשר** לפני כסף (חוץ מפקיעה אוטומטית).

### 2.2 מטריצה

| מצב | החזר לכרטיס | זיכוי ארנק | הערות |
|---|---|---|---|
| הזמנה `pending` / לא שולמה | לא רלוונטי | לא | ביטול הזמנה |
| קופון כל ה-vouchers עדיין `issued` | מותר (מדיניות + חוק) | מותר כחלופה | לפני מימוש |
| קופון אחד `used` | בדרך כלל **לא** על הסכום ששולם באתר | לא אוטומטי | יתרה בעסק כבר לא אצלנו |
| קופון `expired` בלי מימוש | לא חובה לכרטיס | **כן** מלא (C6) | cron |
| פיזי לפני שליחה | מותר דרך תמיכה | אופציה | תיאום מלאי |
| פיזי אחרי שליחה | לפי דין + תנאי ספק | נדיר | ראה shipping-returns |
| חיובי כפול / באג | כן | לפי מקרה | SEV1 |

### 2.3 תהליך תפעולי

```
Ticket → אימות זהות + order/voucher
  → בדיקת סטטוסים (issued/used/expired/shipped)
  → בחירת מסלול (card refund / wallet / deny + הסבר)
  → אישור admin כסף
  → ביצוע refund action
  → הודעה ללקוח + סגירת טיקט
```

---

## 3. ביטול קופון

| בקשה | תנאי | תוצאה |
|---|---|---|
| ביטול לפני מימוש | כל היחידות `issued`; תוך חלון מדיניות/חוק | refund או wallet; vouchers → `refunded` |
| ביטול אחרי סריקה | voucher `used` | דחייה סטנדרטית; סכסוך מול העסק לא דרך "שחרור פלטפורמה" |
| ביטול חלקי (qty>1) | רק יחידות שעדיין issued | refund יחסי לפי snapshot |
| חשד הונאה | חסימת redeem + חקירה | ראה fraud-rate-limits |

מקרואים אסורים: "נשחרר את ה-Escrow", "נעביר לספק את המקדמה", "העמלה היא 10%".

מקרואים מאושרים:

- "הקופון בוטל והזיכוי בוצע לארנק / לכרטיס."
- "הקופון כבר מומש בעסק; לא ניתן לבטל את התשלום באתר אוטומטית."
- "קופון שפג בלי מימוש מזוכה לארנק האתר."

---

## 4. מדיניות תמיכה כללית (סיכום לסוכן)

1. זיהוי: אימייל Google / מספר הזמנה / קוד קופון.
2. הצגת context: סטטוס הזמנה, vouchers, שולם באתר, יתרה בעסק (מ-snapshot).
3. לא לחשוף `platform_percent` / מרווח ספק ללקוח.
4. מחלוקת על שירות בעסק אחרי סריקה: תיווך; לא תשלום כפול מהפלטפורמה כברירת מחדל.
5. פיזי: סטטוס משלוח מספק; החזרות לפי shipping-returns + legal.
6. שדרוג לאדם: תשלומים, חשד הונאה, סכום מעל סף, איומים משפטיים.

---

## 5. מקרואים + AI

- ספריית מקרואים בעברית ב-`/admin/support`.
- AI CS: ראה `ARCHITECTURE-AI-AGENTS-SUPPORT.md` (tools + handoff).
- כל מקרוא כסף עובר review אנושי פעם ברבעון.

---

## 6. מדדים

| KPI | הגדרה |
|---|---|
| First response time | חציון |
| Refund approve latency | זמן עד ביצוע אחרי אישור |
| Coupon cancel rate | ביטולים / קופונים שנמכרו |
| Reopen rate | טיקטים שנפתחו מחדש |
| Wrong Escrow language | audit מדגמי (יעד 0) |

---

## 7. טסטים

| # | תרחיש |
|---|---|
| CS1 | ביטול קופון issued → refund/wallet + status refunded |
| CS2 | בקשת ביטול אחרי used → נדחה עם מקרוא מאושר |
| CS3 | פקיעה → ארנק בלי כרטיס |
| CS4 | סוכן לא יכול לקרוא טיקט של משתמש אחר |
| CS5 | מקרוא לא כולל Escrow |

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-07-29 | Tickets + channels architecture |
| 2026-07-31 | rev C: refunds matrix, coupon cancel policy, money macros |
