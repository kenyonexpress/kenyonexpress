# -*- coding: utf-8 -*-
# UX09: prepend the Updated line, demote the previous one, add the decisions block.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()

updated = (
    "Updated: 2026-10-14 13:40 (UX09 רשת המוצרים המובילים (‏`DealsOfTheDay`, ‏32 כרטיסים): ‏4 עמודות ב-1440, ‏2 ב-768 עד ‏1199, ‏1 ב-380, "
    "וגובה אחיד לכל כרטיס. **נמדד לפני**: הרשת כבר נתנה ‏1/2/4 (‏flex-wrap עם ‏basis ‏100/50/25%) וכל ‏32 הכרטיסים היו באותו גובה "
    "(‏548 ב-380, ‏501 מ-768, ‏logs/ux09/before.json בחמישה רוחבים כולל ‏1024 ו-1199), אבל רק כי כל כרטיס ב-fixture נושא קטגוריה, תמונה "
    "ומחיר: שורת הקטגוריה וה-`<img>` רונדרו בתנאי, כרטיס בלי קטגוריה היה קצר ב-40px (‏24 + ‏gap 16) וכרטיס בלי תמונה ב-245px, "
    "ו-flex-wrap מודד כל שורה לבד. **עכשיו**: ‏`.jet-listing-grid-deals` הוא ‏CSS grid (‏`repeat(1|2|4, minmax(0,1fr))` ב-0/768/1200, "
    "‏`grid-auto-rows: 1fr`) כך שכל השורות בגובה הכרטיס הגבוה ביותר; ‏`.p_con__category` עם ‏`min-height: 24px` ו-`.p_con__image-wrap` עם "
    "‏`min-height: 245px` מחזיקים את שני המשבצות גם בלי תוכן; שני כרטיסי הדילים (‏`ProductDealCard` של הבית ו-`ProductCard variant=deals` "
    "של הנחיתה והחנות) מרנדרים ‏`<span class=\"p_con__category\" aria-hidden data-empty-slot>` ריק במקום כלום. **נמדד אחרי** (‏after.json): "
    "‏display grid, אותם ‏1/2/2/2/4 עמודות, אותו ‏pitch ‏548/501, אותם רוחבים ‏330/335/463/526/287.5, אותן משבצות ‏24/63-64/245/86-40, "
    "בייט-זהה לפני. ‏`e2e/deals-grid.spec.ts` מרוקן כרטיס ב-DOM (קישור הקטגוריה→span ריק, ‏img מוסר) ומודד שהוא עדיין בגובה השורה "
    "(‏24 ו-245 למשבצות), ‏12/12 ב-chromium + mobile-chrome. נעוץ גם ב-`product-card-deals.test.ts` (+2) ו-`ProductDealCard.test.tsx` (4, שני הכרטיסים). "
    "שערים: ‏vitest ‏827 קבצים / ‏9665 ירוקים, ‏type-check ו-lint נקיים, ‏build ירוק (‏rm -rf .next), שער הבית ‏2.22 / 1.24 / 1.32 (ללא שינוי). "
    "שכני ‏e2e (‏home + home-rtl בשני הפרויקטים): ‏10 נכשלים, קבוצה זהה לשל ‏UX08 (‏logs/ux09/failing-titles.txt). הפירוט ב\"החלטות שהתקבלו לבד (UX09)\". המשך מ: ‏UX10)"
)

decisions = (
    "**החלטות שהתקבלו לבד (UX09, 13:40):** (1) **נמדד לפני שנכתב**: ‏`logs/ux09/probe.mjs` מול ה-build הקיים של ‏HEAD ‏881fad63c ב-3346 "
    "בחמישה רוחבים (‏380/768/1024/1199/1440): העמודות והגבהים כבר נכונים ל-fixture, ולכן העבודה היא הבטחה מבנית ולא תיקון פיקסלים; "
    "ה\"טאבלט\" הוא ‏768..1199 (ה-switch ל-4 ב-1200 הוא ‏xl של ‏Bootstrap שהחי מריץ, נמדד ב-UX01, ו-1024 נשאר ‏2 עמודות כמו בחי). "
    "(2) **‏grid ולא ‏flex-wrap**: ‏`grid-auto-rows: 1fr` נותן לכל השורות את גובה הכרטיס הגבוה ביותר ברשת כולה, מה ש-flex-wrap לא יכול; "
    "‏1fr מ-1150 הוא ‏287.5 כמו ‏25%, ולכן ה-x של כל כרטיס לא זז (‏after.json, שער ללא שינוי). ‏`minmax(0,1fr)` כדי שכותרת ארוכה לא תפרוץ עמודה. "
    "(3) **משבצת ריקה ולא ‏padding**: ‏span ריק עם ‏`aria-hidden` ו-`data-empty-slot` במקום ‏min-height על ה-`.p_con`, כי גובה הכרטיס מורכב "
    "מארבע משבצות מדודות (‏24/64/245/40) ושמירה על כל אחת שומרת גם את ה-y של השכנות; ‏`min-height` ב-CSS ולא ‏NBSP בתוכן. "
    "(4) **‏`FeaturedProducts.tsx` לא נגע**: הרכיב שנקרא \"Featured\" לא מרונדר בשום עמוד (‏discarded-read-inventory מונה אותו) ו\"רשת המוצרים "
    "המובילים\" של הבית היא ‏`DealsOfTheDay`; ‏`FeaturedProductsTabs` משתמש באותו ‏grid ולכן מקבל את התיקון בחינם. "
    "(5) **‏e2e מרוקן כרטיס ב-DOM** במקום להוסיף מוצר חסר ל-fixture (ה-fixture הוא מראה של החי ומדוד בשער). "
    "(6) **‏lint נפל פעם אחת** על פורמט של הקבצים החדשים ו-`logs/ux09` ותוקן ב-`biome --write --unsafe`. "
    "(7) **‏Supabase MCP לא מאושר בסשן** ולא נדרש: אין שינוי סכימה או נתונים. (8) **השרת על ‏3346 נהרג לפי ‏PID של ה-listener** בסיום."
)

lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX08'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
