# Lighthouse CI Status Report

**Last updated:** 2026-10-27 21:38 UTC+7 (MAINTENANCE_LOOP_7)  
**Run:** localhost:3000 (pnpm start)  
**Total runs:** 6 per URL  
**Threshold:** ≥90 for Performance

## Summary

⚠️ **Home page FAILS performance threshold** — Optimization goal queued

---

## Results by Page

### Home Page (/)

| Category | Min | Avg | Max | Status |
|----------|-----|-----|-----|--------|
| Performance | 82 | 93 | 100 | ❌ FAIL |
| Accessibility | 100 | 100 | 100 | ✅ PASS |
| Best Practices | 100 | 100 | 100 | ✅ PASS |
| SEO | 100 | 100 | 100 | ✅ PASS |

**Issue:** Performance drops as low as 82 (minimum acceptable 90)  
**Variance:** 18-point spread across runs indicates intermittent slowness

### Products Page (/products)

| Category | Min | Avg | Max | Status |
|----------|-----|-----|-----|--------|
| Performance | 92 | 96 | 100 | ✅ PASS |
| Accessibility | 100 | 100 | 100 | ✅ PASS |
| Best Practices | 100 | 100 | 100 | ✅ PASS |
| SEO | 100 | 100 | 100 | ✅ PASS |

**Status:** Meets threshold consistently

---

## Assessment

❌ Home page performance unstable (min 82 vs target 90)  
✅ All other metrics pass  
✅ /products route stable and excellent  
⚠️ **Optimization goal queued**: PERF_HOME_PAGE_82

**Decision:** Immediate investigation needed. Likely causes:
- Initial page load waterfalls (FCP/LCP)
- Layout shift after hydration
- CSS/JS blocking in critical path
- Image optimization on hero section

---

## Next Steps

1. Profile home page load with Lighthouse throttling (4G/4CPU)
2. Audit render-blocking resources
3. Optimize Core Web Vitals on hero/fold
4. Re-run after changes: `pnpm lhci:autorun`
