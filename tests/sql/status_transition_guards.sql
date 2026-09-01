-- Every transition in all three 137 guards, legal and illegal, asserting 23514.
--
--   docker exec -i supabase_db_kenyonexpress psql -U postgres -v ON_ERROR_STOP=1 \
--     < tests/sql/status_transition_guards.sql
--
-- It also runs unchanged through the Supabase MCP `execute_sql`, which is how it
-- was first run: Docker does not come up on this laptop (see STATE.md), and the
-- guards are only in one place that matters anyway, which is production.
--
-- WHY THIS EXISTS, AND WHY IT IS NOT THE VITEST FILE.
--
-- `src/server/domain/orders/status-transitions.test.ts` already asserts one case
-- per transition, legal and illegal. It proves that `status-transitions.json`
-- and the TEXT OF THE MIGRATION FILE agree. That is a real check and it caught a
-- real bug, but it is a check on two files in this repo. Neither file is what
-- runs when a customer pays. Nothing in vitest has ever executed a trigger, so
-- nothing in vitest has ever seen a 23514.
--
-- The gap that leaves is exact: a guard can be correct in the repo and absent,
-- stale or differently-bodied in the database. `137` was applied by hand, so the
-- repo copy and the deployed copy have no mechanical link at all.
--
-- HOW IT AVOIDS TOUCHING PRODUCTION DATA.
--
-- The three guard functions are generic: they read `NEW`/`OLD` and name no
-- table. So they can be attached to TEMP tables of the same shape and exercised
-- there. Every row this harness writes is in a temp table that disappears with
-- the session, and no row in `orders`, `order_items` or `payments` is read or
-- written. That matters because the only database carrying these triggers is
-- production.
--
-- Setting the FROM state is an INSERT, not an UPDATE, which is what makes the
-- sweep possible: the guards are BEFORE UPDATE, so an INSERT places the row in
-- any state, including the ones nothing may transition into. `escrow_held` is
-- the case that forces this. No rule enters it, so a from-state of
-- `escrow_held` is unreachable by any legal path, and its three outgoing edges
-- could not otherwise be tested at all.
--
-- The pass is the full cross product per column, not a sample: every ordered
-- pair of distinct enum values, checked against the legal list below.
--
--   MEASURED 2026-09-01 against the deployed functions: n=144, pass=144, fail=0.
--   37 legal transitions succeeded; 107 illegal ones raised 23514.
--
-- The legal list is duplicated here rather than imported, deliberately: this
-- harness is the independent witness. If it read the same JSON the application
-- reads, a wrong edit to that JSON would change the guard and the test together
-- and this file would agree with the bug. It is kept in step by
-- `status-transitions.test.ts`, which parses both.

BEGIN;

CREATE TEMP TABLE probe_orders (id int primary key, status public.order_status);
CREATE TEMP TABLE probe_items  (id int primary key, settlement_status public.settlement_status);
CREATE TEMP TABLE probe_pay    (id int primary key, status public.payment_status);

CREATE TRIGGER tg_p_orders BEFORE UPDATE ON probe_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_orders_status_guard();
CREATE TRIGGER tg_p_items  BEFORE UPDATE ON probe_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_settlement_status_guard();
CREATE TRIGGER tg_p_pay    BEFORE UPDATE ON probe_pay
  FOR EACH ROW EXECUTE FUNCTION public.fn_payments_status_guard();

DO $probe$
DECLARE
  r record; v_state text; v_report text := ''; v_fail int := 0; v_pass int := 0; v_n int := 0;
BEGIN
  FOR r IN
    -- The applied transition tables. `nothing ENTERS escrow_held` is not an
    -- omission here: escrow is legacy under the no-escrow rule, the two rows
    -- that exist may still leave, and no new row may be created in it.
    WITH legal(tbl, f, t2) AS (VALUES
      ('orders','fulfilled','platform_settled'),('orders','fulfilled','refunded'),
      ('orders','paid','fulfilled'),('orders','paid','partially_fulfilled'),
      ('orders','paid','platform_settled'),('orders','paid','refunded'),
      ('orders','partially_fulfilled','fulfilled'),('orders','partially_fulfilled','refunded'),
      ('orders','pending','cancelled'),('orders','pending','paid'),
      ('orders','platform_settled','refunded'),
      ('order_items','escrow_held','escrow_released'),('order_items','escrow_held','redeemed'),
      ('order_items','escrow_held','refunded'),
      ('order_items','escrow_released','redeemed'),('order_items','escrow_released','refunded'),
      ('order_items','paid','cancelled'),('order_items','paid','platform_settled'),
      ('order_items','paid','redeemed'),('order_items','paid','refunded'),
      ('order_items','paid','split_executed'),
      ('order_items','pending','cancelled'),('order_items','pending','paid'),
      ('order_items','pending','refunded'),('order_items','pending','split_executed'),
      ('order_items','platform_settled','redeemed'),('order_items','platform_settled','refunded'),
      ('order_items','split_executed','redeemed'),('order_items','split_executed','refunded'),
      ('payments','initiated','failed'),('payments','initiated','redirected'),
      ('payments','initiated','succeeded'),
      ('payments','platform_settled','refunded'),
      ('payments','redirected','failed'),('payments','redirected','succeeded'),
      ('payments','succeeded','platform_settled'),('payments','succeeded','refunded')
    ),
    -- Read from the enums, so a state added to an enum without a rule shows up
    -- here as an untested-but-refused pair rather than silently going unchecked.
    states(tbl, s) AS (
      SELECT 'orders', e.enumlabel::text FROM pg_enum e JOIN pg_type ty ON ty.oid=e.enumtypid
        WHERE ty.typname='order_status'
      UNION ALL
      SELECT 'order_items', e.enumlabel::text FROM pg_enum e JOIN pg_type ty ON ty.oid=e.enumtypid
        WHERE ty.typname='settlement_status'
      UNION ALL
      SELECT 'payments', e.enumlabel::text FROM pg_enum e JOIN pg_type ty ON ty.oid=e.enumtypid
        WHERE ty.typname='payment_status'
    )
    SELECT a.tbl, a.s AS f, b.s AS t2,
           EXISTS (SELECT 1 FROM legal l WHERE l.tbl=a.tbl AND l.f=a.s AND l.t2=b.s) AS legal
    FROM states a JOIN states b ON b.tbl=a.tbl AND b.s <> a.s
    ORDER BY 1,2,3
  LOOP
    v_n := v_n + 1;
    IF    r.tbl='orders'      THEN DELETE FROM probe_orders; INSERT INTO probe_orders VALUES (1, r.f::public.order_status);
    ELSIF r.tbl='order_items' THEN DELETE FROM probe_items;  INSERT INTO probe_items  VALUES (1, r.f::public.settlement_status);
    ELSE                           DELETE FROM probe_pay;    INSERT INTO probe_pay    VALUES (1, r.f::public.payment_status);
    END IF;
    BEGIN
      IF    r.tbl='orders'      THEN UPDATE probe_orders SET status=r.t2::public.order_status                 WHERE id=1;
      ELSIF r.tbl='order_items' THEN UPDATE probe_items  SET settlement_status=r.t2::public.settlement_status WHERE id=1;
      ELSE                           UPDATE probe_pay    SET status=r.t2::public.payment_status               WHERE id=1;
      END IF;
      v_state := '00000';
    EXCEPTION WHEN others THEN v_state := SQLSTATE;
    END;
    -- A legal move must be allowed; an illegal one must raise 23514 and not
    -- some other error. Asserting the SQLSTATE and not merely "it threw" is the
    -- point: a NOT NULL violation would also throw, and would mean the guard
    -- never ran.
    IF (r.legal AND v_state='00000') OR ((NOT r.legal) AND v_state='23514') THEN
      v_pass := v_pass + 1;
    ELSE
      v_fail := v_fail + 1;
      IF length(v_report) < 800 THEN
        v_report := v_report || format('%s:%s>%s want=%s got=%s | ',
          r.tbl, r.f, r.t2, CASE WHEN r.legal THEN 'ok' ELSE '23514' END, v_state);
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'status_transition_guards: n=% pass=% fail=%', v_n, v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'status_transition_guards FAILED: % of % :: %', v_fail, v_n, v_report;
  END IF;
  IF v_n <> 144 THEN
    RAISE EXCEPTION 'status_transition_guards: expected 144 pairs, swept % -- an enum gained or lost a value', v_n;
  END IF;
END $probe$;

ROLLBACK;
