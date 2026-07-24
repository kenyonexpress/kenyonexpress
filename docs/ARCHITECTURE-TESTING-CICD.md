# Architecture: Testing and CI/CD (KenyonExpress)

> **גובר עליו `docs/CONTRADICTIONS.md` (2026-07-24).** כל מספר עמלה, ברירת מחדל
> (10%/5%) או נוסח Escrow במסמך הזה הוא שריד. ההכרעה: `platform_percent`
> פר-מוצר, חובה, בלי ברירת מחדל בשום מקום; ה-held הוא רישום פנימי ב-ledger בלבד.

Status: FINAL DESIGN. Branch: `phase5/homepage`. Target branch for PRs: `cursor/add-supabase-3c830` (the current default branch, renamed to `main` at cutover).

This document is the single source of truth for the testing strategy and the CI/CD pipeline. It is written for a marketplace that moves real money: Cardcom charges, a cashback wallet, per product commission splits, and single use coupons. A bug in the money path is lost money, so the test hierarchy here is inverted from the usual: money and atomicity first, UI second.

Ground truth for this document:

- Next.js App Router (Next 16.2.4, React 19.2), Supabase (Postgres, RLS), Hebrew RTL.
- Payments via Cardcom, single terminal, webhook verified with HMAC-SHA256 (`src/lib/payments/hmac.ts`) and then verified against the Cardcom API before finalize.
- Products are `coupon` or `physical`. Commission: the platform keeps `platform_percent` per product. For a coupon: 10 percent is charged on-site and 90 percent is paid in-store (no escrow of the in-store part). For a physical product: 100 percent is charged on-site.
- All money is agorot as integers (`src/lib/commerce/money.ts`). Never floats for money.
- Merchant coupon scan is `POST /api/supplier/redeem`, made race-safe by a `UNIQUE(coupon_code_id)` constraint on `coupon_redemptions` (the DB is the final arbiter, the app gate is `validateRedemption`).
- A manual visual diff tool exists at `scripts/compare.mjs` (referenced in git history: "verified vs live via compare.mjs").

Current repo facts (verified):

| Area | State |
|---|---|
| Unit runner | Vitest 3.x, jsdom env, `src/**/*.test.ts(x)`, setup `vitest.setup.ts`, alias `@ -> src` |
| E2E runner | Playwright 1.50, chromium only, `locale he-IL`, `baseURL http://localhost:3000`, `webServer: pnpm dev` |
| Existing tests | `money.test.ts`, `commission.test.ts`, `settlement.test.ts`, `redemption.test.ts`, `escrow.test.ts`, `state-machine.test.ts`, `checkout-flow.test.ts`, plus `src/__tests__/*` and two e2e specs (`auth.spec.ts`, `homepage.spec.ts`) |
| CI | None. No `.github/workflows`. Only husky pre-commit + lint-staged (biome on staged) |
| Lint/format | Biome 1.9 (`pnpm lint`, `pnpm check`) |
| Typecheck | `tsc --noEmit` (`pnpm type-check`), strict + `noUncheckedIndexedAccess` |
| Money module | `src/lib/commerce/money.ts` (branded `Agorot` type), `commission.ts`, `src/server/domain/orders/settlement.ts` |
| Known test debt | T1 no CI, T2 `rate-limit.ts` fails open, T3 guest cart merge race, plus RLS/policy items T4-T12 tracked in STATE.md |

The rest of this document turns those facts into a concrete, implementation-ready plan.

---

## 1. Vitest unit strategy

### 1.1 Principle: risk-based, not coverage-shaped

There is no global coverage percentage that unlocks merge. Instead there is a closed list of money invariants (below), and every one of them must have at least one test. A module tagged "money" that is missing its test file fails CI. Coverage floors (section 1.6) are a secondary guard, per module, not a global number.

### 1.2 What to unit test (the closed invariant list)

Every function here is a pure function or an isolated guard. None of them does I/O, so all of them are unit tested with no Supabase and no network.

#### A. `money.ts` agorot math and rounding

Target file: `src/lib/commerce/money.test.ts` (already exists, extend it).

- `agorot()` rejects non safe integers (`assertSafeInteger`).
- `ilsToAgorot('12.34')` equals `1234`. `ilsToAgorot('12.3')` equals `1230`. `ilsToAgorot('12')` equals `1200`.
- Reject more than two fraction digits: `ilsToAgorot('1.234')` throws `TypeError`.
- Negative handling: `ilsToAgorot('-5.50')` equals `-550` (refund lines).
- Round trip: `agorotToIls(ilsToAgorot(x))` for a table of values.
- Rounding happens once per line and never per unit. Percentage of an agorot amount uses `round-half-up` at the agorot boundary, and the test pins the edge percents: `0`, `0.01`, `10`, `12.5`, `33.33`, `99.99`, `100`.
- Allocation invariant: when splitting a total into parts, the parts sum back to the exact total (no lost or created agorot). This is the single most important money test.

```ts
import { describe, expect, it } from 'vitest'
import { agorot, agorotToIls, ilsToAgorot } from '@/lib/commerce/money'

describe('ilsToAgorot', () => {
  it('parses two fraction digits exactly', () => {
    expect(ilsToAgorot('12.34')).toBe(1234)
    expect(ilsToAgorot('12.3')).toBe(1230)
    expect(ilsToAgorot('12')).toBe(1200)
  })
  it('rejects three fraction digits', () => {
    expect(() => ilsToAgorot('1.234')).toThrow(TypeError)
  })
  it('round trips through agorotToIls', () => {
    for (const v of ['0.01', '99.99', '100.00', '-5.50']) {
      expect(agorotToIls(ilsToAgorot(v))).toBeCloseTo(Number(v), 2)
    }
  })
  it('never yields an unsafe integer silently', () => {
    expect(() => agorot(2 ** 53)).toThrow(RangeError)
  })
})
```

#### B. `settlement.ts` commission split (coupon vs physical)

Target file: `src/server/domain/orders/settlement.test.ts` (exists, extend). `calculateSettlement(input: SettlementInput): SettlementResult` is pure. Constants in the module today: `DEFAULT_PLATFORM_COMMISSION_PERCENT = 5`, `DEFAULT_COUPON_UPFRONT_PERCENT = 10`.

Note an open model decision recorded in STATE.md: the merged settlement uses a 5 percent default platform commission for physical, while the `cardcom-payments` skill states 10 percent. The tests must not hardcode a magic number as if it were settled. Instead each test passes the percent explicitly via the input and asserts the arithmetic. When Ofir decides the default, one test pins the default and the rest stay explicit.

Invariants to pin:

- Coupon line: `charged_on_site = coupon upfront amount` (10 percent by the current model), `balance_due_at_business = total_deal_price - charged_on_site`, `supplier_due_on_site = 0` (no escrow of the in-store 90 percent), `platform_fee = charged_on_site` (the platform keeps the whole on-site slice for a coupon).
- Physical line: `charged_on_site = full price`, `platform_fee = platform_percent of full price`, `supplier_due = charged_on_site - platform_fee`.
- Mixed cart (coupon line plus physical line) sums per line, never on the blended total. The STATE.md worked example is the golden case: coupon 18/162 split plus physical 230 gives on-site total 248, platform fee 41, supplier due 207.
- Every split satisfies the allocation invariant: the sum of `platform_fee + supplier_due + balance_due_at_business` reconstructs the deal total for that line.

```ts
import { describe, expect, it } from 'vitest'
import { calculateSettlement } from '@/server/domain/orders/settlement'

describe('calculateSettlement mixed cart golden case', () => {
  it('splits coupon and physical per line, not on the blended total', () => {
    const result = calculateSettlement({
      // coupon deal total 180, upfront 10 percent = 18, balance in store 162
      // physical 230, platform 5 percent = 11.5, supplier 218.5
      lines: [
        { kind: 'coupon', dealTotalAgorot: 18000, upfrontPercent: 10 },
        { kind: 'physical', priceAgorot: 23000, platformPercent: 5 },
      ],
    })
    expect(result.chargedOnSiteAgorot).toBe(18000 * 0.1 + 23000) // 24800
    // per line reconstruction, no agorot lost
    for (const line of result.lines) {
      expect(line.platformFeeAgorot + line.supplierDueAgorot + line.balanceDueAtBusinessAgorot)
        .toBe(line.dealTotalAgorot)
    }
  })
})
```

Adjust the field names to the real `SettlementLineInput` / `SettlementLineResult` shapes in `settlement.ts` when writing; the invariant assertions are what matter.

#### C. QR payload sign and verify

Two distinct signing surfaces, both live in pure or near pure functions.

1. Cardcom webhook HMAC, `src/lib/payments/hmac.ts`. `signCardcomBody(raw, secret)` and `verifyCardcomSignature(raw, header, secret)` are exported (the sign helper exists specifically as a test helper). Target file: `src/lib/payments/hmac.test.ts` (new).

   - A body signed with the secret verifies true.
   - Wrong secret verifies false.
   - Tampered body verifies false.
   - `sha256=` prefix and case are normalized (verifier lowercases and strips the prefix).
   - Missing header or missing secret verifies false (fail closed).
   - Length mismatch does not throw (constant-time compare guarded by a length check).

```ts
import { describe, expect, it } from 'vitest'
import { signCardcomBody, verifyCardcomSignature } from '@/lib/payments/hmac'

const SECRET = 'test-webhook-secret'
const BODY = JSON.stringify({ ResponseCode: 0, LowProfileId: 'lp_123', Amount: 24800 })

describe('verifyCardcomSignature', () => {
  it('accepts a correctly signed body, with or without the sha256= prefix', () => {
    const sig = signCardcomBody(BODY, SECRET)
    expect(verifyCardcomSignature(BODY, sig, SECRET)).toBe(true)
    expect(verifyCardcomSignature(BODY, `sha256=${sig.toUpperCase()}`, SECRET)).toBe(true)
  })
  it('rejects a tampered body', () => {
    const sig = signCardcomBody(BODY, SECRET)
    expect(verifyCardcomSignature(`${BODY} `, sig, SECRET)).toBe(false)
  })
  it('fails closed on a missing header or secret', () => {
    expect(verifyCardcomSignature(BODY, null, SECRET)).toBe(false)
    expect(verifyCardcomSignature(BODY, signCardcomBody(BODY, SECRET), '')).toBe(false)
  })
})
```

2. Coupon QR payload, `src/server/domain/orders/redemption.ts`. `verifyQrPayload(payload)` parses and verifies `KE|<code>|<orderItemId>|<expiresUnix>|<userId>|<sha256-32-hex>`, where the digest is the first 32 hex chars of `sha256("KE|<code>|<orderItemId>|<expiresUnix>|<userId>")`, compared constant-time. (This is a keyed SHA-256 payload signature, distinct from the Cardcom HMAC.) Target file: `src/server/domain/orders/redemption.test.ts` (exists, extend).

   - A payload produced by the issuer (mirror the digest construction in the test) verifies and returns the parsed parts.
   - Wrong field count, wrong prefix, or an empty field returns `null`.
   - `code` that is not 8 digits (`SHORT_CODE_PATTERN = /^\d{8}$/`) returns `null`.
   - Non integer or non positive `expiresUnix` returns `null`.
   - A flipped digest byte returns `null`.

#### D. `validateRedemption` guards

Pure gate in `redemption.ts`: `validateRedemption({ coupon, requestingSupplierId, now })` returns one of `not_found`, `wrong_supplier`, `already_used`, `refunded`, `expired`, `success`. This is the app side gate; the DB `UNIQUE(coupon_code_id)` is the final arbiter under concurrency (that path is exercised in E2E and integration, not here).

- `null` coupon returns `not_found`.
- Coupon belonging to another supplier returns `wrong_supplier` (a merchant cannot redeem someone else's coupon).
- Status `used`, `refunded`, `expired` map to their outcomes.
- `expiresAt` at or before `now` returns `expired` (boundary test at exactly equal timestamps).
- A valid, issued, unexpired coupon for the right supplier returns `success`.

```ts
import { describe, expect, it } from 'vitest'
import { validateRedemption } from '@/server/domain/orders/redemption'

const base = { supplierId: 'sup-1', status: 'issued' as const, expiresAt: '2099-01-01T00:00:00Z' }
const now = new Date('2026-07-23T00:00:00Z')

describe('validateRedemption', () => {
  it('rejects a coupon from another supplier', () => {
    expect(validateRedemption({ coupon: { ...base }, requestingSupplierId: 'sup-2', now }))
      .toBe('wrong_supplier')
  })
  it('rejects an already used coupon', () => {
    expect(validateRedemption({ coupon: { ...base, status: 'used' }, requestingSupplierId: 'sup-1', now }))
      .toBe('already_used')
  })
  it('treats expiry at exactly now as expired', () => {
    expect(validateRedemption({ coupon: { ...base, expiresAt: now.toISOString() }, requestingSupplierId: 'sup-1', now }))
      .toBe('expired')
  })
  it('passes a valid coupon for the right supplier', () => {
    expect(validateRedemption({ coupon: base, requestingSupplierId: 'sup-1', now })).toBe('success')
  })
})
```

#### E. Cart merge (pure merge logic)

The guest to authenticated cart merge is a known race (STATE.md T3): the current `mergeGuestCart` in `src/server/actions/cart.ts` is read-merge-write without a lock, and the design fix is an atomic RPC (`fn_merge_guest_cart` with an advisory lock). Split the concern:

- The pure quantity merge rule (when guest cart and user cart both contain a line, quantities combine; distinct lines union; invalid or out of stock lines are dropped or clamped) is unit tested against a pure helper. If the merge logic currently lives inline in the action, extract it into a pure `mergeCartLines(guestLines, userLines)` helper so it can be tested without Supabase. Target file: `src/server/actions/cart.merge.test.ts` (new).
- The atomicity of the merge (exactly one winner under a concurrent double merge) is not a unit test. It is an integration or E2E race test against the DB, since the guarantee comes from the advisory lock, not from JS.

### 1.3 Test structure

- Colocate: `foo.ts` is tested by `foo.test.ts` in the same directory. This is the existing convention and Vitest `include` already matches it.
- One `describe` per exported function, one `it` per invariant. Name the `it` after the invariant, not after the input.
- Golden cases (the worked money examples from STATE.md) live in a `describe('golden cases')` block per money module so they read as a specification.
- Pure functions get no mocks at all. If a function needs a mock to be tested, that is a signal to extract the pure core (as with cart merge, section E).

### 1.4 Fixtures and mocks for Supabase

Unit tests do not touch Supabase. The money, settlement, QR, redemption gate, and cart merge functions are all pure by design and must stay that way (money arithmetic lives in a pure module, server actions only call it).

For the thin layer that does call Supabase (the redeem route, the webhook handler, the finalize step), unit test the pure decision and integration test the persistence. When a unit test genuinely needs a Supabase client double, use a hand written fake, not a network call:

- A `createFakeSupabase(tables)` helper in `src/test/fake-supabase.ts` returns an object with `.from(table).select().eq()...` returning seeded rows and an insert that throws a `23505` unique violation when a duplicate key is inserted. This lets the redeem route's "second scan loses on `UNIQUE(coupon_code_id)`" branch be unit tested deterministically.
- Do not mock `@supabase/supabase-js` globally with `vi.mock`. Inject the client. The route already resolves an `admin` client; make it injectable in tests via a parameter or a module boundary so the fake can be passed in.
- Fixtures (a valid issued coupon row, a used coupon row, a settlement input) live in `src/test/fixtures/` as plain objects, typed against `src/types/database.ts`, and are imported by both unit and integration tests so the shapes never drift.

### 1.5 Coverage targets

- Money modules (`money.ts`, `commission.ts`, `settlement.ts`, `redemption.ts`, `hmac.ts`, the extracted cart merge helper): line and branch coverage floor 95 percent, enforced per file.
- Everything else: no floor, coverage reported for information only.
- The closed invariant list (section 1.2) overrides coverage. A file at 100 percent coverage that is missing the allocation invariant test still fails review.

Enable coverage in `vitest.config.ts`:

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./vitest.setup.ts'],
  globals: true,
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  exclude: ['node_modules', '.next', 'e2e'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json-summary', 'lcov'],
    thresholds: {
      'src/lib/commerce/money.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
      'src/lib/commerce/commission.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
      'src/server/domain/orders/settlement.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
      'src/server/domain/orders/redemption.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
      'src/lib/payments/hmac.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
},
```

CI runs `pnpm test -- --coverage`. A floor breach fails the job.

---

## 2. Playwright E2E

Playwright config today: chromium only, `locale he-IL`, `baseURL http://localhost:3000`, `webServer: pnpm dev`, retries 2 and workers 1 in CI. For CI the `webServer` command switches to `pnpm build && pnpm start` (a production build behaves differently from dev for RTL, caching, and server actions). E2E in CI runs against a locally built app plus a clean local Supabase stack plus a Cardcom stub. Real Cardcom and real Google OAuth never run in PR CI.

### 2.1 Flow A: checkout (guest cart to confirmed order)

Spec file: `e2e/checkout.spec.ts`.

Steps:

1. As a guest (no session), open a product page and add a coupon product and a physical product to the cart. Assert the cart drawer shows the split (on-site charge vs balance in store for the coupon line).
2. Go to `/checkout`, press Pay. The app requires auth at this point.
3. Authenticate as a seeded test user via email and password (not Google OAuth). The guest cart merges into the user cart; assert quantities merged correctly (this is the observable side of the T3 race fix).
4. Fill the shipping address for the physical line (writes `user_addresses`).
5. Begin checkout. The Cardcom Low Profile call is intercepted by the stub (section 2.3) and returns a hosted-page redirect that the stub short-circuits back to the app's return URL.
6. The Cardcom webhook fires (the test posts a signed webhook body to the webhook route, see 2.3). The order finalizes: coupon codes are issued with QR, escrow is held for the coupon in-store balance model, cashback is credited to the wallet, the cart is cleared.
7. Assert the success page: coupon card with an 8 digit code, a QR image, the amount to pay in store, and the expiry. Assert the order appears as confirmed and the cart is empty.

Tag: `@checkout @money`. This is a blocking smoke flow.

### 2.2 Flow B: coupon scan (issue, redeem, double scan)

Spec file: `e2e/redeem.spec.ts`.

Steps:

1. Seed an issued coupon for a known supplier and a merchant user who is a member of that supplier (`supplier_members`).
2. As the merchant, `POST /api/supplier/redeem` with the coupon short code (or QR payload). Assert 200 and `success`, and that `coupon_redemptions` now has one row and the coupon status is `used`.
3. Scan the same coupon a second time. Assert the response is `already_used` and that `coupon_redemptions` still has exactly one row (the `UNIQUE(coupon_code_id)` constraint is the arbiter).
4. Race variant (`@race`): fire two redeem requests concurrently with `Promise.all`. Assert exactly one returns `success` and exactly one returns `already_used`, and the row count is one. This is the real proof of the atomic single-use guarantee; the unit test only covers the app side gate.
5. Negative: a merchant of a different supplier scanning the coupon gets `wrong_supplier` and no row is written.

Tag: `@redeem @money @race`. Blocking.

### 2.3 Stubbing Cardcom

Cardcom is stubbed at the single HTTP boundary. There is one adapter around the Cardcom HTTP calls; in CI a fake stands in for the real Cardcom on the HTTP side.

Two interception points:

1. Outbound Low Profile create. In the E2E run, set `CHECKOUT_PROVIDER=mock` (the app already has an automatic mock provider in dev per STATE.md, "no sandbox credentials in env"). The mock provider returns a deterministic `LowProfileId` and a return URL, so no external host is contacted. Alternatively, use Playwright `page.route('**/api/cardcom/**', ...)` to fulfill the request with a canned response, but the env-driven mock provider is preferred because it also exercises the app's own return handling.
2. Inbound webhook. The test constructs the webhook body the app expects (approved transaction, matching amount in agorot, the `LowProfileId` from step 1), signs it with `signCardcomBody(body, CARDCOM_WEBHOOK_SECRET)` from `src/lib/payments/hmac.ts` using the CI test secret, and posts it to the webhook route with the `sha256=` header. The route verifies HMAC, then (in production) verifies against the Cardcom API; in CI that verify-against-API call also routes to the mock provider, which confirms the transaction. This proves the full verify path without a real terminal.

Never put a real Cardcom terminal number or secret in CI. The CI secret is a throwaway used only so sign and verify agree.

### 2.4 Seeding and teardown

- Seeding uses `supabase/seed.sql` (loaded only locally and in CI, never applied to the remote via MCP) plus a `tests/sql/90_test_support.sql` file in a `test_support` schema applied after the migrations in CI. Test users, a test supplier, supplier membership, and a couple of catalog products (one coupon enabled, one physical) are seeded there. No test tables ever land in a production migration.
- Each spec that mutates money state runs against a fresh stack, or resets the affected tables in `beforeEach` via a `test_support.reset()` SQL function that truncates `orders`, `order_items`, `payments`, `coupon_codes`, `coupon_redemptions`, `wallet_entries`, and `carts` and re-seeds the fixtures. Truncate order respects FKs.
- Test users are created in the local Auth (email plus password, or a session injected via the admin API). Google OAuth is never exercised in CI; the real OAuth flow is checked manually once before a release.
- Teardown is the reset function plus a global teardown that tears the stack down (`supabase stop`) in CI, which is free because the stack is disposable per run.

---

## 3. GitHub Actions pipeline

Stages, in order, gating merge into the target branch: lint (biome), typecheck (tsc), test (vitest with coverage floors), build (next build), then a visual diff gate via `scripts/compare.mjs` with a 30 percent threshold. E2E runs as its own job on the built app plus the local stack. Node is pinned (Node 22 LTS), pnpm comes from `packageManager`.

`scripts/compare.mjs` today screenshots the live reference (`refs/ke_live_singlefile.html`) and the local app at `http://localhost:3000`, then hands off to `scripts/diff-bands.mjs` which computes banded pixel and style diffs. In CI the local target is the freshly built app (`pnpm start`), and the gate fails when the overall diff versus the reference exceeds 30 percent. Today the homepage sits at roughly 22.5 percent versus the reference, so 30 percent is a real, passable gate with headroom, and it catches a regression that pushes the diff past that line.

### 3.1 `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [cursor/add-supabase-3c830, main]
  push:
    branches: [cursor/add-supabase-3c830, main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: 22

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm type-check

  test:
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/

  build:
    needs: [test]
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.CI_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.CI_SUPABASE_ANON_KEY }}
      NEXT_PUBLIC_APP_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: next-build
          path: .next/

  e2e:
    needs: [build]
    runs-on: ubuntu-latest
    env:
      CHECKOUT_PROVIDER: mock
      CARDCOM_WEBHOOK_SECRET: ci-test-webhook-secret
      NEXT_PUBLIC_APP_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Start local Supabase and apply migrations + seed
        run: |
          supabase start
          supabase db reset --local
          psql "$(supabase status --output json | jq -r '.DB_URL')" -f tests/sql/90_test_support.sql
      - run: pnpm exec playwright install --with-deps chromium
      - name: Run E2E against the production build
        run: pnpm exec playwright test
        env:
          E2E_WEB_COMMAND: pnpm start
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  visual-diff:
    needs: [build]
    runs-on: ubuntu-latest
    env:
      VISUAL_DIFF_THRESHOLD: '30'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: actions/download-artifact@v4
        with:
          name: next-build
          path: .next/
      - run: pnpm exec playwright install --with-deps chromium
      - name: Start built app
        run: pnpm start &
      - name: Wait for app
        run: npx --yes wait-on http://localhost:3000
      - name: Visual diff gate (fail if overall diff > 30 percent)
        run: node scripts/compare.mjs
```

For the visual gate to fail the job, `scripts/compare.mjs` (or the `diff-bands.mjs` it spawns) must exit non-zero when the overall diff exceeds `VISUAL_DIFF_THRESHOLD`. The script already spawns `diff-bands.mjs` and propagates its exit code; add a threshold check in `diff-bands.mjs` that reads `process.env.VISUAL_DIFF_THRESHOLD` (default 30) and exits 1 when the computed overall percentage is above it. This is the only change the pipeline needs in the existing tooling. Until the baseline stabilizes, the visual-diff job can be marked non-blocking (`continue-on-error` or excluded from required checks) and promoted to blocking once green consistently.

### 3.2 Stage rationale

- lint and typecheck run in parallel first (fast, no secrets, no services). A style or type break stops the pipeline cheaply.
- test needs both to pass, then runs unit plus coverage floors.
- build needs tests green, produces the `.next` artifact once, reused by e2e and visual-diff so the app is built exactly once.
- e2e and visual-diff both consume the build artifact and run in parallel. e2e brings up a local Supabase stack and the Cardcom mock; visual-diff only needs the running app and the reference HTML.

---

## 4. Preview deploys on Vercel per PR

Every PR gets a Vercel Preview deployment automatically (Vercel GitHub integration, no workflow needed for the deploy itself). The preview is a full running instance at a unique URL, useful for manual review and for a read-only slice of the visual gate.

### 4.1 Environment variables and secrets

Two homes for configuration:

- Vercel project env (Preview and Production scopes): the app runtime needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `CARDCOM_TERMINAL`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET`, and `CHECKOUT_ENABLED`. Preview scope points at the dev Supabase project and at Cardcom sandbox credentials (or `CHECKOUT_PROVIDER=mock` if no sandbox is available, which matches the current dev state). Production scope points at production Supabase and the real single Cardcom terminal.
- GitHub Actions secrets: `CI_SUPABASE_URL`, `CI_SUPABASE_ANON_KEY` for the build job, and a throwaway `CARDCOM_WEBHOOK_SECRET` for E2E signing. These never overlap with production values.

Important: `NEXT_PUBLIC_APP_URL` must be set in every environment. STATE.md records a bug where the Google OAuth `redirect_to` is built with `undefined` when `NEXT_PUBLIC_APP_URL` is missing in the action context. Setting it in Preview and Production scopes prevents that on deployed environments.

Preview never runs full money E2E. The preview shares the dev Supabase database, so writing real orders and coupons against it from CI is forbidden. Full money flows run only in the `e2e` job against the disposable local stack plus the Cardcom mock (section 2). This mirrors the existing rule: the shared dev DB is read-only from CI's perspective.

### 4.2 Diff gate against the preview URL

A second visual check runs against the live preview URL, separate from the local visual-diff job. This is a lightweight, read-only comparison of the deployed preview against the reference, and it is non-blocking (a warning) because the preview shares dev data and content differences (product counts, live catalog) legitimately move the pixel diff. Content-driven diff is not layout regression.

```yaml
name: Preview visual check

on:
  deployment_status:

jobs:
  preview-diff:
    if: github.event.deployment_status.state == 'success' && github.event.deployment_status.environment == 'Preview'
    runs-on: ubuntu-latest
    continue-on-error: true
    env:
      VISUAL_DIFF_THRESHOLD: '30'
      COMPARE_TARGET_URL: ${{ github.event.deployment_status.target_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - name: Visual diff against the preview URL
        run: node scripts/compare.mjs
```

For this to hit the preview instead of `localhost:3000`, `scripts/compare.mjs` must read a `COMPARE_TARGET_URL` env var and fall back to `http://localhost:3000` when it is unset. That is a small, backward compatible change to the existing script: it currently hardcodes `mine.goto('http://localhost:3000', ...)`; make that `process.env.COMPARE_TARGET_URL ?? 'http://localhost:3000'`. The blocking visual gate stays local (section 3: deterministic, no shared data); the preview check is informational.

---

## 5. Branch protection rules

The target branch for PRs is the current default branch `cursor/add-supabase-3c830` (renamed to `main` at cutover). The daily working branch is `phase5/homepage`. The project rule of "commit then push immediately" to the working branch stays; it is a backup. The protection is on the merge point, not on daily work.

### 5.1 Rules on the target branch (`cursor/add-supabase-3c830`, later `main`)

Configure in GitHub Settings, Branches, Branch protection rule (or a repository ruleset):

- No direct push. All changes land through a PR. Include administrators (the owner is not exempt, so an accidental direct push cannot bypass the pipeline).
- Require a pull request before merging.
- Require status checks to pass before merging, and require branches to be up to date before merging. Required checks (the blocking set):
  - `lint`
  - `typecheck`
  - `test`
  - `build`
  - `e2e`
  - `visual-diff` (promoted to required once the baseline is stable; until then it is present but not required, running as a warning)
- Require at least 1 approving review. With a single owner this is effectively a self review gate that forces the diff to be looked at before merge; when a second maintainer exists, require review from someone other than the author.
- Require conversation resolution before merging.
- Require linear history (squash or rebase merges only), which keeps the history readable and makes reverts clean.
- Do not allow force pushes and do not allow deletions on the target branch.

### 5.2 Working branch (`phase5/homepage`)

- No protection. Direct push is allowed (this is where daily autonomous work commits and pushes immediately per CLAUDE.md).
- CI still runs on push to the working branch (the `push` trigger in `ci.yml`), so breakage is visible early, but it does not block the working branch.
- A PR from `phase5/homepage` into the target branch is where the full required-checks gate applies. Nothing merges into the target branch without a green pipeline.

### 5.3 Promotion to production

Merging into the target branch after a green pipeline triggers the production build on Vercel, but publishing to the live domain requires manual approval (a Vercel production promotion or a protected environment gate). There is no ad hoc `vercel --prod`. Application rollback is Vercel Instant Rollback; database rollback is forward-only via a compensating migration, never a down migration, and migrations are applied to the remote only through the approved MCP path, never `supabase db push`.

---

## Appendix: file map

| Concern | File |
|---|---|
| Agorot money math | `src/lib/commerce/money.ts` + `money.test.ts` |
| Commission split (coupon vs physical) | `src/lib/commerce/commission.ts`, `src/server/domain/orders/settlement.ts` + `settlement.test.ts` |
| Cardcom webhook HMAC | `src/lib/payments/hmac.ts` + new `hmac.test.ts` |
| QR payload sign and verify | `src/server/domain/orders/redemption.ts` (`verifyQrPayload`) + `redemption.test.ts` |
| Redemption gate | `src/server/domain/orders/redemption.ts` (`validateRedemption`) |
| Redeem route, single-use arbiter | `src/app/api/supplier/redeem/route.ts` (`UNIQUE(coupon_code_id)`) |
| Cart merge | `src/server/actions/cart.ts` (extract pure `mergeCartLines` for unit test) |
| Checkout E2E | new `e2e/checkout.spec.ts` |
| Redeem E2E (incl. race) | new `e2e/redeem.spec.ts` |
| Test support SQL | new `tests/sql/90_test_support.sql`, `supabase/seed.sql` |
| Visual diff | `scripts/compare.mjs` + `scripts/diff-bands.mjs` (add threshold exit code + `COMPARE_TARGET_URL`) |
| CI pipeline | new `.github/workflows/ci.yml` |
| Preview visual check | new `.github/workflows/preview-visual.yml` |
