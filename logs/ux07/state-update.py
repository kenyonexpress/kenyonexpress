# -*- coding: utf-8 -*-
# UX07: prepend the Updated line, demote the previous one, add the decisions block.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()

updated = (
    "Updated: 2026-10-14 12:50 (UX07 ליטוש שורת אריחי הקטגוריות מתחת לדילים (‏`CategoryGrid`): הפינה הייתה "
    "‏`rounded-lg`, שבערכה הזו נפתר ל-`--radius-lg` = ‏25px, פינת המודאל, ולכן כל אריח נמדד ‏25px בשלושת הרוחבים; "
    "עכשיו ‏`rounded-elevated` = ‏12px (‏`--radius-elevated` חדש ב-tokens.css, שיקוף של ‏ELECTRO.radius.elevated "
    "שכבר ישב ב-tokens.ts). צל ה-hover היה ‏`shadow-md` של ‏Tailwind (שתי שכבות ‏rgba(0,0,0,.1) ‏4px 6px -1px + "
    "‏2px 4px -2px), ערך ש-tokens.css אוסר במפורש (\"שני הצללים היחידים\"); עכשיו ‏`shadow-card-hover` "
    "(‏0 4px 16px rgba(0,0,0,.12)). הזום ‏105% על התמונה כבר עבד (‏`scale` ולא ‏`transform`, ‏Tailwind v4) ועכשיו "
    "הקופסה שלו ‏`overflow-hidden` באותו רדיוס, כך שהזום לא גולש מהכרטיס. **תמונה אמיתית לכל קטגוריה**: בפרודקשן "
    "‏13 שורות עליונות פעילות ו-`image_url` ריק בכולן, ו-`CATEGORY_TILE_IMAGES` כיסה ‏8 בדיוק, כך ש-`hot-deals`, "
    "‏`new`, ‏`electronics` ו-`professionals` מוינו לסוף ונשמטו בשקט (ושינוי סדר בתפריט היה מציב קופסה אפורה); עכשיו "
    "כל ‏13 ממופות לצילומי מוצר חיים מ-`public/images/products` (סטייק, גלידה, ‏PS5, מספרה). **בלי אימוג'י**: "
    "שורת ‏`hot-deals` בפרודקשן נקראת \"דיל חם 🔥\"; ‏`tileLabel` ב-below-fold-rules מסיר פיקטוגרפים, ‏variation "
    "selectors ו-ZWJ ומשאיר את ה-isolate וה-NBSP של \"עד 99 ₪\" (‏`\\s+` בלע את ה-NBSP והטסט תפס). נמדד: "
    "‏`logs/ux07/before.json` מול ה-build של ‏HEAD ב-3346; אחרי (‏`after.json`): רדיוס ‏12px, צל מנוחה ‏none, צל "
    "‏hover הטוקן, ‏scale 1.05, ‏8 אריחים עם ‏<img> שצויר (‏naturalWidth > 0) בלי אימוג'י, ‏2 עמודות ב-380 ו-4 "
    "ב-768/1440. נעוץ ב-`CategoryGrid.test.tsx` (3), ‏`below-fold-rules.test.ts` (+7: ‏tileLabel, כיסוי כל "
    "‏slug של ‏KE_LIVE_CATEGORIES + ‏electronics, קיום כל קובץ) ו-`e2e/category-grid.spec.ts` (‏5/5 + ‏1 skip "
    "מכוון ב-mobile-chrome, ‏hover). שערים: ‏vitest ‏823 קבצים / ‏9642 טסטים ירוקים, ‏type-check ו-lint נקיים, "
    "‏build ירוק, שער הבית ‏2.22 / 1.24 / 1.32 (היה ‏2.22 / 1.25 / 1.32; הרשת מתחת ל-2600px של השער). הפירוט "
    "ב\"החלטות שהתקבלו לבד (UX07)\")"
)

decisions = (
    "**החלטות שהתקבלו לבד (UX07, 12:50):** (1) **נמדד לפני שנכתב**: ‏`logs/ux07/probe.mjs` מול ה-build הקיים של "
    "‏HEAD (‏BUILD_ID מ-12:17, ‏HEAD ‏9f7ace3ec הוא רק ‏logs) ב-3346, שלושת הרוחבים: רדיוס ‏25px, צל ‏hover של "
    "‏Tailwind, ‏scale 1.05 כבר עובד (הקריאה הראשונה של ‏`transform` החזירה ‏none והטעתה; ‏Tailwind v4 כותב "
    "‏`scale`), ‏0 ‏fallbacks ו-0 אימוג'י בשמונת האריחים שנבחרו. (2) **אין שורת ‏Elementor למדוד מולה**: החי לא "
    "מריץ שורת כרטיסי קטגוריות מתחת לדילים (‏`home-categories-title` לא קיים בפרודקשן, וה-grid יושב מתחת "
    "ל-2600px של השער), ולכן ‏12px הוא ערך ה-goal, מתועד ב-tokens.css כ\"לא מהחי\" ומעוגן ב-ELECTRO.radius.elevated "
    "(‏Electro נותן צורה). (3) **טוקן חדש ולא ערך גולמי**: ‏`--radius-elevated: 12px` ליד חמשת הרדיוסים המדודים; "
    "‏`rounded-[12px]` היה נופל ב-tokens-gate. (4) **הצל מהטוקן ולא מהערכה**: ‏`hover:shadow-card-hover` הוא אחד "
    "משני הצללים ש-tokens.css מתיר; ‏`shadow-md` נמחק. (5) **כיסוי מפה ולא ‏DB**: ‏`image_url` ריק בכל ‏13 השורות, "
    "ה-MCP של ‏Supabase לא מאושר בסשן הזה, ובכל מקרה הכלל הקיים הוא \"‏image_url של השורה גובר על המפה\", כך "
    "שהרחבת ‏`CATEGORY_TILE_IMAGES` ל-13 היא הפתרון בלי מיגרציה ובלי כתיבה לפרודקשן. הצילומים נבחרו בעין "
    "(‏rm5 סטייק ל-hot-deals, ‏ice3 גלידה ל-new, ‏sony3 ל-electronics, מספרה ל-professionals), כולם קבצים שכבר "
    "נקלטו מהאתר החי, ו-asset-gate ו-blur-manifest נקיים. (6) **‏`tileLabel` ולא עריכת ‏name_he**: השורה שומרת "
    "את ה-🔥 שלה לפאנל ה-hero ולאדמין (החי מדפיס \"דילים חמים 🔥\"), הכלל הוא של ה-grid בלבד. נכתב כנקודות קוד "
    "ולא ‏`\\p{Extended_Pictographic}` (ה-target של ‏TS קודם ל-ES2018, הלקח של ‏dotAll), וה-selectors/ZWJ "
    "כ-alternation כי ‏biome (‏noMisleadingCharacterClass) מסרב להם בתוך ‏class. (7) **‏8 מתוך ‏13 לפי סדר התפריט**: "
    "עם כל ה-slugs ממופים, ‏`pickCategoryTiles` מציג את ‏8 הראשונים לפי ‏sort_order (‏hot-deals, ‏under-99, ‏new, "
    "‏restaurants-cafes, ‏beauty-health, ‏phones-computers, ‏baby-kids, ‏vacation); ‏pets, ‏electronics, "
    "‏professionals ו-courses יוצגו כשמפעיל יסדר אחרת. (8) **‏e2e**: צל ה-hover המחושב הוא ארבע שכבות שקופות ואז "
    "הטוקן (‏ring/inset slots של ‏Tailwind), ולכן ‏regex על הסוף ולא ‏toBe; ‏hover נבדק ב-chromium בלבד (‏`hover:` "
    "מאחורי ‏`(hover: hover)`); ‏5/5 + ‏1 skip. (9) **‏lint נפל פעם אחת על ‏before/after.json** (שורה ריקה בסוף; "
    "‏biome check . מכסה ‏logs/) ותוקן ב-format; ‏build ירוק עם אותו רעש ‏prerender של ‏referral_program_settings "
    "כמו ב-UX06 (‏286 מול ‏315 שורות)."
)

lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-14 12:40 (UX06'), lines[2][:60]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX06'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
