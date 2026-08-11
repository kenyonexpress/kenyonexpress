# ארכיטקטורה: גיבוי והתאוששות (Backup / DR)

גיבויי Supabase, PITR, ושחזור לפרויקט KenyonExpress. בלי שינוי מודל כסף.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #33/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/RUNBOOK-PRODUCTION.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-LAUNCH-CHECKLIST.md
docs/INCIDENT-PLAYBOOKS.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. שחזור DB לא "משחרר Escrow"; אחרי restore רצים reconcile תשלומים/שוברים.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| B1 | מקור אמת לנתונים = Supabase Postgres (פרוד). |
| B2 | PITR מופעל בפרוד; RPO יעד ≤ 24 שע' (שאיפה: דקות לפי תוכנית). |
| B3 | גיבוי לוגי יומי של הריפו (בלי `node_modules`/`.next`) לדסקטופ/ארכיון לפי CLAUDE. |
| B4 | שחזור נבדק לפחות פעם ברבעון על פרויקט staging. |
| B5 | אחרי restore: reconcile Cardcom + vouchers + wallet; לא מסמנים paid ידנית. |
| B6 | שחזור לא ממציא מודל Escrow ישן. |

---

## 1. מה מגובים

| נכס | איך |
|---|---|
| DB | Supabase automatic + PITR |
| Storage (R2/images) | לפי מדיניות באקט |
| Secrets | לא בגיבוי tar; רק במנהל סודות |
| קוד | git remote |

---

## 2. תרחישי DR

| תרחיש | פעולה |
|---|---|
| מחיקת טבלה בטעות | PITR לנקודה לפני |
| אובדן פרויקט | restore לפרויקט חדש + עדכון env |
| Cardcom/DB חוסר סנכרון | reconcile GetLpResult; לא trust webhook ישן בלבד |

---

## 3. Acceptance

- [ ] PITR מתועד  
- [ ] תרגיל restore  
- [ ] reconcile אחרי שחזור  
- [ ] No Escrow ב-B6  

---

## 4. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2 #33 pass-2 |
