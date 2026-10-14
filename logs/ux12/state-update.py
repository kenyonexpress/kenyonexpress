# -*- coding: utf-8 -*-
# UX12: prepend the Updated line, demote the previous one, add the decisions block.
import io
p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
updated = (
    "Updated: 2026-10-14 15:45 (UX12 טופס הדיוור (‏`NewsletterSignup` בכרטיס הבית מתחת ל-lg, ‏`FooterNewsletterForm` בגלולת הפוטר מ-lg): אימות בעברית, מצבי שגיאה והצלחה, ‏RTL. "
    "**נמדד לפני** (‏logs/ux12/before.json, ה-build הקיים של ‏fe8442834 ב-380/768/1440 על ‏3346): שליחה עם שדה ריק פתחה רק את בלון הדפדפן בשפת הדפדפן (‏`validationMessage` \"Please fill out this field.\"), בלי שום אלמנט שלנו ובלי ‏aria-invalid; ‏`ofir@kenyon` עבר את בדיקת ‏`type=email` של הדפדפן, עשה סבב לשרת (‏3 POST מול ‏2 של טעינת הדף) וחזר עם \"כתובת מייל לא תקינה\" שנשאר על המסך גם אחרי שהוקלדה כתובת תקינה. "
    "**עכשיו**: שני הטפסים מריצים ‏hook משותף ‏`useNewsletterForm` (‏components/growth) מעל מודול אימות אחד, ‏`lib/growth/newsletter-form.ts`, שגם ה-server action מריץ (אותו משפט לאותה שגיאה בדפדפן ובשרת): ‏`noValidate` על שני הטפסים, הבדיקה רצה בשליחה (וב-blur של ערך לא ריק), כתובת לא תקינה נעצרת בדף עם משפט עברי ב-`role=alert` (ריק / בלי @ / צורה / ארוך מדי), ‏aria-invalid, ‏aria-describedby ופוקוס על השדה, בלי שום בקשה; הקלדה שעוברת את הבדיקה מנקה את המשפט ומבטלת את תשובת השרת האחרונה. "
    "‏pending משבית את הכפתור (\"שולח...\", ספינר בכרטיס, ‏aria-busy); כשל שרת (‏rate limit, כתיבה שנכשלה) מוצג בלי לסמן את השדה והכפתור נשאר חי לניסיון נוסף; ‏`NewsletterState` קיבל ‏`field: 'email'` כדי שהטופס יבדיל. הצלחה מחליפה את הטופס ב-`<output>` אחד: בכרטיס פאנל ‏brand-accent עם וי ירוק, \"בדקו את תיבת המייל\", משפט השרת, הכתובת שנשלחה כ-`<bdi dir=ltr>` ורמז לתיקיית הספאם; בגלולה שורת סטטוס באותו גובה כדי שהפס הצהוב לא יקפוץ. "
    "טוקן חדש ‏`--color-error` (‏#c93636, האדום של ‏deal-sale תחת שם של טופס; ‏5.68:1 על לבן) למסגרת, לטבעת ולמשפט בכרטיס; בגלולה המשפט בדיו הכותרת על הצהוב (אדום שם הוא ‏3.3:1). ‏newsletter.css איבד שישה ‏hex גולמיים לטובת טוקנים. "
    "**נמדד אחרי** (‏logs/ux12/after.json): בשלושת הרוחבים ‏noValidate ‏true, שליחה ריקה -> ‏alert \"נא להזין כתובת מייל\" ב-rtl, ‏aria-invalid ‏true, השדה בפוקוס, ‏2 POST (טעינת הדף בלבד); ‏`ofir@kenyon` -> \"כתובת המייל לא תקינה, למשל name@gmail.com\" בלי בקשה; הקלדה מתוקנת -> ה-alert נעלם. כרטיס: מסגרת וטבעת ‏1px ‏rgb(201,54,54), ‏alert ‏13px אדום; גלולה ‏470x41 ללא שינוי, ‏alert ‏12px דיו כותרת, טבעת ‏inset אדומה ‏2px בלי פוקוס (עם פוקוס ההילה הגלובלית של האתר מנצחת, כפי שניצחה גם את הטבעת הישנה). "
    "נעוץ ב-lib/growth/newsletter-form.test.ts (6), ‏NewsletterSignup.test.tsx (9), ‏FooterNewsletterForm.test.tsx (5), ‏newsletter-actions.test.ts (+2 מקרים) ו-e2e/newsletter-form.spec.ts (‏8/8 ב-chromium + mobile-chrome; אף כתובת תקינה לא נשלחת, ל-build המקומי יש מפתחות חיים). "
    "שערים: ‏vitest ‏836 קבצים / ‏9726 ירוקים, ‏type-check ו-lint נקיים, ‏build ירוק (‏rm -rf .next), שער הבית ‏2.22 / 1.24 / 1.32 (ללא שינוי, שני הטפסים מתחת ל-2600px). שכני ‏e2e: ‏120 עברו, ‏66 נכשלו, אותה קבוצה של ‏UX11 פלוס שלושה שנבדקו בנפרד (‏logs/ux12/neighbours-diff.txt): ‏coupons a11y במובייל עבר בהרצה חוזרת (מירוץ עם שלד הקופונים), ‏Tab-stop על ‏/ הוא קישור הוואטסאפ הידוע, ובדיקת באנר ההסכמה בלי סקריפט במובייל נתקעת על שני ‏`/_next/image` של ‏noscript שה-`next start` המקומי לא עונה להם (‏logs/ux12/noscript-probe.mjs); שתי בדיקות ‏home-rtl (‏20 עוגנים) עברו הפעם. "
    "‏COMPONENT-QUEUE קיבל שורת ledger (שורה 10, UX12). הפירוט ב\"החלטות שהתקבלו לבד (UX12)\". המשך מ: ‏UX13)"
)
decisions = (
    "**החלטות שהתקבלו לבד (UX12, 15:45):** (1) **מודול אימות אחד לדפדפן ולשרת** (‏`lib/growth/newsletter-form.ts`, מודול רגיל: לא ‏'use client' ולא ‏'use server', כי קובץ ‏'use server' מייצא רק פונקציות ‏async וערך מקובץ ‏'use client' הוא ‏proxy בשרת). ה-zod ‏`.email()` הוחלף בו; הבדיקה מכוונת לרפות מ-RFC ולהדוקה מהדפדפן (משהו לפני @, תוויות דומיין בלי תווית ריקה, תווית אחרונה של ‏2+), כי מייל ה-double-opt-in הוא שמחליט אם הכתובת אמיתית. "
    "(2) **‏noValidate על שני הטפסים**: ‏`required` ו-`type=email` נשארו לסמנטיקה; בלון הדפדפן מדבר בשפת הדפדפן ולא בשפת הדף. "
    "(3) **‏blur בודק רק ערך לא ריק**: מעבר ‏Tab דרך שדה ריק אינו טעות; שליחה עם ריק היא. "
    "(4) **תשובת השרת מתבטלת בהקלדה לפי זהות האובייקט**: ‏useActionState שומר את התשובה עד הבאה, ולכן לפני ‏UX12 \"כתובת מייל לא תקינה\" נשאר תחת כתובת מתוקנת; כל ‏return של ה-action הוא אובייקט חדש, אז התשובה הבאה תוצג. "
    "(5) **הכתובת שנשלחה מוצגת בהצלחה מצד הלקוח**: תשובת השרת זהה בכוונה לכל כתובת (לא לחשוף מי לקוח), והלקוח יודע מה הוקלד; ‏`<bdi dir=ltr>` כדי שהכתובת תיקרא משמאל לימין בתוך משפט עברי. "
    "(6) **אין אדום ואין לבן על הפס הצהוב**: המשפט בגלולה הוא דיו הכותרת עם אייקון; ‏--color-error הוא טוקן חדש בערך של ‏deal-sale (שם סמנטי לטופס, אדום אחד לאתר), והירוק ‏success נשאר אייקון בלבד (‏2.33:1 כטקסט). "
    "(7) **ההילה הגלובלית של ‏focus-visible מנצחת את הטבעת האדומה בזמן פוקוס** (‏6px דיו כותרת + outline צהוב, נמדד ב-logs/ux12/ring-probe.mjs); היא ניצחה כך גם את ‏ring-black/40 הישן, והאדום חוזר ב-blur. לא נגעתי בה. "
    "(8) **ה-probe וה-e2e לעולם לא שולחים כתובת תקינה**: ‏.env.local מחזיק ‏SUPABASE_SECRET_KEY ו-RESEND_API_KEY חיים, ושליחה תקינה הייתה כותבת שורת ‏pending בפרודקשן ושולחת מייל אמיתי. מצב ההצלחה נעוץ בבדיקות הרכיב בלבד. "
    "(9) **‏role=status הוסר מ-`<output>`** (‏biome ‏noRedundantRoles: ‏output הוא ‏status במשתמע); ‏getByRole('status') עדיין מוצא אותו. "
    "(10) **‏Supabase MCP ו-GitHub MCP לא מאושרים בסשן**; לא נדרשו: אין שינוי סכימה (‏`field` הוא שדה בתשובת ה-action, לא עמודה) ואין ‏PR (הענף נדחף ישירות כמו ב-UX02 עד ‏UX11). "
    "(11) **שלושת כשלוני ה-neighbours שלא היו ב-UX11 אינם של הטופס**: ‏coupons a11y במובייל עבר בהרצה חוזרת (‏aria-prohibited-attr על ‏div הטעינה של רשת הקופונים, מירוץ); ‏Tab-stop על ‏/ הוא \"focus hidden under section: a דברו איתנו בוואטסאפ\" הידוע מ-UX10; באנר ההסכמה בלי סקריפט במובייל נתקע ב-`load` על ‏`/_next/image` של ‏under-99.png ו-logo-footer.webp שה-optimizer המקומי לא עונה להם. "
    "(12) **גיבוי**: הגיבוי של ‏14:56 (‏812MB ב-~/) הוא היומי; ‏caffeinate רץ (‏3 מופעים), ‏SleepDisabled 1. **השרת על ‏3346 נהרג לפי ‏PID של ה-listener** לפני ה-build ובסוף השלב."
)
lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX11'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
