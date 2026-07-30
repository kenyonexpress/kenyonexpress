# Goal Queue - run in order, one at a time, never parallel
# After each goal: commit + push + update STATE.md + start next from this list

1. DONE 2026-07-31: coupon customer view /coupon/[id] + supplier scan view /scan
2. DONE 2026-07-31: cart (store+guest+drawer+/cart already built; added compare.mjs --page=cart at 9.95% empty, 18 store tests). Filled-cart compare still blocked on SUPABASE_SECRET_KEY
3. PARTIAL 2026-07-31: applied 094_settlement_events via MCP, payment path now schema-tolerant (payments.amount_ils vs amount_agorot). BLOCKED on the 042/059/065 cutover: orders/wallet_entries/fn_post_journal are all missing in production, see STATE payments round for the per-call-site checklist. feat/checkout-cardcom still not merged (escrow), 5% left in code is only the legal cancellation fee.
3b. THE CUTOVER: decide 059 (apply + fix every shekel-named call site, or align the code to pre-059). Everything in the purchase flow waits on this.
4. DONE 2026-07-31: scan hardening. Applied 085 via MCP (production carried the 3-arg redeem_voucher while the app calls 5 args, so every scan answered PGRST202). One-time code + race lock are the conditional UPDATE; rate limits at 4 layers. No per-IP block on the authenticated redeem route, on purpose (shared NAT at a mall).
5. DONE 2026-07-31: already built (ProductForm split inputs + live preview, buildProductMoneyWrite). Verified all 8 written keys exist in production. Found and fixed next to it: the cart selected products.cashback_bp, which this DB does not have, blanking every cart line.
6. DONE 2026-07-31: every branch triaged in STATE with a reason. Nothing merged: 3 are fully contained, main's 1 commit is an artefact dump, checkout-complete's is a superseded measurement, ci-foundation waits for the cutover, wp-migration is the one worth merging and needs its own verify cycle (it changes proxy.ts).

7. IN PROGRESS 2026-07-31: close the coupon sale flow end to end.
   DONE: the order write path (orders + order_items) and the read path (/checkout/return, /account/orders,
   wallet_entries, finalize) now resolve which money columns the database has. The exact INSERT pair was
   simulated against production inside a rolled-back DO block and accepted. 849 tests.
   BLOCKED, one credential: SUPABASE_SECRET_KEY is the stock supabase-demo key, so nothing local can add to a
   cart, run a checkout, exercise the Cardcom sandbox, or create the test coupon product. Replace it from
   Supabase Dashboard > Project Settings > API Keys and the remaining steps become runnable.
   THEN: E2E with the Cardcom sandbox, a real test coupon product with a real supplier, compare.mjs on every
   flow page, the customer account area, the Admin dashboard, and the integration pass.

8. THE 059 CUTOVER, still open but no longer urgent: the code now works on the schema production actually has.
   Needs a backup first, and this machine has no pg_dump, no psql, no linked CLI and no DB password:
   brew install libpq && supabase login && supabase link --project-ref ixvwfbuvfxxsjiywhbbb
   && supabase db dump --linked -f ~/Backups/kenyonexpress/db-before-059.sql
