# ארכיטקטורה: גיבוי ושחזור (Supabase)

גיבויים, PITR, ושחזור לפרויקט Supabase של KenyonExpress.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
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
| B1 | **אין** capture אמיתי על Supabase Free (אין daily backup / אין PITR). |
| B2 | **Supabase Pro חובה** לפני תשלום Cardcom ראשון. |
| B3 | גם ב-Pro: גיבוי offsite (`pg_dump` מוצפן) בנוסף לגיבויי הפלטפורמה. |
| B4 | גיבויים מכילים PII וכסף: הצפנה, IAM מצומצם, לא ב-git של האפ. |
| B5 | שחזור אמיתי רק אחרי תרגיל רבעוני על פרויקט scratch. |
| B6 | שחזור משחזר ledger ו-snapshots כפי שנשמרו. **לא** ממציאים Escrow/held/J5. כסף קופון = No Escrow; פיזי לפי `platform_percent` ב-`order_items` (CONTRADICTIONS). |
| B6 | Vercel Instant Rollback משחזר **קוד**, לא DB. |
| B7 | מיגרציות prod רק דרך MCP (ראה RUNBOOK); שחזור לא מחליף מיגרציה שגויה בלי תוכנית. |

---

## 1. שכבות גיבוי Supabase

| שכבה | מה | RPO יעד |
|---|---|---|
| Daily backups (Pro) | גיבויי פלטפורמה אוטומטיים | ≤ 24 שע' |
| PITR (Pro) | שחזור לנקודת זמן | דקות (לפי תוכנית) |
| Offsite `pg_dump` | GitHub Actions / מכונה מאובטחת → אחסון מוצפן | ≤ 24 שע' |
| R2 / Storage | תמונות ומדיה; גרסאות/העתק נפרד | לפי מדיניות באקט |

יעד RTO לאירוע DB קשה: שעות (scratch project + cutover DNS/env), לא דקות, אלא אם PITR מספיק באותו פרויקט.

---

## 2. מה מגבים

חובה: Postgres (סכמה + נתונים), Auth users דרך הגיבוי/PITR של הפרויקט.  
נפרד: סודות Vercel/Cardcom (לא ב-dump בטקסט גלוי).  
אסור בגיבוי לא מוצפן מחוץ לחשבון: dumps ב-Slack/Drive אישי.

מיקום offsite מומלץ (מחוץ ל-repo):

```
/Users/ofir/kenyonexpress-web/backups/
```

---

## 3. שחזור

### 3.1 PITR באותו פרויקט

1. `CHECKOUT_ENABLED=false`  
2. בחירת timestamp לפני הנזק  
3. שחזור לפי מסך Supabase  
4. smoke: login, קטלוג, הזמנת טסט ב-mock  
5. תיעוד ב-`STATE.md`  

### 3.2 שחזור ל-scratch / פרויקט חדש

1. יצירת פרויקט scratch  
2. שחזור dump או PITR לפי היכולת  
3. החלת מיגרציות חסרות דרך **MCP בלבד** אם נדרש  
4. עדכון env ב-Vercel Preview קודם, ורק אז Production  
5. תרגיל רבעוני חובה לפני הסתמכות  

### 3.3 אסור בשחזור

- `supabase db reset` על prod  
- מחיקת `schema_migrations` כדי "להריץ שוב"  
- לסמן הזמנות paid ידנית כתחליף ל-webhook אחרי שחזור  

---

## 4. תרגיל DR רבעוני

| בדיקה | PASS |
|---|---|
| שחזור dump/PITR ל-scratch | האפ עולה מול הפרויקט |
| Login + קריאת קטלוג | עובד |
| Checkout mock | לא שובר ledger היסטורי ב-prod |
| זמן כולל מתועד | ≤ יעד RTO |

---

## 5. Acceptance

- [ ] Pro + PITR לפני capture  
- [ ] Offsite מוצפן מתוזמן  
- [ ] Runbook שחזור + כיבוי checkout  
- [ ] תרגיל רבעוני מתועד  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | גיבוי/שחזור Supabase ממוקד (Pro, PITR, offsite, DR) |
| 2026-08-06 | QA: קישור GDPR; יישור ל-RUNBOOK MCP |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
| 2026-08-07 | QA audit: B6 שחזור בלי Escrow; שמירת `platform_percent` snapshots |
