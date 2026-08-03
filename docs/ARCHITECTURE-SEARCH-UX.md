# ARCHITECTURE: Search UX

חוויית חיפוש: **Meilisearch**, השלמות בעברית, פילטרים ותוצאות RTL.

Status: **BINDING** · Updated: 2026-08-03 (pack-20)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
```

מקור אמת דירוג ב-MVP: Postgres FTS (ראה SEARCH). Meilisearch = UX מהיר + typo + facets כשסף מדיד נחצה, או כ-cache קריאה.

---

## 0. הכרעות UX

| # | הכרעה |
|---|---|
| U1 | תיבת חיפוש גלובלית בעברית RTL; placeholder: "חיפוש דילים ועסקים". |
| U2 | Autocomplete מדקה **150ms**, מינימום **2** תווים, abort in-flight. |
| U3 | תוצאות: אותה מעטפת listing כמו קטגוריה (electro chrome): כותרת, ספירה, פילטרים, גריד. |
| U4 | `/search` = `noindex`. |
| U5 | Meilisearch: typo tolerance לעברית (ללא stemming); facets על type/city/category/price. |
| U6 | הדגשת התאמות בתוצאות (`ts_headline` או Meili `_formatted`). |
| U7 | Zero results: הצעות הסרת פילטר + קטגוריות פופולריות; בלי לירות PII ללוגים. |

---

## 1. Autocomplete (השלמות עברית)

```text
input ≥ 2 chars → debounce 150ms → GET /api/search/suggest?q=
  → עד 8 הצעות: מוצרים + קטגוריות + מותגים/ספקים ציבוריים
  → תצוגה RTL; מחיר on-site ב-₪; אייקון סוג (קופון/פיזי)
```

כללים:

1. נרמול: הסרת ניקוד אופציונלי, trim, lowercase לוגי רק לתווים לטיניים.  
2. מילות עצירה קצרות בעברית לא לבד (`של`, `את`, `על`).  
3. Synonyms מ-`search_synonyms` (למשל "מסעדה" ↔ "אוכל").  
4. מקלדת עברית/אנגלית: ניסיון תיקון כיוון (optional later); לא חוסם MVP.  
5. לחיצה על הצעה → PDP או `/search?q=…` לפי סוג.

---

## 2. Meilisearch (UX layer)

| נושא | חוזה |
|---|---|
| Index | `products` documents בלי PII |
| Searchable | `name_he`, `description_he`, `city_he`, `supplier_name_he`, keywords |
| Filterable | `product_type`, `category_ids`, `price_agorot`, `city_he`, `published` |
| Ranking | words → typo → proximity → attribute → exactness; boost freshness משני |
| Typo | enabled; min word size לפי meili-settings הקיים |
| RTL | UI RTL; אין דרישה מיוחדת מ-Meili על כיוון |

Pipeline אינדוקס + DLQ: `ARCHITECTURE-SEARCH.md` §4.

עד סף (zero-results / latency / 30k products): UI יכול לקרוא Postgres; החוזה ה-UX זהה.

---

## 3. פילטרים ותוצאות

URL state: `q`, `type`, `price_min/max`, `f_*`, `sort`, `page`.  
מיון: רלוונטיות (ברירת מחדל) / מחיר / חדש.  
Empty state בעברית: "לא מצאנו דילים ל־…".

---

## 4. Acceptance

- [ ] Suggest 150ms / 2 chars / RTL
- [ ] Results shell תואם category listing
- [ ] Meili settings לעברית מתועדים; DLQ לא חוסם קטלוג
- [ ] noindex על `/search`
- [ ] אין raw query ב-analytics

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: Search UX Meilisearch + השלמות עברית |
