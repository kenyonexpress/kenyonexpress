# Goal Queue - run in order, one at a time, never parallel
# After each goal: commit + push + update STATE.md + start next from this list

1. DONE 2026-07-31: coupon customer view /coupon/[id] + supplier scan view /scan
2. DONE 2026-07-31: cart (store+guest+drawer+/cart already built; added compare.mjs --page=cart at 9.95% empty, 18 store tests). Filled-cart compare still blocked on SUPABASE_SECRET_KEY
3. PARTIAL 2026-07-31: applied 094_settlement_events via MCP, payment path now schema-tolerant (payments.amount_ils vs amount_agorot). BLOCKED on the 042/059/065 cutover: orders/wallet_entries/fn_post_journal are all missing in production, see STATE payments round for the per-call-site checklist. feat/checkout-cardcom still not merged (escrow), 5% left in code is only the legal cancellation fee.
3b. THE CUTOVER: decide 059 (apply + fix every shekel-named call site, or align the code to pre-059). Everything in the purchase flow waits on this.
4. Coupon scan hardening: one-time code, race condition lock, rate limit on /scan
5. Admin dashboard: dynamic platform_percent per product page
6. Integration pass: rebase all branches on main, merge by dependency order, push
