# מדידת דף קופון (היסטורי)

סיכום BINDING למדידת UI של דף קופון. ה-dump המלא ב-git history.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

מסמכים קשורים:

```
docs/ARCHITECTURE-ADMIN-PRODUCT-FIELDS.md
docs/PRODUCT-PAGE-SPEC.md
scripts/compare.mjs
```

---

## 0. החלטה

| # | הכרעה |
|---|---|
| Q1 | שער ויזואלי: compare מול refs; יעד סף בית &lt;11%. |
| Q2 | מחיר באתר בכרטיס/PDP = coupon_price; יתרה בעסק מוצגת בנפרד. |
| Q3 | אין Escrow בקופי המדוד. |
| Q4 | מדידות גולמיות אינן מקור אמת מוצר; הארכיטקטורה גוברת. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| שמירת אלפי שורות probe כ-BINDING | רעש; history מספיק. |
| שינוי כסף לפי פיקסלים | MONEY גובר. |

---

## 2. סכמת DB

אין. מדידה על DOM בלבד.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `cls_badge` | hydrate זהיר |
| `price_mismatch_ui` | באג תצוגה; לבדוק מול DB |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | רענון מדידה אחרי שינוי hero | להריץ compare לפני GA UI |
| O2 | שמירת PNG בריפו | לא; artifacts מחוץ ל-git |

עודכן: 2026-08-12.

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | קיצור BINDING במקום dump מדידה |
