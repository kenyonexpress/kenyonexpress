# ארכיטקטורה: Search UX

Meilisearch, השלמות עברית, תוצאות בלי boost עמלה קבועה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.  
מודל כסף: **No Escrow**; אין boost `platform_percent` קבוע.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-SEARCH-DISCOVERY.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| SX1 | רלוונטיות טקסט + קטגוריה/עיר לפני כל אות כסף. |
| SX2 | אסור `coalesce(platform_percent, 10)` או boost margin קבוע. |
| SX3 | השלמות עבריות (ניקוד אופציונלי; כתיב חסר). |
| SX4 | מוצר לא זמין (מכסה 0): למטה או מוסתר. |
| SX5 | RTL מלא בתיבת חיפוש ובתוצאות. |
| SX6 | מחיר בכרטיס = live product (לא snapshot ישן). |
| SX7 | featured boost אדמין: שקוף; לא מוסתר. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| rank by platform revenue | SX2: לא margin boost. |
| LIKE SQL בלבד | Meilisearch typo tolerance. |
| hide coupon paid-on-site price | misleading; show both numbers. |
| search admin key in browser | S5 DISCOVERY: search-only anon. |
| infinite scroll without URL state | filters in query string. |

---

## סכמת DB

אין DDL. קריאה:

```text
products (published, stock, coupon_price_agorot, price_agorot)
Meilisearch index `products` (search-only key client-side via API)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | zero results | suggest categories; log analytics. |
| CE2 | stale index after publish | async worker; short stale OK. |
| CE3 | Hebrew typo "מסעדה" vs "msada" | tokenizer/synonyms. |
| CE4 | AI NLP rewrite fail | fallback raw query. |
| CE5 | guest vs member prices | same catalog prices; wallet at checkout. |
| CE6 | suspended supplier product | not searchable. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | personal search history | account opt-in. |
| O2 | voice search | out of scope. |
| O3 | A/B ranking | analytics. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #42 search UX |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
