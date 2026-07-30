# Goal Queue - run in order, one at a time, never parallel
# After each goal: commit + push + update STATE.md + start next from this list

1. DONE 2026-07-31: coupon customer view /coupon/[id] + supplier scan view /scan
2. Cart: Zustand store, guest cart, persist+hydration, mini-cart, /cart page, compare.mjs < 11%, tests green
3. Checkout+Cardcom: rebase feat/checkout-cardcom, remove all escrow/5% remains, coupon full-price charge, webhook+payment_events, migrations via MCP apply_migration only, E2E green
4. Coupon scan hardening: one-time code, race condition lock, rate limit on /scan
5. Admin dashboard: dynamic platform_percent per product page
6. Integration pass: rebase all branches on main, merge by dependency order, push
