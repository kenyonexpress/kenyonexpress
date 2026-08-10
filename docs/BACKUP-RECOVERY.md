# מדיניות גיבוי ושחזור (תפעול)

Supabase Pro, תרגול שחזור, ו-RPO/RTO מעשיים.

Status: **RUNBOOK** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקור מחייב (ארכיטקטורה):** לא מחליף את

```
docs/ARCHITECTURE-BACKUP-DR.md
```

מסמך זה = מדיניות תפעולית קצרה לתרגול ולמספרים.

מסמכים נוספים:

```
docs/RUNBOOK-PRODUCTION.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/SLA-MONITORING.md
docs/CONTRADICTIONS.md
```

---

## 1. תנאי סף

| כלל | פירוט |
|---|---|
| תוכנית | **Supabase Pro חובה** לפני Cardcom חי ראשון |
| Free | אין הסתמכות על daily backup / PITR |
| Offsite | `pg_dump` מוצפן בנוסף לגיבויי הפלטפורמה |
| קוד | Vercel Instant Rollback = קוד בלבד, לא DB |

---

## 2. RPO / RTO

| תרחיש | RPO יעד | RTO יעד |
|---|---|---|
| טעות נתונים נקודתית (PITR באותו פרויקט) | דקות (לפי תוכנית Pro) | ≤ 2 שע' |
| אובדן פרויקט / שחזור ל-scratch | ≤ 24 שע' (daily + offsite) | ≤ 8 שע' עסקים (cutover env/DNS) |
| מדיה ב-R2 | לפי גרסאות באקט | לפי שחזור אובייקטים |

אין הבטחת RTO של דקות לאירוע DB מלא בלי PITR מספיק.

---

## 3. מה מגבים

חובה: Postgres (סכמה + נתונים), Auth דרך גיבוי/PITR של הפרויקט.  
נפרד: סודות Vercel/Cardcom (לא בטקסט גלוי ב-dump).  
אסור: dumps לא מוצפנים ב-Drive/Slack.

מיקום offsite מומלץ (מחוץ ל-repo):

```
/Users/ofir/kenyonexpress-web/backups/
```

---

## 4. תרגול שחזור (רבעוני)

1. יצירת פרויקט scratch  
2. שחזור dump או PITR לפי היכולת  
3. מיגרציות חסרות רק דרך **MCP** אם נדרש  
4. Preview env ב-Vercel → smoke (login, קטלוג, checkout mock)  
5. תיעוד תוצאה ב-

```
STATE.md
```

בלי תרגיל רבעוני: אסור להסתמך על המספרים למעלה כאילו נבדקו.

---

## 5. אחרי שחזור (כסף)

משחזרים ledger ו-snapshots כפי שנשמרו.  
**לא** ממציאים Escrow / held / J5. קופון = No Escrow; פיזי לפי `platform_percent` ב-`order_items`.

---

## 6. Acceptance

- [ ] Pro פעיל לפני תשלום חי  
- [ ] תרגיל רבעוני מתועד  
- [ ] RPO/RTO ידועים לבעלים  
- [ ] rollback קוד לא מוחלף ב"שחזור DB"

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | מדיניות תפעול RPO/RTO מעל ARCHITECTURE-BACKUP-DR |
