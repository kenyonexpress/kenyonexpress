# NEXT-GOALS — תור ביצוע עד סיום. אחרי כל GOAL: טסטים ירוקים, compare.mjs מתחת ל-11% (לדפי UI), commit+push+עדכון STATE.md, שלח curl -s -d "KenyonExpress goal done, starting next" ntfy.sh/kenyon-ofir-limit, והמשך מיד ל-GOAL הבא בלי לשאול. עצור רק אם קריטי/הרסני. כללים קבועים: RTL, Heebo, צהוב #fed700 hover #fedd26, מחיר אדום #E4002B, container 1320px, touch 44px, כל כסף אגורות integer דרך money.ts, בלי Escrow, בלי אחוז hardcoded — platform_percent דינמי פר מוצר עם snapshot ל-order_items, כל UI רק לפי refs/ke_live_singlefile.html + מדידות refs/. migrations רק דרך MCP apply_migration — לעולם לא db push.

GOAL 1 — Cart: Zustand store guest פתוח, דף /cart (טבלת פריטים, בורר כמות, הסרה, סיכום, כפתור המשך לתשלום), mini-cart dropdown ב-header עם counter, הוסף-לעגלה בדף מוצר ובכרטיסים, תמיכה coupon+physical עם snapshot של platform_percent, Vitest לסכומים.

GOAL 2 — Checkout UI: דף /checkout רב-שלבי — פרטי לקוח, התחברות Google רק בלחיצת שלם, ביקורת הזמנה, סיכום, מצבי שגיאה, RTL מלא.

GOAL 3 — Cardcom integration: multi-account client, יצירת עסקה, webhook signature verification, order state machine, payment_events journal + retry/DLQ, split מיידי לפיזי לפי platform_percent, קופון = גבייה מלאה של מחיר הקופון באתר. תיקון production bug finalize.ts:312 — ALTER TYPE ADD VALUE דרך MCP apply_migration ואז מיגרציות 027+054.

GOAL 4 — Coupon redemption: יצירת קופון אחרי תשלום עם קוד ייחודי+QR, דף /coupon/[id] ללקוח, דף /scan לספק (אימות+סימון נוצל, קופון פג אחרי סריקה), לפי docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md.

GOAL 5 — אזור אישי: /account — פרופיל, היסטוריית הזמנות, הקופונים שלי (פעיל/נוצל/פג), ארנק פנימי (קאשבק לשימוש באתר בלבד), עריכת פרטים.

GOAL 6 — Supplier portal בסיסי: דשבורד ספק — הקופונים שנסרקו, הזמנות פיזיות לשליחה, סטטוסים, לפי docs/ARCHITECTURE-SUPPLIER-PORTAL.md אם קיים.

GOAL 7 — Notifications: Resend + Supabase Trigger + Edge Function — אימייל אישור הזמנה ללקוח, קופון עם QR, התראת מכירה לספק, התראת סריקה.

GOAL 8 — SEO+Performance: metadata דינמי, sitemap, robots, OG images, next/image לכל התמונות, Lighthouse 90+ מובייל.

GOAL 9

<!--
הערה מהסוכן, 2026-07-31.

1. ההודעה שהכתיבה את הקובץ נקטעה בהעברה בדיוק בכותרת "GOAL 9" — לא הגיע
   אחריה שום תוכן. GOAL 1 עד GOAL 8 למעלה הם מילה במילה כפי שנשלחו. GOAL 9
   והלאה לא הומצאו כאן: תור אוטונומי שממציא לעצמו מטרות הוא בדיוק מה שאסור
   לו לעשות. שלח מחדש מ-GOAL 9 והלאה ואוסיף.

2. הקובץ הקודם בשם הזה הוחלף, לא נמחק. הוא מכיל ניתוח שעדיין תקף ובראשו
   החוסם שנתקלתי בו שוב היום: SUPABASE_SECRET_KEY המקומי הוא מפתח
   supabase-demo, ולכן שום add-to-cart, checkout או seed מקומי לא יכול
   להצליח. לשחזור:  git show HEAD~1:NEXT-GOALS.md
-->
