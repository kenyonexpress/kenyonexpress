# -*- coding: utf-8 -*-
# UX25: the STATE.md edit (Updated line, the previous line kept as קודם, the
# decisions paragraph before UX24's) and the COMPONENT-QUEUE ledger row.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-15 02:00 (UX24'), lines[2][:40]
old_updated = lines[2]
new_updated = (
    'Updated: 2026-10-15 03:05 (UX25 דף 404 ממותג: שדה חיפוש, קטגוריות פופולריות, קישור לבית. '
    '**נמדד לפני** (‏logs/ux25/before.json, ה-build הקיים של ‏99ceaf9e9 ב-380/768/1440 על ‏3364, אנונימי, ‏/this-page-does-not-exist-ux25 ו-/product/no-such-product-slug-12345): ‏URL שלא תואם שום מסלול רונדר את ‏src/app/not-found.tsx **בלי שום ‏chrome** (‏header false, ‏footer false, בלי ‏skip link, בלי שדה חיפוש), ‏404 חשוף באמצע דף לבן; ‏slug מת של מוצר רונדר את אותו קובץ **בתוך** מעטפת החנות עם ה-`<main>` של הקובץ מקונן ב-`<main id="main-content">` (שני ‏landmarks); בשני המקרים אפס שדות חיפוש, אפס קישורי קטגוריה, שלושה קישורי טקסט בלבד. ‏docs/ARCHITECTURE-SEO.md §6.4 ביקש "קישורים לקטגוריות מובילות וחיפוש" מההתחלה. '
    '**עכשיו**: ‏components/not-found/NotFoundBody (‏async, גוף אחד לכל ‏not-found.tsx, **לא** ‏`<main>`): סימן מותג (‏data-not-found-mark, עיגול ‏brand-primary ‏112/128px עם שקית וסימן שאלה ותג ‏404), ‏H1 "הדף שחיפשתם לא נמצא" (הכותרת שמפרטי ה-e2e של מוצר וקטגוריה מחפשים), משפט אחד, אותו ‏SiteSearch של המסטהד עם ‏id="not-found-search" (‏variant page, המאונט הרביעי ב-search-ui.test), ‏nav "דרכים להמשיך" של שלושה קישורים ‏44px כשהבית ראשון (‏pill ‏brand-primary), לכל המוצרים, צרו קשר, ושש קטגוריות מאותה קריאה מקושקשת של דף הבית (‏getHomeCategoryTiles, ‏slice ל-6, בלי שאילתה משלו, מרונדר מראש ל-/_not-found) ברשת ‏2/3/6 עמודות בכרטיס של ‏CategoryGrid (‏rounded-elevated, ‏shadow-card-hover, זום ‏5%); קריאה שנכשלת מפילה את המקטע ולא את הדף. ‏src/app/not-found.tsx עוטף את הגוף ב-StoreShell למקרה היחיד שאין לו ‏layout אחר, ו**שבע** קבוצות המסלולים עם ‏layout משלהן (‏(store), ‏(main), ‏(account), ‏(legal) חשוף; ‏(admin), ‏(supplier), ‏(auth) ‏compact: בלי חיפוש ואריחים) קיבלו ‏not-found.tsx משלהן, כי ‏Next מוריש את הקובץ הקרוב לכל ‏layout מקונן ומרנדר אותו **בתוך** ה-layouts של המסלול שזרק ‏notFound(), ובלי זה הכותרת הייתה מצוירת פעמיים. '
    '**נמדד אחרי** (‏logs/ux25/after.json, ‏build טרי על ‏3364): שני הנתיבים ‏404 עם ‏noindex, ‏header + ‏footer + ‏skip link בכל רוחב, סימן המותג, השדה ‏270x40 ב-380 (‏474x40 ב-768/1440) כ-combobox, שישה אריחי קטגוריה ב-2/3/6 עמודות (‏330x571 / ‏670x393 / ‏1150x215) תחת "קטגוריות פופולריות", "לדף הבית" ‏105.7x44 ושלושת הקישורים ‏44, הקלדה + ‏Enter פותחת ‏/search?q=ברביקיו, ‏scrollWidth = ‏viewport, אפס שגיאות דף. '
    'נעוץ ב-NotFoundBody.test (7), ‏error-pages.test (ההרכבה + קובץ לכל קבוצה, 3), ‏search-ui.test (המאונט הרביעי), ‏e2e/not-found.spec.ts (‏4 מקרים, ‏8/8 ב-chromium + mobile-chrome) ושכני ה-404 של ‏product.spec ו-category.spec (‏4/4). שערים: ‏vitest ‏879 קבצים / ‏10139 ירוקים, ‏type-check ו-lint נקיים, ‏build טרי ירוק (שער ה-csp נקי, ‏/_not-found מרונדר מראש), שער הבית ‏REFUSED (‏live side is our-build, כמו ‏UX22-24). ‏docs/ARCHITECTURE-SEO.md §6.4 מתעד; ‏COMPONENT-INVENTORY קיבל מקטע; ‏COMPONENT-QUEUE קיבל שורת ledger (UX25). הפירוט ב"החלטות שהתקבלו לבד (UX25)". המשך מ: ‏UX26)'
)
lines[2] = new_updated
lines.insert(3, 'קודם: ' + old_updated[len('Updated: '):])

decisions = (
    '**החלטות שהתקבלו לבד (UX25, 03:05):** (1) **גוף אחד ושמונה קבצים**: נמדד ש-Next מרנדר את ‏not-found.tsx של השורש **בתוך** ה-layouts של המסלול שזרק (‏slug מת של מוצר קיבל את מעטפת החנות, ‏URL לא תואם לא קיבל כלום), ולכן עטיפת השורש ב-StoreShell נכונה רק למקרה הלא-תואם; כל קבוצה עם ‏layout קיבלה ‏not-found.tsx שמרנדר את הגוף חשוף, ו-error-pages.test מונה את הקבוצות ונכשל על קבוצה חדשה בלי קובץ. '
    '(2) **הגוף אינו ‏`<main>`**: כל ‏layout שהוא נוחת בו כבר מחזיק אחד (נמדד לפני: שני ‏main מקוננים ב-slug מת). '
    '(3) **"פופולריות" = אריחי דף הבית**: אותה קריאה מקושקשת (‏use cache, ‏CacheLife.home) ולא שאילתה חדשה ולא ‏hits, כי אין מדד פופולריות אמיתי בטבלה (‏category-tokens מסיר ‏popularity מהמיון מאותה סיבה); שישה כדי להתחלק ב-2/3/6. '
    '(4) **‏compact לאדמין, לספק ול-auth**: שדה חיפוש של קונים בתוך סרגל האדמין הוא ההצעה הלא נכונה; הבית והקטלוג נשארים. '
    '(5) **‏Tailwind בלבד, בלי גיליון חדש**: הסימן הוא ‏SVG inline ‏aria-hidden ותג ‏pill; כל ערך הוא טוקן (‏brand-primary, ‏heading, ‏muted, ‏border, ‏pill, ‏elevated, ‏touch-min, ‏container-deals) כדי לא להוסיף ‏chunk לשער הגיליון היחיד. '
    '(6) **המאונט הרביעי של ‏SiteSearch** נרשם ב-search-ui.test עם ‏id קבוע משלו, כי דף ‏404 ב-1440 מציג גם את פיל המסטהד ושני ‏id זהים היו ‏aria-controls שבור. '
    '(7) **הגיבוי היומי לא הורץ שוב**: ‏kenyonexpress-backup-2026-10-15-0052 קיים ושלושה נשמרים; ‏caffeinate ולולאת ‏tmux ‏ke-autopilot חיים (‏pgrep לא רואה את הלולאה, ‏ps כן).'
)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX24'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))

q = 'docs/COMPONENT-QUEUE.md'
t = io.open(q, encoding='utf-8').read()
assert t.endswith('\n')
row = (
    '| 2026-10-15 | 404 page: branded design, search bar, popular categories, home link (UX25) | '
    'measured before (logs/ux25/before.json, the existing build of HEAD 99ceaf9e9 at 380/768/1440 on 3364, anonymous, /this-page-does-not-exist-ux25 and /product/no-such-product-slug-12345): '
    'an unmatched URL rendered src/app/not-found.tsx with NO chrome (header false, footer false, no skip link, no search field), a bare 404 on a white page; a dead product slug rendered the same file INSIDE the store shell with the file\'s own `<main>` nested in `<main id="main-content">` (two landmarks); both cases offered zero search fields, zero category links and three text links. docs/ARCHITECTURE-SEO.md §6.4 had asked for "links to the leading categories and search". '
    'Now: components/not-found/NotFoundBody (async, one body for every not-found.tsx, NOT a `<main>`): the brand mark (data-not-found-mark, a brand-primary disc with a bag + question mark and a 404 pill), the H1 הדף שחיפשתם לא נמצא (the heading product.spec and category.spec look for), one sentence, the masthead\'s own SiteSearch with id="not-found-search" (variant page, the fourth mount in search-ui.test), a nav דרכים להמשיך of three 44px links with home first (brand-primary pill), לכל המוצרים and צרו קשר, and six tiles from the home page\'s cached getHomeCategoryTiles (sliced, no query of its own, prerendered into /_not-found) in 2 / 3 / 6 columns with CategoryGrid\'s card; a failed read drops the section, not the page. src/app/not-found.tsx wraps the body in StoreShell for the one case with no other layout, and the seven route groups with a layout ((store), (main), (account), (legal) bare; (admin), (supplier), (auth) compact: no search, no tiles) carry a not-found.tsx of their own, because Next inherits the nearest file into every nested layout and renders it INSIDE the throwing route\'s layouts, which would paint the header twice. '
    'Measured after (logs/ux25/after.json, a fresh build on 3364): both paths 404 + noindex with header, footer and skip link at every width, the brand mark, the field 270x40 at 380 (474x40 at 768 / 1440) as a combobox, six category tiles in 2 / 3 / 6 columns (330x571 / 670x393 / 1150x215) under קטגוריות פופולריות, לדף הבית 105.7x44 and all three links 44 tall, typing + Enter opens /search?q=, scrollWidth = viewport, zero page errors. '
    'Pinned by NotFoundBody.test (7), error-pages.test (composition + a file per group, 3), search-ui.test (fourth mount), e2e/not-found.spec.ts (4 cases, 8/8 on chromium + mobile-chrome) and the 404 neighbours in product.spec and category.spec (4/4). docs/ARCHITECTURE-SEO.md §6.4 and COMPONENT-INVENTORY record it. |\n'
)
io.open(q, 'w', encoding='utf-8').write(t + row)
print('ok', idx)
