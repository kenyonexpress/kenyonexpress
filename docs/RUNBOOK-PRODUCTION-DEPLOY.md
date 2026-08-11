# Runbook: Production Deploy

תקציר BINDING לשיגור ראשון. פירוט:

```
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/LAUNCH-DAY.md
docs/ARCHITECTURE-ENV-SECRETS.md
docs/RUNBOOK-INCIDENTS.md
```

Status: **BINDING (runbook)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
לא מריץ deploy מהמסמך.

---

## החלטה

| # | הכרעה |
|---|---|
| RD1 | סדר: freeze → Vercel env → Cardcom prod → deploy → smoke → DNS cutover → test purchase → `CHECKOUT_ENABLED=true`. |
| RD2 | `CHECKOUT_ENABLED=false` עד רכישת טסט PASS. |
| RD3 | **אין** `supabase db push` ביום שיגור. |
| RD4 | Cardcom secrets **לא** `NEXT_PUBLIC_`. |
| RD5 | Rollback: Vercel instant + DNS revert plan. |
| RD6 | PITR active before cutover. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| checkout live before smoke | RD2 |
| db push launch day | RD3 |
| skip PITR | RD6 |
| WP parallel prod indefinitely | DNS cutover |

---

## סכמת DB

Pre-flight queries (no DDL):

```text
RLS enabled all public tables
platform_percent populated on launch SKUs
migrations applied via MCP log
```

---

## מקרי קצה

| # | מקרה | action |
|---|---|---|
| CE1 | SSL not ready post-DNS | wait/pause traffic |
| CE2 | webhook 401 | fix `?s=` secret |
| CE3 | paid but no voucher | reconcile GetLpResult |
| CE4 | deploy green but 500 | rollback SHA |
| CE5 | wrong Supabase project env | redeploy env |
| CE6 | first charge before refund test | stop GL |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | blue/green (not MVP) |
| O2 | automated smoke script in CI |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
