# -*- coding: utf-8 -*-
# UX13: prepend the Updated line, demote the previous one, add the decisions block.
import io
p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
updated = (
    "Updated: 2026-10-14 16:40 (UX13 הפוטר: ארבע עמודות מ-lg, אקורדיון מתחת, רשתות חברתיות, סימני תשלום. "
    "**נמדד לפני** (‏logs/ux13/before.json, ה-build הקיים של ‏efe44cf05 ב-380/768/1440 על ‏3347): שלוש עמודות ב-1440 (‏495 / 337 / 337), שתי שורות ‏`<details>` סגורות מתחת ל-lg עם ‏11 קישורים תחת \"שירות לקוחות\", ארבע תוויות טקסט של תשלום (‏Visa, Mastercard, Discover, American Express) בפס התחתון בדסקטופ בלבד ואפס בפס הכהה של הטלפון, אייקון טלגרם עם ‏`href=\"#\"` (טאב חדש שפותח כלום; לאתר החי אין טלגרם), **ועמודות הקישורים בדסקטופ צוירו ריקות**: ‏logs/ux13/before-1440.png מראה שתי כותרות מעל כלום. ‏Chromium ‏131+ מסתיר ‏`<details>` סגור עם ‏`content-visibility: hidden` על ‏`::details-content`, ו-`display: block !important` על הילדים לא מגיע לשם; לקישורים היו תיבות ‏39x18 ו-`checkVisibility()` ‏false (‏logs/ux13/details-probe.mjs, ‏Chromium ‏148 של ‏Playwright), ולכן כל ‏probe לפי ‏rect וגם השער עברו מעליו. "
    "**עכשיו**: ארבע עמודות מ-lg (‏`lg:grid-cols-[492fr_240fr_240fr_198fr]`, נמדד ‏462 / 225 / 225 / 186 ב-1440: יצירת קשר, שירות לקוחות ‏5, מדיניות ותקנון ‏6, אזור אישי ‏3) דרך רכיב אחד ‏`FooterLinkColumn`; ‏`.footer-disclosure::details-content { content-visibility: visible }` מ-lg (הכלל הישן נשאר למנועים בלי הפסאודו-אלמנט), והקישורים נצבעים (‏14/14 ‏`checkVisibility` ‏true); שלוש שורות סגורות של ‏50px מתחת ל-lg שנפתחות בנגיעה; שורת הרשתות היא ‏`<nav aria-label=\"רשתות חברתיות\">` של חמישה פרופילים אמיתיים ב-https; תשלום כ-`PaymentLogos` (חמישה ‏SVG ‏inline: ויזה, מאסטרקארד, אמריקן אקספרס, ישראכרט, דיינרס, ‏`role=\"img\"` עם שם עברי, צבעים כטוקני ‏`--color-payment-*`) בפס הדסקטופ **וגם** בפס הכהה של הטלפון. "
    "**נמדד אחרי** (‏logs/ux13/after.json): הפוטר ‏426.5px ב-380/768 (היה ‏339.5: שורה אחת נוספת והסימנים), ‏553 ב-1440 (היה ‏536). נעוץ ב-SiteFooter.test.tsx (8), ‏PaymentLogos.test.tsx (4) ו-e2e/footer.spec.ts (‏7 עברו, ‏1 דולג, ב-chromium + mobile-chrome). "
    "שערים: ‏vitest ‏838 קבצים / ‏9737 ירוקים, ‏type-check ו-lint נקיים, ‏build ירוק (‏rm -rf .next), שער הבית ‏2.22 / 1.24 / 1.32 (ללא שינוי; הפוטר מתחת ל-2600px); עגלה וצ'ק-אאוט מסרבים (\"live side is our-build\", אין צילום קפוא שלהם). שכני ‏e2e: ‏home-rtl ו-home.spec באותה קבוצה ידועה של ‏UX12; ‏rtl-mobile ב-320px קורא ‏323 בכל דף עם ‏header, והפוטר נמדד ‏320 בלי אף תיבה חורגת, הסרת הפוטר משאירה ‏323 והסרת ה-header נותנת ‏320 (‏logs/ux13/overflow-probe2.mjs): קיים מראש, בצד ה-header, לא השלב הזה. "
    "‏COMPONENT-QUEUE קיבל שורת ledger (שורה 10, UX13). הפירוט ב\"החלטות שהתקבלו לבד (UX13)\". המשך מ: ‏UX14)"
)
decisions = (
    "**החלטות שהתקבלו לבד (UX13, 16:40):** (1) **העמודה הרביעית היא המדיניות** (תקנון, פרטיות, ביטולים והחזרות, משלוחים, עוגיות, נגישות): ‏11 קישורים תחת כותרת אחת היו בטלפון שורה של ‏49px שמסתירה רשימה ארוכה מהמסך, והפיצול מכניס את הפוטר לצורת ארבעת ה-widgets של ‏Electro בלי להמציא תוכן; כל מחרוזת וכל נתיב היו שם קודם. "
    "(2) **שורת אקורדיון שלישית בטלפון, סגורה** כמו שתי הקודמות, לפי אותו כלל של ‏D25 (‏refs/ke_live_computed.json מחזיק את התפריט מקופל בדפים שהשער מודד). ההשפעה על עגלה/צ'ק-אאוט לא נמדדת: השער מסרב לשניהם כי הצד החי הוא ה-build שלנו ואין להם צילום קפוא; ‏50px בתחתית דף הם מתחת לרעש שתועד להם. "
    "(3) **‏`::details-content` במקום לפתוח ב-JS**: הפוטר נשאר רכיב שרת בלי ‏hydration; הכלל הישן נשאר למנועים ישנים. נעוץ בטסט שקורא את ‏globals.css. זה תיקון של באג אמיתי בכל ‏Chrome עדכני, לא ליטוש. "
    "(4) **סימני התשלום צוירו ‏SVG ‏inline ולא ‏`patment-icon.webp` של האתר החי**: התמונה היא ‏Electro demo (‏Discover, PayPal, Skrill), שניים מהם לא נסלקים כאן בכלל, כלומר קישוט ולא תוכן לפי ‏SOURCING-RULES. חמשת הסכמות הן מה שסולק ישראלי מסלק (ויזה, מאסטרקארד, אמקס, ישראכרט, דיינרס); ‏Discover הוסר. הצבעים כטוקנים חדשים ‏`--color-payment-*` (אותו כלל כמו ‏whatsapp/facebook: צבע של צד שלישי, לא ממותג מחדש עם ‏brand). קבצי ‏SVG תחת ‏public היו נכנסים לסריקת ה-assets ול-blur manifest בלי צורך. "
    "(5) **‏aria-hidden הוסר מ-`<text>`** (‏biome ‏noAriaHiddenOnFocusable); ‏`role=\"img\"` על ה-SVG כבר הופך את הילדים ל-presentational, והקורא שומע \"ויזה\" פעם אחת. "
    "(6) **טלגרם הוסר**: ‏`href=\"#\"` עם ‏target=_blank פותח טאב ריק; האתר החי לא מקשר טלגרם (‏grep על ‏refs/ke_live_home.html). ‏Twitter נשאר כי הוא שם. "
    "(7) **ה-probe מודד ‏checkVisibility ולא ‏rect** מעכשיו (‏logs/ux13/probe.mjs); גם ‏e2e/footer.spec.ts בודק צביעה אמיתית של ‏14 הקישורים. נשמר כזיכרון חוצה-סשנים. "
    "(8) **כשלון ‏rtl-mobile ב-320 אינו של הפוטר** (הוכח בהסרה, סעיף 'נמדד אחרי'); לא תוקן כאן כי ה-header מחוץ ל-goal, והקבוצה לא הייתה ברשימת ‏UX12 כי ‏UX12 לא הריץ את ה-spec הזה. "
    "(9) **‏Supabase MCP ו-GitHub MCP לא מאושרים בסשן**; לא נדרשו: אין שינוי סכימה ואין ‏PR (הענף נדחף ישירות כמו ‏UX02 עד ‏UX12). "
    "(10) **גיבוי**: הגיבוי של ‏14:56 (‏812MB ב-~/) הוא היומי; ‏caffeinate רץ (‏3 מופעים), ‏SleepDisabled 1. השרתים על ‏3347 ו-3348 נהרגו לפי ‏PID של ה-listener. ה-build הראשון נכשל על ‏tsc של קובץ הטסט החדש (‏noUncheckedIndexedAccess), השני הופסק כדי להכניס את תיקון ה-CSS, השלישי ירוק."
)
lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX12'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
