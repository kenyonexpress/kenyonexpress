# Release Readiness

מדידת שערים ל-release. נמדד 2026-07-30.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
Verdict היסטורי: **NOT READY** (credential + compare)

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| R1 | **SUPABASE_SECRET_KEY** demo = חוסם cart/checkout E2E. |
| R2 | compare: home/category/product PASS; search/products FAIL. |
| R3 | Vitest + tsc + build: PASS (735 tests @ measure date). |
| R4 | `--page=checkout` intentionally refused (empty cart redirect). |
| R5 | No Escrow in checkout spec (CHECKOUT-COMPLETE). |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| measure checkout empty | false excellent score |
| skip E2E with credential dead | hides blocker |
| release with 14 high audit | FAIL gate |
| Escrow finalize path | No Escrow |

---

## 3. סכמת DB

blocked by invalid service key: guest cart, wallet, checkout writes.

---

## 4. מקרי קצה

| Gate | Result |
|---|---|
| tsc | PASS |
| Vitest | PASS |
| build | PASS |
| Playwright | 41 pass, 12 fail (admin client) |
| compare home | 10.92% PASS |
| compare search | 14.92% FAIL |
| Lighthouse a11y | 93 PASS |
| Lighthouse perf | 88 FAIL (-2) |
| audit --prod | 14 high FAIL |

---

## 5. פתוחות

| # | unblock |
|---|---|
| O1 | valid SUPABASE_SECRET_KEY |
| O2 | search/products compare |
| O3 | npm audit highs |
| O4 | perf +2 on home |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2 |
| 2026-07-30 | measure |
