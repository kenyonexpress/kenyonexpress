# LAUNCH-DAY

סדר פעולות מדויק ליום השיגור של KenyonExpress על

```
https://kenyonexpress.co.il
```

Status: **BINDING** · Updated: 2026-08-03  
Scope: docs only. לא מריץ deploy במסמך הזה.

Companions:

```
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/ARCHITECTURE-ENV-SECRETS.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/RUNBOOK-OPERATIONS.md
```

כלל ברזל: עד שכל שלבי הכסף הירוקים, `CHECKOUT_ENABLED=false`.  
אסור: `supabase db push` לייצור ביום השיגור; סימון `paid` ידני ב-SQL; מפתחות Cardcom תחת `NEXT_PUBLIC_`.

---

## 0. סדר היום (תיקון זמנים)

מריצים **מלמעלה למטה**. לא מדלגים. לא פותחים checkout לציבור לפני שלב 6 PASS.

| # | שלב | איפה | יציאה לשלב הבא |
|---|---|---|---|
| 1 | Freeze + גיבוי | GitHub / Supabase | branch פרוד קפוא; PITR פעיל |
| 2 | רשומות DNS | רשם דומיין | dig ירוק ל-apex ו-www |
| 3 | Vercel Domains + SSL | Vercel | Domain Valid + cert Valid |
| 4 | Env vars ב-Production | Vercel | רשימת §2 מלאה; בלי סודות ב-Preview→prod |
| 5 | מפתחות Cardcom prod + URLs | Vercel + Cardcom | ארבעה `CARDCOM_*` + webhook על הדומיין החי |
| 6 | Deploy Production | Vercel | Deployment Ready |
| 7 | Smoke בלי תשלום | Chrome | home / PDP / cart / login |
| 8 | פרוטוקול רכישת טסט ראשונה | Chrome + Admin + Cardcom | הזמנה paid + voucher + מייל |
| 9 | Soft-open | | `CHECKOUT_ENABLED` נשאר true רק אם 8 עבר |
| 10 | Rollback (רק אם נכשל) | Vercel | לפי §6 |

תפקידים מומלצים: בעלים (אישור כסף), הנדסה (env/deploy), תמיכה (רכישת טסט).

---

## 1. לפני הכל (T-60 דק׳)

### 1.1 Freeze

1. לעצור מיזוגים ל-Production Branch המאושר.
2. לוודא שה-commit לשיגור ירוק ב-CI (typecheck / tests / Lighthouse אם חובה).
3. לרשום ב-STATE את ה-SHA והשעה.

### 1.2 גיבוי

1. Supabase Dashboard: PITR / automated backups פעילים על פרויקט הפרוד.
2. אם יש cutover גדול באותו יום: snapshot ידני + תיעוד timestamp.
3. לוודא שיש מי שיודע לעשות Instant Rollback ב-Vercel.

פרטים: `ARCHITECTURE-BACKUP-DR.md`.

---

## 2. Vercel env vars (Production בלבד)

ממשק: **Vercel → Project → Settings → Environment Variables → Production**.

אחרי כל שינוי מהותי: Redeploy (env נטען ב-build/runtime לפי המשתנה).

### 2.1 חובה ליום שיגור (P0)

| Variable | הערות |
|---|---|
| `NEXT_PUBLIC_APP_URL` | בדיוק `https://kenyonexpress.co.il` (בלי slash בסוף) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL פרויקט **prod** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon של אותו פרויקט |
| `SUPABASE_SERVICE_ROLE_KEY` | או `SUPABASE_SECRET_KEY`; **לעולם לא** `NEXT_PUBLIC_` |
| `CARDCOM_TERMINAL_NUMBER` | מסוף Production |
| `CARDCOM_API_NAME` | API user של המסוף |
| `CARDCOM_API_PASSWORD` | סיסמת API |
| `CARDCOM_WEBHOOK_SECRET` | מחרוזת ארוכה אקראית (`openssl rand -hex 32`); משותפת ל-Indicator `?s=` |
| `RESEND_API_KEY` | מפתח שליחה |
| `EMAIL_FROM` או `RESEND_FROM` | שולח מאומת, למשל `KenyonExpress <noreply@kenyonexpress.co.il>` |
| `CRON_SECRET` | Bearer ל-cron / workers |
| `VOUCHER_QR_SECRET` | חתימת QR; אופציונלי גם `VOUCHER_QR_SECRET_PREVIOUS` |
| `SENTRY_DSN` | פרויקט prod |
| `CHECKOUT_ENABLED` | מתחילים ב-`false`; עוברים ל-`true` רק אחרי smoke כסף |

### 2.2 מומלץ ביום 1 (P1)

| Variable | הערות |
|---|---|
| `NEXT_PUBLIC_WHATSAPP_PHONE` | אם יש כפתורי WA |
| R2 set מלא (`R2_*` + public base) | אחרת fallback ל-Storage |
| Meilisearch host + key | אחרת חיפוש מוגבל |
| `UNSUBSCRIBE_SIGNING_SECRET` | הסרות דיוור |
| `QSTASH_TOKEN` + signing keys | אם notifications/search דרך QStash |
| `NTFY_*` | התראות אדמין |

### 2.3 אסור ב-Production

| Variable / מצב | למה |
|---|---|
| `CARDCOM_USE_MOCK=true` | ידמה תשלום בלי כסף אמיתי |
| `CARDCOM_SANDBOX` / `CARDCOM_ALLOW_SANDBOX` פתוח בלי כוונה | ערבוב sandbox עם דומיין חי |
| `ESCROW_FLOW_ENABLED=true` | דגל J5/נאמן חיצוני ישן; נשאר unset/false (מודל ה-held הפנימי לא תלוי בדגל הזה) |
| כל סוד תחת `NEXT_PUBLIC_` | דליפה לדפדפן |
| אותם ערכי Cardcom/service על Preview שמצביע ל-DB prod | סיכון כסף על URL זמני |

### 2.4 הפרדת סביבות

| Environment | DB | Cardcom |
|---|---|---|
| Production | prod | prod terminals |
| Preview | staging / מבודד | sandbox או mock |
| Development | local או staging | mock |

Checklist מהיר אחרי הדבקה:

```
Vercel Production:
[ ] APP_URL = https://kenyonexpress.co.il
[ ] Supabase URL/keys = prod
[ ] ארבעת CARDCOM_* מלאים
[ ] CHECKOUT_ENABLED=false עד סוף שלב 8
[ ] אין CARDCOM_USE_MOCK
```

---

## 3. רשומות DNS ל-`kenyonexpress.co.il`

Host קנוני: **apex**

```
https://kenyonexpress.co.il
```

`www` מפנה לקנוני (או להפך, אבל רק בחירה אחת).

### 3.1 רשומות (לפי Vercel Domains)

ממשק: **Vercel → Domains** מציג את הערכים המדויקים. בדרך כלל:

| שם | סוג | ערך | הערה |
|---|---|---|---|
| `@` (kenyonexpress.co.il) | `A` | כתובות ה-IP ש-Vercel מציג (לעתים שתיים) | או ALIAS/ANAME אם הרשם תומך |
| `www` | `CNAME` | `cname.vercel-dns.com` (או הערך ב-UI) | |
| (אופציונלי לפני cutover) | הורדת TTL | 300 | כדי ש-rollback DNS יהיה מהיר יותר |

### 3.2 רשומות לשירותים נלווים (אותו יום או T-1)

| שירות | רשומות | איפה מאמתים |
|---|---|---|
| Resend | SPF + DKIM (+ BM אם מוצג) | Resend Dashboard = green |
| Google / Search Console | TXT אימות בעלות אם נדרש | GSC |
| מייל עסקי (אם לא רק Resend) | MX לפי ספק המייל | לא לשבור MX בטעות ב-cutover |

### 3.3 חיבור ב-Vercel

1. להוסיף `kenyonexpress.co.il` ו-`www` לפרויקט **Production** (לא Preview).
2. להמתין ל-**Valid Configuration**.
3. Certificate State = **Valid** לשני ה-hosts.
4. לוודא שאין דומיין ישן של WP שמצביע לאותו host בלי 301 מתוכנן.

### 3.4 אימות (Terminal)

```
dig kenyonexpress.co.il A +short
dig www.kenyonexpress.co.il CNAME +short
curl -sI http://kenyonexpress.co.il | head -n 5
curl -sI https://kenyonexpress.co.il | head -n 10
curl -sI https://www.kenyonexpress.co.il | head -n 10
```

צפי:

- HTTP → HTTPS (301/308)
- HTTPS 200 או redirect לקנוני
- תעודה תקפה (בלי אזהרת דפדפן)

### 3.5 Allowlists אחרי שהדומיין חי

| מערכת | ערך להוסיף |
|---|---|
| Supabase Auth redirect URLs | `https://kenyonexpress.co.il/auth/callback` (+ www אם בשימוש) |
| Google OAuth (ספק של Supabase) | אותם redirect URIs ל-prod; בלי localhost ב-client של prod |
| Cardcom | Success / Error / Indicator / Webhook על הדומיין החי (סעיף 4) |

---

## 4. מיקום מפתחות Cardcom Production

### 4.1 איפה שמים (ורק שם)

| סוד | מיקום יחיד |
|---|---|
| `CARDCOM_TERMINAL_NUMBER` | Vercel → Production env |
| `CARDCOM_API_NAME` | Vercel → Production env |
| `CARDCOM_API_PASSWORD` | Vercel → Production env |
| `CARDCOM_WEBHOOK_SECRET` | Vercel → Production env (וגם בשימוש ב-URL של Indicator כ-`s=`) |

אסור: git, Notion ציבורי, Make/Zapier, `.env` שמחויב, צ'אט, Preview שמצביע ל-prod.

מקור הערכים: לוח הבקרה של Cardcom (מסוף **Production**, לא sandbox).  
API host ברירת מחדל בקוד:

```
https://secure.cardcom.solutions
```

(`CARDCOM_API_BASE_URL` רק אם Cardcom הנחה אחרת.)

### 4.2 URLs להגדיר במסוף Cardcom (על הדומיין החי)

התאם לנתיבים בפועל בקוד (שמות מדויקים לפי ה-deploy החי). תבנית מחייבת:

| תפקיד | URL לדוגמה |
|---|---|
| Success / Return | `https://kenyonexpress.co.il/checkout/return` (או הנתיב החי) |
| Error / Fail | `https://kenyonexpress.co.il/checkout/...` (נתיב הכשל החי) |
| Indicator / Notify | `https://kenyonexpress.co.il/api/payments/cardcom/webhook?s=<CARDCOM_WEBHOOK_SECRET>` |

כללים:

1. רק `https://kenyonexpress.co.il` (או www אם הוא הקנוני), לא preview.app.
2. **Deployment Protection** ב-Vercel לא חוסם את ה-webhook (bypass ל-Cardcom / כיבוי על prod API).
3. מקור האמת לתשלום: webhook + `GetLpResult` בשרת, לא רק הדפדפן.
4. אחרי שמירת הסודות: Redeploy Production כדי שה-runtime יטען אותם.

### 4.3 בדיקת טעינה (בלי לחייב עדיין)

1. `CHECKOUT_ENABLED` עדיין `false` או להשאיר סגור עד מוכן.
2. לוודא שבלוג ה-deploy אין `Missing required env: CARDCOM_*`.
3. אם פותחים checkout לטסט פנימי בלבד: להגדיר `CHECKOUT_ENABLED` לערך שמאפשר checkout (לא המחרוזת `false`).

---

## 5. פרוטוקול רכישת טסט ראשונה

מטרה: עסקה אמיתית אחת בסכום מינימלי, מקצה לקצה, עם תיעוד.  
מבצעים ב-**Chrome** על הדומיין החי, אחרי Deploy Ready.

### 5.1 הכנה

| פריט | ערך |
|---|---|
| משתמש | חשבון Google אמיתי של הצוות (לא לקוח אקראי) |
| מוצר | קופון published אחד עם `coupon_price` נמוך וידוע |
| כרטיס | כרטיס אמיתי / כרטיס בדיקה ש-Cardcom מאשר ל-prod (לפי ההנחיות שלהם) |
| `CHECKOUT_ENABLED` | לא `false` |
| צוות מוכן | מסך Admin + Cardcom dashboard + Sentry פתוחים |

לרשום מראש: `product_id`, מחיר צפוי בשקלים, מי מבצע, שעה.

### 5.2 צעדים (בסדר)

```text
1. Chrome: https://kenyonexpress.co.il
   → Home נטען, בלי mixed content

2. PDP של מוצר הטסט
   → מחיר "שולם באתר" = coupon_price הצפוי
   → יתרה בבית העסק מוצגת אם רלוונטי

3. הוספה לעגלה → /cart
   → אותו סכום

4. /checkout → התחברות Google אם צריך
   → beginCheckout מצליח (אין שגיאת Missing CARDCOM_*)

5. תשלום ב-Cardcom Low Profile
   → אישור / 3DS לפי המסוף

6. חזרה לאתר (return) + המתנה ל-webhook
   → אם תקוע pending: להמתין עד דקה, ואז verify/reconcile (GetLpResult)
   → אסור לסמן paid ב-SQL

7. אימות הצלחה (כל אלה חייבים):
   a. /account/orders : הזמנה status paid
   b. /account/coupons או /coupon/{id} : שובר issued + QR
   c. מייל Resend (אישור / קופון) הגיע או לפחות outbox sent
   d. Admin: אותה הזמנה, paid_at מלא, סכום == Cardcom
   e. Cardcom dashboard: עסקה מוצלחת, אותו סכום
   f. Sentry: אין error חדש על webhook/finalize באותה דקה

8. (מומלץ) Refund מבוקר על אותה הזמנת טסט דרך Admin
   → לא רק מ-Cardcom dashboard
   → voucher מתבטל אם עוד issued
```

### 5.3 PASS / FAIL

| תוצאה | פעולה |
|---|---|
| כל סעיף 7 עבר | לרשום `order_id` + שעה ב-STATE / לוח שיגור; אפשר soft-open |
| Charge בלי הזמנה paid | `CHECKOUT_ENABLED=false` מיד → reconcile → לא לפתוח לציבור |
| כפילות שוברים אחרי replay | כשל; לסגור checkout; חקירה idempotency |
| מייל נכשל אבל הזמנה+QR תקינים | לא חוסם soft-open; לתקן Resend בנפרד |
| סכום ב-Cardcom ≠ שולם באתר | כשל כספי; סגירת checkout |

### 5.4 אחרי PASS

1. להשאיר את הזמנת הטסט מתועדת (לא למחוק).
2. אם עשיתם refund לטסט: לוודא reconciliation נקי.
3. רק אז: הודעה לספקים/קהל soft-launch לפי `ARCHITECTURE-LAUNCH-MARKETING.md`.

---

## 6. תוכנית Rollback

מפעילים ברגע שיש חשד לכסף שבור, לולאת שגיאות checkout, או deploy רע.  
סדר קשיח:

### 6.1 שלב א׳: עצירת נזק (דקות)

```text
1. Vercel → Environment Variables → Production
   CHECKOUT_ENABLED=false
2. Redeploy מהיר או Restart לפי הצורך כדי שהערך ייטען
3. אימות: ניסיון checkout נדחה; שאר האתר (קטלוג) יכול להישאר למעלה
4. הודעה לצוות + Sentry/Ntfy
```

### 6.2 שלב ב׳: החזרת קוד

```text
1. Vercel → Deployments → Instant Rollback
   (או Promote ל-deployment ירוק קודם)
2. Smoke: home, PDP, cart (בלי תשלום)
3. לא להחיל down-migrations הרסניות "כדי לתקן"
```

### 6.3 שלב ג׳: כסף תלוי

| מצב | פעולה |
|---|---|
| לקוח חויב ב-Cardcom, הזמנה לא paid | verify/`GetLpResult` + finalize אידמפוטנטי; תיעוד order/deal |
| כפילות חיוב | Cardcom + Admin refund לפי RUNBOOK; לא SQL ידני על יתרות |
| QR/secret שבור אחרי deploy | Rollback קוד; לא לסובב `VOUCHER_QR_SECRET` בלי PREVIOUS |

### 6.4 שלב ד׳: DNS (רק אם הדומיין עצמו שבור)

1. אם ה-A/CNAME מצביעים לפרויקט הלא נכון: לתקן ל-Vercel של הפרוד המאושר.
2. לא להחזיר ל-WP ישן בלי תוכנית 301 מסודרת.
3. TTL נמוך מראש מקצר את ההמתנה.

### 6.5 מה אסור ב-rollback

- `supabase db push` / מחיקת טבלאות
- מחיקת הזמנות או payments
- כיבוי כל האתר אם מספיק כיבוי checkout
- החלפת מפתחות Cardcom באמצע חקירה בלי תיעוד (שובר webhooks פתוחים)

### 6.6 קריטריון חזרה לאוויר

1. Rollback/deploy יציב.
2. רכישת טסט חדשה לפי §5 עוברת PASS.
3. Sentry שקט על נתיבי תשלום ~30 דק׳.
4. אישור בעלים להחזיר `CHECKOUT_ENABLED` (לא אוטומטי).

---

## 7. דף סיכום למילוי ביום עצמו

| שדה | ערך |
|---|---|
| תאריך / שעה (Asia/Jerusalem) | |
| SHA בשיגור | |
| מי אישר כסף | |
| dig/curl DNS | PASS / FAIL |
| Env Production הושלם | PASS / FAIL |
| Cardcom URLs | PASS / FAIL |
| Deploy Ready | PASS / FAIL |
| `order_id` של רכישת הטסט | |
| Refund טסט בוצע | כן / לא |
| Soft-open בסימן | כן / לא |
| Rollback הופעל | כן / לא (פרט) |

---

## 8. Out of scope ליום השיגור

- קמפיין מודעות בתשלום (רק אחרי soft-launch נקי; ראה MARKETING)
- החלת מיגרציות DDL חדשות (ראה DDL-FIXES בנפרד, עם אישור)
- פתיחת Preview לדומיין החי

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך מחייב בעברית: סדר יום שיגור, Vercel env, DNS, Cardcom prod, רכישת טסט, rollback |
