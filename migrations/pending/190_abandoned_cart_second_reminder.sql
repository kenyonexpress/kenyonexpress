-- 190: the second abandoned-cart reminder.
--
-- SECTIONS 26 asks for two reminders, T+2h and T+24h, stopping after a purchase
-- or after two. What shipped sends ONE, ever, and the ceiling is structural
-- rather than a decision the code makes: `abandoned_cart_one_per_cart` is a
-- UNIQUE on `cart_id` alone, and `fn_due_abandoned_carts` excludes any cart
-- that has any nudge row at all. There is no counter to raise.
--
-- WHY ONE WAS THE RIGHT DEFAULT AND TWO STILL IS. The shipped route's header
-- says a second mail about the same forgotten cart is what makes a person press
-- the spam button, and that is true of an UNBOUNDED sequence. Two, twenty-two
-- hours apart, with the same consent gate and the same unsubscribe link, is the
-- section's decision and it is a bounded one: this file raises the ceiling from
-- one to two and the CHECK constraint makes three unreachable.
--
-- THE COUNTER IS A COLUMN ON THE NUDGE, NOT ON THE CART, and that is why there
-- is no `cart_abandonment` table here. The section names one holding
-- (cart_id, last_activity_at, reminder_sent_count); every one of those three is
-- already answerable and already correct where it lives:
--
--   last_activity_at      `carts.updated_at`, which the cart writes on every
--                         change. A copy would be a second timestamp to keep in
--                         step, and the one that drifted would be the one the
--                         mail was scheduled from.
--   reminder_sent_count   `count(*)` over the nudges for that cart, which is
--                         the number of mails ACTUALLY SENT rather than a
--                         counter that a failed send can leave lying.
--   cart_id               already the nudge's own column.
--
-- A separate table would have to be kept true by a trigger or by application
-- code, and the failure mode is silent in both directions: a counter that ran
-- ahead of the sends mails less than it should, one that lagged mails more.
-- Counting the receipts cannot disagree with the receipts.
--
-- THE GAP IS MEASURED FROM THE LAST NUDGE, NOT FROM THE CART, and that is the
-- one non-obvious line in the function. The naive rule -- "cart older than 24h
-- and exactly one nudge" -- misfires the moment the cron starts late or misses
-- a run: a cart abandoned 30 hours ago and never nudged qualifies for the first
-- mail immediately, and one hourly tick later it is over 24h old with one nudge
-- against it, so the second mail goes out an hour after the first. Requiring
-- the previous nudge to be (24 - 2) hours old keeps the spacing whatever the
-- schedule does.
--
-- THE FUNCTION IS DROPPED AND RECREATED, NOT REPLACED, because its return type
-- gains a column and `CREATE OR REPLACE FUNCTION` cannot change one. That makes
-- this the one destructive statement in the file, so:
--
--   * the body below starts from the definition read off production on
--     2026-09-09 (`pg_get_functiondef`), and every condition in it is carried
--     over verbatim -- the seven-day window, `expires_at > now()`, the
--     ordered-since check, the subscribed check and the suppression check;
--   * `GRANT EXECUTE` is restated, because a DROP takes the grants with it and
--     nothing would report their absence until the cron 403s. Production
--     carries `postgres` and `service_role`, read the same day;
--   * SECURITY DEFINER and the pinned `search_path` are restated for the same
--     reason.
--
-- THE SIGNATURE STAYS BACKWARD COMPATIBLE. `p_second_after_hours` is a third
-- parameter WITH A DEFAULT, so the deployed caller -- which passes
-- `p_older_than_hours` and `p_limit` by name -- keeps resolving. That is what
-- lets the route ship before this file is applied.
--
-- BEFORE THIS IS APPLIED, THE ROUTE DEGRADES TO EXACTLY TODAY'S BEHAVIOUR: the
-- old function returns no `reminder_number`, the route reads that as reminder
-- 1, and the old UNIQUE still allows only one nudge per cart. Nothing to
-- coordinate, and no window where the two halves disagree.
--
-- ADDITIVE APART FROM THE UNIQUENESS SWAP. The new constraint is added BEFORE
-- the old one is dropped, so there is no instant in the transaction where a
-- cart has no uniqueness protecting it at all.
--
-- MEASURED AGAINST PRODUCTION 2026-09-09 before writing:
--
--   abandoned_cart_nudges       id, cart_id, user_id, email, cart_value_agorot,
--                               item_count, sent_at, provider_id,
--                               recovered_order_id, recovered_at, created_at
--                               -- no reminder_number
--   indexes                     pkey(id), abandoned_cart_one_per_cart(cart_id),
--                               sent_idx(sent_at DESC), user_idx(user_id),
--                               recovered_order_id
--   and abandoned_cart_one_per_cart is a CONSTRAINT, which `pg_indexes` does
--   not say. See section 2.
--   fn_due_abandoned_carts      SECURITY DEFINER, search_path public/pg_temp,
--                               EXECUTE to postgres and service_role
--
-- ROLLBACK
--
--   drop function if exists public.fn_due_abandoned_carts(integer, integer, integer);
--   alter table public.abandoned_cart_nudges
--     add constraint abandoned_cart_one_per_cart unique (cart_id);
--   alter table public.abandoned_cart_nudges
--     drop constraint if exists abandoned_cart_one_per_cart_reminder;
--   alter table public.abandoned_cart_nudges drop column if exists reminder_number;
--   -- then recreate the two-argument function from this file's history.
--
--   Note the order: the old unique cannot be recreated while a cart holds two
--   nudges, so a rollback after real second reminders have gone out needs those
--   rows removed first. That is a decision, not a cleanup, which is why it is
--   written down rather than scripted.
--
-- DRY RUNS, 2026-09-09, against production inside transactions that a RAISE
-- rolled back. Both found something the file did not have when it was written:
--
--   1. `DROP INDEX abandoned_cart_one_per_cart` FAILED, 2BP01: it is a
--      CONSTRAINT and `pg_indexes` -- which is what was read to write the
--      statement -- lists it like any other index and says nothing about that.
--      The run stopped halfway, with the new constraint added and the function
--      not yet replaced. Section 2 drops it as a constraint now.
--
--   2. The recreated function came back granted to PUBLIC, anon, authenticated,
--      postgres and service_role. The original carried only the last two. See
--      the revoke block at the bottom for the measurement and what it means.
--
--   3. With both corrected: signature
--      `(p_older_than_hours, p_limit, p_second_after_hours) -> TABLE(..., reminder_number smallint)`,
--      grants back to exactly `postgres, service_role`, constraints
--      `abandoned_cart_nudges_reminder_number` and
--      `abandoned_cart_one_per_cart_reminder`, and BOTH call shapes resolve --
--      the deployed two-named-argument call and the new three-argument one.
--
--   4. The whole sequence, on a real profile with a real subscribed row and a
--      cart planted 30 HOURS old -- the late-cron case the spacing rule exists
--      for, not the happy path:
--
--        cart 30h old, never nudged                reminder 1
--        one hourly tick later                     NOT DUE
--        the first nudge aged past the 22h gap     reminder 2
--        both sent                                 NOT DUE
--        a third row inserted directly             refused 23514
--
--      The second line is the whole point. Under the naive rule -- "cart older
--      than 24h and exactly one nudge" -- that tick sends the second mail one
--      hour after the first.
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

-- 0. Refuse rather than fail halfway. The new unique is (cart_id,
--    reminder_number) and every existing row defaults to 1, so it can only
--    collide if the old unique is already gone and duplicates exist.
do $$
declare
  dupes text;
begin
  select string_agg(format('cart %s: %s nudges', cart_id, n), '; ')
    into dupes
    from (
      select cart_id, count(*) as n
        from public.abandoned_cart_nudges
       group by cart_id
      having count(*) > 1
    ) d;

  if dupes is not null then
    raise exception
      'MIGRATION190_REFUSED: abandoned_cart_nudges already hold more than one row per cart, so they cannot all take reminder_number 1. Number them first, then re-run. Offenders: %',
      dupes;
  end if;
end $$;

-- 1. The counter, as a property of the mail that was sent.
alter table public.abandoned_cart_nudges
  add column if not exists reminder_number smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.abandoned_cart_nudges'::regclass
       and conname = 'abandoned_cart_nudges_reminder_number'
  ) then
    alter table public.abandoned_cart_nudges
      add constraint abandoned_cart_nudges_reminder_number
      check (reminder_number between 1 and 2);
  end if;
end $$;

comment on column public.abandoned_cart_nudges.reminder_number is
  'Which of the two reminders this row is, 1 or 2. The CHECK is the ceiling: SECTIONS 26 stops at two and a third is unrepresentable rather than merely unimplemented.';

-- 2. Swap the uniqueness. New one first: no instant without one.
--
--    `abandoned_cart_one_per_cart` IS A CONSTRAINT, NOT A BARE INDEX, and the
--    difference is not cosmetic: `DROP INDEX` on it fails with 2BP01
--    ("constraint ... requires it"), which is where the first dry run of this
--    file stopped -- halfway through, with the new constraint added and the
--    function not yet replaced. `pg_indexes` lists it like any other index and
--    says nothing about the constraint behind it, so reading that view is what
--    produced the wrong statement. It has to be dropped as a constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.abandoned_cart_nudges'::regclass
       and conname = 'abandoned_cart_one_per_cart_reminder'
  ) then
    alter table public.abandoned_cart_nudges
      add constraint abandoned_cart_one_per_cart_reminder unique (cart_id, reminder_number);
  end if;
end $$;

alter table public.abandoned_cart_nudges
  drop constraint if exists abandoned_cart_one_per_cart;

comment on constraint abandoned_cart_one_per_cart_reminder on public.abandoned_cart_nudges is
  'One row per cart per reminder. With the CHECK above this caps a cart at two nudges in the database rather than in the route.';

-- 3. The due list, now aware of which reminder is owed.
drop function if exists public.fn_due_abandoned_carts(integer, integer);

create function public.fn_due_abandoned_carts(
  p_older_than_hours integer default 2,
  p_limit integer default 100,
  p_second_after_hours integer default 24
)
returns table(
  cart_id uuid,
  user_id uuid,
  email text,
  item_count integer,
  updated_at timestamptz,
  reminder_number smallint
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  SELECT
    c.id,
    c.profile_id,
    p.email,
    jsonb_array_length(c.items),
    c.updated_at,
    (n.sent_count + 1)::smallint
  FROM public.carts c
  JOIN public.profiles p ON p.id = c.profile_id
  -- The receipts ARE the counter. See the header on why there is no separate
  -- cart_abandonment table holding a number that can disagree with them.
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS sent_count, max(x.sent_at) AS last_sent_at
      FROM public.abandoned_cart_nudges x
     WHERE x.cart_id = c.id
  ) n
  WHERE c.profile_id IS NOT NULL
    AND p.email IS NOT NULL
    AND jsonb_array_length(c.items) > 0
    -- The ceiling. Two, and the CHECK on reminder_number agrees.
    AND n.sent_count < 2
    AND c.updated_at < now() - make_interval(hours => p_older_than_hours)
    -- A window, not just a floor. A cart untouched for three weeks is not
    -- abandoned, it is forgotten, and mailing about it reads as surveillance.
    AND c.updated_at > now() - interval '7 days'
    AND c.expires_at > now()
    -- The SPACING, measured from the last mail rather than from the cart. A
    -- cart that was already 30 hours old when it was first nudged must not get
    -- the second mail on the next hourly tick. See the header.
    AND (
      n.sent_count = 0
      OR n.last_sent_at < now() - make_interval(hours => greatest(p_second_after_hours - p_older_than_hours, 1))
    )
    -- Bought since. The cart is only abandoned if nothing was ordered after it
    -- was last touched.
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.user_id = c.profile_id
        AND o.created_at >= c.updated_at
        AND o.status <> 'pending'
    )
    -- Consent. No subscribed row, no email: an abandoned-cart message is
    -- marketing under 30A however operational it feels.
    AND EXISTS (
      SELECT 1 FROM public.newsletter_subscribers s
      WHERE s.email = lower(p.email) AND s.status = 'subscribed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.email_suppressions x WHERE x.email = lower(p.email)
    )
  ORDER BY c.updated_at ASC
  LIMIT p_limit;
$function$;

-- THE REVOKES ARE THE SECURITY-CRITICAL HALF OF THIS FILE, and re-granting
-- without them would be a regression that no test and no gate would notice.
--
-- A DROP takes the grants with it, and a bare CREATE does not restore them --
-- it applies the DEFAULTS. Postgres grants EXECUTE on a new function to PUBLIC,
-- and this project's default privileges add `anon` and `authenticated` on top.
-- The function is SECURITY DEFINER and it RETURNS CUSTOMER EMAIL ADDRESSES, so
-- the default is an unauthenticated harvest of every shopper with an abandoned
-- cart. The old function carried exactly `postgres` and `service_role`, which
-- means somebody had already revoked the rest; the DROP would silently undo
-- that.
--
-- MEASURED, not reasoned about. Production 2026-09-09, rolled back, calling as
-- `anon`:
--
--   after a bare CREATE, no revoke     ALLOWED  (rows of profile email)
--   after the three REVOKEs below      refused 42501
--   grants then                        postgres, service_role -- the original
--
-- The "ALLOWED" run returned zero rows only because no cart is currently due.
-- Zero rows is not the finding; being let in is.
revoke all on function public.fn_due_abandoned_carts(integer, integer, integer) from public;
revoke all on function public.fn_due_abandoned_carts(integer, integer, integer) from anon;
revoke all on function public.fn_due_abandoned_carts(integer, integer, integer) from authenticated;

-- Production carried exactly these two, read 2026-09-09. Nothing reports their
-- absence until the cron gets a 403.
grant execute on function public.fn_due_abandoned_carts(integer, integer, integer) to postgres;
grant execute on function public.fn_due_abandoned_carts(integer, integer, integer) to service_role;

comment on function public.fn_due_abandoned_carts(integer, integer, integer) is
  'Carts owed an abandoned-cart reminder, with which reminder (1 or 2) is owed. Every eligibility rule lives here rather than in the route so it is testable in SQL and cannot drift between callers.';
