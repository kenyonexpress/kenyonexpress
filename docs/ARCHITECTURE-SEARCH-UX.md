# ארכיטקטורה: חיפוש UX (Search UX)

Meilisearch/השלמות, כתיב עברי, ותוצאות בלי boost עמלה קבועה.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #42/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. דירוג חיפוש **לא** לפי `platform_percent` קבוע או margin נגזר מ-10%.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| SX1 | רלוונטיות טקסטualית + קטגוריה/עיר לפני כל אות כסף. |
| SX2 | אסור `coalesce(platform_percent, 10)` או boost עמלה קבועה. |
| SX3 | השלמות עבריות (ניקוד אופציונלי; כתיב חסר). |
| SX4 | מוצרים לא זמינים (מכסה 0) מדורגים למטה או מוסתרים לפי מדיניות. |
| SX5 | RTL מלא בתיבת חיפוש ובתוצאות. |

---

## 1. משפך UI

```text
הקלדה → debounce → suggest
  → Enter / בחירה → דף תוצאות
  → פילטרים: קטגוריה, עיר, סוג (coupon/physical)
  → כרטיס מוצר עם מחיר חי (לא snapshot ישן)
```

---

## 2. דירוג

| אות | מותר |
|---|---|
| התאמת שם/תיאור | כן |
| קטגוריה / תגיות | כן |
| זמינות מכסה | כן |
| Boost לפי platform_percent קבוע | **לא** |
| Boost אדמין ידני (featured) | כן, שקוף |

---

## 3. Acceptance

- [ ] אין boost עמלה קבועה  
- [ ] RTL + השלמות  
- [ ] קישור ל-SEARCH / CATALOG  
- [ ] No Escrow (לא רלוונטי לדירוג כסף)  

---

## 4. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2 #42 pass-2 |
