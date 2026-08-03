# ARCHITECTURE: Search

ארכיטקטורת חיפוש קטלוג בעברית: שאילתות, פילטרים, אינדוקס, ו-DLQ.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-NOTIFICATIONS.md
```

Stack: Next.js App Router (`/search`, `/api/search`), Supabase Postgres FTS (`simple` + `unaccent` + `pg_trgm`), Meilisearch כ-cache/אינדקס משני, Upstash QStash לתור אינדוקס + DLQ.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| S1 | מקור אמת לקריאת חיפוש ב-MVP: **Postgres FTS**. Meili הוא האצה / שלב 2. |
| S2 | Config: `simple` + `unaccent`. אין Hebrew stemmer ב-Supabase המנוהל. |
| S3 | `search_vector` מתוחזק ב-TRIGGER (כולל שם קטגוריה ראשית). |
| S4 | דירוג שדות: name **A** > description/aliases **B** > category **C**. |
| S5 | אינדקסים: GIN על `tsvector` + GIN trigram על `name_he`. |
| S6 | Typo fallback: `pg_trgm` `word_similarity` כש-FTS מחזיר < 3 שורות. |
| S7 | Autocomplete: debounce 150ms, מינימום 2 תווים, abort in-flight. |
| S8 | URL הוא state לפילטרים (`q`, `f_*`, `price_min/max`, `sort`, `page`). |
| S9 | אינדוקס חיצוני (Meili): pipeline אסינכרוני עם QStash + **DLQ**. כשל אינדוקס לא חוסם publish/checkout. |
| S10 | `/search` = `robots: noindex`. RTL עברית. |

---

## 1. זרימת קריאה (query path)

```text
type ≥2 chars
  → debounce 150ms
  → GET /api/search/suggest → autocomplete_products / ILIKE

submit /results
  → /search?q=&type=&price_min=&price_max=&f_*&sort=&page=
  → search_products(he_tsquery)  [Postgres]
  → if hits < 3 → pg_trgm fuzzy merge
  → grid + ts_headline
  → log_search_query (hashed query; no raw PII string in analytics)
```

As-built היום (חלקי):

```
src/app/api/search/route.ts          # Stage-1 ILIKE
src/app/(store)/search/page.tsx
src/components/search/*
src/lib/search/meili-settings.ts
src/lib/search/pipeline-contracts.ts
src/lib/search/qstash.ts
```

יעד RPCs:

```
search_products(...)
autocomplete_products(...)
filter_products(...)
category_facets(...)
log_search_query(...)
he_tsquery(...)
```

---

## 2. פילטרים ו-facets

### 2.1 URL state

| Param | משמעות |
|---|---|
| `q` | מחרוזת חיפוש |
| `type` | `coupon` / `physical` / all |
| `price_min` / `price_max` | ₪ (מומר לאגורות בשרת) |
| `f_<attr>` | ערכי facet (OR בתוך attr, AND בין attrs) |
| `sort` | `relevance` \| `price_asc` \| `price_desc` \| `newest` |
| `page` | 1-based |

### 2.2 מקורות פילטר

| מקור | טבלאות / שדות |
|---|---|
| סוג מוצר | `products.product_type` |
| מחיר | `coupon_price_ils` או מחיר תצוגה לפי סוג |
| קטגוריה | `product_categories` / `category_id` |
| מאפיינים | `attribute_definitions`, `category_attributes`, `products.attributes` jsonb |
| ספק / עיר | snapshot או join ל-`suppliers` (שדות ציבוריים בלבד) |

Facet counts מחושבים על קבוצת התוצאות אחרי טקסט+מחיר, לפני/אחרי attr לפי UX הקטגוריה (electro chrome).

### 2.3 כללי סינון

1. רק מוצרים `published` / לא מחוקים ל-anon.
2. אין לחשוף טיוטות ספק בחיפוש ציבורי.
3. מחיר ב-UI ב-₪; השוואה בשרת באגורות integer.
4. Zero-results: הצג הצעות / הסרת פילטר אחרון; מדוד שיעור לסף Meili (§5).

---

## 3. אינדקס Postgres

### 3.1 Vector

משקלים:

| Field | Weight |
|---|---|
| `products.name_he` | A |
| `description_he` + keywords + `name_en` + brand + sku | B |
| primary `categories.name_he` | C |

```sql
-- sketch: maintained by TRIGGER, not only generated column
search_vector :=
  setweight(to_tsvector('simple', unaccent(coalesce(name_he,''))), 'A') ||
  setweight(to_tsvector('simple', unaccent(coalesce(description_he,''))), 'B') ||
  setweight(to_tsvector('simple', unaccent(coalesce(category_name_he,''))), 'C');
```

### 3.2 Indexes

```sql
CREATE INDEX IF NOT EXISTS products_search_vector_gin
  ON public.products USING gin (search_vector);

CREATE INDEX IF NOT EXISTS products_name_he_trgm
  ON public.products USING gin (name_he gin_trgm_ops);
```

### 3.3 Synonyms

טבלה:

```
search_synonyms (term_he, aliases text[])
```

`he_tsquery` מרחיב מילים + prefix `:*`, מסיר מילות עצירה עבריות בסיסיות.

---

## 4. אינדוקס Meili (שלב 2) + QStash + DLQ

### 4.1 מתי Meili נכנס

סף מדיד (אחד מהם):

| מדד | סף |
|---|---|
| Zero-results rate | > 12% שבועי |
| p95 latency `/api/search` | > 250ms תחת עומס |
| גודל קטלוג | ~30k מוצרים published |

עד אז: Postgres בלבד. Meili settings כבר ב-

```
src/lib/search/meili-settings.ts
```

### 4.2 Pipeline אינדוקס

```text
products INSERT/UPDATE/DELETE (published fields)
  → DB webhook / trigger outbox row (search_index_outbox)
  → POST /api/webhooks/products  (signed)
  → QStash publish
  → POST /api/search/index-job
       ├─ upsert/delete Meili document
       ├─ 2xx → ack outbox
       ├─ 429/5xx → QStash retry (max 5)
       └─ exhausted → POST /api/search/index-dlq
```

חוזה:

```
src/lib/search/pipeline-contracts.ts
src/lib/search/qstash.ts
```

### 4.3 Document shape (Meili)

שדות אינדקס (בלי PII):

```json
{
  "id": "product-uuid",
  "name_he": "…",
  "description_he": "…",
  "product_type": "coupon",
  "category_ids": ["…"],
  "price_agorot": 900,
  "supplier_id": "…",
  "city_he": "…",
  "published_at": 1710000000,
  "platform_percent": 10
}
```

אין email/phone/שם לקוח. `platform_percent` רק ל-boost פנימי אם בכלל; לא חובה בתוצאת UI.

### 4.4 DLQ

| שדה | ערך |
|---|---|
| Route | `POST /api/search/index-dlq` |
| Auth | QStash signature +/או `CRON_SECRET` |
| אחסון | טבלת `search_index_dlq` או reuse outbox `status=dead` |
| Alert | Ntfy/Sentry על גידול תור |
| Replay | cron / admin action: republish ל-QStash עם אותו `dedupe_id` |

כללי DLQ:

1. כשל Meili **לא** מגלגל publish של מוצר ב-Postgres.
2. Idempotency: `Upstash-Deduplication-Id` = `product_id:updated_at` (או version).
3. Poison message אחרי 5 ניסיונות → dead + התראה; לא לולאה אינסופית.
4. Full reindex: job ידני/admin שמושך את כל ה-published ל-Meili (batched).

### 4.5 QStash headers

```http
POST https://qstash.upstash.io/v2/publish/{APP_URL}/api/search/index-job
Authorization: Bearer $QSTASH_TOKEN
Upstash-Retries: 5
Upstash-Failure-Callback: {APP_URL}/api/search/index-dlq
Upstash-Deduplication-Id: {product_id}:{content_version}
```

בלי `QSTASH_TOKEN`: degrade ל-cron שמרוקן `search_index_outbox` ישירות (אותו handler).

---

## 5. דירוג (Postgres)

סקיצה (משקלים יחסיים):

| אות | משקל |
|---|---|
| Lexical `ts_rank_cd` | 0.55 |
| Fuzzy trigram | 0.15 |
| Freshness | 0.15 |
| Margin / featured boost | 0.10 / 0.05 |

אין קבוע עמלה בחיפוש. Boost מ-`platform_percent` אופציונלי ומשני בלבד.

---

## 6. אבטחה ופרטיות

- חיפוש ל-anon: רק published.
- `log_search_query`: שמירת hash / נרמול; לא לשלוח מחרוזת חופשית ל-analytics כ-PII.
- Webhook אינדוקס: חתימה; לא לפתוח service role לדפדפן.
- Rate limit על `/api/search` ו-suggest (IP + user).

---

## 7. Acceptance

- [ ] FTS + trigram fallback מתועדים ומוכנים ל-RPC
- [ ] פילטרים ב-URL state עם AND/OR כנדרש
- [ ] Pipeline אינדוקס: webhook → QStash → index-job → DLQ
- [ ] כשל Meili לא חוסם קטלוג/כסף
- [ ] `/search` noindex + RTL
- [ ] אין PII במסמכי Meili

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-07-30 | Binding Postgres FTS ב-`arch/search` |
| 2026-08-03 | ke-arch docs-lifecycle: חיפוש + פילטרים + אינדוקס Meili/QStash/DLQ |
