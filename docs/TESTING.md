# Testing

What is tested where, how to run each suite, and what the gates actually block.

Measured from this branch on **2026-09-01**.

---

## 1. The suites

| Suite | Runner | Files | Command |
|---|---|---|---|
| Unit and integration | Vitest | **242** | `pnpm test` |
| End to end | Playwright | **15 specs** | `pnpm test:e2e` |
| Types | tsc | whole repo | `pnpm type-check` |
| Lint and format | Biome | whole repo | `pnpm lint` |
| Build | Next | whole repo | `pnpm build` |
| Pixel comparison | Playwright script | home, category, product, coupon | `node scripts/compare.mjs` |
| Lighthouse | script | smoke | `pnpm lighthouse:smoke` |

---

## 2. The four gates, and why build is separate

```bash
pnpm test          # vitest run
pnpm type-check    # tsc --noEmit
pnpm lint          # biome check .
pnpm build         # next build
```

**`pnpm build` is a gate the other three cannot stand in for.**
`cacheComponents` is enabled, and it rejects uncached page reads that tests,
types and lint all pass cleanly. A change can be green on all three and still
fail to build. Run it before pushing anything that touches a page, a layout or a
data read in a server component.

> Concurrent builds across git worktrees OOM each other. When several checkouts
> or agents are active, gate on test/type-check/lint and run the build alone.

---

## 3. Unit tests

246 test files, colocated with the code (`foo.ts` beside `foo.test.ts`) rather
than in a separate tree. Run:

```bash
pnpm test              # once
pnpm test:watch        # watch
pnpm test:coverage     # with the money-path floors
```

### Coverage is enforced only where it matters

The project does **not** carry a global coverage threshold. Instead the money
path carries a hard per-file floor of **95%** on lines, branches, functions and
statements:

```
src/lib/money.ts
src/lib/commerce/money.ts
```

Everything else is reported but not floored. The reasoning is in
`vitest.config.ts`: a global percentage is a number people optimise rather than
a property anyone relies on, whereas **the closed invariant list is what
actually protects the money path**. A high global number would say nothing about
whether `applyBp` rounds correctly, and a 95% floor on the two modules that do
the arithmetic says exactly that.

### What the unit tests actually cover

The dense areas, and what they assert:

| Area | Examples |
|---|---|
| Money | `money.test.ts`, `commission.test.ts`, `product-money.test.ts`, `admin-money-agreement.test.ts` |
| Vouchers | `code.test.ts`, `qr.test.ts`, `issue.test.ts`, `state-machine.test.ts`, `redeem-contract.test.ts`, `mark-order-item-redeemed.test.ts` |
| Orders | `status-transitions.test.ts` (**175 tests**: one per legal transition, one per illegal pair, one per no-op, plus a named regression per defect) |
| Payments | `finalize-reads-fail-loudly.test.ts`, webhook route tests, `webhook-dlq.test.ts` |
| Search | `meili-settings.test.ts`, `hebrew-synonyms.test.ts`, `pipeline-contracts` |
| Auth | `auth-coverage.test.ts`, `auth-error-map.test.ts`, `auth-redirect.test.ts` |
| Cart | `cart-merge-never-duplicates.test.ts` |
| RTL and i18n | `latin-field-direction.test.ts`, `rtl` suites |

`status-transitions.test.ts` is the one to read if you want to understand the
house style: it does not test that the happy path works, it enumerates every
pair of states and asserts legal or illegal for each, so a new enum value cannot
be added without a decision being recorded about every transition into and out
of it.

`finalize-reads-fail-loudly.test.ts` exists because a discarded error once made
the failure reason a lie: the webhook prints whatever reason finalize returned,
and "order not found" for an order that exists and whose card has just been
charged sent whoever answered the page hunting a missing row instead of a
database that had stopped answering.

### What unit tests do not cover

They assert configuration objects and pure functions, not live infrastructure.
`meili-settings.test.ts` proves the settings object is what the documentation
says; it proves nothing about a running Meilisearch instance, and **there is no
such instance to test against**.

---

## 4. End to end

15 Playwright specs:

```
a11y  auth  cart  category  checkout  coupon-scan  coupons
full-purchase-redeem  home  layout-stability  product
production-smoke  purchase-flow  render-mode  rtl-mobile
```

```bash
pnpm test:e2e
```

### E2E must run against a built server

```bash
PORT=3311 pnpm start &
E2E_BASE_URL=http://localhost:3311 pnpm test:e2e
```

**A bare `playwright test` reuses a stale dev server and fabricates failures.**
It has produced 13 phantom cart failures that were entirely an artefact of the
server it attached to. `playwright.config.ts` sets
`reuseExistingServer: !process.env.CI`, which is convenient locally and is
exactly how the stale-server trap happens.

`pnpm start` runs with `NODE_ENV=production` on a laptop. That is deliberate,
because it is the build being measured, but it means production-only boot guards
apply. `ALLOW_INCOMPLETE_ENV` is the escape hatch.

### Worker count is a correctness setting, not a speed setting

```ts
workers: process.env.CI ? 1 : Number(process.env.E2E_WORKERS ?? 2)
```

More workers drive guest-cart writes against the **same** Supabase project
concurrently, so failures above two workers are a property of the shared
fixture rather than a regression in the code. The suite passes at two workers
and in CI at one. Raising `E2E_WORKERS` to "speed things up" produces failures
that are real conflicts and not real bugs.

### Paid flows are opt-in

`E2E_PAID_FLOW` gates the specs that would drive a real Cardcom charge. Leave it
unset unless you intend that.

---

## 5. The pixel gate

Every screen is compared against `refs/ke_live_singlefile.html`, and the
difference **must stay under 11%**:

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

`scripts/compare.mjs` imports `@playwright/test` (already a devDependency), not
`playwright`, and the browsers live in `~/Library/Caches/ms-playwright/`. It
never needed a separate `playwright` install, which matters because installing
one is exactly the operation that fails (`docs/ONBOARDING.md` §1).

---

## 6. CI

`.github/workflows/`:

| Workflow | Purpose |
|---|---|
| `ci.yml` | the main gate |
| `production-smoke.yml` | Playwright smoke against production |
| `commit-monitor.yml` | commit hygiene |
| `dependabot-auto-merge.yml` | dependency bumps |
| `cron.yml` | a candidate scheduler, **not enabled** |

`ci.yml` runs jobs in two tiers:

1. **Diff-scoped**: `pnpm lint:changed`, `pnpm typecheck:changed`,
   `pnpm gate:hardcoded`. Fast feedback on what the PR touched.
2. **Repo-wide**: `pnpm lint`, `pnpm type-check`, `pnpm test:coverage` with the
   money floors.

`gate:hardcoded` blocks **new** hardcoded hex colours and pixel values,
measured against the existing inventory in `docs/hardcoded-audit.md`. It is a
ratchet: it does not require fixing what is already there, it prevents adding
more.

> **`CI_DIFF_RANGE` matters and is easy to get wrong.** On a `pull_request`
> event, CI runs against the **merge commit**, so `HEAD~1` is `origin/main` and
> a `HEAD~1..HEAD` fallback is an inert no-op that silently checks nothing. The
> workflow resolves the range explicitly for this reason.

Pre-commit runs `lint-staged`, which applies `biome check --write` to changed
files. **It does not run tests.**

---

## 7. What is not tested

Stated so nobody assumes coverage that does not exist.

- **No live Meilisearch instance**, so the search integration is asserted only
  at the configuration boundary.
- **No live Cardcom sandbox in CI.** The webhook is tested against fixtures;
  `CARDCOM_USE_MOCK` and `CARDCOM_SANDBOX` exist for manual work.
- **No test proves a real payment completes**, which is why the `finalize.ts`
  `42703` defect (`docs/RUNBOOK.md` §4.1) survived: it is a column name that
  only fails against the live schema, and every test mocks the client.
- **No scheduler test.** The cron routes are unit-tested for their guard and
  their handler; nothing asserts that anything ever calls them, and nothing
  does.
- **RLS policies are not tested from the client role.** Policy correctness is
  asserted by reading the policy, not by attempting a forbidden read as
  `authenticated`. Given that the `authenticated` DML grant is still present
  (`docs/ROLES-AND-PERMISSIONS.md` §2), this is the largest untested surface in
  the system.

---

## 8. Verification

```bash
find src -name '*.test.ts*' | wc -l      # 242
ls e2e/*.spec.ts | wc -l                 # 15
grep -n 'MONEY_MODULE_FLOOR\|thresholds' vitest.config.ts
grep -n 'workers\|reuseExistingServer' playwright.config.ts
```
