# ארכיטקטורה: הצטרפות ספק

הצטרפות ספק: מסמכים, פרטי בנק ל-payout, אישור אדמין, סניפים ועובדים.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-B2B-SALES.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| O1 | אין מכירה בלי בקשה מאושרת + שורת `suppliers` + `supplier_members(owner)`. |
| O2 | מסמכים מינימום: עוסק/ח.פ, טלפון, כתובת, לוגו. |
| O3 | פרטי בנק חובה לפני payout פיזי; לא חוסמים סריקת קופונים. |
| O4 | אישור/דחייה: admin בלבד; דחייה עם סיבה חובה. |
| O5 | סניפים = ישויות משנה תחת אותו ספק. |
| O6 | עובדים = `supplier_members` עם `owner` / `manager` / `scanner`. |
| O7 | UI הצטרפות בעברית RTL. |
| O8 | **No Escrow:** קופון = אין payout מהפלטפורמה לספק; יתרה משולמת בבית העסק. פיזי = פיצול לפי `platform_percent` (פר מוצר, בלי default). אין נאמן/J5 של חברת אשראי. |

---

## 1. מכונת מצבים

```text
הגשה → pending
  → approved → suppliers + owner membership + מייל welcome
  → rejected (סיבה) → הגשה מחדש אחרי cooldown
```

בקשה `pending` אחת למשתמש.

---

## 2. מסמכים ופרטי בנק

| שדה | לאישור | ל-payout פיזי |
|---|---|---|
| שם עסק בעברית | כן | |
| ח.פ / עוסק | כן | |
| טלפון + אימייל | כן | |
| כתובת, עיר, lat/lng | כן ל-publish | |
| לוגו | כן ל-publish | |
| חשבון בנק + אישור ניהול | | כן |
| קבצים סרוקים | Storage פרטי (admin/owner) | |

---

## 3. סניפים

```text
supplier_branches (
  id, supplier_id, name_he, address, city, phone,
  lat, lng, hours_json, is_active
)
```

סניף ראשי נוצר מכתובת הבקשה. Owner/manager מנהלים; scanner קורא בלבד. Redeem לפי `supplier_id`; סניף נשמר ב-audit אם נבחר.

---

## 4. עובדים

| תפקיד | הרשאות |
|---|---|
| `scanner` | סריקה + היסטוריית מימושים |
| `manager` | scanner + הזמנות פיזיות + סניפים |
| `owner` | manager + הזמנת עובדים + בנק + הגדרות |

הזמנה → membership → התחברות Google/OTP.  
`is_active=false` חוסם redeem. Admin רואה את כל החברים.

---

## 5. אחרי אישור

1. כניסה ל-`/supplier`  
2. הוספת סניפים ועובדים  
3. אדמין משייך מוצרים עם `platform_percent`  
4. בנק מאומת → זכאות payout פיזי  

---

## 6. Acceptance

- [ ] Approve יוצר owner  
- [ ] בנק לפני payout בלבד  
- [ ] סניפים ועובדים בעברית RTL  
- [ ] deactivate חוסם סריקה  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | חידוד הצטרפות: מסמכים, בנק, סניפים, עובדים |
| 2026-08-06 | QA: O8 No Escrow + `platform_percent`; קישורים B2B/PRICING |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
