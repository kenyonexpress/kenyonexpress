# Apply order

## 2026-09-10 (fraud abuse goal): 226 APPLIED

**226** fraud_controls (`fraud_controls_226`): additive only, two new
server-only tables (`fraud_flags`, `fraud_review_queue`) with RLS on, zero
policies and the client grants revoked, plus four indexes and the
`updated_at` trigger. Full body dry-run first in a rolled-back DO block
(dedupe index refused a duplicate pending row and freed the slot on resolve,
CHECKs refused unknown kinds, the blocking-flag read returned the probe row,
`authenticated` had no SELECT, RLS on), ending in a deliberate RAISE; the
identical body then went through `apply_migration`. Post-apply measurement in
one SELECT: 2 tables, 4 indexes, `rls_on=true`, `auth_flags_select=false`,
`anon_queue_select=false`, `service_insert=true`, trigger present, 0 rows.
Does not restate `set_updated_at` (the 183 lesson): creates it only if
missing, and the live body already exists. Numbered 226 because 225 is taken
by another branch's pending file. Applied under the 2026-09-10 fraud-abuse
/goal, which names Supabase MCP as the migration route (the 217 protocol).

## 2026-09-09 (supplier sync goal): 223 APPLIED

**223** restock_on_refund (`restock_on_refund_223`): full body dry-run first
in a rolled-back transaction over real rows (a real order with no
reservations, a real tracked product at level 10, a real untracked product):
a consumed hold of 2 restocked to 12 and returned 1, the replay returned 0
and left 12, the untracked product's reservation was stamped with no level
change, and the probe ended in a deliberate RAISE so everything rolled back —
verified afterwards that neither the function nor the column existed. The
identical body then went through `apply_migration`. Post-apply measurement:
EXECUTE on `restock_order_stock` is postgres+service_role only,
`restocked_at` exists with 0 rows stamped. Numbered 223 because 218-222 are
taken by `audit/final-audit`'s pending files. Applied under the 2026-09-09
dropshipping supplier-sync /goal, which names Supabase MCP as the migration
route (the 217 protocol).

## 2026-09-09 (coupon QR goal): 217 APPLIED

**217** coupon_qr_redemption (`coupon_qr_redemption_217`): full body dry-run
first in a rolled-back transaction, with a seven-step functional probe over
real inserts (three probe orders, one probe campaign with `max_uses 1`, three
probe codes): first redeem ok, same-order replay idempotent, second order
refused `redeemed` (the FOR UPDATE single-use gate), a campaign-cap refusal
left the unit row untouched (`exhausted`, `redeemed_at` still NULL), a
per-code `expires_at` in the past refused `expired`, the sweep stamped exactly
that code, and neither `anon` nor `authenticated` can EXECUTE either function.
The probe ended in a deliberate RAISE so everything rolled back; the identical
body then went through `apply_migration`. Post-apply measurement: both
columns, both functions, grants service_role only, partial index present,
`coupon_qr_codes` held 0 rows so nothing live changed behaviour. Applied under
the 2026-09-09 coupon QR /goal, which names Supabase MCP as the migration
route.

## 2026-09-09 (RBAC goal): 212 APPLIED; 181 and 210 found already live

**212** rbac_truncate_and_search_path (version `20260909115250`): full body
dry-run in a rolled-back transaction first, probes inside the same transaction
showed 0 client TRUNCATE grants and 0 unpinned target functions; identical
result measured after the real apply. Applied under the 2026-09-09 RBAC /goal,
which names Supabase MCP as the migration route.

Also recorded, not applied now: **181** was already applied 2026-09-08 as two
parts (`read_only_enum_181a` `20260908203538`, `admin_rbac_hardening_181b`
`20260908203558`) — the apply predates this goal and was previously unlogged;
every effect verified live (enum value, `is_support()` body, guard ladder,
trigger, MFA policy). **210** applied 2026-09-09 as `media_ingest_queue_210`
(`20260909093018`). Both now sit in README's APPLIED table.

## 2026-09-09: 192 through 201 APPLIED, ten files, each dry-run first

Applied one at a time via MCP `apply_migration`, on Ofir's explicit
instruction (the `/goal` of 2026-09-09 named exactly this range). Before each
apply, the full file body ran through `execute_sql` inside a transaction that
was ROLLED BACK, with functional probes where the file has behaviour to prove:

- **192** seed_seo_redirects: 33 active redirects after seed, table was empty.
- **193** price_history: 80 backfill observations seeded (every non-deleted
  product with a price), append-only triggers in place, public SELECT only.
- **194** discount_claim_caps: `claim_order_discount` / `release_order_discount`
  probed against a real order id (empty code NULL, unknown code NULL,
  release 0), client EXECUTE revoked.
- **195** stock_waitlist: joined twice with case/whitespace variants of one
  email, exactly one lowercased row resulted; unknown-product refusal in place.
- **196** shipped notification: live `tg_orders_notify_shipped` read with
  `pg_get_functiondef` first — guard, dedupe key and firing condition matched
  the file's baseline byte for byte; the replaced trigger was FIRED on a real
  paid order in the rolled-back probe and the payload carried
  `shipments[0].tracking_number`. Zero outbox residue after.
- **197** shipping_zones seeded free-everywhere (5 zones, all 0 agorot),
  pickup_points deliberately empty. The `set_updated_at` restatement differs
  from the live body only in `:=` vs `=` and whitespace — same language,
  attributes and semantics, so the replace is a no-op in behaviour.
- **198** in_app notifications: `read_at` proven the ONLY updatable column for
  authenticated; `notifications` added to `supabase_realtime` + REPLICA
  IDENTITY FULL.
- **199** review replies: table-wide UPDATE on `reviews` revoked BEFORE the
  policy wakes it; post-check shows exactly 3 grantable columns
  (supplier_reply, supplier_replied_at, supplier_replied_by).
- **200** wishlist alert kinds: the live-drift guard passed (live constraint
  carried exactly the 14 known names), now 16 kinds.
- **201** scheduled_price_changes: one-pending-per-moment index probed
  (duplicate refused, cancelled row frees the slot), deny-all RLS.

Security advisors after: no new findings — every WARN pre-dates these files.
The `set_updated_at` mutable-search_path WARN is pre-existing and unchanged.

**Not applied and out of this batch's scope:** 162 (vault seeding), 184
(maintenance window), 188–191, 202–205.

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

## The twelve that remain, in order

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
| 15 | `148_orders_monthly_partitioning.sql` | monthly range partitioning of `orders`, composite FKs on 16 tables | `137` | in file header |
| 16 | `149_soft_delete_user_facing_remainder.sql` | `deleted_at` + RLS filter on categories, product_images, reviews, wishlists | — | in file header |
| 17 | `173_whatsapp_flow.sql` | WhatsApp consent + outbox + inbound log + support tickets, order-status trigger | — | in file header |
| 18 | `177_cashback_ledger.sql` | append-only cashback ledger, first-purchase 10% / every-fifth 5% bonus fn, admin adjustment fn (174-176 are taken by files on `closeout/v1-final`, hence the gap) | `046` (applied) | in file header |
| — | `178_webauthn_credentials.sql` | **already applied 2026-09-08** (MCP, `webauthn_credentials_178`, version `20260908210126`; verified against production 2026-09-09: table, RLS and both policies match the file): passkey (WebAuthn) credentials table, select/delete-own RLS, service-role-only writes | — | in file header |
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
