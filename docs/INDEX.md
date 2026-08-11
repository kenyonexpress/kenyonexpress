# docs/INDEX.md: אינדקס שלמות מסמכים

אינדקס קנוני לשלמות `docs/`. נפרד מ-`MASTER-INDEX.md`.

Status: **BINDING (integrity index)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. מודל: **No Escrow**

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| I1 | **BUSINESS-MODEL + CONTRADICTIONS + ARCHITECTURE-MONEY** גוברים על מסמכים ישנים. |
| I2 | WP/PHP = מיגרציה/היסטוריה בלבד; stack = Next + Supabase. |
| I3 | אין default `platform_percent`; אין Escrow על קופון. |
| I4 | batch-2: כל מסמך audit/index = commit נפרד + push. |
| I5 | dumps מדידה 1000+ שורות → snapshot + git history. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| MASTER-ARCHITECTURE כמקור יחיד | שכבות ישנות |
| שמירת DB-SCHEMA static 1296 שורות | regenerate script |
| Escrow docs ללא באנר | סותר C11 |
| BUSINESS-MODEL-RULES.md | לא קיים; BUSINESS-MODEL |

---

## 3. סכמת DB (מסמכי סכימה)

| מסמך | תפקיד |
|---|---|
| `DB-SCHEMA.md` | regenerate via `scripts/db-doc.mjs` |
| `MIGRATION-BACKLOG.md` | apply status (מקור אמת drift) |
| `DB-DRIFT-AUDIT.md` | ארכיון 28.07 |
| `DDL-FIXES.md` | סדר MCP 071-073 |

---

## 4. מקרי קצה

| # | מצב | פעולה |
|---|---|---|
| E1 | doc סותר CONTRADICTIONS | P0 fix |
| E2 | orphan (no inbound link) | link from MASTER-INDEX |
| E3 | `.claude/skills` Escrow | P0 agent impact |
| E4 | stale MEASURED dump | trim + pointer |
| E5 | INDEX vs MASTER-INDEX | שני תפקידים |

---

## 5. פתוחות

| עדיפות | קובץ | פער |
|---|---|---|
| P0 | `.claude/skills/cardcom-payments/SKILL.md` | held language |
| P0 | `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | R1 held |
| P1 | `PHASE2-3-SPEC.md` | default 5% |
| P1 | `MASTER-ARCHITECTURE.md` | באנר non-canonical |
| P2 | orphans | hardcoded-audit, rtl-violations (קושרו batch-2) |

### סיכום ספירות

| קטגוריה | count |
|---|---:|
| סתירות מודל (P0+P1) | ~11 (post batch-2 fixes) |
| WP כ-stack | 5 |
| orphans | 3 |

---

## batch-2 (מסמכי audit/root, 2026-08-12)

| # | מסמך | סטטוס |
|---:|---|---|
| 1 | CONTRADICTIONS.md | BINDING No Escrow |
| 2 | DB-DRIFT-AUDIT.md | snapshot |
| 3 | DB-SCHEMA.md | regenerate pointer |
| 4 | DDL-FIXES.md | BINDING |
| 5 | FINAL-REPORT.md | BINDING |
| 6 | GAPS-CODE-VS-DOCS.md | BINDING |
| 7 | INDEX.md | this file |
| 8 | MIGRATION-BACKLOG.md | BINDING |
| 9 | PORT-FROM-DUP-REPO.md | ארכיון |
| 10 | PRODUCTION-CHANGES-2026-07-27.md | ארכיון |
| 11 | PROGRESS-REPORT-AUG.md | BINDING |
| 12 | WP-EXPORT dry run | snapshot |
| 13 | WP-IMPORT mapping | BINDING |
| 14 | coupon-page-measured | snapshot |
| 15 | hardcoded-audit | snapshot |
| 16 | launch-week-plan | BINDING |
| 17 | rtl-violations | snapshot |
| 18 | CHANGELOG.md | process BINDING |
| 19-23 | GO-LIVE, RELEASE-READINESS, CHECKOUT-COMPLETE, LEDGER-DESIGN, NEXT-GOALS | BINDING |

מקור מודל:

```
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-MONEY.md
```

קישור: `docs/MASTER-INDEX.md` (תקצירים per doc).

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2 audit pack + 5 sections |
| 2026-08-11 | יצירה |
