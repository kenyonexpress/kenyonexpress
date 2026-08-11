# hardcoded-audit (ארכיון)

**Snapshot** (~1838 שורות): git history. Run: `node scripts/audit-hardcoded.mjs`

Status: **BINDING (ארכיון)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

---

## 1. החלטה (מחייבת)

no hardcoded platform_percent; no float money path.

---

## 2. חלופות שנדחו

default 5%; full dump in docs.

---

## 3. סכמת DB

none (code audit).

---

## 4. מקרי קצה

seed percents OK; Tailwind arbitrary OK.

---

## 5. פתוחות

CI link; Escrow string cleanup.

### Verdicts

| category | result |
|---|---|
| platform_percent in src | 0 blocking |
| float money | 3 documented boundaries |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING snapshot |
