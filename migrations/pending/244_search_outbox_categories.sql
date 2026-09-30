-- 244_search_outbox_categories.sql
--
-- The 132 floor learns about categories (STEP 08, 30.09).
--
-- MEASURED BEFORE WRITING. 132 (applied) put an AFTER trigger on
-- public.products that records every write as a search_index_outbox row, and
-- src/server/search/outbox-drain.ts drains it. The categories index
-- (meili-settings.ts CATEGORIES_INDEX) existed only as settings plus a script
-- rebuild; nothing in src/ wrote it, and a category renamed in the admin
-- reached autocomplete only when somebody ran scripts/setup-meilisearch.mjs.
-- The webhook path now handles `categories` (pipeline-contracts.ts
-- jobForChange), and this file is the durable floor under THAT path, for the
-- same reason 132 is the floor under the products webhook: a lost POST must
-- not be a permanently stale document.
--
-- WHAT IT DOES
--   1. `entity`      which table the row describes: 'product' (every row so
--                    far, and the default) or 'category'.
--   2. `category_id` the category a 'category' row describes. NOT a foreign
--                    key, for the reason 132 gives about product_id: a DELETE
--                    of the category must leave the "remove this document"
--                    instruction behind.
--   3. product_id drops NOT NULL, and a CHECK ties the two ids to `entity`
--                    so a row can never be both, or neither.
--   4. A trigger on public.categories, the same shape as 132's, that writes
--                    a 'delete' when the row is soft-deleted or deactivated
--                    and an 'upsert' otherwise.
--
-- WHAT IT DOES NOT DO
--   It does not change claim_search_index_jobs: the function RETURNS SETOF
--   the table, so the new columns flow through the existing claim untouched,
--   and the drain reads an absent `entity` as 'product'. It does not touch
--   RLS: the table keeps zero policies and the service key is the only
--   reader, as 132 left it.
--
-- SAFE TO DEPLOY BEFORE OR AFTER THE CODE. The drain that ships with this
-- file tolerates rows without the columns; the drain that runs today ignores
-- columns it does not read. A category row written before the new drain
-- deploys sits in the outbox until it does, which is what an outbox is for.
--
-- ROLLBACK
--   DROP TRIGGER  IF EXISTS categories_enqueue_search_index ON public.categories;
--   DROP FUNCTION IF EXISTS public.enqueue_category_search_index();
--   DELETE FROM public.search_index_outbox WHERE entity = 'category';
--   ALTER TABLE public.search_index_outbox DROP CONSTRAINT IF EXISTS search_index_outbox_entity_id_check;
--   ALTER TABLE public.search_index_outbox ALTER COLUMN product_id SET NOT NULL;
--   ALTER TABLE public.search_index_outbox DROP COLUMN IF EXISTS category_id;
--   ALTER TABLE public.search_index_outbox DROP COLUMN IF EXISTS entity;

BEGIN;

ALTER TABLE public.search_index_outbox
  ADD COLUMN IF NOT EXISTS entity text NOT NULL DEFAULT 'product'
    CHECK (entity IN ('product', 'category'));

ALTER TABLE public.search_index_outbox
  ADD COLUMN IF NOT EXISTS category_id uuid;

ALTER TABLE public.search_index_outbox
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.search_index_outbox
  DROP CONSTRAINT IF EXISTS search_index_outbox_entity_id_check;
ALTER TABLE public.search_index_outbox
  ADD CONSTRAINT search_index_outbox_entity_id_check CHECK (
    (entity = 'product'  AND product_id  IS NOT NULL AND category_id IS NULL) OR
    (entity = 'category' AND category_id IS NOT NULL AND product_id  IS NULL)
  );

COMMENT ON COLUMN public.search_index_outbox.entity IS
  'Which table the row describes. product = the 132 trigger on products; category = the 244 trigger on categories. The drain groups and dispatches on it.';
COMMENT ON COLUMN public.search_index_outbox.category_id IS
  'Set only when entity = category. Intentionally NOT a foreign key, like product_id: a deleted category still owes a delete job.';

-- "Is the categories index behind, and on what." Mirrors the product index.
CREATE INDEX IF NOT EXISTS search_index_outbox_category_idx
  ON public.search_index_outbox (category_id)
  WHERE done_at IS NULL AND entity = 'category';

-- ---------------------------------------------------------------------------
-- The trigger. AFTER, so it cannot affect the write it observes. Same
-- visibility rule as the public read and the setup script: a category is
-- visible while is_active is not false and it is not soft-deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_category_search_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.search_index_outbox (entity, category_id, op)
      VALUES ('category', OLD.id, 'delete');
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NEW.is_active IS FALSE THEN
    INSERT INTO public.search_index_outbox (entity, category_id, op)
      VALUES ('category', NEW.id, 'delete');
  ELSE
    INSERT INTO public.search_index_outbox (entity, category_id, op)
      VALUES ('category', NEW.id, 'upsert');
  END IF;
  RETURN NEW;
END
$$;

-- A trigger function is fired by the trigger, never called by a client;
-- CREATE OR REPLACE re-grants EXECUTE to PUBLIC, so take it back (the 143 rule).
REVOKE ALL ON FUNCTION public.enqueue_category_search_index() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS categories_enqueue_search_index ON public.categories;
CREATE TRIGGER categories_enqueue_search_index
  AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_category_search_index();

-- ------------------------------------------------------------------- checks

DO $$
DECLARE
  v_rls boolean;
  v_bad integer;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.search_index_outbox'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'RLS is off on search_index_outbox; 132 left it on and this file must not change that';
  END IF;

  SELECT count(*) INTO v_bad FROM public.search_index_outbox
   WHERE NOT ((entity = 'product' AND product_id IS NOT NULL AND category_id IS NULL)
           OR (entity = 'category' AND category_id IS NOT NULL AND product_id IS NULL));
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% existing outbox rows violate the entity/id rule', v_bad;
  END IF;

  IF has_function_privilege('anon', 'public.enqueue_category_search_index()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute enqueue_category_search_index; the revoke did not take';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION (after applying, inside rolled-back DO blocks)
-- ============================================================================
-- 1. A category rename enqueues exactly one category row:
--      DO $$ DECLARE n int; BEGIN
--        UPDATE public.categories SET updated_at = now()
--         WHERE id = (SELECT id FROM public.categories LIMIT 1);
--        SELECT count(*) INTO n FROM public.search_index_outbox
--         WHERE done_at IS NULL AND entity = 'category';
--        RAISE EXCEPTION 'rollback: % pending category rows', n;
--      END $$;
--
-- 2. Deactivating a category enqueues a DELETE, not an upsert:
--      ... UPDATE categories SET is_active = false ... -> expect op = 'delete'.
--
-- 3. The 132 product trigger still writes entity = 'product' with no
--    category_id (the DEFAULT covers it; the CHECK proves it).
