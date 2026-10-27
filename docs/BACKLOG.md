# Backlog

Ordered. Each item is post-launch or externally gated.

1. ✅ Group-deals re-evaluation, 2026-10-23 (DONE: integrated schema + migration 294 + RLS + 10 tests, build ✅).
2. Crisp inbox, post-launch.
3. Meta WhatsApp Business verification, after 10 sales.
4. Israeli lawyer review of ToS and Privacy, after 10 sales.
5. Capacitor or Expo native app, after revenue.
6. Courses monthly billing, Phase 2.
7. Tzimmer calendar, Phase 2.
8. Cardcom legacy refund and document endpoint field names, `TODO(cardcom)` at `src/lib/payments/cardcom.ts:249` and `:312` (since 2026-07-24 / 2026-08-07). Gated on production terminal creds. Also in docs/KNOWN-ISSUES.md #2.
9. R2 image migration, four deferred steps (reworded from `TODO` to `NOTE`) in `src/lib/images/r2-migration.ts:103-107` (since 2026-10-17). Module is not imported anywhere; implement only if images move to R2.
10. Real default slugs in `scripts/screenshot-all.mjs:42` (since 2026-07-23). Defaults are placeholders; callers pass slugs by argv or env, so nothing is broken.
11. ✅ Catalogue cache invalidation after stock-back-in-stock notify, 2026-10-27 (DONE: `revalidateTag(CATALOGUE_TAG, 'max')` in `src/app/api/cron/stock-notifications/route.ts` when notifications were sent).
