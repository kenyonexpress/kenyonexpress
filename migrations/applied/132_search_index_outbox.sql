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
