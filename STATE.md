# KenyonExpress State (ke-docs-pack)

## Current Phase
Docs on branch `docs/final-pack` (worktree only).

## Last Completed
Created `refs/cart-measurements.md` (2026-08-03): Electro home-v7 + `/cart/`
computed styles at 380px and 768px (mini-cart dropdown + full cart page).
Docs / measurements only. No code. No git push.

## In Progress
nothing

## Blocking Issues
none

## Next Task
Continue docs or design queue when specified. No push unless asked.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-docs-pack

## Branch
`docs/final-pack`

## Supabase Project URL
not set in this worktree

## החלטות שהתקבלו אוטומטית
- Launch day starts with `CHECKOUT_ENABLED=false` until test purchase PASS.
- Canonical host documented as apex `https://kenyonexpress.co.il`.
- Cardcom secrets only in Vercel Production (four `CARDCOM_*` vars from `.env.example`).
- Mini-cart dropdown on Electro home-v7 is not painted below Bootstrap `xl`
  (~1200px); at 380/768 cart entry is header/footer link to `/cart/`. Computed
  styles of `.dropdown-menu-mini-cart` still recorded as the design contract.

---

## History

### 2026-08-03: cart-measurements
- New `refs/cart-measurements.md` from Electro home-v7 DevTools extract.

### 2026-08-03: LAUNCH-DAY
- New Hebrew runbook for cutover day.
