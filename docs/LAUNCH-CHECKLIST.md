# צ'קליסט עלייה לאוויר: שער ההשקה

עודכן: 2026-10-25 (C15). ענף: `closeout/v1-final`. תג: `v2.0.0`.
מחליף את הגרסה הישנה (זמינה ב-git history). הרצף הפקודתי המלא נשאר ב-`docs/LAUNCH-RUNBOOK.md`.

**כלל המיון:** PUSH NOW = ירוק או ניתן לביצוע אוטומטי, בלי אדם. HOLD = ממתין להחלטה או לגישה שרק אדם יכול לתת.
כל מה שהוחלט לפי הכללים הנעולים (Electro v7, אגורות שלמות, `migrations/pending`, שער 11%) מופיע ב-PUSH NOW, לא ב-HOLD.

## PUSH NOW (ירוק / אוטומטי)

### מוכן ומאומת
- type-check נקי, lint נקי, build ירוק (273 עמודים). בדיקות: 6702 עברו, 2 נכשלו (שערי C39: `ci-action-versions`, `migration-location-gate`), 28 דולגו.
- CI: `.github/workflows/ci.yml` (lint, typecheck, test, build, gates, e2e).
- תגים `v1.0.0-mvp-rc3` ו-`v2.0.0` על origin. תג חדש = `v2.0.N` הבא, בלי force-push.
- קופה: Cardcom במצב mock עובד end-to-end בבדיקות. `CHECKOUT_ENABLED` נשאר `false` בפרודקשן עד שנסגר HOLD 1.
- חשבונאות: אגורות שלמות דרך `src/lib/money.ts`; `platform_percent` נשמר ב-`order_items` בזמן הרכישה.
- RLS: 127 מתוך 127 טבלאות ב-`public` מוגנות (מיגרציות 298 ו-299 הוחלו, `docs/RLS-COVERAGE.md`).
- משפטי: `/terms` (18+ לפי סעיף 2 לחוק הכשרות המשפטית, שיפוט תל אביב), `/privacy`, `/returns` (14ג), `/accessibility` (ת"י 5568). שם משפטי "קניון אקספרס", ח.פ 033798513. 83 בדיקות עוברות.
- נגישות: axe-core ללא הפרות ב-4 סוגי עמוד.
- SEO: 5 סכמות JSON-LD, sitemap, robots.txt.
- אבטחה: rate limits, Turnstile (קוד), CSP, HSTS, gitleaks.
- PWA, Web Push (VAPID), מיילים טרנזקציוניים (8 תבניות RTL), ביטול והחזר, אזור אישי, מועדון, שותפים, קופון מתנה.
- Vercel: הגנת סיסמה על previews + bypass לאוטומציה (C73).
- מובייל: 14 עמודים × 380/390/430 ללא overflow.

### הוחלט (לא ממתין לאיש)
| נושא | החלטה |
|---|---|
| OTP בוואטסאפ (Z12) | `wa.me` בלבד. מסלול Meta Cloud (`src/app/api/auth/wa-otp/send/route.ts`) לא פעיל; OTP במייל. |
| Lighthouse SEO על `/cart` `/checkout` `/account` | `noindex` נשאר בכוונה. השער נמדד על home, מוצר, `/c` בלבד. |
| העברת קופון בין משתמשים (F13) | מחוץ להיקף ההשקה. קופון מתנה (C27) מכסה את הצורך. |
| מוצרים פיזיים | מאחורי feature flag `physical-products`; כתובת משלוח בלבד, בלי חיוב. |
| ביקורות, קישורי Google, רשתות חברתיות | לא קיימים באתר, ולא יתווספו. |

### עבודה אוטומטית שנשארה (מבצע הלולאה)
- G23: Lighthouse מובייל 95+ בבית, מוצר, `/c` (AVIF, lazy-load, subsetting של Heebo).
- שער חזותי `compare.mjs` מתחת ל-11% ב-380 / 768 / 1440 על home, מוצר, `/c`, `/c/<slug>`.
- G28: תג `v2.0.x` על HEAD, ב-origin.
- E2E ירוק פעמיים (נחסם עד כה בגלל timeouts מול Supabase; ממתין ליציבות הסביבה, לא להחלטה).

## HOLD (ממתין לאדם בלבד)

אין לראות בהשקה מוכנה עד שכל סעיף כאן סגור. הפירוט ל-Ofir ב-`docs/MANUAL.md`.

| # | חסם | למה רק אדם | נפתח אחרי |
|---|---|---|---|
| 1 | מפתחות ייצור של Cardcom (`CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET`) | חשבון מסוף בבעלות העסק | `CARDCOM_USE_MOCK=false`, `CHECKOUT_ENABLED=true`, חיוב אמיתי ראשון על כתובת `vercel.app` |
| 2 | DNS של `kenyonexpress.co.il` אצל הרשם | גישה לרשם | האתר החדש באוויר. **רק אחרי** HOLD 1 |
| 3 | `RESEND_API_KEY` תקף | חשבון Resend (נמדד 400 ב-2026-10-11) | מיילי אישור רכישה ושובר |
| 4 | חיבור Supabase MCP / מפתח service role חדש | OAuth ו-2FA של Supabase | החלת מיגרציות ממתינות (ראה MANUAL 4), M13 |
| 5 | Cloudflare Turnstile: יצירת site | דשבורד Cloudflare | הגנת `/checkout` ו-`/supplier/apply` בייצור |
| 6 | פרטי עסק שלא ניתנים להסקה | רק הבעלים יודע | כתובת רשומה, טלפון שירות, מיילי פרטיות ונגישות, מדיניות ספקים (OFIR-MUST-FILL) |
| 7 | `SENTRY_AUTH_TOKEN` | חשבון Sentry | M14. עד אז DONE-DEFERRED |

### מצב מיגרציות
- הוחלו ואומתו: 185, 187, 278, 280, 282, 283, 284, 286, 290, 292, 298, 299.
- עדיין ב-`migrations/pending/` ולא אומתו כמוחלות בייצור: 162, 289, 297 (RLS על `order_items`, **חוסם את C58 בייצור**), 291 (שתי גרסאות), 293 עד 296, 300, 301 ועוד. סדר ההחלה ב-`migrations/pending/APPLY-ORDER.md`. מיגרציה 165 בוטלה לצמיתות.
- ההחלה: Supabase MCP `apply_migration` על `ixvwfbuvfxxsjiywhbbb`, אחת בכל פעם. אף פעם לא `db push`.

### סדר פעולה לאחר שה-HOLD נסגר
1. HOLD 4: להחיל מיגרציות (297 ראשונה).
2. HOLD 1, 3, 5: משתני סביבה ב-Vercel, `redeploy`.
3. חיוב ניסיון אמיתי אחד על `vercel.app`, החזר מלא, בדיקת שובר ומייל.
4. HOLD 2: DNS.
5. `CHECKOUT_ENABLED=true`, שליחת `hey LAUNCH`.
