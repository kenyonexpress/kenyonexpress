# ארכיטקטורה: חוויית חיפוש

**Meilisearch**, השלמות בעברית, **סינונים**, ותיקון **טעויות כתיב**.

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
```

MVP דירוג: Postgres FTS. Meilisearch = שכבת UX (typo, facets, מהירות) + אינדוקס עם DLQ.

---

## 0. הכרעות UX

| # | הכרעה |
|---|---|
| U1 | תיבה גלובלית RTL; placeholder: "חיפוש דילים ועסקים". |
| U2 | Autocomplete: debounce 150ms, מינימום 2 תווים, abort in-flight. |
| U3 | Meilisearch: typo tolerance לעברית; בלי stemming חובה. |
| U4 | סינונים מטבלת `search_synonyms` (דו-כיווני כשאפשר). |
| U5 | טעויות כתיב: Meili typo + fallback `pg_trgm` ב-Postgres. |
| U6 | `/search` = noindex. |
| U7 | תוצאות באותה מעטפת listing כמו קטגוריה. |

---

## 1. השלמות בעברית

```text
≥2 תווים → 150ms → GET /api/search/suggest?q=
  → עד 8 הצעות: מוצרים / קטגוריות / שמות עסקים ציבוריים
  → מחיר on-site ב-₪ · סוג קופון/פיזי
```

נרמול: trim, הסרת רווחים כפולים, התעלמות ממילות עצירה לבד (`של`, `את`).  
לחיצה על הצעה → PDP או `/search?q=…`.

---

## 2. סינונים

```text
search_synonyms (term_he, aliases text[], is_active)
```

דוגמאות:

| מונח | כינויים |
|---|---|
| מסעדה | אוכל, בית קפה, פיצה |
| ספא | עיסוי, ג'קוזי, טיפול |
| אטרקציה | כרטיס, חוויה, פעילות |

הרחבה ב-query לפני FTS/Meili. עדכון סינונים: admin בלבד.

---

## 3. טעויות כתיב

| שכבה | מנגנון |
|---|---|
| Meilisearch | typoTolerance לפי `meili-settings` |
| Postgres | אם FTS < 3 תוצאות → `word_similarity` / trigram על `name_he` |
| UX | "התכוונת ל־…?" כשיש תיקון בטוח |

לא מתקנים אוטומטית שאילתה שכבר מחזירה תוצאות טובות.

---

## 4. Meilisearch

| נושא | חוזה |
|---|---|
| Searchable | `name_he`, `description_he`, `city_he`, `supplier_name_he`, keywords |
| Filterable | type, category, price_agorot, city, published |
| מסמך | בלי PII |
| אינדוקס | webhook → QStash → index-job → DLQ (ראה SEARCH) |

כשל Meili לא חוסם קטלוג; degrade ל-Postgres.

---

## 5. Acceptance

- [ ] Suggest RTL 150ms / 2 תווים  
- [ ] סינונים פעילים  
- [ ] Typo path מתועד (Meili + trigram)  
- [ ] noindex על `/search`  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Meilisearch + השלמות + סינונים + טעויות כתיב |
