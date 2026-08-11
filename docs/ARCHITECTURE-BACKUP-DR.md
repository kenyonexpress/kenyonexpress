# ARCHITECTURE: Backup and Disaster Recovery

גיבוי ו-DR: Supabase PITR, גיבוי נכסי R2, יעדי RTO/RPO, checklist תרגיל שחזור רבעוני.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/RUNBOOK-INCIDENTS.md
docs/RUNBOOK-PRODUCTION-DEPLOY.md
docs/RUNBOOK-OPERATIONS.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/LAUNCH-DAY.md
```

---

## 0. יעדי RTO / RPO

| מדד | יעד | הערה |
|---|---|---|
| RPO (DB) | ≤ 1 שעה | PITR / WAL |
| RTO storefront לקריאה | ≤ 4 שעות | CDN/ISR + DB קריאה |
| RTO checkout / כסף | ≤ 8 שעות | כולל reconcile Cardcom |
| RPO מדיה (R2) | ≤ 24 שעות | versioning + שכפול |
| RTO DNS / Vercel app | ≤ 1 שעה | Instant Rollback |

Kill switch בכל אירוע כסף/שחזור:

```
CHECKOUT_ENABLED=false
```

---

## 1. Supabase PITR

### 1.1 חובה בפרוד

1. תוכנית עם **Point-in-Time Recovery** פעילה (Pro+).
2. גיבויים יומיים אוטומטיים + WAL לפי המנוי.
3. חלון PITR ≥ יעד RPO (לוודא ב-Dashboard).
4. הרשאת restore: owner/ops בלבד.

### 1.2 סדר עדיפות שחזור לוגי

| עדיפות | מחלקה | דוגמאות |
|---|---|---|
| P0 | כסף + זהות | `orders`, `order_items`, `payments`, `vouchers`, `wallet_*`, `ledger_*`, `auth`/`profiles` |
| P1 | קטלוג | `products`, `categories`, `suppliers`, מפתחות מדיה |
| P2 | תפעול | `notification_outbox`, prefs, support |
| P3 | אנליטיקה | `analytics_events` (מותר לאבד חלקית) |

### 1.3 נוהל restore (תמצית)

ראה גם `RUNBOOK-INCIDENTS.md` §5.

```text
CHECKOUT_ENABLED=false → stop crons → pick PITR timestamp
  → restore to staging first → verify P0
  → Cardcom reconcile → promote
  → rotate secrets if breach → smoke → open checkout
```

אסור: `supabase db push` כתיקון; סימון `paid` ידני.

---

## 2. R2 asset backup

### 2.1 מה ב-bucket

תמונות מוצר / OG / נכסי ספק. אין dumps DB או סודות ב-bucket ציבורי.

### 2.2 בקרות

| בקרה | פרט |
|---|---|
| Versioning | חובה על bucket הפרוד |
| Retention | מניעת מחיקה מקרית ≥ 30 יום אם זמין |
| Replication | bucket משני (אזור/חשבון אחר) או sync יומי |
| Access | כתיבה רק מ-presigned PUT שרת |
| GC | מחיקת יתומים רק אחרי dry-run + אישור |

### 2.3 שחזור מדיה

1. אובייקט נמחק → versioning.
2. bucket אבוד → bucket משני + עדכון base URL אם צריך.
3. אחרי restore DB ישן: מדגם 404 על תמונות קטלוג.

---

## 3. שכבות נוספות

| שכבה | תפקיד |
|---|---|
| Vercel Instant Rollback | אפליקציה תוך דקות |
| Logical dump מוצפן (אופציונלי) | שבועי offsite; לא ב-git |
| Secrets vault/Dashboard | רוטציה אחרי חשד דליפה |
| Cardcom | מקור אמת לחיובים שנלכדו אחרי restore |

---

## 4. Quarterly restore drill checklist

מריצים **פעם ברבעון**. מתעדים תאריך + זמנים בפועל מול RTO/RPO.

### 4.1 לפני התרגיל

- [ ] PITR פעיל; חלון ≥ RPO
- [ ] יש פרויקט/ענף staging ל-restore (לא דריסת prod)
- [ ] רשימת order_id / voucher_id לדוגמה לאימות
- [ ] בעל תפקיד restore זמין
- [ ] Cardcom test/read access ל-reconcile מדומה

### 4.2 במהלך התרגיל

- [ ] בחירת timestamp (למשל "לפני מיגרציה מדומה")
- [ ] Stop crons על סביבת התרגיל
- [ ] Restore ל-staging
- [ ] מדידת זמן עד DB זמין (RTO חלקי)
- [ ] אימות ספירות P0 (orders, payments, vouchers, wallet)
- [ ] פתיחת הזמנת דוגמה + קופון דוגמה ב-UI staging
- [ ] בדיקת מדגם תמונות R2 (version restore מדומה אם אפשר)
- [ ] תרגול `CHECKOUT_ENABLED=false` על staging/preview
- [ ] תיעוד פערים (חסר אינדקס, הרשאות, סודות)

### 4.3 אחרי התרגיל

- [ ] רישום תאריך + משך בפועל במסמך זה / STATE
- [ ] אם RTO/RPO לא עמדו: פעולת שיפור אחת (תוכנית Supabase, סקריפט אימות, הרשאות)
- [ ] עדכון runbook אם הצעדים השתנו
- [ ] מחיקת/בידוד DB תרגיל כדי לא לבלבל עם prod

| רבעון | תאריך | RPO נמדד | RTO נמדד | Pass? | הערות |
|---|---|---|---|---|---|
| 2026-Q3 | | | | | |
| 2026-Q4 | | | | | |
| 2027-Q1 | | | | | |
| 2027-Q2 | | | | | |

---

## 5. Checklist מוכנות חודשי

- [ ] PITR פעיל
- [ ] תרגיל רבעוני אחרון < 90 יום או מתוזמן
- [ ] R2 versioning + יעד שכפול ידוע
- [ ] שמות בעלי restore מעודכנים
- [ ] Kill switch checkout בדוק
- [ ] רשימת סודות לרוטציה מעודכנת

---

## 6. מה אסור

- דריסת prod בלי staging verify
- Down-migrations הרסניות בלי PITR מוכן
- מחיקת bucket R2 באמצע אירוע
- להסתמך על לפטופ מפתח כגיבוי

---

## 7. Revision

| Date | Change |
|---|---|
| 2026-07-31 | טיוטת PITR + drills |
| 2026-08-02 | R2 + runbook DR |
| 2026-08-03 | RTO/RPO table + quarterly restore checklist מורחב |
