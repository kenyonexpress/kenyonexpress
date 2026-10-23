# C07: Mobile Gate cart + checkout + /thank-you under 11% - RESULT

**Date:** 2026-10-23  
**Branch:** autopilot  
**Goal:** Verify cart, checkout, and /thank-you pages are currently under 11% parity at mobile widths (380/768/1440)

## Summary

**RESULT: BLOCKED/UNACHIEVABLE - Current measurements invalid due to degraded references**

### Cart Page
- **Historical (2026-09-07, commit 8c4d4960b-dirty):**
  - 380px: 10.07% ✓ PASS
  - 768px: 10.57% ✓ PASS
  - 1440px: 8.16% ✓ PASS

- **Current (2026-10-23):**
  - 380px: 40.01% ✗ FAIL (ref 85 failed to load: 54 script, 31 stylesheet)
  - 768px: 39.49% ✗ FAIL (ref 85 failed to load: 54 script, 31 stylesheet)
  - 1440px: 27.91% ✗ FAIL (ref 85 failed to load: 54 script, 31 stylesheet)

### Checkout Page
- **Historical (2026-09-07, commit 8c4d4960b-dirty):**
  - 380px: 10.59% ✓ PASS
  - 768px: 10.10% ✓ PASS
  - 1440px: 10.71% ✓ PASS

- **Current:** Not re-measured (same degraded reference issue expected)

### /thank-you Page (aka /checkout/return)
- **Status:** UNMEASURABLE
- **Reason:** No reference baseline exists in refs/localized/
- Available references: cart, checkout, home, product, category, products, search
- Missing: ke_live_return.html or ke_live_thank_you.html

## Root Cause: Degraded Reference

From `scripts/compare.mjs` lines 80-127:

> THE LIVE REFERENCE NO LONGER EXISTS, AND THE CONSTANTS ABOVE ARE NOW ARCHIVE
> LABELS RATHER THAN FETCH TARGETS.
>
> kenyonexpress.co.il stopped serving WordPress: the DNS was cut to Vercel and
> the host now serves THIS app.
>
> THE SNAPSHOT IS DEGRADED, AND THE NUMBER IT PRODUCES IS NOT THE OLD NUMBER.
> Measured 2026-09-08 by loading refs/localized/ke_live_home.html in Chromium:
> 49 images, ZERO broken - the localizer did its job on imagery - but 96 failed
> requests.
>
>   37  font        Open Sans and two Font Awesome families
>   57  script      Elementor Pro element-handlers, Electro's theme bundles,
>                   handlebars, typeahead, iziModal, the minified cache bundles
>    1  stylesheet  the cached Google-Fonts CSS
>    1  xhr
>
> So the reference does not merely render in fallback type: IT RUNS NONE OF THE
> THEME'S JAVASCRIPT. Carousels, tabs, the mega-menu and the sticky header
> never initialise

The reference snapshots are missing fonts, scripts, and stylesheets. This causes
inflated diff percentages that don't reflect actual layout fidelity.

## Conclusion

1. **Current measurements FAIL** - Cart at 40%+ across all widths
2. **Current failures are measurement artifacts**, not implementation regressions (missing fonts/scripts in reference)
3. **The /thank-you page cannot be measured** - no baseline was captured before DNS cutover
4. **Goal cannot be achieved** with degraded references

## Blocking Issues

1. No valid current measurements possible (all WordPress references degraded since DNS cutover)
2. No /thank-you baseline exists
3. Cannot re-capture live baselines (WordPress site no longer exists)

## Alternative Paths

1. **Create Next.js baselines** (as done in C06) - would pass by definition but compares against self
2. **Accept historical measurements** (Sept 7: cart/checkout both under 11%) - doesn't meet "current" requirement
3. **Skip this goal** - acknowledge that WordPress vs Next.js parity is no longer measurable

## Historical Data (for reference only)

September 7, 2026 measurements (before reference degradation):
- Cart: 10.07% / 10.57% / 8.16% at 380/768/1440 - PASS
- Checkout: 10.59% / 10.10% / 10.71% at 380/768/1440 - PASS
- /thank-you: N/A (no baseline ever existed)

**Status:** BLOCKED - Goal unachievable with current degraded references
