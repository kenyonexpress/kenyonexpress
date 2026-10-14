# -*- coding: utf-8 -*-
# UX11: prepend the Updated line, demote the previous one, add the decisions block.
import io
p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
updated = (
    "Updated: 2026-10-14 15:00 (UX11 שורת בתי העסק (‏`BrandsRow`): רשת לוגואים, אפור כברירת מחדל וצבע ב-hover, גלילה אופקית בטלפון. "
    "**נמדד לפני** (‏logs/ux11/before.json): אין שום משטח מותגים בדף הבית באף רוחב; המקום היחיד שלוגו ספק הופיע בו הוא כרטיס ‏/merchants, קופסה ‏80x80 בצבע מלא (‏7 כרטיסים, ‏1 לוגו). "
    "**נמדד בפרודקשן** (‏REST אנונימי, קריאה בלבד): ‏7 ספקים פעילים, לכולם מוצר פעיל, בדיוק ל-`logo_url` אחד (שורת הספק של הפלטפורמה עצמה, ‏`/images/logo.webp`); ‏`suppliers` נקראת ב-anon ‏200 בפרודקשן (‏13 שורות). "
    "**עכשיו**: ‏`BrandsRow` נבנה מספריית בתי העסק עצמה (אותן שתי קריאות ואותו ‏builder טהור של ‏`/merchants`, דרך ‏`getHomeBrands` ב-`below-fold.ts` שלעולם לא זורק, ו-`pickBrandTiles` ב-`below-fold-rules.ts`: רק עסקים עם מוצר למכירה, לוגואים קודם, לוגו רק כש-`isAllowedImageUrl` מקבל אותו ואחרת השם כ-wordmark), מורכב אחרי ‏HotCoupons ומתחת ל-2600px של השער. "
    "צורה מתא המותג של ‏Electro (‏refs/electro-home-v7_computed.json: ‏5 תאים ‏234x50 ב-1170, תמונה ‏167x50), תוכן מה-DB: מתחת ל-768 פס גלילה של אריחי ‏150px (‏snap, בלי scrollbar, המתכון של ‏benefit-bar), מ-768 רשת ‏3 עמודות ומ-1200 ‏5, כל אריח ‏80 גובה וקישור אחד ל-`/s/[id]`; לוגו ‏`grayscale(1)` ב-0.75 ו-wordmark בדיו מושתק במנוחה, צבע מלא ב-hover וב-focus-visible, והכול בתוך ‏`@media (hover: hover)` כך שטלפון רואה צבע. טוקנים: ‏--spacing-brand-tile-w/-h, ‏--spacing-brand-logo-w/-h. "
    "**נמדד אחרי** (‏logs/ux11/after.json): ‏380 ‏flex, ‏overflow-x auto, ‏1122/330 נגלל, ‏7 אריחים ‏150x80 בשורה אחת; ‏768 רשת ‏3x215.3, שורות ‏3/3/1; ‏1440 רשת ‏5x220.4, שורות ‏5/2; מנוחה ‏grayscale(1)/0.75, ‏hover ‏none/1. "
    "נעוץ ב-below-fold-rules.test.ts (+5), ‏below-fold.test.ts (+3), ‏BrandsRow.test.tsx (5), ‏live-home-sections.test.ts (ה-pin של שורה 09 נכתב מחדש: בלי ‏carousel של ‏Electro, השורה היא ספריית בתי העסק מתחת לחלון השער) ו-e2e/brands-row.spec.ts (‏8/8 ב-chromium + mobile-chrome). "
    "שערים: ‏vitest ‏833 קבצים / ‏9706 ירוקים, ‏type-check ו-lint נקיים, ‏build ירוק (‏rm -rf .next), שער הבית ‏2.22 / 1.24 / 1.32 (ללא שינוי). שכני ‏e2e (‏home-rtl, touch-targets, a11y, home בשני הפרויקטים): ‏121 עברו, אותה קבוצת כשלונות ידועה של ‏UX10 (‏logs/ux11/neighbours-diff.txt: ההבדל היחיד הוא ‏Tab-stop על ‏/ ב-chromium שעבר הפעם). "
    "‏COMPONENT-QUEUE שורה 09 עודכנה ושורת ledger נוספה. הפירוט ב\"החלטות שהתקבלו לבד (UX11)\". המשך מ: ‏UX12)"
)
decisions = (
    "**החלטות שהתקבלו לבד (UX11, 15:00):** (1) **שורה 09 הייתה \"refused\" כ-parity ונבנתה כ-UX**: החי אינו מכיל פס מותגים (ה-\"Brands\" היחיד במרקאפ שלו הוא ‏Font Awesome 5 Brands), ולכן השורה מורכבת מתחת ל-2600px של השער ולא מזיזה פיקסל נמדד; ה-pin ב-`live-home-sections.test.ts` נכתב מחדש כדי לנעוץ את ההחלטה החדשה במקום הישנה. "
    "(2) **מקור הנתונים הוא ‏`suppliers` דרך ספריית בתי העסק, לא ‏`products.brand`**: ‏`products.brand` הוא טקסט חופשי ו-null בכל ‏46 המוצרים הפעילים (‏category-page.ts), ואין טבלת מותגים; ‏`suppliers` נקראת ב-anon בפרודקשן ו-`buildMerchantDirectory` כבר טהור ונבדק. ‏`loadMerchantDirectory` לא נקראת ישירות כי היא ‏`orFail`, והבית לעולם לא זורק. "
    "(3) **עסק בלי מוצר למכירה לא מוצג**: אריח בבית הוא הבטחה שהקישור מוביל למשהו; ‏`/merchants` מציג אותו עם \"אין קופונים כרגע\", הבית לא. "
    "(4) **‏wordmark הוא העיצוב ולא fallback**: ‏6 מ-7 הספקים בלי לוגו, ולכן אריח-שם באותו גודל, קישור והתנהגות; ‏alt של לוגו הוא שם העסק. לוגו עובר ‏`isAllowedImageUrl` לפני ‏next/image כי ‏next/image זורק על מארח מחוץ לרשימה ושורה אחת רעה הייתה מפילה את הסקשן. "
    "(5) **אפור רק במכשיר עם pointer**: ‏`@media (hover: hover)`; כלל ללא תנאי היה משאיר כל לוגו אפור לנצח בטלפון. ‏focus-visible צובע גם הוא. "
    "(6) **לא נגעתי ברשימת העוגנים של ‏home-rtl.spec**: היא נעוצה על ‏20 בדיוק (\"twenty is the number the goal set\"), ההוספה שלי הפילה אותה והוחזרה; כיוון ‏RTL של הסקשן והרשימה נבדק ב-`brands-row.spec.ts` במקום. "
    "(7) **‏scroll-snap-type מחושב כ-\"x\"**: ‏Chromium משמיט ‏proximity (ברירת המחדל) בערך המחושב; הבדיקה תוקנה ל-`/^x/`. "
    "(8) **ה-64 הכשלונות של ‏UX10 ב-neighbours הם ‏a11y של דפי ‏legal/checkout, ‏touch-targets ו-home.spec שאינם קשורים לשורה**, זהים לקבוצה הקודמת (‏diff). "
    "(9) **‏Supabase MCP ו-GitHub MCP לא מאושרים בסשן**: הקריאה בפרודקשן נעשתה ב-REST אנונימי (ה-anon key ציבורי), בלי כתיבה ובלי מיגרציה (לא נדרשה: אין שינוי סכימה). "
    "(10) **גיבוי ‏tar לדסקטופ היה no-op שקט** (לפי הזיכרון הידוע); נכתב ל-`~/kenyonexpress-backup-2026-10-14-1456.tar.gz` (‏812MB). ‏caffeinate רץ (‏3 מופעים), ‏SleepDisabled 1. "
    "(11) **השרת על ‏3346 נהרג לפי ‏PID של ה-listener** לפני ה-build ובסוף השלב."
)
lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX10'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
