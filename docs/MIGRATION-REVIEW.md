# MIGRATION-REVIEW.md

Every file in `migrations/pending/`, read as text, with risk notes and the
rationale for the apply order.

**Nothing here is executed.** This document is a read. `db push` is forbidden by
project rule, and every pending file reaches production only through MCP
`apply_migration`, one at a time, after Ofir approves it and after its preflight
passes. This session has no database access and made none.

Status: reference. Docs only. Pass 1.

---

## 0. What is actually pending

```
migrations/pending/
  162_cron_schedule.sql                    3397 B   approved, BLOCKED on vault
  169_analytics_server_event_names.sql     3194 B   not yet approved
  170_composite_indexes_top_queries.sql    3626 B   not yet approved
  preflight_162.sql                        1760 B
  preflight_169.sql                        1363 B
  preflight_170.sql                        2195 B
  APPLY-ORDER.md                           8969 B
  README.md                               50678 B
```

Three SQL migrations, each with its own preflight. `migrations/applied/` and
`migrations/cancelled/` hold the rest of the history and are out of scope here.

### 0.1 Apply order

**There is no ordering constraint between the three.** None of them declares a
`depends on`, and they touch three disjoint objects:

| File | Object touched | Independent of |
|---|---|---|
| 162 | `cron.job` (the scheduler) | 169, 170 |
| 169 | `public.fn_ingest_analytics_events` (one function body) | 162, 170 |
| 170 | ten indexes on six tables | 162, 169 |

So the order is a **risk** order, not a dependency order. The one this review
recommends, lowest blast radius first:

```
1.  169    one CREATE OR REPLACE, no table touched, instant, trivially reversible
2.  170    ten indexes, additive, but takes write locks (see 3.3)
3.  162    twelve live jobs that start calling production every five minutes
```

That is the reverse of the numeric order, and deliberately so. 162 is the only
one of the three that causes anything to *happen* on a schedule; it should be
last, and it is blocked anyway.

### 0.2 Status inherited from the 2026-09-04 audit

`APPLY-ORDER.md` records that 166, 167 and 168 were found already applied and
recorded in `supabase_migrations.schema_migrations`, with live definitions
matching the files, and were moved to `migrations/applied/`. `165` was cancelled
and moved to `migrations/cancelled/`. `164` stays unused; the number is kept
stable rather than reused.

---

## 1. `162_cron_schedule.sql`

### 1.1 What it does

A single `DO $$ ... $$` block. It refuses to run if either vault secret is
missing, then loops over a twelve-row `VALUES` list and calls
`cron.schedule(jobname, schedule, command)` for each. The command is a
`net.http_post` to `<app_url><path>` with a bearer token, `body := '{}'::jsonb`
and `timeout_milliseconds := 55000`.

### 1.2 Verified in this pass

**The twelve jobs match `scripts/cron-jobs.json` exactly.** Name, cron
expression and path, all twelve, compared field by field:

| Job | Schedule | Path |
|---|---|---|
| `ke-notifications` | `*/5 * * * *` | `/api/cron/notifications` |
| `ke-health` | `*/5 * * * *` | `/api/cron/health` |
| `ke-invoices` | `*/10 * * * *` | `/api/cron/invoices` |
| `ke-stock` | `*/10 * * * *` | `/api/cron/stock` |
| `ke-stranded-payments` | `*/10 * * * *` | `/api/cron/stranded-payments` |
| `ke-abandoned-cart` | `0 * * * *` | `/api/cron/abandoned-cart` |
| `ke-subscriptions` | `30 2 * * *` | `/api/cron/subscriptions` |
| `ke-reap-carts` | `40 3 * * *` | `/api/cron/reap-carts` |
| `ke-reconcile` | `0 4 * * *` | `/api/cron/reconcile` |
| `ke-expire-vouchers` | `15 23 * * *` | `/api/cron/expire-vouchers` |
| `ke-retention` | `0 5 1 * *` | `/api/cron/retention` |
| `ke-weekly-digest` | `0 4 * * 5` | `/api/cron/weekly-digest` |

The only transformation is the `ke-` prefix on the job name, which is what makes
the rollback (`unschedule ... where jobname like 'ke-%'`) safe to run without
touching a job somebody else created.

**The header shape 162 sends is accepted by all twelve routes.** Checked
directly, because a mismatch here would 401 silently forever (see risk 1).
Every one of the twelve calls:

```
bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')
```

and returns `401 {ok:false}` on a miss. `bearerMatches`
(`src/lib/security/constant-time.ts:40`) requires the literal `Bearer ` prefix
and then compares with `secretEquals`, constant-time. Its first line is
`if (!header || !expected) return false`, so an **unset `CRON_SECRET` denies
every request** rather than accepting any: the auth fails closed, which is the
right direction for a route that can spend money.

162 sends `'Bearer ' || <vault secret>` uniformly to all twelve, so the shapes
agree. This was worth confirming rather than assuming: two of the twelve read
the secret through the shared helper in a way a grep does not show, and an
earlier note in this pass wrongly flagged them as using a different shape.

**The idempotency claim holds.** `cron.schedule(jobname, ...)` upserts by name
in pg_cron >= 1.4, and `migrations/applied/161` records the installed version as
**1.6.4**. Re-running replaces rather than duplicating.

**Secrets are genuinely not inlined.** Both the URL and the token are subselects
against `vault.decrypted_secrets` evaluated at *run* time, inside the command
string. `cron.job.command` stores the subselect, not the value, so the token
never lands in a table an operator can read casually, and rotating it needs no
re-migration.

### 1.3 Risks

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **pg_net is fire-and-forget, so a failing job still looks successful.** `net.http_post` queues a request and returns an id immediately. The response lands in `net._http_response`, not in `cron.job_run_details`. A 401, a 500, or a dead host therefore records a **successful** cron run. | **High** | This is the biggest operational gap in the file. Nothing in 162 reads the response back. Without a check on `net._http_response`, "the crons are green" means only "the scheduler fired", not "the work happened". |
| 2 | **`app_url` may point at a host that no longer exists.** Preflight block 4 asserts the value looks like `https://%.vercel.app` and is not the domain. It cannot assert the alias still resolves, and `STATE.md` records the Vercel project itself as gone. Seeding a stale alias would schedule twelve jobs that POST into the void, the most frequent every five minutes. | **High** | Combined with risk 1, this fails silently and indefinitely. Add a manual `curl` of one path before applying. |
| 3 | A missing vault row **after** scheduling is a different failure from a missing one before. The `DO` block's two guards only cover apply time. If a secret is later deleted, `url := NULL \|\| path` is `NULL` and `net.http_post` errors, which at least surfaces in `cron.job_run_details`. | Low | The header's claim that a missing row "makes the job fail loudly instead of calling with an empty bearer" is correct, and the mechanism is the NULL url rather than the header. |
| 4 | 55s timeout against a `*/5` schedule leaves no overlap risk for the frequent jobs, but pg_cron does not prevent a second run starting while the first is in flight. | Low | Only relevant if a job's own work outlives its interval. None of the twelve is close. |
| 5 | Twelve jobs land at once. `ke-notifications` and `ke-health` share `*/5`; three more share `*/10`. On the hour, five jobs fire together. | Low | Consider staggering the minute offsets if the app is latency-sensitive at those instants. Not a correctness issue. |

### 1.4 Blocker

Approved by Ofir (CLOSEOUT section 7) as the only migration cleared for
production, and **blocked**: `vault.decrypted_secrets` returns zero of the two
required names, re-measured 2026-09-04 via preflight blocks 3 and 4. Seeding
them needs the Vercel env, which this machine cannot reach.

Preflight blocks 1 and 2 pass: both extensions installed at the recorded
versions, `cron.job` empty.

### 1.5 Rollback

```sql
select cron.unschedule(jobname) from cron.job where jobname like 'ke-%';
```

Clean and complete. No schema changes to reverse.

---

## 2. `169_analytics_server_event_names.sql`

### 2.1 What it does

`CREATE OR REPLACE FUNCTION public.fn_ingest_analytics_events`, byte-identical
to the version migration 151 shipped except for the name whitelist, which grows
from eight names to twelve.

### 2.2 Why it matters

151 shipped the whitelist with only the eight **client** event names. The
function `CONTINUE`s past an unknown name by design, so `trackServerEvent` has
been calling it with `begin_checkout` since the checkout wave and **every server
event ever emitted was silently skipped**. Three more were added later
(`purchase`, `voucher_redeemed`, `order_refunded`). Until this applies, all four
go into the void.

The skipped names are the funnel's money moments: checkout start, purchase,
voucher redemption, refund. So the analytics table currently has no record of
any of them.

### 2.3 Verified in this pass

The twelve names in the SQL `IN` list are exactly
`CLIENT_EVENT_NAMES` (8) plus `SERVER_EVENT_NAMES` (4) from
`src/lib/analytics/events.ts`. Checked name by name; no extras, none missing.

### 2.4 Risks

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **The whitelist is duplicated in two places with no automated gate.** The SQL `IN` list and `SERVER_EVENT_NAMES` must move together. Both files carry a comment saying so, and `src/__tests__/pending-migrations-inventory.test.ts` only asserts the migration **filename** is present, not its contents. Nothing fails if a ninth client event is added to the registry and not to the function. | **Medium** | The two are consistent today. This is a drift risk, not a current defect. A test that parses the `IN` list out of the file and compares it to the two exported arrays would close it. |
| 2 | **`v_inserted` overcounts.** It is incremented after every `INSERT ... ON CONFLICT (event_id) DO NOTHING`, including the conflicts that wrote nothing. The return value is therefore "events accepted", not "rows written". | Low | Pre-existing in 151 and carried forward deliberately, since the file is byte-identical apart from the list. Worth knowing if that return value is ever used as a metric. Fixing it here would break the "byte-identical except the IN list" property that makes this migration easy to review. |
| 3 | `CREATE OR REPLACE FUNCTION` takes a lock on the function, not on `analytics_events`. No table is touched and no rewrite happens. | None | Preflight block 4 counts the table only as a scale note; it is not a lock concern. |
| 4 | If the function is currently mid-call from `/api/a` when the replace lands, the in-flight call finishes against the old definition. | None | Normal PostgreSQL behaviour, no partial state. |

### 2.5 Safety properties worth keeping

- `SECURITY DEFINER` with `SET search_path TO ''` and every object
  fully qualified. That is the correct hardening for a definer function and it
  is present.
- The function takes `p_user_id` as an argument but is granted to
  `service_role` only (preflight block 3 asserts no `anon`, no
  `authenticated`). A definer function that accepts an identity argument is only
  safe while that grant holds; if it were ever granted to `authenticated`, the
  caller could attribute events to any user id. The preflight checks this, which
  is the right place for it.
- Unknown names are skipped rather than raised, so one bad event does not lose
  the nineteen good ones in the same batch.
- Batch size is capped at 20 with an explicit error, matching the client's
  `MAX_BATCH_SIZE`.

### 2.6 Rollback

Re-run the `CREATE OR REPLACE FUNCTION` block from
`migrations/applied/151_analytics_ingest.sql`, which carries the eight-name
list. Exact and complete.

---

## 3. `170_composite_indexes_top_queries.sql`

### 3.1 What it does

Ten `CREATE INDEX IF NOT EXISTS` statements on six tables. Expand-only: no
drops, no data changes, no column changes.

| # | Index | Table | Key | Partial predicate |
|---|---|---|---|---|
| 1 | `products_active_category_created_idx` | products | `(category_id, created_at DESC)` | active, not deleted |
| 2 | `products_status_created_idx` | products | `(status, created_at DESC)` | not deleted |
| 3 | `products_active_category_price_idx` | products | `(category_id, kenyon_price)` | active, not deleted |
| 4 | `products_active_price_created_idx` | products | `(kenyon_price, created_at DESC)` | active, not deleted |
| 5 | `products_active_category_name_idx` | products | `(category_id, name_he)` | active, not deleted |
| 6 | `orders_user_created_active_idx` | orders | `(user_id, created_at DESC)` | not deleted |
| 7 | `vouchers_order_item_issued_idx` | vouchers | `(order_item_id, issued_at)` | none |
| 8 | `invoices_order_doc_status_idx` | invoices | `(order_id, document_type, status)` | none |
| 9 | `carts_session_profile_idx` | carts | `(session_id, profile_id)` | none |
| 10 | `user_addresses_user_default_created_idx` | user_addresses | `(user_id, is_default DESC, created_at DESC)` | not deleted |

Every one names the code path that issues its query, with a file and line range.
That is unusually good provenance for an index migration and makes each one
falsifiable.

### 3.2 Risks

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **No `CONCURRENTLY`, so each `CREATE INDEX` blocks writes on its table for the duration.** A plain `CREATE INDEX` takes a `SHARE` lock, which permits reads and blocks `INSERT`/`UPDATE`/`DELETE`. Five of the ten are on `products`; one is on `carts`, which is written on **every cart mutation**; one is on `orders`. | **High** | This is the finding for 170. On a small table it is milliseconds. The blast radius scales with row count, and nothing in the file or the preflight measures that. |
| 2 | **`CONCURRENTLY` cannot simply be added.** It is illegal inside a transaction block, and MCP `apply_migration` wraps its statements in one. So the choice is a real one: accept the write lock, or apply these outside the migration mechanism. | **High** | Worth deciding explicitly before approval rather than at apply time. Preflight block 4's row counts are the input to that decision, and the preflight does not currently gather them. |
| 3 | **Three indexes on `products` share one predicate and differ only in sort column** (1, 3, 5: `category_id` + created / price / name). Correct for three sort orders, and it is 3x index maintenance on every `products` write, plus a fourth (2) and fifth (4). | Medium | Five indexes on one table is a real write cost. Justified only if all five sorts are actually used; the file cites a code path for each, so the evidence is there, but the cost is not stated anywhere. |
| 4 | **Existing single-column indexes become redundant and are not dropped.** Preflight block 4 names seven: `products_category_id_idx`, `carts_session_id_idx`, `orders_user_id_idx`, `idx_orders_user_status`, `idx_user_addresses_user_default`, `vouchers_order_item_idx`, `idx_invoices_order`. A composite whose leading column is the single index's column serves the same queries. | Medium, **and only production can confirm it** | See 3.2.1. Expand-only is the right call for step one; the follow-up contract migration that drops the redundant singles is not written and is not mentioned in `APPLY-ORDER.md`. |
| 5 | Index 2's leading column is `status`, which is low cardinality. A partial index `WHERE status = 'active'` keyed on `(created_at DESC)` alone would be smaller and serve the same shop-wide listing. | Low | Style, not correctness. The current form also serves queries filtering a non-active status, if any exist. |
| 6 | Index 9 relies on btree indexing NULLs so the composite serves the `profile_id IS NULL` arm. | None | Correct, and the file says so. btree does index NULLs. |
| 7 | Ten indexes add disk. No estimate is given. | Low | Worth measuring on the five `products` indexes specifically. |

### 3.2.1 Risk 4 cannot be settled from this repository

Checked, because the claim was worth testing rather than asserting. Of the seven
single-column indexes preflight block 4 names, **exactly one is traceable to the
file chain**:

| Index | In `migrations/applied/` |
|---|---|
| `orders_user_id_idx` | **yes**, `163_orders_indexes.sql:84`, which also carries its own `drop index` rollback line |
| `products_category_id_idx` | no |
| `carts_session_id_idx` | no |
| `idx_orders_user_status` | no |
| `idx_user_addresses_user_default` | no |
| `vouchers_order_item_idx` | no |
| `idx_invoices_order` | no |

Six of seven exist in the preflight's expectation list and in no file in this
repository. That is not a bug in the preflight: its block 4 was written from
**measuring production**, not from reading the chain. `migrations/applied/`
holds 45 files, and the live schema has history the chain does not describe.

Two consequences, and the second matters more:

1. **Risk 4 is real but unquantified from here.** Whether those six exist
   today, and therefore whether 170 creates a genuine duplicate, is a question
   only a query against production can answer. Preflight block 4 is exactly
   that query, which is why it is in the preflight rather than in the migration.
2. **Do not audit index coverage by reading `migrations/applied/`.** A reader who
   greps the chain and finds six of the seven missing will conclude they do not
   exist and that 170 is not duplicating anything. That conclusion would be
   drawn from an incomplete record. The file chain is a log of what this
   repository applied, not a description of the live schema.

The same caution applies to every risk in this document that depends on the
current shape of production: the row counts in 3.2, the vault contents in 1.4,
and the "before" whitelist in 2.6. All three are preflight questions for the
same reason.

### 3.3 The lock question, stated plainly

The safe sequence, if the tables turn out to be large:

```
1. measure    select count(*) from products, orders, carts, ...
2. if small   apply as written, accept a sub-second write lock
3. if large   apply each CREATE INDEX CONCURRENTLY outside a transaction,
              one at a time, then record them as applied by hand
```

`CREATE INDEX CONCURRENTLY` can also leave an **invalid** index behind if it
fails, which then has to be dropped and rebuilt. That is a recoverable state,
but it is one the plain form cannot reach.

### 3.4 Rollback

Not stated in the file header as a block, unlike 162 and 169. It is nonetheless
exact, because the migration is purely additive:

```sql
DROP INDEX IF EXISTS public.products_active_category_created_idx;
DROP INDEX IF EXISTS public.products_status_created_idx;
DROP INDEX IF EXISTS public.products_active_category_price_idx;
DROP INDEX IF EXISTS public.products_active_price_created_idx;
DROP INDEX IF EXISTS public.products_active_category_name_idx;
DROP INDEX IF EXISTS public.orders_user_created_active_idx;
DROP INDEX IF EXISTS public.vouchers_order_item_issued_idx;
DROP INDEX IF EXISTS public.invoices_order_doc_status_idx;
DROP INDEX IF EXISTS public.carts_session_profile_idx;
DROP INDEX IF EXISTS public.user_addresses_user_default_created_idx;
```

**Adding a `-- ROLLBACK` header to 170 to match its two siblings is the single
cheapest improvement to this directory.** The other two carry one; this one
does not, and the convention is otherwise consistent across `applied/`.

---

## 4. The preflights

All three follow the same shape: numbered blocks, each with an `EXPECT` comment,
run through MCP `execute_sql` before the migration. The stated rule is that
every block must match or the migration is not applied, and the failing block is
recorded under the blockers heading in `STATE.md`.

| Preflight | Blocks | What it proves |
|---|---|---|
| `preflight_162.sql` | 5 | extensions installed at the recorded versions; `cron.job` empty or `ke-%` only; both vault secrets exist **by name**; `app_url` is a vercel alias; and one out-of-SQL block requiring the repo's cron tests to be green |
| `preflight_169.sql` | 4 | the function exists with the 151 signature; the whitelist is still the eight-name one (the "before" picture); grants are `service_role` only; a row count as a scale note |
| `preflight_170.sql` | 4 | none of the ten index names exists; all 14 columns exist with the expected types; `product_status` carries `'active'`; and a near-duplicate scan over existing indexes |

### 4.1 What the preflights do well

- **Block 3 of 162 selects `name` only, never `decrypted_secret`.** The secret
  value is never pulled into a result set an operator might paste somewhere.
  Block 4 does read the value but only as a boolean comparison, so the URL never
  prints either.
- **Block 2 of 169 is a "stop and compare" guard**, not just a check: if the
  body already contains `begin_checkout`, some variant has been applied and the
  operator is told to stop rather than to overwrite.
- **Block 5 of 162 is explicitly outside SQL** and names the test file that
  proves it. A preflight that admits which of its conditions is not a query is
  more honest than one that quietly omits it.

### 4.2 Gaps in the preflights

| # | Gap | Which |
|---|---|---|
| 1 | No row counts for the six tables 170 indexes, which is the input to the `CONCURRENTLY` decision in 3.2. | 170 |
| 2 | No reachability check on `app_url`. Block 4 checks the value's *shape*, which cannot catch a dead alias. | 162 |
| 3 | No check that `net._http_response` is readable, which is the only way to see whether the scheduled jobs actually succeed. | 162 |
| 4 | No assertion binding the SQL whitelist to `SERVER_EVENT_NAMES`. | 169 |

---

## 5. Summary

| File | Approved | Blocked | Risk | Recommendation |
|---|---|---|---|---|
| `169` | no | no | **Low** | Apply first. One function body, exact rollback, fixes a live data loss (four money events currently discarded). |
| `170` | no | no | **Medium** | Measure the six tables' row counts first, then decide plain versus `CONCURRENTLY`. Add a `-- ROLLBACK` header. Plan the contract migration that drops the redundant singles. |
| `162` | yes | **yes, on vault** | **High** | Last. Before applying, `curl` one cron path against `app_url` to prove the host is alive, and decide how `net._http_response` will be monitored. Otherwise twelve jobs fail silently every five minutes. |

The single most valuable change to this directory is not to any migration: it is
adding a response check for 162, because without one the crons cannot be
observed at all, and 162 is the file that is already approved.

---

## 6. How to re-derive this document

```bash
ls -la migrations/pending/
cat migrations/pending/APPLY-ORDER.md
cat migrations/pending/162_cron_schedule.sql
cat migrations/pending/169_analytics_server_event_names.sql
cat migrations/pending/170_composite_indexes_top_queries.sql
cat migrations/pending/preflight_16{2,9}.sql migrations/pending/preflight_170.sql

# the 162 job list against its source of truth
python3 - <<'PY'
import json, re
jobs = json.load(open('scripts/cron-jobs.json'))
jobs = jobs if isinstance(jobs, list) else jobs.get('jobs', jobs)
sql = open('migrations/pending/162_cron_schedule.sql').read()
rows = re.findall(r"\('(ke-[a-z-]+)',\s*'([^']+)',\s*'(/api/cron/[a-z-]+)'\)", sql)
for j, s in zip(jobs, rows):
    ok = f"ke-{j['name']}" == s[0] and j['cron'] == s[1] and j['path'] == s[2]
    print(j['name'], s[0], 'OK' if ok else 'MISMATCH')
PY

# the 169 whitelist against the registry
sed -n '1,45p' src/lib/analytics/events.ts
```

Reading is all this document does. Nothing above connects to a database.

---

## 7. Related documents

```
migrations/pending/APPLY-ORDER.md   the operator's order and blocker table
migrations/pending/README.md        the APPLIED IN PRODUCTION history
docs/ROLE-MATRIX.md                 where RLS is the real control
docs/QA-SCRIPTS.md                  the manual pass per flow
docs/DECISIONS.md                   why the in-place money conversion was deleted
STATE.md                            "חסמים לאופיר", where 162's blocker lives
```
