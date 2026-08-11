# פריסה (Deploy)

תקציר BINDING. פירוט:

```
docs/ARCHITECTURE-ENV-SECRETS.md
docs/RUNBOOK-PRODUCTION-DEPLOY.md
docs/ARCHITECTURE-BACKUP-DR.md
```

Status: **BINDING (ops)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
pnpm בלבד. שורש יישום:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

---

## החלטה

| # | הכרעה |
|---|---|
| DP1 | Node 20+, pnpm 11.1.2, Supabase CLI, Vercel. |
| DP2 | `.env.local` מ-`.env.example`; אין secrets ב-git. |
| DP3 | Prod: Supabase, APP_URL, Cardcom 4-tuple + webhook secret. |
| DP4 | Local DB: `supabase db reset`; 041 לפני 042. |
| DP5 | Prod migrations: MCP; לא `db push` ביום שיגור. |
| DP6 | Gates: test, type-check, lint. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| npm | AGENTS.md |
| db push prod | RUNBOOK |
| auto seed categories.sql | כבוי ב-config |

---

## סכמת DB

אין DDL. `schema_migrations` = applied list.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | migration fail → stop |
| CE2 | missing Cardcom env → checkout fail |
| CE3 | wrong APP_URL → auth broken |
| CE4 | stale Vercel env → redeploy |
| CE5 | product sans supplier pre-042 → block |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | pending migrations folder |
| O2 | staging Supabase |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
