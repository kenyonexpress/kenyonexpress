# RTL: הפרות physical CSS

**Snapshot** (35 violations): git history. Run: `node scripts/rtl-lint.mjs`

Status: **BINDING (ארכיון)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| R1 | UI עברית: `dir=rtl`. logical properties בלבד. |
| R2 | physical (`pl-`, `text-right`, `left-`) = הפרה. |
| R3 | תיקון ב-`src/components/ui/*` משפיע על כל האפליקציה. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| ltr containers | שובר RTL |
| ignore ui/* | רוב ההפרות שם |

---

## 3. סכמת DB

אין DDL.

---

## 4. מקרי קצה

| # | קובץ | count |
|---|---|---:|
| E1 | dropdown-menu.tsx | 11 |
| E2 | select.tsx | 5 |
| E3 | dialog.tsx | 3 |

---

## 5. פתוחות

16 files; 35 violations total.

| physical | count |
|---|---:|
| pl- | 7 |
| text-right | 6 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING snapshot |
