# KenyonExpress State (ke-docs-pack)

## Current Phase
Docs on branch `docs/final-pack` (worktree only).

## Last Completed
Created `docs/LAUNCH-DAY.md` (2026-08-03, Hebrew): exact launch-day order,
Vercel Production env vars, DNS for kenyonexpress.co.il, Cardcom production
key placement + URLs, first live test purchase protocol, rollback plan.
Docs only. No code. No git push.

## In Progress
nothing

## Blocking Issues
none

## Next Task
Continue docs queue when specified. No push unless asked.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-docs-pack

## Branch
`docs/final-pack`

## Supabase Project URL
not set in this worktree

## החלטות שהתקבלו אוטומטית
- Launch day starts with `CHECKOUT_ENABLED=false` until test purchase PASS.
- Canonical host documented as apex `https://kenyonexpress.co.il`.
- Cardcom secrets only in Vercel Production (four `CARDCOM_*` vars from `.env.example`).

---

## History

### 2026-08-03: LAUNCH-DAY
- New Hebrew runbook for cutover day.

### 2026-08-02: SEO-PERFORMANCE update
- Lighthouse, ISR, JSON-LD, Hebrew metadata.

### 2026-08-02: docs final pack
- Ten docs: personal area through legal checklist.
