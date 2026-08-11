# ארכיטקטורה: דף קטגוריה

סינון, מיון, pagination וכרטיסי מוצר ב-`/category/[slug]` (RTL, SEO, server-driven).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-SEO.md
docs/CATEGORY-1TO1-FINDINGS.md
```

הערה: מפרט 2026-07-30 עם TypeScript מלא הוחלף במפרט ארכיטקטוני. יישום חי ב-`src/`.

מודל כסף: **No Escrow**. כרטיס מציג מחיר אתר (coupon_price / מחיר אחרי הנחה); לא `platform_percent` ללקוח.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| CP1 | URL = מקור אמת לסינון/מיון/עמוד (`?page&sort&min&max&supplier&type`). |
| CP2 | רינדור שרת (RSC); לא סינון-לקוח בלבד לקטלוג גדול. |
| CP3 | RTL + logical CSS; יעד ויזואלי מול electro shop-archive. |
| CP4 | SEO: metadata, canonical, JSON-LD ItemList/CollectionPage. |
| CP5 | מוצרים: רק `status=active` ולא מחוקים. |
| CP6 | כרטיס: שם, תמונה, מחיר אתר, badge סוג (קופון/פיזי), קישור PDP. |
| CP7 | בלי Escrow בקופי/UI. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| סינון מלא ב-client על כל הקטלוג | ביצועים/SEO. |
| הצגת עמלת פלטפורמה בכרטיס | לא ללקוח. |
| דשבורד-לייק עם סטטיסטיקות ב-viewport ראשון | לא תואם חנות. |

---

## 2. סכמת DB

`categories`, `products`, `product_categories`, `suppliers` (לסינון). אין DDL כאן.

---

## 3. רכיבים לוגיים

| רכיב | תפקיד |
|---|---|
| Sidebar | עץ קטגוריות / ספק / טווח מחיר |
| Sort bar | מיון + ספירת תוצאות |
| Grid + card | מוצרים |
| Pagination | שרת |

---

## 4. מקרי קצה

| קוד | תוצאה |
|---|---|
| `empty_filter` | empty state עברית |
| `invalid_slug` | 404 |
| `stale_price_in_card` | מחיר חי מ-DB בבקשה |
| `coupon_without_price` | לא מוצג/לא priceable |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | פאסטות facets נוספות | רק מה שבייצור היום |
| O2 | infinite scroll | pagination מספרי ב-V1 |

עודכן: 2026-08-12.

---

## 6. Acceptance

- [ ] URL-driven  
- [ ] No Escrow / בלי % ללקוח  
- [ ] תבנית מלאה  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | מפרט ענק + TS |
| 2026-08-12 | קיצור BINDING על arch/docs-batch-2 |
