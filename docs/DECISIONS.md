# החלטות שהתקבלו בלי אופיר

‏**כל שורה כאן היא הכרעה שנלקחה לבד כי לא הייתה תשובה, וכל אחת מהן
‏"ממתין לאישור אופיר".** המקור: הבלוק `[PROVISIONAL DECISIONS]` ב-
‏`AUTOPILOT-PROMPT.md`.

‏**המסמך הזה מתעד גם היכן הקוד לא תואם את ההחלטה.** החלטה שנרשמה ולא מומשה
היא גרוע יותר מהחלטה שלא נרשמה, כי היא נראית סגורה. ארבע כאלה מסומנות למטה
ב-**‏"פער"**.

| | ההחלטה | מה הקוד עושה בפועל | סטטוס |
| --- | --- | --- | --- |
| ‏**D1** | תוקף שובר 90 יום כשאדמין לא קבע תאריך (הארוך = הבטוח לצרכן) | ‏**בוטלה במכוון.** אין ברירת מחדל בקוד: ‏`coupon_expiry_days` הוא ‏`notNull` בסכימה, נדרש בטופס האדמין למוצר קופון, ו-`finalize.ts:86` מסרב להנפיק שובר בלי הערך. ‏`90` בזריעה הוא נתון דמו ולא נפילה לאחור | ⚠️ **פער** |
| ‏**D2** | ביטול שובר שלא מומש תוך 14 יום: החזר מלא לכרטיס דרך Cardcom; זיכוי לארנק כמסלול מהיר אופציונלי | מסלול ה-refund קיים ונבדק (‏31 בדיקות, מיגרציה 106) | ✅ ממתין לאישור |
| ‏**D3** | שובר שפג ולא מומש: זיכוי אוטומטי לארנק בסכום ששולם, לעולם לא חילוט שקט | תשתית הארנק קיימת | ✅ ממתין לאישור |
| ‏**D4** | ‏Cashback 0% בהשקה; תשתית בנויה, `cashback_rules` מוכנה, שיעור מוגדר באדמין, כבוי כברירת מחדל | ‏`cashback_rules` קיימת בסכימה ובמניפסט ה-RLS | ✅ ממתין לאישור |
| ‏**D5** | ‏מקסימום 5 יחידות למוצר להזמנה, ניתן לעקיפה באדמין | ‏**‏`CART_LINE_MAX_QUANTITY = 99`** ‏(`src/lib/cart/types.ts:103`), ולצדו ולידציית מלאי אמיתית | ⚠️ **פער** |
| ‏**D6** | סריקת ספק דורשת PIN של עובד, עם מסלול ביקורת מלא; ניהול PIN בפורטל הספק | **לא מומש.** אין PIN בשום מסך ספק | ⚠️ **פער** |
| ‏**D7** | שולח מייל `noreply@kenyonexpress.co.il` דרך Resend | מומש בשלושה מקומות, עם `EMAIL_FROM` כעקיפה | ✅ ממתין לאישור |
| ‏**D8** | טלפון/וואטסאפ תמיכה כקבוע `SUPPORT_CONTACT_TBD` בקובץ תצורה אחד | **הקבוע לא קיים.** אין מספר תמיכה בקוד ואין placeholder | ⚠️ **פער** |
| ‏**D9** | זהות משפטית של החברה כ-`COMPANY_LEGAL_TBD` בתנאים ובחשבונית | **הקבוע לא קיים** בשם הזה | ⚠️ **פער** |
| ‏**D10** | ייבוא WP: בנייה והרצה יבשה בלבד. ייבוא אמיתי כבוי עד אישור | נשמר. ‏`docs/WP-IMPORT-REPORT.md` הוא dry-run, ‏`WP_IMPORT_ALLOW_WRITES` הוא השער | ✅ ממתין לאישור |
| ‏**D11** | סדר קטגוריות בבית: לפי groo; נפילה לאחור: מסעדות, ספא, צימרים, תינוקות, אפל | הסדר בפרודקשן נמדד ותועד ב-`DATA-BASELINE.md` | ✅ ממתין לאישור |
| ‏**D12** | שער פיקסלים 11% לכל הדפים; דחיפה ל-7% רק אחרי שלב 26 | נשמר. ראה `docs/PIXEL-WAVE-REPORT.md` | ✅ ממתין לאישור |

## ארבעת הפערים, וההכרעה שנלקחה על כל אחד

### ‏D1 — אין נפילה לאחור של 90 יום, וזה מכוון

‏**ההחלטה הזמנית נכתבה, ואז נדחתה במפורש בקוד.** ‏`finalize.ts` נשא פעם
נפילה לאחור של 90 יום, והיא הוסרה תחת ‏`CONTRADICTIONS C7` עם הנימוק שכתוב
שם: ברירת מחדל שקטה ממציאה הבטחה צרכנית שאיש לא נתן, וגם מכריעה מתי אנחנו
חייבים ללקוח את כספו בחזרה בפקיעה. היום השרשרת אוטמת את החור בשלוש נקודות
בלתי תלויות: ‏`src/db/schema/commerce.ts:68` מגדיר ‏`notNull`,
‏`src/lib/admin/product-form-schema.ts:102` מסרב לשמור מוצר קופון בלי הערך,
ו-`src/server/payments/finalize.ts:86` זורק במקום להנפיק שובר עם תוקף מומצא.
הכישלון שם נבחר להיות רועש וניתן לתיקון: התשלום עומד, ‏finalize חוזר, ואדמין
משלים את השדה.

‏**הכרעה: להשאיר את הקוד ולתקן את המסמך.** המסמך סימן את ‏D1 כמיושמת על סמך
‏`couponExpiryDays: 90` שבזריעה, וזה נתון של מוצרי דמו ולא התנהגות ריצה. הפער
היחיד שנשאר הוא בין נוסח ההחלטה לבין הקוד, ולא בין הקוד לבין עצמו. אם אופיר
רוצה ברירת מחדל של 90 יום בכל זאת, זה שינוי בשלוש הנקודות למעלה ולא בשורה אחת.
צד שני, פחות בולט: ‏`scripts/wp-import/config.mjs` מחזיק
‏`couponExpiryDays: 365` כערך ייבוא, כלומר מספר שלישי שאינו 90 ואינו "אין".
הוא לא נוגע בפרודקשן כל עוד ‏D10 מחזיק את הייבוא ביבש.

### ‏D5 — התקרה היא 99 ולא 5

‏**לא שונתה ל-5, במכוון.** הורדת תקרה במסלול כסף על סמך החלטה זמנית שאיש לא
אישר חוסמת רכישה לגיטימית של מי שקונה שישה פריטים, וזו תקלה שנראית כמו באג
ולא כמו מדיניות. ‏99 הוא גם מה שהסכימה עצמה מגבילה, וולידציית המלאי כבר חוסמת
כל כמות שאין לה כיסוי במדף. ‏**הכרעה: להשאיר 99 ולשאול.** שינוי ל-5 הוא שורה
אחת ב-`src/lib/cart/types.ts` ושלושת המשטחים כבר חולקים אותה דרך
‏`lineQuantityCeiling` ו-`productQuantityCeiling`.

### ‏D6 — אין PIN בסריקת הספק

‏**לא מומש, ולא נבנה עכשיו.** ‏PIN של עובד הוא מנגנון אימות נוסף במסלול שכבר
מוגן ב-RLS לפי `auth.uid()` ובמסך שדורש התחברות ספק. בנייתו בלי החלטה על
ניהול, איפוס, ואורך הוא בדיוק סוג ההרחבה שלא נמדדת. ‏**הכרעה: לתעד כפער ולא
להמציא מדיניות אימות.**

### ‏D8 ו-D9 — הקבועים לא קיימים

‏**לא נוצרו.** ‏`SUPPORT_CONTACT_TBD` ו-`COMPANY_LEGAL_TBD` נועדו להיות
placeholder שמסומן בבירור ומוחלף בקובץ אחד. הם לא נכתבו, וכרגע **אין בקוד
מספר תמיכה כלל** ולא זהות משפטית בשם הזה. ‏**הכרעה: לתעד. יצירת קבוע ריק
שמודפס למשתמש היא הצגת מידע שקרי;** הדבר הנכון הוא לקבל מאופיר את המספר ואת
שם החברה ולכתוב אותם פעם אחת.

## מה עוד הוכרע לבד, מחוץ לרשימה של הפרומפט

1. ‏**התג `v1.0.0` לא הוזז.** הוא קיים מ-10.08 ומצביע על קומיט ישן, ו-`v1.3.0`
   קיים גם הוא. הזזת תג שכבר נדחף היא שכתוב היסטוריה משותפת. קו השחרור בפועל
   הוא `v1.0.0-rc1/rc2/rc3`, והשלמת הפרויקט מתויגת בהמשכו.
2. ‏**הזריעה של 40 מוצרי הדמו לא הורצה על הפרודקשן.** הפרודקשן מחזיק 61 מוצרים
   אמיתיים, וזריעת דמו לצדם מרעה את הקטלוג במקום לשפר אותו. ‏`docs/SEED-REPORT.md`.
3. ‏**‏`opacity: 0` על הגלריה באתר החי לא "תוקן" אצלנו.** ראה שאלה 15
   ב-`QUESTIONS-FOR-OFIR.md`: זו רגרסיה באתר שלהם, והתאמה אליה פירושה להסתיר
   את תמונת המוצר גם אצלנו.

## 2026-09-01: money moves to agorot additively, and six columns stay signed

**Decision.** Migrations `131`–`134` add `<col>_agorot bigint` beside each of the
32 numeric money columns instead of converting them in place with `ALTER TYPE`.

**Why.** Every one of those columns has live readers. An in-place conversion
changes what the same unchanged query returns, from `18.00` to `1800`, so every
price on the site becomes a hundred times itself at the instant of apply, with
no code change to blame it on. Additive means apply is a no-op for the running
app and the cutover happens in the readers, one at a time, under test.

**The six signed columns**, which get no `>= 0` check:

```
wallet_accounts.balance_ils        wallet_balances.balance_ils
wallet_entries.amount_ils          wallet_transactions.amount_ils
profiles.wallet_balance            product_variants.price_modifier
```

The first five are ledger deltas and balances: a debit is negative by
construction. `price_modifier` is signed because a variant may cost less than
the base product.

**This was measured, not assumed.** `wallet_accounts.balance_ils` holds a
minimum of `-1.80` across 13 rows today. A blanket non-negative constraint would
have failed at apply time. That negative balance is flagged as an open question
in `docs/LAUNCH-READINESS.md`; it is not constrained away here.

**Percent columns are not money.** The 25 percent columns stay `numeric`.
Migration `135` bounds the 12 that had no range check to 0..100, and refuses to
run if any of them already holds a value outside that range.
