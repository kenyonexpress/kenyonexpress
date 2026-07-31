# NEXT-GOALS.md

תור ביצוע סדרתי (עדכון אחרי כל שלב: סימון ✅ + commit+push + עדכון STATE.md).

כללים: בלי Escrow, בלי אחוז hardcoded, `platform_percent` דינמי מצולם, קופון = גבייה מלאה של מחיר הקופון באתר, כסף באגורות integer דרך
`src/lib/commerce/money.ts`
מיגרציות רק דרך MCP `apply_migration` (לא `db push`). אחרי כל שלב: ntfy ל-
`ntfy.sh/kenyon-ofir-limit`

## התור

- [x] ✅ [1] Cart: Zustand guest cart, אגורות integer דרך money.ts, דף `/cart` RTL (טבלת פריטים, מחיר `#E4002B`, בורר כמות 44px, הסרה, סיכום, כפתור צהוב `#fed700` hover `#fedd26`, Heebo, container 1320px), mini-cart dropdown ב-header עם counter, "הוסף לעגלה" בדף מוצר וכרטיסים, snapshot של `platform_percent` לפריט, שני סוגים coupon/physical, בלי Escrow ובלי hardcoded, Vitest, compare.mjs מתחת ל-11%.
- [x] ✅ [2] Checkout UI: דף `/checkout` RTL: שלבים, טופס פרטים עם Zod, ביקורת הזמנה, בחירת תשלום, Google login רק בלחיצת "שלם", עיצוב Electro.
- [x] ✅ [3] Cardcom integration: לפי `docs/ARCHITECTURE-CHECKOUT-CARDCOM-VERIFICATION.md` אבל בלי Escrow: multi-account client, webhook signature, order state machine, payment_events migration דרך MCP apply_migration בלבד, split מיידי לפיזי לפי `platform_percent`, קופון = גבייה מלאה באתר, token כרטיס שמור, תיקון enum finalize.ts:312 במיגרציה ALTER TYPE ADD VALUE.
- [x] ✅ [4] Coupon redemption: יצירת קוד+QR אחרי תשלום, דף `/coupon/[id]` ללקוח, דף `/scan` לספק, פג אחרי סריקה, סטטוסים, RLS.
- [x] ✅ [5] אזור אישי `/account`: פרופיל, היסטוריית הזמנות, הקופונים שלי עם QR, ארנק פנימי (קאשבק לשימוש באתר בלבד).
- [x] ✅ [6] Notifications: Resend + Supabase Trigger + Edge Function: אישור הזמנה ללקוח, התראת מכירה לספק, קופון נסרק.
- [x] ✅ [7] SEO+Performance: sitemap, meta RTL hebrew, JSON-LD products, next/image, Lighthouse 90+.
- [x] ✅ [8] E2E Playwright: קנייה מלאה קופון+פיזי, סריקה, guest cart. **58/58**.
- [x] ✅ [9] Integration pass: rebase כל ה-branches על main לפי סדר תלויות, טסטים ירוקים, merge, push.

## החלטות שהתקבלו אוטומטית: מה נשאר מ-[9]

שתי ההחלטות שהיו פתוחות הוכרעו, בלי לשאול, לפי ההוראה הקבועה.

**`main`:** מוזג ב-`-s ours`. הקומיט היחיד שלו הוא 153,834 שורות של
`refs/`, `playwright-report/` ו-`supabase/.temp/`, אפס קוד. עכשיו הוא אב
קדמון בגרף ולא יורד ממנו קובץ אחד.

**7 branches של `feat/*`:** שלושה מוזגו, ארבעה לא, וכל אחד עם סיבה
נמדדת ולא עם הערכה.

| branch | הכרעה | למה |
|---|---|---|
| `feat/ci-foundation` | ✅ מוזג | שער per-diff נגד ערכים קשיחים, ובדיקות השמירה של מנוע העמלות |
| `feat/observability` | ✅ מוזג | Sentry, ולידציית env בעליה, התראת כסף לטלפון |
| `feat/wp-migration` | ✅ מוזג | מפת ה-301/410 של כתובות ה-WordPress. בלעדיה כל האתר המאונדקס נופל ל-404 ביום המעבר |
| `feat/checkout-cardcom` | ❌ לא | מביא `escrow.ts`, בניגוד לכלל הקבוע. מתנגש ב-11 קבצי ליבת תשלומים ש-GOAL 3 בנה מחדש |
| `feat/visual-polish` | ❌ לא | 44 קבצי UI מ-28.07 שידרסו עיצוב שנמדד מול האתר החי (compare מתחת ל-11%, Electro 18/18) |
| `feat/growth-core` | ❌ לא, עדיין | **באג כסף מוכח**: מכפיל `view.subtotal` ב-100, בעוד שמ-GOAL 1 הערך כבר באגורות. ה-DB שלו כבר חי בפרודקשן |
| `feat/search-core` | ❌ לא, עדיין | דורש Upstash QStash שלא הוקם, ומיגרציה 069 שמעולם לא הוחלה |

## לוג התקדמות

| שלב | סטטוס | commit | הערות |
|---|---|---|---|
| [1] Cart | ✅ | קיים מ-goal קודם, אומת מחדש | tsc נקי, 932/932 Vitest, compare cart 3.31% (מצב ריק, מפתח service_role חסר למדידת עגלה מלאה) |
| [2] Checkout UI | ✅ | `49e327f`, `2e4b202`, `883a56e` | שלושה שלבים + שלב סיום, טוקנים נאכפים ב-`checkout-tokens.test.ts`, Electro נמדד 18/18 cart ו-11/12 checkout |
| [3] Cardcom | ✅ | `21a348e`, `e184f42` | רובו היה בנוי; DLQ תוקן ונבנה, ה-enum של finalize.ts:312 קיים ב-DB החי ולא נדרש DDL, Cardcom לא חותם על callbacks ולכן re-verify מול GetLpResult הוא האימות |
| [4] Coupon redemption | ✅ | `db33a4c`, `78c752c` | תוקנו ה-QR שלושה מסכים קידדו לא נכון והרשימה שלא הובילה אליו. **הליבה לא הייתה תקינה**: `issueVoucher` כתב `platform_bp`, עמודה שאין בפרויקט המתארח (059 מעולם לא הוחלה שם), ולכן כל INSERT נפל על 42703 ו**אף שובר לא יכול היה להיווצר** - הטבלה ריקה. תוקן בעזרת probe. אומת מול ה-DB החי ב-DO block עם rollback: הנפקה מתקבלת, סריקה מצליחה, סריקה חוזרת נדחית, וכל 10 תרחישי redeem_voucher נכונים. tsc נקי, 1013/1013 |
| [5] אזור אישי | ✅ | `76a631f` | כל הדפים היו קיימים. הארנק הוצג **אפס לכל לקוח**: `balance_agorot` לא קיים בפרודקשן ושני קוראים נקבו בו, כולל הקופה שמחליטה כמה קרדיט אפשר להפעיל. עכשיו probe יחיד לארבעת הקוראים. `fn_wallet_transfer` מוענק ל-service_role בלבד, אין דרך לקוח להזיז כסף. tsc נקי, 1019/1019, build עובר |
| [6] Notifications | ✅ | `9a0ed6e` | מיגרציה 095 הוחלה: `notification_outbox` + טריגר על `orders.paid_at` (אישור ללקוח + התראה לכל ספק) וטריגר על `vouchers.status` (קופון נסרק). שני הטריגרים בולעים שגיאות ולכן לא יכולים להפיל חיוב או מימוש. ניקוז ב-`/api/cron/notifications` דרך Resend, backoff ו-dead אחרי 5. **בלי Edge Function**: `pg_net` לא מותקן, וה-outbox הוא מה שנותן את העמידות. אומת בפרודקשן ב-DO block עם rollback. tsc נקי, 1038/1038, build עובר |
| [7] SEO+Performance | ✅ | `1ed4f18`, `019ac3e` | sitemap ו-robots כבר היו, וכך גם `lang="he" dir="rtl"`. **JSON-LD לא היה בכלל** ונבנה: Product+Offer ו-BreadcrumbList במוצר, Organization+WebSite בבית. המחיר נגזר מ-`CouponOffer`, אותו אובייקט שמנוע העמלות מחייב לפיו. נוסף canonical ו-OpenGraph. Lighthouse על ה-build, desktop: בית **90/93/96/100**, מוצר **97/97/96/92**. הביצועים עלו מ-86 אחרי שהמדידה הראתה שכרטיסי הדילים מושכים כל תמונה בגודל המקור |
| [8] E2E Playwright | ✅ | `18a48f7` | **58/58**, פעמיים: worker אחד, ואז 2 workers מול `pnpm start` טרי. היה 48/10. החוסם לא היה המפתח החסר אלא **מי שדרש אותו**: העגלה רצה על `createAdminClient()` כדי לקרוא קטלוג ציבורי ולגעת בשורת עגלה אחת, ולשניהם כבר יש מדיניות. הועברה ל-anon, כולל `Cookie: session_id` שעליו המדיניות של `carts` בנויה. אומת מול פרודקשן לפני שנכתבה שורה, והשורות נמחקו. בנוסף 4 ספקים שהיו שגויים ולא ביש-מזל |
| [8] E2E Playwright (סבב קודם) | ⚠️ | `1d09184` | הסוויטה קיימת ומכסה את הנדרש (purchase-flow, coupon-scan, cart). תוקנו 4 ספקים שעדיין דרשו את שער ה-checkout שהוסר בכוונה ב-GOAL 2. **48 עוברים, 10 נופלים מסיבה אחת שאינה הקוד**: ה-`SUPABASE_SECRET_KEY` ב-`.env.local` מחזיר 401, וכל כתיבת עגלת אורח עוברת דרך admin client. שוחזר ישירות מול ה-REST API. חסום עד שיוחלף מפתח. **01.08:** הורץ מחדש מול ה-build אחרי 3 המיזוגים, שוב 48/10 בדיוק, כלומר אפס רגרסיה. כל 10 הנופלים דורשים עגלת אורח מלאה. חיפוש מפתח תקין ב-4 דרכים (MCP, `.env.local`, `.env.test`, CLI/Vercel) העלה חרס: `.env.test` מחזיק מפתח של ref אחר לגמרי וגם פג |
| [9] Integration pass | ✅ | `06bfc33` ואחורה | שתי ההחלטות הוכרעו: `main` מוזג ב-`-s ours` (אפס קבצים ירדו ממנו), ו-3 מתוך 7 `feat/*` מוזגו (ci-foundation, observability, wp-migration). 4 לא, כל אחד עם ראיה נמדדת. 1132 בדיקות, tsc נקי, build נקי |
| [9] Integration pass (סבב ראשון) | ⚠️ | `5ae8298` ואחורה | **22 branches מוזגו**: כל `arch/*` וגם `feat/checkout-complete`, כולם תיעוד בלבד. 93 מסמכי ארכיטקטורה על ה-branch, אפס שורות קוד השתנו, 1055 בדיקות ירוקות. **8 לא מוזגו במכוון**: 7 branches של `feat/*` נושאים 11 עד 44 קבצי קוד מ-27 עד 30.07, ו-`main` שהקומיט היחיד שלו הוא צ'קפוינט של 153,834 שורות artifacts. שניהם דורשים החלטה של אופיר, לא מיזוג עיוור |
