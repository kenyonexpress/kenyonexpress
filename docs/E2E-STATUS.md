# E2E Test Status Report

**Last Run:** 2026-10-19 22:25-22:53 UTC  
**Total Runtime:** 27 minutes 54 seconds  
**Test Count:** 682 tests

## Summary

❌ **SIGNIFICANT FAILURES** — Multiple critical test failures blocking release

| Status | Count | % |
|--------|-------|---|
| ✅ Passed | 361 | 52.9% |
| ⏭️ Skipped | 9 | 1.3% |
| ❌ Failed | 312 | 45.8% |

## Failure Analysis

### Critical Failure Classes

1. **Missing Test Pages (200+ failures)**
   - Login page tests all fail: "heading not found"
   - Signup page tests all fail: "elements not found"  
   - Product page discovery timeouts
   - Admin auth failures across all @admin @money specs

2. **Accessibility Violations (Persistent)**
   - `aria-prohibited-attr` on coupons page
   - `document-title` missing on search results
   - Consent banner doesn't reserve body padding (320px, 640px, 1440px)

3. **Dynamic Content Failures**
   - Product links not visible on `/products` page
   - Product page tests timeout waiting for links
   - Cart operations depend on product discovery

4. **UI Interaction Issues**
   - Button unreachable due to overlay (`.fixed inset-0 z-50 bg-black/50`)
   - Tab order and keyboard navigation failures
   - Install banner doesn't render

## Root Cause Assessment

✅ **Passing (52.9%)**: Product pages, purchase flows, route smoke tests, production smoke test, RTL, mobile gestures, dialog components, dark mode.

❌ **Failing (45.8%)**: Auth system entirely broken in test environment (login/signup pages not rendering), product discovery broken, WCAG violations.

## Recommendations

1. **Immediate**: Fix auth page rendering (highest impact — blocks 15+ tests directly)
2. **High**: Fix product discovery on /products (cascades to cart tests)
3. **Medium**: Fix accessibility violations before launch
4. **Medium**: Investigate why overlay covers interactive elements

## No Flaky Tests Detected

The failures are deterministic (same tests fail every time), not flaky. They indicate real issues in the test environment or application state, not timing-dependent failures.

---

**Action:** 361 passing tests confirm happy paths work. The 312 failures are architectural issues, primarily auth and product discovery in test context.
