=== מצב אוטונומי מלא: KenyonExpress ===

אתה על Fable 5. עבוד ברצף מלא בלי לעצור עד סיום כל התור.

עצור אך ורק אם: (1) push לפרודקשן/דומיין חי, (2) מחיקת DB או קבצים מחוץ ל-repo, (3) הרצת apply_migration — במקום זה כתוב את קובץ המיגרציה ל-supabase/migrations, סמן ב-STATE.md "ממתין לאישור אופיר", והמשך הלאה, (4) סתירה במודל העסקי הנעול. כל דבר אחר — החלט לבד, בחר את הפתרון המתקדם ביותר, תעד בשורה אחת ב-STATE.md, והמשך.

אסור: לשאול שאלות, לחכות לאישור, לכתוב הודעות סיכום בין goals, לעצור "לבדוק". goal מסתיים = commit + push + עדכון STATE.md כולל שורת "המשך מ: [נקודה מדויקת]" + עדכון NEXT-GOALS.md (מחק מה שהסתיים) + curl -s -d "goal הסתיים: [שם]" ntfy.sh/kenyon-ofir-limit = מיד ה-goal הבא, בלי הפסקה.

חידוש מכסה / הפעלה מחדש ע"י kenyon-loop.sh: קרא STATE.md, מצא "המשך מ:", המשך משם בלי שאלות ובלי לחזור על עבודה שנעשתה.

משימה שנכשלת 3 פעמים: רשום ב-STATE.md תחת "חזור אליה", דלג, חזור אליה אחרי 10 משימות.

חוקים קבועים (חלים על כל goal):
- אין Escrow בשום מקום. עמלה דינמית platform_percent פר מוצר, מצולמת ל-order_items בזמן קנייה.
- קופון: לקוח משלם את `products.coupon_price_ils` באתר. זהו **סכום מוחלט** באגורות
  שהאדמין קובע פר מוצר, לא אחוז, ואין לו ברירת מחדל בשום מקום. היתרה משולמת
  במזומן בבית העסק בסריקה ואינה עוברת דרך הפלטפורמה. כל מה שנגבה באתר שייך
  לפלטפורמה לצמיתות. השובר פג אחרי סריקה.
- כל כסף = אגורות integer דרך money.ts. אסור floats.
- UI אך ורק מ-refs/ke_live_singlefile.html או האתר החי. שער compare.mjs < 11% לכל דף.
- Header: לוגו + 3 אייקונים בלבד. אין בורר אזור, אין search.
- אסור db push. מיגרציות = קובץ + "ממתין לאישור" בלבד.
- TypeScript strict, Vitest לכל לוגיקה, biome נקי.
- אתה ה-goal היחיד שכותב קוד ב-repo. Cursor רק docs ב-worktree נפרד.
- Guest Cart פתוח, Google login רק ב"שלם". אין reviews בדף מוצר.

התור (רצף):
1. Cart — Zustand store, coupon/physical, persistence + SSR hydration בטוח, mini-cart drawer, דף /cart מלא RTL לפי refs, Vitest, compare < 11%.
2. Checkout UI — /checkout RTL, zod, Guest→Google login ב"שלם", מצבי טעינה/שגיאה, interface מוכן ל-Cardcom, Vitest.
3. Cardcom multi-account — תיקון finalize.ts:312 (מיגרציית enum לקובץ + "ממתין לאישור"), client לפי `docs/CARDCOM-ARCHITECTURE.md` אבל בלי Escrow, webhook עם אימות מול Cardcom API, state machine חד-כיווני, idempotency, payment_events, טסטים עם mocks.
4. Coupon redemption — קוד ייחודי + QR אחרי תשלום, דף ספק לסריקה, מימוש אטומי חד-פעמי, סטטוסים לפי ה-enum החי `voucher_status`: `issued`, `redeemed`, `expired`,
   `cancelled`, `refunded`. **אין `active`.** כל מצב שאינו `issued` הוא סופי, תצוגת לקוח, Vitest.
5. אזור אישי — /account: הזמנות, קופונים עם QR, פרטי חשבון, ארנק פנימי קריאה בלבד, auth, RTL לפי refs.
6. SEO + Performance — metadata דינמי, JSON-LD, sitemap, next/image, Lighthouse 90+ mobile, דוח ב-STATE.md.
7. Playwright E2E — בית→מוצר→עגלה→checkout (mock)→מימוש→אזור אישי, RTL assertions, CI.
8. Integration pass — rebase הכל על main לפי תלויות, טסטים ירוקים, type-check, biome, merge, push, STATE.md סופי.

אם STATE.md מראה שחלק כבר הסתיים: דלג עליו והמשך מהנקודה האמיתית.

‏**עדכון 01.09.2026: שמונת הסעיפים בתור הזה הושלמו.** ‏PR #6 מוזג, ‏`main` הוא
הענף היחיד, והפרויקט מחכה להפעלת DNS ידנית שאופיר מאשר. אל תריץ את התור הזה
מחדש. קרא את `STATE.md` תחת `## המשך מ:` וקח את ה-goal הראשון בתור שם.

‏**תיאור המערכת כפי שהיא בפועל, נמדד מול הפרודקשן:**
`docs/ARCHITECTURE-OVERVIEW.md`. הוא גובר על כל מסמך אחר ב-`docs/`.

התחל עכשיו.
