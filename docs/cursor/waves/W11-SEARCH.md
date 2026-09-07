# W11 Search FTS (pending 171)

Code-agent spec. Today `/search` uses Meilisearch when configured, else Postgres `ILIKE` via `sanitizeOrTerm`. Pending `171_search_fts.sql` adds INVOKER `search_products`. A **second** file `171_category_name_shekel_order.sql` is a different 171.

---

## What the wave builds

1. Human applies the FTS file only after reading the full name.
2. App may call `search_products` (SECURITY INVOKER). It cannot return a product the caller could not SELECT.
3. Header field stays (ADR 0010). This is still **not** a Meilisearch-branded search product (no facet chrome, no typeahead destination).

**Do not build.** `/api/search/v2`. Exposing the Meili dashboard. Enabling `/en` search in this wave (W32).

---

## Tables

`products` (public predicate), `search_index_outbox`, `search_index_dlq`, `popular_searches`, `user_recent_searches`. `fn_record_recent_search` granted to anon on purpose.

---

## RLS

INVOKER FTS: same as catalogue SELECT. Index worker remains service_role. QStash signature on `/api/search/index-job`.

---

## Money invariants

Search must not rank by a client-supplied price. Cards render via `ProductCard` which already uses catalogue money. Do not show the ₪1 master SKU as a "deal" (implausible discount / W43).

---

## Tests

`search.routes.test.ts`, `meili-settings.test.ts`, `hebrew-synonyms.test.ts`, `sanitizeOrTerm`. Empty `q` → empty results, not 400. Rate limit headers.

---

## Feature flag

`KILL_SWITCH_SEARCH`: empty results, not 500. `MEILISEARCH_HOST` unset: ILIKE/FTS floor. Off Meili: index jobs are successful no-ops.

---

## Close

Engine tag in JSON (`meilisearch` | `database`). Duplicate 171 filenames never applied by number. Hebrew synonyms still apply only to Hebrew.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
