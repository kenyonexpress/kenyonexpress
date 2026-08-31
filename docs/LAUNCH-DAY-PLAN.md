# תוכנית יום השקה (T-7 עד T+7)

<!-- stale-banner:2026-09-01 -->
> ⛔ **‏מיושן החל מ-01.09.2026. המסמך המחייב הוא `docs/LAUNCH-RUNBOOK.md`.**
>
> ‏נכתב ‏19.08.2026, כשהפריסה עוד לא קרתה. **האתר כבר חי על
> ‏`kenyonexpress.vercel.app`**, ולכן ‏T0 הוא יום ניתוק ה-DNS בלבד ולא יום
> הפריסה, והלוח שנבנה סביב פריסה ביום ‏T0 אינו מתאר את מה שיקרה.
>
> ‏הרצף עצמו: המסמך המחייב, שלב ‏7. למה שנשאר לך: `docs/OWNER-CHECKLIST.md`.


תאריך: 2026-08-19.
ענף: `phase5/homepage`.
היקף: docs בלבד.

זה לוח הזמנים. שערי המדידה נשארים ב-
`docs/LAUNCH-CHECKLIST.md`.
תקלות ביום עצמו:
`docs/RUNBOOK-OPS.md`.
פניות לקוח:
`docs/CUSTOMER-SUPPORT-PLAYBOOK.md`.
סתירת כסף:
`docs/BUSINESS-MODEL.md`
גובר.

T0 = יום ה-DNS cutover (הדומיין החי עובר מוורדפרס ל-Next). התאריך עדיין לא נקבע. למלא כאן לפני תחילת השבוע:

```
T0 תאריך: ________
T0 שעה (ישראל): ________
Preview URL לטסטים: ________
Vercel Production URL (לפני הדומיין): ________
```

מודל בשיגור: קופון בלבד. אין פיזי. אין Escrow.
`CHECKOUT_ENABLED`
נשאר לא-`true` עד שער go ב-T0.
`ESCROW_FLOW_ENABLED`
אסור `true`.

אין cutover באותו יום עם החלפת מסוף Cardcom (Q3). מפתחות הייצור נכנסים לא יאוחר מ-T-3, וה-smoke עליהם נגמר לפני T0.

האתר החי היום:
`https://kenyonexpress.co.il`
= WordPress מאחורי Cloudflare, HTTP 200. זה מעבר מתוזמן, לא DNS חסר.

---

## תפקידים: בעלים לבד מול סוכנים

מפעיל יחיד. אין תורנות. "בעלים" = ארבע העצירות + כל סוד + כל כסף חי. "סוכן" = Cursor / הלולאה על
`phase5/homepage`.
ביום T0: סוכן קוד **אחד** לכל היותר על העץ, ורק אם הבעלים פתח אותו. שני סוכנים = עצירה.

| פעולה | בעלים | סוכן | אסור לשניהם בלי עצירה |
|---|---|---|---|
| 8 סודות Vercel Production | כן | לא | הדבקת סוד ב-git / צ'אט |
| מסוף Cardcom ייצור + IndicatorUrl | כן | לא | |
| Resend: מפתח חדש + אימות דומיין | כן | הכנת רשימת רשומות DNS מהדשבורד (בלי ערכים סודיים) | |
| יישור Production Git Branch ב-Vercel | כן | להזכיר שהענף שנמדד כפרודקשן היה `cursor/add-supabase-3c830` | push ל-`main` כל עוד המדיניות 19.08 קפואה |
| חיבור דומיין חי ל-Vercel Production | כן | לא | חיבור דומיין ל-Preview |
| DNS cutover ב-Cloudflare | כן | פקודות `dig`/`curl` אחרי | מחיקת zone בלי גיבוי |
| `CHECKOUT_ENABLED=true` | כן, אחרי go | לא | |
| Instant Rollback / כיבוי קופה | כן | להכין פקודות, לא ללחוץ בלי בעלים אם זה פרוד | down-migration, `db push`, force-push |
| Smoke Preview (סנדבוקס) | נוכח לתשלום | להריץ צ'קליסט, לתעד | כרטיס אמיתי על Preview שמחובר ל-prod DB |
| עסקת ייצור מינימלית | כרטיס הבעלים | תיעוד סטטוסים | |
| מילוי 11 כתובות ספק + לוגו | כן (נתוני אמת) | הקלדה לאדמין אחרי שהבעלים מסר ערכים | picsum / כתובת מומצאת |
| תיקון 8 כרטיסי בית 404 | החלטת slug | קוד/CMS | |
| עו"ד, ח.פ, דמי ביטול, 14ח | כן | לא | פרסום תוקף אגרסיבי לפני הכרעה |
| Vercel Pro מול איחוד cron | כן | אם Hobby: תכנון ראוט מאוחד, בלי לבחור תוכנית | |
| leaked-password protection ב-Supabase Auth | כן | לא (אין כלי MCP) | |
| הקפאת מכירת שוברים ב-WP | כן | לא | |
| לולאת אוטונומיה ב-T0 | כבויה או קריאה בלבד | לא קומיטים כספיים ביום cutover | סוכן שני |
| תמיכת לקוח T+0..7 | כן | נוסחים מהפלייבוק | החזר SQL ידני |

שמונת הסודות (בלי אחד מהם אין השקה):

```
VOUCHER_QR_SECRET
CARDCOM_TERMINAL_NUMBER
CARDCOM_API_NAME
CARDCOM_API_PASSWORD
CARDCOM_WEBHOOK_SECRET
CRON_SECRET
RESEND_API_KEY
SENTRY_AUTH_TOKEN
```

Plus דגל מפורש:

```
CHECKOUT_ENABLED
```

(רק המחרוזת
`true`
פותחת קופה בפרודקשן.)

---

## Go / no-go

החלטת go בבוקר T0, בכתב ב-
`STATE.md`.
חסר שער אחד = no-go. אין "נעבור ונראה".

### חובה ל-go (soft-launch)

| # | שער | ראיה |
|---|---|---|
| G1 | מסוף Cardcom ייצור + 4 סודות ב-Vercel Production | עסקת טסט: charge → webhook → `orders.paid_at` → שובר+QR |
| G2 | סכום הסליקה = `coupon_price` מלא, לא אחוז | שורת payment מול שורת מוצר |
| G3 | Replay webhook = בלי שובר שני | לוג `{ok:true,replay:true}` או שקיל |
| G4 | Resend: מפתח לא-400, DNS ירוק, מייל רכישה הגיע | תיבת דואר של הבעלים |
| G5 | Preview smoke ירוק (עגלה → Google → תשלום → שובר → `/scan` → refund באותו יום) | צילום + מזהי הזמנה |
| G6 | Production Git Branch = הקודקוד שאושר (`phase5/homepage` עד המיזוג, לא `cursor/add-supabase-3c830`) | Vercel Settings → Git |
| G7 | דומיין מחובר ל-Production (Valid), לא Preview | Vercel Domains |
| G8 | TTL 300 על apex/www לפחות 24 שעות | Cloudflare |
| G9 | ייצוא zone Cloudflare נשמר | קובץ מקומי, לא ב-git |
| G10 | WordPress נשאר נגיש על IP/host משני לשבועיים | כתובת rollback כתובה כאן: ________ |
| G11 | Auth: callback ייצור ב-Supabase + Google בלי localhost ב-client של prod | דשבורדים |
| G12 | Cardcom Success/Fail/Webhook מוכנים ל-apex (מופעלים ב-flip) | מסך Cardcom |
| G13 | לפחות ספק אחד עם שם, טלפון, כתובת, לוגו, וחבר סורק | `/admin/suppliers` |
| G14 | דיל אחד חי שאפשר לממש, בלי 404 בדף הבית של הדיל הזה | Chrome |
| G15 | `CHECKOUT_ENABLED` עדיין לא true עד השעה שסומנה go | Vercel env |
| G16 | Hobby/Pro: cron `notifications` + `expire-vouchers` באמת רצים | לוג cron אחרי סוד |
| G17 | `ESCROW_FLOW_ENABLED` לא true | env |
| G18 | אין seed דמו על prod, אין מיגרציית 059/agorot rename ביום T0 | STATE |

### No-go אוטומטי (לא מתווכחים)

- חיוב בלי הזמנה סגורה, או הזמנה סגורה בלי שובר.
- Resend 400 / דומיין לא מאומת: לקוח ישלם בלי מייל. אזור אישי קיים, אבל soft-launch בלי מייל = no-go.
- Production Branch עדיין הענף הישן
  `cursor/add-supabase-3c830`.
- `/api/health` על ה-deployment המועמד מחזיר 503.
- שני סוכני קוד על אותו repo.
- עו"ד לא חתם **וגם** אין באנר "טיוטה" על ביטולים/תקנון כמו היום. Soft-launch צר יכול לחיות עם באנר; GA לא. אם מוחקים באנר בלי חתימה: no-go.
- דיל פיזי מסומן
  `active`.
- אנומליית כסף ב-T-1 שלא נסגרה.

### Go חלקי (soft לקהל מבוקר בלבד)

מותר אם G1-G18 ירוקים והשאר פתוחים: picsum על מוצרים שלא בשיגור, 8 כרטיסי בית שבורים **שלא מקשרים מהקמפיין**, cron לא-קריטי, טופס
`/cancel`
חסר (פנייה למייל לפי הפלייבוק), leaked-password עדיין כבוי (להדליק ב-T-2 אם אפשר, לא חוסם קופון יחיד).

GA לציבור הרחב: לא בחלון T0..T+7 הזה בלי LG7 + חתימת עו"ד.

---

## נקודות rollback

כל נקודה = פעולה אחת. בלי מיגרציה אחורה, בלי
`db push`.

| נקודה | מתי | פעולה | מי |
|---|---|---|---|
| R0 | לפני DNS | לא משנים Cloudflare. וורדפרס נשאר החי | בעלים |
| R1 | מפתחות בפרוד, קופה סגורה | משאירים `CHECKOUT_ENABLED` ≠ `true`. מוחקים מפתח שגוי רק אחרי PREVIOUS אם זה webhook | בעלים |
| R2 | קופה פתוחה על `*.vercel.app`, דומיין עדיין WP | `CHECKOUT_ENABLED=false` + Redeploy. הדומיין לא נפגע | בעלים, ראנבוק §7 |
| R3 | אחרי cutover, באג קוד, DB תקין | Instant Rollback ב-Vercel, אחר כך כיבוי קופה אם כסף | בעלים, ראנבוק §4 |
| R4 | אחרי cutover, הדומיין שבור / SSL | Cloudflare: מחזירים A/CNAME ל-WP (G10). TTL 300 מסייע | בעלים |
| R5 | webhook / חיוב בלי שובר | כיבוי קופה מייד, לא rollback של DB | בעלים, ראנבוק §5 |
| R6 | DB 503 | לא restore ביום השקה בלי עצירה (מחיקת DB). רק סטטוס Supabase + המתנה | בעלים |
| R7 | T+1..T+14 | WP חי ל-rollback דומיין. לא HSTS preload | בעלים |

סדר קשיח בתקלת כסף: קודם R2/R5 (קופה), אחר כך R3 (קוד), ורק אם ה-HTML עדיין WP-שבור או Next-מת: R4.

פקודות rollback (Terminal / Chrome): ראו
`docs/RUNBOOK-OPS.md`
סעיפים 4, 5, 6, 7. לא משכפלים כאן סודות.

---

## T-7

מטרה: הקפאה והורדת TTL. בלי flip.

**בעלים**

- [ ] ממלא את תאריך T0 בראש המסמך.
- [ ] Cloudflare: ייצוא zone (G9).
- [ ] TTL 300 על apex ו-www. אם כבר 300 מאתמול, לרשום timestamp.
- [ ] מחליט Hobby מול Pro, או מאשר לסוכן לאחד cron (Q5). בלי
  `notifications`
  ו-
  `expire-vouchers`
  אין go.
- [ ] מתחיל הקפאת מכירת שוברים חדשים ב-WP (Q3: עדיף T-14; מינימום עכשיו).
- [ ] סופר שוברים פתוחים ב-WP. לא מנסים להמיר אותם ל-payout ב-Next (Q29).
- [ ] מוסר כתובת+לוגו+טלפון לספק השיגור (G13), או דוחה T0.

**סוכן**

- [ ] `pnpm test` + `type-check` + `lint` ירוקים על
  `phase5/homepage`.
- [ ] מוודא ב-
  `STATE.md`
  שאין מיגרציה ממתינה שמישהו תכנן להחיל ב-T0.
- [ ] מפרט 8 כרטיסי בית 404: מה מפרסמים ב-T0 ומה מורידים מהגריד.
- [ ] לא פותח סוכן שני. לא כותב ל-
  `main`.

**Go יומי:** TTL הורד או כבר 300. T0 כתוב. אין plan להחיל 059.

---

## T-6

מטרה: דיוור ומפתחות Preview, לא ייצור כרטיס עדיין.

**בעלים**

- [ ] Resend: מפתח חדש מהקונסולה (הישן נמדד 400). DNS לפי מה שהדשבורד מציג, לא לפי ניחוש.
- [ ] SPF + DKIM ירוקים. DMARC
  `p=none`
  מספיק ליום 1.
- [ ] Vercel Preview: סנדבוקס Cardcom + DB לא-prod. אסור Preview = prod.

**סוכן**

- [ ] רשימת רשומות DNS ל-Resend (שמות בלבד) מול
  `docs/LAUNCH-CHECKLIST.md`
  §2.
- [ ] בודק ש-
  `NEXT_PUBLIC_`
  ב-Preview לא מצביע לפרוד בטעות (השוואת URL, לא הדפסת סוד).

**Go יומי:** Resend dashboard ירוק, או T0 נדחה.

---

## T-5

מטרה: smoke מלא על Preview.

**בעלים + סוכן יחד, כרטיס סנדבוקס**

מסלול (Chrome על Preview בלבד):

1. בית → דיל קופון → עגלה.
2. Checkout, Google.
3. תשלום סנדבוקס.
4. שובר ב-
   `/account/coupons`.
5. מייל הגיע (אם Preview מחובר ל-Resend טסט).
6. סריקה ב-
   `/scan`
   עם משתמש ספק.
7. Refund באותו יום קלנדרי (CancelOnly מול הסולק, ראו קוד ההחזר).

**סוכן מתעד:** מזהה הזמנה, קוד שובר, סטטוס webhook, לא PAN.

**No-go:** כשל במסלול הזה. לא "נתקן ב-T0 על החי".

---

## T-4

מטרה: קטלוג שאפשר לממש, ו-Auth.

**בעלים**

- [ ] ממלא ספק השיגור באדמין (כתובת, לוגו, טלפון, WhatsApp, שעות בתיאור). ערכת:
  `docs/SUPPLIER-ONBOARDING-KIT.md`.
- [ ] מצרף Google של קופאי ל-
  `supplier_members`.
- [ ] Google OAuth: URI ייצור מוכן (עדיין לא חובה שהדומיין יצביע). בלי localhost ב-client של prod.
- [ ] Supabase: allowlist ל-
  `https://kenyonexpress.co.il/auth/callback`.
- [ ] leaked-password protection בהגדרות Auth.

**סוכן**

- [ ] מדפיס רשימת דילים שיעלו ב-T0. מסיר מהקמפיין כל slug ש-404.
- [ ] מוודא שאין מוצר
  `physical`/`recurring`
  ב-
  `active`.

**Go יומי:** G13+G14 על דיל אחד.

---

## T-3

מטרה: מפתחות ייצור ב-Vercel, בלי לפתוח קופה ובלי DNS.

**בעלים**

- [ ] שמונת הסודות ב-Production scope.
- [ ] Cardcom: מסוף ייצור. IndicatorUrl עם
  `?s=`
  שתואם
  `CARDCOM_WEBHOOK_SECRET`.
  Success/Fail על ה-host שיהיה קנוני, או על ה-Vercel URL בינתיים עם רשימה לעדכון ב-T0.
- [ ] `CHECKOUT_ENABLED`
  לא
  `true`.
- [ ] יישור Production Branch (G6) + Redeploy. בודק שה-deployment Ready.
- [ ] לא מחליף מסוף שוב עד אחרי T+2.

**סוכן**

- [ ] `curl` ל-
  `/api/health`
  על ה-URL של Production (לא apex, עדיין WP):

```bash
curl -sS https://<production-deployment>.vercel.app/api/health; echo
```

צפי:
`{"ok":true,"database":"ok"}`.

- [ ] מזכיר: Deployment Protection לא יחסום webhook (G, SE12).

**Go יומי:** סודות בפנים, health 200, קופה סגורה, מסוף לא יוחלף מחר.

---

## T-2

מטרה: עסקת ייצור מינימלית **לפני** cutover, על URL של Vercel או Preview ייצור-מבוקר. לא על האפקס (עדיין WP).

**בעלים**

- [ ] פותח קופה רק על ה-deployment הזה, או עסקה ידנית מול אותו מסוף לפי נוהל הסולק. עדיף: `CHECKOUT_ENABLED=true` זמנית על Production, קנייה ב-
  `*.vercel.app`,
  אחרי הצלחה אפשר להשאיר true או לסגור עד T0. אם נשארת פתוחה: האפקס עדיין WP אז הציבור לא מגיע לקופה. עדיין סיכון אם מישהו יודע את ה-URL. ברירת מחדל שמרנית: לפתוח, טסט, לסגור עד בוקר T0.
- [ ] כרטיס הבעלים, סכום מינימלי.
- [ ] מוודא מייל + שובר + סריקה + refund.
- [ ] `/admin/payments`: אפס "נגבה בלי הזמנה".

**סוכן**

- [ ] תיעוד G1-G4 עם מזהים.
- [ ] פקודות בוקר מהראנבוק רצות פעם אחת כתרגול.

**No-go:** CC6 נכשל. T0 זז, לא "נעבור בלי שובר".

---

## T-1

מטרה: החלטת go בכתב. הקפאת קוד.

**בעלים**

- [ ] עובר על טבלת G1-G18. כל תא ריק = דחיית T0.
- [ ] כותב ב-
  `STATE.md`:
  `החלטת go T0: כן/לא` + תאריך.
- [ ] מדפיס ראנבוק + פלייבוק תמיכה + ערכת ספק.
- [ ] ntfy:
  `https://ntfy.sh/kenyon-ofir-limit`.
- [ ] מכבה או מקפיא את
  `kenyon-loop.sh`
  ל-T0 (קוד חדש ביום cutover = סיכון). עצירה:

```bash
touch ~/.kenyon-loop.stop
```

- [ ] caffeinate / שינה כבויה למכונה שתנטר.
- [ ] מוודא WP rollback URL (G10) עובד מתיקייה/hosts, לא מהאפקס.

**סוכן**

- [ ] אין קומיטים אלא hotfix שבעלים ביקש.
- [ ] אין merge לילה, אין pending SQL.

**Go יומי:** שורת go ב-STATE, או T0 מבוטל לפני השינה.

---

## T0 (יום ה-cutover)

סדר קשיח. לא לדלג. לא להחליף מסוף Cardcom היום.

### בוקר (לפני flip)

**סוכן או בעלים, Terminal:**

```bash
pgrep -fl kenyon-loop.sh; pgrep -fl caffeinate
dig kenyonexpress.co.il A +short
dig kenyonexpress.co.il NS +short
curl -sS -o /dev/null -w 'apex:%{http_code}\n' https://kenyonexpress.co.il/
curl -sS https://<production-deployment>.vercel.app/api/health; echo
```

צפי: apex עדיין WP (200 + לא JSON health). health של Vercel 200.

**בעלים, Chrome**

- [ ] Vercel: Deployment Ready, Domain Valid על Production.
- [ ] Cardcom: URL-ים מעודכנים ל-apex (או מעדכנים **מיד אחרי** שה-TTL יפנה לוורסל, באותו חלון).
- [ ] `CHECKOUT_ENABLED=true`
  רק אחרי go של T-1 עדיין תקף. Redeploy אם הלמבדה חמה.
- [ ] סוכן שני לא רץ.

### Flip (Cloudflare)

- [ ] מחליף A/ALIAS/CNAME לערכים ש-Vercel מציג (לא IP מהזיכרון).
- [ ] www → apex.
- [ ] מחכה דקות, לא מניח ש-TTL 300 = מיידי בכל הרזולברים.

**Terminal אחרי:**

```bash
dig kenyonexpress.co.il A +short
curl -sS -I https://kenyonexpress.co.il | head -n 15
curl -sS https://kenyonexpress.co.il/api/health; echo
curl -sS -o /dev/null -w 'www:%{http_code}\n' https://www.kenyonexpress.co.il/
```

צפי: health JSON 200. HTML של Next, לא WP. HTTP נסגר ל-HTTPS.

**No-go תוך 15 דקות:** health 503 או 5xx רחב = R4 או R3 לפי הראנבוק. לא "מחכים שעה כי DNS".

### 60 דקות ראשונות

| כל 10 דק' | מי | מה |
|---|---|---|
| health + בית + PDP הדיל | בעלים | Chrome |
| לוג webhook Cardcom | בעלים | Vercel Logs |
| Sentry / ntfy | בעלים | שקט ≠ בריאות; בודקים גם היעדר אירועים |
| עסקת מינימום על האפקס | בעלים | אם T-2 היה על vercel.app בלבד: חובה עסקה אחת על הדומיין החי |
| סריקה אצל הספק | בעלים + קופאי | `/scan` |

אנומליית כסף: R5, לא ממשיכים לקהל.

### אחרי 60 דקות ירוקות

- [ ] Soft-launch: ספק אחד, קונים מבוקרים, לא מודעת המונים.
- [ ] לא HSTS preload.
- [ ] לא מוחקים WordPress.
- [ ] כותבים ל-
  `STATE.md`
  שעת flip + מזהה הזמנת החי.

---

## T+1

**בעלים:** עסקאות האתמול, אפס שורות "נגבה בלי הזמנה", refund של טסט אם עוד לא. מיילים הגיעו. ספק לא מתלונן על סריקה.

**סוכן (אם הופעל מחדש):** רק באגים לא-כספיים. כל כסף = בעלים + ראנבוק.

פקודות בוקר: ראנבוק §1 במלואן. עכשיו health על האפקס חייב 200, לא 404.

---

## T+2

Cardcom: לא מחליפים מסוף. בודקים reconciliation / cron
`stranded-payments`
אם
`CRON_SECRET`
חי.

רשימת פניות לפי
`docs/CUSTOMER-SUPPORT-PLAYBOOK.md`.
אין הנפקת שובר ידנית.

---

## T+3

TTL יכול לחזור לערך ארוך אחרי שהרזולברים התייצבו. WP עדיין חי.

בעלים: גיבוי
`tar`
יומי כרגיל (כלל הפרויקט). סוכן: לא merge לילה גדול.

---

## T+4

קטלוג: אם picsum עדיין על דילים חיים, מורידים מהשיגור או מחליפים תמונה. לא seed דמו.

בדיקת Auth Google על apex בלבד (בלי חשבון שני שבור).

---

## T+5

Sentry: אין בום 5xx. Vercel cron: לפחות
`notifications`
רץ. תיבת
`info@kenyonexpress.co.il`
לא מתה.

---

## T+6

תרגול rollback מנטלי: R3 + R4 עדיין אפשריים (WP חי). לא preload.

אם צריך Pro ולא שולם: cron עלול להיחתך. לבדוק לוג.

---

## T+7

סיכום שבוע ב-
`STATE.md`:
מספר הזמנות paid, שוברים, סריקות, החזרים, פניות תמיכה, אנומליות כסף (חייב אפס).

החלטה: נשארים soft, או מתכננים GA (עו"ד,
`/cancel`,
שאר הספקים).

WP: עדיין לא לכבות. שבועיים מה-T0 לפי Q3.

לולאת אוטונומיה: מותר להחזיר אחרי T+7 רק אם אין תקלת כסף פתוחה, וסוכן אחד.

---

## צ'קליסט מקוצר ליום T0 (להדפיס)

```
[ ] G1-G18 סומנו אתמול
[ ] לולאה כבויה / סוכן אחד
[ ] health על Vercel URL = 200
[ ] CHECKOUT_ENABLED=true רק אחרי go
[ ] Cloudflare backup קיים
[ ] WP rollback URL עובד
[ ] Cardcom URLs ל-apex
[ ] Flip DNS
[ ] dig + health על apex
[ ] עסקה חיה אחת + שובר + סריקה
[ ] 60 דק ניטור
[ ] אנומליה = כיבוי קופה, לא ויכוח
[ ] לא db push, לא 059, לא force-push, לא HSTS preload
```

---

## Revision

| Date | Change |
|---|---|
| 2026-08-19 | תוכנית T-7..T+7: go/no-go, rollback, תפקידי בעלים מול סוכן |
