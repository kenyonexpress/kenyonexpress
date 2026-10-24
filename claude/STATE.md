# KenyonExpress — Project State (autopilot branch pointer)

The canonical state file on this branch is the root `STATE.md`. This file
exists because the goal queue names `claude/STATE.md`; it holds the resume
line only, and the full block for each goal is in the root file.

**המשך מ: G15 DONE**

G15: `/supplier/redeem/<code>` page (short code, manual scan). Reuses RedeemConfirm + redeem_voucher() via /api/supplier/vouchers/redeem (not-redeemed, not-expired, voucher_redemptions row, unique success index locks re-redeem). Refusals: malformed, not found, read failure, rate limit; KEV1 token redirected to /redeem/<token>. No new migration.

Previous: G13 DONE

G13: `PushToggle` on /account/notifications, migration `301_push_subscriptions.sql` in pending (not yet applied: Supabase MCP unauthorized in this session). Install banner, subscribe API, VAPID sender, T-7/T-1 and order-status push already existed.

Previous: F43 DONE mobile 8.53%

Last goal: F43, home parity gate on the rebuilt tree, by the goal's literal
`pnpm run compare` command and by a fresh archive shot: 380px 8.53% PASS,
768px 9.79% PASS, 1440px 8.08% PASS. Deals card title at live's measured
26.4px / 500 / 8px in `src/components/ProductDealCard.module.css`, live's
-0.14px body letter-spacing in `src/app/globals.css`, gate flags
`--widths`, `--baseline`, `--live-url` in `scripts/compare-args.mjs`. Rows in
`docs/UI-PARITY-REPORT.md`, 2026-10-21.
המשך מ: G19 DONE
