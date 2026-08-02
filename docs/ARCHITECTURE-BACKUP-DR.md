# ARCHITECTURE: Backup & Disaster Recovery

גיבוי Supabase PITR, אסטרטגיית גיבוי R2, ו-runbook לשחזור.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.  
Companions:

```
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/DDL-FIXES.md
docs/RUNBOOK-OPERATIONS.md
```

פרויקט prod (דוגמה):

```
ixvwfbuvfxxsjiywhbbb
```

---

## 0. יעדי שירות

| מדד | יעד |
|---|---|
| RPO (DB) | ≤ 1 שעה (PITR) |
| RTO storefront לקריאה | ≤ 4 שעות |
| RTO checkout / כסף | ≤ 8 שעות כולל reconcile מול Cardcom |
| RPO מדיה (R2) | ≤ 24 שעות (גרסה/שכפול) |
| RTO DNS / Vercel | ≤ 1 שעה (rollback deploy) |

Kill switch checkout: `CHECKOUT_ENABLED=false` ב-Vercel בכל אירוע שחזור כסף.

---

## 1. Supabase PITR

### 1.1 חובה בפרוד

1. תוכנית עם **Point-in-Time Recovery** פעילה (Pro+).
2. גיבויים יומיים אוטומטיים + WAL לפי המנוי.
3. שמירת חלון PITR לפי מדיניות ספק (לוודא Dashboard ≥ יעד RPO).
4. גישה ל-restore רק ל-owner/ops; לא לכל חבר צוות.

### 1.2 מה משחזרים קודם (סדר עדיפות)

| עדיפות | מחלקה | דוגמאות |
|---|---|---|
| P0 | כסף + זהות | `orders`, `order_items`, `payments`, `vouchers`, `wallet_*`, `ledger_*`, `auth`/`profiles` |
| P1 | קטלוג | `products`, `categories`, `suppliers`, refs לתמונות |
| P2 | תפעול | `notifications_*`, outbox, prefs |
| P3 | אנליטיקה | `analytics_events` (מותר לאבד חלקית) |

### 1.3 תרגיל רבעוני

```text
1. בחירת timestamp (לפני migration מסוכנת מדומה)
2. Restore ל-project staging / branch DB נפרד (לא דריסה עיוורת של prod)
3. אימות: ספירת שורות P0, הזמנת דוגמה, voucher דוגמה, יתרת ארנק
4. תיעוד זמן בפועל מול RTO/RPO
5. עדכון המסמך אם היעד לא עמד
```

---

## 2. אסטרטגיית גיבוי R2 (מדיה)

### 2.1 מה ב-R2

- תמונות מוצר / OG / נכסי ספק
- מפתחות content-addressed (dedup)
- אין סודות / dumps DB ב-R2 ציבורי

### 2.2 הגנות

| בקרה | פרט |
|---|---|
| Versioning | הפעלת object versioning ב-bucket הפרוד |
| Object Lock / retention | לפי יכולת התוכנית; מינימום מניעת מחיקה מקרית ל-30 יום |
| שכפול | העתקה תקופתית ל-bucket שני (חשבון/אזור אחר) או sync יומי |
| גישה | כתיבה רק מ-presigned PUT שרת; אין כתיבה מאנונימי |
| GC | מחיקת יתומים רק אחרי job יבש + אישור; לא ביום אירוע |

### 2.3 שחזור מדיה

1. אם אובייקט נמחק: שחזור מ-versioning.
2. אם bucket אבוד: restore מה-bucket המשני + עדכון DNS/public base URL אם צריך.
3. DB מחזיק URLs/keys: אחרי שחזור DB ישן מול מדיה חדשה, להריץ בדיקת 404 על מדגם תמונות.

---

## 3. שכבות נוספות

| שכבה | תפקיד |
|---|---|
| Vercel deploy rollback | החזרת אפליקציה ל-deploy קודם תוך דקות |
| Logical dump מוצפן (אופציונלי) | dump שבועי offsite (age/gpg), לא ב-git |
| Secrets | רק Dashboard / vault; רוטציה אחרי חשד דליפה |
| Cardcom | מקור אמת לתשלומים שנלכדו; אחרי restore DB חובה reconcile ב-`GetLpResult` |

אין לסמוך על מחשב מקומי של מפתח כגיבוי.

---

## 4. Runbook: אירוע הרסני

### 4.1 מיגרציה רעה / מחיקת נתונים

```text
1. CHECKOUT_ENABLED=false
2. הכרזת SEV (ops + owner)
3. עצירת jobs: cron notifications, search index, agents
4. בחירת timestamp PITR לפני הנזק
5. Restore ל-staging → אימות מדגמי P0
6. Cutover ל-DB המשוחזר לפי נוהל ספק (או promote)
7. Reconcile Cardcom: הזמנות pending עם חיוב בכרטיס
8. Replay/verify webhooks חסרים (לא סימון paid ידני ב-SQL)
9. בדיקת R2: תמונות קטלוג במדגם
10. פתיחת checkout רק אחרי smoke: login, PDP, cart, test charge/refund policy
```

### 4.2 Ransomware / פריצה

1. רוטציית כל הסודות (Supabase service, Resend, QStash, Cardcom, R2).
2. השבתת מפתחות ישנים.
3. Restore מ-PITR לנקודה לפני החשד.
4. Audit `auth.users` / members חדשים.
5. אין לשלם כופר כחלק מהנוהל הטכני.

### 4.3 אובדן אזור R2

1. הצבעת CDN/public URL ל-bucket המשני.
2. עדכון `NEXT_PUBLIC` / image loader אם צריך.
3. אימות מדגם מוצרים.
4. בלי לגעת ב-DB אם המטא-דאטה תקינה.

### 4.4 מה אסור

- `supabase db push` כ"תיקון" באירוע.
- להחיל down-migrations הרסניות בלי PITR מוכן.
- לסמן `orders.status = paid` ידנית בלי Cardcom verify.
- למחוק bucket R2 כדי "לנקות" באמצע אירוע.

---

## 5. Checklist מוכנות (חודשי)

- [ ] PITR פעיל; חלון ≥ RPO
- [ ] תרגיל רבעוני מתועד עם תאריך אחרון
- [ ] R2 versioning + יעד שכפול ידוע
- [ ] בעלי תפקידים ל-restore מוגדרים (שמות)
- [ ] Kill switch checkout מתועד ובדוק
- [ ] רשימת סודות לרוטציה מעודכנת

---

## 6. Revision

| Date | Change |
|---|---|
| 2026-07-31 | טיוטת PITR + drills |
| 2026-08-02 | הרחבה: PITR, R2 backup/versioning/replicate, runbook DR מלא |
