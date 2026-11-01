# C22: E2E Test Failure

## Test Run Evidence
```
pnpm exec playwright test e2e/admin-product-import.spec.ts --project=chromium
```

## Results
**4/4 FAILED** (not self-skipped)

All failures: `TimeoutError: page.waitForURL: Timeout 20000ms exceeded`

### Failure Pattern
All tests fail at `signInWithEmail()` line 47:
```typescript
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
```

## Root Cause
1. **No dev server running** - E2E tests require a running Next.js dev server
2. **No seeded database** - Tests need `pnpm seed:test` to create admin fixtures

## Required Setup (Not Run)
```bash
# Terminal 1: Start dev server
pnpm dev

# Terminal 2: Seed test data
pnpm seed:test

# Terminal 3: Run tests
pnpm exec playwright test e2e/admin-product-import.spec.ts
```

## Test Design
Created 4 test cases following existing admin E2E pattern:
1. Import page accessibility + template download link
2. Dry-run preview workflow
3. Commit button after successful preview
4. Invalid CSV error handling

Pattern matches: `e2e/admin-product-crud.spec.ts`

## Conclusion
Tests **created** but **not passing**. Require manual dev server + seed setup.
