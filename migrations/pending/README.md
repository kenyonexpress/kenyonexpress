# `migrations/pending/`

## 2026-09-09: 183 APPLIED, and the preflight is the whole story

`183_order_shipped_notification.sql` enqueues `kind=order_shipped` when an
order transitions INTO `fulfilled`. A trigger and not application code because
`fulfilled` has at least three writers, and an enqueue in one of them silently
skips the others.

**The file would have broken account deletion if applied verbatim.** It restated
`notification_outbox_kind_check` in full, the style 121 established, from a
twelve-name list plus `order_shipped`. Read off production 2026-09-09, the live
constraint already carried **fourteen** names, including `account_deleted` from
150's lineage. `DROP CONSTRAINT` + `ADD CONSTRAINT` with the shorter list would
have dropped `account_deleted` and turned every account-deletion notification
into a 23514. `account_deleted` was added to the file before it was applied, and
the live constraint still carries all fourteen. **A restated list is only ever as
current as the day it was written**, which is exactly what 155 already knew: it
carries a `RAISE EXCEPTION` refusing to run if the check has no `account_deleted`
yet. 183 had no such guard.

**Applied** as `order_shipped_notification_183`, then proven in a transaction
that was rolled back (`notification_outbox` reads 0 rows before and after,
orders still `cancelled=2, paid=2`):

```
paid -> fulfilled                   1 row enqueued
UPDATE on an already-fulfilled row  still 1
bounce out and back                 refused by the 137 guard anyway
                                    (fulfilled -> partially_fulfilled illegal),
                                    count held at 1
dedupe_key    order-shipped:<order uuid>
payload       order_id, order_ref D3A5AA99, item_count 1, fulfilled_at,
              customer_name (Hebrew, resolved from profiles)
```

**A second finding, recorded rather than fixed.** The constraint accepts
`account_deleted` and **no builder renders it** — there is no
`buildAccountDeletedEmail`, so `buildNotification` returns null and the drain
would park such a row forever. Nothing enqueues it today
(`src/server/actions/account.ts` deliberately sends no goodbye mail), so it is a
loaded gun on the shelf rather than a fire. It is now tracked as
`CHECK_ACCEPTS_BUT_RENDERS_NOTHING` in `src/lib/email/outbox-kinds.test.ts`, with
an inverted assertion so the list cannot rot: write the builder and the test goes
red asking for the name to be moved. The stale comment in `account.ts` — which
said the constraint was what blocked the goodbye mail — now says what actually
blocks it.


## 2026-09-09: 181 APPLIED, as 181a + 181b

**181 was the only security file left in the queue and it was NOT applied**,
which took reading a comment to establish. Both functions it touches,
`is_support()` and `enforce_profile_privilege_columns()`, already exist in
production from the 053/090 lineage, so a probe that asks "does the name exist"
calls 181 applied and drops a live hardening out of the queue. What settled it
is the comment production reported on the trigger function (still the pre-181
text) and the absence of the `profiles_super_admin_mfa` policy.

**The hole was real and was read off production, not inferred.** The deployed
`enforce_profile_privilege_columns` body was literally
`IF public.is_admin() THEN RETURN NEW; END IF;` with nothing between it and the
return, so any admin could grant themselves or anyone else `super_admin`
through the user client. The "only super_admin grants admin roles" rule existed
only in application code on the service-role path.

**Split in two on the way in**, the shape production already recorded for 135
(`135a` the enum, `135b` everything using it):

| File | Applied as | What |
| --- | --- | --- |
| `181a_read_only_enum.sql` | `read_only_enum_181a` | `ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'read_only'`, alone |
| `181b_admin_rbac_hardening.sql` | `admin_rbac_hardening_181b` | `is_support()` learns the new value; the admin-tier ladder on the guard; the RESTRICTIVE `profiles_super_admin_mfa` policy |

An enum member is permanent — PostgreSQL cannot drop one — so the split buys a
safe stopping point: 181a on its own is inert, referenced by no policy and no
function until 181b lands. It also removes the same-transaction hazard entirely
rather than dodging it with `role::text` comparisons.

**PROVEN in a transaction that was then rolled back**, so production kept no
probe rows (`profiles` reads 9 customer + 1 super_admin before and after).
Acting as the real super_admin with an `aal1` claim, which is that account's
actual session shape today:

```
self role change              -> cannot change your own role
grant admin from aal1         -> admin-tier role changes require an
                                 MFA-verified session (aal2)
service-role path (uid NULL)  -> succeeded, and assigned 'read_only',
                                 which also proves 181a's member is usable
```

**THE ONE THING 181 DID NOT KNOW, and the operator should.** Production holds
exactly one super_admin and it has **no verified MFA factor** (zero rows in
`auth.mfa_factors` with `status = 'verified'`). So the file's claim that "a
super_admin's session is aal2 in practice" was not true: it is aal1, because no
factor exists at all. Until that account enrols TOTP it cannot UPDATE its own
`profiles` row through the user client — `updateProfile` in
`src/server/actions/account.ts` (full_name, phone) is the only such path.

That was checked for a deadlock and there is none: enrolment runs entirely
through `supabase.auth.mfa.enroll/challenge/verify` and writes to
`auth.mfa_factors`, never to `profiles`, so the policy cannot block the ceremony
that lifts it. And `enforceSuperAdminMfa` in `src/lib/admin/rbac.ts` already
redirects that account away from every admin page to `/admin-mfa?mode=enrol`,
so this adds no lockout that was not already there.

**No recursion, checked rather than assumed.** The RESTRICTIVE policy on
`profiles` calls `current_user_role()`, which selects FROM `profiles` — the
shape 077 had to undo. It is safe only because the deployed function is
SECURITY DEFINER (`prosecdef = true`, read off production), so its own read
bypasses RLS and never re-enters the policy. If anyone makes it INVOKER, this
policy deadlocks every authenticated `profiles` UPDATE.

**Follow-up, not blocking:** `src/types/database.ts` is now stale on
`user_role` — production has `read_only` and the generated type does not.
`src/lib/admin/roles.ts` carries `AppRole = UserRole | 'read_only'`, which is
still load-bearing and self-healing: regenerate the types and the union
collapses to `UserRole` with no type error.


## 2026-09-09: the numbering was a tangle, and it was measured, not guessed

**`pending/` held two 170s and two 171s.** Two sessions that could not see each
other each picked the next free number, and one of each pair had already been
applied to production five days earlier. "Apply 170" was an ambiguous
instruction, which is the worst thing a migration number can be. Every pending
file was therefore probed against production for the objects it creates, and
the directory was rearranged to match the answer rather than the other way
round.

| File | Probe against production | Verdict |
| --- | --- | --- |
| `169_audit_full_coverage.sql` | `audit_log_trigger_fn`, `idx_audit_log_request_id`, trigger `audit_orders` all present; `audit_full_coverage_169` (`20260904001341`) | applied → moved to `applied/` |
| `170_reporting_tables.sql` | the 4 `report_*` tables + all 6 RPCs present; `reporting_tables_170` (`20260904003703`) | applied → moved to `applied/` |
| `171_search_fts.sql` | `products_search_vector_gin` + `coupon_deals_search_vector_gin`, `search_products`, `fts_prefix_query`, `fts_unaccent`, `fts_join` present; `search_fts_171` (`20260904005239`) | applied → moved to `applied/` |
| `172_rls_zero_policy_tables.sql` | all ten policies present, and zero public tables now carry RLS with no policy; `rls_zero_policy_tables_172` (`20260904010757`) | applied → moved to `applied/` |
| `182_coupon_qr_batches.sql` | `coupon_qr_batches` + `coupon_qr_codes` present; `coupon_qr_batches_182` (`20260907163213`) | applied → moved to `applied/` |
| `186_composite_indexes_top_queries.sql` (was 170) | 0 of its 10 index names existed | **not applied** → renumbered **186**, then applied (below) |
| `187_category_name_shekel_order.sql` (was 171) | `categories.name_he` for `under-99` still read `עד ₪99` (codepoints `1506,1491,32,8362,57,57`) | **not applied** → renumbered **187**, then applied (below) |
| `184_orders_monthly_partitioning.sql` (was 148) | `orders_flat`, `orders_invoice_numbers` absent | not applied → renumbered **184** |
| `185_soft_delete_user_facing_remainder.sql` (was 149) | none of its 4 `deleted_at` indexes exist | not applied → renumbered **185** |
| `173`, `177`, `178`, `179`, `183` | every table, function and trigger they create is absent | not applied, numbers unchanged |
| `181_admin_rbac_hardening` (now `181a`+`181b`) | `profiles_super_admin_mfa` absent, and `enforce_profile_privilege_columns` still carries its **pre-181** comment | not applied at the time, number unchanged; **applied later the same day**, see the top of this file |

**181 is why the probe reads comments and not just names.** Both functions it
touches (`is_support`, `enforce_profile_privilege_columns`) exist in production
already, from the 053/090 lineage. A probe that asked only "does the name
exist" would have called 181 applied and moved a live security hardening out of
the queue. What settles it is the function's own comment, which production
still reports without the admin-tier ladder 181 adds, and the RESTRICTIVE
policy it creates, which is absent.

**Why the unapplied file is always the one that moves.** A number production
has spent cannot be reclaimed by renaming a file — `supabase_migrations.schema_migrations`
already means something by it. So 148, 149, 170 and 171 stayed with their
applied owners and the four squatters became 184, 185, 186 and 187. Their
headers carry the rename and the reason.

**The test that should have caught this now exists.** The only numbering
assertion in `src/__tests__/pending-migrations-inventory.test.ts` compared
`pending/` + `applied/` against `supabase/migrations/` and never compared the
two named directories against each other, so a collision in the exact place the
file is named after went unseen for five days. `lets no unapplied migration
squat on a number production has spent` closes it. Duplicates *inside*
`applied/` stay legal and are documented: production genuinely spent 169 twice
and 172 twice.

## 2026-09-09: 186 and 187 APPLIED

**`186_composite_indexes_top_queries.sql`** applied via MCP as
`composite_indexes_top_queries_186`. `preflight_186.sql` ran first against
production and all four blocks passed: none of the ten index names existed, all
fourteen columns were present with the expected types, `product_status` carried
`active`, and no existing index already covered a pattern. All ten indexes were
read back afterwards and every `indexdef` matches the file. Expand-only —
`CREATE INDEX IF NOT EXISTS` and nothing else, no drops, no data changes.

**`187_category_name_shekel_order.sql`** applied via MCP as
`category_name_shekel_order_187`. One row, one text column, matched on the exact
broken string. Before: `1506,1491,32,8362,57,57` (sign before digits, no
isolate). After: `1506,1491,32,8294,57,57,160,8362,8297` — `עד ` then
U+2066 LRI, `99`, NBSP, `₪`, U+2069 PDI, which is exactly what `isolate()` in
`src/lib/money-format.ts` emits for every other price on the site. No other
`categories` row still matches the broken shape. `repairPriceOrder` rewrites
only `₪<digits>`, so it now leaves this name untouched and the datum and the
render agree. Rollback is at the foot of the file.


## 2026-09-04: 172 added — a test row is on sale for one shekel

`172_hide_master_product_test_row.sql` zeroes the stock on
`מוצר ראשי מאסטר Master Product` (`restaurants-meat-3`), which renders on the
homepage at ₪1 against a ₪400 compare-at price with ten in stock. **Not applied.**

Stock zero rather than a delete: the row may be referenced by an `order_items`
line and deleting it would orphan a historical order. No preflight — one row,
one integer column, and the `where` clause is its own check.

## 2026-09-04: 171 added — the shekel sign in a category name

`187_category_name_shekel_order.sql` rewrites `categories.name_he` for the
`under-99` department from `עד ₪99` to the digits-then-sign form the whole site
now renders, wrapped in an LTR isolate. **Not applied.**

The page does not wait on it: `getAllCategories` repairs the order on read, and
`e2e/price-bidi.spec.ts` measures the rendered geometry at 380/768/1440. The
migration fixes the datum so exports and feeds agree with the page. It has no
preflight because it touches one row of one text column and its own `where`
clause is the check.

## 2026-09-04: two files pending — 162 (blocked on vault) and 169

> The "audit" paragraph below records the file moves; STATE.md's incident
> section (04.09 06:24) records the fuller truth: 166-168 were applied to
> production that morning by a parallel agent without prior approval, and
> Ofir owes a retroactive yes/no. The moves themselves correctly reflect the
> database.

An audit on 2026-09-04 ran every preflight against production and found that
166, 167 and 168 are **already applied and recorded** in
`supabase_migrations.schema_migrations` (versions `20260903232445`,
`20260903232455`, `20260903232504` — 2026-09-03 23:24 UTC), with the live
definitions matching the files byte-for-file (function body, trigger,
constraint expressions, policy set all compared). The three files and their
preflights moved to `migrations/applied/`; their rows joined the APPLIED IN
PRODUCTION table below. Every file in `migrations/applied/` now has a SHA-256
line in `migrations/applied/CHECKSUMS.sha256`
(verify with `cd migrations/applied && shasum -c CHECKSUMS.sha256`).

### `186_composite_indexes_top_queries.sql` — PENDING, not approved

Expand-only composite indexes for the ten hottest query patterns
(ARCHITECTURE-PERFORMANCE §6.3 + measured plans; baselines in
`docs/perf/indexes.md`). `CREATE INDEX IF NOT EXISTS` only, no drops, no
data changes; each pattern matched to the live code path that issues it and
checked non-duplicate against `pg_indexes`. Written by the parallel
autopilot session on 04.09. Preflight: `preflight_186.sql`.

### `169_analytics_server_event_names.sql` — PENDING, not approved

CREATE OR REPLACE of `fn_ingest_analytics_events`, byte-identical to 151's
except the name whitelist, which gains the four `SERVER_EVENT_NAMES` of
`src/lib/analytics/events.ts` (`begin_checkout`, `purchase`,
`voucher_redeemed`, `order_refunded`). 151 shipped with only the eight
client names, and the function skips unknown names by design — so every
server event ever emitted (begin_checkout since the checkout wave, the three
step-14 additions) has been silently dropped. Until this applies they keep
being dropped, harmlessly and documented at the emit sites. Preflight:
`preflight_169.sql` — signature, before-picture of the whitelist,
service_role-only grants.

### `162_cron_schedule.sql` — PENDING, approved (CLOSEOUT §7), blocked on vault

Schedules the twelve jobs of `scripts/cron-jobs.json` through pg_cron + pg_net
(161 installed both). Job commands read `cron_secret` and `app_url` from vault
at run time, so `cron.job.command` stores neither value. BLOCKED: the vault
holds neither secret and seeding them needs the Vercel production env, which
this machine cannot reach (no `vercel` CLI, no link). The exact seeding
commands are under "## חסמים לאופיר" in STATE.md. Preflight:
`preflight_162.sql` — every block must pass through MCP `execute_sql` first.

### `165_revoke_anon_helpers.sql` — CANCELLED 2026-09-04, moved to `migrations/cancelled/`

Would have revoked EXECUTE on `public.is_admin()` and
`public.is_supplier_member(uuid)` from `anon` (CLOSEOUT §8c). Cancelled by
CLOSEOUT §13: the stop-and-think its own preflight flagged came back positive.
Eighteen RLS policies on public/anon-readable tables (product_images,
coupon_deals, suppliers, seo_redirects, cashback_rules, categories, wallet_*,
split_executions, escrow_holds, payments, carts, notification_outbox) call the
helpers inside USING/WITH CHECK; quals run as the caller, so the revoke turns
every anonymous catalogue SELECT into 42501. anon EXECUTE here is **by
design** — the helpers return false for a caller with no uid. Regression net:
`src/db/__tests__/anon-catalog.test.ts`. The file and `preflight_165.sql` live
in `migrations/cancelled/` with the reason at the top.

### `166_voucher_transition_guard.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

BEFORE UPDATE trigger on `public.vouchers.status`, in 137's idiom. Closes the
gap VOUCHER-LIFECYCLE.md §1 records: 137 guards orders/order_items/payments
and never covered `vouchers`, so a service_role statement can un-redeem a
burned voucher and let it be collected twice. Allows exactly the four
`issued -> redeemed | expired | cancelled | refunded` moves; every non-issued
state is terminal by design (value restored later is a wallet credit, not a
state change). No-op updates, INSERTs and NULLs pass untouched. Preflight:
`preflight_166.sql` — enum labels, column type, no existing trigger, row
counts per status.

### `167_order_items_money_constraints.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

Sign constraints (`col IS NULL OR col >= 0`) on the eight agorot columns of
`order_items` that carry none — balance_due, cashback_amount, commission,
escrow_held, escrow_release, face_value, paid_on_site, supplier_immediate —
plus the conservation CHECK `face = paid_on_site + balance_due` (NULL on any
side passes; pre-070 rows keep moving). Both are BUSINESS-RULES §10 entries:
stated rules nothing refuses to break. The JS half shipped first
(`assertOrderItemMoneyInvariants` in `src/lib/commerce/order-money-columns.ts`
throws on every insert path), so the running writer cannot produce a violating
row and the apply is safe for it. Refuses rather than corrupts, like 126: ADD
CONSTRAINT validates all rows and raises on a violator. Preflight:
`preflight_167.sql` — columns exist, names free, zero negative rows, zero
non-conserving rows, table scale.

### `168_wallet_ledger_client_readonly.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

Drops the six authenticated INSERT/UPDATE/DELETE policies on
`wallet_balances` and `wallet_transactions` (marathon step 6). Measured live
on 04.09: the write policies are gated on `is_admin()`, which is the wrong
door — an admin's browser session can write ledger rows directly, a money
movement with no audit_log row. Every code path that touches the tables
(admin user page, apps/mobile wallet screen) is SELECT-only, so nothing
running loses anything; service_role bypasses RLS and the audited server
writers are untouched. The two SELECT policies (admin/support/owner) stay.
Live regression net: `src/db/__tests__/wallet-rls.test.ts` (anon half; the
full per-role matrix is marathon step 10). Preflight: `preflight_168.sql`.

## 2026-09-03: every row below is APPLIED (history)

### `159_pin_search_path_and_revoke_enqueue.sql` — APPLIED 2026-09-03

Applied to production through MCP alongside 158 and verified. Pins
`search_path = pg_catalog, public` on `set_updated_at`, `add_business_days`,
`payout_available_at` and `enforce_payout_availability`, and revokes EXECUTE on
`enqueue_search_index()` from `public`/`anon`/`authenticated`.

The number 159 briefly belonged to the pending orders-indexes file; that one was
renamed the same day (its second rename -- it arrived as `005`), and ended at
`163_orders_indexes.sql`: `160_fk_indexes.sql` and `161_enable_pg_cron_pg_net.sql`
were both applied to production on 2026-09-03, and `162` is reserved for the cron
schedule those two make possible. **New migrations start at 164.**

### `160_fk_indexes.sql` — APPLIED 2026-09-03

Applied to production through MCP and verified. Ten `create index if not
exists` statements covering foreign keys that had no index behind them:
`payment_events.actor_id`, `payout_statements.approved_by`, three on `refunds`
(`decided_by`, `payment_id`, `requested_by`), two on `reviews` (`reviewed_by`,
`user_id`), two on `subscriptions` (`origin_order_id`, `payment_token_id`) and
`wishlists.product_id`.

Every statement is `if not exists`, so re-running it is a no-op. There is no
rollback row because dropping an index that supports a foreign key is not a
restoration of anything: `drop index if exists public.<name>;` per line, if one
is ever actually wanted.

**This is the file that pushed the orders-indexes migration off 160.**

### `161_enable_pg_cron_pg_net.sql` — APPLIED 2026-09-03

Applied to production through MCP and verified. Enables `pg_cron` (schema
`pg_catalog`, version 1.6.4) and `pg_net` (schema `extensions`, version 0.20.0),
then grants `usage on schema cron` to `postgres`.

The schemas are read off production, not chosen: `pg_cron` lives in whatever
schema it was installed into and cannot be moved, so naming a different one
would make the file describe a database that does not exist.

**Why both, and why the grant.** `pg_cron` schedules but cannot make an outbound
request; `pg_net` supplies `net.http_post`, which is what lets a job reach a
Vercel route. The grant is what lets `postgres` call `cron.schedule` at all --
without it, `162` fails on its first statement.

This migration is what closes the standing GO/NO-GO blocker recorded in
`STATE.md`: the cron routes existed and nothing in the world called them.
Verified at the time of writing: `select count(*) from cron.job` returned **0**,
so no job is scheduled yet -- that is `162`, which is pending.

### `163_orders_indexes.sql` — APPLIED 2026-09-03

Written by a parallel agent session (commit `fbdd8e1f5`) alongside Drizzle
schemas at `src/db/schema/orders.ts` and `order-items.ts`. Creates `orders` and
`order_items` guarded by `IF NOT EXISTS`, plus three indexes on
`orders(user_id)`, `orders(created_at)` and `order_items(created_at)`.
**Applied to production through MCP on 2026-09-03 and verified.** Both tables
were already live, so the CREATEs no-opped and the net effect was the three
indexes, exactly as the file header predicted.

**It arrived numbered `005` and was renamed twice.** `supabase/migrations/`
already holds `005_products_schema.sql`, so the original name meant two different
things in the two directories, and `005` sorted ahead of the entire 122-158 applied
series -- every member of which already assumes these two tables exist. The
numbering assertion in `pending-migrations-inventory.test.ts` is what caught it.
The later renames, `160` -> `163`, are the same rule once more: `160_fk_indexes.sql`
and `161_enable_pg_cron_pg_net.sql` went to production on 2026-09-03 and `162` is
reserved for the cron schedule, and a number that names both an applied file and an
unapplied one is the exact confusion this directory keeps paying for.

The file itself is honest about the rest: its header records that both tables
are already live on the hosted DB, so every `CREATE` is guarded and the net
effect on production is the three indexes. `APPLY-ORDER.md` does not list it.

---

## Every row below is APPLIED.

### `158_revoke_anon_public_on_new_functions.sql` — APPLIED 2026-09-03

Applied to production through MCP by the cloud session and verified
(`anon_exec` 3, `migrations` 111). The file now lives in `migrations/applied/`.

Revokes `EXECUTE` from `public`, `anon` and `authenticated` on ten functions
added by 130/131/137/149/152/157 and by `118_search_intelligence`, in an
idempotent `DO` loop. All ten were confirmed to exist before the file was
written. **Not applied.**

**TWO THINGS THAT ARE NOW LIVE IN PRODUCTION.** Both were raised before the
file was applied and neither was changed, so both are in effect now. Neither is
a crash; both are silent. They are recorded here so the next person to see the
symptom does not have to rediscover the cause.

1. **`fn_record_recent_search(text)` has a live `authenticated` caller.**
   `118_search_intelligence.sql` grants it to `authenticated, service_role` on
   purpose, and `src/lib/search/record.ts:52` calls it **with the visitor's own
   client** (`recordRecentSearch(client, term)`), from
   `src/app/(store)/search/page.tsx`. Revoking `authenticated` stops that RPC.
   It fails soft -- the caller logs `search.recent_record_failed` and returns --
   so nothing crashes and nothing tells you: recent-search recording just stops
   for signed-in users. This is the same situation that got `supplier_app_context`
   withdrawn from 143. **To restore it:**
   `GRANT EXECUTE ON FUNCTION public.fn_record_recent_search(text) TO authenticated;`

2. **`add_business_days` and `payout_available_at` rely on the default `PUBLIC`
   grant.** `152_payout_machinery.sql` contains no `GRANT` for either, and both
   are plain `STABLE` functions, not `SECURITY DEFINER`. Revoking from `PUBLIC`
   therefore removes the only grant they have. Anything that calls them and is
   not the owner -- including `service_role`, which the cron and repair paths
   run as -- gets `permission denied`. **To restore it:**
   `GRANT EXECUTE ON FUNCTION public.add_business_days(timestamptz, integer) TO service_role;`
   and the same for `public.payout_available_at(timestamptz)`.

**The automated gate does not cover this file.**
`src/__tests__/revoked-functions-have-no-callers.test.ts` finds revokes with
`/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.(\w+)/`. This migration builds
its statement with `format('... %s ...', f)`, so the literal never appears and
the scanner matches nothing. Both findings above were established by hand.

---

## The rows below are APPLIED

All thirty-four files listed in this README were applied to production through
MCP `apply_migration` on 2026-09-03 and moved to **`migrations/applied/`**. The
rows stay here because this README is still the only written description of what
each migration does, and the number sequence has to stay readable. To find a
file named below, look in `migrations/applied/`.

**Nothing is awaiting approval right now.** A newly written migration goes back
into this directory and is listed as pending again.

`pnpm test` enforces both halves: `pending-migrations-inventory.test.ts` asserts
this directory holds no `.sql`, and that every row below resolves to a file in
`applied/`.

---

Unapplied migrations live here. **Nothing placed in this directory has been run
against any database.** Nothing here may be applied with `db push` — the project
forbids it. The route to production is `apply_migration` through MCP, after Ofir
approves the file.

## This is now the only pending location

`supabase/migrations/` holds applied production migrations only. The three
`PENDING-` files that used to sit there were moved here on 2026-09-01 and
renumbered into the sequence below:

| was | is now |
| --- | --- |
| `supabase/migrations/PENDING-109-recurring-subscriptions.sql` | `135b_recurring_subscriptions.sql` |
| `supabase/migrations/PENDING-110-supplier-coordinates.sql` | `136_supplier_coordinates.sql` |
| `supabase/migrations/PENDING-money-integer-fix.sql` | superseded; the in-place path was deleted 2026-09-01, see DECISIONS |

Every reference to the old paths across `src/`, `apps/`, `docs/`, `scripts/`
and the root `*.md` files was rewritten in the same commit. There is no second
location left to read.

## Numbering

`120` and `121` were each used twice, in two directories, with two different
meanings. That is fixed: every file here was renumbered from **122 upward**,
skipping `128` and `129`, which are taken by
`supabase/migrations/128_wp_publish.sql` and `129_catalogue_cleanup.sql`.
Highest number applied in production is `129`. No number now repeats across the
two directories.

## RESOLVED 2026-09-01: the additive path (138-141) won. 142 is deleted.

Both convert money to integer agorot and they collide.

- **138-141 (recommended)** are *additive*: they add a `<col>_agorot bigint`
  beside each numeric column, `GENERATED ALWAYS AS (round(<col> * 100)::bigint)
  STORED`, so it can never drift from the column it mirrors. Applying them is a
  no-op for the running application, and they are reversible with a
  `DROP COLUMN`.
- **142** converts *in place*, renaming `total_ils` → `total_agorot` and
  changing its type. The moment it lands, every reader that still says
  `total_ils` breaks, and every reader that does not gets a number 100× larger.

They produce **9 identical column names** on the same tables, so applying 142
after 138-141 fails outright with "column already exists":

```
coupon_deals.original_price_agorot     products.compare_at_price_agorot
coupon_deals.platform_price_agorot     products.full_price_agorot
coupons.original_price_agorot          products.kenyon_price_agorot
product_variants.price_agorot          profiles.wallet_balance_agorot
product_variants.price_modifier_agorot
```

and a further 23 columns where the names differ only by an `_ils` infix
(`orders.total_ils_agorot` from 138 vs `orders.total_agorot` from 142), which
would leave the table carrying two agorot columns for one amount.

**Decision, taken 2026-09-01 and logged in `docs/DECISIONS.md`:** the additive
path is the production-safest option, so 138-141 are in the apply order and
**142 is parked**. It is kept, not deleted, because it is the only written
description of the eventual in-place end state, and because the decision to
abandon it belongs to Ofir.

### 142 was verified against production, and it is not a no-op

An earlier version of this file claimed production already stored money as
integer agorot, and that 142 therefore did nothing. **That claim was false.**
Measured against `ixvwfbuvfxxsjiywhbbb` on 2026-09-01, all **41** columns 142
targets are still `numeric` on real tables (`relkind = 'r'`); none is already
an integer, so none was removed from the file:

```
orders.total_ils        orders.subtotal_ils      orders.discount_ils
payments.amount_ils     payments.wallet_applied_ils
order_items.unit_price_ils  order_items.total_price_ils
products.price_ils      wallet_accounts.balance_ils    ... 41 total
```

The columns that *are* already integer agorot — `order_items.face_value_agorot`,
`vouchers.coupon_price_agorot`, `settlement_events.commission_agorot` and the
rest — are **different columns**, added alongside the numeric ones. That dual
representation is what made the earlier claim look true from a distance.

## The manifest

Blast radius is what breaks if the file is applied while the current code is
running. Order is the position in the apply sequence.

| # | File | What it changes | Blast radius | Order | Prerequisite | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 122 | `122_deny_all_on_server_only_tables.sql` | Restrictive `using (false)` policy on the 5 server-only tables | **None.** RLS-on-no-policy is already deny; changes no effective permission | 1 | none | `drop policy if exists deny_all_client_roles on public.<each of the 5>;` |
| 123 | `123_products_whatsapp_enabled.sql` | `products.whatsapp_enabled boolean not null default false` + partial index | **None.** Defaults false, so no product changes behaviour | 2 | none | `drop index if exists public.products_whatsapp_enabled_idx; alter table public.products drop column if exists whatsapp_enabled;` |
| 124 | `124_categories_sort_order.sql` | One `UPDATE`: `electronics` `sort_order` 10 → 12 | **Cosmetic.** Fixes a tie that made category order planner-dependent | 3 | none | `update public.categories set sort_order = 10 where slug = 'electronics';` |
| 125 | `125_expire_vouchers_drop_escrow.sql` | Replaces `expire_vouchers()`, dropping its last escrow branch | **Low.** Escrow model already abolished in 085; this finishes it | 4 | migration 085 (applied) | Restore the prior body from `supabase/migrations/085_voucher_scan_audit_and_no_escrow.sql` |
| 126 | `126_percent_range_checks.sql` | `CHECK (0..100)` on 12 unconstrained percent columns | **Low.** Fails at apply time only if a row is already out of range | 5 | none | `alter table public.<t> drop constraint if exists <t>_<col>_range;` (12 statements, listed in the file) |
| 127 | `127_homepage_cms.sql` | `banners`, `homepage_sections`, RLS policies, scheduling windows | **None.** Readers treat absence as normal and fall back to `src/lib/hero-singlefile-data.ts` | 6 | none | `drop table if exists public.banners, public.homepage_sections cascade;` |
| 130 | `130_payment_events.sql` | `payment_events` append-only table, `payment_event_type` enum, no-mutation trigger | **None.** New table, no existing reader | 7 | none | `drop trigger if exists payment_events_no_mutation on public.payment_events; drop function if exists public.payment_events_append_only(); drop table if exists public.payment_events; drop type if exists public.payment_event_type;` |
| 131 | `131_refunds.sql` | `refunds` table, `refund_state` + `refund_ground` enums | **None.** Holds no money truth; `payments` stays authoritative | 8 | 130 (shares the payment vocabulary) | `drop table if exists public.refunds; drop type if exists public.refund_state; drop type if exists public.refund_ground;` |
| 132 | `132_search_index_outbox.sql` | `search_index_outbox`, enqueue trigger on `products`, `claim_search_index_jobs()` | **Low.** Adds a trigger to `products`; every product write now also writes an outbox row | 9 | none | `drop trigger if exists products_enqueue_search_index on public.products; drop function if exists public.enqueue_search_index(); drop function if exists public.claim_search_index_jobs(integer); drop table if exists public.search_index_outbox;` |
| 133 | `133_supplier_branches.sql` | `supplier_branches` table | **None.** Changes no money and no authorisation; a voucher still redeems against `suppliers.id` | 10 | none | `drop table if exists public.supplier_branches;` |
| 134 | `134_order_items_delivered_at.sql` | `order_items.delivered_at`, physical-only constraint, `order_item_cancellation_deadline()` | **Low.** Nullable column; the deadline function is new | 11 | none | `drop function if exists public.order_item_cancellation_deadline(uuid); drop index if exists public.order_items_delivered_at_idx; alter table public.order_items drop constraint if exists order_items_delivery_is_physical_only, drop column if exists delivered_at;` |
| 135 | `135b_recurring_subscriptions.sql` | `recurring` enum member, `subscriptions`, `subscription_charges`, 3 billing columns on `products` | **Medium.** `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block and cannot be rolled back | 12 | none | Tables and columns drop cleanly; **the `recurring` enum member is permanent** — Postgres cannot remove an enum value |
| 136 | `136_supplier_coordinates.sql` | `suppliers.latitude`/`.longitude`, GiST index, pair CHECK | **None.** `supplierLocation()`'s exact branch is dead code until the columns exist | 13 | `cube` + `earthdistance` extensions | `drop index if exists public.suppliers_earth_idx; alter table public.suppliers drop constraint if exists suppliers_latlng_pair, drop column if exists latitude, drop column if exists longitude;` |
| 137 | `137_order_transition_guard.sql` | Status-transition guard triggers on `orders`/`vouchers`/`payments`, immutable `audit_log` | **Medium.** Constrains the service role, which every cron, webhook and repair script runs as. An illegal transition that used to succeed now raises | 14 | 130, 131, 134 (guards reference their statuses) | `drop trigger if exists audit_log_no_delete on public.audit_log; drop trigger if exists audit_log_no_update on public.audit_log; drop trigger if exists vouchers_status_guard on public.vouchers; drop trigger if exists payments_status_guard on public.payments; drop trigger if exists orders_status_guard on public.orders;` (+ the 6 guard functions) |
| 138 | `138_money_agorot_money_path.sql` | Adds a **generated** `_agorot` beside numeric on `orders`, `order_items`, `payments` | **None at apply.** Additive and unwritable. The `>= 0` checks become live on the numeric column's sign | 15 | none | `alter table public.orders drop column if exists subtotal_ils_agorot, drop column if exists total_ils_agorot, drop column if exists discount_ils_agorot;` (+ `order_items`, `payments`) |
| 139 | `139_money_agorot_wallet.sql` | Adds a **generated** `_agorot` on `wallet_accounts`, `wallet_balances`, `wallet_entries`, `wallet_transactions` | **None.** Additive. No `>= 0` check on balances: `wallet_accounts.balance_ils` has a live minimum of −1.80 | 16 | 138 | `alter table public.wallet_accounts drop column if exists balance_ils_agorot;` (+ the other 3 tables) |
| 140 | `140_money_agorot_catalog.sql` | Adds a **generated** `_agorot` on `products`, `product_variants`, `coupon_codes`, `coupon_deals`, `coupons` | **None at apply.** Additive. `price_modifier` stays signed — a variant may be cheaper than its base | 17 | 138 | `alter table public.products drop column if exists price_ils_agorot, drop column if exists coupon_price_ils_agorot, drop column if exists cost_ils_agorot, drop column if exists full_price_agorot;` (+ the other 4 tables) |
| 141 | `141_money_agorot_growth.sql` | Adds a **generated** `_agorot` on `affiliates`, `referrals` | **None at apply.** Additive. Both are cumulative earnings, so both take the non-negative check | 18 | 138 | `alter table public.affiliates drop column if exists total_earnings_ils_agorot; alter table public.referrals drop column if exists bonus_paid_amount_ils_agorot;` |
| 143 | `131_refunds.sql` | `20260901013505` | `131_refunds` | `refunds` table + trigger `refunds_due_by_is_derived` |
| `132_search_index_outbox.sql` | `20260901013525` | `132_search_index_outbox` | `search_index_outbox` + trigger `products_enqueue_search_index` |
| `133_supplier_branches.sql` | `20260901013612` | `133_supplier_branches` | `supplier_branches` + 3 policies |
| `143_revoke_unused_definer_execute.sql` | Revokes `EXECUTE` on 5 SECURITY DEFINER functions from `anon`/`authenticated` | **Medium.** Closes a live RLS bypass in `voucher_success_payload`. `supplier_app_context` was withdrawn from this file — the Expo till calls it | 19 | `src/__tests__/revoked-functions-have-no-callers.test.ts` green | `GRANT EXECUTE ON FUNCTION public.<fn> TO anon, authenticated;` (5 statements, listed in the file) |
| 144 | `144_revoke_authenticated_dml.sql` | Revokes INSERT/UPDATE/DELETE from `authenticated` on the 8 RLS-on-zero-policy tables | **Low.** Defence in depth; RLS already blocks these, but RLS does not cover `TRUNCATE` | 20 | 122 (same 5 tables, policies first) | `GRANT INSERT, UPDATE, DELETE ON public.<t> TO authenticated;` (8 statements, listed in the file) |
| 145 | `145_revoke_check_rate_limit_execute.sql` | Revokes `EXECUTE` on `check_rate_limit` from `anon`/`authenticated` | **HIGH IF MISORDERED.** See below | **21 — LAST** | ⛔ **CODE-FIRST: commit `d5c2739d4`** | `GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;` |
| 184 | `184_orders_monthly_partitioning.sql` | Converts `orders` to monthly range partitions on `created_at`; PK becomes `(id, created_at)`, 16 referencing tables gain a trigger-filled twin column and composite FKs | **HIGH.** Structural conversion of the busiest financial table; apply only in a maintenance window, details in the file header | after 137 | pg_cron (installed) | in file header |
| 185 | `185_soft_delete_user_facing_remainder.sql` | `deleted_at` + partial index + RLS select filters on `categories`, `product_images`, `reviews`, `wishlists`; splits `wishlists_owner_all` into four per-command policies | **Low.** Additive column; policies only narrow client reads. Service-role call sites are gated by `src/lib/soft-delete.ts`, whose pending list is flipped to live after apply | any | none | in file header |
| 169 | `169_audit_full_coverage.sql` | `audit_log` before/after/request_id columns, `entity_id` uuid→text, generic trigger v2 on every financial and user table | **✅ APPLIED 2026-09-04** via MCP as `audit_full_coverage_169`, on the explicit instruction of the /goal that requested it. Validated first against production inside a rolled-back DO block (snapshots, header capture, ip parsing all probed), then applied; 34 audit triggers verified after. The file stays here as the record, like 122-147 | any | none | in file header |
| 170 | `170_reporting_tables.sql` | 4 denormalized reporting tables (`report_revenue_daily`, `report_orders_daily`, `report_top_products`, `report_cohort_retention`), nightly `pg_cron` rebuild at 01:30 UTC, 5 admin-only definer RPCs gated on `is_admin()` | **✅ APPLIED 2026-09-04** via MCP as `reporting_tables_170`, on the explicit instruction of the /goal that requested it. Validated first end-to-end inside a rolled-back transaction (full refresh over real orders), then applied; row counts, the cron job and the 42501 deny path for a non-admin were verified after. New tables only, no existing reader | any | none | in file header |
| 171 | `171_search_fts.sql` | Hebrew FTS: `unaccent` extension, generated `search_vector` tsvector (config `simple`) + GIN index on `products` and `coupon_deals`, INVOKER `search_products` RPC (prefix tsquery, ts_rank, anon-callable) | **✅ APPLIED 2026-09-04** via MCP as `search_fts_171`, on the explicit instruction of the /goal that requested it. Validated first inside a rolled-back DO block (Hebrew word match, reversed-order prefix query, punctuation-only input, anon RLS path, GIN plan), then applied; 80 product + 8 deal vectors and both indexes verified after. Additive columns and new functions only | any | none | in file header |
| 172 | `172_rls_zero_policy_tables.sql` | Explicit policies for the ten RLS-on-zero-policy tables: restrictive `deny_all_client_roles` on `rate_limits`/`user_rate_limits`/`search_index_outbox`, `<t>_admin_read` (`is_admin()`) on `payment_webhook_events`, `ai_usage`, `analytics_events` and the 4 report tables, + `SELECT` grant to `authenticated` on the report tables. Fixes the admin webhooks tab, which read `payment_webhook_events` through the request client and silently got zero rows | **✅ APPLIED 2026-09-04** via MCP as `rls_zero_policy_tables_172` (+ `_report_grants`), on the explicit instruction of the /goal that requested it. Verified after apply with the self-seeding three-persona harness `tests/sql/rls_three_personas.sql` run through MCP in a rolled-back transaction: anon/user/admin assertions all held, incl. cross-tenant denial between two users. Only delta: admins gain SELECT on 7 observational tables; the denies were already the default | any | none | in file header |
| 178 | `178_webauthn_credentials.sql` | Passkey (WebAuthn) credentials: `webauthn_credentials` (one row per registered authenticator: base64url credential id as PK, COSE public key, signature counter, transports, device type, backup flag, friendly name; FK to `auth.users` because phone-only accounts have no lazy `profiles` row yet). RLS: select-own + delete-own for `authenticated`, no INSERT/UPDATE policy so writes happen only through the service role after `verifyRegistrationResponse`/`verifyAuthenticationResponse` prove the ceremony. Challenges are not stored: they travel in an HMAC-sealed httpOnly cookie (`src/lib/auth/passkeys/challenge.ts`) | **✅ APPLIED 2026-09-08** via MCP as `webauthn_credentials_178` (version `20260908210126`). Verified against production 2026-09-09: table present, RLS enabled, exactly the two policies (select-own, delete-own), no INSERT/UPDATE policy, 0 rows. Was low-risk by design: one new table, and callers tolerated absence via 42P01/PGRST205 (`isMissingPasskeyRelation`) until apply. The file stays here as the record, like 169-183 | any | none | in file header |
| 180 | `180_analytics_server_event_names.sql` | `CREATE OR REPLACE` of `fn_ingest_analytics_events`, byte-identical to the deployed body except the name whitelist, which gains the four server names of `SERVER_EVENT_NAMES` (`begin_checkout`, `purchase`, `voucher_redeemed`, `order_refunded`). Until it applies, every server-side money event is silently discarded by the deployed eight-name list (verified against production 2026-09-07); PostHog receives them regardless through the fan-out in `src/server/analytics/track.ts` | **None.** Function replacement only; no table, grant, or policy changes. Unknown names are still skipped, so a rollback loses nothing already stored | any | none | in file header (re-run with the eight-name list) |
| 179 | `179_push_subscriptions.sql` | Web push subscriptions: `push_subscriptions` (one row per browser that granted notification permission: unique https `endpoint`, browser-minted `p256dh`/`auth` keys as base64url text, optional user agent; FK to `auth.users`, same lazy-profiles reasoning as 178). RLS: select-own + delete-own for `authenticated`, no INSERT/UPDATE policy so rows are written only by the service role in `src/server/actions/push.ts` after the caller is authenticated and the subscription shape validated | **Low.** One new table; touches nothing existing. Callers tolerate absence: the subscribe/remove actions and `/account/notifications` answer "not available yet" on 42P01/PGRST205 (`isMissingPushRelation`) | any | none | in file header |
| 181 | `181a_read_only_enum.sql` + `181b_admin_rbac_hardening.sql` | Admin RBAC hardening: `read_only` enum value on `user_role` (observer tier: sees every panel section through the service-role reads in `permissions.ts`, writes nothing); `is_support()` gains the name so read_only inherits support's whole SELECT surface DB-side; `enforce_profile_privilege_columns()` (the deployed 090 guard; 035's function was measured absent from production 2026-09-07) gains the admin-tier ladder: no self role change, admin-tier grants/revocations only by super_admin, and only with an aal2 (MFA-verified) JWT; RESTRICTIVE `profiles_super_admin_mfa` policy so an aal1 super_admin session updates no profiles row through the user client | **Low.** One permanent enum member, two function replacements on their deployed bodies, one restrictive policy. Behavioral edge: a super_admin editing their own profile through the user client needs an aal2 session once this applies; the rbac.ts gate forces enrol+verify at panel entry, so a super_admin's session is aal2 in practice. Until it applies, assigning `read_only` fails loudly at the enum (`invalid input value`), and MFA is enforced app-side only | any | none | in file header |
| 177 | `177_cashback_ledger.sql` | Cashback ledger: `cashback_ledger` (append-only decision record: entry per item-cashback credit, order-count bonus, admin adjustment; integer agorot, signed; RLS own-read + admin-read, no client writes; UPDATE/DELETE blocked by trigger), `fn_cashback_order_bonus` (first purchase 10%, every fifth purchase 5% of the order total, per-user advisory lock, idempotent on `order:<id>:count_bonus`, pays through `fn_wallet_transfer` from `platform:cashback_reserve`), `fn_cashback_admin_adjust` (signed adjustment, re-checks `is_admin()`, idempotent, records `auth.uid()`). Numbered 177 because 174-176 are taken by files on `closeout/v1-final` | **Low.** All new objects; touches no existing table. Callers tolerate absence: finalize logs-and-continues on 42883, `/admin/cashback` shows a not-installed notice | after 046 (applied); attaches the 169 audit trigger only if present | none | in file header |
| 182 | `182_coupon_qr_batches.sql` | Printed QR coupon batches: `coupon_qr_batches` (one print run per discount campaign) and `coupon_qr_codes` (one 8-digit Luhn-checked unit code each, unique, `redeemed_at` as the per-unit single-use gate). RLS: admin-read only on both, no client writes, no shopper read — a code is validated server-side by the cart, never listed. `redeemed_order_id` is a bare uuid, not an FK, because `orders` is headed for partitioning (184, renumbered from 148) | **✅ APPLIED 2026-09-07** via MCP as `coupon_qr_batches_182` (version `20260907163213`), on the explicit instruction of the /goal that requested it. Additive only: two new tables, no existing object touched. The file stays here as the record, like 169-172 | any | 096 (applied; FK to `discount_campaigns`) | `drop table if exists public.coupon_qr_codes; drop table if exists public.coupon_qr_batches;` |
| 183 | `183_order_shipped_notification.sql` | Shipping notification: widens `notification_outbox_kind_check` with `order_shipped` and adds `tg_orders_notify_shipped`, an AFTER UPDATE OF status trigger that enqueues one customer mail on the transition into `fulfilled` (dedupe `order-shipped:<order_id>`). The renderer (`buildOrderShippedEmail`) is already in `src/lib/email/notifications.ts`, so the drain can render rows the moment this applies. After applying, re-measure the constraint and move `order_shipped` into `CHECK_ACCEPTS` in `src/lib/email/outbox-kinds.test.ts` | **Low.** One constraint widened (additive), one new trigger; the trigger body is EXCEPTION-guarded like its 102 sibling, so a failed enqueue warns and never fails the status UPDATE | any | 095, 102, 114 (all applied) | in file header |
| 192 | `192_seed_seo_redirects.sql` | Seeds `seo_redirects` with the legacy WordPress map: 33 active rows (19 x 301, 14 x 410), generated by `scripts/build-legacy-redirects.mjs`. Data only, no DDL; absent rows are deactivated, never deleted, so the hit counter survives | **✅ APPLIED 2026-09-09** via MCP as `seed_seo_redirects_192`, on the explicit instruction of the /goal that named 192-201. Dry-run first in a rolled-back transaction (33 active after seed); table held 0 rows before. The file stays here as the record, like 169-183 | any | 095 (applied; the table) | re-run generator, or `update public.seo_redirects set is_active = false;` |
| 193 | `193_price_history.sql` | `price_history`: append-only daily record of what each product cost (integer agorot), UPDATE/DELETE refused by trigger for every role, public SELECT, one-day backfill from the live catalogue | **✅ APPLIED 2026-09-09** via MCP as `price_history_193`, same /goal. Dry-run rolled back first: 80 backfill observations, append-only triggers and grants verified | any | none | in file header |
| 194 | `194_discount_claim_caps.sql` | Makes `max_uses`/`max_uses_per_user` real: `coupons.max_uses_per_user` (default 1), `coupon_redemptions`, `discount_redemptions.released_at`, and `claim_order_discount`/`release_order_discount` — check and claim under FOR UPDATE, idempotent per (code, order), service-role only | **✅ APPLIED 2026-09-09** via MCP as `discount_claim_caps_194`, same /goal. Dry-run rolled back first, both functions probed against a real order id (empty code NULL, unknown code NULL, release 0). All three counter tables held 0 rows | any | 096 (applied) | in file header |
| 195 | `195_stock_waitlist.sql` | `stock_waitlist`: who asked to be told when a sold-out product returns. One live row per email per product, deny-all RLS, definer `join_stock_waitlist` (service-role only) that never reveals whether the row existed | **✅ APPLIED 2026-09-09** via MCP as `stock_waitlist_195`, same /goal. Dry-run rolled back first: two joins with case/whitespace variants of one email produced exactly one lowercased row | any | none | `drop function if exists public.join_stock_waitlist(uuid, text, uuid, uuid); drop table if exists public.stock_waitlist;` |
| 196 | `196_shipped_notification_carries_tracking.sql` | Replaces `tg_orders_notify_shipped` so the shipped mail's payload carries a `shipments` jsonb array (carrier + tracking per line that has a number; NULL when none). Guard, dedupe key and firing condition byte-identical to production | **✅ APPLIED 2026-09-09** via MCP as `shipped_notification_carries_tracking_196`, same /goal. Live body read with `pg_get_functiondef` and diffed first; the replaced trigger was fired on a real paid order in a rolled-back probe and the payload carried the tracking number. Zero outbox residue | any | 183 (applied; the trigger) | restore the 183 body from `pg_get_functiondef` |
| 197 | `197_shipping_zones_and_pickup.sql` | `shipping_zones` seeded free-everywhere (5 zones, all 0 agorot, matching the sitewide free-delivery banner) + `pickup_points`, deliberately empty. Public SELECT, no client writes. NOT wired into checkout | **✅ APPLIED 2026-09-09** via MCP as `shipping_zones_and_pickup_197`, same /goal. Dry-run rolled back first; the file refuses to apply if any zone carries a charge | any | none | `drop table if exists public.pickup_points; drop table if exists public.shipping_zones;` |
| 198 | `198_in_app_notifications.sql` | The bell: `notifications` (own-read, mark-read via a `read_at`-only column grant) + `notification_preferences` (own-read/write per kind x channel). REPLICA IDENTITY FULL + membership in `supabase_realtime`, without which the subscription reports SUBSCRIBED and receives nothing | **✅ APPLIED 2026-09-09** via MCP as `in_app_notifications_198`, same /goal. Dry-run rolled back first: `read_at` proven the only updatable column for `authenticated`, publication membership asserted | any | none | in file header |
| 199 | `199_review_replies_and_reports.sql` | Supplier replies (3 columns on `reviews`, membership proved via `products.supplier_id` -> `supplier_members`) + `review_reports` (insert-own, no client read). The load-bearing line is the REVOKE of the dormant table-wide UPDATE grant the new policy would otherwise wake | **✅ APPLIED 2026-09-09** via MCP as `review_replies_and_reports_199`, same /goal. Dry-run rolled back first: after revoke+grant, `authenticated` can update exactly the 3 reply columns and the table-wide grant is gone. `reviews` held 0 rows | any | 154 (applied) | in file header |
| 200 | `200_wishlist_alert_kinds.sql` | Widens `notification_outbox_kind_check` with `price_drop` and `back_in_stock` (14 -> 16 kinds). Restates the constraint in full behind a guard that refuses if the live constraint carries a name the file does not restate — the failure 183 nearly had | **✅ APPLIED 2026-09-09** via MCP as `wishlist_alert_kinds_200`, same /goal. Dry-run rolled back first; the guard found the live constraint carrying exactly the 14 known names | after any other file restating this constraint (none) | 193, 195 (applied; the data behind the alerts) | re-add the constraint with the 14-name list |
| 201 | `201_scheduled_price_changes.sql` | `scheduled_price_changes`: flash deals as rows (integer agorot, not percentages), one PENDING change per product per moment by partial unique index, cancelled rather than deleted, deny-all RLS. Applied by `/api/cron/price-schedule`, which also writes the `price_history` row (`source='change'`) | **✅ APPLIED 2026-09-09** via MCP as `scheduled_price_changes_201`, same /goal. Dry-run rolled back first: duplicate pending change refused, cancelled row frees the slot | any | 193 (applied) | `drop table if exists public.scheduled_price_changes;` |
| 210 | `210_media_ingest_queue.sql` | Media ingest ledger (ARCHITECTURE-MEDIA-R2): `media_ingest_queue`, one row per source image the platform should host itself (WXR attachments whose WordPress origin is gone, plus the 49 third-party demo URLs in `products.images`). Content-addressed `storage_path` embeds the sha256 of the original bytes (the 06-media-sync scheme); `source_url` unique as the identity of the waiting item. Ingested rows also get a `media_assets` row so existing URL-join readers see them. RLS on with zero policies and privileges revoked outright (the 122/172 pattern) — the advisor INFO on this is the design, not an omission | **✅ APPLIED 2026-09-09** via MCP as `media_ingest_queue_210` (version `20260909093018`). One new table, no existing object touched; written only by the ingest script through the service role. The file stays here as the record, like 169-183 | any | 049 (applied; `media_assets`) | in file header |
| 211 | `211_whatsapp_selfservice.sql` | WhatsApp self-service on top of 173: widens the `whatsapp_inbound_messages` intent CHECK with `order_status`/`refund_request` (constraint name verified against production), adds `support_tickets.category` (default `general`, backfills `refund_request` from the `בקשת זיכוי` subject prefix the webhook writes meanwhile), and `fn_wa_orders_for_phone` — definer, service-role-only, returns ref/status/total/date of the phone's 3 latest orders for the webhook's status reply | **Low.** The CHECK widens (no existing row can fail it), the column is additive with a default, and the function is new with EXECUTE revoked from PUBLIC/anon/authenticated. Until applied, the webhook already degrades: audit rows fall back to intent `message`, status questions file a ticket | after 173 (applied: its five tables and both functions verified live in production 2026-09-09) | 173 | in file header |
| 173 | `173_whatsapp_flow.sql` | WhatsApp Business flow: `whatsapp_contacts` (consent record, opt-in/opt-out), `whatsapp_outbox` (order-status queue drained by `/api/cron/whatsapp`), `whatsapp_inbound_messages` (Twilio replay protection + audit), `support_tickets` + `support_ticket_messages` (first ticket store; RLS: own-read + staff read/update), `fn_il_phone_digits`, consent-gated `fn_enqueue_whatsapp`, trigger `tg_orders_whatsapp_status` on `orders` (paid/fulfilled/cancelled/refunded) | **Low.** All new tables and functions; the only touch on an existing table is the AFTER UPDATE trigger on `orders`, which enqueues at most one row per (order, kind) and only for phones that opted in, so with zero opted-in contacts it is a no-op. Code paths tolerate the tables not existing (webhook 500s to Twilio's retry, cron reports the read error) | any | none | in file header |

## 138-141 add GENERATED columns, and that is what makes step 2 possible

The first draft added a plain `bigint` and filled it once:

```sql
alter table public.orders add column if not exists total_ils_agorot bigint;
update public.orders set total_ils_agorot = round(total_ils * 100) where ...;
```

Nothing kept it in step after that. No trigger, no default, no NOT NULL. The
running application writes `total_ils` and does not know the new column exists,
so **every order placed after the apply would have carried `total_ils_agorot`
NULL** — and step 2 of the cutover, rewriting the readers onto those columns,
is the entire reason the files exist. A customer who had just paid would have
been shown a total of 0.00, and the split would have settled a commission of
zero against it. The one-shot backfill made the migration look finished while
guaranteeing the step that follows it would be wrong.

All 32 columns are now:

```sql
alter table public.orders
  add column total_ils_agorot bigint
    generated always as (round(total_ils * 100)::bigint) stored;
```

which cannot drift: Postgres recomputes it on every insert and update of the
base column, and refuses any write that names it.

**Measured against `ixvwfbuvfxxsjiywhbbb`, PostgreSQL 17.6, not assumed.** The
generated form tracks insert, update and NULL, `-1.80` yields `-180`, and a
write to the generated column is refused with SQLSTATE `428C9`. The real DDL
for `orders.total_ils` and `product_variants.price_modifier` was then run
against the live tables inside a `DO` block that raises at the end, so it rolled
itself back:

```
DRYRUN_OK cols=1 backfill=[18.00->1800, 18.00->1800, 18.00->1800, 817.00->81700]
leftover_columns = 0
```

**Two consequences worth stating rather than discovering later.**

1. The non-negative CHECKs are no longer decorative. On a backfilled column
   nothing re-evaluated them; on a generated column they are validated on every
   write, so they now constrain the numeric column's sign at runtime. Every
   checked column was measured first and none is negative today, so the apply
   validates. The signed wallet columns still get no check.
2. **Step 3 is no longer a plain `DROP COLUMN`.** A generated column depends on
   its base column, so dropping the numeric one requires
   `ALTER TABLE ... ALTER COLUMN <col>_agorot DROP EXPRESSION` first, which
   turns it into an ordinary written column and keeps the stored values. This
   also hardens the exclusion with 142: 142's `ALTER TYPE` on a base column is
   refused outright while a generated column depends on it.

## ⛔ 145 is CODE-FIRST and it is one-way

**Required commit: `d5c2739d4`** — *"docs: מדריך הזנת דיל חדש (CONTENT-OPERATIONS-GUIDE) (#6)"*.
The title says docs; the commit also carries the change that matters here, in
`src/lib/utils/rate-limit.ts`:

```diff
-import { createClient } from '@/lib/supabase/server'
+import { createAdminClient } from '@/lib/supabase/admin'
-  const supabase = await createClient()
+  const supabase = adminClientOrNull()
```

Also required: **`8e26c3754`** (*"feat(rate-limit): a sliding window on Upstash
behind all thirty callsites, with Postgres as the fallback"*), which relocated
the Postgres fallback call into `src/lib/rate-limit/limiter.ts`. It is still the
same `createAdminClient()` call, so `service_role` still reaches the RPC — but
the callsite moved, and a check of the old path alone would now measure nothing.

Both are ancestors of `origin/main` as of 2026-09-01, so the prerequisite is
**merged**. What remains is that main is *deployed*: verify the running
production build contains `d5c2739d4` before applying 145.

**Why the order is one-way.** Apply 145 while a build older than `d5c2739d4` is
live and the RPC starts returning `42501` to a caller that is still `anon`. The
limiter's fail-open branch catches it, logs, and returns "allowed". Every rate
limit in the application — OTP, cart writes, checkout, search — turns off, and
the only symptom is a log line nobody is watching. That is strictly worse than
the hole 145 closes.

## Reference only — not in the apply order

### `the in-place money migration (deleted 2026-09-01)`

**NOT FOR EXECUTION. Superseded by the additive approach in 138-141. Retained as
the written specification of the eventual in-place end state. Do not apply.**

The same note now stands in the file's own header, so a reader who opens the SQL
without this README sees it too.

| # | File | What it changes | Blast radius | Order | Prerequisite | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 142 | `the in-place money migration (deleted 2026-09-01)` | Converts 41 money columns in place, numeric ILS → bigint agorot; rebuilds `fn_wallet_transfer`, `fn_pay_referral`, 2 wallet views | **CATASTROPHIC. PARKED — DO NOT APPLY.** Mutually exclusive with 138-141; ~55 code files still read the old ILS names | — | Abandoning 138-141 **and** rewriting every reader first | Inverse rename + `ALTER TYPE ... USING <col> / 100.0`, plus restoring both functions and both views. **Treat as one-way in practice.** |

It is kept, not deleted, for the reason recorded in `docs/DECISIONS.md`: it is
the only written description of the eventual in-place end state, and the
decision to abandon it belongs to Ofir. `src/__tests__/pending-migrations-inventory.test.ts`
counts it among the files on disk, so deleting it fails that test.


## Apply order

```
122 → 123 → 124 → 125 → 126 → 127 → 130 → 131 → 132 → 133 → 134
    → 135 → 136 → 137 → 138 → 139 → 140 → 141 → 143 → 144 → 145
```

`142` is not in the sequence. It is parked and mutually exclusive with 138-141.

## Inventory is enforced by a test

`src/__tests__/pending-migrations-inventory.test.ts` checks both directions:
every `.sql` on disk appears in this manifest, and every `.sql` this manifest
names exists on disk. It also asserts `supabase/migrations/` contains no
`PENDING-` file, so the split location cannot come back.

`src/__tests__/revoked-functions-have-no-callers.test.ts` re-derives the revoke
list from this directory and checks it against every `.ts`/`.tsx` in **both**
`src/` and `apps/`, so revoking a function the Expo till uses fails a test
rather than a till.

## `185_soft_delete_user_facing_remainder.sql` (was 149), added 2026-09-04

Soft delete for the four user-facing tables that still lack it. Measured
against production 2026-09-04 over MCP: `products`, `product_variants`,
`suppliers`, `user_addresses`, `vendors` and `coupon_deals` already carry
`deleted_at` with RLS filters; `categories`, `product_images`, `reviews` and
`wishlists` have no such column at all. This file adds `deleted_at
timestamptz`, the house partial index, and rewrites the client-facing SELECT
policies so a deleted row disappears for shoppers while admin keeps it for
restore. It also closes a live gap: `product_images` were readable for a
soft-deleted product, because the old policy only checked
`products.status = 'active'`.

**The code side ships first and is safe either way.** Service-role readers
bypass RLS, so their filter lives in `src/lib/soft-delete.ts`, which keeps a
live list (filters now) and a pending list (no-op until this file is
applied — filtering on a missing column is a 42703 that kills the whole
query). After apply: regenerate types, and `src/lib/soft-delete.test.ts`
fails on purpose until the four names move to the live list.

## `184_orders_monthly_partitioning.sql` (was 148), added 2026-09-03

Found on disk unlisted on 2026-09-04 and inventoried then; written by a
parallel session. Converts `orders` to a table partitioned by range on
`created_at`, one partition per UTC month, provisioned twelve months ahead by
pg_cron. The primary key becomes `(id, created_at)`; each of the sixteen
referencing tables gains a trigger-filled `created_at` twin and a composite
FK preserving its ON DELETE semantics and constraint name. Global invoice
uniqueness moves to an `orders_invoice_numbers` registry table. Read the file
header in full before considering apply: it is a structural conversion of the
busiest financial table.

## `147_money_agorot_remaining_twins.sql`, added 2026-09-01

Generated `_agorot` twins for the last four money columns that had none:
`orders.discount_ils`, `orders.cashback_applied_ils`,
`order_items.supplier_payout_ils` and `order_items.cashback_earned_ils`.

They are the four that still convert in JavaScript, in
`src/lib/commerce/order-money-columns.ts`, on a value that has already crossed a
JSON boundary as a string. Everything else in the read path already reads a
twin and lets Postgres do the multiply against the numeric source.

`generated always as (round(<col> * 100)::bigint) stored`, like the 26 already
live: it cannot drift, and Postgres refuses any write that names it (428C9), so
no writer changes and the numeric column stays the source of truth.

**Dry run against production, in a transaction that was rolled back:** all four
were created, all four reported `is_generated = ALWAYS`, and the arithmetic is
right on real rows (17.10 -> 1710, 759.05 -> 75905). Confirmed afterwards that
zero columns of these names exist in production. The nonneg checks are safe on
current data, measured: minimums 0.00, 0.00, 17.10, 0.00, no negatives.

**No reader changes with it.** A select naming a column that does not exist
fails 42703 and takes the whole row with it. The reader moves in a separate
commit after this is applied.

## `146_wallet_balance_floor.sql`, added 2026-09-01

`check (user_id is null or balance_ils >= 0)` on `wallet_accounts`. A customer
wallet may not go negative; a house account may, because it is the funding side
of every cashback pair. The reasoning, and the measurements behind it, are in
`docs/DECISIONS.md`. The migration refuses to run if any user-owned account is
negative when it is applied.

## The 138-141 vs 142 question is closed

Ofir chose the additive path. `the in-place money migration (deleted 2026-09-01)` has been
deleted, not archived: the two paths produce nine identically-named columns on
the same tables, and a file left in a directory called `pending/` is a file
somebody may apply. The reasoning is in `docs/DECISIONS.md`.

## APPLIED IN PRODUCTION — do not apply again

Verified 2026-09-01 by querying the live database for each migration's own
effect, not by trusting this list. The version string is from
`supabase_migrations.schema_migrations`.

| File | Production version | Applied as | Verified by |
| --- | --- | --- | --- |
| `123_products_whatsapp_enabled.sql` | `20260901013104` | `123_products_whatsapp_enabled` | `products.whatsapp_enabled` exists |
| `130_payment_events.sql` | `20260901013413` | `130_payment_events` | `payment_events` table + `payment_events_no_mutation` trigger |
| `134_order_items_delivered_at.sql` | `20260901013122` | `134_order_items_delivered_at` | `delivered_at` + `shipped_at` + `order_item_cancellation_deadline()` |
| `136_supplier_coordinates.sql` | `20260901013134` | `136_supplier_coordinates` | `suppliers.latitude` + `.longitude` |
| `146_wallet_balance_floor.sql` | `20260901013143` | `146_wallet_balance_floor` | constraint `wallet_accounts_user_balance_floor` |
| `143_revoke_unused_definer_execute.sql` | `20260821041759` | `revoke_orphan_security_definer_grants_125` | all 5 target functions have zero anon/authenticated grants |
| `144_revoke_authenticated_dml.sql` | `20260831140841` | `126_revoke_authenticated_dml` | all 8 target tables have zero anon/authenticated INSERT/UPDATE/DELETE |
| `145_revoke_check_rate_limit_execute.sql` | `20260831184356` | `127_revoke_check_rate_limit_execute` | `check_rate_limit` has zero anon/authenticated EXECUTE |
| `166_voucher_transition_guard.sql` | `20260903232445` | `voucher_transition_guard_166` | `tg_vouchers_status_guard` trigger + `fn_vouchers_status_guard` body match the file (compared 2026-09-04) |
| `167_order_items_money_constraints.sql` | `20260903232455` | `order_items_money_constraints_167` | all 8 `order_items_*_nonneg` constraints + `order_items_money_conservation` exist, expressions match |
| `168_wallet_ledger_client_readonly.sql` | `20260903232504` | `wallet_ledger_client_readonly_168` | the six write policies are gone; only the two SELECT policies remain, RLS enabled on both tables |
| `172_hide_master_product_test_row.sql` | none — DML, not DDL | applied 2026-09-08 via MCP `execute_sql` | `products` row `9bb347f8-…c895` reads `stock_quantity = 0`; it read `10` immediately before |
| `169_analytics_server_event_names.sql` | `analytics_server_event_names_169` | applied 2026-09-08 via MCP `apply_migration` | rolled-back `DO` probe: five events in, `returned=4`, rows written `begin_checkout, order_refunded, purchase, voucher_redeemed`, unknown name still skipped, `residue = 0` |
| `180_analytics_server_event_names.sql` | same statement | byte-identical duplicate of 169, written by a session that could not see it | applied by the same `CREATE OR REPLACE`; kept rather than deleted so its number stays burned |
| `148_refund_destination.sql` | `20260902182227` | `148_refund_destination` | where a refund's money goes: destination columns on `refunds` |
| `149_audit_log_append_only.sql` | `20260902182235` | `149_audit_log_append_only` | `audit_log` refuses UPDATE and DELETE from the service role too, by trigger |
| `150_account_deletion.sql` | `20260902182251` | `150_account_deletion` | the atomic account-deletion function the privacy page promises |
| `151_analytics_ingest.sql` | `20260902182310` | `151_analytics_ingest` | `fn_ingest_analytics_events`, the function `/api/a` calls (its eight-name whitelist is what 169/180 later widened) |
| `152_payout_machinery.sql` | `20260902182423` | `152_payout_machinery` | supplier payout tables and functions |
| `153_ai_usage.sql` | `20260902182432` | `153_ai_usage` | `ai_usage`, the per-call token and micro-USD cost ledger |
| `154_reviews_wishlist.sql` | `20260902182447` | `154_reviews_wishlist` | `reviews` (verified purchase only) + `wishlists` |
| `155_shipment_tracking.sql` | `20260902182500` | `155_shipment_tracking` | the two physical-fulfilment columns and the email kind |
| `156_analytics_indexes.sql` | `20260902182505` | `156_analytics_indexes` | two partial indexes for the admin analytics windows |
| `157_audit_ip_retention.sql` | `20260902182514` | `157_audit_ip_retention` | IP retention on the now append-only audit trail; runs after 149 |
| `158_revoke_anon_public_on_new_functions.sql` | `20260902213915` | `revoke_anon_public_on_new_functions_158` | the new functions carry no anon/PUBLIC EXECUTE |
| `159_pin_search_path_and_revoke_enqueue.sql` | `20260903004849` | `pin_search_path_and_revoke_enqueue_159` | `search_path` pinned on the definer functions |
| `160_fk_indexes.sql` | `20260903023113` | `fk_indexes_160` | indexes on the unindexed foreign keys |
| `161_enable_pg_cron_pg_net.sql` | `20260903023557` | `enable_pg_cron_pg_net_161` | `pg_cron` 1.6.4 + `pg_net` 0.20.0 installed |
| `163_orders_indexes.sql` | `20260903025918` | `orders_indexes_163` | the `orders` listing indexes |
| `169_audit_full_coverage.sql` | `20260904001341` | `audit_full_coverage_169` | `audit_log_trigger_fn`, `idx_audit_log_request_id` and trigger `audit_orders` all read back from production 2026-09-09 |
| `170_reporting_tables.sql` | `20260904003703` | `reporting_tables_170` | the four `report_*` tables and all six RPCs read back from production 2026-09-09 |
| `171_search_fts.sql` | `20260904005239` | `search_fts_171` | `products_search_vector_gin`, `coupon_deals_search_vector_gin`, `search_products`, `fts_prefix_query`, `fts_unaccent`, `fts_join` all read back 2026-09-09 |
| `172_rls_zero_policy_tables.sql` | `20260904010757` (+ `20260904010826` `_report_grants`) | `rls_zero_policy_tables_172` | all ten policies present, and zero public tables carry RLS with no policy, read back 2026-09-09 |
| `182_coupon_qr_batches.sql` | `20260907163213` | `coupon_qr_batches_182` | `coupon_qr_batches` + `coupon_qr_codes` read back from production 2026-09-09 |
| `186_composite_indexes_top_queries.sql` | applied 2026-09-09 | `composite_indexes_top_queries_186` | all ten index names present and every `indexdef` matches the file; `preflight_186.sql` passed all four blocks first |
| `187_category_name_shekel_order.sql` | applied 2026-09-09 | `category_name_shekel_order_187` | `categories.name_he` for `under-99` went `1506,1491,32,8362,57,57` → `1506,1491,32,8294,57,57,160,8362,8297`; zero rows still match the broken shape |

**`172_hide_master_product_test_row.sql` has no version string on purpose.**
It is a one-row `UPDATE`, not DDL, so it went through MCP `execute_sql` rather
than `apply_migration` and never touched `supabase_migrations`. Its evidence is
the row itself, which is what the Verify block in the file selects.

**`124_categories_sort_order.sql` is a different case.** `categories.sort_order`
exists in production, so the migration must not be run again, but there is **no
row for it in `schema_migrations` under any name**. The effect is present and the
record is not. Treat it as applied; do not expect to find its version string.

**Two of these needed a precise test, not a broad one.** A schema-wide count of
`authenticated` DML grants returns 144 and looks like `144` never ran. It did:
that migration revokes on a named list of eight tables, and against those eight
the count is zero. The 144 remaining grants are on ordinary catalogue and order
tables, which are protected by RLS rather than by revoking the grant. Measuring
the wrong thing here produces a confident, wrong "not applied".

**The fail-open hazard around `145` is closed.** `check_rate_limit` carries zero
EXECUTE grants for `anon` and `authenticated`, and the limiter runs on the
service-role client, so there is no still-anon caller left to fail open.

## Two files were corrected on disk so the repo matches production

Both were rejected at apply time and fixed during the apply. The versions in
this directory now describe what actually ran.

**`131_refunds.sql`.** `refund_due_by` was

```sql
GENERATED ALWAYS AS (requested_at + interval '14 days') STORED
```

which PostgreSQL rejects: a generation expression must be IMMUTABLE, and
`timestamptz + interval` is only STABLE, because the result depends on the
session `TimeZone`. It is now a plain `timestamptz` plus
`refunds_force_due_by()` on `BEFORE INSERT OR UPDATE`, with
`SET search_path TO ''`.

The guarantee is unchanged: nobody can extend the statutory deadline. What
changed is the failure mode. A generated column **refuses** a write to that
column with `428C9`; the trigger **accepts** the write and silently overwrites
the value. The verification note in the file was corrected to match, because it
still told a reader to expect `428C9`.

**`133_supplier_branches.sql`.** The member-write policy named `m.role`. There is
no such column: it is `member_role`, of enum `supplier_member_role`
(`owner`, `manager`, `scanner`). The applied policy also requires `m.is_active`,
and that addition matters more than the rename. Without it, revoking somebody's
access by clearing the flag would leave them able to write branches, because the
membership row still carries its role. Deactivation has to mean deactivation in
the policy, not only in the UI that stops drawing the button.

## `124`, `143`, `144`, `145` are out of the apply order

All four were confirmed applied in production under their old numbers, and they
sit in the APPLIED table above. `check_rate_limit` holds zero `anon` EXECUTE
grants and `authenticated` holds zero DML on the eight deny-all tables. **There
is no fail-open hazard left to sequence around**, which was the only reason the
apply order previously insisted `145` go last.

## 2026-09-01: two drifts between this directory and production, both closed

Found by querying the live database rather than by reading the migration record.

**`135` is two migrations in production, not one.** `schema_migrations` holds
`135a_product_type_recurring` and `135b_recurring_subscriptions`. The repo
carried a single combined file whose header argued, correctly, that PostgreSQL
17 permits `ALTER TYPE ... ADD VALUE` inside a transaction provided the label is
not used in the same one. The argument holds and the shape was still wrong: the
restriction binds the whole transaction, and nobody applying a later statement
can tell from reading it that `'recurring'` must not be referenced. Split into
`135a_product_type_recurring.sql` and `135b_recurring_subscriptions.sql` so the
constraint is structural instead of a promise kept by a comment.

**`138` describes eight columns; production has six.** What ran was a collapsed,
table-driven version of 138-141. These two were never created:

```
orders.discount_ils_agorot
order_items.supplier_payout_ils_agorot
```

The blocks that would create them are still in the file and still correct, so
running it would add them. Whether that is wanted is left open: the reason they
were dropped from the collapsed version was not recorded, and inventing one in a
migration header is how a wrong reason becomes a fact. A banner at the top of
`138` says all of this, so the file cannot be read as a description of
production without also reading the correction.

**The consequence for the application code.** Four money columns have no
generated twin and therefore still convert in JavaScript:

```
orders.discount_ils              orders.cashback_applied_ils
order_items.supplier_payout_ils  order_items.cashback_earned_ils
```

`src/lib/commerce/order-money-columns.ts` carries the same list at the call
site. The two have to change together.
