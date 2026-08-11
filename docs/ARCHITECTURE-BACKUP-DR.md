# ארכיטקטורה: גיבוי ושחזור (Backup & DR)

גיבויים, PITR, ושחזור לפרויקט Supabase של KenyonExpress.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #33/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/RUNBOOK-PRODUCTION.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
docs/CONTRADICTIONS.md
```

---

## 0. קווים אדומים

| # | כלל |
|---|---|
| B1 | אין daily backup / PITR אמין על Supabase Free. |
| B2 | **Supabase Pro חובה** לפני תשלום Cardcom ראשון (capture אמיתי). |
| B3 | גם ב-Pro: גיבוי offsite (`pg_dump` מוצפן) בנוסף לפלטפורמה. |
| B4 | גיבויים מכילים PII וכסף: הצפנה, IAM מצומצם, לא ב-git של האפ. |
| B5 | שחזור אמיתי רק אחרי תרגיל רבעוני על פרויקט scratch. |
| B6 | שחזור משחזר ledger ו-snapshots כפי שנשמרו. לא ממציאים נאמן / held / J5. כסף קופון = שולם באתר + יתרה בעסק; פיזי לפי `platform_percent` ב-`order_items`. |
| B7 | Vercel Instant Rollback משחזר **קוד**, לא DB. |
| B8 | מיגרציות prod לפי RUNBOOK; שחזור לא מחליף מיגרציה שגויה בלי תוכנית. |

---

## 1. שכבות גיבוי

| שכבה | מה | RPO יעד |
|---|---|---|
| Daily backups (Pro) | גיבויי פלטפורמה | ≤ 24 שע' |
| PITR (Pro) | שחזור לנקודת זמן | דקות (לפי תוכנית) |
| Offsite `pg_dump` | CI / מכונה מאובטחת → אחסון מוצפן | ≤ 24 שע' |
| R2 / Storage | מדיה; העתק/גרסאות נפרד | לפי באקט |

יעד RTO לאירוע DB קשה: שעות (scratch + cutover env), אלא אם PITR באותו פרויקט מספיק.

---

## 2. מה מגבים

חובה: Postgres (סכמה + נתונים), Auth users דרך גיבוי/PITR של הפרויקט.  
נפרד: סודות Vercel/Cardcom (לא ב-dump בטקסט גלוי).  
אסור: dumps לא מוצפנים ב-Slack / Drive אישי / repo.

מיקום offsite מומלץ (מחוץ ל-repo):

```
/Users/ofir/kenyonexpress-web/backups/
```

---

## 3. שחזור

### 3.1 PITR באותו פרויקט

1. `CHECKOUT_ENABLED=false`  
2. בחירת timestamp לפני הנזק  
3. שחזור במסך Supabase  
4. smoke: login, קטלוג, הזמנת טסט ב-mock  
5. תיעוד ב-`STATE.md`  

### 3.2 Scratch / פרויקט חדש

1. יצירת scratch  
2. שחזור dump או PITR  
3. מיגרציות חסרות לפי RUNBOOK בלבד  
4. עדכון env ב-Preview קודם, ואז Production  
5. תרגיל רבעוני חובה לפני הסתמכות  

### 3.3 אסור

- `supabase db reset` על prod  
- מחיקת `schema_migrations` כדי "להריץ שוב"  
- סימון הזמנות `paid` ידנית כתחליף ל-webhook אחרי שחזור  

---

## 4. תרגיל DR רבעוני

| בדיקה | PASS |
|---|---|
| שחזור dump/PITR ל-scratch | האפ עולה מול הפרויקט |
| Login + קטלוג | עובד |
| Checkout mock | לא שובר ledger ב-prod |
| זמן כולל מתועד | ≤ יעד RTO |

---

## 5. Acceptance

- [ ] Pro + PITR לפני capture  
- [ ] Offsite מוצפן מתוזמן  
- [ ] Runbook שחזור + כיבוי checkout  
- [ ] תרגיל רבעוני מתועד  
- [ ] B6: שחזור בלי המצאת נאמן; שמירת snapshots  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #33/50: ריענון BINDING (Pro, PITR, offsite, DR) |
