# כללי ההונאה, שורה לכל כלל (‏SECTIONS 57)

נכתב ‏22.09.2026. ‏`docs/FRAUD.md` ‏(סעיף ‏74) מסביר את השכבה ואת הקו המפריד
שלה; המסמך הזה הוא הטבלה: כל כלל, מה הוא סופר, מה הוא עושה, ואיפה הוא חי.
כשמספר משתנה, השורה כאן משתנה איתו.

## 0. הקו המפריד

**מסרבים רק על מה שאפשר לספור ולהקריא ללקוח.** מגבלות מהירות ורשימת החסימה
מסרבות; ציון הסיכון מנתב לבדיקה ולעולם לא מסרב, כי אין לו שיעור בסיס מדוד
‏(‏44 מוצרים פעילים, אפס ‏chargebacks) וסירוב עליו היה דוחה לקוחות אמיתיים
בקצב שאיש לא יכול לנקוב בו.

## 1. מה מסרב

| כלל | סופר | סף | הודעה ללקוח | קוד | איפה |
| --- | --- | --- | --- | --- | --- |
| ‏`declined_payments` | תשלומים שנדחו בשעה האחרונה מהחשבון | ‏5 | "ניסיונות תשלום רבים מדי" | ‏`RATE_LIMITED` | ‏`lib/fraud/velocity.ts` |
| ‏`distinct_cards` | כרטיסים שונים ביממה מהחשבון | ‏5 | כנ"ל | ‏`RATE_LIMITED` | ‏`lib/fraud/velocity.ts` ‏(דורש ‏202) |
| ‏`card_across_accounts` | חשבונות שמחזיקים את אותו כרטיס | ‏2 | כנ"ל | ‏`RATE_LIMITED` | ‏`lib/fraud/velocity.ts` |
| **רשימת חסימה** | אימייל / טלפון / ‏IP / טביעת כרטיס שמפעיל רשם, עם סיבה ותוקף | התאמה פעילה אחת | "לא ניתן להשלים את ההזמנה מהחשבון הזה" | ‏`BLOCKED` | ‏`lib/fraud/blocklist.ts`, ‏`fraud_blocklist` ‏(234) |
| מייל חד-פעמי | דומיין ברשימה | | נחסם בהרשמה | | ‏`lib/fraud/disposable-email.ts` |
| תקרת החזרים | בקשות החזר לאותה הזמנה | ‏3 | הטופס מסרב | | טריגר ‏`fn_refund_request_cap` ‏(202) |

**ההודעה של רשימת החסימה אחידה בכוונה**: הסיבה היא למפעיל, והודעה שנוקבת
בערך שהתאים מלמדת רמאי איזה פרט להחליף. הבדיקה בקופה היא על אימייל החשבון,
כתובת ה-IP וטוקן הכרטיס; טלפון נבדק כשהוא ידוע ‏(כתובת שמורה), ולא נבדק
כשאינו.

## 2. מה מנתב לבדיקה

‏`assessRisk` ב-`lib/fraud/risk-score.ts`. סף בדיקה ‏30, מוגבר ‏15. ההזמנה
נוצרת ומשולמת בכל מקרה; שורה ב-`order_risk_assessments` ‏(202) והתור
ב-`/admin/fraud`.

| סיבה | משקל | סף | מקור |
| --- | --- | --- | --- |
| ‏`card_declines` | ‏40 | ‏≥3 דחיות בשעה | ‏`payments` |
| ‏`card_shared_across_accounts` | ‏35 | ‏≥2 חשבונות | ‏`payment_tokens` |
| ‏`many_cards` | ‏30 | ‏≥3 כרטיסים ביממה | ‏`payment_tokens` ‏(202) |
| ‏`disposable_email` | ‏20 | דומיין ברשימה | ‏`profiles.email` |
| ‏`first_order_high_value` | ‏20 | הזמנה ראשונה מעל ₪500 | ‏`orders` |
| ‏`many_orders_from_ip` | ‏20 | ‏≥5 בשעה מאותו ‏IP | ‏`order_risk_assessments.client_ip` ‏(202) |
| **‏`many_small_orders`** | ‏20 | ‏≥3 הזמנות ששולמו ביממה מתחת ל-₪50 | ‏`orders` |
| **‏`rapid_refund_requests`** | ‏20 | ‏≥2 בקשות החזר בשבוע, כל הזמנה | ‏`refund_requests` ‏(202) |
| ‏`fresh_account` | ‏10 | פחות משעה | ‏`profiles.created_at` |
| ‏`gift_to_stranger` | ‏10 | נמען שאינו בעל החשבון | קלט הקופה |
| ‏`coupon_stack_max` | ‏10 | הנחה+ארנק ‏≥ ‏50% | קלט הקופה |

**תוכנית השותפים (‏Q16, ‏25.09):** ההחלטה ב-`lib/affiliates/commission.ts`
(‏`decideConversion`, טהור), הרישום ב-`server/affiliates/convert.ts` אחרי
תשלום, התור בלשונית "מכירות שותפים" ב-`/admin/affiliates`. עמלה עוברת
לארנק רק משורה ‏`pending`; ‏`flagged` ממתינה לאדם; ‏`rejected` נרשמת ואינה
משלמת.

| סיבה | תוצאה | סף | מקור |
| --- | --- | --- | --- |
| ‏`self_purchase` | נדחה, נרשם | הקונה הוא השותף | ‏`affiliates.user_id` |
| ‏`referral_bonus_paid` | נדחה, נרשם | אותה הזמנה כבר שילמה לשותף בונוס חבר-מביא-חבר | ‏`referrals.referred_first_order_id` |
| ‏`same_device` / ‏`same_ip` / ‏`same_card` | לבדיקה | ‏`fn_referral_fraud_signals(שותף, קונה)` | ‏`referral_signals` ‏(098), מוזן בהצטרפות, בקופה ובתשלום |
| ‏`velocity` | לבדיקה | ‏≥ ‏`max_conversions_per_day` לשותף ב-24 שעות | ‏`affiliate_conversions` ‏(244) |
| ‏`manual_approval` | לבדיקה | הקמפיין דורש אישור | ‏`affiliate_campaigns.require_manual_approval` |
| ‏`budget_exhausted` | לא נרשם | סכום העמלות שהתחייבו + זו > תקציב | ‏`affiliate_campaigns.budget_agorot` |
| ‏`below_minimum` / ‏`affiliate_not_approved` / ‏`no_live_campaign` | לא נרשם | | |

**"אי-התאמה גיאוגרפית" מהסעיף אינה כלל כאן, במכוון:** אין לאתר מקור
גיאוגרפי שנמדד ‏(אין ‏geo-IP, אין מדינת כרטיס מ-Cardcom הישן), וכלל על
נתון שאינו קיים הוא כלל שלעולם לא יורה ונראה ככיסוי.

## 3. התראה

כשהזמנה מגיעה לרצועת ‏`review`, וכשרשימת החסימה מסרבת, נשלחת התראה דרך
‏`sendAlert` ‏(‏ntfy ועותק ל-Slack כשמוגדר, אותו ערוץ של כשלי הכסף) עם
מזהה ההזמנה והסיבות, בלי פרטים אישיים. ב-Sentry זה מופיע כ-`fraud.review_band`
ו-`checkout.blocklist_refused` דרך הלוג המובנה; ‏DSN אינו תנאי לפוש.

## 4. התור והביקורת

‏`/admin/fraud`: הזמנות ברצועת ‏`review` עם הסיבות בעברית, ‏`cleared` /
‏`refunded` / ‏`blocked` עם הערה, כל החלטה ב-`audit_log`. באותו מסך: רשימת
החסימה, הוספה ‏(סוג, ערך, סיבה, תוקף בימים) והסרה עם הערה, כל שינוי
ב-`audit_log`. ערך מנורמל לפני שמירה וחיפוש ‏(‏`normalizeBlockValue`), ולכן
‏`Dana@Example.com` ו-`dana@example.com` הם שורה אחת.

## 5. מה נמדד

- ‏202 ו-234 ממתינות. עד ‏202: הציון מחושב ולא נשמר, ‏`many_orders_from_ip`
  ו-`rapid_refund_requests` מחזירים ‏0, התור ריק ואומר זאת. עד ‏234: רשימת
  החסימה ריקה ‏(הקריאה מטפלת בטבלה חסרה כ"אין התאמות") והמסך מסביר.
- **המשקלים אינם מכוילים לנתונים.** יש לכוונן מול ‏chargebacks כשיהיו, ולרשום
  כאן את התצפית שהזיזה מספר.
