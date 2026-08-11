# אינדקס ראשי (docs)

תקציר BINDING לכל `docs/`. אינדקס מלא:

```
docs/ARCHITECTURE-DOCS-INDEX.md
docs/ROADMAP-V2.md
```

Status: **BINDING (index)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מודל כסף בכל מסמך רלוונטי: **No Escrow**; `platform_percent` פר מוצר **בלי default**; agorot.

מקור הכרעות:

```
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-PRICING-RULES.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| MI1 | כל ARCHITECTURE-* תחת `docs/`; BINDING = 5 סעיפים (החלטה, חלופות, DB, קצה, פתוחות). |
| MI2 | DEPRECATED docs → pointer + `ARCHITECTURE-*` canonical. |
| MI3 | QA package (20 docs): No Escrow + percent + RTL; PASS 2026-08-07. |
| MI4 | prod migrations: MCP only; worktree `ke-arch` docs-only. |
| MI5 | Index rows: one-line summary + status; detail in linked doc. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| mega MASTER as sole spec | pointers + domain docs |
| Escrow C11b | C11א No Escrow |
| fixed commission in index defaults | MI1 pricing rules |
| docs in nested side folders | MI1 flat docs/ |

---

## סכמת DB

אין DDL. Index references tables via domain docs (`products`, `order_items`, `settlement_events`, …).

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | STALE doc without banner | refresh or DEPRECATED |
| CE2 | two BINDING conflict | CONTRADICTIONS wins |
| CE3 | ke-arch vs main repo edit | R1 worktree |
| CE4 | em-dash in BINDING doc | template R7 reject |
| CE5 | missing 5th section | not BINDING-complete |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | auto-generate index from front-matter |
| O2 | link check CI for docs |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING index; shorten QA tables → ARCHITECTURE-DOCS-INDEX |
