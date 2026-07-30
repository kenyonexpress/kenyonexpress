# ARCHITECTURE-TESTING-CICD.md

ארכיטקטורת **בדיקות ו-CI/CD**.

Status: BINDING · `ke-arch` · Date: 2026-07-31 · docs only.

## Layers
| Layer | Tool | When |
|---|---|---|
| Unit | Vitest | money, cart optimistic, redeem state, KPI pure |
| Integration | Vitest + local Supabase | checkout finalize, RLS, merge cart |
| E2E | Playwright | guest→pay→voucher→scan |
| Visual | `compare.mjs` vs `refs/` | home, product, category |
| Types | `tsc --noEmit` | every PR |
| Lint | Biome/ESLint per repo | every PR |
| Audit | `pnpm audit --prod` | release |

## CI gates (PR)
1. tsc clean  
2. unit tests  
3. lint  
4. (optional) preview deploy + smoke  

## Release gates
See `ARCHITECTURE-GO-LIVE-CHECKLIST.md`. E2E cart/checkout must run with real `SUPABASE_SECRET_KEY` (not demo).

## Money tests (mandatory)
- Coupon: platform keeps prepaid; no escrow row  
- Physical: commission from snapshot percent  
- Webhook replay idempotent  

## Forbidden
`--no-verify` in release · skipping money tests · Make/Zapier as test orchestrator.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Testing/CI binding in `ke-arch` (`arch/docs-queue`) |
