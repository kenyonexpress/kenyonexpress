# hardcoded-audit (ארכיון)

**Snapshot** (~1838 שורות): git history. Run: `node scripts/audit-hardcoded.mjs`

Status: **BINDING (ארכיון)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| H1 | **אין `platform_percent` hardcoded** במסלול checkout/finalize. |
| H2 | **אין float** במסלול כסף (חוץ מ-g boundaries מתועדים). |
| H3 | CI: סריקה + money gates ב-tests. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| default 5% fallback | C1 |
| dump 1800+ שורות ב-docs | regenerate script |

---

## 3. סכמת DB

אין DDL. audit = קוד בלבד.

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | seed percents | OK (data) |
| E2 | Tailwind `[5%]` | OK (CSS) |
| E3 | Cardcom ILS string | boundary |

---

## 5. פתוחות

| verdict | result |
|---|---|
| platform_percent literals | 0 blocking |
| float money | 3 documented boundaries |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING snapshot |
