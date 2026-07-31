# ARCHITECTURE-CUSTOMER-SUPPORT.md

ארכיטקטורת **תמיכת לקוחות**: טיקטים, החזרים, ביטול קופון, מדיניות כסף.

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
Companions: checkout-cardcom, coupon-redemption, legal, notifications V2, AI-AGENTS-SUPPORT, `MASTER-ARCHITECTURE-v2.md`.

Stack: `/admin/support`, Resend, RLS, עברית RTL.

---

## 0. הקשר עסקי לתמיכה

| כלל | משמעות לנציג |
|---|---|
| פלטפורמה ≠ ספק | KE מחברת; הספק מספק את השירות/המוצר |
| קופון | הלקוח שילם באתר את **מלוא** `coupon_price`; יתרה בבית העסק בסריקה |
| אין Escrow | אין "שחרור נאמן"; המקדמה נשארת בפלטפורמה |
| `platform_percent` | דינמי מצולם; לא להמציא 5%/10% בשיחה |
| פיזי | משלוח באחריות ספק; פיצול ledger פנימי |

מקרו תשובות מותרים: "שולם באתר", "יתרה בבית העסק". אסורים: Escrow, נאמן, "נחזיר לספק את המקדמה אוטומטית".

---

## 1. ערוצים וטיקטים

- צ'אט באתר / אימייל (Resend דו-כיווני) / WhatsApp עתידי.
- מודל: `support_tickets` + `support_messages` (ראה מפרט קודם ב-rev ישן: סטטוסים new→open→pending_*→resolved→closed).
- SLA: urgent תשלום/הונאה 30 דק׳ לתגובה ראשונה; רגיל לפי טבלת SLA ב-admin.
- לקוח רואה רק את הטיקטים שלו (RLS).

---

## 2. מדיניות החזרים (Refunds)

### 2.1 עקרונות

1. נציג **פותח בקשה**; ביצוע כסף רק דרך `refund` server path / אדמין כספים (לא מהצ'אט ישירות בלי tool מאושר).
2. סכום ההחזר ≤ מה שנגבה באתר (Cardcom / ארנק), באגורות.
3. יתרה ששולמה בבית העסק **לא** מוחזרת דרך KE (הלקוח מול העסק).
4. כל החזר: `payment_events` / audit + הודעה ללקוח.

### 2.2 מטריצה

| מצב | החזר לכרטיס/ארנק דרך KE | הערות |
|---|---|---|
| הזמנה `pending` לא שולמה | לא רלוונטי | ביטול הזמנה |
| קופון כל ה-vouchers בסטטוס `issued` | כן (מדיניות + חוק) | בטל שוברים לפני/עם ההחזר |
| קופון לפחות אחד `used` (נסרק) | **לא** על החלק שמומש | חריגים רק אדמין+ספק בכתב |
| קופון `expired` שכבר זוכה לארנק (C6) | לא להחזיר שוב לכרטיס על אותו סכום | מניעת כפל |
| פיזי לפני `shipped` | כן בדרך כלל | תיאום מלאי עם ספק |
| פיזי אחרי `shipped` | לפי דין + תנאי ספק | RMA / תמיכה |
| כשל Cardcom / חיוב כפול | כן (SEV) | reconciliation |

### 2.3 מסלול תפעולי

```
Ticket → verify order_id + voucher statuses
  → classify (§2.2)
  → if allowed: admin runs refund action (Cardcom + ledger)
  → mark vouchers refunded/cancelled
  → notify customer (Resend)
  → close ticket with audit link
```

אסור לנציג להבטיח החזר שחורג מהמטריצה בלי אישור בעלים.

---

## 3. ביטול קופון (Cancel voucher)

| מצב voucher | ביטול אפשרי? | תוצאה |
|---|---|---|
| `issued` + בתוך מדיניות ביטול | כן | status → `refunded` או `cancelled`; כסף לפי §2 |
| `issued` אחרי תום חלון ביטול החוקי/החוזי | לפי legal.md | לעיתים זיכוי ארנק במקום כרטיס |
| `used` | לא (ברירת מחדל) | הלקוח מימש אצל הספק |
| `expired` | לא כ"ביטול"; כבר C6 ארנק אם רץ | |
| Replay redeem | לא מבטל; מסביר שכבר מומש | |

**חלון ביטול (יעד מוצר):** מיושר ל-`ARCHITECTURE-LEGAL.md` (למשל 14 יום לעסקאות מסוימות). התמיכה לא ממציאה חלון; מצטטת את המסמך החי.

ביטול יזום ע"י לקוח מ-`/account`: אופציונלי ב-soft-launch; עד אז רק דרך טיקט.

---

## 4. מקרי שיחה נפוצים (מקרו)

| נושא | תשובת ליבה |
|---|---|
| "למה שילמתי רק X ולא את מלוא המחיר?" | X הוא מחיר הקופון באתר; היתרה משולמת בבית העסק בעת הסריקה |
| "מתי הספק מקבל את מה ששילמתי באתר?" | סכום האתר נשאר בפלטפורמה; הספק גובה את היתרה בעסק. אין Escrow |
| "הקופון לא נסרק" | בדיקת תוקף, סטטוס, ספק נכון; לא להנפיק קוד חדש בלי אדמין |
| "רוצה לבטל" | בדיקת סטטוס → מטריצת סעיפים 2 ו-3 |
| "הארנק" | קרדיט אתר בלבד; לא משיכה לבנק |

---

## 5. אסקלציה

| מקרה | למי |
|---|---|
| חשד הונאה / chargeback | בעלים + payments SEV |
| ספק מסרב לכבד קופון תקף | אדמין ספקים + supplier portal |
| באג כסף (סכום לא תואם) | הנדסה + reconciliation |
| בקשת מחיקת חשבון | privacy / account deletion flow |

AI CS agent (אם דולק): רק tools עם RLS; refund = human approve (`ARCHITECTURE-AI-AGENTS-SUPPORT.md`).

---

## 6. אבטחה

- אין PAN בטיקט; redaction אוטומטי על דפוסי כרטיס.
- נציג לא רואה `cardcom_token`.
- הערות פנימיות לא נשלחות ללקוח.

---

## 7. מדדים

| KPI | הגדרה |
|---|---|
| First response time | לפי SLA |
| % טיקטי ביטול קופון שאושרו | |
| Refund volume (agorot) | יומי |
| מקרי "Escrow confusion" | → לשפר הדרכה/מקרו |

---

## 8. טסטים

| # | תרחיש |
|---|---|
| CS1 | ביטול קופון issued → refund + status |
| CS2 | ביטול אחרי used נחסם |
| CS3 | מקרו לא כוללים מילת Escrow |
| CS4 | RLS: לקוח א לא רואה טיקט של ב |

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-29 | Tickets / Resend / SLA ראשוני |
| 2026-07-31 | rev C: Refund matrix, coupon cancel policy, macros, money rules |
