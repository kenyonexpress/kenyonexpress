# צ'קליסט עלייה לאוויר

<!-- stale-banner:2026-09-01 -->
> ⛔ **‏מיושן החל מ-01.09.2026. המסמך המחייב הוא `docs/LAUNCH-RUNBOOK.md`.**
>
> ‏נכתב ‏19.08.2026. אינו רצף העלייה לאוויר: הרצף המדויק, פקודה אחר פקודה עם
> ‏rollback לכל שלב, נמצא במסמך המחייב, וכולל את ניתוח ה-DNS שאין כאן.
> ‏**שלבים ‏1 עד ‏6 שם כבר בוצעו.**
>
> ‏למה שנשאר לך: `docs/OWNER-CHECKLIST.md`.


תאריך: 2026-08-19.
ענף: `ke-arch`.
היקף: docs בלבד.

זה צ'קליסט **תפעולי ליום עלייה**, עם סטטוס מול המצב שנמדד. הוא לא מחליף את
`GO-LIVE.md`
(שערי מדידה עם תאריכים) ואת
`docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md`
(מטריצת P0/P1/P2). כשיש סתירה כספית:
`docs/BUSINESS-MODEL.md`
גובר.

מודל בשיגור: קופון =
`coupon_price`
מלא באתר, נשאר בפלטפורמה, **אין Escrow**. פיזי = לא ב-soft-launch (Q13). כסף באגורות שלמות. Guest cart פתוח, Google בלחיצת שלם.

Kill switch:

```
CHECKOUT_ENABLED=false
```

עד שכל שערי P0 הכספיים מסומנים PASS עם ראיה.
`ESCROW_FLOW_ENABLED`
אסור `true`.

סטטוסים במסמך זה:

| סטטוס | משמעות |
|---|---|
| PASS | נמדד בתאריך שבטור הראיה |
| FAIL | נמדד ולא עומד |
| BLOCKED_OWNER | הקוד מוכן, חסרה פעולה של הבעלים (סוד, DNS, נתון אמיתי, עו"ד) |
| OPEN | לא נמדד מחדש ב-19.08, נשאר פתוח |
| N/A | לא רלוונטי ל-soft-launch קופון בלבד |

ראיות ישנות (01.08, 07.08, 10.08) נשארות עד מדידה חדשה. אין לסמן PASS בלי תאריך.

שאלות קריטיות: `docs/QUESTIONS-FOR-OFIR.md`.

---

## 0. סדר היום (לא לדלג)

1. סודות Production מלאים, כולל מסוף Cardcom ייצור.
2. Resend DNS ירוק + מייל רכישה אחד אמיתי.
3. Smoke על **Preview** (לא על הדומיין החי): עגלה → Google → תשלום → שובר → סריקה → refund.
4. יישור Git branch של Vercel Production ל-`main`.
5. `CHECKOUT_ENABLED=true` ב-Production בלבד.
6. DNS cutover (TTL כבר 300).
7. 60 דקות מעקב Sentry / Ntfy / לוג webhook.
8. Soft-launch לקהל מבוקר.

אסור: לחבר דומיין חי ל-Preview; לשים service role תחת `NEXT_PUBLIC_`; להפעיל Escrow; להחיל 059 על הפרודקשן; להריץ seed דמו על הפרודקשן.

Rollback: `CHECKOUT_ENABLED=false` ואז Instant Rollback. בלי down-migration הרסנית.

---

## 1. Cardcom production terminal

מקור מחייב לפירוט טכני: `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/CARDCOM-ARCHITECTURE.md`.
הלקוח הוא **legacy** `/Interface/*.aspx`, לא v11. Cardcom **אינו חותם** webhooks. האותנטיות: מחרוזת `?s=` בלתי ניתנת לניחוש **ואימות GetLpResult שרת-לשרת** (המקור היחיד לסכום, סטטוס, טוקן).

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| CC1 | מסוף Production (לא sandbox) משויך לחשבון הפלטפורמה | P0 | BLOCKED_OWNER | STATE 10.08: credentials חסרים |
| CC2 | Terminal number + API name/password ב-Vercel **Production בלבד** | P0 | BLOCKED_OWNER | `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` ברשימת 8 הסודות |
| CC3 | `CARDCOM_WEBHOOK_SECRET` (query `s`) מוגרל, לא ב-git | P0 | BLOCKED_OWNER | אותו מקור |
| CC4 | Low Profile Success / Fail / Webhook על host הקנוני HTTPS | P0 | OPEN | אחרי בחירת host (Q38: apex) |
| CC5 | GetLpResult נקרא ב-finalize; webhook בלי זה לא סוגר הזמנה | P0 | OPEN | קוד קיים; אין עסקה חיה שמוכיחה |
| CC6 | עסקת קופון טסט בסכום מינימלי: charge → webhook → order paid → voucher+QR | P0 | FAIL | 07.08: 4 הזמנות, **0 שוברים, 0 אירועי סליקה** בפרודקשן. מסלול הכסף מעולם לא רץ מקצה לקצה על החי |
| CC7 | Replay webhook = no-op, בלי שובר כפול | P0 | OPEN | נבדק בטסטים, לא מול מסוף חי |
| CC8 | סכום Cardcom == `coupon_price` מלא (לא אחוז, לא 10%) | P0 | OPEN | המודל מחייב; אין שורת payment חיה |
| CC9 | אחרי תשלום קופון: `platform_settled`; אין hold חדש לספק | P0 | OPEN | שאריות escrow ששילמו לספק תוקנו ב-10.08 בקוד; לא נמדד מול מסוף |
| CC10 | כשל תשלום לא כותב `orders.paid_at` | P0 | OPEN | טסטים; אין כשל חי מתועד |
| CC11 | Refund / ביטול ביום החיוב על הזמנת הטסט | P1 | OPEN | GO-LIVE שלב 4 פתוח |
| CC12 | Token שמור לחיוב חוזר (אותו `cardcom_account_key`) | P1 | N/A | לא חובה ל-soft-launch קופון |
| CC13 | Preview מצביע ל-sandbox, Production למסוף החי | P0 | OPEN | VCL13; לא אומת ב-19.08 |
| CC14 | `/admin/payments` ריק משורות "נגבה בלי הזמנה סגורה" אחרי הטסט | P0 | OPEN | המסך שחסר כשב-27.07 נגבה כסף וההזמנה נשארה פתוחה |

פקודות ראיה אחרי הטסט (Terminal, שורש הפרויקט, בלי הדפסת סודות):

```
# הזמנה paid + שובר אחד + אפס escrow_holds חדשים
# סכום payment == coupon_price_ils של השורה
```

אסור: סיסמאות Cardcom ב-git, ב-Notion ציבורי, ב-Make/Zapier, או ב-`NEXT_PUBLIC_`.

**פער מול עכשיו.** המסוף, הסודות, ועסקת הקצה-לקצה: כולם אצל הבעלים. הקוד לא יכול לסגור CC1-CC3.

---

## 2. Resend DNS

מקור: `docs/ARCHITECTURE-NOTIFICATIONS-V2.md`, `docs/ARCHITECTURE-ENV-SECRETS.md` ENV4, DOM7.

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| RS1 | `RESEND_API_KEY` תקין ב-Vercel Production (לא בדפדפן) | P0 | FAIL | STATE 11.08: **400 API key is invalid**, אותו ערך נשלח פעמיים |
| RS2 | `RESEND_FROM` על דומיין מאומת | P0 | BLOCKED_OWNER | אימות דומיין לא בוצע |
| RS3 | SPF ברשומת TXT של דומיין השליחה | P0 | BLOCKED_OWNER | Resend dashboard: DNS not green |
| RS4 | DKIM (CNAME אחד או יותר ש-Resend מציג) | P0 | BLOCKED_OWNER | אותו מקור |
| RS5 | DMARC בסיסי (`p=none` ביום 1, לא `reject`) | P1 | BLOCKED_OWNER | אחרי SPF+DKIM |
| RS6 | מייל אישור רכישת קופון הגיע בפועל אחרי עסקת הטסט | P0 | FAIL | תלוי RS1 + CC6; 07.08: 0 שורות outbox בפרודקשן |
| RS7 | מסמך גילוי 14ג(ב) יוצא עם האישור או מצורף לשובר | P0 | OPEN | חוסם GA; soft-launch סגור יכול עם מייל אחד מלא |
| RS8 | אין Make/Zapier בשום מסלול ייצור | P0 | PASS | מדיניות קוד; לא נמצא מסלול כזה ב-10.08 |
| RS9 | הפרדת `txn.` / `mkt.` | P2 | N/A | Q2: דומיין אחד עד שיש דיוור שיווקי |
| RS10 | `CONTACT_TO` לטופס `/contact` | P1 | OPEN | הטופס נבנה; תלוי מפתח תקין |

רשומות אופייניות (הערכים המדויקים מגיעים מ-Resend Dashboard, לא מכאן):

```
# Cloudflare DNS ל-kenyonexpress.co.il (או send.)
# TXT   @              v=spf1 include:amazonses.com ~all   (או מה ש-Resend מציג)
# CNAME resend._domainkey  ...
# TXT   _dmarc         v=DMARC1; p=none; rua=mailto:dmarc@kenyonexpress.co.il
```

בדיקה אחרי פרסום (Terminal):

```
dig kenyonexpress.co.il TXT +short
dig resend._domainkey.kenyonexpress.co.il CNAME +short
```

**פער מול עכשיו.** המפתח שבור והדומיין לא מאומת. בלי זה אין קופון במייל ביום עלייה.

---

## 3. DNS cutover

האתר החי היום הוא **WordPress** מאחורי Cloudflare, HTTP 200. nameservers כבר Cloudflare. זה מעבר מתוזמן, לא "DNS חסר".

Host קנוני מומלץ (Q38): `https://kenyonexpress.co.il` (apex). `www` → apex 301.

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| DN1 | ייצוא אזור Cloudflare (גיבוי) לפני שינוי | P0 | OPEN | |
| DN2 | TTL על רשומות apex/www הורד ל-300 **לפחות 24 שעות לפני** | P0 | OPEN | |
| DN3 | Vercel: הדומיין מחובר ל-**Production** של הפרויקט הנכון, סטטוס Valid | P0 | OPEN | אסור Preview |
| DN4 | Apex A/ALIAS/CNAME לפי מה שוורסל מציג (לא לנחש IP) | P0 | OPEN | WordPress עדיין היעד |
| DN5 | www CNAME לערך Vercel, ואז redirect לקנוני | P0 | OPEN | |
| DN6 | HTTP → HTTPS 301/308 | P0 | OPEN | אחרי שהדומיין על Vercel |
| DN7 | תעודה תקפה ל-apex ו-www | P0 | OPEN | |
| DN8 | Supabase Auth redirect allowlist כולל `https://kenyonexpress.co.il/auth/callback` | P0 | OPEN | |
| DN9 | Google OAuth: URI ייצור בלבד, בלי localhost ב-client של prod | P0 | OPEN | |
| DN10 | Cardcom Success/Fail/Webhook על אותו host | P0 | תלוי CC4 | |
| DN11 | `NEXT_PUBLIC_*` / canonical מצביעים ל-host הקנוני | P0 | OPEN | |
| DN12 | מפת 301 מ-WP (מוצרים, קטגוריות, עמודים משפטיים בנתיבים הישנים) | P0 | חלקי | נתיבים משפטיים כבר על אותם paths; 8 כרטיסי בית עדיין 404 |
| DN13 | WordPress נשאר חי (שבועיים) על host משני / IP ישן ל-rollback | P0 | OPEN | |
| DN14 | הקפאת מכירת שוברים ב-WP לפני flip (Q3: T-14 אם המלאי קטן) | P0 | BLOCKED_OWNER | תאריך לא נקבע; כמות שוברים פתוחים לא נמדדה |
| DN15 | HSTS preload | P2 | לא ביום 1 | Q37 |
| DN16 | Production Git branch = `main` (לא `cursor/add-supabase-3c830`) | P0 | FAIL | STATE 10.08 |

פקודות ראיה (Terminal, מכונה מקומית):

```
dig kenyonexpress.co.il A +short
dig www.kenyonexpress.co.il CNAME +short
dig kenyonexpress.co.il NS +short
curl -sI http://kenyonexpress.co.il | head -n 8
curl -sI https://kenyonexpress.co.il | head -n 12
curl -sI https://www.kenyonexpress.co.il | head -n 8
```

צפי אחרי cutover: HTTPS 200/308; HTTP אל HTTPS; www אל apex; ה-HTML הוא Next לא WP.

**פער מול עכשיו.** הדומיין עדיין החנות הישנה. אסור לנתק לפני CC6 + RS6 + DN16.

---

## 4. Vercel Production וסודות

מקור: `docs/ARCHITECTURE-ENV-SECRETS.md`.

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| SE1 | `NEXT_PUBLIC_SUPABASE_URL` + anon = פרויקט prod | P0 | OPEN | לא demo, לא 127.0.0.1 |
| SE2 | `SUPABASE_SECRET_KEY` service role, לא `NEXT_PUBLIC_`, לא demo | P0 | FAIL מקומית | 11.08: המפתח המקומי היה demo (`iss: supabase-demo`) |
| SE3 | `VOUCHER_QR_SECRET` (32+ bytes) + אופציונלי PREVIOUS | P0 | BLOCKED_OWNER | ברשימת 8 |
| SE4 | `CRON_SECRET` | P0 | BLOCKED_OWNER | בלעדיו cron מחזיר 401 (fail-closed) |
| SE5 | `SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN` ל-source maps) | P0 | BLOCKED_OWNER | בלי DSN מסלול הכסף לא מדווח |
| SE6 | `CHECKOUT_ENABLED` קיים; בפרודקשן נפתח רק על המחרוזת `true` | P0 | PASS (קוד) | `src/lib/payments/env.ts`; עד השער הכספי: לא מגדירים או `false` |
| SE7 | `ESCROW_FLOW_ENABLED` לא true | P0 | PASS (מדיניות) | אסור להגדיר |
| SE8 | אף סוד כסף לא ב-client bundle | P0 | PASS 31.07 | לחזור על הסריקה ב-build המועמד |
| SE9 | Preview ≠ prod (DB, Cardcom, Resend) | P0 | OPEN | |
| SE10 | **עשרה** cron מול תוכנית Hobby/Pro (נספר 20.08; "שישה" היה שגוי) | P0 | BLOCKED_OWNER | Q5. חובה: `notifications`, `expire-vouchers`, **`stranded-payments`** (‏10 דק'; ביממה מאבד את ערכו) |
| SE11 | Rollback מתועד (Instant Rollback) | P0 | OPEN | |
| SE12 | Deployment Protection לא חוסם webhook Cardcom/Resend | P0 | OPEN | |
| SE13 | Meilisearch / R2 | P1 | OPEN | חיפוש ומדיה; לא חוסם קופון יחיד ב-soft-launch צר |

שמונת הסודות שחסרים במפורש (STATE 10.08):

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

בלי הרשימה הזו: אין תשלום, אין קופונים, אין מיילים, אין cron.

---

## 5. Seed data וקטלוג

**כלל:** seed דמו לא רץ על פרודקשן. הפרודקשן כבר מחזיק קטלוג חי (61 מוצרים, 11 ספקים, 15 קופונים נמדדו 07.08).

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| SD1 | `platform_percent` מלא בכל מוצר פעיל | P0 | PASS 01.08 | 61/61 |
| SD2 | `supplier_split_percent` מלא בכל מוצר פעיל | P0 | PASS 01.08 | 61/61 |
| SD3 | `coupon_price_ils` מלא בכל קופון פעיל | P0 | PASS 01.08 | 15/15 |
| SD4 | כל מוצר פעיל משויך ל-`supplier_id` | P0 | PASS 01.08 | 61/61 |
| SD5 | כתובת + לוגו + טלפון לכל ספק שמפרסם קופון | P0 | FAIL | **11/11 בלי address ו-logo_url**; 6 בלי טלפון/עיר. שער `assertPublishable` חוסם שמירת מוצר פעיל |
| SD6 | אפס תמונות `picsum.photos` על מוצרים פעילים | P1 | FAIL | 30/61 ב-01.08 |
| SD7 | alt עברי לכל תמונת מוצר | P1 | חלקי | חסימת העלאה קיימת; מלאי ישן לא מלא |
| SD8 | 8 כרטיסי דיל בדף הבית לא 404 | P1 | FAIL | 8/32 slugs שבורים (כולל Dokan ו-`קופון-טסט`) |
| SD9 | `PENDING-live-products.sql` / השלמת 8 המוצרים החסרים | P1 | OPEN | נתונים אמיתיים, לא דמו |
| SD10 | מיגרציות seed (018/022/024/041) לא הוחלו מחדש על prod | P0 | OPEN | דמו בלבד |
| SD11 | `arch/seed-data`: 10 ספקים מלאים **לסטייג'ינג** | P1 | לא ממוזג | origin, 462 קומיטים מאחור; rebase לפני שימוש |
| SD12 | WP import: dry-run בלבד עד החלטת כתיבה | P0 | PASS 01.08 | `WP_IMPORT_ALLOW_WRITES` כבוי |
| SD13 | החלטת slugs כפולים ב-WP (20/44 ממחזרים כתובת) | P1 | BLOCKED_OWNER | STATE 10.08 |
| SD14 | שוברי legacy: `platform_percent=0` במערכת החדשה | P0 | החלטה זמנית Q29 | לא להחיל payout על כסף שנגבה ב-WP |
| SD15 | מוצר פיזי / מנוי לא `active` ב-soft-launch | P0 | החלטה זמנית Q13 | |

מסך המתנה לבעלים: `/admin/suppliers?status=incomplete`.

**פער מול עכשיו.** שערי האחוזים והמחירים על הקטלוג החי עברו. שערי **הנתונים התפעוליים** (כתובת ספק, תמונות אמיתיות, גריד בלי 404) נכשלו. בלי SD5 אי אפשר למכור קופון שאפשר לממש.

---

## 6. Legal (תקנון, פרטיות, נגישות, ביטולים)

נתיבים קנוניים הם נתיבי וורדפרס, בכוונה. aliases ב-`next.config.ts`:

| מקור (301 קבוע) | יעד חי |
|---|---|
| `/terms` | `/terms-and-conditions` |
| `/privacy` | `/privacy-policy` |
| `/cancellation-policy` | `/refund_returns` |

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| LG1 | תקנון ב-`/terms-and-conditions`, בפוטר | P0 | PASS קוד 07.08 | טקסט מועבר מ-WP (17,376 תווים). **בלי באנר בדיקה**, טעון קריאה מול C11(א) (Q19) |
| LG2 | פרטיות ב-`/privacy-policy`, בפוטר | P0 | PASS קוד 07.08 | מועבר מ-WP (12,132). אותו סיכון Q19 |
| LG3 | ביטולים ב-`/refund_returns` | P0 | PASS קוד + טיוטה | נכתב מחדש (דף Woo באנגלית לא הועבר). יש `reviewNotice` |
| LG4 | הצהרת נגישות `/accessibility` (ת"י 5568 / WCAG 2.0 AA) | P0 | PASS קוד + טיוטה | נמדד; באנר: רכז נגישות חסר |
| LG5 | `/about`, `/contact`, `/faq` קיימים | P1 | PASS קוד | `/about` נכתב מאפס (shortcodes לא הועברו) |
| LG6 | `/cookies` כעמוד נפרד | P2 | N/A | Q18: עוגן בפרטיות עד פיקסל שיווקי |
| LG7 | `/cancel` טופס ביטול עסקה (14ט) | P0 ל-GA | FAIL | אין ראוט. soft-launch סגור: מייל+טלפון; GA: חובה |
| LG8 | Checkbox תקנון + 18+ בצ'קאאוט | P0 | OPEN | Q22 |
| LG9 | `orders.terms_version` / `terms_accepted_at` | P1 | OPEN | |
| LG10 | אישור עו"ד על תקנון+פרטיות+ביטולים+נגישות | P0 | BLOCKED_OWNER | באנרים על ביטולים ונגישות; תקנון/פרטיות בלי באנר ועדיין לא חתומים |
| LG11 | Placeholders חברה: ח.פ, כתובת, מייל משפטי, DPO, רכז נגישות | P0 | BLOCKED_OWNER | Q9 |
| LG12 | סיווג 14ח (תו קנייה מול שובר הטבה) | P0 | BLOCKED_OWNER | Q6; זמנית: 4 חודשים + ארנק 5 שנים |
| LG13 | מדיניות דמי ביטול ב-soft-launch תואמת קוד ועמוד | P0 | OPEN | Q7; מומלץ: 0 דמי ביטול ביום עלייה |
| LG14 | axe / Lighthouse a11y על דפי מפתח ≥ 90 | P1 | חלקי 01.08 | בית 93, מוצר 96, קטגוריה 97. ניגודיות טופלה בסבב נגישות |
| LG15 | הסכם ספק חתום לפני סריקה חיה | P1 | OPEN | |

**פער מול עכשיו.** העמודים קיימים בנתיבים הנכונים. מה שחסר הוא **חתימת עו"ד**, פרטי הישות, טופס `/cancel`, והתאמת התקנון המועבר למודל בלי Escrow.

---

## 7. סכימה, RLS, כסף (בלי להחיל מיגרציות)

איסור: `db push`. מיגרציה ממתינה ב-`migrations/pending`. החלה על פרודקשן היא אחת מארבע העצירות.

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| DB1 | אפס טבלאות public בלי RLS | P0 | PASS 28.07 | |
| DB2 | לא מחילים 059 / משפחת `_agorot` לפני cutover קוד | P0 | PASS (סירוב מתועד) | קוד חי קורא `price_ils`; 55 קבצים עדיין על שמות ישנים |
| DB3 | `090_profiles_no_self_role_change` הוחלה | P0 | PASS 31.07 | |
| DB4 | advisors: 7 טבלאות RLS בלי policies = נעילות service-role מכוונות | P1 | PASS 07.08 | כולל `invoices` |
| DB5 | `auth_leaked_password_protection` דלוק | P1 | FAIL | כבוי; הדלקה ב-Dashboard (Q33) |
| DB6 | PITR / גיבוי אוטומטי על פרויקט prod | P0 | OPEN | `ARCHITECTURE-BACKUP-DR.md` |
| DB7 | גיבוי ידני לפני cutover | P0 | OPEN | |
| DB8 | מע"מ 18% בחשבונית, לא 17% ב-ledger | P0 | FAIL סתירה | Q8: `VAT_RATE_BP=1700` מול `DEFAULT_VAT_PERCENT=18` |

---

## 8. עגלה, checkout, שובר, סריקה

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| A1 | Guest cart: הוספה, כמות, הסרה | P0 | OPEN | קוד קיים (`CartDrawer`, `mergeGuestCart`); לא נמדד מקצה לקצה ב-19.08 |
| A2 | שלם כאורח → Google → חזרה עם עגלה | P0 | OPEN | תור המרתון שלב 3 |
| A3 | מחיר קופון זהה: PDP = עגלה = Cardcom | P0 | OPEN | תלוי CC6 |
| A4 | RLS: משתמש A לא רואה הזמנות של B | P0 | OPEN | בדיקה עם שני חשבונות אמיתיים |
| V1 | תשלום מייצר שובר+QR ב-`/account` | P0 | FAIL על prod | 0 שוברים |
| V2 | סריקה ראשונה מצליחה; שנייה נדחית | P0 | OPEN | פורטל ספק: ענף לא ממוזג (15 קומיטים) |
| V3 | קופון: settlement לספק = 0 | P0 | OPEN | מודל; לא נמדד חי |
| V4 | QR עם HMAC שגוי נדחה בלי דליפת פרטים | P0 | OPEN | |
| V5 | פקיעה מזכה ארנק (C6), cron `expire-vouchers` | P0 | OPEN | תלוי CRON_SECRET + תוכנית Vercel |

סקריפט smoke ביום עלייה (Chrome, Preview ואז Production אחרי cutover):

1. אורח: בית → PDP קופון → עגלה.
2. שלם → Google → חזרה, עגלה מלאה.
3. תשלום מסוף החי בסכום מינימלי (כרטיס הבעלים).
4. הצלחה, הזמנה paid, שובר+QR בחשבון.
5. מייל Resend הגיע.
6. סריקת ספק מצליחה; סריקה חוזרת נדחית.
7. Refund מתועד על הזמנת הטסט.
8. רק אז פתיחת קהל.

---

## 9. איכות, אבטחה, ניטור

| # | שער | P | סטטוס 19.08 | ראיה / פער |
|---|---|---|---|---|
| Q1 | `pnpm type-check` + `pnpm lint` נקיים על ה-tip המשוגר | P0 | OPEN | 10.08 על v1.0.0: נקי; לחזור על המועמד |
| Q2 | `pnpm test` ירוק | P0 | OPEN | 10.08: 1990/1990; 07.08: 1823/1823 |
| Q3 | `next build` production | P0 | OPEN | |
| Q4 | Playwright guest→checkout | P0 | OPEN | E2E required-check אסור עד `CI_SUPABASE_URL` (STATE) |
| Q5 | compare.mjs home מתחת 11% | P0 | PASS 10.08 | בית 9.76%, קטגוריה 8.4%. מוצר 15.58% בבחירה (כפתור עגלה שאין בחי) |
| S1 | אין CVE קריטי בחבילות כסף | P1 | OPEN | |
| S2 | Rate limit על checkout, scan, auth | P0 | OPEN | |
| S3 | Admin דורש role, לא רק session | P0 | OPEN | |
| S4 | לוגים בלי PAN / token / סיסמה | P0 | OPEN | |
| S5 | Sentry alert על checkout/payments | P0 | תלוי SE5 | |
| S6 | 2FA על Supabase Dashboard | P0 | BLOCKED_OWNER | |

Lighthouse 01.08 (מובייל, אחרי תיקון הירו): בית perf 75 / a11y 93. לא חוסם soft-launch סגור. יעד GA: a11y ≥ 90 נשמר.

---

## 10. ניתוח פער מול המצב הנוכחי (סיכום)

נכון ל-19.08, מול מדידות 01.08 / 07.08 / 10.08.

### מה כבר עומד (לא חוסם אם לא נשבר מאז)

- מודל כסף בקוד: אין אחוז קשיח בעמלה; דמי ביטול סטטוטוריים הם החריג.
- Guest cart + Google בקופה (קוד; לא E2E חי).
- RLS כללי, איסור self-promote ל-admin.
- אחוזי פיצול ומחירי קופון מלאים על הקטלוג החי.
- עמודים משפטיים בנתיבי WP + aliases.
- `/about`, `/contact`, `/faq`, `/accessibility`.
- Kill switch `CHECKOUT_ENABLED` fail-closed בפרודקשן.
- WP import יבש.
- compare בית/קטגוריה/עגלה תחת השער.
- nameservers Cloudflare כבר במקום.

### מה נכשל או חסום אצל הבעלים (חוסם כסף אמיתי)

| פער | שער | למה זה חוסם |
|---|---|---|
| אין מסוף Cardcom ייצור / 8 סודות | CC, SE | אין גבייה ואין שובר |
| Resend 400 + דומיין לא מאומת | RS | אין מייל רכישה / גילוי |
| הדומיין מגיש WP | DN | Next לא באוויר |
| Vercel Production Branch לא `main` | DN16 | Deploy מהענף הלא נכון |
| 0 שוברים / 0 סליקות בפרודקשן | CC6, V1 | מסלול הכסף לא רץ חי אף פעם |
| 11 ספקים בלי כתובת/לוגו | SD5 | אי אפשר לממש, אי אפשר לשמור מוצר |
| 8 דילים בבית → 404 | SD8 | אחרי cutover זה באג שלנו |
| 30 תמונות picsum | SD6 | קטלוג דמה |
| מע"מ 17 מול 18 | DB8 | חשבונית ראשונה תהיה שגויה |
| אין `/cancel` | LG7 | חוסם GA (14ט) |
| אין חתימת עו"ד / ח.פ | LG10, LG11 | חוסם GA |
| cron מול Hobby | SE10 | מייל, פקיעה, ותשלום תקוע עלולים לא לרוץ |
| leaked password protection כבוי | DB5 | GA |

### מה לא ב-soft-launch (בכוונה)

- מוצר פיזי, מנוי, payout אוטומטי.
- QStash, WhatsApp עסקי, דיוור שיווקי, פיקסלים.
- אפליקציות חנות, HSTS preload.
- `packages/payments` (לא קיים).
- החלת 059 / אגורות על הפרודקשן.
- Seed דמו על הפרודקשן.

---

## 11. Soft-launch מול GA

| שלב | תנאי מינימום | קהל |
|---|---|---|
| Soft | כל P0 כסף (CC, RS, DN אחרי מעבר, SD5 לספקים שבדילים החיים, SE1-SE8) + smoke סעיף 8 | ספק אחד + קונים מבוקרים |
| GA | Soft + LG7 + LG10 + Q6/Q7 חתומים + P1 חיפוש/מדיה לפי צורך | ציבור |

72 השעות הראשונות: כב-`ARCHITECTURE-GO-LIVE-CHECKLIST.md` §9.4. כל אנומליית כסף = כיבוי `CHECKOUT_ENABLED` עד הסבר.

---

## 12. חתימות

לכל P0: פקודה+timestamp / לוג / צילום. בלי ראיה = לא PASS.

| תפקיד | שם | תאריך | חתימה |
|---|---|---|---|
| בעלים / כסף | | | |
| הנדסה | | | |
| עו"ד (נוסחים) | | | |
| תוכן / קטלוג | | | |

---

## 13. Revision

| Date | Change |
|---|---|
| 2026-08-19 | צ'קליסט עלייה עם פער מול מדידות 01-10.08: Cardcom, Resend DNS, DNS cutover, seed, legal |
