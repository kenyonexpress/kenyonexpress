# Mobile audit

Measured 2026-10-16 against a production build (`pnpm start`) with `scripts/mobile-audit.mjs`. Screenshots (first viewport) are in `docs/mobile-audit/<page>-<width>.png`.

Overflow = documentElement.scrollWidth minus clientWidth (0 means no sideways scroll). Small = visible links/buttons/fields under 24px in either axis (WCAG 2.5.8 floor; inline text links are exempt by the standard and counted here anyway).

| page | path | 380 overflow | 390 overflow | 430 overflow | small @380 |
|---|---|---|---|---|---|
| home | / | 0 | 0 | 0 | 14 |
| products | /products | 0 | 0 | 0 | 51 |
| category | /category/hot-deals | 0 | 0 | 0 | 29 |
| product | /product/%D7%9E%D7%95%D7%A6%D7%A8-%D7%9C%D7%93%D7%95%D7%92%D7%9E%D7%90 | 0 | 0 | 0 | 20 |
| cart | /cart | 0 | 0 | 0 | 14 |
| checkout | /checkout | 0 | 0 | 0 | 14 |
| cities | /c | 0 | 0 | 0 | 15 |
| city-tel-aviv | /c/tel-aviv | 0 | 0 | 0 | 15 |
| suppliers | /suppliers | 0 | 0 | 0 | 15 |
| login | /login | 0 | 0 | 0 | 1 |
| signup | /signup | 0 | 0 | 0 | 1 |
| terms | /terms-and-conditions | 0 | 0 | 0 | 19 |
| privacy | /privacy-policy | 0 | 0 | 0 | 19 |
| accessibility | /accessibility | 0 | 0 | 0 | 19 |

## Not met

- Home at 380 against the frozen WordPress reference is 30.24% (the gate is 11%). KNOWN-ISSUES 3: a structural mobile layout project, not a tuning pass. Against Electro v7 the gate refuses to score (unloaded images on the reference).
- A bottom navigation bar (בית, קטגוריות, עגלה, ארנק, חשבון) and a sticky add-to-cart bar on the product page are not built.
- Heebo is loaded through next/font (swap); no layout-shift measurement was made in this pass beyond the existing CLS e2e specs, which pass.
- Real-device install testing on iOS Safari and Android Chrome was not possible from this machine.
