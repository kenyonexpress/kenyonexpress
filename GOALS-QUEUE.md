# GOALS QUEUE — execute strictly in order, one at a time
# After each goal: commit, push, update STATE.md, send ntfy to ntfy.sh/kenyon-ofir-limit, then start next goal immediately without asking.
# Iron rules: never run two goals in parallel. Never db push — Supabase MCP apply_migration only, and DDL migrations 027+054 require explicit approval from Ofir — SKIP them and leave note in STATE.md. Cursor worktree ke-arch is docs only — never touch it.

1. Coupon redemption + QR. Branch feat/coupon-redemption. Read docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md first. Supplier scan page, QR per coupon, single-scan expiry, redemption status in order_items, RTL per refs/ke_live_singlefile.html, Vitest, compare.mjs under 11 percent.

2. Personal area. Branch feat/personal-area. Orders history, my coupons with QR, internal cashback wallet integer agorot via money.ts (never leaves system), Google profile, RTL, Vitest.

3. Notifications. Branch feat/notifications. Read docs/ARCHITECTURE-NOTIFICATIONS.md. Resend, Edge Functions, payment confirmation email, coupon QR email, QStash retry, Hebrew RTL templates.

4. SEO + Performance. Branch feat/seo-performance. Read docs/ARCHITECTURE-SEO-PERFORMANCE.md. Lighthouse 90+, next/image, Hebrew metadata + OpenGraph, sitemap, robots, JSON-LD Product, ISR.

5. Playwright E2E. Branch feat/e2e. Guest cart, Google login on pay, Cardcom sandbox, coupon received, QR redemption. RTL assertions, mobile viewport, CI.

6. Integration pass. Rebase all feat branches on main in dependency order, full tests per branch, merge sequentially, push main. Never touch production DB.
