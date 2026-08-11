# BACKUP-RESTORE-RUNBOOK.md
# Runbook: גיבוי ושחזור (כולל Supabase PITR)

צעדים לתרגול ולאירוע אמיתי. מדיניות מספרים:

```
docs/BACKUP-RECOVERY.md
docs/ARCHITECTURE-BACKUP-DR.md
```

Status: **RUNBOOK** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/BACKUP-RECOVERY.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/RUNBOOK-PRODUCTION.md
docs/INCIDENT-RESPONSE-RUNBOOK.md
docs/SLA-MONITORING.md
```

כלל ברזל: מיגרציות ל-prod רק דרך **MCP**. Vercel rollback = קוד בלבד, לא DB.

---

## 1. תנאי סף לפני כסף חי

- [ ] Supabase **Pro** (או תוכנית עם PITR)  
- [ ] PITR מופעל; חלון שמירה ידוע (ימים לפי התוכנית)  
- [ ] `pg_dump` מוצפן offsite לפחות שבועי  
- [ ] סודות Cardcom/Vercel **לא** בתוך dump בטקסט גלוי  
- [ ] תרגול רבעוני מתועד ב-`STATE.md`  

מיקום offsite מומלץ (מחוץ ל-repo):

```
/Users/ofir/kenyonexpress-web/backups/
```

---

## 2. מה מגבים

| נכס | איך | הערה |
|---|---|---|
| Postgres | PITR + daily backups של Supabase | סכמה + נתונים |
| Auth users | חלק מפרויקט Supabase | לא לשחזר חצי בלי תיאום |
| Storage תמונות | באקט + גרסאות אם מופעל | נפרד מ-SQL |
| קוד | Git + Vercel | Instant Rollback |
| Env | Vercel dashboard / secrets manager | לא ב-git |

---

## 3. PITR: שחזור נקודתי (אותו פרויקט)

**מתי:** מחיקה בטעות, מיגרציה רעה שניתן לחזור אחורה בזמן, corruption נקודתי.

### 3.1 לפני

1. SEV לפי IR; שקול `CHECKOUT_ENABLED=false`.  
2. רשום `incident_start` + השערת `restore_to` (timestamp מדויק, Asia/Jerusalem → UTC).  
3. אל תריץ מיגרציות חדשות באמצע.

### 3.2 ביצוע (ממשק Supabase)

1. Dashboard → Database → Backups / Point in Time Recovery.  
2. בחר נקודה **לפני** האירוע הפוגע.  
3. אשר restore לפי אשף הפרויקט (downtime צפוי; קרא את האזהרות ב-UI).  
4. אחרי עלייה: בדוק חיבור, auth, ספירת טבלאות כסף קריטיות.  
5. מיגרציות שאבדו אחרי נקודת השחזור: החל מחדש **רק דרך MCP**, אחת־אחת, אחרי בדיקה.

### 3.3 אחרי

שאילתות אימות מינימום (שירות-role / SQL editor):

```sql
-- הזמנות אחרונות מול חלון האירוע
SELECT count(*), status FROM orders
WHERE created_at > now() - interval '2 days' GROUP BY 2;

-- קופונים: אין issued בלי order paid תואם (ספירה גסה)
SELECT status, count(*) FROM vouchers GROUP BY 1;

-- settlement פיזי
SELECT kind, count(*) FROM settlement_events
WHERE occurred_at > now() - interval '7 days' GROUP BY 1;
```

- [ ] Smoke: login, קטלוג, checkout כבוי או sandbox  
- [ ] השוואת orders/payments מול Cardcom לחלון החסר  
- [ ] עדכון STATE + postmortem  
- [ ] החזרת checkout רק אחרי ירוק  

**RTO יעד:** ≤ 2 שע' לתרחיש PITR באותו פרויקט (BACKUP-RECOVERY).

---

## 4. שחזור ל-scratch / אובדן פרויקט

1. צור פרויקט Supabase חדש (או scratch).  
2. שחזר מ-dump מוצפן או מגיבוי יומי.  
3. עדכן secrets ב-Vercel Preview קודם.  
4. הרץ מיגרציות חסרות ב-MCP בלבד.  
5. Smoke ב-Preview; רק אז cutover DNS/Production env.  

**RTO יעד:** ≤ 8 שע' עסקים. **RPO:** ≤ 24 שע' אם נשענים על daily + offsite.

---

## 5. `pg_dump` offsite (נוהל)

```text
# דוגמה עקרונית; סיסמה מ-env בלבד, קובץ מוצפן מיד
pg_dump "$DATABASE_URL" | gzip | openssl enc -aes-256-cbc -out backup-YYYYMMDD.sql.gz.enc
```

- שמור checksum.  
- בדוק פענוח + restore ל-scratch לפחות רבעונית.  
- אסור להעלות dump ל-Slack/Drive לא מוצפן.

---

## 6. תרגול רבעוני (חובה)

| שלב | תוצר |
|---|---|
| PITR או dump→scratch | זמן מדוד |
| Smoke checklist | עבר/נכשל |
| פערי מיגרציה | רשימה |
| רשום ב-STATE | תאריך + לקחים |

בלי תרגול: אסור להסתמך על מספרי RPO/RTO כאילו נבדקו.

---

## 7. מה לא עושים

- Restore ל-prod בלי kill switch checkout  
- "תיקון" ידני של שורות כסף בלי audit במקום restore  
- הסתמכות על Free tier  
- שחזור חלקי של טבלת payments בלי התאמה ל-Cardcom  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | Runbook PITR + offsite dump + scratch restore |
| 2026-08-11 | שאילתות אימות אחרי PITR |
