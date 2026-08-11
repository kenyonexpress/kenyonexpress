# ארכיטקטורה: WP Data Migration Execution

Runbook הרצת import: env, שלבים, verify, rollback, cutover.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-MIGRATION-PLAN.md
docs/ARCHITECTURE-WORDPRESS-IMPORT.md
docs/RUNBOOK-PRODUCTION.md
docs/BACKUP-RESTORE-RUNBOOK.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| EX1 | Env: `IMPORT_MODE=dry_run|staging|prod`; prod רק אחרי dry-run 0 errors. |
| EX2 | Runner: `scripts/wp-import/` שלבים 1-6; log ל-`import_batches`. |
| EX3 | Backup לפני prod write: tar + Supabase snapshot (runbook). |
| EX4 | Verify: 21 gates SQL; manual sample 20 products. |
| EX5 | Post-import: admin fills `platform_percent` → bulk publish eligible. |
| EX6 | Cutover window: maintenance banner; WP read-only; DNS flip. |
| EX7 | Rollback: `import_batch_id` soft-delete + R2 prefix (אחרי אישור). |
| EX8 | לא migration prod DB מסקריפט import (MCP only). |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| import ישיר ל-prod בלילה בלי staging | EX1: dry-run gate. |
| rollback hard-delete אחרי sales | archived only. |
| parallel prod+WP write | EX6: single source. |
| manual SQL fixes בלי batch_id | EX7: scoped rollback. |
| skip backup | EX3: runbook חובה. |

---

## סכמת DB

```text
import_batches (id, mode, status, stats, error_log)
id_map
-- targets: products, categories, suppliers, seo_redirects
```

אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | R2 rate limit | backoff; resume step 4. |
| CE2 | gate 15 fails (orphan products) | stop; fix mapping. |
| CE3 | prod write mid-outage | abort; restore backup. |
| CE4 | admin publish before % fill | publish gate blocks. |
| CE5 | 301 missing for top traffic URL | block cutover. |
| CE6 | re-run same WXR | upsert; no dup slug. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | CI job dry-run on WXR commit | automation. |
| O2 | Ntfy on batch complete | ops. |
| O3 | time estimate per 2K products | measure first run. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-07 | execution runbook |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
