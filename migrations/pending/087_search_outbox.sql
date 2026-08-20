-- ============================================================================
-- 087: the search index outbox
-- ============================================================================
--
-- STATUS: NOT APPLIED. Written to migrations/pending/ per the project rule -
-- nothing here has run against any database, and `db push` is forbidden. The
-- route to production is apply_migration through MCP after a human approves it.
--
-- THE NUMBER IS OUT OF BAND AND THAT IS DELIBERATE-BY-INSTRUCTION. This
-- directory already holds 110-123; 087 was the number the goal specified. It
-- does not claim a position in the chain: nothing here depends on 088-123 and
-- nothing in 088-123 depends on it. Read it as a name, not as an ordering.
--
-- WHY AN OUTBOX AND NOT THE WEBHOOK WE ALREADY HAVE
--
-- The existing path is products -> Supabase DB webhook -> /api/webhooks/products
-- -> QStash -> /api/search/index-job. Every hop in that chain is outside the
-- transaction that changed the product. If the webhook fires and the
-- transaction then rolls back, the index is told about a change that never
-- happened; if the transaction commits and pg_net is down, the change is lost
-- with nothing anywhere recording that it existed. The failure is silent in
-- both directions and the only symptom is a product that cannot be found.
--
-- An outbox row is written BY THE SAME TRANSACTION that changed the product. It
-- commits with the change or it does not exist. That is the entire point, and
-- it is the one property no amount of retrying an external webhook can buy.
--
-- The queue path is not removed. QStash still carries the low-latency copy so a
-- price edit shows up in search within a second; the outbox is the ledger that
-- makes sure it eventually shows up even if every hop of that queue failed.
-- Both converge because both do the same thing at the far end: re-read the row
-- and write what it says (see lib/search/indexer.ts). Delivering a change twice
-- is a no-op. Losing it is not.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.search_outbox (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- NO FOREIGN KEY TO products, AND THAT IS THE WHOLE DESIGN.
  --
  -- The most important row this table ever holds is "product X was deleted,
  -- remove it from the index". A foreign key with ON DELETE CASCADE would
  -- delete exactly that row at exactly the moment it is written, leaving the
  -- deleted product searchable forever. ON DELETE RESTRICT would instead make
  -- the product undeletable until the queue drains. Neither is acceptable, so
  -- the column is a plain uuid and the worker treats a missing product as a
  -- delete - which is what it already does for a stale upsert.
  product_id    uuid        NOT NULL,

  op            text        NOT NULL CHECK (op IN ('upsert', 'delete')),

  -- Why this row exists, for a human reading a stuck queue: 'update:active',
  -- 'delete:archived', 'backfill'.
  reason        text        NOT NULL,

  enqueued_at   timestamptz NOT NULL DEFAULT now(),

  -- The lease. A claimed row is invisible to other workers until the lease
  -- expires, so two drains running at once cannot both push the same document.
  claimed_at    timestamptz,
  claim_token   uuid,

  attempts      smallint    NOT NULL DEFAULT 0,
  last_error    text,

  -- NULL means pending. Set once, when the index has actually been written.
  processed_at  timestamptz
);

COMMENT ON TABLE public.search_outbox IS
  'Transactional outbox for the Meilisearch product index. Written by trigger '
  'inside the same transaction as the products change; drained by '
  '/api/search/outbox. A pending row is a change the index has not received yet.';

-- The drain's own query: oldest pending first.
CREATE INDEX IF NOT EXISTS search_outbox_pending_idx
  ON public.search_outbox (enqueued_at)
  WHERE processed_at IS NULL;

/**
 * ONE PENDING ROW PER PRODUCT. A bulk price edit or an import can touch the
 * same product forty times in a minute; without this the queue holds forty
 * jobs that each re-read the same row and write the same document. The trigger
 * upserts onto this index, so a burst collapses into one job carrying the
 * LATEST intent - which is the only intent that matters, because the worker
 * re-reads the row rather than trusting the payload.
 */
CREATE UNIQUE INDEX IF NOT EXISTS search_outbox_one_pending_per_product
  ON public.search_outbox (product_id)
  WHERE processed_at IS NULL;

-- Rows that have exhausted their attempts. This is the dead-letter query, and
-- it is an index rather than a table because a poisoned job is still a pending
-- change: it must stay visible as unindexed work, not be filed away as done.
CREATE INDEX IF NOT EXISTS search_outbox_stuck_idx
  ON public.search_outbox (attempts DESC, enqueued_at)
  WHERE processed_at IS NULL AND attempts >= 8;

-- ---------------------------------------------------------------------------
-- 2. Lockdown
-- ---------------------------------------------------------------------------
--
-- RLS ON WITH NO POLICIES AT ALL. This is not an oversight: with RLS enabled
-- and no policy, every role except service_role (which bypasses RLS) sees zero
-- rows and can write none. The outbox is infrastructure. A shopper has no
-- business reading which products were edited and when, and an operator reads
-- it through the admin client like everything else.

ALTER TABLE public.search_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.search_outbox FROM PUBLIC;
REVOKE ALL ON public.search_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_outbox TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The trigger
-- ---------------------------------------------------------------------------

/**
 * Decides what a products change means for the index and records it.
 *
 * The predicate is `status = 'active' AND deleted_at IS NULL`, the same one RLS
 * enforces for the public read and the same one lib/search/pipeline-contracts.ts
 * applies to the webhook payload. A product that falls out of it is a DELETE,
 * not an update: an archived product must leave the index, not sit in it with
 * fresher text.
 *
 * SECURITY DEFINER because the caller is whoever edited the product - an admin
 * through the anon-keyed client - and that role has no INSERT on this table by
 * design. The search_path is pinned, so nothing here resolves through a
 * caller-controlled schema.
 *
 * THE CONFLICT CLAUSE RESETS THE LEASE, and that is what makes a collapse safe
 * mid-flight. If a worker has already claimed the pending row for this product
 * and a new edit lands, clearing claim_token means the worker's completion call
 * - which matches on the token - no longer matches this row. The row stays
 * pending and is re-delivered with the newer change. Without the reset, the
 * in-flight worker would mark the row done and the newer edit would be lost.
 */
CREATE OR REPLACE FUNCTION public.fn_search_outbox_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_id uuid;
  v_op         text;
  v_reason     text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.id;
    v_op         := 'delete';
    v_reason     := 'delete:hard';
  ELSE
    v_product_id := NEW.id;
    IF NEW.deleted_at IS NULL AND NEW.status::text = 'active' THEN
      v_op := 'upsert';
    ELSE
      v_op := 'delete';
    END IF;
    v_reason := lower(TG_OP) || ':' || COALESCE(NEW.status::text, 'unknown');
  END IF;

  INSERT INTO public.search_outbox (product_id, op, reason)
  VALUES (v_product_id, v_op, v_reason)
  ON CONFLICT (product_id) WHERE processed_at IS NULL
  DO UPDATE SET
    op          = EXCLUDED.op,
    reason      = EXCLUDED.reason,
    enqueued_at = now(),
    claimed_at  = NULL,
    claim_token = NULL,
    attempts    = 0,
    last_error  = NULL;

  -- AFTER trigger: the return value is discarded.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_search_outbox_enqueue() FROM PUBLIC;

DROP TRIGGER IF EXISTS search_outbox_enqueue_ins ON public.products;
CREATE TRIGGER search_outbox_enqueue_ins
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_search_outbox_enqueue();

DROP TRIGGER IF EXISTS search_outbox_enqueue_del ON public.products;
CREATE TRIGGER search_outbox_enqueue_del
  AFTER DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_search_outbox_enqueue();

/**
 * The UPDATE trigger is columnar on purpose.
 *
 * `updated_at` moves on every write, and several columns that are not in the
 * index at all - view counts, approval notes, internal cost - move constantly.
 * A blanket AFTER UPDATE would enqueue a job for each of them, and the drain
 * would spend its whole budget re-writing documents that are already correct.
 *
 * The list below is exactly the set toProductDocument() reads, plus the two
 * gate columns. If a column is added to the document, it belongs here too; a
 * column indexed but missing from this list updates in Postgres and never in
 * the index, which is the silent-staleness failure this whole file exists to
 * prevent.
 */
DROP TRIGGER IF EXISTS search_outbox_enqueue_upd ON public.products;
CREATE TRIGGER search_outbox_enqueue_upd
  AFTER UPDATE ON public.products
  FOR EACH ROW
  WHEN (
    OLD.status               IS DISTINCT FROM NEW.status
    OR OLD.deleted_at        IS DISTINCT FROM NEW.deleted_at
    OR OLD.slug              IS DISTINCT FROM NEW.slug
    OR OLD.name_he           IS DISTINCT FROM NEW.name_he
    OR OLD.name_en           IS DISTINCT FROM NEW.name_en
    OR OLD.brand             IS DISTINCT FROM NEW.brand
    OR OLD.short_description_he IS DISTINCT FROM NEW.short_description_he
    OR OLD.description_he    IS DISTINCT FROM NEW.description_he
    OR OLD.sku               IS DISTINCT FROM NEW.sku
    OR OLD.type              IS DISTINCT FROM NEW.type
    OR OLD.is_coupon_enabled IS DISTINCT FROM NEW.is_coupon_enabled
    OR OLD.kenyon_price      IS DISTINCT FROM NEW.kenyon_price
    OR OLD.full_price        IS DISTINCT FROM NEW.full_price
    OR OLD.images            IS DISTINCT FROM NEW.images
    OR OLD.stock_quantity    IS DISTINCT FROM NEW.stock_quantity
    OR OLD.city              IS DISTINCT FROM NEW.city
    OR OLD.tags              IS DISTINCT FROM NEW.tags
    OR OLD.latitude          IS DISTINCT FROM NEW.latitude
    OR OLD.longitude         IS DISTINCT FROM NEW.longitude
    OR OLD.category_id       IS DISTINCT FROM NEW.category_id
    OR OLD.supplier_id       IS DISTINCT FROM NEW.supplier_id
  )
  EXECUTE FUNCTION public.fn_search_outbox_enqueue();

-- ---------------------------------------------------------------------------
-- 4. The drain's three RPCs
-- ---------------------------------------------------------------------------

/** How many times a job is retried before it stops being claimed. */
-- (Referenced by fn_claim_search_outbox below and by the stuck index above.)

/**
 * Claims up to p_limit pending jobs for this worker.
 *
 * FOR UPDATE SKIP LOCKED is what makes two drains running at once correct
 * rather than merely unlikely: the second worker steps over rows the first has
 * locked instead of blocking on them or, worse, reading them.
 *
 * THE LEASE IS FIVE MINUTES, and it exists because a serverless worker can be
 * frozen or killed between claiming and completing. Without a lease those rows
 * would be claimed forever and the product would never be indexed again. With
 * one, they are re-claimed on the next drain. The cost of the lease expiring
 * early is one duplicate index write, which is a no-op.
 *
 * `attempts` increments AT CLAIM TIME, not on failure. A job that crashes the
 * worker hard enough that it never reports back still has to count, or it is
 * claimed forever at whatever rate the drain runs.
 */
CREATE OR REPLACE FUNCTION public.fn_claim_search_outbox(
  p_limit integer,
  p_token uuid
)
RETURNS TABLE (
  id         bigint,
  product_id uuid,
  op         text,
  reason     text,
  attempts   smallint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.search_outbox o
     SET claimed_at  = now(),
         claim_token = p_token,
         attempts    = o.attempts + 1
   WHERE o.id IN (
     SELECT c.id
       FROM public.search_outbox c
      WHERE c.processed_at IS NULL
        AND c.attempts < 8
        AND (c.claimed_at IS NULL OR c.claimed_at < now() - interval '5 minutes')
      ORDER BY c.enqueued_at
      LIMIT greatest(1, least(p_limit, 200))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.id, o.product_id, o.op, o.reason, o.attempts;
$$;

/**
 * Marks jobs done.
 *
 * MATCHES ON THE CLAIM TOKEN. A row whose token no longer matches is a row that
 * was re-enqueued by a newer edit while this worker was running (the trigger
 * clears the token), or one whose lease expired and was claimed by somebody
 * else. Either way this worker's result is stale and must not close it.
 */
CREATE OR REPLACE FUNCTION public.fn_complete_search_outbox(
  p_ids   bigint[],
  p_token uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.search_outbox
     SET processed_at = now(),
         last_error   = NULL
   WHERE id = ANY(p_ids)
     AND claim_token = p_token
     AND processed_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

/**
 * Records a failure and releases the lease so the job is retried on the next
 * drain. `attempts` is not touched here - it was already incremented at claim
 * time, so a worker that dies without reporting is counted the same as one
 * that reports a failure.
 */
CREATE OR REPLACE FUNCTION public.fn_fail_search_outbox(
  p_ids   bigint[],
  p_token uuid,
  p_error text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.search_outbox
     SET claimed_at  = NULL,
         claim_token = NULL,
         last_error  = left(COALESCE(p_error, 'unknown'), 500)
   WHERE id = ANY(p_ids)
     AND claim_token = p_token
     AND processed_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_search_outbox(integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_complete_search_outbox(bigint[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_fail_search_outbox(bigint[], uuid, text) FROM PUBLIC;

-- service_role ONLY. Not anon, not authenticated. These functions are
-- SECURITY DEFINER over a table that RLS otherwise closes completely; granting
-- them to a browser-reachable role would hand out the write side of the index
-- pipeline. The drain runs with the service key (see /api/search/outbox).
GRANT EXECUTE ON FUNCTION public.fn_claim_search_outbox(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_complete_search_outbox(bigint[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fail_search_outbox(bigint[], uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Housekeeping
-- ---------------------------------------------------------------------------

/**
 * Deletes processed rows older than the given cutoff.
 *
 * Only rows with processed_at set are ever removed: a pending row is unindexed
 * work and deleting it is data loss, however old it looks. Nothing schedules
 * this - it is here so that the retention decision is a call to a named
 * function rather than an ad-hoc DELETE typed against production.
 */
CREATE OR REPLACE FUNCTION public.fn_purge_search_outbox(p_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.search_outbox
   WHERE processed_at IS NOT NULL
     AND processed_at < p_before;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_purge_search_outbox(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_purge_search_outbox(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Backfill
-- ---------------------------------------------------------------------------
--
-- An outbox that starts empty describes a catalogue that has never changed,
-- which would leave a fresh index empty until somebody happened to edit each
-- product. One upsert per currently-active product, so the first drain builds
-- the index. Idempotent: re-running the migration collapses onto the same
-- pending rows rather than duplicating them.

INSERT INTO public.search_outbox (product_id, op, reason)
SELECT p.id, 'upsert', 'backfill'
  FROM public.products p
 WHERE p.deleted_at IS NULL
   AND p.status::text = 'active'
ON CONFLICT (product_id) WHERE processed_at IS NULL
DO NOTHING;
