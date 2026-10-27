# C08: F12 affiliate campaigns, clicks, conversions

Date: 2026-10-27. Status: already shipped, verified, no code change.

- Migration: migrations/applied/283_affiliate_campaigns.sql (campaigns, links, clicks, attributions, payouts; integer agorot, commission_bp snapshotted per order). Applied earlier; 189_affiliate_program.sql in pending is obsolete (re-creates `affiliates`).
- Admin UI: src/app/(admin)/admin/affiliates/ (+ campaigns/page.tsx).
- User UI: src/app/(store)/account/affiliate/page.tsx, public /affiliate.
- Cookie: `ke_aff`, 30d (AFFILIATE_COOKIE_MAX_AGE_S in src/lib/affiliate/rules.ts).
- Server: src/server/affiliate/{clicks,attribution,settle}.ts, wallet payout via definer RPC.
- Tests: `pnpm vitest run affiliate` 7/7 pass.
- Details: docs/C26-AFFILIATE-VERIFICATION.md, docs/AFFILIATE-DESIGN.md.
- No locked files touched.
