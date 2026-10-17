# Smoke Test Suite Documentation

The smoke test suite validates critical application functionality after deployments.

## Running Smoke Tests

```bash
# Against localhost (default)
pnpm release:smoke

# Against staging
SMOKE_TEST_URL="https://staging.example.com" pnpm release:smoke

# Against production
SMOKE_TEST_URL="https://example.com" pnpm release:smoke
```

## Test Coverage

The suite runs 10 comprehensive tests:

### 1. Homepage Loads ✅
- **What:** Fetch homepage and verify HTTP 200
- **Why:** Critical — indicates basic server health
- **Failure means:** Server down, deploy broken, routing issue

### 2. Navigation Works ✅
- **What:** Verify navigation links are present
- **Why:** UI must be interactive
- **Failure means:** Navigation component broken, build issue

### 3. Product Page Loads ✅
- **What:** Fetch /products and verify products render
- **Why:** Core feature — users must see catalog
- **Failure means:** Database down, product query broken

### 4. Search Functionality ✅
- **What:** Verify search input is visible
- **Why:** Important UX feature
- **Failure means:** Search component broken or hidden

### 5. Cart Button Visible ✅
- **What:** Verify shopping cart button on page
- **Why:** Essential for purchases
- **Failure means:** Cart component broken

### 6. API Health Endpoint ✅
- **What:** Fetch /api/health (200 or 401)
- **Why:** Monitor backend health
- **Failure means:** API server issue

### 7. Sitemap Exists ✅
- **What:** Fetch /sitemap.xml and verify valid XML
- **Why:** SEO and discovery
- **Failure means:** Sitemap generation broken

### 8. Robots.txt Exists ✅
- **What:** Fetch /robots.txt
- **Why:** SEO and crawler direction
- **Failure means:** Static assets not serving

### 9. No Console Errors ✅
- **What:** Monitor browser console during page load
- **Why:** Catch JavaScript errors
- **Failure means:** Client-side errors (hydration, runtime, etc.)

### 10. Page Responsive ✅
- **What:** Load page at 375px width, verify no horizontal scroll
- **Why:** Mobile must work
- **Failure means:** CSS layout broken, viewport not set

## Test Results

### Passing Test Output
```
Testing: Homepage loads... ✅
Testing: Navigation works... ✅
Testing: Product page loads... ✅
Testing: Search functionality... ✅
Testing: Cart button visible... ✅
Testing: API health endpoint... ✅
Testing: Sitemap exists... ✅
Testing: Robots.txt exists... ✅
Testing: No console errors... ✅
Testing: Page responsive... ✅

📊 Results: 10 passed, 0 failed
```

### Failure Example
```
Testing: Homepage loads... ✅
Testing: Navigation works... ✅
Testing: Product page loads... ❌ No products found
Testing: Search functionality... ✅
Testing: Cart button visible... ✅
Testing: API health endpoint... ❌ HTTP 500
Testing: Sitemap exists... ❌ HTTP 404
Testing: Robots.txt exists... ✅
Testing: No console errors... ❌ Console errors: TypeError: Cannot read property 'map' of null
Testing: Page responsive... ✅

📊 Results: 7 passed, 3 failed
```

## When Tests Run

Tests run automatically in these workflows:

### 1. Before Promotion (Optional)
```bash
# Skip tests with --skip-tests flag
pnpm release:promote --skip-tests

# Default (runs tests)
pnpm release:promote
```

### 2. After Promotion (Required)
Once deployment is promoted to production, smoke tests run to verify:
- Release is healthy
- No critical issues introduced
- Core features work

### 3. Manual Validation
```bash
# Test any URL
SMOKE_TEST_URL="https://example.com" pnpm release:smoke
```

## Exit Codes

- **0** — All tests passed, safe to proceed
- **1** — One or more tests failed, review immediately

## Integration with Promotion Workflow

The promote script flow:

```
1. Fetch deployment → 2. Promote to production → 3. Run smoke tests
   (from Vercel)     (update DNS aliases)        (validate health)
         ✅                  ✅                        ❌ → Alert!
         │                   │                         │
         └─────────────────────────────────────────────┘
                    Record results in .last-promotion
```

If smoke tests fail after promotion:
- Results are recorded (for incident review)
- Alert is logged
- No automatic rollback (manual decision)
- Team investigates and decides to rollback if needed

## Customizing Tests

To add more tests, edit `scripts/smoke-test.mjs`:

```javascript
const tests = [
  {
    name: 'Custom feature works',
    test: async () => {
      const response = await fetch('https://example.com/custom-feature')
      return response.status === 200
    }
  }
  // ... add more tests
]
```

## Performance Considerations

Each test:
- Runs sequentially (not parallel)
- Has 10-second timeout per fetch
- Uses real HTTP requests (no mocking)
- Waits for page to load completely

Typical run time: **15-30 seconds**

## Browser Requirements

Tests use Playwright (headless Chromium):
- Requires `@playwright/test` (in devDependencies)
- Runs headless (no UI)
- Navigates real web pages
- Detects runtime errors

## Troubleshooting

### Test: "Homepage loads... ❌ HTTP 500"
- Server error — check backend logs
- Database connection issue — verify Supabase
- Deployment not ready — wait for build to complete

### Test: "No console errors... ❌ Console errors: ReferenceError"
- JavaScript error in application
- Likely: component render error, missing import, hydration mismatch
- Review: Recent commits, CSS changes, component updates

### Test: "Page responsive... ❌ Body width 425 > viewport 375"
- CSS overflow on mobile
- Check: width: 100vw (should be width: 100%)
- Check: margin/padding causing overflow

### All tests timeout
- Network issue (VPN, DNS, proxy)
- Server down (health check endpoint first)
- Deployment URL incorrect

## Best Practices

1. **Run before promoting** — Catch issues before production
2. **Run after promoting** — Verify production is healthy
3. **Monitor trends** — Same test failing repeatedly means root issue
4. **Review failures** — Always investigate, don't ignore
5. **Extend tests** — Add critical features specific to your app
6. **Schedule runs** — Daily smoke tests against production

## Related Documentation

- [Release Workflow Example](./RELEASE-WORKFLOW-EXAMPLE.md)
- [Release Engineering Guide](./RELEASE.md)
- [Deployment Checklist](./DEPLOYMENT-CHECKLIST.md)
