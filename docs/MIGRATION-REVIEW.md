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

### 0.1a Scope: three on this branch is not three everywhere

This document reviews `migrations/pending/` **as it stands on
`docs/ui-design-system`**, where it holds exactly three SQL files. That is worth
saying, because it is not the only answer in this repository.

`git branch --contains` places further pending-migration work (numbers past 170)
on `closeout/v1-final` and `ke-cursor-docs`. Those branches are out of scope
here and are deliberately not read: this worktree is instructed never to check
out `closeout/v1-final`, and reviewing a file from a branch that is not checked
out would be reviewing text without its context.

So: **before acting on "there are three pending migrations", confirm which
branch you are on.** A merge from either of those branches changes the answer,
and this document would then be describing a subset.

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
| 5 | **Eight jobs fire in the same minute at the worst instant**, and 1036 firings a day. See 1.3.1 for the computed schedule. | Low to **Medium** | Not a correctness issue, but larger than first estimated and worth one minute of staggering. |

### 1.3.1 The collision schedule, computed

Risk 5 originally said "on the hour, five jobs fire together". That was an
estimate. Simulated minute by minute over a full day from the twelve cron
expressions:

| Day | Firings per day | Peak minute | Jobs in that minute |
|---|---|---|---|
| Ordinary (15th, Monday) | **1036** | **04:00** | **7** |
| Worst case (1st, Friday) | **1038** | **04:00** | **8** |

At 04:00 on the 1st of a month that falls on a Friday:

```
notifications  health  invoices  stock  stranded-payments
abandoned-cart reconcile  weekly-digest
```

Seven of those eight are the routine `*/5` and `*/10` jobs colliding with the
two daily ones; `weekly-digest` (`0 4 * * 5`) and `retention` (`0 5 1 * *`) are
what make the first-Friday case worse.

**Why this is worth a line rather than a shrug.** Each job is an HTTP POST with a
55 second timeout, so eight simultaneous requests hold up to eight connections
against the app for up to 55 seconds each. Combined with **risk 1** (pg_net is
fire-and-forget, so failures record as successes), a thundering-herd timeout at
04:00 would leave no trace in `cron.job_run_details` at all.

**The fix is one minute of arithmetic and costs nothing.** `reconcile` at
`0 4 * * *` and `weekly-digest` at `0 4 * * 5` both sit exactly on the hour,
where the `*/5` and `*/10` jobs always are. Moving them to `7 4 * * *` and
`23 4 * * 5` drops the peak from 8 to 5 without changing any job's cadence.

Not a defect and not a blocker. Recorded because 162 is the approved migration,
the change is trivial, and the alternative is discovering it from a latency
graph at four in the morning.

### 1.3a Risk 1 is unmitigated, checked rather than assumed

Risk 1 says nothing reads pg_net's responses back. Verified across the whole
repository: **no `.ts`, `.sql` or `.mjs` outside 162 itself and its preflight
reads `net._http_response` or `cron.job_run_details`.** The only other mention
is a commented-out example query in `supabase/schedules/analytics_cron.sql`.

There **is** a `scheduler` health check (`src/lib/health/checks.ts:239`, surfaced
by `/api/cron/health`), and it is worth knowing exactly how far it goes:

```
configured = Boolean(env.CRON_SECRET)
status     = configured ? 'ok' : 'not_configured'
detail     = 'אין CRON_SECRET; כל ה-cron מחזיר 401 ואף תור לא מתנקז'
```

It checks that the **secret is set**. It does not check that a job ran, that
pg_net delivered, or that any response was a 2xx. So a deployment with
`CRON_SECRET` present and every one of the twelve jobs POSTing into a dead host
reports `scheduler: ok`.

Its `not_configured` message is accurate and useful in the other direction: no
secret means every cron returns 401 and **no queue drains**, which matches the
fail-closed `bearerMatches` behaviour in section 1.2.

Risk 1 therefore stands at **High**, and the gap is specific: something must read
`net._http_response` and alarm on non-2xx. Until it does, "the crons are green"
means the scheduler fired and the secret exists.

### 1.3b 162 routes network jobs through pg_cron, against the documented split

`supabase/schedules/analytics_cron.sql` is a second pg_cron file, deliberately
kept out of `supabase/migrations/` because "schedules are environment state, not
schema". It states the project's cron split, citing
`ARCHITECTURE-ANALYTICS-BI.md` section 8:

```
pg_cron      -> pure in-database SQL: rollup, matviews, partitions, purges
Vercel cron  -> anything that talks to the network: alerts, digest emails
```

**Migration 162 puts twelve `net.http_post` jobs on pg_cron.** Every one of them
talks to the network, which the split assigns to Vercel cron.

This is not an oversight. `STATE.md` records that the Vercel project is gone and
`vercel.json` declares no crons, so there is no Vercel cron to schedule on; 162
is the workaround for its absence. But the review should say plainly what the
workaround costs, and risk 1 is exactly that cost: Vercel cron surfaces a
non-2xx as a failed invocation in its own dashboard, and pg_net does not surface
it anywhere.

So the two files now describe two different cron models, and only one of them is
written down as the architecture. Whichever survives, they should not both
remain as the description.

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

### 2.4a What `fn_ingest_analytics_events` returns, and what it cannot tell you

Section 2.4 risk 2 notes that `v_inserted` overcounts because it increments past
`ON CONFLICT DO NOTHING`. Traced fully, the return value is less informative
than that even:

```
unknown name   ->  CONTINUE          not counted
known name     ->  INSERT ... ON CONFLICT (event_id) DO NOTHING
                   v_inserted := v_inserted + 1     counted either way
```

So the integer returned is **"events whose name was on the whitelist"**. It is
not "rows written", and it is not "events received".

| Batch of 20 | Returns | Reality |
|---|---|---|
| all names known, all new | 20 | 20 rows written |
| all names known, all duplicates | **20** | **0 rows written** |
| 10 known, 10 unknown | **10** | 10 written, **10 discarded silently** |
| all names unknown | 0 | nothing written, nothing said |

The third row is the one that matters, and it is exactly today's situation: the
client sends a mixed batch, the four server event names are not on the list, and
the caller receives a number that looks like a partial success. **Nothing in the
response distinguishes "you sent 10 events" from "you sent 20 and I threw half
away."**

#### This is the same anti-pattern three other files in this repository refuse

`docs/SEO-PLAN.md` 5.2.3 names the rule, reached independently in three layers:

| Where | Refuses to |
|---|---|
| `orFail` (query) | turn a failed read into an empty list |
| `membershipReadOrFail` (authorization) | turn an unreadable membership into "staffs nobody" |
| `cancellationNotice` (copy) | turn an unparseable date into "no date" |

`fn_ingest_analytics_events` does the thing all three refuse: it collapses
"discarded" into "fine". That is why the loss went unnoticed from migration 151
until it was found by probing, rather than being reported by the pipeline that
was losing the data.

#### It is not a reason to change 169

169's value is that it is **byte-identical to 151 except the name list**, which
is what makes it a five-minute review and a one-statement rollback. Widening the
list *and* changing the return contract in the same migration would forfeit
that, and the return value is not what is losing the events.

The right shape is a follow-up: return a row rather than an integer
(`accepted`, `skipped`, `written`), or raise on a skip once the whitelist is
believed complete. Recorded here so the option is not lost, and explicitly
**not** folded into 169.

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

### 3.5 The ten index-to-query claims, verified against the cited code

170 is unusually good about provenance: every index names the file and line
range of the query it claims to serve. That makes each claim falsifiable, so
this pass falsified them. Nine of ten hold exactly. One does not, and the reason
is precise enough to act on.

| # | Index | Cited path | Verdict |
|---|---|---|---|
| 1 | `(category_id, created_at DESC)` partial | `category-page.ts:380-392,413` | **holds**: `.eq('status','active')`, `.is('deleted_at',null)`, `.eq('category_id',…)`, `.order('created_at',desc)` |
| 2 | `(status, created_at DESC)` partial | `category-page.ts:337-339` | **holds**: same minus the category filter |
| 3 | `(category_id, kenyon_price)` partial | `category-page.ts:404-407` | **half**: see below |
| 4 | `(kenyon_price, created_at DESC)` partial | `category-page.ts:514-517` | **half**: same defect |
| 5 | `(category_id, name_he)` partial | `category-page.ts:410,520` | **holds**: `.order('name_he', asc)` |
| 6 | `(user_id, created_at DESC)` partial | `orders.ts:141-148` | **holds exactly**: `.eq('user_id')`, `.is('deleted_at',null)`, `.order('created_at',desc)`, `.limit(50)` |
| 7 | `(order_item_id, issued_at)` | `orders.ts:281-286` | holds |
| 8 | `(order_id, document_type, status)` | `orders.ts:403-411` | holds |
| 9 | `(session_id, profile_id)` | `cart.ts:205-209` | **holds exactly**: `.eq('session_id')`, `.is('profile_id',null)` |
| 10 | `(user_id, is_default DESC, created_at DESC)` partial | `account.ts:168-174` | holds |

#### Indexes 3 and 4 serve the ascending price sort and not the descending one

`products.kenyon_price` is **nullable** (`number | null` in
`src/types/database.ts`), and every price sort in the code passes
`nullsFirst: false`:

```
category-page.ts:404   .order('kenyon_price', { ascending: true,  nullsFirst: false })
category-page.ts:407   .order('kenyon_price', { ascending: false, nullsFirst: false })
category-page.ts:514   .order('kenyon_price', { ascending: true,  nullsFirst: false })
category-page.ts:517   .order('kenyon_price', { ascending: false, nullsFirst: false })
```

A plain btree index column is `ASC NULLS LAST`. So:

| Query | Wants | Index gives | Match |
|---|---|---|---|
| ascending price | `ASC NULLS LAST` | forward scan: `ASC NULLS LAST` | **yes** |
| descending price | `DESC NULLS LAST` | backward scan: `DESC NULLS FIRST` | **no** |

The descending sort cannot take its ordering from these indexes. The planner can
still use them to *filter*, then adds an explicit sort on top, which is most of
what the index was meant to avoid on a large category.

Serving both directions needs the null ordering declared on the index:

```
... ON public.products (category_id, kenyon_price DESC NULLS LAST) WHERE ...
```

as a second index, or `nullsFirst: true` on the descending query so a backward
scan matches. **The second option is a behaviour change** (products with no
price would sort to the top of "most expensive first"), so the index is the
safer of the two.

This is not a reason to hold 170. Eight of the ten indexes are unambiguously
right and the two half-cases are still an improvement on no index at all. It is
a reason not to record "price sort is now indexed" as done when only one of its
two directions is.

## 3a. The directory's own bookkeeping, cross-checked

`migrations/pending/README.md` carries the "APPLIED IN PRODUCTION" table, and
`migrations/applied/` carries the files. If those two disagree, every status in
this document is built on sand. They were compared.

| | Count |
|---|---|
| Files in `migrations/applied/` | 45 |
| Distinct migration numbers on disk | 41 |
| Numbers named in `README.md` | 49 |

A naive diff reports ten mismatches. **All ten are explainable and none is a
real discrepancy.** Each was opened rather than counted:

| Reported | Reality |
|---|---|
| `135` on disk, not in README | The files are `135a_product_type_recurring.sql` and `135b_recurring_subscriptions.sql`. The README names them with their letter suffix; a `(\d+)` capture drops it. Naming artefact. |
| `165` in README, not on disk | **Correct.** It was cancelled on 2026-09-04 and lives in `migrations/cancelled/165_revoke_anon_helpers.sql` with its preflight, exactly as `APPLY-ORDER.md` records. |
| `162`, `169`, `170` in README, not on disk | **Correct.** They are the three still pending. |
| `005`, `085`, `118`, `128`, `129` in README, not on disk | All five appear in **prose**, not in the applied table, and every one points at `supabase/migrations/` (the other lineage): "already holds `005_products_schema.sql`", "restore the prior body from `085_…`", "`118_search_intelligence.sql` grants it to…", "`128_wp_publish.sql` and `129_catalogue_cleanup.sql`". They are citations, not claims of application. |

**Result: zero real discrepancies.** The bookkeeping in this directory is
trustworthy, and the statuses in sections 1 to 3 rest on it safely.

That is a positive result and is recorded as one. A future audit that re-runs
the naive comparison will get the same ten hits; this table is here so it does
not spend its budget rediscovering that all ten are fine.

## 3b. The operator-facing document is stale, and the test cannot see it

Section 3a checked the *applied* bookkeeping and found it sound. This checks the
*pending* bookkeeping, and it is not.

**Three documents give three different answers to "what is pending".**

| Source | Says | Reality |
|---|---|---|
| `migrations/pending/APPLY-ORDER.md`, heading and table | **"ONE PENDING FILE — 162"**. Its table lists 162, 166, 167, 168 and never mentions 169 or 170 | wrong: 169 and 170 are absent entirely |
| `migrations/pending/README.md`, H2 heading | "two files pending — 162 (blocked on vault) and 169" | wrong count |
| `migrations/pending/README.md`, body | documents all three, including `### 170_composite_indexes_top_queries.sql — PENDING, not approved` | **correct** |
| the directory | `162`, `169`, `170` | **correct** |

### 3b.1 Why the body is right and the summaries are wrong

`src/__tests__/pending-migrations-inventory.test.ts` enforces the manifest in
**both directions**: every `.sql` on disk appears in `README.md`, and every
`.sql` the README names exists on disk. It also asserts `supabase/migrations/`
holds no `PENDING-` file, so the split location cannot come back.

That test is why the README's body is current: 170 could not be added to the
directory without being added to the manifest.

**Its blind spot is the prose above the manifest.** The test compares filenames
to filenames. A human-readable heading that says "two files pending" contains no
filename, so nothing checks it, and it has drifted one migration behind. The
same is true of `APPLY-ORDER.md`, which the test does not read at all.

### 3b.2 Why this one matters more than a stale heading usually does

`APPLY-ORDER.md` is the **operator-facing** file. It is what someone opens
before applying anything, and its own first line is "Nothing here is applied by
an agent. Each file goes to production through MCP `apply_migration`, one at a
time, after Ofir approves it."

So the document that exists to tell an operator what to apply, and in what
order, currently tells them there is one pending migration when there are three,
and does not mention two of them at all. An operator who trusts it applies 162,
sees the vault blocker, and stops, never learning that 169 is sitting there
discarding four funnel events.

This does not change any verdict in sections 1 to 3: those were read from the
`.sql` files themselves, not from the summaries. It changes who can be trusted
to route the work.

### 3b.3 The cheap fix, and the durable one

- **Cheap:** update the `APPLY-ORDER.md` heading and table to carry 169 and 170,
  and correct the README's H2 to three.
- **Durable:** extend `pending-migrations-inventory.test.ts` to assert that both
  summary lines agree with the directory count. It already reads the directory
  and the README; comparing a count to a number in a heading is a small
  addition, and it is the only thing that stops this drifting again.

Both are out of scope here (one is `.md` in a directory this document only
reads, the other is `.ts`), so they are recorded rather than made.

## 3c. The cancelled file, and why it must stay cancelled

`migrations/cancelled/` holds one migration and its preflight:

```
165_revoke_anon_helpers.sql
preflight_165.sql
```

Section 0 calls the directory out of scope. That was right for its contents and
wrong for its lesson, because **165 is the kind of change someone will propose
again.** "Revoke `anon` EXECUTE on `is_admin()`" reads as obvious hardening. It
would take the storefront down.

### 3c.1 The mechanism

Eighteen RLS policies on public and anon-readable tables call `is_admin()` or
`is_supplier_member()` **inside their `USING` / `WITH CHECK`**:

```
product_images   coupon_deals   suppliers     seo_redirects
cashback_rules   categories     wallet_*      split_executions
escrow_holds     payments       carts         notification_outbox
```

**RLS quals run as the caller.** So revoking `anon`'s EXECUTE does not merely
stop anonymous users calling the helper directly, it makes every policy that
names the helper fail for them. Every anonymous `SELECT` on the public catalogue
returns `42501 permission denied for function`, and the site goes dark for
logged-out visitors, which is most of them.

`anon` EXECUTE on those two helpers is **by design**: both return `false` for a
caller with no `auth.uid()` (verified in section 7.4 of `docs/ROLE-MATRIX.md`),
and they appear in public policies precisely so a public policy can express
"admins additionally".

### 3c.2 The regression net, and its one blind spot

`src/db/__tests__/anon-catalog.test.ts` exists for this, and it is a **live**
test: it talks to the real project with the anon key only.

Its guard is:

```
const configured = Boolean(url && anonKey && !url.includes('<project-ref>'))
describe.skipIf(!configured)('the anonymous catalogue survives', ...)
```

So the net **silently skips** when `SUPABASE_ANON_KEY` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is not in the environment. A CI run without that
key reports green having asserted nothing.

That is a reasonable design for a test that needs a real database, and it means
"the anon-catalogue test passed" and "the anon catalogue was checked" are two
different statements. Before trusting it as the gate on any future revoke,
confirm it actually ran.

### 3c.3 The rule to carry forward

**Do not revoke `anon` EXECUTE from a function that appears in a policy on a
publicly readable table.** Check `pg_policies` for the function name first. The
same trap applies to any helper added later with the same shape, not only to
these two.

`164` remains deliberately unused. The number is kept stable because CLOSEOUT
section 8c named this file 165, and a stable reference in conversation beats a
dense sequence.

## 3d. `analytics_cron.sql`, and an ordering conflict with 162

Section 1.3b named `supabase/schedules/analytics_cron.sql` as the file stating
the cron split. It also schedules three jobs, so 162 is not the only thing that
would write to `cron.job`. Read as text here, because 162's fate is entangled
with it.

### 3d.1 What it schedules

| Job | Cron (UTC) | Command |
|---|---|---|
| `analytics_rollup_daily` | `10 23 * * *` | `fn_rollup_analytics_daily()` |
| `analytics_refresh_matviews` | `40 23 * * *` | `fn_refresh_analytics_matviews()` |
| `analytics_partitions_monthly` | `0 0 1 * *` | `fn_ensure_analytics_partitions(2)`, `fn_drop_old_analytics_partitions(13)` |

All three are **pure in-database SQL**. No `net.http_post`, no URL, no secret.
This file honours the split it documents; 162 is the one that departs from it.

Its partition job is ordered correctly and says so: create ahead **first**, then
drop beyond retention, "never leave the table without a home for an incoming
event".

### 3d.2 162's rollback cannot touch these, confirmed

Section 1.2 claimed the `ke-` prefix makes
`unschedule ... where jobname like 'ke-%'` safe "without touching a job somebody
else created". That was reasoning; here is the check. The three job names are
`analytics_rollup_daily`, `analytics_refresh_matviews`,
`analytics_partitions_monthly`. **None begins with `ke-`.** The rollback is safe
against the only other scheduler file in the repository.

### 3d.3 The conflict: the rollup would run *before* the expiry sweep

`analytics_rollup_daily` carries an explicit ordering requirement:

> Yesterday's rollup. 23:10 UTC = 02:10 Israel (winter), after the coupon expiry
> sweep at 01:50 so expired coupons are already in their final state.

**162 schedules `ke-expire-vouchers` at `15 23 * * *`, which is 23:15 UTC.**

| Job | UTC | Israel (+2) | Israel (+3) |
|---|---|---|---|
| `analytics_rollup_daily` | **23:10** | 01:10 | 02:10 |
| `ke-expire-vouchers` | **23:15** | 01:15 | 02:15 |
| `analytics_refresh_matviews` | 23:40 | 01:40 | 02:40 |

The rollup runs **five minutes before** the expiry sweep, not after it. Its own
invariant, that expired coupons are already in their final state when the day is
rolled up, is inverted. Yesterday's figures would be computed against coupons
that expire minutes later and land in the next day's rollup, or in none.

Two further notes on the same comment:

- It says the expiry sweep is "at 01:50". Nothing in 162 runs at 01:50 in either
  offset. The comment describes a schedule that is not the one 162 proposes, so
  it predates 162 or refers to something else.
- Its "= 02:10 Israel (winter)" is the **summer** offset. Israel winter is UTC+2,
  giving 01:10. Minor, and it means the comment's own arithmetic should not be
  used to reason about ordering.

### 3d.4 It is a conflict on paper, not yet in production

`preflight_162.sql` block 2 counts `cron.job` and reports `foreign_jobs`, jobs
not matching `ke-%`. `APPLY-ORDER.md` records that block passing on 2026-09-04
with **`cron.job` empty**. So `analytics_cron.sql` has not been applied either,
and the two schedules have never coexisted.

That makes this cheap to settle and easy to miss: whichever is applied second
will silently invert or restore the ordering, and **preflight 162 block 2 is the
only place it would surface** as a non-zero `foreign_jobs` count.

**Recommendation:** decide the order before either is applied. Moving
`analytics_rollup_daily` later (or `ke-expire-vouchers` earlier) is a one-line
change in whichever file is applied second. Doing nothing means the rollup's
stated precondition is false from the first night both are live.

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

## 4.3 The cancelled one, and why it belongs in a review of the pending ones

`migrations/cancelled/165_revoke_anon_helpers.sql` is out of scope by folder and
in scope by lesson. It was written, reasoned, preflighted and **cancelled on
2026-09-04**, and its header is the most useful thing in the migrations tree for
anyone about to write a `REVOKE`.

**What it would have done.** Revoke `EXECUTE` on `is_admin()` and
`is_supplier_member(uuid)` from `anon`. The argument was sound on its face:
neither function has business answering an anonymous caller, both are a constant
`false` for a caller with no uid, and a `SECURITY DEFINER` function is surface
worth shrinking.

**Why it would have taken the storefront down.** Eighteen RLS policies on
public, anon-readable tables call one of those two helpers inside their
`USING` / `WITH CHECK`:

```
product_images   coupon_deals   suppliers      seo_redirects
cashback_rules   categories     wallet_*       split_executions
escrow_holds     payments       carts          notification_outbox
```

**RLS quals run as the caller.** So revoking `EXECUTE` from `anon` turns every
anonymous `SELECT` on the public catalogue into `42501 permission denied for
function`. Not a degraded page: the whole storefront goes dark for every
logged-out visitor, which is nearly all of them.

`anon` `EXECUTE` on these helpers is therefore **by design**, not an oversight.

### Four rules this yields for any future migration

1. **A `REVOKE` is not a local change.** Grep every RLS policy for the function
   name before revoking `EXECUTE` on it. A permission a policy depends on is
   part of the read path, not part of the attack surface.
2. **"Returns false for anon" is not "unused by anon".** The helper being inert
   for an anonymous caller is exactly why policies can call it unconditionally.
   Inertness is the feature.
3. **The generated types are the authority on production, not the file chain.**
   165's own signature note records that CLOSEOUT wrote
   `is_supplier_member()` while production's types say
   `is_supplier_member(p_supplier_id uuid)`, and that the types win because
   `supabase/migrations/` is a different lineage. This is the same caution as
   3.2.1: **the files do not describe the live schema.**
4. **Cancel by moving, not by deleting.** The file survives with a
   `MUST NEVER BE APPLIED` banner and its original header kept unchanged below
   the cancellation note. A deleted file takes its reasoning with it, and the
   next person writes it again.

### It has a live regression net

`src/db/__tests__/anon-catalog.test.ts` exists so that this specific failure
cannot return silently. `APPLY-ORDER.md` records it passing 14/14 after the
166 to 168 batch. Any future change to those helpers or their grants should be
run against it first.

### Relevance to the three pending files

None of 162, 169 or 170 revokes anything, so none carries this risk directly.
The one adjacent point is **169**: it is a `CREATE OR REPLACE` on a
`SECURITY DEFINER` function whose grants are `service_role` only, and
`preflight_169` block 3 asserts exactly that. Keep that assertion. If
`fn_ingest_analytics_events` were ever granted to `authenticated`, its
`p_user_id` argument would become caller-controlled, which is the same family
of defect 165's header names as already proven in this project.

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
| 2026-09-07 | Pass 17: reviewed analytics_cron.sql. It honours the cron split, its names cannot be hit by 162 rollback, and its rollup would run five minutes BEFORE 162 expire-vouchers, inverting its own stated precondition |
| 2026-09-07 | Pass 18: traced what fn_ingest_analytics_events actually returns. It counts whitelisted names, so a mixed batch reads as partial success and the discard is invisible. Same anti-pattern three other files refuse |
