# ARCHITECTURE-GO-LIVE-CHECKLIST.md

צ'קליסט **Go-Live** מחייב לשיגור KenyonExpress (כסף אמיתי + קופונים אמיתיים).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev E)  
Scope: **docs בלבד** בקובץ זה. הביצוע בשערי CI/ops לפי הצ'קליסט.  
Worktree בלבד:

```
/Users/ofir/kenyonexpress-web/ke-arch
```

(אסור לגעת בתיקייה הראשית לשינויי docs האלה.)

Companions: `MASTER-ARCHITECTURE-v2.md`, `ARCHITECTURE-ENV-SECRETS.md`, `ARCHITECTURE-BACKUP-DR.md`, `ARCHITECTURE-FEATURE-FLAGS.md`, checkout-cardcom, notifications V2, analytics.

---

## 0. פסיקה

שיגור מותר רק כשכל שערי **P0** מסומנים PASS עם ראיה (פקודה, צילום מסך, או לוג עם timestamp).  
P1 יכולים להישאר עם תאריך יעד אחרי soft-launch.  
P2 לא חוסמים soft-launch מוגבל.

| דרגה | משמעות |
|---|---|
| P0 | חוסם כסף אמיתי / קופון אמיתי / אבטחה |
| P1 | חוסם שיגור ציבורי מלא, לא soft-launch סגור |
| P2 | איכות / חוב טכני |

**מודל כסף בשיגור:** קופון = מלוא `coupon_price_ils` באתר, נשאר בפלטפורמה, **אין Escrow**. פיזי = פיצול לפי `platform_percent` דינמי מצולם ב-`order_items`. אין Make/Zapier בייצור. אין עמלת 5% קבועה.

Kill switches (חובה מוכנים לפני C3):

```
CHECKOUT_ENABLED=false
ESCROW_FLOW_ENABLED   # חייב unset/false; אסור true
```

---

## 1. דומיין, DNS ו-SSL/TLS

Host קנוני לייצור:

```
https://kenyonexpress.co.il
```

(או `www` אם נבחר כקנוני; חייבת להיות בחירה אחת בלבד.)

### 1.1 רשומות DNS (שער)

| # | רשומה | יעד | P | סטטוס | ראיה |
|---|---|---|---|---|---|
| DOM1 | `A` / `ALIAS` ל-apex `@` | כתובות Vercel (לפי UI Domains) | P0 | | `dig kenyonexpress.co.il A +short` |
| DOM2 | `CNAME` ל-`www` | `cname.vercel-dns.com` (או הערך ש-Vercel מציג) | P0 | | `dig www.kenyonexpress.co.il CNAME +short` |
| DOM3 | אין רשומות ישנות ל-WP/שרת קודם על אותו host בלי 301 מתוכנן | P0 | | |
| DOM4 | TTL סביר אחרי cutover (לא לשכוח להוריד לפני מעבר) | P1 | | |

### 1.2 SSL / TLS (שער)

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| SSL1 | תעודת HTTPS תקפה ל-apex ו-www (Vercel auto / Let's Encrypt) | P0 | | דפדפן מנעול / `curl -vI https://…` |
| SSL2 | אין mixed content בדפי מפתח (home, PDP, cart, checkout) | P0 | | DevTools |
| SSL3 | HTTP → HTTPS redirect 301/308 | P0 | | `curl -I http://kenyonexpress.co.il` |
| SSL4 | Host לא-קנוני מפנה לקנוני (www↔apex עקבי) | P0 | | `curl -I` |
| SSL5 | שרשרת תעודה מלאה; לא self-signed / staging cert על הדומיין החי | P0 | | |
| SSL6 | TLS 1.2+ בלבד (ברירת Vercel מקובלת) | P1 | | |
| SSL7 | HSTS: אופציונלי אחרי שבוע יציב ב-HTTPS; לא להפעיל preload ביום 1 בלי החלטה | P2 | | |
| SSL8 | תאריך תפוגת cert / חידוש אוטומטי של Vercel תקין | P1 | | Domains UI |

### 1.3 דומיין מול שירותים חיצוניים

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| DOM5 | Supabase Auth redirect allowlist כולל `https://kenyonexpress.co.il/auth/callback` (ו-www אם בשימוש) | P0 | | |
| DOM6 | Google OAuth: redirect URIs prod בלבד (בלי localhost ב-client של prod) | P0 | | |
| DOM7 | Resend: SPF + DKIM על דומיין השליחה (`kenyonexpress.co.il` או `mail.` / `send.`) | P0 | | Resend DNS green |
| DOM8 | Cardcom Success / Fail / Webhook URLs על `https://kenyonexpress.co.il/...` | P0 | | |
| DOM9 | `NEXT_PUBLIC_*` URLs / canonical metadata מצביעים ל-host הקנוני | P0 | | |
| DOM10 | Sitemap / robots על HTTPS הקנוני | P1 | | |

### 1.4 פקודות ראיה (Terminal)

מריצים ממחשב מקומי (לא חובה מתוך ה-worktree):

```
dig kenyonexpress.co.il A +short
dig www.kenyonexpress.co.il CNAME +short
curl -sI http://kenyonexpress.co.il | head -n 5
curl -sI https://kenyonexpress.co.il | head -n 10
curl -sI https://www.kenyonexpress.co.il | head -n 10
```

צפי: HTTPS 200/308 תקין; HTTP מפנה ל-HTTPS; host משני מפנה לקנוני.

---

## 2. Vercel production

### 2.1 פרויקט ו-Git

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| VCL1 | Project מחובר ל-repo `kenyonexpress/kenyonexpress` (או ה-remote המאושר) | P0 | | |
| VCL2 | Production Branch מאושר ומתועד (לא branch ניסוי) | P0 | | Settings → Git |
| VCL3 | Root Directory = שורש האפליקציה (לא worktree docs) | P0 | | |
| VCL4 | Framework Preset = Next.js; Node/pnpm תואמים ל-`package.json` | P0 | | |
| VCL5 | Ignored Build Step לא מדלג על שינויי כסף/checkout בטעות | P1 | | |

### 2.2 Domains ב-Vercel

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| VCL6 | `kenyonexpress.co.il` + `www` מחוברים ל-**Production** של הפרויקט הנכון | P0 | | Domains |
| VCL7 | סטטוס Domain = Valid Configuration (לא Invalid Configuration) | P0 | | |
| VCL8 | אין דומיין prod שמחובר לפרויקט preview/אחר | P0 | | |
| VCL9 | Certificate State = Valid עבור שני ה-hosts | P0 | | סעיף 1.2 |

### 2.3 Deployments ו-Environments

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| VCL10 | Production deployment אחרון **Ready** / GREEN | P0 | | Deployments |
| VCL11 | Build: `pnpm` + Next 15 מצליח; אין warnings קריטיים שבורים runtime | P0 | | build log |
| VCL12 | Environment variables: Production / Preview / Development מופרדים | P0 | | |
| VCL13 | Preview **לא** מצביע על Supabase prod / Cardcom prod | P0 | | השוואת ערכים (אדוםacted) |
| VCL14 | `CHECKOUT_ENABLED` קיים ב-Production; ניתן לכבות ל-kill switch | P0 | | |
| VCL15 | `ESCROW_FLOW_ENABLED` לא true ב-Production | P0 | | |
| VCL16 | Cron / scheduled hits ל-`/api/...` עם `Authorization: Bearer $CRON_SECRET` | P0 | | |
| VCL17 | Rollback: Instant Rollback או קידום deployment קודם תוך דקות (מתועד) | P0 | | |
| VCL18 | Protection: Deployment Protection לא חוסם webhooks של Cardcom/Resend בטעות על prod URL | P0 | | |
| VCL19 | Region יציב; אין ניסויי Edge Config פתוחים בלי דגל | P1 | | |
| VCL20 | Speed Insights / Analytics של Vercel אופציונלי; לא תחליף ל-Sentry/GA4 | P2 | | |

### 2.4 Runbook Vercel (יום שיגור)

```
1. Domains + SSL = Valid (סעיפים 1 ו-2.2)
2. Env Production מלא (סעיף 3) כולל Cardcom prod
3. Deploy Production מה-branch המאושר
4. Smoke על https://kenyonexpress.co.il (home, PDP מחיר קופון, cart)
5. אם כשל: CHECKOUT_ENABLED=false ואז Instant Rollback
```

אסור: לשייך דומיין חי ל-Preview; לשים service role תחת `NEXT_PUBLIC_`; להפעיל Escrow.

---

## 3. Env vars (Production)

מקור מחייב לפירוט: `ARCHITECTURE-ENV-SECRETS.md`. סיכום שערי שיגור:

| # | Variable / קבוצה | P | חובה |
|---|---|---|---|
| ENV1 | `NEXT_PUBLIC_SUPABASE_URL` + anon | P0 | תואם פרויקט prod |
| ENV2 | `SUPABASE_SECRET_KEY` (service role) | P0 | **לא** `NEXT_PUBLIC_`; לא demo |
| ENV3 | Cardcom prod set (סעיף 4) | P0 | |
| ENV4 | `RESEND_API_KEY` + `RESEND_FROM` | P0 | |
| ENV5 | `CRON_SECRET` | P0 | |
| ENV6 | `VOUCHER_QR_SECRET` (+ optional PREVIOUS) | P0 | |
| ENV7 | Meilisearch host + key | P1 | חיפוש |
| ENV8 | R2 credentials | P1 | מדיה |
| ENV9 | `SENTRY_DSN` (+ auth token ל-source maps אם בשימוש) | P0 | סעיף 5 |
| ENV10 | `CHECKOUT_ENABLED=true` רק אחרי P0 כסף | P0 | |
| ENV11 | `ESCROW_FLOW_ENABLED` unset או false | P0 | |
| ENV12 | `UNSUBSCRIBE_SIGNING_SECRET` | P1 | notifications |
| ENV13 | Ntfy / admin alert vars | P1 | |

בדיקת דליפה:

```
# Terminal (repo root): אין service role / Cardcom password ב-client bundle
```

| # | בדיקה | P |
|---|---|---|
| ENV14 | אף סוד כסף לא תחת `NEXT_PUBLIC_` | P0 |
| ENV15 | רשימת Production env ב-Vercel תואמת סעיף 3 (צילום / export מושחר) | P0 |

---

## 4. Cardcom production credentials

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| CC1 | מסוף **Production** (לא sandbox) משויך לחשבון הפלטפורמה | P0 | | |
| CC2 | Terminal number + API name/password ב-Vercel Production בלבד | P0 | | |
| CC3 | Low Profile / CreateAndCharge מוגדר עם Success/Fail/Webhook ל-prod host | P0 | | |
| CC4 | Webhook: URL secret + אימות GetLpResult חובה בשרת | P0 | | |
| CC5 | טבלת `cardcom_accounts` (אם multi-account): שורת platform + keys תקינים | P0 | | |
| CC6 | רכישת קופון טסט חיה בסכום מינימלי: charge → finalize → voucher+QR | P0 | | order id |
| CC7 | Replay webhook = no-op (בלי כפילות שוברים) | P0 | | |
| CC8 | סכום ב-Cardcom == `paid_on_site` (מלוא `coupon_price` לקופון) | P0 | | |
| CC9 | קופון אחרי תשלום: `platform_settled`; אין `order_escrow_holds` חדשים | P0 | | |
| CC10 | Refund path על הזמנת טסט מתועד | P1 | | |
| CC11 | Token שמור: יצירה + חיוב חוזר על אותו `cardcom_account_key` | P1 | | |
| CC12 | כשל תשלום לא משאיר `orders.paid_at` | P0 | | |

אסור: להשאיר סיסמאות Cardcom ב-git, ב-Notion ציבורי, או ב-Make/Zapier.

---

## 5. מוניטורינג Sentry

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| SEN1 | פרויקט Sentry ל-prod (Next.js) מחובר; `SENTRY_DSN` ב-Production | P0 |
| SEN2 | Source maps / release name תואמים deployment | P1 |
| SEN3 | Alert: error spike על checkout / payments routes | P0 |
| SEN4 | Alert: unhandled exceptions ב-Edge notifications / webhook | P1 |
| SEN5 | אין PII (PAN, tokens, service role) ב-Sentry breadcrumbs | P0 |
| SEN6 | תגובה ל-SEV: קישור ל-`ARCHITECTURE-INCIDENT-RESPONSE.md` | P0 |
| SEN7 | Ntfy/admin מקבל גם DLQ תשלומים והתראות (משלים ל-Sentry) | P1 |

Smoke אחרי deploy: יצירת שגיאה מבוקרת ב-preview/staging קודם; ב-prod רק אם יש flag בטוח.

---

## 6. גיבויים (Backup / DR)

פירוט מלא: `ARCHITECTURE-BACKUP-DR.md`. שערי שיגור:

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| BAK1 | Supabase PITR / automated backups מופעלים על פרויקט prod | P0 |
| BAK2 | נקודת שחזור אחרונה < 24ש (או לפי מסמך DR) | P0 |
| BAK3 | תרגול restore מתועד (staging) לפחות פעם אחת לפני כסף חי | P1 |
| BAK4 | לפני cutover גדול (WP/migrate): snapshot ידני + חתימה | P0 |
| BAK5 | R2 / מדיה: גרסת bucket או מדיניות retention מתועדת | P2 |
| BAK6 | סודות לא רק ב-Vercel בלי export מוצפן לבעלים | P1 |
| BAK7 | Runbook: מי מריץ restore ב-SEV1 | P0 |

---

## 7. מיגרציות וסכימה

| # | בדיקה | P |
|---|---|---|
| M1 | מיגרציות עד טיפ מאושר הוחלו ב-prod (תהליך מאושר; לא `db push` פראי) | P0 |
| M2 | `platform_percent` NOT NULL על מוצרים חיים | P0 |
| M3 | `coupon_price_ils` תקין לכל קופון חי | P0 |
| M4 | RLS על orders, vouchers, wallet, payment_tokens, carts, profiles | P0 |
| M5 | אין `ESCROW_FLOW_ENABLED=true` | P0 |
| M6 | vouchers / payment_events / cardcom_accounts קיימים אם checkout ממוזג | P0 |
| M7 | קוד `escrow` hold/release לא פעיל ב-tip | P0 |
| M8 | `cardcom_token` לא ב-SELECT ל-authenticated | P0 |

---

## 8. Auth / עגלה / Checkout / קופונים

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| A1 | Guest cart בלי login: הוספה, כמות, הסרה, מיני-קארט | P0 | | |
| A2 | לחיצת "שלם" כאורח → Google OAuth → חזרה ל-`/checkout?resume=1` → העגלה נשמרה (merge) והטופס מולא מחדש | P0 | | |
| A3 | `/account` בלי session מפנה ללוגין; עם session מציג נתוני המשתמש בלבד | P0 | | |
| A4 | RLS חוצה-משתמשים: משתמש A לא רואה orders/vouchers/wallet/tokens של B (בדיקה עם שני חשבונות אמיתיים) | P0 | | SQL כ-authenticated |
| A5 | מחיר קופון זהה בשלוש נקודות: PDP == עגלה == סכום חיוב Cardcom (`coupon_price_ils` מלא) | P0 | | צילומי מסך + שורת payment |
| A6 | עגלה עם מוצר שנמחק / אזל מלאי: השורה מסומנת לא זמינה ולא נחסמת כל העגלה | P1 | | |
| V1 | תשלום קופון מייצר voucher עם קוד + QR תוך שניות, נראה ב-`/account` | P0 | | |
| V2 | סריקה ראשונה מצליחה; סריקה שנייה של אותו QR נדחית עם הודעה ברורה | P0 | | |
| V3 | קופון prepaid: שורת settlement לספק = 0; אין רשומת payout חדשה | P0 | | ledger query |
| V4 | QR עם HMAC שגוי / voucher זר נדחה ב-`/scan` בלי לחשוף פרטים | P0 | | |
| V5 | תוקף: voucher שפג לא נסרק; תזכורת 48ש נשלחת (אם notifications חיות) | P1 | | |

### 8.1 סקריפט smoke ידני (יום שיגור, לפני פתיחת קהל)

```
1. גלישה אנונימית: home → PDP קופון → הוסף לעגלה → /cart
2. "שלם" → Google (חשבון טסט) → חזרה עם עגלה מלאה וטופס מולא
3. תשלום Cardcom prod בסכום מינימלי (כרטיס אמיתי של הבעלים)
4. /checkout/return מציג הצלחה; ההזמנה paid; voucher נוצר
5. /account: הקופון מופיע עם QR
6. /scan (חשבון ספק): סריקה מצליחה; סריקה חוזרת נדחית
7. בדיקת מייל: אישור רכישה התקבל (Resend logs)
8. Refund על הזמנת הטסט ותיעוד שהיתרות חזרו
```

---

## 9. התראות / איכות / אבטחה

### 9.1 התראות (שערים)

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| N1 | `RESEND_API_KEY` רק בשרת/Edge; לא נגיש בדפדפן | P0 | |
| N2 | מייל רכישת קופון נשלח בפועל על הזמנת הטסט (סעיף 8.1 שלב 7) | P0 | |
| N3 | אין Make/Zapier בשום מסלול ייצור | P0 | |
| N4 | Webhook/Trigger כושל נכנס ל-DLQ ולא נעלם בשקט | P1 | |
| N5 | Unsubscribe עובד ולא שובר הודעות תפעוליות (אישורי רכישה נשלחים תמיד) | P1 | |
| N6 | התראת ספק על מכירה נשלחת (אם החלק הזה חי בשיגור) | P1 | |

### 9.2 איכות (שערים)

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| Q1 | `tsc --noEmit` נקי על ה-tip המשוגר | P0 | |
| Q2 | Vitest מלא ירוק (כולל money, split, state machine, cart) | P0 | |
| Q3 | `next build` production מצליח בלי שגיאות | P0 | |
| Q4 | Playwright: מסלול guest cart → checkout ירוק על preview | P0 | |
| Q5 | Lighthouse על home + PDP: performance ו-SEO לא מתחת ליעד המתועד | P1 | |

### 9.3 אבטחה (שערים)

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| S1 | אין service role / סוד Cardcom ב-client bundle (חיפוש ב-`.next/static`) | P0 | |
| S2 | Rate limit על checkout, scan, ו-auth endpoints | P0 | |
| S3 | RBAC: admin routes דורשים role אמיתי, לא רק session | P0 | |
| S4 | עמודי מדיניות: תקנון, פרטיות, החזרים נגישים מה-footer | P0 | |
| S5 | Headers: frame-ancestors מוגבל חוץ מ-return של Cardcom; אין CORS פרוץ | P1 | |
| S6 | לוגים לא מכילים PAN / token / סיסמאות | P0 | |
| S7 | Dependency audit: אין CVE קריטי פתוח בחבילות כסף | P1 | |
| S8 | גישת Supabase Dashboard מוגבלת לבעלים (2FA) | P0 | |

---

## 9.4 72 השעות הראשונות

| מתי | פעולה | אחראי |
|---|---|---|
| שעה 0-1 | מעקב חי: Sentry, Ntfy, Vercel logs; אין deploy חדש | הנדסה |
| שעה 1-24 | בדיקת reconciliation ראשונה: Cardcom מול orders מול ledger | בעלים+הנדסה |
| יום 2 | סריקת DLQ notifications; טיפול בכל הודעה תקועה | הנדסה |
| יום 3 | סיכום: שגיאות, המרות, החלטה על הרחבת קהל | בעלים |

כלל: כל אנומליית כסף (סכום לא תואם, voucher בלי תשלום, webhook כפול שנקלט פעמיים) = עצירת `CHECKOUT_ENABLED` עד הסבר מלא.

---

## 10. Soft-launch מול GA

| שלב | תנאי | קהל |
|---|---|---|
| Soft | כל P0 PASS | ספקים + קונים מבוקרים |
| GA | P0+P1 PASS + KPI בסיסי | ציבור |

יום שיגור:

```
1. Freeze מיזוגים
2. Backup/snapshot (BAK)
3. Deploy Vercel Production
4. Smoke: domain, PDP price, cart, Google pay, Cardcom, voucher, redeem
5. Sentry + Ntfy ירוקים 60 דק׳
6. Soft-launch
```

Rollback: `CHECKOUT_ENABLED=false` → revert deploy → בלי down-migrations הרסניים.

---

## 11. ראיות וחתימות

לכל P0: פקודה+timestamp / לוג / צילום. בלי ראיה = לא PASS.

| תפקיד | שם | תאריך | חתימה |
|---|---|---|---|
| בעלים / כסף | | | |
| הנדסה | | | |
| תוכן/קטלוג | | | |

---

## 12. Revision

| Date | Change |
|---|---|
| 2026-07-31 | צ'קליסט Go-Live P0/P1/P2 |
| 2026-07-31 | rev B: escrow gates, Cardcom, QR, KPI |
| 2026-07-31 | rev C: Domain, Vercel prod, env matrix, Cardcom creds, Sentry, backups |
| 2026-07-31 | rev D: הרחבת דומיין/DNS/SSL + Vercel Domains/Deploy/Rollback (שערי dig/curl) |
| 2026-07-31 | rev E: פירוק סעיפים 8-9 לשערים מלאים (A/V/N/Q/S), סקריפט smoke ידני, סעיף 72 שעות ראשונות |
