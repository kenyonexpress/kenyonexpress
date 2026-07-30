# Goal Queue - run in order, one at a time, never parallel
# After each goal: commit + push + update STATE.md + start next from this list
#
# The nine tasks of the previous queue are all addressed; what each one left
# behind is folded into the tasks below. Ordered by what stands between this
# code and a first real coupon sale. History is at the bottom.

1. THE TWO KEYS, and everything that unlocks. OFIR'S ACTION, then mine.
   SUPABASE_SECRET_KEY is the stock supabase-demo key, so nothing local can reach the project:
   no add-to-cart, no checkout, no test product, no Cardcom sandbox run. RESEND_API_KEY is unset,
   so the coupon email is built and tested but has never left the process.
   Supabase Dashboard > Project Settings > API Keys, and a Resend key.
   THE MOMENT THEY LAND: the end-to-end sale. product -> cart -> Cardcom sandbox -> full coupon
   price charged -> voucher + QR -> email -> /coupon/[id] -> /scan -> redeemed and expired. Every
   piece of that is written and unit-tested; none of it has been driven through the app once.

2. Handheld, the rest of it. Measured 2026-07-31 at 380px with scripts/measure-mobile.mjs:
   a second 5px document overflow from a slide-level container (387 inside 378), our header at
   110px against live's ~49px, our hero at 421px against live's 193px, and NO mobile menu found
   at all, which means category navigation is unreachable on a phone. Re-measure with --compare
   after each fix; the desktop number must stay at 10.92%.

3. The customer account area, per docs/ARCHITECTURE-ACCOUNT-IDENTITY.md and -WALLET.md.
   Never started. /account/vouchers now links to /coupon/[id] and the orders queries were fixed
   this session, so the area is closer than the docs suggest. compare.mjs has no --page=account
   and live requires a session on both sides, so decide first whether that number is obtainable
   at all rather than assuming it.

4. The 11 suppliers with no address, logo or phone. GO-LIVE blocker. 61 active products show a
   supplier panel with an empty Waze link and an empty WhatsApp link. The publish gate only
   enforces this on new writes, so the existing rows slipped through. Needs content decisions,
   so start by producing the report and the admin surface that makes the gap visible.

5. WP import, the half that is not a load: field mapping to public.products per
   docs/ARCHITECTURE-WP-DATA-MIGRATION.md, the image pipeline to R2, and the 301s for the 27
   published pages that have no redirect. src/lib/wp/wxr.ts already reads the export correctly
   (11 categories, 65 images, 44 products) and 20 products carry a slug unrelated to their title,
   which is a decision about continuity before it is code.

6. Merge feat/wp-migration, minus what src/lib/wp/wxr.ts supersedes. Migration 095 is ALREADY
   APPLIED in production while the code that writes that table sits on the branch. It also changes
   proxy.ts, which is on the request path of every page, so it needs its own verify cycle.

7. 059, only if you decide to cut it. Refused 2026-07-31 with the evidence in STATE and the backup
   at ~/Backups/kenyonexpress/db-before-059.sql. GO-LIVE stage 2 independently says not to apply
   the 058-065 family before a code cutover. Doing it means converting about a dozen call sites and
   verifying each against the new schema, in a session that can run the app.

---

## History, 2026-07-31

1. DONE: coupon customer view /coupon/[id] + supplier scan view /scan.
2. DONE: cart. compare.mjs --page=cart at 9.95% empty, 18 store tests.
3. PARTIAL: checkout+Cardcom. 094 applied, payment path and order path made schema-tolerant and
   proven against production with a rolled-back simulation. feat/checkout-cardcom still unmerged
   (escrow). The only 5% left in the code is the legal cancellation fee.
4. DONE: scan hardening. 085 applied; production carried the 3-arg redeem_voucher while the app
   calls 5 args, so every scan answered PGRST202.
5. DONE: admin per-product fields were already built; all 8 written keys verified to exist.
6. DONE: integration pass, every branch triaged in STATE with a reason.
7. PARTIAL: mobile polish. measure-mobile.mjs added, the 380px document overflow fixed.
8. PARTIAL: WP data migration. wxr.ts + wp-dry-run.mjs, three dry-run defects fixed by construction.
9. PARTIAL: go-live prep. vercel.json created, client bundle verified secret-free, two stale
   blockers ticked.
Also done outside the queue: the coupon email, which did not exist at all, and CHECKOUT_ENABLED
made fail-closed in production.
