# ארכיטקטורה: Deployment (מצביע BINDING)

סקירה קצרה לפריסה ותפעול. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; preview לא כותב כסף ל-prod DB.

**מקורות קנוניים:**

```
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/DEPLOY.md
docs/RUNBOOK-PRODUCTION-DEPLOY.md
docs/ARCHITECTURE-ENV-SECRETS.md
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | Stack: Next.js Vercel + Supabase + Cardcom + R2. |
| D2 | prod Supabase נפרד; PITR חובה לפני כסף אמיתי. |
| D3 | Preview לא כותב orders/payments ל-prod DB. |
| D4 | Cron: `Authorization: Bearer CRON_SECRET`. |
| D5 | Cardcom: API ישן (LowProfile.aspx); webhook `?s=` + GetLpResult. |
| D6 | Secrets: אין `NEXT_PUBLIC_` על service role / webhook secret. |
| D7 | Migrations prod: MCP; אין `db push`. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root topology dump | docs/PRODUCTION-OPS קנוני. |
| Cardcom v11 JSON | קוד חי API ישן. |
| Supabase branching חובה | dev/prod מספיק. |
| Free tier לכסף אמיתי | אין PITR. |
| env יחיד לכל סביבות | scopes נפרדים Vercel. |
| Escrow feature flag | תמיד כבוי; No Escrow. |

---

## סכמת DB

אין DDL חדש. תפעול:

```text
orders, payments, payment_webhook_events
notification_outbox, seo_redirects
vouchers (expiry cron)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | deploy בלי env חובה | build fail. |
| CE2 | cron ללא secret | 401. |
| CE3 | preview → prod DB | חסום config. |
| CE4 | migration לא idempotent | apply-twice fail. |
| CE5 | secret ב-client bundle | scan fail. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | migrations CI job | TESTING-CICD D6. |
| O2 | RUM prod dashboard | OBSERVABILITY. |
| O3 | edge cache tuning | Vercel config. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-28 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
