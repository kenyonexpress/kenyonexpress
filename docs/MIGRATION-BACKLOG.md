# Migration Backlog

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
פרויקט: `ixvwfbuvfxxsjiywhbbb` · נמדד 2026-07-29

**טבלת 89 קבצים:** git history (~585 שורות).

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| B1 | body-diff on REPLACE (not names only). |
| B2 | 48 applied, 5 partial, 32 missing, 2 cancelled. |
| B3 | **No Escrow:** 081/085; 079/080 cancelled. |
| B4 | MCP apply only. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| db push | replay risk |
| 027 DRAFT apply | blocked |
| Escrow migrations | cancelled |

---

## 3. סכמת DB

| מדד | count |
|---|---:|
| migration files | 89 |
| schema_migrations | 32 |
| missing files | 32 |

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | stale REPLACE body |
| E2 | enum shadowing |
| E3 | 050 blocks null percent |

---

## 5. פתוחות

repair order; payout 027; regenerate docs.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING snapshot |
