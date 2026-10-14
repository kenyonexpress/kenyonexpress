# -*- coding: utf-8 -*-
# UX10: prepend the Updated line, demote the previous one, add the decisions block.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()

updated = (
    "Updated: 2026-10-14 14:25 (UX10 קופונים חמים (‏`HotCoupons` + ‏`CouponCard`): כרטיס-טיקט, כפתור העתקת קוד, טיימר לסיום, ‏1/2/4 עמודות בגובה שורה אחיד. "
    "**נמדד לפני** (‏logs/ux10/before.json, ה-build הקיים של ‏fa3191dfe ב-3346): הכרטיס היה ‏`<a>` אחד סביב פס תמונה אפור ‏128px (לאף דיל אין תמונה), צ'יפ "
    "\"90% הנחה\" ברדיוס ‏25px (רדיוס המודאל, כמו ש-UX07/08 מצאו), ‏2 עמודות ‏159px בטלפון ו-4 עמודות ‏158px ב-768, שני גבהים ב-380 (‏286.3/305.5), בלי טיימר ובלי קוד. "
    "**נמדד בפרודקשן** (קריאה בלבד, ‏management API): ‏8 דילים פעילים, לאף אחד ‏valid_until, אין עמודת ‏code; ‏`coupons` ו-`discount_campaigns` עם ‏0 שורות פעילות ושתיהן ‏admin-only ב-RLS, "
    "ולכן אף טבלת קודי-עגלה לא יכולה להזין את הסקשן. **עכשיו**: ‏`<article class=\"coupon-ticket\">` ולא קישור: ‏stub צהוב ‏72px עם האחוז כמספר נקי ‏22px/800 מעל \"הנחה\", "
    "פרפורציה מקווקוות עם ‏notch ‏18px בכל קצה (‏pseudo-elements על הקו, נחתכים ב-overflow), גוף עם העסק, הכותרת כקישור לדיל (‏2 שורות שמורות), מיקום, פיצול מחיר, שורת היתרה, "
    "ו-footer מוצמד לתחתית עם שני הרכיבים שמורכבים רק על נתון שמצדיק אותם: ‏`CouponCountdown` ל-`valid_until` תקין (\"מסתיים בעוד 3 ימים 04:12:33\", תקתוק שנייה מהשעון של המבקר, "
    "ריק-אבל-מעוצב בשרת, ‏data-urgency ‏soon/today/ended, \"המבצע הסתיים\" עם טיימר עצור אחרי הדדליין, ושום טענת דחיפות בלי דדליין) ו-`CopyCouponCode` לשורה עם ‏code "
    "(הקוד תמיד גלוי ב-`<code dir=ltr>` בתוך הכפתור, ‏clipboard.writeText, \"הקוד הועתק\" ל-2 שניות, ובסירוב הקוד נבחר על המסך עם \"העתיקו ידנית\"); בלי קוד: קישור \"לפרטי הקופון\" באותה קופסה ‏44px. "
    "הקוד הוא ‏`coupon_deals.code`, **מיגרציה 270 ממתינה** (עמודה אחת ‏nullable עם ‏CHECK ‏`^[A-Z0-9]{4,16}$` ואינדקס ייחודי חלקי, בלי שינוי ‏policy; רשומה ב-README, ‏APPLY-ORDER וב-inventory test), "
    "נקראת בבית דרך ‏`readOptionalColumns` (קיבל פרמטר ‏remedy כדי שהאזהרה תנקוב ב-270 ולא ב-054) כך שה-DB המארח עונה \"אין קוד\" במקום ‏42703; טופס האדמין קיבל שדה, והפעולה כותבת אותו "
    "ומנסה שוב בלי העמודה ב-42703 כשהשדה ריק ומסרבת עם \"קוד קופון דורש את מיגרציה 270\" כשלא. קריאת הבית בוחרת גם ‏valid_until ומסננת דיל שפג (‏`or` דרך ‏sanitizeOrTerm לשער ה-parameterized-queries); "
    "‏/coupons עבר ל-1/2/3 עמודות עם skeleton שמשקף את הטיקט. ‏`.hot-coupons__grid` הוא ‏1/2/4 ב-0/768/1200 עם ‏`grid-auto-rows: 1fr`. הצורה היא של הפרויקט (לא לחי ולא ל-Electro יש כרטיס קופון). "
    "**נמדד אחרי** (‏after.json): ‏1/2/4 עמודות, כל כרטיס ‏220 גובה בשלושת הרוחבים, ‏330/329/278.5 רוחב, ‏12px פינות, ‏stub ‏72x218 צהוב, \"90%\" ‏22px/800, ‏2 קישורים ו-0 כפתורים (אין קוד בפרודקשן). "
    "נעוץ ב-coupon-countdown.test.ts (7), ‏CopyCouponCode.test.tsx (5), ‏CouponCountdown.test.tsx (5), ‏CouponCard.test.tsx (8), ‏HotCoupons.test.tsx (2), ‏below-fold.test.ts (+2) "
    "ו-e2e/hot-coupons.spec.ts (‏8/8 + ‏2 skipped ב-chromium + mobile-chrome; בדיקת ה-clipboard מדלגת עד שיש שורה עם קוד). שערים: ‏vitest ‏832 קבצים / ‏9693 ירוקים, ‏type-check ו-lint נקיים, "
    "‏build ירוק (‏rm -rf .next, פעמיים), שער הבית ‏2.22 / 1.24 / 1.32 (ללא שינוי). שכני ‏e2e (‏home-rtl, touch-targets, a11y, home בשני הפרויקטים): ‏64 נכשלים, קבוצה זהה לשל ‏UX08 "
    "(‏logs/ux10/neighbours-diff.txt). הפירוט ב\"החלטות שהתקבלו לבד (UX10)\". המשך מ: ‏UX11)"
)

decisions = (
    "**החלטות שהתקבלו לבד (UX10, 14:25):** (1) **מקור הנתונים נשאר ‏`coupon_deals`**: נמדד בפרודקשן ש-`coupons` ו-`discount_campaigns` ריקות ו-admin-only ב-RLS, "
    "ולכן \"קוד להעתקה\" מטבלת קודי-עגלה היה סקשן ריק לנצח או חשיפה של קודים פרטיים. (2) **קוד אמיתי ולא קוד מומצא**: לא נגזר \"קוד\" מה-uuid (אף אחד לא מאמת אותו); במקום זה "
    "עמודה חדשה ‏`coupon_deals.code` ב-`migrations/pending/270` (לא הוחלה, לפי הכלל), והקריאה בבית סובלת את היעדרה דרך ‏`readOptionalColumns` כמו ש-similar-coupons עושה ל-054. "
    "(3) **בלי דדליין אין טיימר ואין מקף**: הטיימר מורכב רק על ‏valid_until תקין, לפי כלל חוק הגנת הצרכן שכבר כתוב ב-`coupon-expiry.ts`; ‏8 הדילים היום בלי דדליין ולכן הסקשן מציג "
    "קישור לפרטים ולא טענת דחיפות. (4) **הכרטיס הפסיק להיות קישור**: כפתור בתוך ‏`<a>` אינו תקין; הכותרת היא הקישור, התמונה (כשיש) קישור שני ‏aria-hidden, וכל פקד ‏44px "
    "(‏touch-targets מודד ‏/ ב-375). (5) **צורה של הפרויקט**: לחי אין כרטיס קופון (‏live-home-sections.test.ts) ול-Electro אין בלוק קופונים; נבנה מהטוקנים הקיימים + ‏`--spacing-coupon-stub/notch`. "
    "(6) **‏1/2/4 ב-0/768/1200 כמו רשת הדילים** ולא ‏2/4: ‏159px לא מכילים ‏stub + קוד + טיימר; ‏/coupons ל-1/2/3. (7) **שער ה-parameterized-queries נפל פעם אחת** על ‏`${now}` ב-`.or()` "
    "ותוקן דרך ‏`sanitizeOrTerm` (מחרוזת ‏ISO עוברת ללא שינוי); ‏lint נפל פעם אחת על פורמט ותוקן ב-`biome --write`. (8) **‏Supabase MCP לא מאושר בסשן**: המדידה בפרודקשן נעשתה "
    "קריאה-בלבד דרך ה-management API עם הטוקן של ה-CLI; שום כתיבה. (9) **הכפתור המועתק לא נבדק ב-e2e** כי אין שורה עם קוד בפרודקשן; הבדיקה מדלגת בשם ‏270 ומכוסה ביחידה "
    "(‏clipboard מאושר/מסורב/חסר). (10) **גיבוי ‏tar לדסקטופ** נוסה בסוף השלב; ראו ‏`ls` בלוג. (11) **השרת על ‏3346 נהרג לפי ‏PID של ה-listener** לפני כל ‏build."
)

lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX09'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
