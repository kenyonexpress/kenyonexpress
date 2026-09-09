-- 189: the review title, and one review per customer per product.
--
-- SECTIONS 25 asks for a `title` column, a `verified_purchase` flag, and
-- "one review per user per product". Migration 154 shipped none of the three,
-- and the third is not a missing column but a DIFFERENT RULE.
--
-- WHAT 154 ENFORCES TODAY: `order_item_id UNIQUE`. One review per purchased
-- LINE. Buying the same product twice therefore earns two review slots on it,
-- and 154's own header states that as the intent ("buying twice earns two
-- review slots, spamming one purchase earns one"). Under the section's rule
-- the second purchase earns nothing new, because the thing being reviewed is
-- the product and a customer has one opinion of it.
--
-- Both constraints stay. They are not alternatives:
--
--   order_item_id UNIQUE   a purchase is spent once (154, unchanged here)
--   (user_id, product_id)  a customer speaks about a product once (this file)
--
-- The second is strictly tighter, so the first can never fire on its own once
-- this lands. It is left in place because dropping a UNIQUE that already holds
-- buys nothing and loses the record of why it existed.
--
-- THE INDEX IS PARTIAL ON `deleted_at IS NULL`, and that is the retry path.
-- A rejected review still occupies the customer's one slot -- otherwise
-- moderation is a treadmill, since anyone rejected for spam could simply
-- resubmit. The way to let somebody try again is to soft-delete the row
-- (185 gave this table `deleted_at`), which frees the slot without erasing
-- the moderation history.
--
-- `verified_purchase` IS A MATERIALISATION, NOT AN ENFORCEMENT, and the
-- distinction matters because the column looks like a gate and is not one.
-- What actually verifies a review is 154's INSERT policy: the row is
-- admissible only when the named order_item belongs to a paid-or-later order
-- of the inserting user and sells the named product. Nothing this file adds
-- can strengthen that, and no code reads this column to decide anything. It
-- exists so exports, the admin queue and any future service-role writer have
-- a field to carry the answer in, and it defaults to true because every row a
-- customer can create has already passed the policy.
--
-- A client CAN post `verified_purchase = false` about its own review. That is
-- a lie in the harmless direction -- it under-claims -- and adding a CHECK to
-- forbid it would mean restating the INSERT policy, which is the exact shape
-- that nearly broke 183 (a restated list is only as current as the day it was
-- written). Left as is, deliberately.
--
-- ADDITIVE ONLY. Two ADD COLUMN IF NOT EXISTS, one CREATE INDEX. No policy is
-- rewritten and no existing object is dropped, so there is nothing here that
-- can remove something production carries and this file does not name.
--
-- THE GUARD IS NOT OPTIONAL. `CREATE UNIQUE INDEX` fails outright if the data
-- already violates it, and the failure would land in the middle of the
-- migration. Block 0 refuses first, by name, with the offending pairs in the
-- message -- because "duplicate key value violates unique constraint" does not
-- tell an operator which customer reviewed which product twice, and picking
-- which of two real reviews to keep is a decision, not a cleanup.
--
-- MEASURED AGAINST PRODUCTION 2026-09-09 before writing:
--
--   public.reviews columns      id, product_id, user_id, order_item_id, rating,
--                               body, status, created_at, reviewed_at,
--                               reviewed_by, deleted_at
--                               -- no title, no verified_purchase
--   rows                        0 total, 0 approved, 0 pending
--   RLS                         enabled, 4 policies
--
-- With zero rows the guard cannot fire today. It is written for the day this
-- is applied, which is not today. It was therefore proven against a table that
-- was made to hold the state it guards against.
--
-- DRY RUNS, 2026-09-09, all three against production inside transactions that
-- a RAISE rolled back, `reviews` back to 0 rows after each:
--
--   1. MIGRATION189_DRYRUN. The file's DDL, run verbatim on the live table.
--      new columns [title, verified_purchase]; index created as
--      `CREATE UNIQUE INDEX ... USING btree (user_id, product_id)
--       WHERE (deleted_at IS NULL)`.
--
--   2. MIGRATION189_DRYRUN2. With the index in place, as the service role:
--        same customer, same product, a SECOND real purchase   refused 23505
--        soft-delete the first, then insert the second         accepted
--        un-delete the first while the second is live          refused 23505
--      The third line was not planned and is the better result: the retry path
--      does not quietly resurrect a second live review, it refuses.
--
--   3. MIGRATION189_DRYRUN3. Two live reviews planted FIRST, one customer, one
--      product, two purchases -- the state 154 alone admits:
--        block 0's query                     FIRED, naming the pair and the count
--        CREATE UNIQUE INDEX without it      refused 23505
--      So the guard reports what the raw failure would only have hinted at.
--
-- ROLLBACK
--
--   drop index if exists public.reviews_one_per_user_product_uidx;
--   alter table public.reviews drop column if exists verified_purchase;
--   alter table public.reviews drop column if exists title;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

-- 0. Refuse rather than fail halfway.
do $$
declare
  dupes text;
begin
  select string_agg(format('user %s / product %s: %s reviews', user_id, product_id, n), '; ')
    into dupes
    from (
      select user_id, product_id, count(*) as n
        from public.reviews
       where deleted_at is null
       group by user_id, product_id
      having count(*) > 1
    ) d;

  if dupes is not null then
    raise exception
      'MIGRATION189_REFUSED: reviews already hold more than one live row per (user, product). Decide which to keep, soft-delete the rest, then re-run. Offenders: %',
      dupes;
  end if;
end $$;

-- 1. The title. Nullable: 154 shipped without it and every existing row
--    predates it. 200 is a hard DB ceiling; the zod schema holds the product
--    limit (120) so tightening the UI never needs a migration.
alter table public.reviews
  add column if not exists title text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.reviews'::regclass
       and conname = 'reviews_title_length'
  ) then
    alter table public.reviews
      add constraint reviews_title_length
      check (title is null or char_length(title) <= 200);
  end if;
end $$;

comment on column public.reviews.title is
  'Optional one-line headline. The body is the review; this is what a list of reviews shows before the reader expands one.';

-- 2. The verified-purchase flag. See the header: this records what the INSERT
--    policy already enforced, it does not enforce anything itself.
alter table public.reviews
  add column if not exists verified_purchase boolean not null default true;

comment on column public.reviews.verified_purchase is
  'True because reviews_owner_insert_verified admitted the row. NOT a gate: no code reads this to decide access. Materialised for exports and for any future service-role writer that creates an unverified row.';

-- 3. One live review per customer per product.
create unique index if not exists reviews_one_per_user_product_uidx
  on public.reviews (user_id, product_id)
  where deleted_at is null;

comment on index public.reviews_one_per_user_product_uidx is
  'SECTIONS 25: one review per user per product. Partial on deleted_at so a soft-delete frees the slot, which is the only retry path after a rejection.';
