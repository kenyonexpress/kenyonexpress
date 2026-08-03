# RUNBOOK: Production (Deploy, Rollback, Migrations)

מדריך תפעול ייצור ל-KenyonExpress: פריסה, חזרה לאחור, והחלת מיגרציות.

Status: **BINDING** · Updated: 2026-08-03 (rev C)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי במסמך זה.  
המסמך מתאר פקודות; ההרצה עצמה היא מחוץ לסקופ docs-only.

Companions:

```
docs/DEPLOY.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
```

כלל ברזל: עד שרכישת הטסט עוברת, `CHECKOUT_ENABLED=false`.  
אסור: `supabase db push` עיוור ביום שיגור בלי freeze; סודות Cardcom תחת `NEXT_PUBLIC_`.

שורש הפרויקט להרצות (כשמותר):

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

Package manager: **pnpm** בלבד.

מודל כסף בזמן שיגור (תזכורת תפעולית):

- קופון: שולם באתר נשאר בפלטפורמה; יתרה בבית העסק; **אין Escrow / held**
- פיזי: פיצול לפי `platform_percent` דינמי פר מוצר (snapshot ב-`order_items`)

---

## 0. סדר ביצוע (שיגור / שינוי גדול)

| # | שלב | יציאה |
|---|---|---|
| 1 | Freeze + גיבוי | SHA קפוא; PITR / backup פעיל |
| 2 | מיגרציות (אם יש) על prod לפי §3 | `schema_migrations` מעודכן; smoke SQL |
| 3 | Vercel env Production | כל P0 ממולא |
| 4 | Deploy Production | Deployment Ready |
| 5 | Smoke בלי תשלום | home / PDP / cart / login |
| 6 | רכישת טסט (אם checkout נפתח) | paid + voucher + outbox email |
| 7 | Soft-open | `CHECKOUT_ENABLED=true` רק אחרי PASS |
| 8 | Rollback | רק בכשל, לפי §2 |

---

## 1. Deploy

### 1.1 לפני פריסה

Terminal (משורש הפרויקט):

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

דרישות: CI ירוק על SHA השיגור; רישום SHA + שעה ב-

```
STATE.md
```

### 1.2 Vercel

| שלב | פעולה |
|---|---|
| 1 | מיזוג ל-branch שמוגדר כ-Production (או promote מ-Preview) |
| 2 | וידוא Environment Variables ב-Production (§1.4) |
| 3 | Deploy / Redeploy |
| 4 | ב-Vercel: Deployment = Ready; Domain + Certificate Valid אם על הדומיין החי |

Instant Rollback חייב להיות מובן למי שבתורן לפני כל soft-open.

### 1.3 Smoke אחרי deploy (בלי תשלום)

| בדיקה | צפי |
|---|---|
| `/` | 200, RTL, בלי שגיאת JS קריטית |
| PDP קופון | מחיר אתר + יתרה בעסק תואמים UI; בלי טקסט Escrow/held |
| `/cart` | הוספה/הסרה |
| Google login | session ל-`/account` |
| `/admin` | RBAC חוסם לא-staff |
| `/admin/products` | מציג `platform_percent` פר מוצר (לא ערך גלובלי) |
| `/supplier` | סורק/דשבורד בלי כרטיסי Escrow held/released |

### 1.4 Env P0 (Production)

| Variable | הערות |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://kenyonexpress.co.il` (בלי slash בסוף) |
| `NEXT_PUBLIC_SUPABASE_URL` | פרויקט **prod** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon של אותו פרויקט |
| `SUPABASE_SERVICE_ROLE_KEY` | לעולם לא `NEXT_PUBLIC_` |
| `CARDCOM_TERMINAL_NUMBER` | מסוף Production |
| `CARDCOM_API_NAME` | |
| `CARDCOM_API_PASSWORD` | |
| `CARDCOM_WEBHOOK_PASSWORD` / `CARDCOM_WEBHOOK_SECRET` | תואם למסוף |
| `CHECKOUT_ENABLED` | התחלה: `false` |
| `CRON_SECRET` | Bearer ל-crons + Edge notifications-worker |
| `RESEND_API_KEY` + `EMAIL_FROM` / `RESEND_FROM` | דומיין מאומת |
| `VOUCHER_QR_SECRET` | אם בשימוש לחתימת QR |
| `QSTASH_TOKEN` (+ signing keys) | אופציונלי; בלי זה degrade ל-cron |

אחרי שינוי env מהותי: Redeploy.

### 1.5 Cardcom prod (תמצית)

1. מסוף Production: terminal + API + webhook URL על הדומיין החי
2. Success/Error/Indicator לא על localhost
3. אסור לאשר `paid` ידני ב-SQL כתחליף ל-webhook

### 1.6 Notifications smoke (אחרי רכישת טסט)

| בדיקה | צפי |
|---|---|
| Outbox | שורת `coupon_issued` + channel email |
| Resend | מייל RTL עם קוד + לינק `/coupon/{id}` |
| Edge/cron | drain תוך ≤ 60ש (p95) עם `CRON_SECRET` |

כשל מייל **לא** חוסם soft-open אם הזמנה+voucher תקינים; מתקנים outbox בנפרד.

---

## 2. Rollback

### 2.1 עץ החלטה

| כשל | פעולה מיידית |
|---|---|
| באג חמור אפליקטיבי, כסף עדיין תקין | Vercel **Instant Rollback** ל-deployment קודם |
| כסף / checkout שבור אחרי soft-open | `CHECKOUT_ENABLED=false` ואז Redeploy/restart; אחר כך rollback אם צריך |
| Webhook Cardcom נכשל | כיבוי checkout; לא לסמן paid ידני |
| מייל נכשל אבל הזמנה+voucher תקינים | לא חוסם soft-open; תיקון Resend/outbox בנפרד |
| מיגרציה שברה DB | §2.3 (לא Instant Rollback של Vercel לבד) |
| DNS/SSL שבור | החזרת רשומות DNS לצילום הקודם; TTL נמוך עוזר |

### 2.2 סדר מומלץ

```text
1. CHECKOUT_ENABLED=false  (+ Redeploy אם נדרש לקרוא env)
2. Vercel Instant Rollback
3. אם DNS רע: שיחזור רשומות
4. הודעה לתמיכה; איסוף order ids חשודים
5. DB: רק לפי §2.3 / BACKUP-DR (לא restore עיוור)
```

### 2.3 Rollback של מיגרציה

מיגרציות בריפו הן קדימה (forward-only) כברירת מחדל. אין להניח ש-`db reset` על prod חוקי.

| מצב | פעולה |
|---|---|
| מיגרציה חדשה נכשלה באמצע | לא להמשיך deploy אפליקציה שתלויה בה; לתקן migration additive חדשה |
| מיגרציה הצליחה אבל שוברת התנהגות | **migration מתקנת חדשה** (idempotent), לא מחיקת שורה מ-`schema_migrations` |
| אובדן נתונים / קטסטרופה | PITR / backup לפי `ARCHITECTURE-BACKUP-DR.md`; אישור מפורש; תיעוד ב-`STATE.md` |

אסור:

- `supabase db reset` על production
- מחיקה ידנית מ-`supabase_migrations.schema_migrations` כדי "להריץ שוב"
- שינוי קובץ מיגרציה שכבר הוחל על prod (רק קובץ חדש)

---

## 3. מיגרציות

### 3.1 כללים מחייבים

1. קבצים תחת

```
supabase/migrations/
```

idempotent ככל האפשר (ראה skill המיגרציות).  
2. סדר לפי שם הקובץ.  
3. Enums / CHECK / RLS לפי הדפוסים בריפו.  
4. אף פעם לא להמציא default ל-`platform_percent` בייבוא או ב-backfill בלי תיעוד מודל.  
5. לא להחזיר מסלול Escrow/held-until-redeem לקופונים במיגרציה חדשה.  
6. אחרי החלה על prod: לרשום ב-

```
STATE.md
```

שם הקובץ + זמן + תוצאה.

### 3.2 Local אימות לפני prod

Terminal:

```bash
supabase start
supabase db reset
```

יציאה 0 בלי `ERROR`. אם נכשל: לא דוחפים ל-prod.

### 3.3 החלה על production

Terminal (משורש הפרויקט, אחרי `supabase link`):

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

`db push` מחיל רק מיגרציות שחסרות ב-`schema_migrations`.

אלטרנטיבה מבוקרת: SQL Editor / `apply_migration` לקובץ בודד כשיש צורך בחיתוך סיכון, עם אותם כללי idempotency.

### 3.4 אחרי מיגרציה

| בדיקה | דוגמה |
|---|---|
| Schema | `\d vouchers` / עמודות כסף ב-`products` |
| Constraint | `platform_percent + supplier_split_percent = 100` |
| Money model | אין חובת held על קופון; redeem לא משחרר payout קופון |
| RLS | משתמש anon לא כותב outbox / ledger |
| App | deploy תואם ל-SHA שמצפה לסכמה החדשה |
| Smoke כסף | checkout כבוי עד אישור; אחרי פתיחה: רכישת טסט |

### 3.5 תיאום app ↔ schema

```text
migration applied on prod
  → deploy app that depends on it
  → never deploy app that requires columns not yet migrated
```

Rollback אפליקציה ל-SHA ישן אחרי מיגרציה שמוסיפה עמודות: בדרך כלל בטוח (additive).  
Rollback אפליקציה אחרי מיגרציה שמוחקת/משנה משמעות: אסור בלי migration מתקנת או תוכנית DR.

---

## 4. DNS cutover (תמצית)

כשעוברים מ-WordPress:

1. לצלם A/CNAME/MX/TXT הקיימים
2. לא לשבור MX
3. apex + www → Vercel
4. `dig` + Certificate Valid
5. WP נשאר על hostname פנימי עד אחרי smoke + רכישת טסט

פרטים מורחבים: `DEPLOY.md` / מסמכי launch ב-docs-pack.

---

## 5. דגלים בזמן אירוע

| דגל | שימוש |
|---|---|
| `CHECKOUT_ENABLED=false` | עצירת כסף מיידית |
| Kill notifications (flag/env) | אם blast שגוי; לא מוחק outbox |
| Supplier suspend | מהאדמין; עוצר redeem לחברים |

אחרי אירוע: ראה גם `ARCHITECTURE-FRAUD-PREVENTION.md` לתור review.

---

## 6. Acceptance

- [ ] Checklist env P0 מלא ב-Production
- [ ] Deploy עם CI ירוק + smoke (כולל PDP בלי Escrow UI)
- [ ] תוכנית rollback ידועה (Vercel + כיבוי checkout)
- [ ] מיגרציות רק forward + תיעוד ב-`STATE.md`
- [ ] אין `db reset` / מחיקת `schema_migrations` על prod
- [ ] `CHECKOUT_ENABLED` נפתח רק אחרי רכישת טסט PASS
- [ ] Resend/outbox smoke אחרי רכישת טסט (לא חוסם soft-open אם הכסף תקין)

---

## 7. Related

```
docs/DEPLOY.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
```

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך מחייב ב-`ke-arch`: deploy, rollback, migrations |
| 2026-08-03 | ke-arch docs-lifecycle: soft-open smoke ל-No Escrow + platform_percent + Resend |
| 2026-08-03 | rev C: נעילת deploy / rollback / migrations + No Escrow smoke |
