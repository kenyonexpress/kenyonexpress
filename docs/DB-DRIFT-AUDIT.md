# DB Drift Audit (ארכיון מדידה)

**Snapshot היסטורי.** נמדד 2026-07-28 מול פרויקט `ixvwfbuvfxxsjiywhbbb`. הפירוט המלא (185+ אובייקטים, enum conflicts) ב-git history לפני commit זה.

Status: **BINDING (ארכיון)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מקור אמת עדכני: **`docs/MIGRATION-BACKLOG.md`** (29.07, כולל body-diff)

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| D1 | **אין `db push` לפרוד.** רק MCP `apply_migration` ממוקד. |
| D2 | פער מספור מיגרציות (001 vs 20260707…) חוסם CLI push. |
| D3 | מיגרציות = baseline intent; פרוד = partial (28/86 רשומות בזמן המדידה). |
| D4 | **No Escrow:** 079/080 מבוטלות; 081/085 = no-escrow. |

---

## 2. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `supabase db push --include-all` | replay מסוכן על DB חי |
| יצירת אובייקטים ידנית ב-SQL Editor | לא נרשם ב-schema_migrations |
| התעלמות מ-enum shadowing | 22P02 runtime |
| החלת 027 verbatim | header DRAFT + תלויות |

---

## 3. סכמת DB (ממצאים עיקריים)

| מדד | ערך |
|---|---:|
| אובייקטים במיגרציות | 271 |
| קיימים בפרוד | 86 |
| **חסרים** | **185** |
| orphan בפרוד | 0 |

### תת-מערכות חסרות (דגימה)

| תחום | קבצים |
|---|---|
| Payout chain | 027, 051, 079, 081 |
| Notifications | 031 |
| Analytics | 033, 034, 056 |
| Ledger | 058, 065 |
| Catalog search | 030 |

### Enum conflicts (verdict)

| enum | verdict |
|---|---|
| `product_type.service` | **לא קיים** בפרוד |
| `payment_status.cancelled` | **חסר** (046 wins) |

---

## 4. מקרי קצה

| # | מצב | סיכון |
|---|---|---|
| E1 | ADD VALUE + שימוש באותה TX | Postgres דוחה |
| E2 | CREATE OR REPLACE ישן | שם ≠ גוף |
| E3 | 027 DRAFT marker | payout blocked |
| E4 | apply_migration timestamp | מרחיב פער |
| E5 | enum כפול swallowed | ערך אבוד |

---

## 5. פתוחות

| # | פער |
|---|---|
| O1 | repair order (MIGRATION-BACKLOG) |
| O2 | `settlement_match_status` enum |
| O3 | payout UI vs missing 027 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: snapshot מקוצר |
| 2026-07-28 | מדידה מקורית |
