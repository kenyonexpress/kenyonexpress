/**
 * "How it works", as a page that has never had a route in this repository.
 *
 * `/about` explains what the business is and `/faq` answers questions one at a
 * time. Neither one walks a person who has not bought here yet through the four
 * things that happen between pressing "buy" and standing at a counter, and that
 * walk is the page a first-time buyer looks for.
 *
 * The rule from `content/about.ts` applies without exception: every sentence
 * describes behaviour that exists in the code today. Prepayment and balance at
 * the counter, a signed QR issued per unit by `finalizeOrder`, a single
 * redemption checked in the database rather than on the scanning device,
 * validity from a mandatory per-product field with no default, and the nightly
 * job that credits the wallet when an unredeemed coupon expires. No delivery
 * times, no business hours, no commission rate: none of those is knowable here.
 *
 * This is the SEED for the `how-it-works` content page and the fallback the
 * route renders until migration 205 is applied. Once it is, the operator edits
 * the row and this text stops being what visitors read.
 */

export const HOW_IT_WORKS_TITLE = 'איך זה עובד'

export const HOW_IT_WORKS_DESCRIPTION =
  'ארבעה שלבים מרכישת דיל בקניון אקספרס ועד המימוש בבית העסק: תשלום מקדים, שובר עם QR, סריקה חד-פעמית, ותוקף שנגמר בזיכוי ולא בחילוט.'

export const HOW_IT_WORKS_BODY = `בקניון אקספרס קונים דיל של בית עסק ישראלי ומממשים אותו אצלו. התשלום נעשה כאן, השירות ניתן שם, והשובר הוא מה שמחבר בין השניים.

## 1. בוחרים דיל ומשלמים כאן

המחיר שמוצג בדף המוצר הוא התשלום המקדים. הוא נגבה בעת הרכישה דרך חברת הסליקה, ואנחנו לא שומרים מספרי כרטיס אשראי אצלנו.

אם לדיל יש יתרה שמשולמת בבית העסק, הסכום מופיע בדף המוצר **לפני** התשלום, ושוב על השובר עצמו. אין סכום שמתגלה רק בקופה.

## 2. מקבלים שובר לכל יחידה

מיד אחרי התשלום מונפק שובר אישי לכל יחידה שנרכשה, עם קוד QR חתום. השוברים מחכים באזור האישי תחת [הקופונים שלי](/account/coupons), ונשלחים גם במייל.

- שובר לכל יחידה, ולא שובר אחד לכל ההזמנה: מי שקנה שניים יכול לתת אחד במתנה.
- הקוד חתום, ולכן שובר שהומצא ביד נדחה בסריקה.

## 3. מציגים בבית העסק, והוא נסרק פעם אחת

בבית העסק סורקים את ה-QR. הבדיקה שהשובר לא מומש כבר נעשית **במסד הנתונים ברגע הסריקה**, ולא במכשיר שסורק, ולכן צילום מסך של שובר שכבר מומש נדחה גם הוא.

אם נותרה יתרה לתשלום, היא נגבית בבית העסק ולא דרכנו.

## 4. תוקף שנגמר מזכה ולא מחלט

לכל דיל תקופת תוקף משלו, שנקבעת מראש ומוצגת לפני הרכישה. אין ברירת מחדל: דיל בלי תוקף מוגדר אינו מנפיק שובר בכלל.

שובר שלא מומש עד תום התוקף אינו מאבד את הכסף. בדיקה לילית מזכה את הארנק שלכם באתר בסכום ששולם עליו, ולפני כן נשלחות תזכורות - שבוע לפני ויום לפני.

> פקיעה אינה חילוט. הכסף חוזר לארנק וניתן להוציא אותו על דיל אחר.

## ביטולים והחזרים

ביטול עסקה נעשה לפי חוק הגנת הצרכן. הזכויות, דמי הביטול והחריגים מפורטים ב[מדיניות הביטולים](/legal/returns), ושאלות נוספות נענות ב[שאלות נפוצות](/faq).`
