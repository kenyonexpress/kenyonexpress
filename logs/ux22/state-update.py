# -*- coding: utf-8 -*-
# UX22: the STATE.md edit (Updated line, the previous line kept as קודם, the
# decisions paragraph before UX21's). A file and not a heredoc because a
# python heredoc with Hebrew dies on the \xd7 encoding check.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-14 22:40 (UX21'), lines[2][:40]
old_updated = lines[2]
new_updated = (
    'Updated: 2026-10-14 23:20 (UX22 דף קטגוריה: פירורי לחם, באנר, רשת, דפדוף, ומתג גלילה רציפה. '
    '**נמדד לפני** (‏logs/ux22/before.json, ה-build הקיים של ‏f557aa9e2 ב-380/768/1440 על ‏3363, אנונימי, ‏/category/beauty-health + ‏/products + ‏/products?page=2): '
    'פירורי הלחם (עמוד הבית › הקטגוריה), ה-H1, הספירה, הרשת (‏13 כרטיסים ב-2/3/5 עמודות) והבאנר המתוזמן (‏null, אין באנר חי) כבר קיימים ונכונים; הדפדוף הממוספר קיים (‏Pagination, ‏36px, "עמוד N") ומופיע רק ב-/products '
    '(‏46 מוצרים פעילים, ‏24 לעמוד; המקסימום בקטגוריה הוא ‏13, כך שאף דף קטגוריה אינו מציג היום עמוד שני); אין שום אפשרות לגלילה רציפה ואין מקור JSON לעמוד הבא (‏/api/catalog/page ענה ‏404). '
    '**עכשיו**: ‏lib/catalog-paging.ts (העדפה ‏pages / scroll ב-localStorage ‏ke_catalog_paging_v1 כמו רשת/רשימה, וזיכרון עומק ב-sessionStorage ‏ke_catalog_depth_v1:<url>, ‏cap 10 עמודים); '
    '‏lib/catalog-archive.ts (‏parsePage / parsePrice / pageWindow / resultCountText שהיו משוכפלים בשני הדפים, ‏archivePageUrl); ‏GET /api/catalog/page (‏slug לקטגוריה, בלעדיו ‏/products; אותם פרסרים ואותם readers מקושקשים כמו הדפים, '
    'היסטוריית מחיר + ‏blur לכל כרטיס, ‏rate limit ‏catalog-page ‏120/5 דק׳, ‏Cache-Control דקה בקצה, ‏404 ל-slug מת, ‏429 לפני כל קריאה); ‏CatalogGrid (לקוח): ה-HTML הוא תמיד העימוד הממוספר, ההעדפה נקראת ב-effect אחרי ההידרציה; '
    'במצב רציף קישורי העמודים לא מרונדרים, כפתור "טעינת עוד מוצרים" ‏44px ש-IntersectionObserver לוחץ עליו במרחק מסך ("מעל ה-viewport" נחשב "הגיע"), העמוד הבא נכנס לתוך אותו ‏<ul> (רשימה אחת, ‏24 מתחלק ב-2/3/5), '
    'שורת הספירה התחתונה מתעדכנת, ‏output ‏aria-live מכריז "נטענו N מוצרים נוספים", כשל הופך לכפתור "לנסות שוב" בלי לולאה, חזרה מעמוד מוצר ממלאת מחדש לעומק שהושג, ובחירה חוזרת ב"עמודים" מפילה את הכרטיסים שצורפו; '
    'המתג (‏fieldset "אופן הדפדוף", שני כפתורי ‏36px בגיאומטריית הדפדוף) מרונדר רק כשיש יותר מעמוד אחד. שני הדפים (קטגוריה וחנות) חולקים את הרכיב. '
    '**נמדד אחרי** (‏logs/ux22/after.json, ‏build טרי על ‏3363): דף הקטגוריה ללא שינוי גיאומטרי (‏5168 / 3737 / 3098px, אין מתג, אין דפדוף); ‏/products: המתג ‏350x36 ב-y=5165.5 ב-380 מתחת לדפדוף (‏738x36 ב-768, ‏1170x36 ב-1440), '
    'בחירת "גלילה רציפה" מסתירה את הדפדוף, הכפתור ‏128x44 נראה באמצע טעינה ב-1440, ‏46 כרטיסים ברשימה אחת אחרי הגעה לתחתית, הספירה "מציגים את כל 46 התוצאות", ה-live region קרא את המשפט, ‏localStorage=scroll, '
    'ואחרי ‏reload הרשת התמלאה מחדש ל-46 בלי דפדוף; ‏/api/catalog/page?page=2 עונה ‏200 עם ‏22 פריטים; אפס שגיאות דף; ‏hydration נקי (‏logs/ux22/hydration-probe.mjs: אין ‏console.error של ריאקט, הצומת של התמונה הראשונה נשאר מחובר). '
    'נעוץ ב-catalog-paging.test (8), ‏catalog-archive.test (10), ‏api/catalog/page/route.test (6), ‏CatalogGrid.test (10), ‏e2e/catalog-infinite-scroll.spec.ts (‏3 מקרים, ‏6/6 ב-chromium + mobile-chrome); שכני ‏e2e: ‏category / category-grid / category-seo ‏49 עברו ו-2 נכשלו תחת עומס ה-vitest המלא (‏:265 תמונות, ‏:396 combobox), '
    'ושניהם עברו ‏18/18 בשתי ריצות מלאות של ‏category.spec על מכונה שקטה (‏:215 נכשל פעם אחת מתוך שתיים, מצב ריק של מותג לא ידוע, לא בתחום); ‏listing-controls + layout-stability ‏47 עברו. '
    'שערים: ‏vitest ‏869 קבצים / ‏10050 ירוקים, ‏type-check ו-lint נקיים, ‏build טרי ירוק (שער ה-csp נקי). שער ההשוואה: ‏--page=category מסרב "live side is our-build" ושורת ‏REFUSED נכתבה. '
    'ה-ledger של הנתיבים הציבוריים, מלאי העוגיות ו-docs/RATE-LIMITS קיבלו את הנתיב והמפתחות; ‏docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md §4.2 מתעד את ההחלטה. ‏COMPONENT-QUEUE קיבל שורת ledger (UX22). '
    'הפירוט ב"החלטות שהתקבלו לבד (UX22)". המשך מ: ‏UX23)'
)
lines[2] = new_updated
lines.insert(3, 'קודם: ' + old_updated[len('Updated: '):])

decisions = (
    '**החלטות שהתקבלו לבד (UX22, 23:20):** (1) **העימוד הממוספר נשאר ברירת המחדל וה-HTML**: §4.2 של מסמך הארכיטקטורה הכריע נגד infinite scroll בגלל אינדוקס, והמתג לא הופך את זה: הגלילה הרציפה היא בחירה של הקונה שנשמרת ב-localStorage ולא ב-URL, '
    'נקראת ב-effect אחרי ההידרציה, ו-Googlebot ומי שה-storage שלו כבוי מקבלים ‏<a href="?page=2">. (2) **הכרטיסים נכנסים לאותו ‏<ul>** ולא לרשת שנייה: רשימה אחת לקורא מסך ו-flex-wrap אחד, ו-24 מתחלק ב-2/3/5 עמודות כך שהתפר בלתי נראה; '
    'כרטיס שהגיע בגלילה מצויר באותו ‏CategoryProductCard עם ‏blur והיסטוריית מחיר מהנתיב, לא מ-HTML שנשלף. (3) **נתיב JSON ולא ‏server action שמחזיר JSX**: ‏GET שניתן לקשקש בקצה, שאינו כפוף לבדיקת ה-origin של ‏server actions, '
    'ושקורא לאותם ‏readers של ‏use cache שהדפים קוראים (הוכח ב-suggest/route.ts); הפרסרים הועלו ל-lib/catalog-archive.ts כדי ששלושת הקוראים יהיו פרסר אחד. (4) **זיכרון עומק ב-sessionStorage**: הפגם הקבוע של גלילה רציפה הוא כפתור "אחורה"; '
    'העומק נכתב לפי ה-URL המלא, מתמלא מחדש במקביל ומצורף לפי סדר עם עצירה בחור הראשון, ‏cap של 10 עמודים. (5) **המתג בתחתית ולא בסרגל הפקדים**: הסרגל נמדד מול ‏live ומלא; המתג יושב במקום שבו ההחלטה רלוונטית (ליד הדפדוף) ובגיאומטריית הגלולות שלו, '
    'ורק כשיש יותר מעמוד אחד, כלומר היום רק ב-/products. (6) **המתג חל על שני הארכיונים** (קטגוריה וחנות) כי שניהם חולקים ‏Pagination ואת אותה אנטומיה, והרכיב נכתב פעם אחת. '
    '(7) **ה-e2e נכתב על ‏/products**: אין קטגוריה עם עמוד שני בקטלוג (‏46 מוצרים, מקסימום ‏13 בקטגוריה), והמכניקה זהה בית-אחר-בית; דף קטגוריה מאומת כ"אין מתג, אין דפדוף, יש פירורי לחם". '
    '(8) **כשלי השכנים תחת עומס לא תוקנו ולא הוסתרו**: ‏:265 ו-:396 נכשלו כשה-vitest המלא רץ במקביל, עברו בבידוד ובשתי ריצות מלאות שקטות, ‏:265 עובר גם מול פרודקשן (ה-build שלפני השינוי); ‏:215 נכשל פעם אחת בלבד ואינו נוגע לרשת.'
)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX21'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated')
