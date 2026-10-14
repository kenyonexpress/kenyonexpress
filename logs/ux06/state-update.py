# -*- coding: utf-8 -*-
# UX06: prepend the Updated line, demote the previous one, add the decisions block.
import io
import re
import sys

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()

GATE = sys.argv[1]  # e.g. "2.22 / 1.25 / 1.32"
FILES = sys.argv[2]  # vitest file count, e.g. "822"
TESTS = sys.argv[3]  # vitest test count

updated = (
    "Updated: 2026-10-14 12:40 (UX06 ליטוש שלוש העמודות של ה-hero ב-1440: עמודת שלושת באנרי הקידום (שמאל) "
    "הייתה ‏200 רוחב במקום ‏201 של החי, ולכן הסליידר (מרכז) היה ‏729 מ-x335 במקום ‏728 מ-x336, פיקסל אחד בתוך "
    "העמודה בכל שורה של ה-hero; העמודה נמתחה ל-613 של השורה (‏`h-full`, ‏204.67 לכל בלוק) במקום ‏197 / 198 / 198 = "
    "593 של החי (‏`min-height:197px` על ‏`.da-inner`, קו ‏1px ‏#e7e7e7 מעל הווידג'טים 2 ו-3, ‏20px לבן מתחת); הטקסט "
    "היה ‏11px/13px עם ‏strong של ‏13 (ה-da-block של הנייד ב-Electro) במקום ‏17px/23px במשקל ‏200 עם ‏strong ‏700 "
    "באותו גודל; שורת \"לרכישה\" הייתה ‏`self-end` בעמודת ‏`items-end`, כלומר נעוצה בקצה השמאלי ‏70px מהטקסט "
    "המיושר ימינה, ב-11px עם עיגול ‏26, ועכשיו ‏14px/30px/700 ישר מתחת לטקסט עם עיגול ‏18 במרווח ‏8 משמאלו "
    "(‏`.da-action` + ‏`::after` של החי); התמונה הייתה ‏80px ו-20 מתחת לקצה במקום ‏110px, ‏rotate(16deg), ‏30 מתחת "
    "ו-10 מעבר לפינה השמאלית-תחתונה; ‏hover (גוון ‏40% + ‏zoom 105%) הוסר כי ל-`.da-media` של החי אין ‏:hover. "
    "תפריט הקטגוריות (ימין, ‏241, רשימה ‏270 מ-x1035) כבר היה נכון מ-UX04 ונעוץ עכשיו באותו ‏spec. ב-380 וב-768 "
    "העמודה ‏`display:none` כמו של החי (‏`elementor-hidden-phone` + ‏`.builder .slider-das-block{display:none}` עד "
    "1199; צילום ה-768 מראה את חמשת אריחי הרצועה ישר מתחת לסליידר). נמדד: ‏`logs/ux06/before.json` מול ה-build של "
    "‏HEAD, ‏`live-blocks.mjs` מול ‏`refs/ke_live_1440.png`; אחרי: סליידר ‏x336 / 728, עמודה ‏201 x 593, בלוקים "
    "ב-y148.3 / 346.3 / 544.3 כמו ‏y148 / 346 / 544 של החי, קבוצת הטקסט ממורכזת אנכית (‏246.8 מול מרכז בלוק ‏246.8). "
    "נעוץ ב-`HeroPromoBanners.test.tsx` (7) וב-`e2e/hero-grid.spec.ts` (‏16/16 ב-chromium + mobile-chrome). "
    "שערים: ‏vitest ‏" + FILES + " קבצים / ‏" + TESTS + " טסטים ירוקים, ‏type-check ו-lint נקיים, ‏build ירוק, "
    "שער הבית ‏" + GATE + " (היה ‏2.22 / 1.25 / 1.16; ב-1440 ה-\"both painted\" עלה ב-0.16 כי אנחנו צובעים עכשיו "
    "יותר במקומות שהחי צובע, ‏ours blank ירד ‏1.27 -> 1.09 וה-OVERALL ירד ‏10.97 -> 10.92). הפירוט ב\"החלטות "
    "שהתקבלו לבד (UX06)\")"
)

decisions = (
    "**החלטות שהתקבלו לבד (UX06, 12:40):** (1) **נמדד לפני שנכתב**: ‏`logs/ux06/probe.mjs` מול ה-build של ‏HEAD "
    "ב-3345 (‏`before.json`, שלושת הרוחבים) ו-`live-blocks.mjs` על ‏`refs/ke_live_1440.png` (קווי ‏#e7e7e7 ב-y345 "
    "ו-y543, כותרות ‏cap ב-y214 / y238, עיגול ‏18 ב-x227..x244 בבלוק 2, קצה ימני של הטקסט ב-x319/320 = 336 - 16); "
    "ה-CSS של החי נקרא מ-`refs/ke_live_home.html` של ה-checkout הראשי (ה-worktree הזה אין לו את הקובץ): "
    "‏`.da-inner{min-height:197px;font-size:17px}`, ‏`line-height:23px`, ‏`.da-text{font-weight:200}`, "
    "‏`.da-action{font-size:14px;line-height:30px}` + ‏`::after` ‏18x18 עם ‏`margin-right:8px`, "
    "‏`.da-media-left{bottom:-30px;left:-10px;width:110px;transform:rotate(16deg)}`. (2) **המספרים ב-ELECTRO_HERO."
    "sideBanners ולא בטוקני ‏CSS חדשים**: האובייקט כבר נשא ‏width 201 ו-itemHeight 197 מדודים, והרכיב התעלם מהם עם "
    "‏`BANNER_WIDTH = 200` משלו; עכשיו יש מקור אחד (‏padding, ‏copySize/LineHeight/Weight, ‏actionSize/LineHeight/Gap, "
    "‏shopButtonSize 18, ‏imageSize/Overhang/Rotate) והרכיב קורא ממנו ‏inline. ‏`--text-hero-promo` כבר תפוס לטקסט "
    "הסליידר (‏35/50) ולכן לא נוסף טוקן ‏CSS בשם דומה. (3) **הקו על העטיפה ולא על הקישור**: ‏`min-height` ב-border-box "
    "היה בולע את ה-1px והעמודה הייתה ‏591; ה-`div[data-hero-promo-block]` נושא את ‏`border-t` כמו הווידג'ט של "
    "Elementor, והקישור הוא ‏`.da-inner`. (4) **העמודה ‏`self-start` ולא ‏`h-full`**: השורה היא ‏613 והעמודה ‏593; ‏20 "
    "הפיקסלים הלבנים מתחת הם של החי (y741..y761). (5) **העתק עברי נשאר**: החי מוכר באנגלית את הדמו של ‏Electro "
    "(‏Tesla, ‏Apple, לפטופים); הכותרות העבריות של ‏62eb74956 נשארו, רק הגודל והמשקל הם של החי. ‏`uppercase` הוסר "
    "(אין אותיות גדולות בעברית). (6) **דיו כהה על העיגול, לא לבן של החי**: ‏`text-white` על ‏`bg-brand-secondary` "
    "הוא ‏1.41:1 ו-`src/lib/a11y/brand-contrast.test.ts` מסרב לו בכל ‏src/ גם כקישוט; הסוויטה המלאה תפסה את זה "
    "(‏1/9644) והעיגול חזר ל-`text-brand-dark`. ה-chevron נשאר שמאלה (‏ChevronLeft) לפי כלל ה-RTL; החי משאיר "
    "‏angle-right לא-מהופך. (7) **‏e2e ממתין ל-slider אחד**: ‏`[data-hero-slider]` נפתר לשני אלמנטים בזמן ה-Suspense "
    "fallback (אותו מרוץ ש-home.spec ו-UX05 מתעדים), ‏`waitFor` בודד נפל ב-10/16 תחת עומס; ‏`toHaveCount(1)` ואז ‏16/16. "
    "(8) **שכנים**: ‏home / hero-carousel / home-rtl / touch-targets / a11y / menu-drawer ‏162 עברו, ‏64 כותרות נפלו, "
    "כולן תת-קבוצה של ‏66 שנפלו ב-UX05 (‏`comm` על ‏`logs/ux05/e2e-neighbours.log` מול ‏`logs/ux06/`): אף כישלון חדש, "
    "שניים פחות (hero dots ו-search suggest, נזילים). לא נגעתי: ‏a11y legal/contact contrast, ‏skip-link מול באנר "
    "ההסכמה, ‏touch-targets ‏TopBar login ‏72x41 ו-wishlist ‏44x40, ‏home-rtl ‏masthead search ‏ltr, ‏image optimizer "
    "מקומי (‏404 לפי ‏`local-next-image-endpoint-404s`). (9) **ה-build נכשל פעם אחת על ‏TS2532 ב-spec** (אינדקס מערך "
    "תחת ‏noUncheckedIndexedAccess) ותוקן לשלושה ‏const; ‏biome דרש ‏--unsafe רק על סקריפטי המדידה ב-logs/ux06."
)

lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-14 12:05 (UX05'), lines[2][:60]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
# decisions: before the UX05 block
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX05'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
