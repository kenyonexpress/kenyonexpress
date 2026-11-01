# רנבוק אירועים (15 פלייבוקים)

Status: DRAFT · docs only  
Audience: בעלים / אדמין / הנדסה  
Timezone: `Asia/Jerusalem`  
Alerts: `https://ntfy.sh/kenyon-ofir-limit` ו-Sentry  
Money: אגורות integer. אין `db push`. אין `UPDATE` ידני על `orders` / `payments` / `vouchers`.

Companions: `docs/RUNBOOK-OPS.md`, `docs/ARCHITECTURE-INCIDENT-RESPONSE.md`, `docs/CRON-EXTERNAL.md`, `docs/DISASTER-RECOVERY.md`.

כיבוי קופה בייצור: ב-Vercel, `CHECKOUT_ENABLED` חייב להיות המחרוזת `true` כדי שהקופה תעבוד. כל ערך אחר (כולל ריק) = קופה כבויה. אחרי תיקון: להחזיר ל-`true` ולעשות redeploy, לא restart בלבד.

---

## 0. דרגות וכללי ברזל

| SEV | מתי | יעד תגובה |
|---|---|---|
| SEV1 | כסף או אבטחה שבורים עכשיו (חיוב כפול, מימוש כפול, דליפת סוד) | 15 דקות |
| SEV2 | ליבה ירודה (אתר/קופה/webhook/סריקה) | שעה |
| SEV3 | מוגבל עם fallback (חיפוש, מדיה, מייל) | יום עסקים |
| SEV4 | חוב / רגרסיית ביצועים | backlog |

1. אנומליית כסף: כיבוי קופה **לפני** ויכוח עם לקוח.
2. אין retry עיוור על `ChargeToken` / `RefundDeal` אצל Cardcom.
3. PAN לא בטיקטים. מזהים: אימייל, מספר הזמנה, קוד שובר.
4. שני סוכני קוד על אותו repo: עצירה, לא "תיקון במקביל".
5. תקשורת ללקוחות רק אחרי שיש משפט אחד נכון. אין "הכי זול", אין Escrow, אין הבטחת החזר מיידי לכרטיס.

תבנית פוסט-מורטם: סעיף 16. כל פלייבוק מפנה אליה.

---

## 1. האתר למטה (site down)

**SEV2** (5xx רחב) או **SEV1** אם גם תשלומים תקועים עם חיובים פתוחים.

### Detect

- ntfy / Sentry spike, או `curl` ל-apex ו-`/api/health`.
- אחרי DNS cutover: apex 200 + health 200 עם `{"ok":true,...}`. health 404 על apex = עדיין WordPress, לא בהלה. לבדוק גם את URL ה-Production ב-Vercel.
- Vercel Dashboard: deployment Error / Frozen.

### Triage

1. האם זה apex, `www`, או רק preview?
2. האם זה deploy אחרון? (GitHub Actions Build אדום מול Vercel Error).
3. האם Supabase down? health 503 = DB, לא Next.
4. האם Cloudflare אפור על הרשומה? (TLS לפני Vercel). ראו `docs/ops/DNS-CUTOVER-LOG.md`.

### Fix

1. Instant Rollback ב-Vercel ל-Ready האחרון, אם ה-deploy שבור.
2. אם DB: לא "לתקן" שורות הזמנה. לחכות / לשדרג תוכנית / לפתוח טיקט Supabase.
3. אם קופה חיה בזמן 5xx: לשקול `CHECKOUT_ENABLED` לא-`true` כדי לא לגבות בלי דף הצלחה.
4. אחרי ירוק: smoke בית, קטגוריה, PDP קופון, `/cart`, `/checkout`.

### Communicate

- בעלים: מייד ב-SEV2.
- לקוחות: באנר / וואטסאפ עסקי רק אם >30 דקות וקופה שבורה. בלי הבטחת פיצוי גורף.

Postmortem: סעיף 16.

---

## 2. כשלי תשלום (payment failures)

**SEV1** אם יש חיוב בלי הזמנה `paid_at`, או כפילות. אחרת **SEV2**.

### Detect

- Sentry על checkout / webhook.
- תור `/admin/payments` ו-`/admin/queues`.
- לקוחות: "חויבתי ואין קופון".
- cron `stranded-payments` (אם רץ) מוצא verified בלי finalize.

### Triage

1. האם Cardcom sandbox מול ייצור? `CARDCOM_SANDBOX=true` בייצור = boot fail מכוון.
2. IndicatorUrl / ReturnUrl נבנים מ-`NEXT_PUBLIC_APP_URL`. ערך שגוי שובר callback, לא רק קישורים.
3. האם הלקוח ראה ספינר בקופה בלי מייל? ספינר אינו אישור.
4. אין PAN בלוגים. ארבע ספרות + מספר עסקה אצל הסולק.

### Fix

1. כיבוי קופה אם יש חיובים יתומים.
2. Reconciliation דרך הקוד / cron `reconcile`, לא SQL.
3. איסור retry על ChargeToken. אם הלקוח לא קיבל שובר אחרי חיוב: מסלול finalize הקיים או תמיכה לפי `docs/legal/RETURNS-HE.md`.
4. Webhook חתימה נכשלת: לבדוק `CARDCOM_WEBHOOK_SECRET`, לא "לאשר ידנית".

### Communicate

- לקוח: "בודקים מול הסולק, החזר אם נגבה בלי שובר לפי מדיניות". עד 14 ימי עסקים לכרטיס.
- לא להבטיח מיידי.

Postmortem: סעיף 16. לצרף מספר הזמנה ומזהה עסקה אצל Cardcom, בלי PAN.

---

## 3. סתימת webhook (webhook backlog / DLQ)

**SEV2**.

### Detect

- גידול ב-DLQ (`src/server/payments/webhook-dlq.ts`: תור שאילתה, לא בהכרח טבלה נפרדת).
- חתימות נכשלות מול ספק down.
- ntfy מ-health אם מוגדר.

### Triage

1. סערה אמיתית אצל Cardcom, או סוד שגוי אחרי rotate?
2. האם cron `notifications` / replay מגביר כשל?
3. האם האירועים כבר עובדו (idempotent) וה-DLQ הוא רעש?

### Fix

1. לעצור retry שמגביר, אם יש.
2. לתקן חתימה / סוד / payload.
3. Replay קבוצה בטוחה אחרי התיקון. אין ChargeToken מחדש.
4. סוף יום: `reconcile`.

### Communicate

- בעלים אם יש הזמנות שנעצרו ב-`pending`.
- לקוחות רק אם שובר לא יצא אחרי תשלום.

Postmortem: סעיף 16. היקף DLQ לפני/אחרי.

---

## 4. קפיצת דחיית מייל (email bounce spike)

**SEV3**, או **SEV2** אם אישורי הזמנה/שובר נעצרים.

### Detect

- Resend dashboard: bounce / complaint.
- `notification_outbox` תקוע. cron `notifications` הוא הנתיב היחיד למייל שובר.

### Triage

1. דומיין / SPF / DKIM / DMARC אחרי שינוי DNS.
2. תבנית עם QR כ-`data:` URI (אסור). קוד טקסט בלבד.
3. רשימה חמה אחרי ייבוא אנשי קשר (אסור). 30א: שיווק רק ל-opt-in.

### Fix

1. לעצור דיוור שיווקי. תפעול (הזמנה, שובר) נשאר אם הדומיין תקין.
2. לתקן DNS מייל בלי לגעת ב-A/CNAME של האתר. ראו `docs/ops/DNS-CUTOVER-LOG.md`.
3. כתובות bounce: לא לשלוח שוב. לקוח רואה קופון ב-`/account/coupons` גם בלי מייל.

### Communicate

- ללקוח שפנה: הקישור לאזור האישי, לא "שלחנו שוב לרשימה".
- בעלים אם bounce > סף פנימי (לתעד בפוסט-מורטם).

Postmortem: סעיף 16.

---

## 5. תקלת DNS

**SEV2**. הפניית DNS לדומיין החי היא פעולת בעלים. אין להריץ cutover מכאן.

### Detect

- `dig` A של apex לא 76.76.21.21 אחרי cutover, או AAAA שנשארת ל-IPv6 ישן.
- `www` לא CNAME של Vercel.
- Cloudflare Proxied (ענן אפור) על שם ש-Vercel צריך להנפיק לו תעודה.

### Triage

1. האם WP עדיין עונה על apex? health 404.
2. האם רק IPv6 שבור? Vercel מגיש apex ב-IPv4.
3. האם מייל (MX/TXT) נשבר בטעות עם שינוי A?

### Fix

1. לא לגעת ב-MX/TXT אלא אם זו התקלה.
2. Rollback DNS: למחוק A של `@` ל-76.76.21.21 ו-CNAME של `www` לפי הלוג. להשאיר דומיין מחובר ב-Vercel.
3. אחרי תיקון: `dig` + דפדפן + `/api/health`.

### Communicate

- בעלים לפני כל שינוי רשומה.
- לקוחות רק אם האתר באמת לא נפתח.

Postmortem: סעיף 16. להדביק פלט `dig` (בלי סודות).

---

## 6. CPU גבוה ב-DB (Supabase)

**SEV2** אם קופה/סריקה איטיות. **SEV1** אם timeouts על redeem / checkout.

### Detect

- Supabase Dashboard: CPU, connections, slow queries.
- health 503 / timeouts ב-Sentry.
- חיפוש ILIKE כבד אם Meilisearch כבוי (מצב הייצור הנוכחי כש-`MEILISEARCH_HOST` ריק).

### Triage

1. שאילתת אדמין / דוח KPI שרצה על טבלת `orders` בלי חלון?
2. בוט סריקה? `analytics_events` בלי סינון `is_bot`?
3. חיבורים מ-service role שנשכחו?

### Fix

1. להרוג שאילתה ארוכה ב-Dashboard, לא למחוק נתונים.
2. להשהות דוחות כבדים. cron `reap-carts` / analytics לא דורסים כסף.
3. כיבוי קופה רק אם checkout נכשל בפועל.
4. שדרוג תוכנית: סעיף עלות ב-`docs/ops/COST-MODEL.md`. אין `db push`.

### Communicate

- בעלים. ספקים אם סריקה נתקעת (מסך אדום / timeout).

Postmortem: סעיף 16. query id אם יש.

---

## 7. השבתת R2 (מדיה)

**SEV3**. קטלוג בלי תמונות עדיין ניתן לקנייה אם המחיר והספק קיימים.

### Detect

- תמונות שבורות בבית / PDP. `SmartImage` fallback אפור.
- שגיאות signed PUT בהעלאת אדמין.

### Triage

1. באקט Cloudflare R2 / CDN מול באג `next/image`.
2. אובייקט חסר אחרי מחיקת מוצר.
3. MIME / גודל מעל 8MB.

### Fix

1. לא להחליף ב-picsum. להסתיר מוצר בלי תמונה ראשית אם זה פוגע באמון.
2. להעלות מחדש דרך `/admin` אחרי שהבאקט חי.
3. Publish נשאר חסום בלי alt עברי.

### Communicate

- מעלה תוכן: להשהות העלאות.
- לקוחות: אין הודעה אלא אם PDP ריק לגמרי.

Postmortem: סעיף 16.

---

## 8. השבתת Redis / Upstash

**SEV3** כיום ברוב המצבים. בקוד החי **אין** לקוח Redis ב-`src` (נמדד בעבר). המשתנים `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` הם אופציונליים ל-rate limit עתידי.

### Detect

- 5xx על מסלול שתלוי ב-Upstash **רק אם** חובר. אחרת: האירוע הזה הוא "תכננו limiter ועדיין Postgres/in-process".
- Timeout ל-REST של Upstash אחרי חיבור.

### Triage

1. האם הקוד בכלל קורא את המשתנים ב-HEAD? אם לא: זה לא האתר למטה.
2. אם כן: fail-open או fail-closed? checkout חייב fail-closed על rate limit כסף אם ה-limiter הוא גדר הונאה.

### Fix

1. בלי Redis: להמשיך. לא "להתקין Redis באמצע אירוע".
2. עם Redis: להסיר תלות זמנית רק אם יש fallback שנבדק. לא לפתוח checkout בלי גדר אם זו הייתה הגדר היחידה.
3. אחרי חזרה: לא לשחזר counters ישנים כסף.

### Communicate

- בעלים רק אם checkout או login נחסמו גורפת.

Postmortem: סעיף 16. לציין אם Redis היה מחובר בפועל.

---

## 9. פיגור Meilisearch

**SEV3**. חיפוש לא נשבר: בלי `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` יש נפילה ל-Postgres `ILIKE` (`docs/SEARCH-PIPELINE-SPEC.md`). בייצור כיום המשתנים ריקים, כלומר כבר בנתיב DB.

### Detect

- תוצאות ישנות מול קטלוג `active`.
- `engine: 'meilisearch'` בלוג מול אינדקס לא מסונכרן.
- CPU DB עולה כי כולם ב-ILIKE.

### Triage

1. האם Meili בכלל מוגדר?
2. האם reindex אחרי שינוי מוצר נכשל?
3. האם זה "פיגור" או "לא הוגדר מעולם"?

### Fix

1. UI לא משקר "אין תוצאות" אם DB מחזיר. לא לכבות קטלוג.
2. Reindex מתועד, לא מחיקת אינדקס באמצע היום בלי fallback.
3. מפתח admin לא לדפדפן.

### Communicate

- אין באנר ללקוח על חיפוש. אדמין רואה ב-`/admin/search` אם קיים.

Postmortem: סעיף 16.

---

## 10. חשד למימוש כפול (voucher double-redeem)

**SEV1**.

### Detect

- שני מסכי ירוק לאותו קוד, או שתי שורות `voucher_redemptions` לאותו שובר.
- ספק: "סרקנו פעמיים". לקוח: "עוד visibile QR אחרי מימוש".

### Triage

1. המימוש נקבע רק ב-`UPDATE` מותנה (`status = issued`). מסך ירוק בלי שורה = באג תצוגה או replay עם `replayed: true` (אותו idempotency_key).
2. צילום מסך מהמייל אינו מימוש. הקוד במסד הוא האמת.
3. עסק אחר: הקריסה ללקוח היא `not_found` (anti-enumeration).

### Fix

1. אם עדיין פתוח: להשהות סריקה (feature flag / הודעה לספקים), לא SQL שמאפס `issued`.
2. לקפוא שוברים חשודים במסלול אדמין אם קיים; אחרת: לא לגעת, לתעד ids.
3. Audit: `voucher_redemptions` + `audit_log`.
4. לקוח ששילם פעם אחת: לא לגבות יתרה פעמיים. ספק שקיבל פעמיים יתרה במזומן: מחלוקת תפעולית, לא payout מהפלטפורמה (קופון: הפלטפורמה לא מעבירה כסף לספק).

### Communicate

- ספק ולקוח בנפרד, עובדות בלבד.
- אין "נבטל את הסריקה מהמסד".

Postmortem: סעיף 16. חובה.

---

## 11. מחלוקת החזר (refund dispute)

**SEV2** כספית, לא בהכרח באג.

### Detect

- מייל ל-`info@kenyonexpress.co.il`, chargeback Cardcom, טיקט ב-`/admin`.

### Triage

1. סטטוס שובר: `issued` / `used` (או `redeemed` בסביבות ישנות) / `expired` / `refunded`.
2. מה שנגבה באתר בלבד. יתרה בקופה אינה החזר פלטפורמה.
3. מומש או פג: אין ביטול רגיל. חריג: בעלים + ספק בכתב.
4. דמי ביטול: לפי `docs/legal/RETURNS-HE.md` (יעד `min(5%, ₪100)` רק באישור מדיניות חיה).

### Fix

1. החזר רק דרך מסלול RefundDeal בקוד, פעם אחת, בלי retry עיוור.
2. יעד: ארנק או כרטיס מקורי, עד 14 ימי עסקים על הכרטיס.
3. clawback קאשבק אם ניתן.
4. אין זיכוי כפול לארנק ולכרטיס על אותו סכום.

### Communicate

- Extra: מספר הזמנה, סכום באגורות שיוחזר, יעד.
- Chargeback: לא להתווכח בצ'אט; תיעוד לסולק.

Postmortem: סעיף 16 אם זו הייתה תקלת מערכת, לא סכסוך שירות רגיל.

---

## 12. חשד לדליפת מידע (data leak suspicion)

**SEV1**.

### Detect

- מפתח ב-git, `.env` ב-PR, service role ב-`NEXT_PUBLIC_*` (הקוד אמור לסרב boot).
- ייצוא CSV של לקוחות מחוץ ל-RBAC.
- Sentry עם PII (PAN, קוד שובר מלא בלוג ציבורי).

### Triage

1. מה דלף: anon key (צפוי בדפדפן) מול service role / Cardcom password / `VOUCHER_QR_SECRET` / `CRON_SECRET`.
2. האם זה repo ציבורי? להניח שכן עד שמוכח אחרת.
3. היקף: לוגים, מייל, צ'אט סוכן.

### Fix

1. Rotate בסדר: סוד התשלום וה-QR, ואז cron, ואז DB keys. ראו מטריצה ב-`docs/ARCHITECTURE-ENV-SECRETS.md`.
2. Invalidate sessions אם auth.
3. Audit log.
4. אין commit של הסוד "לתיעוד".
5. אם נתוני לקוח יצאו: חובת דיווח לפי תיקון 13 / רשם. לא לנסח הודעה בלי בעלים.

### Communicate

- בעלים מייד. לקוחות לפי ייעוץ משפטי, לא לפי ניחוש.
- ספקים אם נחשפו קודי שובר שלהם.

Postmortem: סעיף 16. חובה תוך 48 שעות.

---

## 13. נעילת אדמין (admin lockout)

**SEV2** אם אין super_admin אחר. **SEV3** אם יש משתמש שני.

### Detect

- Google OAuth נכשל, RLS חוסם, תפקיד ירד בטעות.

### Triage

1. האם זה סיסמת Google של אדם, או `profiles.role`?
2. האם elevation דרש `requireRecentAuth(15)` ופג?
3. אין עריכת `role` ב-SQL "כדי להיכנס".

### Fix

1. super_admin שני מהפאנל (`/admin/users`) אם קיים.
2. אם נחסם OAuth כללי: זה site down חלקי, לא רק אדמין.
3. שחזור תפקיד רק במסלול עם `audit_log` (`permission_change`).
4. אסור ליצור משתמש אדמין חדש דרך Dashboard בלי audit.

### Communicate

- פנימי בלבד. אין הודעה ללקוחות.

Postmortem: סעיף 16.

---

## 14. סורק ספק לא זמין (supplier scanner offline)

**SEV2** אם כל הספקים. **SEV3** אם מכשיר אחד.

### Detect

- פניות: `/scan` לא נטען, מצלמה, מסך אדום גורף.
- Sentry על `/api/supplier/vouchers/lookup` או `redeem`.

### Triage

1. האתר למטה מול הרשאות חבר (`scanner` / `manager` / `owner`)?
2. אין רשת בקופה: המימוש **אינו** מתבצע אופליין ב-HEAD. אין תור IndexedDB חי. קופאי מקליד כשהרשת חוזרת. ראו `docs/product/SUPPLIER-APP-SPEC.md`.
3. QR מהמייל כתמונה: לבקש קוד טקסט / `/coupon/{id}`.
4. כבר מומש / עסק אחר / פג: התנהגות תקינה, לא outage.

### Fix

1. אם RPC `redeem_voucher` נכשל: לא סריקה ידנית ב-SQL.
2. הודעה לספקים: הקלדה ידנית, לא צילום מסך.
3. כיבוי סריקה רק בחשד מימוש כפול (פלייבוק 10).

### Communicate

- וואטסאפ ספקים: "הקלידו קוד, גבו יתרה רק אחרי מסך ירוק".
- לקוחות: להציג את הקוד מהאזור האישי.

Postmortem: סעיף 16 אם זו הייתה תקלת פלטפורמה.

---

## 15. cron לא יורה

**SEV2** לכסף (invoices, reconcile, stranded-payments, notifications). **SEV3** ל-reap-carts / stock.

### Detect

- ידוע ומדוד: בלי מתזמן חיצוני **אף אחד מעשרת ה-jobs לא רץ**. Vercel Hobby לא מחזיק עשרה crons. ראו `docs/CRON-EXTERNAL.md`.
- סימפטום: אין מייל שובר למרות `paid_at`, outbox מלא, חשבוניות תקועות, תשלומים יתומים.

### Triage

1. `GET` ל-`/api/cron/health` בלי Bearer: ציפייה 401. 404 על apex = DNS/WP.
2. עם סוד שגוי: 401 לנצח, שקט.
3. GitHub Actions cron: צריך `CRON_SECRET` ב-Secrets. `gh secret list` ריק = לא רץ.

### Fix

1. לא "להפעיל הכל ביד בלולאה אינסופית" בלי אימות. הפעלה ידנית חד-פעמית:
   `Authorization: Bearer <CRON_SECRET>` על הייצור.
2. סדר לחץ: `notifications`, `stranded-payments`, `invoices`, `reconcile`.
3. להדליק מתזמן (cron-job.org או Actions) זה צעד בעלים. לא לשנות `vercel.json` כדי "לסמוך על Hobby".
4. אחרי DNS cutover: לעדכן URLs ל-apex.

### Communicate

- בעלים: "המתזמן החיצוני דומם, מיילי שובר עלולים לא לצאת".
- לקוח שפנה: קופון באזור האישי; מייל ידני נקודתי בלי לשלוח QR כתמונה.

Postmortem: סעיף 16.

---

## 16. תבנית פוסט-מורטם

להעתיק לקובץ פרטי (לא ל-git אם יש PII). לא ל-`STATE.md` מתוך סשן docs-batch.

```
# Postmortem KE-{YYYYMMDD}-{short}

SEV:
Start (Asia/Jerusalem):
Detect at:
Detect how (Sentry / ntfy / customer / admin):
Customer impact (orders, agorot on-site, vouchers):
Supplier impact (scan yes/no):

## Timeline
- HH:MM  what

## What broke
(one paragraph, no blame)

## Why the safeguards failed
(checkout flag, cron, webhook idempotency, RLS, ...)

## Money
Charged on site (agorot):
Refunds issued (agorot):
SQL written on orders/payments/vouchers? (must be no)

## What we will change
1. detect
2. prevent
3. communicate

## Follow-ups
- [ ] ticket
- [ ] test name
- [ ] docs pointer
```

שדות אסורים בפוסט-מורטם ציבורי: PAN, סיסמאות, `SERVICE_ROLE`, תוכן webhook מלא.

---

## 17. קישורים

- `docs/RUNBOOK-OPS.md`
- `docs/CRON-EXTERNAL.md`
- `docs/ops/DNS-CUTOVER-LOG.md`
- `docs/ops/COST-MODEL.md`
- `docs/support/ADMIN-RUNBOOK-HE.md`
- `docs/support/SUPPLIER-FAQ-HE.md`
- `docs/legal/RETURNS-HE.md`
