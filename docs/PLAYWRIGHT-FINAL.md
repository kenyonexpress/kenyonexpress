# Playwright final (G22) — BLOCKED

Date: 2026-10-24. Command: `E2E_PORT=3311 E2E_WORKERS=1 E2E_FORWARDED_FOR_PREFIX=10.44.11 npx playwright test` (2172 tests, 6 projects: chromium/webkit at 380/768/1440; existing dev server on :3311).

## Run 1 — aborted after 3 failures (not a passing run)
Log: `logs/pw-final-run1.txt` (untracked). 19 passed, 3 failed before abort:
- `[chromium-380] a11y-minimal › product page` — no visible `/product/` link on home
- `[chromium-380] a11y › products` — 30s timeout
- `[chromium-380] a11y › category archive` — renders the 500 error page (color-contrast, document-title)

Root cause (dev server log): `catalogue.shop_products_failed: column suppliers_1.verification_status does not exist`.
`src/lib/category-page.ts`, `product-detail.ts` and `ProductCard.tsx` select `suppliers.verification_status`, but the column was never applied:
the only migration (`297_supplier_verification_status.sql`) sits in `supabase/migrations/`, not the migration pipeline.

## Run 2 — not executed
A second consecutive run is meaningless until run 1 is green.

## Action taken
Wrote `migrations/pending/301_supplier_verification_status.sql` (idempotent copy of 297). It is NOT applied: no Supabase MCP `apply_migration` tool is available in this session, and `db push` is forbidden.

## Next
Apply 301 via Supabase MCP on project ixvwfbuvfxxsjiywhbbb, then rerun both full runs and replace this file with the outputs.
