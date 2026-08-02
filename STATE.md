# KenyonExpress State (ke-docs-pack)

## Current Phase
Docs final pack on branch `docs/final-pack` (worktree only; main tree not touched).

## Last Completed
Full docs queue (2026-08-02), docs only, no code, no git push:

1. `docs/ARCHITECTURE-PERSONAL-AREA.md` (orders, coupon wallet UI, closed-loop agorot wallet, Google profile)
2. `docs/ARCHITECTURE-MOBILE-APP.md` (Expo RN, shared Supabase auth, offline QR wallet, push)
3. `docs/DDL-FIXES.md` (`platform_settled`, 027/054 order, MCP apply blocks)
4. `docs/ARCHITECTURE-AI-AGENTS.md` (shopping assistant, coupon recommender, Hebrew NLP search)
5. `docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md` (sales dashboard, payout by snapshotted platform_percent)
6. `docs/ARCHITECTURE-BACKUP-DR.md` (PITR, R2 backup, DR runbook)
7. `docs/ARCHITECTURE-FRAUD-PREVENTION.md` (duplicate QR, rate limits, Cardcom chargeback)
8. `docs/RUNBOOK-OPERATIONS.md` (product, platform_percent, orders, refunds, Sentry)
9. `docs/ARCHITECTURE-MARKETING.md` (Google Shopping, Facebook catalog, WhatsApp share, affiliate `/r/{code}`)
10. `docs/LEGAL-CHECKLIST.md` (takanon, privacy, Cheshbonit Mas, consumer-protection coupon rules)

## In Progress
nothing

## Blocking Issues
none

## Next Task
Review/merge `docs/final-pack` when asked. Do not push unless explicitly requested.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-docs-pack

## Branch
`docs/final-pack` (from `arch/docs-queue`)

## Supabase Project URL
not set in this worktree

## החלטות שהתקבלו אוטומטית
- עבודה ב-worktree נפרד (`ke-docs-pack`) כדי לא לגעת ב-working tree של main.
- מודל כסף בנוסח: Escrow פנימי 2026-07-27 (held עד מימוש), לא "אין Escrow" הישן מ-24.07.
- בלי `git push` לפי בקשה מפורשת.

---

## History

### 2026-08-02: docs final pack
- עשרה מסמכים נוצרו/עודכנו על `docs/final-pack`.
- אין שינוי קוד. אין push.
