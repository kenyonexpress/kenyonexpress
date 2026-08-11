# ARCHITECTURE: Search and Discovery (Meilisearch)

חיפוש וגילוי: Meilisearch, אינדוקס, טוקניזציה עברית, פילטרים, facets, סובלנות שגיאות, trending, zero-results.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-CATEGORY-PAGE.md
docs/RUNBOOK-OPERATIONS.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| S1 | Meilisearch = מנוע חיפוש; Postgres = מקור אמת לקטלוג וכסף. |
| S2 | מחיר בתוצאות = אותו paid-online כמו PDP (לא מחירון מטעה לקופון). |
| S3 | אינדוקס אסינכרוני (QStash / queue); publish לא מחכה ל-Meili בנתיב קריטי אם יש stale קצר. |
| S4 | מסמכים: רק מוצרים `published` + ספק פעיל. |
| S5 | חיפוש ציבורי: anon מפתח search-only; אין admin key בדפדפן. |
| S6 | `/search` = noindex (SEO). |
| S7 | עברית: tokenizer / dictionary / normalize כפי שמוגדר באינדקס; RTL ב-UI. |

---

## 1. Indexing pipeline

```text
Product create/update/publish/unpublish
  → webhook / DB trigger / admin action
  → enqueue index job (QStash or equivalent)
  → worker builds document from Postgres
  → Meilisearch add/update/delete
  → on failure → DLQ + retry
```

| אירוע | פעולת אינדקס |
|---|---|
| publish | upsert document |
| unpublish / suspend supplier | delete או filterable `is_searchable=false` |
| price / title / category change | upsert |
| hard delete | delete |

Document fields (יעד):

```text
id, slug, name_he, description_he, category_ids, category_names,
supplier_id, supplier_name, product_type, brand,
price_agorot,           // paid online display basis
list_price_agorot?,     // optional, not primary sort default
is_sellable, city/area tags, tags[],
updated_at, popularity_score, image_url
```

אסור באינדקס: `qr_payload`, tokens, PII לקוח, service secrets.

---

## 2. Hebrew tokenization

| נושא | גישה |
|---|---|
| שפה | `he` / multi where supported |
| Normalize | ניקוד להסרה אם קיים; lowercase לוגי לתחומים לטיניים |
| מורפולוגיה | stop words עברית בסיסיים; synonyms ידניים (למשל מסעדה/בית קפה) בקבצי config |
| אותיות דומות | mapping אופציונלי (ו/ב כשגיאות נפוצות) בזהירות |
| מילים מעורבות | עברית + מותג לטיני באותו `name_he` |

בדיקות קבלה: שאילתות עברית נפוצות מחזירות את מוצר ה-seed הצפוי.

---

## 3. Filters and facets

### 3.1 Filterable attributes

`product_type`, `category_ids`, `supplier_id`, `brand`, `is_sellable`, `price_agorot`, `area` (אם קיים).

### 3.2 Facets ל-UI

| Facet | UI עברית |
|---|---|
| product_type | קופון / מוצר פיזי |
| category | קטגוריות |
| brand | מותג |
| price ranges | טווחי ₪ (מחושבים מ-agorot) |
| area / city | אזור |

Facet counts חייבים לכבד את שאר הפילטרים (conjunctive facets).

---

## 4. Typo tolerance

| הגדרה | יעד |
|---|---|
| typoTolerance enabled | כן |
| min word size for 1 typo | לפי Meili defaults מותאמים לעברית אחרי ניסוי |
| disableOnNumbers | כן למק״טים |
| disableOnWords | מותגים קצרים שבירים |

לא להעלות סובלנות עד כדי רעש שמחזיר קטגוריה לא קשורה.

---

## 5. Ranking and trending

סדר דירוג יעד:

1. Typo / exactness
2. Words / proximity
3. `popularity_score` (מכירות/views חלון מתגלגל)
4. `updated_at`

Trending:

- job יומי/שעתי שמחשב `popularity_score` מ-orders + analytics_events
- מדף `/` או מקטע "פופולרי" קורא top N מ-Meili או מ-mart Postgres
- לא לכלול מוצרים לא sellable

---

## 6. Zero-results handling

כש-`hits` ריק:

1. הודעה בעברית: "לא מצאנו תוצאות עבור …"
2. הצעות: הסרת פילטרים, קטגוריות פופולריות, מוצרים trending
3. Did-you-mean אם Meili מחזיר suggestion
4. Event: `search` עם `results_count=0` (analytics)
5. לא להציג מחירים שגויים או מוצרים unpublished

---

## 7. API / אבטחה

| נושא | כלל |
|---|---|
| Public search | search API key מוגבל לאינדקס הקטלוג |
| Admin reindex | service role / admin session בלבד |
| Rate limit | per IP על `/api/search` |
| PII | אין אינדוקס משתמשים באינדקס מוצרים |

---

## 8. Acceptance

- [ ] pipeline publish → searchable תוך SLA דקות
- [ ] עברית מוצאת מוצרי seed
- [ ] facets + filters עובדים יחד
- [ ] typo בסיסי לא שובר precision
- [ ] zero-results עם הצעות בעברית
- [ ] `/search` noindex

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
