# ארכיטקטורה: גיבוי ושחזור (Backup / DR)

גיבויי DB, קבצים, ו-RTO/RPO שמרניים לשיגור.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/BACKUP-RECOVERY.md
docs/BACKUP-RESTORE-RUNBOOK.md
docs/ARCHITECTURE-INCIDENT-RESPONSE.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
```

מודל כסף: שחזור לא משנה כללי No Escrow; reconcile תשלומים אחרי restore.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| BD1 | מקור אמת DB = Supabase Postgres עם PITR/גיבויים של הספק. |
| BD2 | RPO יעד שמרני לשיגור: ≤ 24h (לכוון ל-PITR אם זמין בתוכנית). |
| BD3 | RTO יעד שמרני: ≤ 8h לשחזור קטלוג+תשלומים לקריאה. |
| BD4 | סודות לא בגיבוי קוד; רק ב-secret store. |
| BD5 | מדיה R2/Storage: גרסאות/replication לפי ספק; לא לסמוך על git. |
| BD6 | אחרי restore: אימות RLS + reconcile Cardcom (לא לסמן paid עיוור). |
| BD7 | תרגול שחזור יבש לפחות לפני GA. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| גיבוי רק `pg_dump` ידני בלי לוח | נשכח. |
| שחזור פרוד בלי reconcile תשלומים | double/miss charge. |
| שמירת `.env` ב-tar ציבורי | דליפת סודות. |

---

## 2. סכמת DB

אין שינוי. גיבוי חל על כל `public` + storage מטא-דאטה.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `restore_partial` | קטלוג קודם / תשלומים חדשים → reconcile ידני |
| `rls_off_after_restore` | שער NOT rowsecurity לפני פתיחה |
| `webhook_replay_storm` | idempotency keys |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | תוכנית PITR מדויקת ב-Supabase | לאמת בלוח הבקרה לפני GA |
| O2 | גיבוי יומי tar למחשב מקומי | כבר בנוהל אוטונומי; לא מחליף DB |

עודכן: 2026-08-12.

---

## 5. Acceptance

- [ ] RPO/RTO מתועדים  
- [ ] reconcile אחרי restore  
- [ ] חלופות + קצה + פתוחות  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING לפי תבנית |
