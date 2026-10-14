# -*- coding: utf-8 -*-
# UX15: prepend the Updated line, demote the previous one, add the decisions block.
import io
p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
updated = (
    "Updated: 2026-10-14 17:55 (UX15 דף המוצר: זום בריחוף ורצועת תמונות ממוזערות בגלריה, קבוצת גרסאות, סטפר כמות, הוספה מוכרזת ופס קנייה שעוקב אחרי הקונה. "
    "**נמדד לפני** (‏logs/ux15/before.json, ה-build הקיים של ‏192fa0120 ב-380/768/1440 על ‏3350, ‏/product/6253): הכמות שדה מספר חשוף ‏140x41 בלי ‏−/+ (הספינר מוסתר; אין דרך לשנות בלי מקלדת), הגלריה הגדילה רק בנגיעה או ‏Enter ועכבר במנוחה לא עשה כלום (‏data-zoomed ‏null אחרי ‏mouse.move), התמונות הממוזערות ב-flex-wrap (שורה נוספת לכל שישייה, לכל רביעייה בטלפון), אין שום קבוצת גרסאות (‏product_variants ריק לכל המוצרים, כמו שהטסט של הסטפר מתעד), ושום דבר לא עקב אחרי הקונה אחרי שהשורה יצאה מהמסך. "
    "**עכשיו**: ‏ProductGallery: עכבר במנוחה מגדיל ‏x2 סביב הסמן והתמונה עוקבת אחריו, עזיבה מחזירה, קליק לא מקבע (‏pointerType מבדיל בין עכבר לאצבע, לא ‏media query), אצבע עדיין מקבעת בנגיעה ו-Enter/Escape נשארו; ‏data-zoom-mode ‏hover/pinned; רצועת תמונות ממוזערות ‏nowrap עם ‏overflow-x, ‏scroll-snap ובלי ‏scrollbar, והרצועה (ולא הדף) נגללת אל הממוזערת הנוכחית. ‏ProductInfo: ‏fieldset \"בחרו גרסה\" שהופך ל\"גרסה: X\" עם ‏aria-pressed, מחיר בתוך הכפתור רק לגרסה שמחירה שונה, גרסה שאזלה נשארת בשורה מושבתת עם \"אזל\" (‏aria-hidden) ו-aria-describedby, ורמז \"בחרו גרסה כדי להוסיף לסל\"; הכמות היא ‏fieldset ‏140x41 (הגיאומטריה הנמדדת, ‏pinned) עם ‏− / שדה / +: ‏inputMode numeric, מותר לרוקן ולהקליד מחדש (ה-draft נסגר ב-blur למספר האחרון), הכפתורים נעצרים ב-1 ובתקרה, המסגרת ‏inset box-shadow כדי ששלושת הפקדים יהיו ‏44 במגע; ‏output aria-live \"X נוסף לסל\". ‏PdpStickyBar: ‏section \"הוספה מהירה לסל\" עם השם, המחיר (של הקופון כשיש), הגרסה והכמות, וכפתור ‏44 עם אותו ‏handler ואותה תווית; נטען רק אחרי שהשורה עברה מעל ה-viewport (‏useScrolledPast: ‏IntersectionObserver אחד עם ‏rootMargin כלפי מטה, כי קפיצה ממתחת-לקפל למעלה-מהמסך לא ירתה ב-380 ולא הראתה כלום בריצה הראשונה), נעלם כשחוזרים, ‏body.pdp-sticky-visible מרפד את התחתית ומרים את הוואטסאפ, יושב מעל פס העגלה של הטלפון כשהוא למעלה ומתחת לשמורת ההסכמה, ‏1170 ממורכז מ-1200. טוקן ‏--spacing-pdp-sticky. "
    "**נמדד אחרי** (‏logs/ux15/after.json): ‏380 קבוצה ‏140x44, סטפרים ‏44x44, הפס ‏380x64 אחרי גלילה ונעלם בחזרה למעלה; ‏768/1440 קבוצה ‏140x41, סטפרים ‏40x41, ריחוף: ‏data-zoomed ‏true, ‏scale(2), ‏origin ‏25% 75%, קליק משאיר ‏hover, עזיבה מנקה; הפס ‏768x64 ו-1170x64 (‏x135), כפתור ‏124.6x44, ‏z 40, ‏padding-bottom של ‏body גדל ב-64. נעוץ ב-ProductGallery.test.tsx (+4), ‏product-variant-quantity.test.tsx (+7), ‏ProductInfo.sticky.test.tsx (6) ו-e2e/product-buy-row.spec.ts (‏9 עברו, ‏1 דולג, ב-chromium + mobile-chrome; הרצועה נבדקת במוצר עם שתי תמונות). "
    "שערים: ‏vitest ‏844 קבצים / ‏9787 ירוקים, ‏type-check ו-lint נקיים, ‏build ירוק (‏rm -rf .next, פעמיים), שער המוצר ‏5.33 / 4.07 / 2.56 מול ‏refs/electro_product_{width}.png (ריצה חשופה מסרבת \"live side is our-build\" וכותבת שורת ‏REFUSED). שכני ‏e2e (‏product, touch-targets, cart, layout-stability, a11y בשני הפרויקטים): ‏157 עברו, ‏56 נכשלו, כולם בקבוצה הידועה של ‏UX13 (‏target-size בקישורי הקטגוריה של המוצרים הקשורים, ‏a[התחברות] ‏72x41, ‏Tab stops, עמודי ‏legal) חוץ מ-product.spec:133 שנופל על ‏strict mode (שתי ‏.pdp-related__grid מאז ‏STEP 57; לא הורץ ב-UX12/13; ‏logs/ux15/neighbours-diff.txt). "
    "‏COMPONENT-QUEUE קיבל שורת ledger (UX15). הפירוט ב\"החלטות שהתקבלו לבד (UX15)\". המשך מ: ‏UX16)"
)
decisions = (
    "**החלטות שהתקבלו לבד (UX15, 17:55):** (1) **‏UX14 כבר ב-HEAD** כ-\"autopilot residual\" ‏192fa0120 (פקדי הרשימה: ‏CatalogViewProvider, ‏CategoryActiveFilters, ‏Pagination, ‏logs/ux14) בלי הודעת commit של ‏UX14 ובלי שורה ב-STATE; לא נכתב מחדש כאן כי ה-goal הוא ‏UX15, והתור ממשיך מ-UX16. "
    "(2) **הסטפר בתוך הקופסה הנמדדת** ‏140x41 ולא פקד נוסף: הגיאומטריה של האתר החי נשמרת לפיקסל ושער המוצר ירד (‏5.33 / 4.07 / 2.56 מול ‏5.65 / 4.95 / 2.92 של ‏25.09). "
    "(3) **קליק עכבר לא מקבע זום**: עכבר כבר מגדיל בריחוף, והגדלה שנשארת אחרי שהסמן עזב היא מה שכל קונה שלחץ \"לראות גדול\" צריך אחר כך למצוא דרך לצאת ממנה; ‏Enter מקבע למי שצריך. "
    "(4) **הפס הדביק רק אחרי שעברו את השורה**, לא בציור הראשון ולא כשהשורה מתחת לקפל: שליטה כפולה ליד הראשונה היא כפילות, וכך גם צילום עמוד מלא של השער לא רואה אותו. "
    "(5) **‏fieldset/legend** במקום ‏div role=group לפי ‏biome ‏useSemanticElements; ה-legend של הכמות ‏sr-only, והאיפוסים (‏border/padding/min-width) ב-CSS. "
    "(6) **סימון \"אזל\" ‏aria-hidden** כדי שהשם הנגיש של הכפתור יישאר השם (הטסטים הקיימים מחפשים ‏name מדויק); קורא מסך מקבל \"אזל מהמלאי\" דרך ‏aria-describedby לאלמנט ‏hidden. "
    "(7) **השער הושלם עם ‏--live-png**: הריצה החשופה מסרבת (\"live side is our-build\", ‏rc=5) וכתבה שורת ‏REFUSED ל-UI-PARITY-REPORT; השורה נשארת כי השער כותב את הרשומה שלו בעצמו, ושלוש שורות ‏PASS מתחתיה. נשמר כזיכרון. "
    "(8) **השרת על ‏3350 נהרג לפי ‏PID**: ‏next-server של ‏UX14 שנשאר רץ מה-worktree הזה בלי סוכן מחובר (‏cwd נבדק ב-lsof), ושיתף את ‏.next שה-build המחודש מוחק. "
    "(9) **‏rootMargin כלפי מטה ב-IntersectionObserver**: בריצת ה-after הראשונה הפס לא הופיע ב-380 כי ‏scrollTo קפץ מעל השורה בלי חצייה; זה באג אמיתי בטלפון קצר, לא רק ב-probe. נשמר כזיכרון. "
    "(10) **הסכמה ב-e2e דרך העוגייה** (‏CONSENT_COOKIE כמו ‏touch-targets) ולא ‏localStorage: עם המפתח בלבד הבאנר נשאר למעלה ומכסה את שליש התמונה ב-720px של ‏Desktop Chrome, והריחוף פגע ב-`<p>` שלו (‏logs/ux15/hover-debug.mjs). נשמר כזיכרון. "
    "(11) **‏Supabase MCP ו-GitHub MCP לא מאושרים בסשן**; לא נדרשו: אין שינוי סכימה ואין ‏PR (הענף נדחף ישירות כמו ‏UX02 עד ‏UX13). "
    "(12) **תחזוקה**: הגיבוי היומי של ‏14:57 (‏812MB ב-~/) קיים ויחיד, אין מה למחוק; ‏caffeinate רץ (‏3 מופעים), ‏SleepDisabled 1."
)
lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX13'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
