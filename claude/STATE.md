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
M08-c181 Lighthouse mobile (local `next start`, simulated throttling, 2026-10-25): `/` perf 86 / a11y 100 / BP 96 / SEO 100 (FCP 1.5s, LCP 4.1s, TBT 50ms, CLS 0.019); `/product/עוזרת-אישית-שירותי-משרד` perf 82 / a11y 100 / BP 96 / SEO 100 (FCP 1.7s, LCP 4.8s, TBT 40ms, CLS 0). LCP is the drag on both. Localhost simulated scores are noisy, see docs/PERFORMANCE-BUDGET.md.
M09-c181 Removed unused dep html5-qrcode (+lockfile), deleted dead src/lib/geographic-edge.ts, isSupportRole, anyChip, getUserRFMScore, getAllSegments. Kept @mdx-js/* (peers of @next/mdx) and lighthouse (used by scripts). ~400 remaining unreferenced type/const exports left as-is (public module shape; unexporting is churn).
המשך מ: M16-c183 DONE

M13-c182 BLOCKED: /api/ready 200; /api/health 503 (MEILI_* env unset, search not_configured; DB ok)

המשך מ: C14 BLOCKED (flags unwired, see docs/L13-FLAGS-REPORT.md)

M08-c183 Lighthouse mobile (local next start, 3 runs): / perf 86/90/87 (LCP 3.3-4.1s); /product perf 98/98/98 (LCP 2.2s). Log: logs/lighthouse-m08-c183.txt

M15-c183 BLOCKED locked-component: console on / and /product has ~1030 and ~116 errors (380/768/1440, fresh next start). Cause: prerendered (PPR) HTML emits 19 async chunk <script src> + inline scripts with no nonce, blocked by strict-dynamic CSP (src/proxy.ts). Fix needs dynamic rendering in src/app/layout.tsx (forbidden).

המשך מ: M15-c183 BLOCKED

M06-c184 pnpm build passes clean on autopilot @ 265f1b65b; no drift to fix (only untracked src/lib/supplier-onboarding.staging.test.ts from F57, live-staging test, left uncommitted).

המשך מ: M06-c184 DONE
