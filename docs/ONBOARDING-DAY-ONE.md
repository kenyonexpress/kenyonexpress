# Onboarding: Day One, Hour by Hour

Clone to first merged pull request, in one working day.

`docs/ONBOARDING.md` is the reference: prerequisites, environment, conventions.
**This document is the schedule.** It assumes you have a laptop, a GitHub
account with push access, and nothing else. Every hour ends with something you
can check, so you know whether you are on track before the day is over.

Written against `main` on **2026-09-01**.

> **The single most valuable thing on this page** is §2.4. Four traps in this
> repository each cost a previous person more than an hour, none of them
> announces itself, and all four are avoidable if you read them before you hit
> them rather than after.

---

## The shape of the day

| | Hours | What you end with |
|---|---|---|
| **Block A** | 0:00 – 1:30 | The app running on `localhost:3000` |
| **Block B** | 1:30 – 3:00 | You can explain where money is calculated |
| **Block C** | 3:00 – 4:00 | Green gates on an unchanged tree |
| *lunch* | | |
| **Block D** | 4:00 – 6:00 | A branch with one real change and a passing gate |
| **Block E** | 6:00 – 7:00 | A pull request with green CI |
| **Block F** | 7:00 – 8:00 | Merged, and you know what happens next |

If Block A takes you three hours, that is not unusual and it is not your fault.
Skip Block B and go straight to C; the reading keeps, the setup does not.

---

## Block A — 0:00 to 1:30. Running.

### A1. 0:00 – 0:15. Tools

```bash
node --version     # want 22
corepack enable
pnpm --version     # want 11.1.2
```

`packageManager` in `package.json` pins pnpm to **11.1.2**. `corepack enable`
makes your shell honour that pin instead of whatever pnpm you had.

> **`npm install` cannot work in this repo.** It dies with
> `npm error Cannot read properties of null (reading 'matches')`, which is not a
> cache problem and `npm cache clean --force` does not change it. The crash is
> inside npm's `buildIdealTree`, ahead of every lifecycle hook, so the repo
> cannot even replace the message with a helpful one. `ONBOARDING.md` §1 has the
> full trace. **Use `pnpm`.**

### A2. 0:15 – 0:30. Clone and install

```bash
git clone git@github.com:kenyonexpress/kenyonexpress.git
cd kenyonexpress
pnpm install
```

`main` is the default branch and it is current. Everything below assumes you are
on it.

**Your working directory is the repository root and nothing else.** `CLAUDE.md`
makes this a project rule: there is one checkout, at the path you just cloned
to, and there are no nested copies. Every `pnpm`, `git` and `next` command runs
from there. If you ever find yourself in a `kenyonexpress/kenyonexpress/`, stop
and work out how you got there.

### A3. 0:30 – 1:00. Environment

```bash
cp .env.example .env.local
```

`.env.example` is 534 lines and is exhaustive by test:
`src/lib/env-example-is-complete.test.ts` fails if a key in the boot schema is
absent from it. You do not need most of them today. Fill in four:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Ask whoever onboarded you for the first three. **Check the project ref in the
URL is `ixvwfbuvfxxsjiywhbbb`** before you paste anything — see §2.4, trap 2.

Everything else degrades rather than failing. Unset Meilisearch means search
falls back to a Postgres `ILIKE`; unset Sentry means no error reporting; unset
wallet keys mean the pass button does not render. `docs/ENV-REFERENCE.md` is the
annotated list, variable by variable.

### A4. 1:00 – 1:30. Run it

```bash
pnpm dev
```

Open **`http://localhost:3000`**. Not `127.0.0.1` — see §2.4, trap 1.

**You are done with Block A when** the homepage renders in Hebrew, right to
left, with product cards on it.

---

## Block B — 1:30 to 3:00. Orientation.

Read in this order. Do not read anything else today, however tempting the
filename.

| | Minutes | Document | The one thing to take from it |
|---|---|---|---|
| B1 | 30 | `docs/ARCHITECTURE-OVERVIEW.md` §1–§3 | The shape of the tree and what production actually contains |
| B2 | 25 | `docs/MONEY-MODEL.md` §1–§3 | Money is integer agorot, and why |
| B3 | 20 | `docs/PAYMENT-FLOW.md` §1, §2.1 | The states, and the three triggers that enforce them |
| B4 | 15 | `docs/BUSINESS-RULES.md` | What the code refuses to do, and where |

Then find these four files and read the comment at the top of each. The comments
in this repository carry the reasoning; the code is the easy part.

```
src/lib/money.ts                          the only money module
src/server/domain/orders/state-machine.ts what a line may become
src/server/payments/finalize.ts           the only writer of orders.status = paid
src/lib/env.ts                            why boot fails rather than checkout
```

**You are done with Block B when** you can answer these three without looking:

1. A coupon costs ₪120 on the site and the deal is worth ₪400. How much does the
   platform keep, and when? *(All ₪120, permanently, at the moment of charge.
   The supplier collects ₪280 in cash at the counter and the platform never
   touches it.)*
2. Where does `platform_percent` come from at settlement time? *(From the
   `order_items` row, snapshotted at purchase. Never from the live product.)*
3. What is `escrow_held`? *(A dead enum label. Nothing enters it, in the code or
   in the database.)*

---

## Block C — 3:00 to 4:00. The gates.

Run all four on an unchanged tree, **before** you write anything. You need to
know what green looks like here, so that red later means you.

```bash
pnpm test          # vitest, 246 test files
pnpm type-check    # tsc --noEmit
pnpm lint          # biome check .
pnpm build         # a SEPARATE gate. See below.
```

**`pnpm build` is not implied by the other three.** `cacheComponents` is on, and
it rejects uncached page reads that tests, `tsc` and Biome all pass. A change
can be green three ways and still not build. Budget five to ten minutes for it
cold.

While the build runs, read `docs/TESTING.md` §1–§3.

**You are done with Block C when** all four are green and you have noted how
long each took, so tomorrow you know which to run when.

---

## Block D — 4:00 to 6:00. One real change.

### D1. Pick something small and real

Good first changes, in descending order of usefulness:

- A missing test for a branch `pnpm test:coverage` reports uncovered.
- A Hebrew string that reads wrong.
- A documented gap in `docs/` you can close by reading code.

Bad first changes, and each for a specific reason:

- **Anything under `src/lib/money.ts` or `src/server/payments/`.** Per-file
  coverage floors and a lot of invariants. Not on day one.
- **Anything that adds a hex colour or a `px` literal.** There is a gate,
  `scripts/hardcoded-gate.mjs`, judged against `docs/hardcoded-audit.md`. You
  will fail CI in a way that takes a while to read.
- **A schema change.** Migrations are files that wait for approval and are
  applied through MCP. `db push` is forbidden. It is not a day-one task.

### D2. Branch

```bash
git checkout -b feat/<something-short>
```

**Never commit to `main`.** It is the default branch and the target of every
push, and work goes onto it through a pull request.

### D3. Write it, with the local loop

```bash
pnpm lint:changed        # biome, changed files only
pnpm typecheck:changed   # tsc, changed files only
pnpm test <path>         # the one file
```

These are what CI runs first, scoped to your diff, so they fail fast in the same
way.

### D4. Commit

```bash
git add <paths>
git commit
```

> **Never `git commit -- <paths>` with paths on the commit line.** It commits
> the current **working tree** at those paths, not what you staged. On a machine
> where more than one agent or session touches the repository, that quietly
> ships someone else's in-progress edits under your message. Stage with
> `git add`, then commit with no paths.

The pre-commit hook runs `lint-staged`, which is `biome check --write` on your
changed files. **It does not run the tests.** That is deliberate — a hook slow
enough to skip gets skipped — and it means a green commit says nothing about
`pnpm test`.

### D5. Run the full gates again

All four from Block C. **You are done with Block D when** they are green with
your change in the tree.

---

## Block E — 6:00 to 7:00. The pull request.

```bash
git push -u origin feat/<something-short>
gh pr create --base main
```

### What CI will run, and in what order

`.github/workflows/ci.yml`, on **every** pull request and **every** push. The
triggers are deliberately unfiltered: an earlier version listed branches, work
happened on branches not in the list, and those pushes got no CI at all.

| Job | What it does | Blocks? |
|---|---|---|
| `lint` | Biome and `tsc` on your diff, then the **hardcoded hex/px gate**, then Biome and `tsc` repo-wide | **yes** |
| `typecheck` | `tsc` on changed files | **yes** |
| `test` | `pnpm test:coverage`, with per-file coverage floors on the money path | **yes** |
| `build` | `pnpm build`, needs the three above | **yes** |
| `e2e` | Playwright against a local production build | **skips** — no `CI_SUPABASE_URL` secret |
| `e2e-preview` | read-only specs against your Vercel preview | **skips** — same secret |

**Both E2E jobs skip, and that is on purpose.** `CI_SUPABASE_URL` is this
repository's switch for "CI may touch a database", and the only database
available today is production. The `e2e` job's first step is `pnpm seed:test`,
which **writes** fixture users and catalogue rows. Setting that secret against
production would seed production. Leave it alone.

So: **a green PR here means lint, types, unit tests and build.** It does not
mean a browser has ever loaded your change. If your change is visual, load it
yourself.

### The repo-wide steps are the ones that catch you

`lint:changed` and `typecheck:changed` resolve `HEAD~1..HEAD` on a push, so a
push of five commits gates the fifth and waves the other four through. The
repo-wide `pnpm lint` and `pnpm type-check` steps exist for exactly that, and
they are blocking. A repo-wide error can survive four green diff-scoped runs.

### Review

Ask for one. Point the reviewer at the *why*, not the diff — the diff is in the
PR already.

---

## Block F — 7:00 to 8:00. Merged, and what happens next.

### The merge

Squash or merge as the reviewer prefers; `main` is the target either way.

### What deploys, and what does not

Vercel builds a preview for every pull request and deploys `main` to production.
**A push to production is one of the four stop-and-ask actions**, along with
deleting a database or files, running a migration against production, and a
second code agent on the same repository. Read `docs/DEPLOYMENT.md` before you
assume your merge went live.

### Three things that are true right now

They are not bugs you introduced, and each will read like one:

1. **No scheduler is running.** Ten cron routes exist and nothing calls them, so
   vouchers do not expire, reconciliation does not run, and voucher emails are
   not sent. `docs/OPERATIONS-CALENDAR.md`.
2. **The first real payment will raise `42703`.** `finalize.ts` and
   `queries/orders.ts` select four column names production does not have.
   `docs/PAYMENT-FLOW.md` §11.2.
3. **80 products, 12 suppliers, and no customer has ever bought anything.** The
   four orders in production are E2E fixtures; **zero vouchers have ever been
   issued**. Empty `vouchers`, `payment_events` and `refunds` are the expected
   state, not a broken connection.

4. **There is no deployment.** The Vercel project watches a different,
   abandoned repository, and all 11 of its deployments failed. Merging to `main`
   here deploys nothing and opens no preview.
   `docs/THIRD-PARTY-DEPENDENCIES.md` §0.

### Where to go on day two

| You want | Read |
|---|---|
| The rules the code enforces | `docs/BUSINESS-RULES.md` |
| What can break, and what to do | `docs/FAILURE-MODES.md` |
| SQL you can paste | `docs/QUERY-COOKBOOK.md` |
| Who can do what | `docs/ROLES-AND-PERMISSIONS.md` |
| Routes and server actions | `docs/API-REFERENCE.md` |
| Everything else | `docs/INDEX.md` |

---

## §2.4 — The four traps

Read these before you hit them. Each one has cost somebody an afternoon.

### Trap 1. `127.0.0.1` silently breaks every mutation

Browsing `http://127.0.0.1:3000` against a dev server started on `localhost`
fails Next 16's server-action origin check. **Server actions stop working, with
nothing useful in the console.** Server actions are the primary mutation surface
in this app, so it presents as "the whole site is broken" rather than as a host
mismatch.

**Always use `localhost`.**

### Trap 2. A stale service key reads as broken code

`.env.local`'s `SUPABASE_SERVICE_ROLE_KEY` may belong to a **different Supabase
project**. Scripts then fail with `Invalid API key` while the MCP tooling keeps
working perfectly, which reads as "the script is broken" and not "the key is
wrong".

**Check the project ref in `NEXT_PUBLIC_SUPABASE_URL` is `ixvwfbuvfxxsjiywhbbb`.**

### Trap 3. A worktree's `node_modules` can be a symlink

If you are handed an existing `ke-*` worktree instead of a fresh clone, check
whether its `node_modules` is a **symlink to the main checkout**:

```bash
ls -la node_modules | head -1
```

Turbopack refuses to run against one. Worse, running `pnpm install` inside that
worktree **purges the main checkout's `node_modules`**, so fixing your worktree
breaks the checkout you were not working in.

### Trap 4. `supabase/migrations/` does not describe production

It holds 115 files numbered 001 to 129. Production's own ledger holds **99**
applied migrations, under partly different names, from a different lineage.
Reading the migration files will teach you a schema that does not exist.

**`src/types/database.ts` is the closest thing to production in the repo, and
it is five weeks stale.** Last regenerated 2026-07-28: 33 tables against
production's 61, missing `refunds`, `payment_events`, `search_index_outbox`,
`supplier_branches`, `subscriptions`, `subscription_charges`,
`homepage_sections`, `banners`, `invoices`, `stock_reservations`,
`gift_vouchers` and `push_tokens`. **Run `pnpm db:types` first.** For the schema
as prose, `docs/DATA-MODEL.md`.

And a corollary: `migrations/pending/` holds 23 `.sql` files and **all of them
are applied**. The directory name is historical. `ls` on it is not evidence of
anything.

---

## If you are behind

Cut in this order, and none of these costs you anything permanent:

1. **Block B.** Read it on day two; you will understand it better having built
   something.
2. **`pnpm build` in Block C.** Run it once in Block D instead.
3. **The size of the Block D change.** A one-line fix through the whole pipeline
   teaches more than a good change that does not land.

Do not cut Block C entirely, and do not cut §2.4.
