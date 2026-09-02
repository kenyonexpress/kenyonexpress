# Failure Modes

Every way this system can fail, ordered by **likelihood × impact**.

`docs/RUNBOOK.md` tells you what to do during an incident. `docs/INCIDENT-PLAYBOOKS.md`
walks six named incidents step by step. **This document is the catalogue**: it
exists so that you can find a failure by its symptom before you know its name,
and so that the ones which are already certain are not buried among the ones
which are merely possible.

Read on **2026-09-01** against `main` and the live project `ixvwfbuvfxxsjiywhbbb`.

---

## 0. How to read the ranking

**Likelihood** is what it says. Four of the entries below are at *certainty* —
they are not risks, they are the current state, and they are ranked first for
that reason alone.

| | Meaning |
|---|---|
| **Certain** | True right now. Not a prediction. |
| High | Expected within the first weeks of real traffic. |
| Medium | Plausible; has happened in systems shaped like this one. |
| Low | Needs an unusual combination or an outside actor. |

**Impact** is measured in what a customer loses, then what the business loses,
then what an engineer loses. Money that leaves and does not come back outranks
everything.

**Every entry has the same four fields**, because during an incident you are
matching a symptom, not reading prose:

> **What the user sees** · **What the logs show** · **What to do** · **Why it
> happens**

---

## 1. The ranking

| # | Failure | Likelihood | Impact | § |
|---|---|---|---|---|
| 0 | **There is no deployment at all** | **Certain** | **Critical** | §2.0 |
| 1 | Nothing scheduled runs | **Certain** | **Critical** | §2.1 |
| 2 | The first real payment raises `42703` | **Certain** | **Critical** | §2.2 |
| 3 | No browser has ever tested a change in CI | **Certain** | High | §2.3 |
| 4 | `src/types/database.ts` is five weeks stale | **Certain** | Medium | §2.4 |
| 5 | Search has no typo tolerance, synonyms or facets | **Certain** | Medium | §2.5 |
| 6 | Two tabs, two charges, one customer | High | **Critical** | §3.1 |
| 7 | Search index drifts from the catalogue | High | Medium | §3.2 |
| 8 | A customer paid and has no order | Medium | **Critical** | §4.1 |
| 9 | Cardcom is down or rejecting | Medium | **Critical** | §4.2 |
| 10 | Amount mismatch between callback and verify | Medium | **Critical** | §4.3 |
| 11 | A voucher is redeemed twice | Medium | High | §4.4 |
| 12 | An RLS policy regresses silently | Medium | **Critical** | §4.5 |
| 13 | The audit log is edited | Medium | High | §4.6 |
| 14 | Rate limiting is weaker than believed | Medium | Medium | §4.7 |
| 15 | A bad deploy | Medium | High | §4.8 |
| 16 | An illegal status transition is attempted | Medium | Low | §4.9 |
| 17 | The service-role key leaks | Low | **Catastrophic** | §5.1 |
| 18 | `CARDCOM_SANDBOX=true` in production | Low | **Catastrophic** | §5.2 |
| 19 | A secret is rotated badly | Low | High | §5.3 |
| 20 | The database is at capacity | Low | **Critical** | §5.4 |
| 21 | A refund is issued after redemption | Low | High | §5.5 |

---

## 2. Certain. These are the current state.

### 2.0 There is no deployment at all

**What the user sees.** Nothing. There is no site to visit.

**What the logs show.** Nothing from the application, because it has never run
anywhere but a laptop. The evidence is in Vercel: **11 deployments, all
`ERROR`**, including the only one ever marked `target: production`.

**What to do.** In the Vercel dashboard, relink the project to
`kenyonexpress/kenyonexpress`, clear the Root Directory so it is the repository
root, and let `vercel.json` supply `installCommand` and `buildCommand`. Then
deploy and read the log rather than assuming.

**Why it happens.** The single Vercel project, `kenyonexpress-web`, is connected
to a **different GitHub repository** — `kenyonexpress/kenyonexpress-web`,
private, last pushed 2026-05-29. This repository is
`kenyonexpress/kenyonexpress`. Merging here deploys nothing and opens no
preview.

The last failure names three faults at once, each of which this project has
already written down as a rule:

```
./kenyonexpress/next.config.ts        a NESTED kenyonexpress/ directory
Cannot find module 'next-intl/plugin'
Command "npm run build" exited with 1  npm, in a repo where npm install cannot work
```

**This outranks every other entry on this page**, because most of them describe
a production system misbehaving and there is no production system.
`docs/THIRD-PARTY-DEPENDENCIES.md` §0.

### 2.1 Nothing scheduled runs

**What the user sees.** They complete a purchase and **never receive their
voucher email**. Vouchers that should have expired stay redeemable. Expiry
warnings never arrive. Invoices are never issued.

**What the logs show.** Nothing. That is the whole difficulty: a job that is
never invoked writes no line, so the absence of `vouchers.expire_failed` reads
identically to success. The only positive signal is what is *missing* —
`invoices.issued` never appears, `reconcile.gaps_found` never appears.

**What to do.** Drive the routes by hand until a scheduler exists:

```bash
for job in notifications expire-vouchers invoices reconcile stranded-payments; do
  echo "== $job"
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
       "https://<host>/api/cron/$job" | jq -c
done
```

Run `notifications` **first** if customers are waiting on vouchers.

**The fix is written and unmerged.** PR **#16**,
`feat(cron): מתזמן GitHub Actions לעשרת ה-jobs`, has been open against `main`
since **2026-08-31**. Before building a scheduler, review that.

**Why it happens.** The ten cron routes were deliberately removed from
`vercel.json`. Vercel's cron allowance is a plan feature — on Hobby, two jobs at
daily granularity — and this project needs ten, four of them at five- or
ten-minute intervals. Declaring all ten anyway **does not fail the build and
does not warn**: the platform runs what the plan covers and silently ignores the
rest. Removing them was the honest choice, because a payment reconciler believed
to be running and not running is worse than one known to be absent.

Full detail: `docs/RUNBOOK.md` §2, `docs/OPERATIONS-CALENDAR.md`,
`docs/CRON-EXTERNAL.md`.

### 2.2 The first real payment raises `42703`

**What the user sees.** They are charged by Cardcom and **the order never
completes**. From their side: money gone, no confirmation, no voucher.

**What the logs show.** `42703 undefined_column` from
`src/server/payments/finalize.ts`, and no `finalize_succeeded` row in
`payment_events`. The `payments` row will be `succeeded` — the charge was
real — while `orders.status` is still `pending`.

**What to do.** This is §4.1's shape, so follow `docs/RUNBOOK.md` §3. The
underlying fix is a code change and is outside the documentation branch.

**Why it happens.** Four column names are written as literals rather than read
through the generation probe in `src/lib/commerce/order-money-columns.ts`:

| Selected | Production has |
|---|---|
| `orders.cashback_applied_agorot` (`finalize.ts:411`) | `orders.cashback_applied_ils` |
| `order_items.unit_price_agorot` (`finalize.ts:431`, `queries/orders.ts:215`) | `order_items.unit_price_ils_agorot` |
| `order_items.total_price_agorot` (`queries/orders.ts:215`) | `order_items.total_price_ils_agorot` |

Re-verified against `information_schema` on 2026-09-01. This is the highest
priority defect in the system and it is on the money path.

### 2.3 No browser has ever tested a change in CI

**What the user sees.** Eventually: a page that does not render, a button that
does nothing, a checkout that cannot be completed — shipped through a fully
green pipeline.

**What the logs show.** Nothing in CI. Both Playwright jobs report **skipped**,
with a GitHub warning annotation, not a failure.

**What to do.** Load your own change in a browser before merging. If it touches
checkout, drive the flow. Treat "CI is green" as meaning *lint, types, unit
tests and build*, and nothing else.

**Why it happens.** Both E2E jobs are gated on the `CI_SUPABASE_URL` secret,
which is unset. That secret is this repository's switch for "CI may touch a
database", and **the only database available today is production**. The `e2e`
job's first step is `pnpm seed:test`, which *writes* fixture users and catalogue
rows. Setting the secret against production would seed production. The gate is
correct; the consequence is a real gap.

### 2.4 `src/types/database.ts` is five weeks stale

**What the user sees.** Nothing directly. This one bites engineers.

**What the logs show.** `db.optional_column_missing`, or a `42703` at runtime
for a column TypeScript was perfectly happy about.

**What to do.**

```bash
pnpm db:types
```

**Why it happens.** Last regenerated **2026-07-28**. It describes **33 tables**;
production has **61**. Absent entirely: `refunds`, `payment_events`,
`search_index_outbox`, `supplier_branches`, `subscriptions`,
`subscription_charges`, `homepage_sections`, `banners`, `invoices`,
`stock_reservations`, `gift_vouchers`, `push_tokens`, and the `refund_state` and
`refund_ground` enums.

It is still a far better guide than `supabase/migrations/`, which describes a
different lineage. But it is a photograph, not a mirror.

### 2.5 Search has no typo tolerance, synonyms or facets

**What the user sees.** A search that works but is dumb. One typo returns
nothing. No facets in the sidebar. No "did you mean".

**What the logs show.** Nothing — this is a supported fallback, not an error.

**What to do.** Either provision Meilisearch or accept it knowingly. **Do not
treat it as a bug**; the fallback is a working search.

**Why it happens.** `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are unset in
production, so search falls back to a Postgres `ILIKE`. Nothing in the UI says
so, which is the part worth fixing regardless of the decision.

---

## 3. High likelihood

### 3.1 Two tabs, two charges, one customer

**What the user sees.** Charged twice. Two valid orders, two sets of vouchers,
one intent.

**What the logs show.** Two `checkout.*` sequences with **different
`client_ref`** values, both reaching `finalize_succeeded`. Nothing is logged as
an error, because nothing errored.

**What to do.** Detect it in the daily reconciliation, then refund one order
manually. There is no automatic defence.

**Why it happens.** Checkout is idempotent on `client_ref`
(`checkout.ts:327`), which catches a double click. It cannot catch two tabs,
because two tabs produce two different `client_ref` values and therefore two
genuinely distinct intents as far as the code can tell.

The obvious fix is a partial unique index:

```sql
create unique index orders_one_open_per_user_idx
  on public.orders (user_id)
  where status = 'pending' and deleted_at is null;
```

**It is deliberately not written as a migration.** It would also block a
legitimate case — a customer who abandons an order and starts a new one before
the reaper clears it — so it needs a code change that cancels the pending order
first. The recorded decision is: *measure how often this actually happens before
building for it.*

### 3.2 The search index drifts from the catalogue

**What the user sees.** A product that exists but cannot be found, or a search
result for a product that was deleted.

**What the logs show.** `search.index_job_failed`, `search.dlq_insert_failed`,
`search.webhook_enqueue_failed`. Rows accumulating in `search_index_outbox`.

**What to do.** `docs/RUNBOOK.md` §6 and `docs/INCIDENT-PLAYBOOKS.md` Playbook 4.

**Why it happens.** Indexing is asynchronous by design: a trigger
(`products_enqueue_search_index`) writes to an outbox, and a job drains it. Any
asynchronous pipeline drifts when its drain stops — and the drain is one of the
ten cron routes that nothing is calling (§2.1). **These two failures compound.**

---

## 4. Medium likelihood

### 4.1 A customer paid and has no order

**What the user sees.** Charged, no confirmation, no voucher. The single worst
experience this system can produce.

**What the logs show.** In `payment_events`: `callback_received` and
`verify_succeeded` present, `finalize_succeeded` absent. Possibly
`finalize_failed`. The `payments` row is `succeeded`; `orders.status` is
`pending`.

**What to do.** `docs/RUNBOOK.md` §3, then `docs/INCIDENT-PLAYBOOKS.md`
Playbook 2. `finalizeOrder` is idempotent — it checks `paid_at` and returns
`{ ok: true, replay: true }` — so replaying it is safe. Repeatedly.

**Why it happens.** `finalize` is not one transaction. A voucher issued and a
line updated stay done; `orders.status` stays `pending` if the run died before
its step. Everything downstream was built to make the replay safe: the voucher
count cap, `vouchers UNIQUE(code)`, and a `from`-state condition on every
`UPDATE`.

Right now, §2.2 guarantees this happens on the very first payment.

### 4.2 Cardcom is down or rejecting

**What the user sees.** The payment iframe fails to load, or the card is
declined with a message that is not about their card.

**What the logs show.** `payments.verify_failed`, `reconcile.terminal_unreachable`.
In `payment_events`: `low_profile_failed`, `callback_provider_failure`,
`verify_failed`.

**What to do.** `docs/INCIDENT-PLAYBOOKS.md` Playbook 1. Nothing is lost while
Cardcom is down — no charge means no order — so the correct response is to stop
taking checkouts rather than to retry into a wall.

**Why it happens.** It is a third party. See
`docs/THIRD-PARTY-DEPENDENCIES.md`.

### 4.3 Amount mismatch between callback and verify

**What the user sees.** Nothing. The order does not complete.

**What the logs show.** `payment_events` rows of type `amount_mismatch`,
`verify_contradicted_callback` or `amount_unreadable`. These four event types
exist *specifically* to record disagreement between sources and are the first
thing to search when a payment is disputed.

**What to do.** Do not finalize. The `GetLpResult` re-fetch is the authority;
the callback body is a notification. Investigate before touching the order.

**Why it happens.** Either a genuine provider inconsistency or someone forging a
callback. The design assumes the second: the body is never trusted for money.

### 4.4 A voucher is redeemed twice

**What the user sees.** A business honours a voucher that was already consumed
elsewhere, and eats the cost.

**What the logs show.** Two `voucher_redemptions` rows for one voucher with
outcome `success`. In normal operation the second is `already_redeemed`.

**What to do.** Compare `vouchers.redeemed_at` against `voucher_redemptions`.
That table records **every** scan including failures, with IP and user agent, so
it can answer who and when.

**Why it happens, and the honest limit.** The application defence is a single
atomic `UPDATE ... WHERE status = 'issued'`, which is airtight against a race.
**There is no database guard on `vouchers`** — migration 137 covered `orders`,
`order_items` and `payments`, not this table. So a direct `service_role`
statement, a repair script, or an admin tool writing outside `redeem_voucher()`
can set a voucher back to `issued`, and nothing refuses.

### 4.5 An RLS policy regresses silently

**What the user sees.** Nothing, until someone reads another customer's order.

**What the logs show.** Nothing. A successful unauthorised read is a successful
read.

**What to do.** There is no detection today. The mitigation is review discipline
on any migration touching policies.

**Why it happens, and why it is ranked this high.** The security of this system
rests almost entirely on **133 RLS policies**, and `authenticated` holds DML on
**56 relations**, so RLS is the only layer standing between a logged-in user and
those tables. **Not one policy is verified by a test that attempts the attack.**
Policies are asserted by reading them. A regression would be invisible to CI,
invisible in logs, and visible only to whoever found it.

This is the largest untested surface in the system. `docs/TESTING.md` §7,
`docs/SECURITY-POSTURE.md` gap 2.

### 4.6 The audit log is edited

**What the user sees.** Nothing.

**What the logs show.** Nothing — that is the point.

**What to do.** Cross-check `audit_log` against `payment_events`, which **is**
append-only (enforced by the `payment_events_append_only` trigger) and refuses
`UPDATE` and `DELETE`. Where the two disagree, believe `payment_events`.

**Why it happens.** `audit_log` carries **zero triggers**. Nothing blocks
`UPDATE` or `DELETE`. A log that can be edited is a statement, not evidence.

A second, quieter problem in the same table: `refund.ts:325` writes
`actor_id: null, actor_role: 'admin'` while `requireAdminSession()` knows
exactly who it is. The log says "some admin", which is the one question a log
exists to answer. The ten modules under `src/server/actions/admin/` go through
`writeAuditLog` and do record the actor, plus IP and user agent.

### 4.7 Rate limiting is weaker than believed

**What the user sees.** Nothing, unless someone is abusing an endpoint.

**What the logs show.** `rate_limit.upstash_failed`,
`rate_limit.upstash_unreadable`, `rate_limit.check_failed`, and
**`rate_limit.open`** — the last one meaning the limiter let a request through
because it could not decide.

**What to do.** Decide whether Upstash is being provisioned. If not, the
Postgres path is what you have; know that, rather than assuming Redis.

**Why it happens.** `UPSTASH_REDIS_REST_URL` and `_TOKEN` are optional on
purpose (`src/lib/env.ts:41`) and no environment sets them. The limiter falls
back to the Postgres `check_rate_limit` the app shipped with. **Both must be set
for the Upstash path to engage**; either alone is treated as absent, so a
half-finished configuration degrades rather than failing every request.

### 4.8 A bad deploy

**What the user sees.** Whatever the bad code does.

**What the logs show.** `render.failed`, `request.failed`, a jump in Sentry
volume against the new `SENTRY_RELEASE`.

**What to do.** `docs/INCIDENT-PLAYBOOKS.md` Playbook 5 and `docs/RUNBOOK.md`
§5.1. Application rollback is a Vercel redeploy of the previous build.

**Why it matters more here than usual.** `pnpm build` is a **separate gate**:
`cacheComponents` rejects uncached page reads that tests, `tsc` and Biome all
pass. And no browser tested the change (§2.3).

### 4.9 An illegal status transition is attempted

**What the user sees.** An operation that fails with a database error.

**What the logs show.** `23514`, with a message naming both ends:
`illegal order_items.settlement_status transition: paid -> escrow_held`.

**What to do.** Read the message. It tells you exactly which move was refused,
which is the whole reason the guard raises with both ends rather than a bare
constraint name. Check the move against `docs/PAYMENT-FLOW.md` §2.1.

**Note the ambiguity on a voucher scan.** `23514` there has two possible
sources — a conservation CHECK, or the transition guard — and they read alike at
a glance. `docs/RUNBOOK.md` §4.3 separates them. **A `23514` naming
`paid -> redeemed` means the guard in the database is not the version that
shipped**, because the applied guard permits it.

**Why it happens.** Usually a repair script or an admin tool writing a state the
model does not admit. That is the guard doing its job.

---

## 5. Low likelihood, high impact

### 5.1 The service-role key leaks

**What the user sees.** Eventually, everything.

**What the logs show.** `supabase.admin_key_invalid` if the key is rotated out
from under a running process. The leak itself logs nothing.

**What to do.** `docs/INCIDENT-PLAYBOOKS.md` Playbook 6, immediately, and
escalate.

**Why it is ranked low but kept here.** The service role **bypasses RLS
entirely** and bypasses the profile privilege trigger by design. It is the one
credential for which there is no second layer.

One structural defence exists and is worth knowing: `src/lib/env.ts:100-110`
refuses to boot if any `NEXT_PUBLIC_*` variable name matches
`SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY`, because a secret with that
prefix is inlined into the client bundle — a leak that already happened at build
time.

### 5.2 `CARDCOM_SANDBOX=true` in production

**What the user sees.** A shop that looks completely healthy. Orders complete,
vouchers issue, confirmations send. **Customers are charged nothing and the
money never arrives anywhere.**

**What the logs show.** Nothing. Every path succeeds.

**What to do.** It cannot reach production: `src/lib/env.ts:88-90` fails the
boot. This entry exists because the failure mode is silent, and because that
boot check is the single reason it is not ranked far higher.

```ts
if (e.CARDCOM_SANDBOX === 'true') {
  fail('CARDCOM_SANDBOX must not be true in production')
}
```

**One caveat.** `ALLOW_INCOMPLETE_ENV=true` returns from the production checks
*before* they run. It is intended for a local `pnpm start` — which is also
`NODE_ENV=production` — and Vercel never sets it. Setting it there would be an
explicit act, and it logs `env.checks_skipped` at boot when it happens.

### 5.3 A secret is rotated badly

**What the user sees.** Callbacks rejected, so paid orders do not complete
(§4.1's shape), or QR codes that no longer verify.

**What the logs show.** `cardcom.webhook_unauthenticated`, or
`voucher.redeem_rpc_failed` on scans.

**What to do.** Both secrets that matter support a retiring value —
`CARDCOM_WEBHOOK_SECRET_PREVIOUS` and `VOUCHER_QR_SECRET_PREVIOUS`. **Set the
previous value before removing the old one**, not after.

**Why it happens.** Rotating in one step invalidates every voucher signed with
the old key and every callback in flight.

### 5.4 The database is at capacity

**What the user sees.** Timeouts everywhere.

**What the logs show.** `*_read_failed` across unrelated modules at once —
`checkout.product_read_failed`, `supplier.orders_query_failed`,
`homepage.cms_read_failed`. The breadth is the signal: one module failing is a
bug, all of them failing is infrastructure.

**What to do.** `docs/INCIDENT-PLAYBOOKS.md` Playbook 3.

### 5.5 A refund is issued after redemption

**What the user sees.** Nothing wrong. The business is the one that loses.

**What the logs show.** `refund.persist_failed`, or a completed refund on an
order whose vouchers are `redeemed`.

**What to do.** Recover through a payout adjustment, not by reversing the
voucher.

**Why it is unlikely.** `planOrderRefund` filters consumed vouchers and blocks
the plan, `describeRefundBlockers` shows the admin a Hebrew explanation, and
`refunds_completed_has_money` constrains the row. The residual risk is a manual
refund taken directly at the Cardcom terminal, outside this system entirely.

---

## 6. What is *not* on this list, and why

| Not listed | Because |
|---|---|
| A webhook delivered five times | Handled. Dedup on `(provider, external_event_id)`; `23505` means replay, answers 200, does nothing. |
| A double click on "pay" | Handled. Idempotent on `client_ref`. |
| Two simultaneous refund requests | Handled. Every status `UPDATE` carries a `from` condition, so the second updates zero rows. |
| Two simultaneous scans of one voucher | Handled. One atomic `UPDATE ... WHERE status = 'issued'`. |
| Stock consumed on a failed payment | Cannot happen. `consume_order_stock` is called only inside `finalizeOrder`, after verification. Before that there is only a 15-minute reservation, which expires on its own. |
| A voucher expiring between payment and issue | Cannot happen. `expires_at` is computed at issue time from `issued_at + coupon_expiry_days`, not from the order. |
| A supplier enumerating another's voucher codes | Handled. `not_found` and `wrong_supplier` return identically. |
| Rounding disagreement between the two halves of a split | Cannot happen. The supplier residual is `face − fee`, never a second percentage on the same base. |

**A handled failure is not an absent one.** Each row above is handled by exactly
one mechanism, named. If that mechanism is removed, the row moves to §4.
