# Onboarding (first week in this codebase)

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only. Where this file and an older brief disagree, the live tree on this branch is right.

Companions (same worktree, read 2026-09-07):

```
docs/cursor/README.md
docs/cursor/ARCHITECTURE-OVERVIEW.md
docs/cursor/MONEY-INVARIANTS.md
docs/cursor/GLOSSARY.md
docs/ONBOARDING.md
docs/ONBOARDING-DAY-ONE.md
AGENTS.md
CLAUDE.md
docs/adr/
.env.example
```

Root
`docs/ONBOARDING.md`
is a sibling (Hebrew, 20 minutes). This file is the first-week map for a new engineer who will otherwise copy a stale architecture PDF and ship a float.

---

## 0. Three facts before you clone

1. **There is one database: production Supabase**
   `ixvwfbuvfxxsjiywhbbb`.
   `supabase start`
   is not how this repo works. Migration files on disk are a **different lineage** from production (pre-059). The truth is the live schema. Types are generated from it:
   `pnpm db:types`
   writes
   `src/types/database.ts`.
   Types-ahead of production is a known trap (see
   `docs/cursor/OPEN-QUESTIONS.md`).

2. **`npm install` cannot work here.** Arborist dies on pnpm's symlink forest. Package manager is
   `pnpm@11.1.2`
   only. See
   `AGENTS.md`.

3. **Money is integer agorot.** Every calculation goes through
   `src/lib/money.ts`
   (re-export of
   `src/lib/commerce/money.ts`).
   A float on that path is not a style issue. It is a money bug. Read
   `docs/cursor/MONEY-INVARIANTS.md`
   before you touch checkout, refund, commission, wallet, or a product form.

---

## 1. Day 0: where you are allowed to work

This worktree is

```
/Users/ofir/kenyonexpress-web/ke-cursor
```

on branch
`ke-cursor-docs`.

Do **not**:

- Checkout
  `closeout/v1-final`
  from this worktree (that branch is the code agent's).
- Checkout
  `docs/ui-design-system`
  (that branch is the design agent's).
- Open the main checkout
  `/Users/ofir/kenyonexpress-web/kenyonexpress`
  or the
  `ke-arch`
  worktree. Two agents on one tree is a hard stop (ADR 0012).
- Run
  `pnpm`,
  `next build`,
  or apply a production migration from a docs session.
- Commit with
  `git add -A`
  or
  `git commit -A`.
  Always
  `git commit -- path/to/file`.
  Broad add has already swept another session's WIP into a commit.

If you need to write TypeScript, you are on the wrong worktree.

---

## 2. Day 1 morning: environment (if you are writing code, elsewhere)

From the **code** worktree, not this docs session:

```bash
pwd   # must be the intended worktree root
pnpm install
cp .env.example .env.local
# fill from the comments in .env.example; every key documents its reader
pnpm dev
```

Traps already written into
`.env.example`:

- Local Cardcom demo-key is rejected as
  `Invalid API key`.
- `next start`
  on a laptop is
  `NODE_ENV=production`.
  `ALLOW_INCOMPLETE_ENV`
  exists for that.
- Boot refuses
  `CARDCOM_SANDBOX=true`
  when
  `NODE_ENV=production`.
  That is intentional. Do not "fix" it.
- A leaked service-role key is hashed in
  `scripts/compromised-keys.mjs`.
  `scripts/deploy-preflight.mjs`
  refuses to build with it.

You do not need every optional key to read the catalogue. You do need them to take a payment.

---

## 3. What to read, in this order

Do not start at
`docs/CONTRADICTIONS.md`.
It is a 2026-07 history of reversals. The 28.07 coupon model (all prepayment stays with the platform) is in force. The 27.07 escrow reversal is not.

### Hour 1: the product

| # | File | Why first |
|---|---|---|
| 1 | `docs/cursor/GLOSSARY.md` | Words here do not mean commerce-textbook things. Escrow, payout, coupon price, cashback, wallet. |
| 2 | `docs/cursor/ARCHITECTURE-OVERVIEW.md` | Next 16 App Router, `src/proxy.ts`, schema domains, R2, Redis, Meilisearch-without-a-search-product, Cardcom, Vercel `fra1`. |
| 3 | `docs/cursor/MONEY-INVARIANTS.md` | Integer agorot, `platform_percent` snapshot, no global rate, correct vs incorrect patterns. |

### Hour 2: how money actually moves

| # | File | Why |
|---|---|---|
| 4 | `docs/cursor/DATA-FLOW.md` | Coupon buy, physical buy, scan, refund-to-wallet, refund-to-card, referral. Table + RLS at each step. |
| 5 | `docs/adr/0001-money-is-integer-agorot.md` | Short ADR. Then 0002 (no escrow), 0003 (dynamic percent). |
| 6 | `docs/cursor/LAUNCH-BLOCKERS.md` | What a human still has to do. Code is not on that list. |

### Hour 3: who can write what

| # | File | Why |
|---|---|---|
| 7 | `docs/cursor/RLS-CATALOG.md` | Four roles, every public table, over-permissive flags. |
| 8 | `docs/adr/0005-rls-everywhere.md` | Security lives in SQL. `service_role` bypasses it. |
| 9 | `docs/cursor/API-SURFACE.md` | Every route handler and server action. Auth and failure modes. |

### Hour 4: how you will not break it

| # | File | Why |
|---|---|---|
| 10 | `docs/cursor/TEST-MAP.md` | What each test protects. Gaps G1–G20. |
| 11 | `docs/cursor/SECURITY-REVIEW.md` | Attacker vs checkout, scan, refund, supplier, admin. |
| 12 | `docs/cursor/ERROR-TAXONOMY.md` | Codes the user sees vs what the operator greps. |

### Rest of day 1: the rest of this pack

`RISK-REGISTER.md`,
`OBSERVABILITY-MAP.md`,
`DATA-RETENTION.md`,
`DECISION-LOG.md`,
`DEPENDENCY-AUDIT.md`,
`PERFORMANCE-NOTES.md`,
`POST-LAUNCH-ROADMAP.md`,
`OPEN-QUESTIONS.md`.

### Day 2: the enforcement, not the essays

Older
`ARCHITECTURE-*.md`
files at repo root are mixed: some match the tree, some describe a 2026-05 Vercel project that never built. Prefer this pack, then
`docs/adr/`,
then the source file named in the pack. If a root architecture file and
`src/`
disagree,
`src/`
wins.

Then read the modules, not more PDFs:

```
src/lib/money.ts
src/lib/commerce/money.ts
src/lib/commerce/commission.ts
src/server/actions/payments/checkout.ts
src/server/payments/finalize.ts
src/server/actions/payments/refund.ts
src/proxy.ts
src/lib/supabase/admin.ts
src/types/database.ts
```

---

## 4. Map of the tree (where to look)

| Layer | Path |
|---|---|
| Storefront pages | `src/app/(store)`, `(main)`, `(legal)` |
| Account | `src/app/(account)` |
| Admin | `src/app/(admin)` |
| Supplier till | `src/app/(supplier)`, plus `apps/mobile` (second RPC caller) |
| Auth pages | `src/app/(auth)` |
| Route handlers | `src/app/api/**/route.ts`, feeds, auth callback |
| Edge gate | `src/proxy.ts` (not `middleware.ts`; the export must be named `proxy`) |
| Server actions | `src/server/actions/` |
| Money path | `src/lib/money.ts`, `src/lib/commerce/`, `src/server/payments/` |
| User-scoped queries | `src/server/queries/` |
| Service-role writes | `createAdminClient()` behind a role gate + audit |
| Notifications | `notification_outbox` + `/api/cron/notifications` |
| Pending SQL | `migrations/pending/` + `APPLY-ORDER.md` |
| Visual refs | `refs/` is a **gate output**, not a content source (`docs/REFS-POLICY.md`) |
| Live content source | the live WordPress site, not Electro, not `refs/` (`docs/SOURCING-RULES.md`) |

There is no
`packages/`
directory. There is no
`apps/web`.
There is no Turborepo. The web app is
`src/app/`.

Framework on this branch: **Next.js 16.2.12**, React 19.2.4. Briefs that still say Next 15 are stale.

---

## 5. What you must never touch

These are not taste. They are load-bearing.

### 5.1 Money

- Do not introduce
  `number`
  arithmetic on amounts. Use branded
  `Agorot`
  /
  `Bp`.
- Do not invent a global
  `PLATFORM_PERCENT`
  env, settings row, or default. A product without
  `platform_percent`
  is unsellable.
- Do not derive
  `coupon_price_ils`
  as a percent of face. It is an absolute shekel amount. Missing → unsellable.
- Do not compute supplier due as a second percentage. It is
  `face − fee`
  by subtraction.
- Do not settle from live
  `products.platform_percent`.
  Settlement reads the snapshot on
  `order_items`.
- Do not credit cashback at scan. Live path credits in
  `finalizeOrder`
  via
  `fn_wallet_transfer`
  (`order:<id>:cashback`).
- Do not revive escrow. `escrow_holds` has leftover rows and no writer. Legal copy must not say נאמנות.
- Do not build a payout pipeline for coupons. The partner is owed 0 from us. `admin/payouts.ts` is dead (`42P01`).

### 5.2 Auth and RLS

- Do not put
  `SUPABASE_SERVICE_ROLE_KEY`
  in a client bundle, a mobile app, or a
  `NEXT_PUBLIC_*`
  var. The till is **anon + DEFINER RPCs**.
- Do not write
  `has_role('customer')`
  as a privilege check. Every profile has that role.
- Do not let
  `support`
  call
  `refundOrder`.
  Money gates are
  `is_admin()`.
- Do not forward the browser
  `Cookie`
  jar to PostgREST for guests. The browser cookie is
  `ke_session_id`.
  RLS reads a constructed
  `session_id=`
  header. Mixing the names empties the cart or leaks the refresh token.
- Do not disable RLS "just for this table". Zero-policy tables are catalogued in
  `docs/cursor/RLS-CATALOG.md`.
  Adding a table without policies is a launch bug.

### 5.3 Schema and deploy

- Do not
  `db push`.
- Do not apply
  `migrations/pending/`
  to production. Human only. One of four hard stops.
- Do not edit Cloudflare DNS from an agent session. Two zones exist; the staged one lies with
  `success: true`.
- Do not cut over
  `kenyonexpress.co.il`
  until
  `docs/cursor/LAUNCH-BLOCKERS.md`
  H1–H6 are done. DNS is last.
- Do not sell product id
  `9bb347f8-03ec-48ce-8ff2-2503fb74c895`
  (₪1 / ₪400 master test row). The guard must stay. Three other live products contain מאסטר and are real; do not blanket-hide the string.

### 5.4 Product and UI

- Do not "complete" Meilisearch into a faceted search product because the backend exists. `/search` exists; the header field exists because pixel refs contain it (ADR 0010). There is no marketplace search chrome.
- Do not add a second cache (Redis pages) next to
  `'use cache'`
  +
  `cacheTag(CATALOGUE_TAG)`
  (ADR 0009).
- Do not treat
  `drizzle-orm`
  as the runtime data layer. Runtime is
  `supabase-js`.
  Drizzle schema files exist; queries do not go through them.
- Do not use
  `middleware.ts`.
  The file is
  `src/proxy.ts`.
- Do not ship English UI strings. Storefront is Hebrew RTL. Logical CSS properties, not
  `left`/`right`.

### 5.5 Git and agents

- Do not
  `git add -A`.
- Do not force-push
  `main`.
  `main`
  is GitHub-protected.
- Do not run a second code agent on the same worktree (ADR 0012).
- Do not copy the repo into
  `kenyonexpress/kenyonexpress/`
  or
  `src copy`.
  Nested copies are how the old Vercel project failed typecheck.

---

## 6. Gates you will hit (code worktree)

All must be green before a code commit. This docs pack does not run them.

```bash
pnpm type-check && pnpm lint && pnpm test
pnpm build                          # separate gate; cacheComponents catches what the three miss
node scripts/migration-lint.mjs     # if you touched SQL
node scripts/bundle-gate.mjs        # shared JS ratchet
E2E_PORT=3412 E2E_WEB_COMMAND='pnpm start' pnpm exec playwright test
```

Bare
`pnpm exec playwright test`
against a stale
`pnpm dev`
fabricates failures. Always a fresh
`pnpm start`.

Visual parity (home), after a real build:

```
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

Threshold: under 11% at 380 / 768 / 1440. The script appends
`docs/UI-PARITY-REPORT.md`
itself. A run that measures and does not write is a process bug.

Conventions already enforced by tests (you will fail them; that is the point):

- Route without
  `withRequestLog`
- Server action without an auth gate
- Cron job not listed in all four places (
  `scripts/cron-jobs.json`,
  `.github/workflows/cron.yml`,
  docs, route file)
- Raw hex colour in a component
- Supabase call that swallows
  `error`
- New outbox
  `kind`
  without extending the CHECK
- Float on the money path (
  `money-no-float.test.ts`)
- Treat `profiles.role = vendor` as till access (it is `supplier_members`)
- Apply pending SQL by number 169–172
- Read `default_split_percent` at checkout
- Forward the browser Cookie jar to PostgREST
- Credit cashback at scan
- Enable `/en` or Hobby Vercel cron
- Open
  `/Users/ofir/kenyonexpress-web/kenyonexpress`
  or
  `ke-arch`
  from this worktree

Wave specs: `docs/cursor/waves/WAVE-INDEX.md`. Contracts: `docs/cursor/contracts/`. Ops: `docs/cursor/ops/ON-CALL-GUIDE.md`.


---

## 7. Day 3–5: pick a small surface, not a rewrite

Safe first tickets (after launch blockers are a human problem, not yours):

- Read-only: add a test that closes a gap in
  `docs/cursor/TEST-MAP.md`
  G1–G20.
- Copy: Hebrew error string already mapped in
  `docs/cursor/ERROR-TAXONOMY.md`.
- Catalogue display that does not touch agorot arithmetic.

Unsafe first tickets:

- "Add Stripe as backup." Cardcom only (D-9 / C9).
- "Hold supplier money until scan." That is escrow. Removed.
- "Default commission to 10% so the form is nicer." Unsellable is the correct failure.
- "Expose Meilisearch dashboard." No.
- "Let support refund from the ticket UI." Support is read-expanded. Refund is admin.

---

## 8. Who to ping, and when to stop

Four hard stops. In every other case, take the conservative decision, write it under
`STATE.md`
"החלטות שהתקבלו לבד", continue.

1. Push to production on Vercel.
2. Delete a database or delete files that are not the three-backup exception.
3. Apply a migration to production.
4. A second code agent on the same repo / worktree.

Launch steps that are human-only are ordered in
`docs/cursor/LAUNCH-BLOCKERS.md`.
Do not perform them from Cursor.

At 03:00, start at
`docs/cursor/OBSERVABILITY-MAP.md`,
not at random
`console.log`.
Structured logs are JSON with an
`event`
field. Money failures also ntfy the operator.

---

## 9. Checklist for Friday of week 1

You can stay without babysitting if you can answer these out loud:

- What is
  `coupon_price_ils`
  (absolute), vs
  `platform_percent`
  (whole percent, snapshotted), vs
  `supplier_immediate_agorot`
  (0 on a coupon)?
- Why does
  `finalizeOrder`
  have to be the only writer of
  `paid`?
- Why is the Cardcom POST body not money?
- Which cookie name does guest RLS read?
- What happens if you refund a redeemed voucher through the voucher state machine? (Illegal. Goodwill is a wallet credit.)
- Where does cashback credit actually run?
- Why is
  `has_role('customer')`
  a vulnerability, not a check?

If any answer is "escrow" or "the global 10%", read hour 1 again.
