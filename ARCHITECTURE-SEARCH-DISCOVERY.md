# ARCHITECTURE-SEARCH-DISCOVERY.md

Search, autocomplete, faceting, sorting, and how the index is kept honest.

Status: BINDING. Branch `docs/architecture-night`, 2026-08-19.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed. §7.4 is
a draft under `migrations/pending/`.
Code this describes: `src/lib/search/meili-settings.ts`,
`src/lib/search/hebrew-synonyms.ts`, `src/lib/search/indexer.ts`,
`src/lib/search/qstash.ts`, `src/lib/search/record.ts`,
`src/app/api/search/*`, `src/app/api/webhooks/products/route.ts`,
`supabase/migrations/118_search_intelligence.sql`.
Companion: `ARCHITECTURE-GEO-LOCATION.md` for everything geo.

---

## 0. Two engines, one contract

Search runs in two stages and the application cannot tell which is active.

| Stage | Engine | Trigger |
|---|---|---|
| 1 | Postgres `ILIKE` over `products` | `MEILISEARCH_HOST` unset |
| 2 | Meilisearch | `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` present |

The whole indexing pipeline stays **wired and silent** in stage 1: every index
job is a successful no-op, so the queue, the retries and the dead-letter route
are exercised in dev without an engine behind them, and turning Meilisearch on
is an environment change rather than a code change.

**A consequence worth stating in advance:** the two engines rank differently
over different catalogues, so `scripts/compare.mjs --page=search` measures a
**catalogue difference, not a design difference**. Its 14.41% is recorded in
`STATE.md` as not-a-design-metric for exactly that reason.

---

## 1. Hebrew is the hard part

Meilisearch has no Hebrew morphology. No stemmer, no lemmatiser, and no
awareness that מסעדה and מסעדות are one word. Everything in this section is
compensation for that.

### 1.1 Typo tolerance, retuned

```ts
minWordSizeForTypos: { oneTypo: 4, twoTypos: 7 }     // defaults are 5 and 9
disableOnAttributes: ['sku', 'slug', 'barcode']
```

Meilisearch's defaults are calibrated for European languages. **Hebrew is
written without vowels, so its words are systematically shorter**: מסעדה is 5
letters, בגד is 3, ספא is 3. At the default threshold a shopper who types מסעדח
instead of מסעדה gets **nothing**, because the word is one character under the
limit for the whole of its length.

Dropping to 4 and 7 restores a typo budget proportional to how Hebrew is
actually spelled. It is deliberately **not lowered further**: at three
characters almost every Hebrew word is one edit from several unrelated others,
and the results stop being about what was typed.

`disableOnAttributes` covers the identifiers. **Never fuzzy-match a SKU.** A
one-character slip should return nothing rather than a confidently wrong
product.

### 1.2 Synonyms, and the one-way trap

Meilisearch synonyms are **directional**. `{"מסעדה": ["מסעדות"]}` means a search
for מסעדה also matches מסעדות, **and not the reverse**.

`buildSynonyms()` expands every group into **every ordered pair**, so a group of
four terms produces four entries each listing the other three. Declaring one
direction by hand is the mistake the function exists to make impossible.

**The test for adding a term to a group:** would a shopper searching either term
be glad to see the other's results?

- `מסעדה` and `אוכל` pass.
- `מסעדה` and `פיצה` fail. Pizza results for a restaurant search are a
  narrowing the shopper did not ask for.

`ארוחה` earns its place on evidence: half the coupon catalogue is named
"ארוחה זוגית" while shoppers search מסעדה.

### 1.3 The prefix problem

Hebrew glues ה, ו, ב, ל, מ, ש and כ onto the front of a word. המסעדה is "the
restaurant", למסעדה is "to the restaurant", and a shopper types them without
thinking.

The prefixed forms are generated **only for terms already in a synonym group**,
where the base word is known. A general prefix stripper is refused, and the
reason is two counter-examples: it would turn משהו into שהו and ברזל into רזל,
both of which are real words.

### 1.4 Stop words

```ts
['של', 'עם', 'את', 'או', 'גם', 'זה', 'הוא', 'היא']
```

Short and conservative. Hebrew has no articles written as separate words the way
English does, so this list is only the conjunctions and fillers that actually
appear in product titles often enough to dilute relevance.

### 1.5 What is deliberately absent

No brand names, no supplier names, and no narrowing synonyms. **A synonym that
is not a synonym makes results confidently wrong**, and a shopper who searched
for one thing and got another cannot tell whether the catalogue lacks it.

---

## 2. Ranking

### 2.1 Searchable attributes are ordered

Position in this list **is** an importance ranking: a hit in the name outranks
the same word buried in a description.

```
name_he
name_en
brand
category_name_he
city                  <- deliberately above the descriptions
tags
supplier_name
short_description_he
description_he
sku
```

`city` sits above both descriptions on purpose. **"מסעדה תל אביב" is a
place-and-thing query**, and a city hit is a stronger signal about what the
shopper wants than the same word appearing somewhere in a paragraph of marketing
copy.

### 2.2 Ranking rules

```
words, typo, in_stock:desc, proximity, attribute, sort, exactness
```

The Meilisearch default, with **one insertion**: `in_stock:desc` ahead of
proximity. A shopper is better served by an in-stock near-match than by an exact
match they cannot buy.

Everything after `words` and `typo` is default order, deliberately. Reordering
relevance rules without a measurement is how a search gets worse in a way nobody
can name.

---

## 3. The document

```ts
interface ProductDocument {
  id, slug, name_he, name_en, brand,
  short_description_he, description_he, sku,
  type, kenyon_price, full_price, images,
  stock_quantity, in_stock,
  category_id, category_slug, category_name_he,
  supplier_id, supplier_name,
  city,                       // effective: products.city ?? supplier's
  tags,                       // always an array
  _geo?: { lat, lng },        // present ONLY with real coordinates
  created_at,
}
```

Three decisions inside that shape:

1. **`city` is the resolved COALESCE**, computed once by the indexer, so the
   search facet cannot disagree with the catalogue's own `productLocation()`.
2. **`_geo` is omitted, never zeroed.** `{lat: 0, lng: 0}` is a point in the
   Atlantic, and a product sitting there would win every distance sort made from
   Israel by a wide margin. A document without `_geo` is simply never returned
   by a geo sort, which is the correct behaviour for a product with no
   coordinates.
3. **`tags` is always an array.** A NULL or an absent column reads as no tags,
   never as a crash.

### 3.1 Facets and sorts

| Filterable | Sortable |
|---|---|
| `type`, `category_id`, `category_slug`, `city`, `tags`, `supplier_id`, `kenyon_price`, `in_stock`, `_geo` | `kenyon_price`, `created_at`, `_geo` |

`_geo` appears in **both** lists because Meilisearch treats filtering by
distance (`_geoRadius`) and sorting by it (`_geoPoint(lat,lng):asc`) as separate
permissions.

The customer-facing sorts are: relevance (default), price ascending, price
descending, newest, and nearest. **Nearest is offered only when the browser has
given a location**, because a distance sort from an unknown origin is a random
order with a confident label.

---

## 4. Autocomplete

`/api/search/suggest` serves the type-ahead. Three rules:

1. **Debounced and prefix-limited.** It fires on keystrokes, so it is the
   cheapest route in the system by design.
2. **It never records a search.** §5.
3. **It is rate-limited separately from `/api/search`**, and there is a test for
   it (`src/app/api/search/rate-limit.test.ts`). A type-ahead's request rate is
   an order of magnitude above a submitted search, so one limit for both is
   either uselessly high or breaks the type-ahead.

Suggestions are drawn from three sources, in order: `popular_searches`, which an
operator curates; the shopper's own `user_recent_searches`; and index prefix
matches. Curated first, because the reason an operator curates is to override
what the index would have said.

---

## 5. Search intelligence: three tables, three privacy contracts

Migration `118_search_intelligence.sql`. Deliberately **not** one table with a
`kind` column, because the correct RLS policies are opposites.

| Table | Question | Visibility |
|---|---|---|
| `search_events` | what shoppers looked for, and what came back | aggregate, world-readable to staff |
| `popular_searches` | what an operator decided to promote | world-readable |
| `user_recent_searches` | one person's own history | readable by exactly one person |

### 5.1 The empty-result log is the point

**A search that returns nothing is the clearest signal a catalogue can
produce**: it is a customer telling you, in their own words, what you do not
sell. Before 118, nothing recorded it and the information was lost the moment
the page rendered.

```sql
CREATE INDEX search_events_empty_idx
  ON public.search_events (empty_results DESC, last_seen_at DESC)
  WHERE empty_results > 0;
```

That index exists for one query, and it is the query an operator should run
weekly.

### 5.2 Normalised and aggregated, not row-per-keystroke

`fn_record_search` **upserts on the normalised term** (lower-cased,
whitespace-collapsed, `UNIQUE`), so the table holds one row per distinct search
with a count. A row per request would store "מ", "מס", "מסע", "מסעד", "מסעדה"
and drown the real query in its own prefixes.

This is also why **only the submitted query is recorded, never the type-ahead**.
The database normalises and aggregates, but it cannot tell a prefix from a
search.

### 5.3 No IP, no user agent, no `user_id` on `search_events`

What somebody searched for is sensitive: health, gifts, relationships. This
table exists to improve the catalogue, which needs **the term and not the
person**.

The two writes are deliberately not one call:

```
recordSearchTerm(term, hits)      -> anonymous aggregate, service key
recordRecentSearch(client, term)  -> the shopper's own history, through THEIR
                                     session, so owner-only RLS enforces
                                     ownership rather than application code
```

A logged-out search produces the first and not the second. A logged-in search
produces both, and **the two rows cannot be joined**, because `search_events` has
no user column at all.

### 5.4 Neither write may fail a search

Both run after the results are in hand, both are wrapped, and both log a warning
on failure. **A shopper's query must not 500 because an analytics insert did.**

---

## 6. Rate limiting and query hygiene

- `src/lib/utils/search-escape.ts` escapes the query before it reaches either
  engine. A Postgres `ILIKE` with an unescaped `%` is a full table scan a
  stranger can request.
- `/api/search` and `/api/search/suggest` are rate-limited independently (§4.3),
  through `check_rate_limit` / `check_user_rate_limit`.
- Query length is capped. An unbounded query is an unbounded index scan.
- Facet values are validated against the known filterable set before being
  passed through, so a crafted facet cannot become a filter expression.

---

## 7. Keeping the index honest

### 7.1 What runs today

```
products INSERT/UPDATE/DELETE
        |
        v  Supabase Database Webhook
POST /api/webhooks/products
        |   auth: x-search-signature (HMAC-SHA256 of the raw body)
        |         or x-webhook-secret (constant-time compare)
        v
enqueueSearchIndexJob  ->  QStash  ->  POST /api/search/index-job
        |                    (5 retries, exponential backoff)
        |                          |
        |                          v  on final failure
        |                    POST /api/search/index-dlq
        |                    + parked in Upstash's own DLQ
        v
runSearchIndexJob: RE-READS the product from Postgres, upserts or deletes
```

Four properties this already has, and they are the right ones:

1. **The payload is never trusted as data.** The worker re-reads the row from
   Postgres. The webhook body is a notification, nothing more.
2. **A stale upsert becomes a delete.** If the product vanished, was soft-deleted
   or fell out of `status = 'active'` between enqueue and run, the fresh row is
   the truth and the job deletes the document.
3. **Deletes are idempotent.** A 404 on DELETE means already gone and is not an
   error.
4. **The worker throws on any failure**, so QStash sees a non-2xx and retries.
   Success returns a short outcome string.

Both integrations are **SDK-free**, like Cardcom: one publish call and one JWS
verification are not worth a dependency. When `QSTASH_TOKEN` is unset, enqueue
degrades to inline execution so the pipeline works end to end without Upstash.

### 7.2 The gap

**The webhook delivery itself is not durable.** If the Supabase webhook POST
fails, or the app is mid-deploy, or `SEARCH_WEBHOOK_SECRET` is rotated on one
side only, the change is **gone**. Nothing in Postgres records that the product
was ever supposed to be reindexed.

The symptom is quiet and awful: a product is edited, the admin sees the change on
the PDP because that reads Postgres, and the search index keeps serving the old
name, the old price, or a product that is no longer active. Nobody notices until
a customer searches for something they were shown yesterday.

Note the shape. It is the same shape as the Cardcom webhook before the journal
row was written first: **an event that only exists in flight cannot be replayed.**

### 7.3 The outbox pattern, and why it closes it

An outbox moves the "this needs reindexing" fact **into the same transaction as
the change itself**.

```
UPDATE products SET ...           \
INSERT INTO search_index_outbox   /  one transaction. Both or neither.
        |
        v  (a) Supabase webhook fires -> the fast path, unchanged
        v  (b) a cron drains the outbox -> the durable path
        |
   claim a batch (FOR UPDATE SKIP LOCKED)
        |
   run the job (same runSearchIndexJob, same re-read)
        |
   mark done, or increment attempts and back off
```

What changes, precisely:

- The **fast path stays exactly as it is.** The webhook is still the low-latency
  route and its handler is unchanged.
- The **outbox is the floor.** Anything the webhook loses is picked up by the
  drain, at most one cron interval later.
- **`FOR UPDATE SKIP LOCKED`** lets several drains run without coordinating and
  without processing a row twice.
- A row that keeps failing accumulates `attempts` and a `last_error`, which makes
  "the index is behind, and here is why" a query instead of a hunch.

The cost is one insert per product write. Product writes are rare (an admin
editing a catalogue), so the cost is nothing, and the alternative is an index
that is silently wrong.

### 7.4 Draft SQL: `search_index_outbox`

**DRAFT. NOT APPLIED. NOT RUN.** File: `migrations/pending/132_search_index_outbox.sql`.

```sql
-- ============================================================================
-- PENDING 122: search_index_outbox, so a lost webhook is not a lost reindex
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- MEASURED BEFORE WRITING (2026-08-19):
--   118_search_intelligence.sql created search_events, popular_searches and
--   user_recent_searches. None of them is an outbox.
--   The reindex path is a Supabase Database Webhook on public.products, handled
--   by src/app/api/webhooks/products/route.ts, which enqueues to QStash.
--   Nothing in Postgres records that a reindex was owed.
--
-- WHAT THIS DOES NOT REPLACE: the webhook. It stays the fast path. This table
-- is the floor underneath it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.search_index_outbox (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- NOT a foreign key, deliberately. A DELETE of the product must still leave
  -- the "remove this document" instruction behind; an FK with ON DELETE CASCADE
  -- would delete exactly the row that carries the work.
  product_id  uuid NOT NULL,

  op          text NOT NULL CHECK (op IN ('upsert','delete')),

  enqueued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz,
  done_at     timestamptz,

  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,

  -- Set by the drain to now() + backoff. NULL means "eligible immediately".
  next_try_at timestamptz
);

COMMENT ON TABLE public.search_index_outbox IS
  'Durable record that a product needs reindexing, written in the same transaction as the product change. The Supabase webhook remains the fast path; this is the floor under it.';
COMMENT ON COLUMN public.search_index_outbox.product_id IS
  'Intentionally NOT a foreign key: a deleted product still owes a delete job, and ON DELETE CASCADE would remove the very row that carries it.';

-- The drain's only query: oldest eligible work first.
CREATE INDEX IF NOT EXISTS search_index_outbox_pending_idx
  ON public.search_index_outbox (COALESCE(next_try_at, enqueued_at))
  WHERE done_at IS NULL;

-- "Is the index behind, and on what." One row per product tells the operator
-- more than a thousand attempts do.
CREATE INDEX IF NOT EXISTS search_index_outbox_product_idx
  ON public.search_index_outbox (product_id)
  WHERE done_at IS NULL;

-- ---------------------------------------------------------------------------
-- The trigger. AFTER, so it cannot affect the write it observes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_search_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.search_index_outbox (product_id, op)
      VALUES (OLD.id, 'delete');
    RETURN OLD;
  END IF;

  -- A soft delete or a fall out of `active` is a DELETE as far as the index is
  -- concerned. The worker re-reads the row anyway and converts a stale upsert
  -- into a delete, so this is an optimisation and not a correctness rule --
  -- but it means the common case does not need the round trip.
  IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'active' THEN
    INSERT INTO public.search_index_outbox (product_id, op)
      VALUES (NEW.id, 'delete');
  ELSE
    INSERT INTO public.search_index_outbox (product_id, op)
      VALUES (NEW.id, 'upsert');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS products_enqueue_search_index ON public.products;
CREATE TRIGGER products_enqueue_search_index
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_search_index();

-- ---------------------------------------------------------------------------
-- The claim. SKIP LOCKED so concurrent drains never fight and never double-run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_search_index_jobs(p_limit integer DEFAULT 50)
RETURNS SETOF public.search_index_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.search_index_outbox o
     SET claimed_at = now(),
         attempts   = o.attempts + 1
   WHERE o.id IN (
     SELECT id FROM public.search_index_outbox
      WHERE done_at IS NULL
        AND COALESCE(next_try_at, enqueued_at) <= now()
      ORDER BY COALESCE(next_try_at, enqueued_at)
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.claim_search_index_jobs(integer) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS. Nobody but the service key touches this table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.search_index_outbox ENABLE ROW LEVEL SECURITY;
-- No policy is created on purpose: RLS with zero policies denies every client
-- role, and the drain runs with the service key, which bypasses RLS. Staff read
-- the backlog through a view, not through this table.
REVOKE ALL ON public.search_index_outbox FROM anon, authenticated;

-- ============================================================================
-- VERIFICATION (after applying, inside rolled-back DO blocks)
-- ============================================================================
-- 1. An edit enqueues exactly one row:
--      DO $$ DECLARE n int; BEGIN
--        UPDATE public.products SET updated_at = now()
--         WHERE id = (SELECT id FROM public.products LIMIT 1);
--        SELECT count(*) INTO n FROM public.search_index_outbox WHERE done_at IS NULL;
--        RAISE EXCEPTION 'rollback: outbox now holds % pending rows', n;
--      END $$;
--
-- 2. A paused product enqueues a DELETE, not an upsert:
--      ... UPDATE products SET status = 'paused' ... -> expect op = 'delete'.
--
-- 3. Two concurrent claims do not overlap: run claim_search_index_jobs(10) in
--    two sessions and intersect the returned ids. Expect empty.
--
-- ROLLBACK
--   DROP TRIGGER  IF EXISTS products_enqueue_search_index ON public.products;
--   DROP FUNCTION IF EXISTS public.enqueue_search_index();
--   DROP FUNCTION IF EXISTS public.claim_search_index_jobs(integer);
--   DROP TABLE    IF EXISTS public.search_index_outbox;
-- ============================================================================
```

### 7.5 What the drain must do that the trigger cannot

- **Coalesce.** Ten edits to one product in a minute are ten rows and one
  document. The drain groups by `product_id`, keeps the newest `op`, and marks
  the rest done in the same statement.
- **Back off.** `next_try_at = now() + interval '1 minute' * power(2, attempts)`,
  capped. A Meilisearch outage must not become a hot loop.
- **Give up loudly.** Past a threshold, alarm rather than retry forever. See
  `ARCHITECTURE-OBSERVABILITY.md`.
- **Reap.** `done_at` rows older than a week are deleted by the same cron. This
  is a queue, not a history; `payment_events` is where history belongs.

---

## 8. Indexing coupons, with geo

A coupon is a product, so it is one document like any other. What is
coupon-specific:

| Field | Behaviour |
|---|---|
| `type = 'coupon'` | a facet, so "coupons only" is one filter |
| `kenyon_price` | the till value, which is what the shopper compares |
| `coupon_price_ils` | **not indexed as a sort key.** The card says both numbers; sorting by the on-site price would rank a ₪10 coupon for a ₪20 meal above a ₪50 coupon for a ₪300 meal |
| `city` | the effective city, `products.city ?? suppliers.city` |
| `_geo` | present only with real coordinates. §3 |
| `offer_valid_until` | **not a filter today.** §9 |

Geo search is `_geoRadius(lat, lng, metres)` to filter and
`_geoPoint(lat, lng):asc` to sort. Both are covered in
`ARCHITECTURE-GEO-LOCATION.md`, including why the current data cannot support
street-level precision and why the city centre is the honest fallback.

---

## 9. Gaps

| Gap | Consequence | Fix |
|---|---|---|
| Webhook delivery is not durable | a lost POST is a permanently stale document | §7.4 |
| `offer_valid_until` is not indexed | an expired offer stays searchable until something else touches the product | index it as a filterable timestamp and add `offer_valid_until > now()` to the public filter; add a nightly sweep for products that expired without an edit |
| No reconciliation between Postgres and the index | drift is invisible | a nightly count-and-sample comparison, alarming on a delta |
| Suggestions are not personalised beyond own-history | fine, and deliberate for now | revisit only with a measurement |
| `search_events` has no locale split | Hebrew and English terms aggregate into one table | acceptable; the normalised term keeps them distinct in practice |

The second row is the one a customer would notice. An expired coupon that still
appears in search is a consumer-protection problem, not just a stale document,
because `offer_valid_until` is a disclosed promise per
`ARCHITECTURE-ADMIN-PRODUCT-FORM.md` §4.
