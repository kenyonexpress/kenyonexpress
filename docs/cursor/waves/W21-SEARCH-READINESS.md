# W21 Search readiness

Code-agent spec. `/search` + header field exist (ADR 0010). Meilisearch is a backend. ILIKE fallback. Pending FTS 171 is a different file from 171 shekel-order.

---

## What it builds

1. Engine tag in JSON. Empty `q` → empty, not 400.
2. `sanitizeOrTerm`. Rate limit. Hebrew synonyms file.
3. Index: webhook notification only, worker re-reads Postgres. Unconfigured Meili: index job successful no-op.
4. No facet chrome, no typeahead destination, no Meili dashboard.

---

## Tables

`products` public predicate, `search_index_outbox` (no FK on purpose), `search_index_dlq`, `popular_searches`, `user_recent_searches`.

---

## RLS

`fn_record_recent_search` granted to anon. INVOKER FTS cannot exceed SELECT.

---

## Money invariants

Do not rank on client price. Hide implausible ₪1 master as a "deal" (guard / W43 hide row).

---

## Tests before close

Search routes, meili settings, hebrew synonyms, QStash signature, DLQ. Kill switch empty results.

---

## Feature flag

`KILL_SWITCH_SEARCH`. `MEILISEARCH_HOST`.

---

## Docs updated

`CACHE-POLICY.md` (search), `WAVE` leftover W11-SEARCH.md is not this number.

---

## Edge cases

QStash retries 5 then DLQ. Meili 404 DELETE is success.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Placeholder | חיפוש |
| Empty | לא נמצאו תוצאות |
| Engine (admin) | meilisearch / database |

---

## Open questions

| Q | Best answer |
|---|---|
| Is there a search product? | **No.** Header + `/search` for Electro pixels. |
