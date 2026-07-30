# ARCHITECTURE-CATEGORY-PAGE.md

ארכיטקטורת **דף קטגוריה** (קטלוג RTL).

Status: BINDING lite · `ke-arch` · Date: 2026-07-31 · docs only.  
Visual truth: `refs/` + Electro measurements.

## Job
One purpose: browse products in a category with filters; correct on-site price on cards.

## Requirements
| Item | Rule |
|---|---|
| Grid | RTL, Heebo, brand yellow ATC where applicable |
| Filters | category children, price range, sort |
| Coupon cards | show `coupon_price` as payable now; optional balance-at-business |
| Pagination | stable ordering |
| SEO | unique title/description; indexable |
| Perf | no eager-load of entire catalog; images sized |

## Data
Published products in category M2M; stock/availability flags; platform_percent not shown to shoppers on cards.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Category page lite in `ke-arch` (`arch/docs-queue`) |
