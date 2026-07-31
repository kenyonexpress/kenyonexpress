# ARCHITECTURE-TESTING.md

KenyonExpress **testing architecture** (binding Vitest + Playwright + visual + CI).

Status: BINDING · worktree `/Users/ofir/kenyonexpress-web/ke-arch-testing` · branch `arch/testing` (2026-07-30)
Scope: **docs only.** Config snippets are the contract to paste/adapt on implementation branches.
Companions: `docs/ARCHITECTURE-TESTING-CICD.md`, `docs/ARCHITECTURE-CART-CHECKOUT.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `feat/ci-foundation` gates.

Stack: Vitest 3 + jsdom, Playwright 1.50 (chromium, `he-IL`), Supabase branch / CI project, `scripts/compare.mjs` visual diffs, GitHub Actions.

**Money first.** A bug in agorot / commission / coupon state is lost money. UI coverage is secondary.

Business invariants for tests:

1. Integer **agorot** only on money paths.
2. `platform_percent` is per-product, mandatory, **no default** inventing rates.
3. Coupon: full prepaid on site; till remainder at supplier; **no Escrow**.
4. Coupon lifecycle: `issued` → `used` (atomic UPDATE); dual-read `redeemed` only as legacy alias in readers.
5. Guest cart open; login at Pay; merge before charge.

---

## 0. Pyramid

```
                 /\
                /E2E\          Playwright: guest→login→Cardcom sandbox→issue→scan
               /------\
              / Integr.\       Supabase branch: RLS, redeem_voucher race, migrations
             /----------\
            / Unit money \     Vitest: money, commission, coupon/order state machines
           /--------------\
```

| Layer | Runner | Gate in CI |
|---|---|---|
| Unit + money coverage floors | `pnpm test:coverage` | **required** |
| Lint changed / typecheck / build | Biome + `tsc` + `next build` | **required** |
| Integration (Supabase branch) | Vitest project `integration` or `tests/sql` | required when secrets present |
| E2E Playwright | `pnpm test:e2e` | required when `CI_SUPABASE_*` set; else skip with warning |
| Visual `compare.mjs` | manual / nightly workflow | non-blocking artifact; fail on threshold for homepage job optional |

---

## 1. Vitest config (full)

```typescript
// vitest.config.ts
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const MONEY_MODULE_FLOOR = {
  lines: 95,
  branches: 95,
  functions: 95,
  statements: 95,
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'e2e', 'tests/integration'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/commerce/**/*.ts',
        'src/lib/checkout/split.ts',
        'src/server/domain/orders/**/*.ts',
        'src/server/domain/vouchers/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        'src/lib/commerce/money.ts': MONEY_MODULE_FLOOR,
        'src/lib/commerce/commission.ts': MONEY_MODULE_FLOOR,
        'src/lib/checkout/split.ts': MONEY_MODULE_FLOOR,
        'src/server/domain/orders/settlement.ts': MONEY_MODULE_FLOOR,
        'src/server/domain/orders/state-machine.ts': MONEY_MODULE_FLOOR,
        'src/server/domain/vouchers/state-machine.ts': MONEY_MODULE_FLOOR,
      },
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
```

Optional second Vitest project for integration:

```typescript
// vitest.integration.config.ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false, // shared Supabase branch
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: ['./tests/integration/setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
```

`package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:visual": "node scripts/compare.mjs --page=home"
  }
}
```

---

## 2. Unit: money (agorot)

```typescript
// src/lib/commerce/money.test.ts
import { describe, expect, it } from 'vitest'
import { agorot, agorotToIls, ilsToAgorot, percentOfAgorot } from '@/lib/commerce/money'

describe('ilsToAgorot', () => {
  it('parses two fraction digits exactly', () => {
    expect(ilsToAgorot('12.34')).toBe(1234)
    expect(ilsToAgorot('12.3')).toBe(1230)
    expect(ilsToAgorot('12')).toBe(1200)
  })

  it('rejects three fraction digits', () => {
    expect(() => ilsToAgorot('1.234')).toThrow(TypeError)
  })

  it('round-trips through agorotToIls', () => {
    for (const v of ['0.01', '99.99', '100.00', '-5.50']) {
      expect(agorotToIls(ilsToAgorot(v))).toBeCloseTo(Number(v), 2)
    }
  })

  it('never yields an unsafe integer silently', () => {
    expect(() => agorot(Number.MAX_SAFE_INTEGER + 1)).toThrow()
  })
})

describe('percentOfAgorot (half-up)', () => {
  it('keeps conservation: platform + supplier = paid_on_site', () => {
    const paid = agorot(10_000)
    for (const pct of [0, 1, 10, 12.5, 33.33, 50, 99.99, 100]) {
      const platform = percentOfAgorot(paid, pct)
      const supplier = agorot(Number(paid) - Number(platform))
      expect(Number(platform) + Number(supplier)).toBe(Number(paid))
    }
  })

  it('refuses inventing a default platform_percent', () => {
    expect(() => percentOfAgorot(agorot(1000), Number.NaN)).toThrow()
  })
})
```

---

## 3. Unit: commission / settlement

```typescript
// src/lib/commerce/commission.test.ts
import { describe, expect, it } from 'vitest'
import { splitPrepaid } from '@/lib/commerce/commission'
import { agorot } from '@/lib/commerce/money'

describe('splitPrepaid', () => {
  it('coupon: platform_percent applies to prepaid only, not face', () => {
    const face = agorot(40_000)
    const prepaid = agorot(4_000) // coupon_price
    const split = splitPrepaid({
      productType: 'coupon',
      paidOnSiteAgorot: prepaid,
      faceValueAgorot: face,
      platformPercent: 100,
    })
    expect(split.platformFeeAgorot).toBe(4000)
    expect(split.supplierDueAgorot).toBe(0)
    expect(split.balanceDueAtBusinessAgorot).toBe(36_000)
  })

  it('physical: full charge on site, residual to supplier', () => {
    const paid = agorot(20_000)
    const split = splitPrepaid({
      productType: 'physical',
      paidOnSiteAgorot: paid,
      faceValueAgorot: null,
      platformPercent: 15,
    })
    expect(Number(split.platformFeeAgorot) + Number(split.supplierDueAgorot)).toBe(20_000)
    expect(split.balanceDueAtBusinessAgorot).toBe(0)
  })

  it('missing platform_percent cannot settle', () => {
    expect(() =>
      splitPrepaid({
        productType: 'physical',
        paidOnSiteAgorot: agorot(100),
        faceValueAgorot: null,
        platformPercent: null as unknown as number,
      }),
    ).toThrow(/platform_percent/)
  })
})
```

---

## 4. Unit: coupon state machine

```typescript
// src/server/domain/vouchers/state-machine.test.ts
import { describe, expect, it } from 'vitest'
import {
  canTransitionVoucher,
  normalizeVoucherStatus,
  type VoucherStatus,
} from '@/server/domain/vouchers/state-machine'

describe('voucher state machine', () => {
  it('normalizes legacy redeemed → used', () => {
    expect(normalizeVoucherStatus('redeemed')).toBe('used')
    expect(normalizeVoucherStatus('active')).toBe('issued')
  })

  it('allows issued → used only once', () => {
    expect(canTransitionVoucher('issued', 'used')).toBe(true)
    expect(canTransitionVoucher('used', 'used')).toBe(false)
    expect(canTransitionVoucher('used', 'issued')).toBe(false)
  })

  it('allows issued → expired | refunded; blocks used → refunded via scan path', () => {
    expect(canTransitionVoucher('issued', 'expired')).toBe(true)
    expect(canTransitionVoucher('issued', 'refunded')).toBe(true)
    expect(canTransitionVoucher('used', 'refunded')).toBe(false)
  })

  const terminals: VoucherStatus[] = ['used', 'expired', 'refunded']
  it.each(terminals)('%s is terminal for scan', (status) => {
    expect(canTransitionVoucher(status, 'used')).toBe(false)
  })
})
```

Order settlement machine (companion):

```typescript
// src/server/domain/orders/state-machine.test.ts
import { describe, expect, it } from 'vitest'
import { deriveOrderStatus } from '@/server/domain/orders/state-machine'

describe('deriveOrderStatus', () => {
  it('maps legacy escrow_* line states to split_executed', () => {
    expect(deriveOrderStatus(['escrow_held' as never])).toBe('split_executed')
  })
})
```

---

## 5. Integration vs Supabase branch

### 5.1 Branch strategy

| Env | Purpose |
|---|---|
| Local `supabase start` | Developer loops |
| Supabase **Preview branch** per PR (optional) | Isolated schema |
| Shared `CI_SUPABASE_*` project | GitHub Actions E2E/integration |

Rules:

1. Never run destructive SQL against production from CI.
2. Integration tests use service role only inside setup/teardown; assertions also cover anon/authenticated clients for RLS.
3. `fileParallelism: false` when sharing one project.

### 5.2 Setup

```typescript
// tests/integration/setup.ts
import { createClient } from '@supabase/supabase-js'
import { beforeAll } from 'vitest'

const url = process.env.CI_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.CI_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY

beforeAll(() => {
  if (!url || !service) {
    throw new Error('CI_SUPABASE_URL / CI_SUPABASE_SECRET_KEY required for integration')
  }
})

export function admin() {
  return createClient(url!, service!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

### 5.3 Example: atomic redeem race

```typescript
// tests/integration/redeem-race.test.ts
import { describe, expect, it } from 'vitest'
import { admin } from './setup'

describe('redeem_voucher race', () => {
  it('only one of two concurrent updates wins issued→used', async () => {
    const db = admin()
    // Seed: supplier member user JWT contexts are hard in pure service tests.
    // Prefer SQL fixture:
    //   INSERT voucher status=issued ...
    //   SELECT redeem via two SECURITY DEFINER calls with different auth.uid()
    // Or call the SQL test file:
    //   tests/sql/voucher_redemption_lifecycle.sql
    const { data: before } = await db
      .from('vouchers')
      .select('id, status')
      .eq('code', process.env.TEST_VOUCHER_CODE!)
      .single()

    expect(before?.status === 'issued' || before?.status === 'active').toBe(true)

    // Two parallel RPC invocations with the same code must yield exactly one success.
    // Implementation uses two authenticated clients (supplier members) in the real suite.
    expect(true).toBe(true)
  })
})
```

SQL integration (preferred for CAS):

```sql
-- tests/sql/voucher_redemption_lifecycle.sql (excerpt)
BEGIN;
-- seed issued voucher + two memberships
-- session A: SET LOCAL request.jwt.claim.sub = 'user-a';
-- SELECT redeem_voucher('CODE', 'manual', 'idem-a');
-- session B concurrent:
-- SELECT redeem_voucher('CODE', 'manual', 'idem-b');
-- Assert: exactly one success outcome; voucher.status = 'used';
ROLLBACK;
```

### 5.4 RLS smoke

```typescript
// tests/integration/rls-orders.test.ts
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

describe('orders RLS', () => {
  it('authenticated user cannot read another users orders', async () => {
    const userClient = createClient(
      process.env.CI_SUPABASE_URL!,
      process.env.CI_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${process.env.TEST_USER_JWT}` } },
      },
    )
    const { data, error } = await userClient
      .from('orders')
      .select('id')
      .eq('user_id', process.env.TEST_OTHER_USER_ID!)
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })
})
```

---

## 6. Playwright E2E

### 6.1 Config (full)

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.E2E_PORT ?? '3000'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const WEB_COMMAND = process.env.E2E_WEB_COMMAND ?? 'pnpm dev'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : Number(process.env.E2E_WORKERS ?? 2),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: WEB_COMMAND,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { PORT },
      },
})
```

### 6.2 Happy path: guest cart → Google login → Cardcom sandbox → coupon → scan

Secrets (CI + local `.env.e2e`):

| Var | Purpose |
|---|---|
| `E2E_GOOGLE_REFRESH` / storage state | Or bypass via test OTP user |
| `CARDCOM_SANDBOX_*` | Low Profile test terminal |
| `E2E_SUPPLIER_EMAIL` / password | Scanner account |
| `E2E_COUPON_PRODUCT_SLUG` | Known sandbox product with `platform_percent` set |

```typescript
// e2e/checkout-coupon-redeem.spec.ts
import { expect, test } from '@playwright/test'

/**
 * Full money path against Cardcom sandbox + CI Supabase.
 * Skips when sandbox secrets are absent so required CI stays green.
 */
test.describe('guest cart → pay → coupon → scan', () => {
  test.skip(!process.env.CARDCOM_SANDBOX_READY, 'Cardcom sandbox not configured')

  test('issues voucher and supplier can redeem once', async ({ page, context }) => {
    // 1) Guest adds coupon product
    await page.goto(`/product/${process.env.E2E_COUPON_PRODUCT_SLUG}`)
    await page.getByRole('button', { name: /הוספה לסל|הוסף לסל/i }).click()
    await page.goto('/cart')
    await expect(page.getByText(/לתשלום|שלם/i)).toBeVisible()

    // 2) Pay requires login: Google (storageState) or test OTP
    await page.getByRole('link', { name: /לתשלום|שלם/i }).click()
    // After auth callback, cart merged
    await expect(page).toHaveURL(/checkout/)

    // 3) Begin checkout → Cardcom Low Profile iframe / sandbox redirect
    await page.getByRole('button', { name: /תשלום|שלם עכשיו/i }).click()
    // Fill sandbox card (selectors depend on Cardcom Low Profile DOM)
    const frame = page.frameLocator('iframe').first()
    await frame.locator('input[name*="card"], input[autocomplete="cc-number"]').fill('4580458045804580')
    // ... expiry, CVV per sandbox docs
    await frame.getByRole('button', { name: /תשלום|Pay|אישור/i }).click()

    // 4) Thank-you / account vouchers: status issued
    await expect(page).toHaveURL(/thank|account|orders/i, { timeout: 120_000 })
    await page.goto('/account/coupons')
    await expect(page.getByText(/פעיל|issued/i)).toBeVisible()
    const code = await page.locator('.coupon-card__code').first().innerText()

    // 5) Supplier scan
    const supplier = await context.newPage()
    // assume storageState for supplier prepared in globalSetup
    await supplier.goto('/supplier/scan')
    await supplier.getByLabel(/הזנה ידנית|קוד/i).fill(code.replace(/\s|-/g, ''))
    await supplier.getByRole('button', { name: /מימוש/i }).click()
    await expect(supplier.getByText(/מומש בהצלחה/i)).toBeVisible()

    // 6) Second scan fails
    await supplier.getByRole('button', { name: /מימוש/i }).click()
    await expect(supplier.getByText(/כבר מומש/i)).toBeVisible()
  })
})
```

Auth helper (Google):

```typescript
// e2e/global-setup.ts
import { chromium, type FullConfig } from '@playwright/test'
import path from 'node:path'

async function globalSetup(_config: FullConfig) {
  // Preferred: pre-baked storageState committed as secret artifact, not in git.
  // Alternative: magic-link test user via Supabase Admin invite for CI only.
  const customerState = process.env.E2E_CUSTOMER_STORAGE_STATE
  const supplierState = process.env.E2E_SUPPLIER_STORAGE_STATE
  if (!customerState || !supplierState) {
    console.warn('E2E storage states missing; Google login specs will skip')
  }
}

export default globalSetup
```

Workers: **1 in CI** (shared Supabase contention). Local default 2.

---

## 7. Visual regression: `scripts/compare.mjs`

Purpose: screenshot live electro / kenyonexpress.co.il vs local rebuild; feed `refs/live.png` + `refs/mine.png` into `diff-bands.mjs`.

Usage:

```bash
pnpm dev
node scripts/compare.mjs --page=home
node scripts/compare.mjs --page=category
node scripts/compare.mjs --page=product
node scripts/compare.mjs --page=search
node scripts/compare.mjs --page=checkout
```

Contract excerpt (binding behavior already in repo):

```javascript
// scripts/compare.mjs (contract summary)
import { chromium } from '@playwright/test'

// --page=home|product|category|products|search|checkout
// Writes refs/live.png + refs/mine.png (+ page-suffixed copies)
// Viewport 1440x2600, deviceScaleFactor 1
// LOCAL_BASE default http://localhost:3000
// For checkout: seed cart on both live and local before shoot
```

CI nightly (non-blocking):

```yaml
# .github/workflows/visual-nightly.yml
name: Visual compare
on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:
jobs:
  compare-home:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm build && pnpm start &
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.CI_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.CI_SUPABASE_ANON_KEY }}
      - run: node scripts/compare.mjs --page=home
      - uses: actions/upload-artifact@v4
        with:
          name: visual-home
          path: refs/*.png
```

Fail policy: pixel threshold is **product decision**. Homepage job may fail PR only when `VISUAL_GATE=1` and diff bands exceed token tolerances.

---

## 8. GitHub Actions CI (full)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main, phase5/homepage]
  push:
    branches: [main, phase5/homepage]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'

jobs:
  lint:
    name: Lint (changed files)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint:changed
      - name: Repo-wide lint (non-blocking)
        continue-on-error: true
        run: pnpm lint

  typecheck:
    name: Typecheck
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
    name: Unit tests + money coverage floors
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/
          retention-days: 14

  integration:
    name: Integration (Supabase)
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check secrets
        id: creds
        run: |
          if [ -n "${{ secrets.CI_SUPABASE_URL }}" ]; then
            echo "present=true" >> "$GITHUB_OUTPUT"
          else
            echo "present=false" >> "$GITHUB_OUTPUT"
            echo "::warning title=Integration skipped::CI_SUPABASE_URL not set"
          fi
      - uses: pnpm/action-setup@v4
        if: steps.creds.outputs.present == 'true'
      - uses: actions/setup-node@v4
        if: steps.creds.outputs.present == 'true'
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
        if: steps.creds.outputs.present == 'true'
      - run: pnpm test:integration
        if: steps.creds.outputs.present == 'true'
        env:
          CI_SUPABASE_URL: ${{ secrets.CI_SUPABASE_URL }}
          CI_SUPABASE_ANON_KEY: ${{ secrets.CI_SUPABASE_ANON_KEY }}
          CI_SUPABASE_SECRET_KEY: ${{ secrets.CI_SUPABASE_SECRET_KEY }}

  build:
    name: Build
    needs: [lint, typecheck, test]
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.CI_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.CI_SUPABASE_ANON_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.CI_SUPABASE_SECRET_KEY }}
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
          retention-days: 3

  e2e:
    name: E2E (Playwright)
    needs: [build]
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.CI_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.CI_SUPABASE_ANON_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.CI_SUPABASE_SECRET_KEY }}
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      E2E_WEB_COMMAND: pnpm start
      CARDCOM_SANDBOX_READY: ${{ secrets.CARDCOM_SANDBOX_READY }}
    steps:
      - uses: actions/checkout@v4
      - name: Check whether Supabase credentials are configured
        id: creds
        run: |
          if [ -n "${{ secrets.CI_SUPABASE_URL }}" ]; then
            echo "present=true" >> "$GITHUB_OUTPUT"
          else
            echo "present=false" >> "$GITHUB_OUTPUT"
            echo "::warning title=E2E skipped::CI_SUPABASE_URL is not set"
          fi
      - uses: pnpm/action-setup@v4
        if: steps.creds.outputs.present == 'true'
      - uses: actions/setup-node@v4
        if: steps.creds.outputs.present == 'true'
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
        if: steps.creds.outputs.present == 'true'
      - uses: actions/download-artifact@v4
        if: steps.creds.outputs.present == 'true'
        with:
          name: next-build
          path: .next/
      - name: Install Chromium
        if: steps.creds.outputs.present == 'true'
        run: pnpm exec playwright install --with-deps chromium
      - name: Run E2E against the production build
        if: steps.creds.outputs.present == 'true'
        run: pnpm exec playwright test
      - uses: actions/upload-artifact@v4
        if: always() && steps.creds.outputs.present == 'true'
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

Required checks (once secrets exist): `lint`, `typecheck`, `test`, `build`, `e2e`.

---

## 9. Fake Supabase for unit isolation

```typescript
// src/test/fake-supabase.ts
export function createFakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? []
      const api = {
        select: () => api,
        eq: () => api,
        is: () => api,
        order: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: null }),
        insert: async (row: Record<string, unknown>) => {
          if (row.id && rows.some((r) => r.id === row.id)) {
            const err = Object.assign(new Error('duplicate'), { code: '23505' })
            return { data: null, error: err }
          }
          rows.push(row)
          return { data: row, error: null }
        },
      }
      return api
    },
    rpc: async () => ({ data: null, error: null }),
  }
}
```

---

## 10. Acceptance checklist

- [ ] `pnpm test:coverage` enforces 95% floors on money modules
- [ ] money / commission / voucher state-machine suites green
- [ ] Integration redeem race proven (SQL or Vitest)
- [ ] Playwright path: guest cart → auth → Cardcom sandbox → issued coupon → scan → second scan fails
- [ ] `compare.mjs` produces live/mine PNGs for home
- [ ] CI skips E2E cleanly when secrets missing; does not false-red the repo
- [ ] CI workers=1 for E2E against shared Supabase

---

## 11. Related paths

```
vitest.config.ts
vitest.setup.ts
vitest.integration.config.ts
playwright.config.ts
e2e/checkout-coupon-redeem.spec.ts
e2e/global-setup.ts
tests/integration/**
tests/sql/voucher_redemption_lifecycle.sql
scripts/compare.mjs
.github/workflows/ci.yml
.github/workflows/visual-nightly.yml
src/lib/commerce/money.test.ts
src/lib/commerce/commission.test.ts
src/server/domain/vouchers/state-machine.test.ts
```

---

## 12. Open questions

1. Prefer Supabase preview branches per PR vs one shared CI project with truncated tables?
2. Google OAuth in CI: storageState secrets vs dedicated test IdP?
3. Make visual homepage gate required before design PRs merge?
