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
- [ ] [6] Notifications: Resend + Supabase Trigger + Edge Function: אישור הזמנה ללקוח, התראת מכירה לספק, קופון נסרק.
- [ ] [7] SEO+Performance: sitemap, meta RTL hebrew, JSON-LD products, next/image, Lighthouse 90+.
- [ ] [8] E2E Playwright: קנייה מלאה קופון+פיזי, סריקה, guest cart.
- [ ] [9] Integration pass: rebase כל ה-branches על main לפי סדר תלויות, טסטים ירוקים, merge, push.

## לוג התקדמות

| שלב | סטטוס | commit | הערות |
|---|---|---|---|
| [1] Cart | ✅ | קיים מ-goal קודם, אומת מחדש | tsc נקי, 932/932 Vitest, compare cart 3.31% (מצב ריק, מפתח service_role חסר למדידת עגלה מלאה) |
| [2] Checkout UI | ✅ | `49e327f`, `2e4b202`, `883a56e` | שלושה שלבים + שלב סיום, טוקנים נאכפים ב-`checkout-tokens.test.ts`, Electro נמדד 18/18 cart ו-11/12 checkout |
| [3] Cardcom | ✅ | `21a348e`, `e184f42` | רובו היה בנוי; DLQ תוקן ונבנה, ה-enum של finalize.ts:312 קיים ב-DB החי ולא נדרש DDL, Cardcom לא חותם על callbacks ולכן re-verify מול GetLpResult הוא האימות |
| [4] Coupon redemption | ✅ | `db33a4c`, `78c752c` | תוקנו ה-QR שלושה מסכים קידדו לא נכון והרשימה שלא הובילה אליו. **הליבה לא הייתה תקינה**: `issueVoucher` כתב `platform_bp`, עמודה שאין בפרויקט המתארח (059 מעולם לא הוחלה שם), ולכן כל INSERT נפל על 42703 ו**אף שובר לא יכול היה להיווצר** - הטבלה ריקה. תוקן בעזרת probe. אומת מול ה-DB החי ב-DO block עם rollback: הנפקה מתקבלת, סריקה מצליחה, סריקה חוזרת נדחית, וכל 10 תרחישי redeem_voucher נכונים. tsc נקי, 1013/1013 |
| [5] אזור אישי | ✅ | `76a631f` | כל הדפים היו קיימים. הארנק הוצג **אפס לכל לקוח**: `balance_agorot` לא קיים בפרודקשן ושני קוראים נקבו בו, כולל הקופה שמחליטה כמה קרדיט אפשר להפעיל. עכשיו probe יחיד לארבעת הקוראים. `fn_wallet_transfer` מוענק ל-service_role בלבד, אין דרך לקוח להזיז כסף. tsc נקי, 1019/1019, build עובר |
