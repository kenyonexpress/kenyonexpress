# אסטרטגיית בדיקות (ארכיון)

**Pointer:** מקור מחייב:

```
docs/TESTING-STRATEGY.md
docs/ARCHITECTURE-TESTING-CICD.md
```

Status: **BINDING (pointer)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
pnpm בלבד.

---

## החלטה

| # | הכרעה |
|---|---|
| TS1 | פירמידה: הרבה unit → integration → מעט E2E. |
| TS2 | כסף: unit על agorot; **No Escrow** invariants. |
| TS3 | `platform_percent` פר מוצר ב-split tests. |
| TS4 | Integration: redeem race, webhook idempotency, RLS. |
| TS5 | E2E Playwright `he-IL`; stop לפני Cardcom prod. |
| TS6 | Visual: `scripts/compare.mjs` ~11% threshold. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| 80% coverage גלובלי | רק money/redeem 100% |
| E2E prod Cardcom | sandbox/mock |
| escrow held tests | No Escrow |
| npm test | pnpm |

---

## סכמת DB

אין DDL. Integration משתמש ב-Supabase local + RLS policies.

---

## מקרי קצה

| # | מקרה | שכבה |
|---|---|---|
| CE1 | double redeem | integration |
| CE2 | webhook replay | integration |
| CE3 | float in money | unit reject |
| CE4 | split without percent | unit fail |
| CE5 | RTL layout | E2E/compare |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | vitest 95% vs 100% policy align |
| O2 | packages/money extraction |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING pointer |
