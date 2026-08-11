# ארכיטקטורה: מערכת עיצוב (Design System)

טוקנים, RTL, רכיבים משותפים ל-storefront/admin/supplier.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-ACCESSIBILITY.md
docs/COMPONENT-INVENTORY.md
docs/DESIGN-CHECKLIST-FINAL.md
```

מודל כסף: תצוגת ₪ בלבד ב-UI; חישוב באגורות מאחורי הקלעים (MONEY).

---

## 0. החלטה

| # | הכרעה |
|---|---|
| DS1 | UI עברית `dir=rtl` בכל משטחי לקוח/ספק/אדמין. |
| DS2 | צבעי מותג דרך CSS variables / טוקנים; אסור hex גולמי ברכיבים חדשים. |
| DS3 | טיפוגרפיה לפי storefront הקיים (Heebo וכד׳); לא Inter כברירת AI. |
| DS4 | יעדי מגע ≥44px במובייל. |
| DS5 | כסף ב-UI: `formatIls`; לא להציג agorot ללקוח. |
| DS6 | שער ויזואלי: compare בית מתחת ל-11% מול refs. |
| DS7 | אין ניסוח Escrow בקופי. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| עיצוב dark-first / סגול גנרי | לא תואם מותג חי. |
| כרטיסים בכל מקום | רק כשיש אינטראקציה (כללי frontend). |
| LTR על טפסים שלמים | שובר עברית; רק שדות מספר `dir=ltr`. |

---

## 2. סכמת DB

אין. טוקנים ב-CSS/TS.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `cls_badge` | hydrate עגלה בלי קפיצה |
| `hex_drift` | לינט/ביקורת דוחה |
| `ltr_form` | אסור על מעטפת |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | ספריית רכיבים מאוחדת admin/supplier | להרחיב קיים; לא שכתוב |
| O2 | מצב כהה | אין ב-V1 |

עודכן: 2026-08-12.

---

## 5. Acceptance

- [ ] RTL + טוקנים  
- [ ] כסף ב-₪  
- [ ] חלופות + קצה + פתוחות  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING לפי תבנית |
