# KenyonExpress Architecture (מצביע BINDING)

נקודת כניסה לכל מסמכי הארכיטקטורה. אין מקור אמת ב-root.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר בלי default; אגורות integer.

**מקורות קנוניים:**

```
docs/MASTER-ARCHITECTURE-v2.md
docs/ARCHITECTURE-DOCS-INDEX.md
docs/ARCHITECTURE-MONEY.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
STATE.md
```

גרסת Turborepo/Drizzle/tRPC (מאי 2026): git history (`493ea27:ARCHITECTURE.md`).

---

## החלטה

| # | הכרעה |
|---|---|
| I1 | כל ארכיטקטורה חיה ב-`docs/` בלבד; root = מצביעים BINDING. |
| I2 | סדר סמכות כסף: CONTRADICTIONS + MONEY + BUSINESS-MODEL. |
| I3 | worktree docs: `ke-arch`; branch: `arch/docs-batch-2`. |
| I4 | Stack חי: Next.js App Router + Supabase + Vercel + Cardcom Low Profile. |
| I5 | מצב משימה: `STATE.md` תחת `## המשך מ:`. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root `ARCHITECTURE.md` כמסמך אב | I1: docs/MASTER-ARCHITECTURE-v2. |
| Turborepo + Drizzle + tRPC | הוחלף; git history בלבד. |
| תיקיות ארכיטקטורה צדדיות | I1: docs/ בלבד. |
| Escrow / held על קופון | No Escrow; MONEY. |
| אנגלית בלבד ב-root | עברית RTL + 5 סעיפים. |

---

## סכמת DB

אין DDL. אינדקס מסמכים:

```text
docs/ARCHITECTURE-DOCS-INDEX.md
docs/MASTER-INDEX.md
docs/DB-SCHEMA.md
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | root סותר docs/ על Escrow | CONTRADICTIONS + MONEY גוברים. |
| CE2 | קורא root בלי docs/ | מפנה ל-MASTER-ARCHITECTURE-v2. |
| CE3 | worktree שגוי | R1: ke-arch בלבד. |
| CE4 | branch לא docs-batch-2 | docs commits לענף הנכון. |
| CE5 | dump 2000 שורות ב-root | git history; BINDING קצר. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | merge docs-batch-2 → main | אחרי review. |
| O1 | auto-link checker | broken refs ב-docs. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-05 | Turborepo draft (מיושן) |
| 2026-08-12 | batch-2: BINDING מצביע; 5 סעיפים |
