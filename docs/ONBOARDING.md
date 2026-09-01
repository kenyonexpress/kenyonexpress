# Onboarding

Clone to running locally, and the traps that cost other people hours.

Written against this branch on **2026-09-01**.

Read `docs/ARCHITECTURE-OVERVIEW.md` first if you want to know what you are
about to run. This document assumes you just want it running.

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Node | 22 (see `.nvmrc` / CI matrix) |
| **pnpm** | **11.1.2** (`packageManager` in `package.json`) |
| git | any |

### `npm install` cannot work in this repo

It dies with:

```
npm error Cannot read properties of null (reading 'matches')
```

This is **not** a corrupt cache and `npm cache clean --force` does not change
it. pnpm's virtual store, `node_modules/.pnpm/**`, is a forest of symlinks.
npm's arborist loads that tree, builds `Link` nodes whose `target` resolves to
`null`, then dereferences it in `Link.matches`.

It fails **before any escape hatch npm offers**: a `preinstall` script and
`engine-strict` plus a bogus `engines.npm` were both tried and neither fired,
because the crash is inside `buildIdealTree`, ahead of every lifecycle hook.
There is no way to replace that message with a helpful one from inside the repo.
This paragraph is the replacement.

**Use `pnpm add -D <pkg>`.**

---

## 2. Clone and install

```bash
git clone git@github.com:kenyonexpress/kenyonexpress.git
cd kenyonexpress
pnpm install
```

**Branch.** The GitHub default is `main` and it is current. `phase5/homepage`
is the long-running feature line. Check which one the work you are joining is
on before branching; they have diverged and merged repeatedly.

> **Worktree trap.** If you are handed an existing `ke-*` worktree rather than a
> fresh clone, check whether its `node_modules` is a **symlink** to the main
> checkout. Turbopack refuses to run against one, and running `pnpm install`
> inside that worktree **purges the main checkout's `node_modules`**. Verify
> with `ls -la node_modules | head -1` before installing.

---

## 3. Environment

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

`.env.example` is 534 lines, and a test keeps it honest:
`src/lib/env-example-is-complete.test.ts` fails if a key in the boot schema is
missing from it. The full annotated list is `docs/ENV-REFERENCE.md`. The minimum
for the app to boot
and serve pages:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

To exercise checkout you also need the Cardcom block and the voucher signing
key:

```bash
CARDCOM_TERMINAL_NUMBER=   CARDCOM_API_NAME=   CARDCOM_API_PASSWORD=
CARDCOM_WEBHOOK_SECRET=    VOUCHER_QR_SECRET=
CRON_SECRET=
```

Everything else degrades rather than failing:

| Unset | Behaviour |
|---|---|
| `MEILISEARCH_HOST` / `_API_KEY` | search falls back to Postgres `ILIKE` |
| `QSTASH_TOKEN` | index jobs run inline |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiting falls back to Postgres |
| `SENTRY_DSN` | no error reporting |
| Apple/Google wallet keys | the pass button does not render |

Validation runs at **boot**, from `instrumentation.ts` `register()`, before the
server accepts a request. The alternative, throwing at request time, means a
deploy with a missing secret builds, goes green, and fails on the first customer
who tries to pay.

> **Two env traps.**
>
> 1. **`.env.local`'s service key may not be this project's.** A stale key from
>    another Supabase project produces `Invalid API key` in scripts while MCP
>    keeps working, which reads as "the script is broken" rather than "the key
>    is wrong". Check the project ref in the URL matches
>    `ixvwfbuvfxxsjiywhbbb`.
> 2. **Auditing env usage takes three grep patterns, not one.** A `process.env`
>    sweep found 96 of 129 references; the rest read `env.X` off a `ProcessEnv`
>    passed into `loadCardcomEnv` and its siblings.

---

## 4. Run it

```bash
pnpm dev            # http://localhost:3000
```

> **Use `localhost`, not `127.0.0.1`.** Browsing `127.0.0.1` against a server
> started on `localhost` makes Next 16 fail its server-action origin check, and
> **server actions silently stop working** with nothing useful in the console.
> Since server actions are the primary mutation surface here, that presents as
> "the whole site is broken" and wastes an afternoon.

### Next 16 differences that will surprise you

This is not the Next.js you know. Read the relevant guide in
`node_modules/next/dist/docs/` before writing code.

- **`middleware.ts` no longer exists.** The edge entry point is
  `src/proxy.ts`, and the exported function must be named `proxy`. Anything in
  the history saying "middleware" means that file.
- **`cacheComponents` is on.** `pnpm build` rejects uncached page reads that
  `pnpm test`, `pnpm type-check` and `pnpm lint` all pass. Build is a separate
  gate; see `docs/TESTING.md`.
- Route segment config (`runtime`, `dynamic`) must be a **literal in its own
  segment**. It cannot be re-exported from another module.

---

## 5. The database

**There is no local database, and you should not try to create one.**

- A from-zero reset is **not runnable** here: Docker wedges, and the migration
  file chain and production are different lineages anyway.
- `supabase/migrations/` holds 115 files numbered 001 to 129 and **does not
  describe production**, whose own ledger holds 99 applied migrations under
  partly different names.
- **`src/types/database.ts` is five weeks stale.** Last regenerated
  **2026-07-28**; it describes 33 tables where production has 61, and misses
  every table added in the 2026-08/09 wave (`refunds`, `payment_events`,
  `search_index_outbox`, `supplier_branches`, `subscriptions`,
  `subscription_charges`, `homepage_sections`, `banners`) plus `invoices`,
  `stock_reservations`, `gift_vouchers` and `push_tokens`. **Run
  `pnpm db:types` before trusting it.** It is still a better guide than
  `supabase/migrations/`, which describes a different lineage.

Development runs against the hosted Supabase project. Be aware that you are
sharing it: `parallel sessions` on this repo are normal, and other people's
changes land in the same tables.

**Never run `db push`.** A schema change is a file in `migrations/pending/` that
waits for explicit approval, applied through MCP. Applying a migration to
production is one of the four stop-and-ask actions.

---

## 6. The gates, before you push

```bash
pnpm test           # vitest, 246 test files
pnpm type-check     # tsc --noEmit
pnpm lint           # biome
pnpm build          # a SEPARATE gate, see above
```

A pre-commit hook runs `lint-staged`, which applies `biome check --write` to
changed files. It does not run the tests.

Full detail in `docs/TESTING.md`.

---

## 7. Conventions you cannot violate

1. **Money is integer agorot.** Every calculation goes through
   `src/lib/money.ts`. No `float` anywhere on the money path. Rates are integer
   basis points.
2. **No `db push`.** Migrations are files, applied on approval.
3. **`platform_percent` is per product and snapshotted onto `order_items` at
   purchase.** Settlement never reads a live percentage off a product.
4. **Hebrew RTL in all UI.** Every screen is compared against
   `refs/ke_live_singlefile.html` and the gate must stay under 11%:
   ```bash
   PORT=3311 pnpm start &
   LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
   ```
5. **pnpm only.**
6. **The four stop-and-ask situations**: a production push to Vercel, deleting a
   database or files, running a migration against production, and a second code
   agent on the same repository.

---

## 8. Where to go next

| You want | Read |
|---|---|
| The whole system | `docs/ARCHITECTURE-OVERVIEW.md` |
| How money works | `docs/MONEY-MODEL.md` |
| What the tables are | `docs/DATA-MODEL.md` |
| Who can do what | `docs/ROLES-AND-PERMISSIONS.md` |
| Routes and actions | `docs/API-REFERENCE.md` |
| Deploying | `docs/DEPLOYMENT.md` |
| When it breaks | `docs/RUNBOOK.md` |
| Domain vocabulary | `docs/GLOSSARY.md` |

**Do not start from `supabase/migrations/`.** It will teach you a schema that
does not exist.

---

## 9. Known state on your first day

Three things are true right now and will otherwise read as bugs you introduced:

1. **No scheduler is running.** Ten cron routes exist and are never called, so
   voucher emails are not sent and vouchers do not expire.
   `docs/OPERATIONS-CALENDAR.md`.
2. **`finalize.ts` and `queries/orders.ts` name four columns production does
   not have**, so the first real payment raises `42703`.
   `docs/PAYMENT-FLOW.md` §11.2.
3. **The catalogue has 80 products and zero completed purchases.** Empty
   `vouchers`, `payment_events` and `refunds` tables are expected.
