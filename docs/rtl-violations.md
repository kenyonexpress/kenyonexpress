# RTL: הפרות physical CSS

**Snapshot** (35 violations): git history. Run: `node scripts/rtl-lint.mjs`

Status: **BINDING (ארכיון)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

---

## 1. החלטה (מחייבת)

logical properties only (`ps`/`pe`, `start`/`end`).

---

## 2. חלופות שנדחו

ltr containers; ignore ui/*.

---

## 3. סכמת DB

none.

---

## 4. מקרי קצה

dropdown-menu (11); select (5).

---

## 5. פתוחות

16 files; 35 total.

| physical | count |
|---|---:|
| pl- | 7 |
| text-right | 6 |
| left- | 6 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING snapshot |
