-- 223_notifications_outbox_link.sql
--
-- The column that lets the outbox drain write in-app rows exactly once.
--
-- =============================================================================
-- WHAT IS BROKEN TODAY: THE TABLE HAS NO WRITER
-- =============================================================================
--
-- 198 shipped `notifications` complete: RLS, both indexes, the `read_at` column
-- grant, `REPLICA IDENTITY FULL`, and membership of `supabase_realtime`. The
-- bell reads it, `/account/notifications` reads it, and the realtime
-- subscription is live and correct.
--
-- Nothing writes to it. Measured 2026-09-09: the only statements against
-- `notifications` in the whole repository are two SELECTs and one UPDATE of
-- `read_at`. The notification centre is a finished feature that is empty by
-- construction and always will be.
--
-- The fix is a fourth leg on the outbox drain, next to email, push and
-- WhatsApp. This file is the one piece of schema that leg needs.
--
-- =============================================================================
-- WHY A LINK COLUMN AND NOT A STATUS COLUMN
-- =============================================================================
--
-- The obvious shape is `in_app_status` on `notification_outbox`, mirroring
-- `push_status`. It is the wrong one here, because the two legs answer
-- different questions. A push is an attempt against a remote service that can
-- fail, retry and back off, so it needs a state machine. An in-app row is a
-- local INSERT in the same database: it either exists or it does not, and the
-- ROW ITSELF is the state. A second column tracking whether the row exists is a
-- fact stored twice, and the two copies will eventually disagree.
--
-- So: `notifications.outbox_id`, unique. The drain does
-- `INSERT ... ON CONFLICT (outbox_id) DO NOTHING`, which makes a redelivery,
-- an overlapping cron run, or a manual catch-up idempotent at the database
-- rather than in the code that happens to be calling.
--
-- ON DELETE SET NULL and not CASCADE. Outbox rows are operational plumbing and
-- may be pruned; a customer's notification history must not be deleted because
-- the queue behind it was tidied up. The row survives with a null link, which
-- is exactly what "this notification is no longer traceable to a queue entry"
-- should look like.
--
-- THE INDEX IS NOT PARTIAL, AND THE FIRST DRAFT'S WAS. `... WHERE outbox_id IS
-- NOT NULL` is the tidier index and it breaks the only statement that matters:
--
--   insert ... on conflict (outbox_id) do nothing
--   ERROR:  42P10: there is no unique or exclusion constraint matching the
--           ON CONFLICT specification
--
-- Measured, not reasoned about: an inference-based ON CONFLICT only matches a
-- PARTIAL index if it repeats the predicate verbatim, so every writer forever
-- would have to remember `on conflict (outbox_id) where outbox_id is not null`
-- or take a runtime error. Postgres already treats NULLs as distinct in a
-- unique index, so a plain UNIQUE gives the same guarantee with no predicate to
-- repeat. What the partial version bought was index entries not stored for null
-- rows, and the drain is the only writer, so almost every row has a link
-- anyway.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS outbox_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notifications'::regclass
       AND conname = 'notifications_outbox_id_fkey'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_outbox_id_fkey
      FOREIGN KEY (outbox_id) REFERENCES public.notification_outbox(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_outbox_id_key
  ON public.notifications (outbox_id);

COMMENT ON COLUMN public.notifications.outbox_id IS
  'The notification_outbox row this was fanned out from. UNIQUE (nulls are distinct), so the drain is idempotent. Null for rows written by any other path; see 223.';

-- The grant is NOT widened. `authenticated` holds SELECT on the table and
-- UPDATE on `read_at` alone (198), and the drain writes with the service role.
-- A customer must not be able to set this column: an attacker who could write
-- `outbox_id` could take the unique slot for an event that has not been fanned
-- out yet and suppress it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'notifications'
       AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
       AND column_name <> 'read_at'
  ) THEN
    RAISE EXCEPTION 'authenticated holds UPDATE on a notifications column other than read_at';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- PROBED AGAINST PRODUCTION, ROLLED BACK, 2026-09-09
-- =============================================================================
--
-- Scratch tables of this shape, in a `DO` block that raises at the end.
--
--   after_redelivery       = 1   the second insert for one outbox row is a
--                                no-op, so an overlapping cron run or a
--                                redelivery cannot double-notify
--   two_nulls_ok           = 3   two rows written by another path, both with a
--                                null link, coexist under the UNIQUE index
--   history_survives_prune = 3   deleting the outbox row leaves the customer's
--                                notifications intact
--   nulled_links           = 3   and sets the link to null rather than removing
--                                the row
--
-- The FIRST draft of this file used a partial index and the probe rejected it
-- with 42P10 before it could be committed, which is the whole argument for
-- running these.
--
-- VERIFY after applying:
--
--   select count(*) from notifications where outbox_id is not null;
