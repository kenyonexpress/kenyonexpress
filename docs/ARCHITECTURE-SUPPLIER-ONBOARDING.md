# ARCHITECTURE: Supplier Onboarding

ארכיטקטורת גיוס, אימות ו-go-live של ספקים ב-KenyonExpress.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md
docs/LEGAL-CHECKLIST.md
docs/ARCHITECTURE-ADMIN-REPORTS.md
docs/RUNBOOK-OPERATIONS.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| O1 | ספק לא עולה לאוויר בלי אימייל תפעולי + אישור אדמין. |
| O2 | לכל מוצר פיזי לפני publish: `platform_percent` דינמי (בלי ברירת מחדל קשיחה בקוד). |
| O3 | לכל קופון לפני publish: `coupon_price` (אגורות/ILS מוחלט) + יתרה בעסק ברורה. |
| O4 | כסף: Escrow פנימי 2026-07-27. מקדמת קופון: עמלה לפי snapshot; יתרת מקדמה ב-held עד מימוש. יתרת face בקופה. אין "נאמן חיצוני". |
| O5 | אין עמלת 5%/10% קבועה כברירת מחדל בחוזה או במערכת. |
| O6 | כסף ב-DB: integer agorot. הצגה לספק: ₪. |
| O7 | חבר ספק: `supplier_members` + Google. Scanner לא מנהל כסף. |

---

## 1. זרימת רישום (end-to-end)

```text
Lead / פנייה
  → טופס רישום (§2)
  → אימות מסמכים / KYC קל (§3)
  → יצירת suppliers (status=pending)
  → הזמנת owner ל-supplier_members (Google)
  → חתימה/אישור תנאי חוזה (§4)
  → הגדרת platform_percent / coupon_price למוצרים (§5)
  → מוצרים draft → אישור אדמין → published
  → suppliers.status = active
  → הדרכת סורק QR + שבוע ראשון
```

| שלב | בעלים | יציאה |
|---|---|---|
| Lead | מכירות / בעלים | טופס מלא |
| Verification | אדמין | מסמכים תקינים |
| Account | אדמין | שורת supplier + member owner |
| Contract | ספק + אדמין | אישור תנאים מתועד |
| Catalog | ספק + אדמין | ≥1 מוצר מאושר עם כסף תקין |
| Live | אדמין | `active` + גישה לפורטל |

השעיה: `suspended` → unpublish מוצרים + חסימת סורק.

### 1.1 SLA פנימי

| שלב | יעד | אם חורג |
|---|---|---|
| סקירת מסמכים | 2 ימי עסקים | תזכורת אדמין |
| אישור מוצר ראשון | 1 יום עסקים אחרי הגשה תקינה | Ntfy / תור admin |
| הפעלה ל-active | באותו יום אחרי מוצר מאושר | בעלים |

---

## 2. טופס רישום (שדות חובה)

| שדה | חובה | הערות |
|---|---|---|
| שם עסק (עברית) | כן | מוצג ב-PDP |
| ח.פ. / ע.מ. | כן | אימות מול מסמך |
| שם איש קשר | כן | |
| אימייל תפעולי | כן | התראות מכירה / סריקה |
| טלפון | כן | E.164 |
| כתובת סניף ראשי | כן | |
| עיר / אזור | כן | פילטרי קטלוג |
| סוג עיסוק | כן | מסעדה / קמעונאות / … |
| פרטי בנק (payout) | כן לפני payout ראשון | לא חובה ל-pending ראשוני אם מדיניות מאפשרת |
| הסכמה לתנאי ספק | כן | timestamp + version |

מסמכים מצורפים (R2 private):

- צילום ת.ז. / דרכון של מורשה חתימה (או תחליף שcounsel מאשר)
- אישור ניהול חשבון / עוסק מורשה
- תפריט / מחירון לדוגמה (אופציונלי לקופון)

---

## 3. Verification (אימות)

### 3.1 בדיקות אדמין

| בדיקה | פעולה |
|---|---|
| זהות עסק | התאמת ח.פ. לשם |
| אימייל | reachable; לא דומיין חד-פעמי חשוד |
| כפילות | אין supplier פעיל עם אותו ח.פ. |
| סיכון | דגל ידני אם יש היסטוריית fraud |

סטטוסים:

```text
lead → pending_review → pending_contract → pending_catalog → active
                                                      ↘ suspended
                                                      ↘ rejected
```

### 3.2 חברי צוות

| role | יכולות |
|---|---|
| owner | כסף, מוצרים, חברים, סריקה |
| manager | מוצרים, סריקה, דוחות |
| scanner | סריקה בלבד |

הזמנה: לינק / אימייל → Google OAuth → שורה ב-`supplier_members`.

---

## 4. תנאי חוזה (Contract terms)

מסמך תנאי ספק (עברית) חייב לכלול לפחות:

1. פלטפורמה מחברת; הספק אחראי לתיאור השירות/המוצר ולמימוש.
2. קופון: לקוח משלם `coupon_price` באתר; יתרה בבית העסק; חלק הפלטפורמה לפי `platform_percent` מצולם; יתרת המקדמה לספק ב-held עד מימוש (Escrow פנימי).
3. פיזי: תשלום מלא באתר; עמלה לפי snapshot; payout לפי מדיניות (למשל T+N אחרי hold).
4. אין הבטחת עמלה קבועה 5%/10%.
5. חובת עדכון מלאי / תוקף קופון.
6. סנקציות: השעיה על fraud / אי-מימוש שיטתי.
7. גרסת מסמך (`contract_version`) + `accepted_at` על הספק.

אסור בנוסח לספק: "קיבלתם את כל המקדמה מיד בלחיצה".

---

## 5. הגדרת `platform_percent` למוצר

### 5.1 כללים

| סוג מוצר | לפני publish |
|---|---|
| physical | `platform_percent` חובה (למשל 0–100, precision מוגדר ב-DB); אין default שקט בקוד |
| coupon | `coupon_price` חובה; `platform_percent` על המקדמה; הצגת יתרה בעסק ב-PDP |

שינוי אחוז אחרי מכירות:

- משפיע רק על הזמנות **חדשות**
- הזמנות קיימות: snapshot ב-`order_items` בלבד
- שינוי מהותי: דורש אישור אדמין או לפחות audit log

### 5.2 ממשק אדמין / ספק

```text
/admin/suppliers/[id]     סטטוס, חוזה, חברים
/admin/products/[id]      platform_percent, coupon_price, approve
/supplier/products        draft → submit for review
```

שער publish:

```text
IF physical AND platform_percent IS NULL → block
IF coupon AND coupon_price missing/invalid → block
IF supplier.status NOT IN (pending_catalog, active) → block
IF admin_approval missing → block
```

---

## 6. Admin approval pipeline

```text
Supplier submits product (draft → pending_review)
  → Admin queue /admin/products?status=pending_review
  → Checks: copy Hebrew, images, money fields, legal coupon terms
  → Approve → published (+ revalidatePath / tags)
  → Reject → draft + reason (עברית)
```

Checklist אדמין למוצר:

- [ ] שם + תיאור בעברית
- [ ] תמונות תקינות (R2)
- [ ] כסף תקין (§5)
- [ ] תנאי קופון (תוקף, יתרה, מה כלול) אם coupon
- [ ] קטגוריה / brand
- [ ] ספק `active` או מאושר למוצר ראשון

אחרי מוצר ראשון מאושר: מעבר ספק ל-`active` (ידני או אוטומטי לפי מדיניות).

---

## 7. הדרכה לפני Live

| נושא | תוכן |
|---|---|
| כסף | שולם באתר / יתרה בעסק / אין payout על קופון לפני מימוש |
| סורק | `/scan`, roles, already_used |
| פורטל | הזמנות פיזיות, מלאי |
| תמיכה | מתי להפנות לקוח ל-KE מול לטפל בעסק |

---

## 8. טסטים / Acceptance

| # | בדיקה |
|---|---|
| T1 | pending בלי אישור אדמין לא מופיע בקטלוג |
| T2 | publish פיזי בלי `platform_percent` נחסם |
| T3 | publish קופון בלי `coupon_price` נחסם |
| T4 | שינוי אחוז לא משנה snapshot בהזמנה ישנה |
| T5 | scanner לא יכול לערוך `platform_percent` |

Acceptance:

- [ ] זרימת רישום → verification → contract → product approval → active מתועדת
- [ ] תנאי חוזה תואמים Escrow 2026-07-27
- [ ] pipeline אישור אדמין עם reject reason בעברית

---

## 9. Out of scope

- חוזה משפטי סופי (counsel)
- payout בנקאי אוטומטי מלא
- onboarding self-serve בלי אדמין (עתידי)

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-07-31 | rev C ב-ke-arch |
| 2026-08-03 | Refresh על arch/docs-queue: Escrow 2026-07-27, approval pipeline, platform_percent |
