# CONTRADICTIONS - הכרעות עסקיות סופיות

סטטוס: **RESOLVED** (2026-07-24, הכרעת Ofir).
המסמך הזה גובר על כל נוסח סותר בכל מסמך אחר בפרויקט. כל מספר "ברירת מחדל"
שנשאר במסמך ישן ולא מופיע כאן הוא שריד ואינו מחייב.

| # | הסתירה שהייתה | ההכרעה |
|---|---|---|
| C1 | עמלת פלטפורמה: 5% ב-`047_checkout_settlement.sql`, 10% ב-`026_commerce.sql`, 10% בסקיל cardcom-payments | **אין ברירת מחדל בכלל.** `products.platform_percent` הוא שדה חובה פר-מוצר שהאדמין מזין. `NOT NULL` בלי `DEFAULT`. |
| C2 | שתי עמודות אחוז (`platform_percent` ו-`commission_percent`) | **עמודה אחת: `platform_percent`.** `commission_percent` יוצא משימוש כידית פיצול. |
| C3 | Escrow חיצוני / עסקת J5 מול Cardcom | **אין Escrow חיצוני ואין J5.** ה-held הוא רישום פנימי ב-ledger שלנו בלבד, לקופונים, עד מימוש. |
| C4 | מחיר קופון: נגזרת של אחוז מול שדה חופשי | **מחיר הקופון נקבע פר-מוצר** ומשולם באתר. היתרה משולמת ישירות בבית העסק. |
| C5 | על מה מחושבת העמלה | **על המקדמה בלבד** (הסכום ששולם באתר), לא על ערך הקופון המלא. |
| C6 | קופון שפג בלי מימוש | **קרדיט לארנק הדיגיטלי של הלקוח.** לא הפקעה לטובת הפלטפורמה ולא זיכוי אשראי. |
| C7 | תוקף קופון | שדה `expiry_days` פר-מוצר (30/60/90 או כל מספר אחר). |
| C8 | מועד ה-payout לספק | **T+3 ימי עסקים, ומינימום 100 ש"ח** ליתרה צוברת. מתחת לסף היתרה מתגלגלת. |
| C9 | ספק סליקה / תשלומים / אחסון | **Cardcom + Vercel בלבד.** אין Stripe, אין Payoneer, אין Cloudways. |
| C10 | snapshot של האחוז | `platform_percent` מצולם ל-`order_items` בזמן הקנייה. שינוי האחוז על המוצר לא מזיז דוחות עבר. |

## נוסח אחיד ל-Escrow

> "held" הוא רישום פנימי ב-`commission_ledger` / `wallet_entries` בלבד. הכסף
> יושב בחשבון הסליקה שלנו ב-Cardcom. אין צד שלישי נאמן, אין עסקת J5, ואין
> הקפאת מסגרת אצל הלקוח. ה-held נסגר במימוש הקופון.

## סתירה פתוחה - דורשת הכרעה של Ofir

| # | הסתירה | שתי הגרסאות | למה זה חוסם |
|---|---|---|---|
| **C11** | מי מקבל את מחיר הקופון ששולם באתר, כשה-held נסגר במימוש | **(א)** הפלטפורמה שומרת 100% מהמקדמה, הספק מקבל 0 (גובה את היתרה במזומן בעסק). כך כתוב ב-`BUSINESS-MODEL.md` §א+טבלה, ב-`ARCHITECTURE-COMMERCE.md` §0.3, וכך **ממומש בקוד**: `027_suppliers.sql` יוצר שורות `coupon_redemption` עם `payout_ils = 0`. **(ב)** הפלטפורמה שומרת `platform_percent` מהמקדמה והיתרה משוחררת לספק. זה מה ש-C5 ("העמלה מחושבת על המקדמה בלבד") מרמז עליו. | אם (א) נכון, `platform_percent` חסר משמעות לקופונים והעמלה היא תמיד 100% מהמקדמה. אם (ב) נכון, `payout_ils = 0` ב-027/051 הוא באג כספי. **לא הכרעתי לבד.** עד ההכרעה הקוד והמסמכים נשארים על (א), שהיא ההתנהגות הקיימת. |

## מצב יישום

- [x] מסמכים מיושרים (CHECKOUT-PAYMENT, CARDCOM-ARCHITECTURE, COMMERCE, PROGRESS-CHECKOUT)
- [x] מיגרציה `050_platform_percent_required.sql` (הסרת defaults, `coupon_expiry_days` כשדה התוקף הקנוני)
- [x] C9 מאומת: אין אזכור Stripe / Payoneer / Cloudways בשום קובץ בפרויקט מלבד השורה הזו
- [x] C1/C2 בשאר המסמכים: הוסרו שרשראות ה-fallback ב-`ARCHITECTURE-SUPPLIER-REDEMPTION`, `ARCHITECTURE-WP-MIGRATION`, `ARCHITECTURE-COMMERCE` (O1 נסגרה), `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION` (R1/R2)
- [x] C8 בסכימה: מיגרציה `051_payout_terms.sql` - `add_business_days` / `payout_available_at` (T+3 ראשון-חמישי), `suppliers.min_payout_ils` (100) + `payout_hold_business_days` (3), `generate_payout_statement` אוסף רק שורות שעברו T+3 ומגלגל ריצה מתחת לסף (`cancelled` + `rolled_over`), trigger `enforce_payout_availability` חוסם תשלום מוקדם
- [ ] **051 טרם הוחלה על המרוחק** (כמו 050). דורשת סשן החלה מסודר
- [ ] טופס האדמין: `platform_percent` כשדה חובה + `coupon_expiry_days` (משימה פתוחה, חוסמת את החלת 050)
- [ ] מנוע payout בצד האפליקציה: מסך אדמין שמריץ `generate_payout_statement` ומציג ריצות שהתגלגלו
- [ ] **C11 להכרעה** (ראו למעלה)
