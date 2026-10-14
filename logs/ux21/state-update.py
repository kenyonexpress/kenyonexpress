# -*- coding: utf-8 -*-
# UX21: the STATE.md edit (Updated line, the previous line kept as קודם, the
# decisions paragraph before UX20's). A file and not a heredoc because a
# python heredoc with Hebrew dies on the \xd7 encoding check.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-14 22:05 (UX20'), lines[2][:40]
old_updated = lines[2]
new_updated = (
    'Updated: 2026-10-14 22:40 (UX21 דף תוצאות החיפוש: סרגל פקדים, סינונים בחלון, צ׳יפים פעילים, דפדוף, מצב ריק מאומת, וכשל ‏Meilisearch שנעשה גלוי. '
    '**נמדד לפני** (‏logs/ux21/before.json, ה-build הקיים של ‏ced6e7dc5 ב-380/768/1440 על ‏3361, אנונימי, ‏/search?q=זוג + חיפוש ריק + חיפוש מסונן לאפס + קצר מדי): '
    'אין סרגל ואין פקד מיון (המנוע קיבל ‏sort= ואיש לא הגדיר אותו); ניווט הפאסטים מתחת לרשת ב-y=2011 בדף של ‏2972px ב-380 (‏1433 ב-768, ‏1090 ב-1440 מול ‏viewport של ‏900), '
    'כלום במסך הראשון לא אמר שאפשר לצמצם; בחיפוש המסונן-לאפס הצ׳יפים ישבו בתוך הניווט ההוא ב-y=1220 מתחת למצב ריק ב-y=429 והמצב הריק לא הציע קישור שמסיר את הסינון; '
    'סרגל הצד של הארכיון מתחתיו הציע ‏type פעמיים וטופס מחיר שהתעלם מה-URL; ‏48 תוצאות בלי עמוד שני; שורת הספירה הדפיסה "· Meilisearch" לקונים. '
    'ה-build הראשון של אחרי גילה גם ששדה החיפוש של הדף (מוזרע בשאילתה) שאל את ‏suggest על השאילתה של עצמו בכל טעינה ופתח את ה-listbox מעל הסרגל, שורת הסינונים והכרטיס הראשון '
    '(‏SiteSearch.test נעץ את ה-fetch הזה כ-1 תחת הכותרת "בלי לשאול"). '
    '**עכשיו**: ‏SearchControlBar (אנטומיית סרגל הארכיון: ארבעה סדרים כ-router.push שמפיל את העמוד, קישור "סינון" בטלפון עם ספירת הפעילים שפותח את ‏details#search-filters וקופץ אליו, מתג רשת/רשימה המשותף); '
    '‏SearchActiveFilters מעל הרשת (צ׳יפ לכל פאסט, צ׳יפ מחיר שלא היה, "נקו הכל" לשאילתה ולמיון בלבד); ‏SearchFilters כשורת ‏<details> סגורה אחת של ‏44px מתחת לסרגל שהקישורים זורמים לתוכה '
    '(‏SearchFacetNav בלי הצ׳יפים) עם ‏SearchPriceForm (‏price_min / price_max, מוזרע מה-URL), וסרגל הצד של הארכיון הוסר מהדף; ‏lib/search/paging.ts (‏24 לעמוד, ‏?page=N כ-offset, מוגבל מתחת ל-1000 של הפרסר) + ‏Pagination של הארכיון; '
    '‏searchCountText עם הטווח בעמוד שני ו-data-engine על הספירה במקום התג; ‏lib/search/empty-state-server.ts שואל את המנוע (‏limit=1) לפני שהמצב הריק מציע "הצגת כל ‏N התוצאות ללא סינון" בחיפוש מסונן (ואומר כשזה אפס) '
    'או "אולי התכוונתם ל" (רק עם ספירה מעל אפס); השדה המוזרע שותק עד הקשה. '
    '**‏Meilisearch**: נמדד מול פרודקשן (‏kenyonexpress.vercel.app): ‏MEILISEARCH_HOST + ‏API_KEY מוגדרים ב-Production, ‏/api/ready אומר ‏meilisearch: ok, ו-/api/search/facets?q=ספא עונה ‏engine: database, ‏suggest עונה ‏database-fts; '
    'כל חיפוש נכשל ונסוג בלי שורת לוג (שלושה קוראים עם ‏if (!res.ok) return null ו-catch ריק). כל בקשת חיפוש יוצאת עכשיו דרך ‏lib/search/meili-request.ts (‏search.meili_unavailable עם הסטטוס וקוד השגיאה של המנוע, ניסיון שני בלי ‏locales בשרת לפני ‏1.10), '
    'ו-checks.ts מריץ חיפוש ‏limit=1 על אינדקס המוצרים אחרי ‏/health, כך ש-ok פירושו שחיפוש חוזר ומארח חי שלא מחפש הוא ‏down עם הקוד בפירוט (‏docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md §2.9). '
    '**נמדד אחרי** (‏logs/ux21/after.json, ‏build טרי על ‏3362): סרגל ‏350x49.6 ב-y=429.6 ב-380 (‏738x45.9 ב-y=261.7 ב-768, ‏1170x45.9 ב-y=301.7 ב-1440), מיון בארבעה סדרים, קישור הטלפון ‏60x44 גלוי ב-380 ומוסתר מ-768 שבו המתג מוצג; '
    'שורת הסינונים ‏46px סגורה ב-y=491 / 319.6 / 359.6, מעל הרשת ובתוך המסך הראשון בכל רוחב, נפתחת לסוג / קטגוריה / זמינות עם ספירות ולטופס המחיר; מסונן-לאפס: צ׳יפים ב-y=479 מעל המצב הריק ב-y=611 ב-380, והקישור הראשון "הצגת כל ‏7 התוצאות ללא סינון" ל-/search?q=זוג; '
    'בחירת ‏price_asc כותבת ‏?q=זוג&sort=price_asc והכרטיס הראשון הוא זה של ‏9 ₪; אין סרגל צד; אפס שגיאות דף; הדף ‏2537px ב-380 (היה ‏2972). '
    'נעוץ ב-meili-request.test (10), ‏results-page.test (14), ‏empty-state-server.test (6), ‏SearchControlBar.test (6), ‏search-results-strip.test (4), ‏checks.test (+4), ‏facet-links.test ו-SiteSearch.test תוקנו, ‏e2e/search-results.spec.ts (‏8 מקרים ב-chromium + mobile-chrome: ‏27 עברו יחד עם מפרטי החיפוש של ‏home ושני תקציבי ה-CLS של החיפוש; שני הכישלונות הם ‏home.spec "renders the header search combobox" שנופל על ‏checkbox של ההסכמה בדף הבית ונופל גם על ‏HEAD לפני השינוי). '
    'שערים: ‏vitest ‏865 קבצים / ‏10015 ירוקים, ‏type-check ו-lint נקיים, שני builds טריים ירוקים (שער ה-csp נקי בשניהם). שער ההשוואה: ‏--page=search מסרב "live side is our-build" ושורת ‏REFUSED נכתבה. ‏COMPONENT-QUEUE קיבל שורת ledger (UX21). '
    'הפירוט ב"החלטות שהתקבלו לבד (UX21)". המשך מ: ‏UX22)'
)
lines[2] = new_updated
lines.insert(3, 'קודם: ' + old_updated[len('Updated: '):])

decisions = (
    '**החלטות שהתקבלו לבד (UX21, 22:40):** (1) **הסינונים בחלון סגור ולא בפאנל פתוח**: ‏<details> אחד של ‏44px מתחת לסרגל, סגור כברירת מחדל גם בדסקטופ, כי פאנל פתוח מעל הרשת דוחף כל שורה למטה '
    'ורצועת הצ׳יפים כבר אומרת מה מופעל; קישורי הפאסטים זורמים לתוך החלון הסגור כך שגובה השורה זהה לפני ואחרי תשובת המנוע והמעטפת שומרת את אותה שורה (הערות ה-CLS של ‏page.tsx). '
    '(2) **סרגל הצד של הארכיון הוסר מדף החיפוש**: הפאסטים מכסים את רשימות הסוג והקטגוריה שלו עם ספירות, וטופס המחיר עבר לתוך החלון וכותב את שמות המנוע (‏price_min / price_max) במקום ‏min / max; '
    '‏toFacetSearchParams עדיין קורא את שני הזוגות. (3) **‏24 לעמוד ו-?page=N**: רוחב העמוד הוא ברירת המחדל של המנוע; ‏offset ‏1000 של הפרסר מגביל את העמוד האחרון ל-42; ‏page נזרק משמירת חיפוש (‏saved.ts DROPPED) ומכל קישור פאסט. '
    '(4) **דלתות המצב הריק מאומתות במנוע**: חיפוש ‏limit=1 אחד לשאילתה החשופה כשהחיפוש מסונן ואחד לשאילתה המרוככת, דרך אותו ‏facetedSearchCached (ה-cache של הבקשה; החיפוש של הדף לא חוזר על עצמו); "אולי התכוונתם" מוצג רק עם ספירה מעל אפס, '
    'כי הניחוש הישן יכול היה לנחות על דף ריק שני. (5) **השדה המוזרע לא שואל עד הקשה**: ‏typed ref ב-SiteSearch; ‏SiteSearch.test נעץ את ה-fetch כ-1 תחת כותרת שאמרה ההפך, ותוקן ל-0 ואז ‏1 אחרי הקשה. '
    '(6) **הכשל של ‏Meilisearch נרשם ולא מתוקן**: הסיבה בפרודקשן לא נראית מבחוץ בלי המפתח, והמפתח לא נמשך מקומית; ‏meili-request.ts מתקן בעצמו רק את מקרה ה-locales (שרת לפני ‏1.10) ורושם את כל השאר עם הקוד, ובדיקת המוכנות מדווחת ‏down עם הקוד כדי שהפריסה הבאה תגיד מה השבר. '
    '(7) **שם המנוע לא מודפס לקונים**: ‏data-engine על שורת הספירה בלבד. (8) **‏home.spec "renders the header search combobox" נכשל גם ב-HEAD** על ‏input type=checkbox של ההסכמה בדף הבית; לא מתחום ‏UX21, לא תוקן, מתועד כאן.'
)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX20'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated')
