# ארכיטקטורה: הצטרפות ספק

הצטרפות ספק: מסמכים, פרטי בנק ל-payout, אישור אדמין, **סניפים ועובדים**.

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| O1 | אין מכירה בלי בקשה מאושרת + `suppliers` + `supplier_members(owner)`. |
| O2 | מסמכים מינימום לפני אישור: פרטי עוסק, טלפון, כתובת, לוגו. |
| O3 | פרטי בנק נדרשים לפני **payout פיזי**; לא חוסמים סריקת קופונים. |
| O4 | אישור/דחייה: admin בלבד; דחייה עם סיבה. |
| O5 | סניפים = ישויות משנה תחת אותו ספק (כתובת/טלפון/שעות). |
| O6 | עובדים = `supplier_members` עם תפקיד owner / manager / scanner. |
| O7 | UI הצטרפות בעברית RTL. |

---

## 1. מכונת מצבים

```text
הגשת בקשה → pending
  → approved → יצירת suppliers + owner membership + מייל welcome
  → rejected (סיבה) → אפשרות הגשה מחדש אחרי cooldown
```

בקשה `pending` אחת למשתמש (partial unique).

---

## 2. מסמכים ושדות

| שדה | חובה לאישור | חובה ל-payout |
|---|---|---|
| שם עסק בעברית | כן | |
| ח.פ / עוסק מורשה | כן | |
| טלפון + אימייל | כן | |
| כתובת + עיר + lat/lng | כן ל-publish | |
| לוגו | כן ל-publish | |
| אישור ניהול חשבון / פרטי בנק | | כן לפני payout פיזי |
| קבצים סרוקים | Storage פרטי; גישת admin/owner | |

---

## 3. סניפים

```text
supplier_branches (
  id, supplier_id,
  name_he, address, city, phone,
  lat, lng, hours_json,
  is_active, created_at
)
```

| כלל | פירוט |
|---|---|
| סניף ראשי | נוצר מכתובת הבקשה באישור |
| מוצר | יכול להצביע על סניף ברירת מחדל לתצוגת PDP / ניווט |
| Redeem | לפי `supplier_id` (העסק), לא חובה סניף ב-MVP; סניף נשמר ב-audit אם נבחר |
| הרשאה | owner/manager מנהלים סניפים; scanner רק קורא |

---

## 4. עובדים (חברי צוות)

| member_role | הרשאות |
|---|---|
| `scanner` | סריקה + היסטוריית מימושים |
| `manager` | scanner + הזמנות פיזיות + סניפים מוגבל |
| `owner` | manager + הזמנות עובדים + בנק + הגדרות |

זרימה:

1. Owner מזמין במייל/טלפון → שורת `supplier_members` (pending/active).  
2. המשתמש מתחבר ב-Google/OTP → מצטרף.  
3. Deactivate = `is_active=false` (חוסם redeem).  
4. Admin רואה את כל החברים במסך הספק.

---

## 5. אחרי אישור

1. הספק נכנס ל-`/supplier`.  
2. מוסיף סניפים ועובדים.  
3. אדמין משייך מוצרים / מאשר publish עם `platform_percent`.  
4. בנק מאומת → זכאות ל-payout פיזי.

---

## 6. Acceptance

- [ ] Approve יוצר owner membership  
- [ ] בנק לפני payout בלבד  
- [ ] סניפים מנוהלים בעברית  
- [ ] scanner/manager/owner מוגדרים וחוסמים ב-deactivate  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | הצטרפות + בנק + סניפים + עובדים |
