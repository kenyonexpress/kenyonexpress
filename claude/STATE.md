# KenyonExpress — Project State (autopilot branch pointer)

The canonical state file on this branch is the root `STATE.md`. This file
exists because the goal queue names `claude/STATE.md`; it holds the resume
line only, and the full block for each goal is in the root file.

**המשך מ: F42 DONE**

F42: verified on closeout/v1-final. Four legal pages (terms, privacy, returns, accessibility) under `src/app/(legal)/`, supplier click-wrap refund clause in `src/lib/legal/supplier-agreement.ts`, brand `קניון EXPRESS` in `src/lib/brand.ts`, storefront review forms removed, shipping-only address flow with the 5-order verified-shipping gate in `src/lib/checkout/verified-shipping.ts`. 19 test files, 234 tests pass. The apply page lives at `src/app/(store)/suppliers`, not `src/app/supplier/apply`.

Previous: F41 DONE

F41: `BUSINESS_REGISTRATION_NUMBER` already in `src/lib/legal-entity.ts` (merged in #93), wired into the order-confirmation email, invoice issuer, both footers, legal pages via `LegalContactBlock`, and the supplier click-wrap; 6 test files, 70 tests pass.

Previous: F43 DONE mobile 8.53%

Last goal: F43, home parity gate on the rebuilt tree, by the goal's literal
`pnpm run compare` command and by a fresh archive shot: 380px 8.53% PASS,
768px 9.79% PASS, 1440px 8.08% PASS. Deals card title at live's measured
26.4px / 500 / 8px in `src/components/ProductDealCard.module.css`, live's
-0.14px body letter-spacing in `src/app/globals.css`, gate flags
`--widths`, `--baseline`, `--live-url` in `scripts/compare-args.mjs`. Rows in
`docs/UI-PARITY-REPORT.md`, 2026-10-21.
