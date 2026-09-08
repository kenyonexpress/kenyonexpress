# Apply order

## 2026-09-09: 181 APPLIED, as 181a + 181b

The only security file left in the queue, and establishing that it was
unapplied took reading a comment rather than a name: `is_support()` and
`enforce_profile_privilege_columns()` both already exist in production from the
053/090 lineage. The deployed guard body was
`IF public.is_admin() THEN RETURN NEW; END IF;` with nothing between, so any
admin could grant themselves `super_admin` through the user client.

Split the way production already recorded 135, because an enum member is
permanent and cannot be dropped:

| Order | File | Applied as |
| --- | --- | --- |
| 1 | `181a_read_only_enum.sql` | `read_only_enum_181a` |
| 2 | `181b_admin_rbac_hardening.sql` | `admin_rbac_hardening_181b` |

181a must commit before 181b: a value added by `ALTER TYPE ... ADD VALUE`
cannot be referenced by the transaction that adds it. 181a alone is inert.

Proven in a rolled-back transaction, acting as the real super_admin at aal1:
self role change refused, admin grant from aal1 refused for want of MFA, and
the service-role path still succeeded and assigned `read_only`. `profiles`
read 9 customer + 1 super_admin before and after.

**Operator note.** The single super_admin has no verified MFA factor, so until
it enrols TOTP it cannot update its own `profiles` row through the user client.
No deadlock: enrolment writes to `auth.mfa_factors`, never `profiles`, and
`rbac.ts` already redirects that account to `/admin-mfa?mode=enrol` anyway.

**What is still pending after this:** 162 (approved, blocked on vault seeding),
173, 177, 178, 179, 183, 184, 185.


## 2026-09-09: the numbering tangle, then 186 and 187 APPLIED

**Two 170s and two 171s were sitting in `pending/` at once**, written by
sessions that could not see each other, and one of each pair had been applied
to production on 2026-09-04. "Apply 170" therefore named two different files.
Rather than guess, every pending migration was probed against production for
the objects it creates.

Five turned out to be already applied and moved to `migrations/applied/`:
`169_audit_full_coverage` (`audit_full_coverage_169`, `20260904001341`),
`170_reporting_tables` (`reporting_tables_170`, `20260904003703`),
`171_search_fts` (`search_fts_171`, `20260904005239`),
`172_rls_zero_policy_tables` (`rls_zero_policy_tables_172`, `20260904010757`,
plus `_report_grants` `20260904010826`) and
`182_coupon_qr_batches` (`coupon_qr_batches_182`, `20260907163213`).

**181 is the one that had to be read carefully.** Both functions
`181_admin_rbac_hardening` touches already exist in production from the 053/090
lineage, so a probe on the name alone would have called a live security
hardening "applied" and dropped it out of the queue. What settles it is the
comment production reports on `enforce_profile_privilege_columns`, which is
still the pre-181 text, and the RESTRICTIVE `profiles_super_admin_mfa` policy,
which is absent. 181 stays pending.

**The four squatters were renumbered, because a number production has spent
cannot be reclaimed.** 148 → 184, 149 → 185, 170 → 186, 171 → 187, with
`preflight_170` following its migration to `preflight_186`. Each file carries
the rename and the reason in its own header.

**`186_composite_indexes_top_queries.sql` APPLIED** as
`composite_indexes_top_queries_186`. `preflight_186.sql` ran first and all four
blocks passed: none of the ten index names existed, all fourteen columns were
present with the expected types, `product_status` carried `active`, and no
existing index already covered a pattern (the near-duplicates are prefix-only
singles without the composite key plus sort column). Expand-only —
`CREATE INDEX IF NOT EXISTS` and nothing else. All ten were read back after and
every `indexdef` matches the file.

**`187_category_name_shekel_order.sql` APPLIED** as
`category_name_shekel_order_187`. One row, one text column, matched on the
exact broken string. `categories.name_he` for `under-99` went
`1506,1491,32,8362,57,57` → `1506,1491,32,8294,57,57,160,8362,8297`, which is
`עד ` + U+2066 LRI + `99` + NBSP + `₪` + U+2069 PDI — exactly what `isolate()`
in `src/lib/money-format.ts` emits for every other price on the site. Zero rows
still match the broken shape. `repairPriceOrder` stays at the render edge: it
rewrites only `₪<digits>`, so it now leaves this name alone, and a database
without 187 (a branch, a local reset, a preview project) still renders it the
right way round.

**What was still pending after that step:** 162 (approved, blocked on vault
seeding), 173, 177, 178, 179, 181, 183, 184, 185.


## 2026-09-08: 169 / 180 (the four money events) APPLIED

**The funnel was reporting nothing, on a live site.** Read off production
before touching it: `fn_ingest_analytics_events` carried a whitelist of exactly
the eight client names, so `begin_checkout`, `purchase`, `voucher_redeemed` and
`order_refunded` were skipped with a `CONTINUE`, an HTTP 200 and no log. The
harm was counted rather than assumed: `orders` held 4 rows, 2 of them paid,
while `analytics_events` held **zero** `purchase` rows. Only `page_view` (12)
and `web_vital` (16) had ever landed, spanning 02.09 to 06.09.

`169_analytics_server_event_names.sql` and
`180_analytics_server_event_names.sql` are byte-identical SQL written by two
sessions that could not see each other. One `CREATE OR REPLACE` applied both,
and both moved to `migrations/applied/` together with `preflight_169.sql` --
deleting one would free a number that production has now used.

Verified with a rolled-back `DO` block so no probe rows were left behind: five
events in, `returned=4`, the four written names were `begin_checkout`,
`order_refunded`, `purchase`, `voucher_redeemed`, a made-up name was still
skipped, and `residue = 0` afterwards.

`src/lib/analytics/registry-matches-migration.test.ts` now reads the whitelist
out of `migrations/applied/` instead of `pending/`, which is exactly what its
own comment said to do on the day this applied. Green.

## 2026-09-08: 172 (the ₪1 test row) APPLIED — blocker 0 is not what it says

**`172_hide_master_product_test_row.sql` moved to `migrations/applied/`.** It
was drafted as "awaiting approval" on the reading that our build had never been
deployed, so a ₪1 template row could not actually be bought by anyone. That
reading is now false, and it was measured rather than assumed: the custom
domain serves THIS application (Hebrew title, our CSP carrying the Cardcom
`frame-src`, `ke_session_id` cookie, `/api/health` → `{"ok":true,
"database":"ok"}`), the homepage grid renders the row, and
`/product/restaurants-meat-3` returned 200 with both `pdp-buy__atc` and
`pdp-buy__now` present. Live values before the write: `status=active`,
`kenyon_price=1.00`, `full_price=400.00`, `stock_quantity=10`.

A stranger could therefore have completed a real payment for a row with nothing
behind it. The write is one column of one row, reversible with the rollback in
the file, so it went in. Full reasoning in `STATE.md` under the decisions taken
alone.

**Blocker 0 in STATE.md is stale in one direction and still true in another.**
The application IS deployed and IS serving production traffic. What is still
true is that the Vercel account reachable from here (`kenyonexpress-projects`,
hobby) holds one project, `kenyonexpress-web`, linked to the OLD repo
`kenyonexpress/kenyonexpress-web`, whose 11 deployments are all `ERROR` and
whose last attempt was 2026-05-29. Production is being served by a Vercel
account this session cannot see, so nothing here can trigger, inspect or roll
back a deployment of it.

**Nothing here is applied by an agent.** Each file goes to production through
MCP `apply_migration`, one at a time, after Ofir approves it. `db push` is
forbidden by project rule.

## 2026-09-04 (audit): ONE PENDING FILE — 162, BLOCKED ON VAULT

The 2026-09-04 audit ran every preflight against production and found 166,
167 and 168 **already applied and recorded** in
`supabase_migrations.schema_migrations` (`20260903232445`, `20260903232455`,
`20260903232504`), live definitions matching the files. They moved with their
preflights to `migrations/applied/`, rows added to the APPLIED IN PRODUCTION
table in `README.md`, SHA-256 lines in `migrations/applied/CHECKSUMS.sha256`.

| File | State | Preflight |
| --- | --- | --- |
| `162_cron_schedule.sql` | **approved by Ofir (CLOSEOUT §7)**, blocked on vault seeding: the vault holds neither `cron_secret` nor `app_url` (re-measured 2026-09-04 via preflight blocks 3+4: `vault.decrypted_secrets` returns zero of the two names), and seeding them needs the Vercel env (§8a), which this machine cannot reach (no `vercel` CLI, no link, no token — and since 04.09 the Vercel project itself is gone, STATE.md blocker 0). Blocks 1+2 pass: pg_cron 1.6.4 + pg_net 0.20.0 installed, `cron.job` empty. Exact commands under "## חסמים לאופיר" in STATE.md. | `preflight_162.sql` |
| `166_voucher_transition_guard.sql` | **APPLIED** as `voucher_transition_guard_166` (`20260903232445`); verified 2026-09-04, moved to `migrations/applied/`. | with it in `applied/` |
| `167_order_items_money_constraints.sql` | **APPLIED** as `order_items_money_constraints_167` (`20260903232455`); verified 2026-09-04, moved to `migrations/applied/`. | with it in `applied/` |
| `168_wallet_ledger_client_readonly.sql` | **APPLIED** as `wallet_ledger_client_readonly_168` (`20260903232504`); verified 2026-09-04, moved to `migrations/applied/`. | with it in `applied/` |

`165_revoke_anon_helpers.sql` was **CANCELLED on 2026-09-04 (CLOSEOUT §13)**
and moved to `migrations/cancelled/` with its preflight. Eighteen RLS policies
on public/anon-readable tables call the two helpers inside USING/WITH CHECK;
RLS quals run as the caller, so the revoke would have turned every anonymous
catalogue SELECT into 42501. anon EXECUTE on `is_admin()` /
`is_supplier_member(uuid)` is by design: both return false for a caller with
no uid. Regression net: `src/db/__tests__/anon-catalog.test.ts`.

`164` stays unused; §8c named the revoke file 165 and the number is kept
stable. The section below is unchanged history.

## 2026-09-03: THERE IS NOTHING LEFT TO APPLY (history)

`migrations/pending/` holds no `.sql` file. The last three went to production on
2026-09-03 -- `160_fk_indexes.sql`, `161_enable_pg_cron_pg_net.sql` and
`163_orders_indexes.sql` -- and all three are recorded in `migrations/applied/`
with the row that describes them in `README.md`.

`162` is deliberately unused and reserved for the pg_cron schedule that `161`
makes possible: twelve cron routes exist under `src/app/api/cron/` and, measured
on 2026-09-03, `select count(*) from cron.job` returns 0 and `vercel.json`
declares no crons at all. Nothing calls them.

**The table below is history.** Every row in it has been applied. It is kept
because a reader asking "was this applied, and what did it do" needs the row to
still exist. A new migration starts at **164**.

Twelve files in this directory are **already in production** and are not listed
below. See the "APPLIED IN PRODUCTION" table in `README.md`, which carries the
version string and the query that proved each one. Running any of them again is
at best a no-op and at worst an error.

## The fourteen that remain, in order

Order matters only where a **depends on** column is filled. Everything else is
independent and may be applied in any sequence, or not at all.

| # | File | What it does | Depends on | Rollback |
| --- | --- | --- | --- | --- |
| 1 | `122_deny_all_on_server_only_tables.sql` | explicit restrictive deny on 5 server-only tables | — | `drop policy deny_all_client_roles on <table>` |
| 2 | `125_expire_vouchers_drop_escrow.sql` | voucher expiry, drops the dead escrow promise | — | in file header |
| 3 | `126_percent_range_checks.sql` | `check (0 <= x <= 100)` on 12 percent columns | — | `drop constraint <table>_<col>_range` |
| 4 | `127_homepage_cms.sql` | homepage CMS tables | — | in file header |
| 8 | `135_recurring_subscriptions.sql` | `recurring` enum member, `subscriptions`, billing columns | — | in file header |
| 9 | `137_order_transition_guard.sql` | order state transition guard + audit-log immutability triggers | — | `drop trigger audit_log_no_delete on public.audit_log` |
| 10 | `138_money_agorot_money_path.sql` | `_agorot` columns on orders, order_items, payments | — | `drop column <col>_agorot` |
| 11 | `139_money_agorot_wallet.sql` | `_agorot` columns on the wallet tables | — | `drop column <col>_agorot` |
| 12 | `140_money_agorot_catalog.sql` | `_agorot` columns on products, variants, coupons | — | `drop column <col>_agorot` |
| 13 | `141_money_agorot_growth.sql` | `_agorot` columns on affiliates, referrals | — | `drop column <col>_agorot` |
| 14 | `147_money_agorot_remaining_twins.sql` | the last four money columns with no generated twin | — | `drop column <col>_agorot` |
| 15 | `184_orders_monthly_partitioning.sql` | monthly range partitioning of `orders`, composite FKs on 16 tables | `137` | in file header |
| 16 | `185_soft_delete_user_facing_remainder.sql` | `deleted_at` + RLS filter on categories, product_images, reviews, wishlists | — | in file header |
| 17 | `173_whatsapp_flow.sql` | WhatsApp consent + outbox + inbound log + support tickets, order-status trigger | — | in file header |
| 18 | `177_cashback_ledger.sql` | append-only cashback ledger, first-purchase 10% / every-fifth 5% bonus fn, admin adjustment fn (174-176 are taken by files on `closeout/v1-final`, hence the gap) | `046` (applied) | in file header |
| 19 | `178_webauthn_credentials.sql` | passkey (WebAuthn) credentials table, select/delete-own RLS, service-role-only writes | — | in file header |
| 20 | `179_push_subscriptions.sql` | web push subscriptions table, select/delete-own RLS, service-role-only writes | — | in file header |
| — | `169_audit_full_coverage.sql` | **already applied 2026-09-04** (MCP, `audit_full_coverage_169`): audit_log before/after/request_id + triggers on all financial/user tables | — | in file header |
| — | `170_reporting_tables.sql` | **already applied 2026-09-04** (MCP, `reporting_tables_170`): 4 reporting tables + nightly pg_cron rebuild + 5 admin-only RPCs | — | in file header |

## The money set, 138 through 141

These four are **one change in four files** and should be applied together.

They are additive: each adds `<col>_agorot bigint`, backfills it with
`round(<col> * 100)`, constrains it, and leaves the original column untouched.
**Applying them is a no-op for the running application** — no reader sees a
different value, because no reader knows the new columns exist yet.

The full sequence, of which applying these is only step one:

```
1. apply 138-141          a no-op for the running app
2. deploy the readers     pointing at the _agorot columns
3. verify in production   both representations live and comparable
4. drop the numeric cols  a separate migration, written later
```

Step 2 cannot start before step 1 is applied, because the columns do not exist
until then and any query naming them fails.

The in-place alternative was deleted on 2026-09-01. It renamed as it converted,
which breaks every reader at the instant of apply with no deploy window and no
rollback without downtime. The two paths produced nine identically-named columns
on the same tables, so they were never combinable. Reasoning in
`docs/DECISIONS.md`.

## Two that refuse rather than corrupt

`126` raises if any percent column already holds a value outside 0..100, instead
of constraining bad data into place.

`146` (already applied) raises if any user-owned wallet account is negative. A
house account, `user_id is null`, is allowed to be negative: it is the funding
side of every cashback pair.

## Rollback in general

Every file carries its own `-- ROLLBACK` header with the exact statements. The
additive money migrations are the cheapest to reverse — dropping a column no
code reads yet costs nothing. The trigger and constraint migrations are next.
`135` is the most expensive, because it adds an enum member, and PostgreSQL
cannot drop one.

## Renumbering note

The table above keeps its original numbering column even though rows were
removed as migrations were applied, so a row's number is a stable reference in
conversation rather than a position. What is authoritative is the file list, and as of
2026-09-03 that list is empty: every migration this directory ever described now
lives in `migrations/applied/`.
