# -*- coding: utf-8 -*-
# UX08: prepend the Updated line, demote the previous one, add the decisions block.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()

updated = (
    "Updated: 2026-10-14 13:20 (UX08 ליטוש \"הדיל של היום\" (‏`DealOfTheDay`): **טיימר**: היה תווית ‏14px לצד "
    "צ'יפ ‏monospace נפרד (‏16px/900, ‏tracking 1.6px, רדיוס ‏4px) בשורה משלו; עכשיו גלולה אחת של ‏Electro "
    "(‏`.deal-countdown-timer` נמדד ב-refs/electro-home-v7_computed.json ב-1440: ‏207x36, ‏padding 5px 34px, "
    "‏15px/700 על הצהוב, רדיוס מלא) בשורת הכותרת, ‏30px אחרי ה-h2, נשברת מתחתיה ב-380: \"מסתיים בעוד: ‏HH:MM:SS\" "
    "(‏`--spacing-deal-countdown` ‏36px ו-`--spacing-deal-countdown-pad` ‏34px חדשים ב-tokens.css, גודל "
    "‏`--text-body-lg` הקיים). **אחוז**: היה צ'יפ צהוב ברדיוס ‏25px (המודאל) בשורת המחיר; עכשיו התג של כרטיס "
    "הדילים החי (‏`.p_con__badge`: אדום ‏--color-deal-badge, לבן ‏12/700, רדיוס ‏4px, ‏2px 10px) נעוץ בפינת "
    "ה-inline-end העליונה של התמונה, \"-50%\", והאחוז נשאר בשורת המחיר ל-sr-only בלבד. **הוספה לעגלה**: היה "
    "קישור \"לרכישה\" לעמוד המוצר; עכשיו ‏`AddToCartButton` אמיתי באותה גלולה צהובה (‏44 גובה, ‏id ומחיר "
    "באגורות), ואחרי שהשרת קיבל את הפריט הכפתור הופך לירוק המבצע עם לבן, קופץ פעם אחת (‏`deal-cta-pop` ‏420ms "
    "על עקומת ה-header-badge), ה-✓ נכנס (‏`deal-cta-check`) וקורא \"נוסף לעגלה\" ל-1.8 שניות (‏`addedLabel` "
    "חדש ואופציונלי ב-AddToCartButton, ‏`data-added` + ‏`addedClassName`; סירוב לעולם לא מאשר, כמו האנליטיקה); "
    "המגירה נפתחת כמו בכל הוספה. **פינות**: הכרטיס והתמונה היו ‏`rounded-lg` = ‏25px; עכשיו ‏`rounded-elevated` "
    "‏12px (כמו ‏UX07). **קישור הקטגוריה** קיבל קופסת מגע ‏24px (‏touch-targets מדד ‏97x16). נמדד: "
    "‏`logs/ux08/before.json` מול ה-build של ‏HEAD ב-3346; אחרי (‏`after.json`): גלולה ‏226x36 צהובה ‏15/700, "
    "באותה שורה עם הכותרת ב-768/1440 (‏y 295.3 מול ‏296.8) ומתחתיה ב-380; תג ‏47x28 אדום/לבן ‏4px בפינת "
    "התמונה (‏x שווה ל-x של התמונה), ‏CTA כפתור ‏44; ‏`added-state.json`: צהוב→‏rgb(50,134,20)/לבן, "
    "‏animation deal-cta-pop ‏0.42s, ‏svg deal-cta-check, מגירה פתוחה, חוזר אחרי ‏2.2s. נעוץ ב-"
    "`DealCountdown.test.tsx` (3), ‏`DealOfTheDay.test.tsx` (8), ‏`add-to-cart-added-state.test.tsx` (6) "
    "ו-`e2e/deal-of-the-day.spec.ts` (‏6/6 chromium + mobile-chrome). שערים: ‏vitest ‏826 קבצים / ‏9659 "
    "ירוקים, ‏type-check ו-lint נקיים, ‏build ירוק, שער הבית ‏2.22 / 1.24 / 1.32 (ללא שינוי; הסקשן מתחת "
    "ל-2600px). הפירוט ב\"החלטות שהתקבלו לבד (UX08)\")"
)

decisions = (
    "**החלטות שהתקבלו לבד (UX08, 13:20):** (1) **נמדד לפני שנכתב**: ‏`logs/ux08/probe.mjs` מול ה-build "
    "הקיים של ‏HEAD ‏74ac1edce ב-3346 בשלושת הרוחבים: הסקשן קיים מקומית (הדיל: הסרת שיער בלייזר קר, ‏50%); "
    "טיימר ‏output ‏mono בצ'יפ ‏4px, תג ‏\"50% הנחה\" צהוב ‏25px ‏inline, ‏CTA ‏`<a>` \"לרכישה\", רדיוס כרטיס ‏25px. "
    "(2) **צורה מ-Electro, תוכן מהחי**: החי לא מריץ טיימר בשום מקום (‏live-home-sections.test.ts) ולכן הגלולה "
    "היא ‏`.deal-countdown-timer` של ‏Electro v7 (‏SOURCING-RULES); תג האחוז לעומת זאת הוא בדיוק ‏`.p_con__badge` "
    "של כרטיסי הדילים החיים שמעל, כי החי כן מצייר אותו. (3) **‏`end-0` נפתר מול הכיוון של האלמנט עצמו**: "
    "‏`dir=\"ltr\"` על התג עצמו הצמיד אותו לפינה הימנית (‏e2e נפל: ‏x 371 מול ‏162); ה-ltr עבר ל-span פנימי "
    "כמו ‏`.discount_per` בתוך ‏`.p_con__badge`, והוסף ל-`LTR_ALLOWED` ב-home-rtl.spec (הביקורת מדווחת כל "
    "צומת ‏ltr לפי נתיב). נשמר בזיכרון. (4) **‏`addedLabel` אופציונלי ולא שינוי גלובלי**: כל שאר הקוראים "
    "של ‏AddToCartButton (עמוד מוצר, השוואה, ‏bundle) לא משתנים; האישור מותנה ב-`accepted` כמו ‏track, "
    "והטיימר מתנקה ב-unmount. (5) **ירוק המבצע ולא צהוב ללבן**: ‏brand-contrast.test.ts אוסר לבן על הצהוב "
    "(‏1.41:1), ולכן מצב \"נוסף\" הוא ‏`--color-sale-badge` (‏4.5:1 ללבן), דרך ‏`data-added:` של ‏Tailwind v4, "
    "ומחרוזת הקלאסים של המצב בשורה נפרדת כדי שהשער (שקורא שורה-שורה) לא יראה צהוב ולבן יחד. (6) **אנימציה "
    "ב-globals.css ליד ‏header-badge-pop**, אותה עקומה (‏cubic-bezier(.2,.8,.2,1)); ‏prefers-reduced-motion "
    "הגלובלי מקצר אותה והמצב עדיין נקרא כי החלפת הצבע והטקסט אינן האנימציה. (7) **‏e2e לוחץ באמת**: ההוספה "
    "יוצרת שורת עגלת אורח ב-DB שהשרת המקומי מצביע עליו (כמו ‏cart.spec הקיים); ‏`dialog[aria-label]` נספר ‏3 "
    "(‏MiniCartDropdown תמיד ‏open) ולכן הבדיקה היא ‏`dialog.cart-drawer[open]` ‏0→1. (8) **שכנים**: "
    "‏home-rtl + touch-targets + a11y + home בשני הפרויקטים: ‏64 נכשלים, קבוצה זהה בית-בבית לשל ‏UX06 "
    "(‏comm ריק, ‏logs/ux08/failing-titles.txt); על ‏/ נשארו רק שני העבריינים הקודמים (‏input#masthead-search "
    "ב-ltr, ‏a[התחברות] ‏72x41), אחרי שקישור הקטגוריה שלי (‏97x16) תוקן. (9) **‏lint נפל פעמיים על ‏logs/ux08** "
    "(‏json/mjs לא מפורמטים) ותוקן ב-`biome --write --unsafe` על התיקייה; ‏build ‏3 פעמים (‏rm -rf .next "
    "בראשון, ‏incremental בשניים), כולם ירוקים. (10) **השרת על ‏3346 נהרג לפי ‏PID של ה-listener** בסיום."
)

lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-14 12:50 (UX07'), lines[2][:60]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX07'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
