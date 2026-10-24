# L13 Phase 2 flags report (C14)

Checked 2026-10-25 on branch `autopilot` at dcb02c7a6. Source read only; no production access.

## Verdict: NOT hidden. Flags exist but nothing reads them.

| Phase 2 feature | Flag (code / DB / env) | Default | Consumers of the flag | Surface reachable with flag OFF |
|---|---|---|---|---|
| Physical products | physical-products / physical_products / FLAG_PHYSICAL_PRODUCTS | OFF | none | YES: product type `physical` in search filter, product page, admin orders, supplier payouts, account order status |
| Courses (monthly) | courses-monthly / courses_monthly / FLAG_COURSES_MONTHLY | OFF | none | No dedicated routes found |
| Tzimmer calendar | tzimmer-calendar / tzimmer_calendar / FLAG_TZIMMER_CALENDAR | OFF | none | No dedicated routes found (only sitemap/category-nav label mentions) |
| Monthly billing | monthly-billing / monthly_billing / FLAG_MONTHLY_BILLING | OFF | none | YES: `/account/subscriptions` page and AccountNav link, `api/cron/subscriptions` charges due rows, `finalize.ts` creates subscriptions for recurring lines |

Evidence: `grep -rn "isFlagOn\|getSupabaseFlags" src` outside `src/lib/flags/` finds only a comment in
`src/server/actions/admin/feature-flags.ts`. The only code path touching the flags is the admin toggle UI.

## Production state: UNVERIFIED
- Migration `293_phase2_feature_flags.sql` (seeds the four keys false) is still in `migrations/pending/`; no evidence it is applied.
- Supabase and Vercel env values could not be read from this session (Supabase MCP unauthenticated; service key known invalid per M13).
- The FLAG_* env vars are not listed in `.env.example` or `vercel.json`. Unset reads as OFF, which is the safe default.

## Work needed before DONE (separate from this verification)
1. Gate monthly billing: `/account/subscriptions` (notFound), AccountNav entry, cron route (early return), recurring branch in `server/payments/finalize.ts` (money path, needs tests).
2. Gate physical products in storefront, checkout shipping address step, and search filter; decide what existing physical catalog rows do when OFF.
3. Gate courses and tzimmer when their routes land.
4. Apply migration 293 via Supabase MCP once credentials are restored, then read the four rows back.
5. Add a test that asserts every flag in `FLAGS` has at least one consumer.
