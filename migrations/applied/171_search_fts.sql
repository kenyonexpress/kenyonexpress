-- 171: Hebrew full-text search over products and coupon_deals, exposed
-- through a public `search_products` RPC.
--
-- WHY `simple` + unaccent, AND NOT A HEBREW STEMMER. Postgres ships no
-- Hebrew dictionary, so `simple` (lowercase, split on non-word chars, no
-- stemming) is the honest configuration: every Hebrew word is indexed as
-- typed. `unaccent` strips combining marks (niqqud, geresh variants) and
-- Latin diacritics so "פלאפל" with vowel points and without index to the
-- same lexeme, and brand names like "Nescafé" match "nescafe". This is the
-- exact configuration the /goal prescribed.
--
-- WHAT THIS REPLACES. /api/search and the search page's stage-1 fallback run
-- `ilike '%word%'` over name_he + description_he with NO index behind them
-- (route comment, measured 2026-08-19: the cheapest way for a stranger to
-- make the database work). The tsvector is a STORED GENERATED column, so it
-- is maintained by the table itself: no trigger, no drift, and the GIN index
-- turns every search into an index scan.
--
-- KNOWN TRADEOFF, accepted with the goal's config: `simple` does not strip
-- Hebrew clitics, so a query "מקרר" will not match a product that only ever
-- writes "המקרר". The ILIKE fallback in the app (kept for databases without
-- this migration) had infix matching instead of ranking; neither understands
-- Hebrew morphology. Stage 3 (Meilisearch) remains the escape hatch.
--
-- ACCESS MODEL. `search_products` is SECURITY INVOKER and STABLE: it reads
-- through the caller's own RLS (anon sees active+not-deleted products only,
-- per products_select_anon), so it can be granted to anon safely -- it can
-- never return a row its caller could not already select. The app-side rate
-- limit on /api/search stays where it is.
--
-- coupon_deals gets the same vector + GIN index so the deals surface can
-- adopt FTS next; the RPC the goal names is search_products, products only.
--
-- ROLLBACK
--   drop function if exists public.search_products(text, integer, text, text);
--   drop index if exists public.products_search_vector_gin;
--   drop index if exists public.coupon_deals_search_vector_gin;
--   alter table public.products drop column if exists search_vector;
--   alter table public.coupon_deals drop column if exists search_vector;
--   drop function if exists public.fts_prefix_query(text);
--   drop function if exists public.fts_join(text[]);
--   drop function if exists public.fts_unaccent(text);
--   -- the unaccent extension stays installed; dropping extensions is not
--   -- something a feature rollback should do.

create extension if not exists unaccent with schema extensions;

-- unaccent() is only STABLE (its dictionary is a catalog object), which bars
-- it from generated columns and index expressions. Pinning the dictionary by
-- qualified name makes the wrapper honestly immutable: the unaccent rules
-- file changing out from under a live index is not a scenario Supabase's
-- managed extension update path produces without a reindex anyway. This is
-- the documented Postgres pattern for exactly this use.
create or replace function public.fts_unaccent(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(input, ''))
$$;

-- array_to_string(anyarray, text) is STABLE for the same catalog-lookup
-- reason; over text[] it is a pure join, so this wrapper may say IMMUTABLE.
create or replace function public.fts_join(items text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_to_string(items, ' '), '')
$$;

-- User input -> prefix tsquery: strip everything that is not a letter,
-- digit or space (tsquery operators !&|:() can never reach the parser),
-- split on whitespace, cap at 8 words (same MAX_TERMS as search-server.ts),
-- AND the words together, each as a prefix match so the typeahead finds
-- "מקרר" while the shopper is still on "מקר". Returns NULL for an empty or
-- all-punctuation query; string_agg over zero rows is NULL and to_tsquery
-- is strict, so no branch is needed.
create or replace function public.fts_prefix_query(q text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsquery(
    'simple',
    (
      select string_agg(t.word || ':*', ' & ' order by t.ord)
      from (
        select w.word, w.ord
        from unnest(
          regexp_split_to_array(
            trim(regexp_replace(public.fts_unaccent(coalesce(q, '')), '[^[:alnum:][:space:]]+', ' ', 'g')),
            '\s+'
          )
        ) with ordinality as w(word, ord)
        where w.word <> ''
        order by w.ord
        limit 8
      ) t
    )
  )
$$;

-- Weighted vector: name outranks brand/tags outranks the descriptions, so
-- ts_rank puts "אוזניות AirPods 3" above a product that merely mentions
-- headphones in its body text.
alter table public.products
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', public.fts_unaccent(name_he)), 'A')
    || setweight(to_tsvector('simple', public.fts_unaccent(coalesce(brand, '') || ' ' || public.fts_join(tags))), 'B')
    || setweight(to_tsvector('simple', public.fts_unaccent(coalesce(short_description_he, ''))), 'C')
    || setweight(to_tsvector('simple', public.fts_unaccent(coalesce(description_he, ''))), 'D')
  ) stored;

alter table public.coupon_deals
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', public.fts_unaccent(title_he)), 'A')
    || setweight(to_tsvector('simple', public.fts_unaccent(business_name)), 'B')
    || setweight(to_tsvector('simple', public.fts_unaccent(coalesce(location_he, ''))), 'C')
    || setweight(to_tsvector('simple', public.fts_unaccent(coalesce(terms_he, ''))), 'D')
  ) stored;

create index if not exists products_search_vector_gin
  on public.products using gin (search_vector);

create index if not exists coupon_deals_search_vector_gin
  on public.coupon_deals using gin (search_vector);

-- The last input is named `category` (not category_slug) because RETURNS
-- TABLE columns are OUT parameters and share the parameter namespace: an IN
-- parameter may not repeat an output column name.
create or replace function public.search_products(
  q text,
  max_results integer default 48,
  product_type text default null,
  category text default null
)
returns table (
  id uuid,
  slug text,
  name_he text,
  kenyon_price numeric,
  full_price numeric,
  images jsonb,
  stock_quantity integer,
  category_name_he text,
  category_slug text,
  rank real
)
language sql
stable
parallel safe
security invoker
set search_path = ''
as $$
  with tsq as (
    select public.fts_prefix_query(q) as query
  )
  select
    p.id,
    p.slug,
    p.name_he,
    p.kenyon_price,
    p.full_price,
    p.images,
    p.stock_quantity,
    c.name_he as category_name_he,
    c.slug as category_slug,
    ts_rank(p.search_vector, tsq.query) as rank
  from public.products p
  cross join tsq
  left join public.categories c on c.id = p.category_id
  where tsq.query is not null
    and p.search_vector @@ tsq.query
    and p.status = 'active'::public.product_status
    and p.deleted_at is null
    and (search_products.product_type is null or p.type::text = search_products.product_type)
    -- A category slug that exists narrows the search; one that does not
    -- exist matches no join row and returns nothing, the same "narrows to
    -- nothing" contract /api/search already keeps.
    and (search_products.category is null or c.slug = search_products.category)
  order by ts_rank(p.search_vector, tsq.query) desc, p.created_at desc
  limit greatest(1, least(coalesce(max_results, 48), 100))
$$;

-- Public search surface on purpose: INVOKER + anon RLS above make this no
-- wider than a direct PostgREST read of products. service_role keeps it for
-- server-side callers.
revoke all on function public.search_products(text, integer, text, text) from public;
grant execute on function public.search_products(text, integer, text, text)
  to anon, authenticated, service_role;
