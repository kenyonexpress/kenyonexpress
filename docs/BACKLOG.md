# Backlog

Ordered. Each item is post-launch or externally gated.

1. Group-deals re-evaluation, 2026-10-23.
2. Crisp inbox, post-launch.
3. Meta WhatsApp Business verification, after 10 sales.
4. Israeli lawyer review of ToS and Privacy, after 10 sales.
5. Capacitor or Expo native app, after revenue.
6. Courses monthly billing, Phase 2.
7. Tzimmer calendar, Phase 2.
8. Cardcom legacy refund and document endpoint field names, `TODO(cardcom)` at `src/lib/payments/cardcom.ts:249` and `:312` (since 2026-07-24 / 2026-08-07). Gated on production terminal creds. Also in docs/KNOWN-ISSUES.md #2.
9. R2 image migration, four `TODO`s in `src/lib/images/r2-migration.ts:103-106` (since 2026-10-17). Module is not imported anywhere; implement only if images move to R2.
10. Real default slugs in `scripts/screenshot-all.mjs:42` (since 2026-07-23). Defaults are placeholders; callers pass slugs by argv or env, so nothing is broken.
11. Product cache invalidation after stock-back-in-stock notify, `TODO` at `src/app/api/cron/stock-notifications/route.ts:126` (since 2026-10-18). `revalidateTag(`product_${productId}`)` is commented out pending the Next.js 16 API; see `src/lib/catalogue-cache.test.ts` for the tag convention before enabling. Stock display stays correct until the normal cache expiry.
