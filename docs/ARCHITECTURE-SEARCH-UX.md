# ארכיטקטורה: חוויית חיפוש

Meilisearch, השלמות בעברית, ותיקון טעויות כתיב.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-PRICING-RULES.md
```

MVP דירוג: Postgres FTS. Meilisearch = UX (typo, facets, מהירות) + אינדוקס עם DLQ.
דירוג לא משתמש בעמלה קבועה; אין boost לפי 10%/5%. `platform_percent` אינו גורם מיון ב-UX.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| U1 | תיבה גלובלית RTL; placeholder: "חיפוש דילים ועסקים". |
| U2 | Autocomplete: 150ms debounce, מינימום 2 תווים, abort in-flight. |
| U3 | Meilisearch: typo tolerance לעברית. |
| U4 | סינונים מ-`search_synonyms`. |
| U5 | טעויות כתיב: Meili typo + fallback `pg_trgm`. |
| U6 | `/search` = noindex. |
| U7 | תוצאות במעטפת listing כמו קטגוריה. |

---

## 1. השלמות בעברית

```text
≥2 תווים → 150ms → GET /api/search/suggest?q=
  → עד 8 הצעות: מוצרים / קטגוריות / עסקים
  → מחיר on-site ב-₪ · סוג קופון/פיזי
```

נרמול: trim, רווחים כפולים, מילות עצירה לבד לא מספיקות.  
לחיצה → PDP או `/search?q=…`.

---

## 2. טעויות כתיב

| שכבה | מנגנון |
|---|---|
| Meilisearch | typoTolerance |
| Postgres | אם FTS < 3 → trigram על `name_he` |
| UX | "התכוונת ל־…?" כשיש תיקון בטוח |

סינונים לדוגמה: מסעדה↔אוכל, ספא↔עיסוי. עדכון: admin בלבד.

---

## 3. Meilisearch

| נושא | חוזה |
|---|---|
| Searchable | `name_he`, תיאור, עיר, שם ספק, keywords |
| Filterable | type, category, price_agorot, city, published |
| מסמך | בלי PII |
| אינדוקס | webhook → QStash → index-job → DLQ |

כשל Meili → degrade ל-Postgres; לא חוסם קטלוג.

---

## 4. Acceptance

- [ ] Suggest RTL 150ms / 2 תווים  
- [ ] Typo path (Meili + trigram)  
- [ ] סינונים פעילים  
- [ ] noindex על `/search`  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | Meilisearch + השלמות עברית + טעויות כתיב |
| 2026-08-06 | QA: בלי boost עמלה קבועה; קישור PRICING |
