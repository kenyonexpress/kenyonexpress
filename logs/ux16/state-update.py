# -*- coding: utf-8 -*-
# UX16: prepend the Updated line, demote the previous one, add the decisions block.
import io
p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
updated = (
    "Updated: 2026-10-14 18:40 (UX16 דף העגלה: כרטיסי פריט, פקדי כמות, אנימציית הסרה ופירוט סכומים. "
    "**נמדד לפני** (‏logs/ux16/before.json, ה-build הקיים של ‏41e42094d ב-380/768/1440 על ‏3352, שורה אחת של ‏/product/6253 בסל): לחיצה על \"הסר\" הוציאה את ה-article מה-DOM בתוך פריים אחד (‏midRemove ‏present:false בכל רוחב) וכל מה שמתחתיו קפץ למעלה בגובה השורה; לחיצת ‏+ הזיזה את השדה, את סכום השורה ואת הסיכום בלי שום ‏live region בשורה או על הסכום ובלי אנימציה על אף מספר; הסיכום היה שתי שורות (\"פריטים (1)\", משלוח) וסכום, בלי מילה על מע״מ, בלי פירוט, בלי שורת חיסכון ובלי מספר לרכישה שנושאת יתרה בחנות; ‏+ מושבת בתקרה היה כל ההסבר. "
    "**עכשיו**: ‏CartLineItem: הלחיצה מסמנת ‏data-leaving ו-aria-busy, מקפיאה את כל הפקדים, מודדת את גובה השורה ל-`--cart-line-h` ומריצה ‏cart-line-leave (‏240ms קיפול + דהייה + הזזה ‏12px); ‏animationend עם השם הזה (פולס של ילד שמבעבע למעלה נדחה לפי שם) או ‏fallback של ‏450ms מפעיל את כתיבת ה-store בדיוק פעם אחת, עם ‏await כדי שהסרה שנדחתה תנקה את המצב על השורה שה-store החזיר תחת אותו ‏key; \"שמור לאחר כך\" מחנה ומסיר דרך אותה דלת; כלל ה-reduced-motion הגלובלי מקצר ל-0.01ms והאירוע עדיין נורה. ‏output ‏sr-only ‏aria-live אומר \"הכמות של X עודכנה ל-N\"; ‏ceilingHint מתחת לגלולה (\"זו הכמות המקסימלית במלאי\" / \"עד 99 יחידות בהזמנה אחת\") הוא ‏aria-describedby על ‏+; \"מחיר יחידה × כמות\" על הכרטיס משתיים, מוסתר מתחת ל-768; סכום השורה מקבל ‏data-pulse כשהמספר של השרת זז. ‏CartTotalsSidebar: ‏cartSavings (‏sumAgorot) כשורת \"סך החיסכון\" רק כשיש שתי הנחות או יותר לחבר, ו\"חסכת ₪X בהזמנה זו\" מתחת לסכום לכל חיסכון; ‏itemsNote מתחת לשורת הפריטים כשמוצרים ויחידות שונים; ‏`<details>` סגור \"פירוט לפי מוצר\" (‏summary ‏44px) כשיש יותר מיחידה אחת; ‏cartGrandTotal עם היתרה בחנות בשם, רק כשקיימת; \"המחירים כוללים מע״מ\"; ‏aria-live=polite ופולס על הסכום באתר. בלי צבע חדש; החץ של ה-details בגבולות פיזיים ‏right+bottom כי הזוג הלוגי הצביע הצידה ב-RTL. "
    "**נמדד אחרי** (‏logs/ux16/after.json): גיאומטריית השורה ללא שינוי (‏380 ‏350x379, ‏768 ‏736x140, ‏1440 ‏796x140, סטפרים ‏44x44, גלולה ‏130x44); אחרי ‏+ שני המספרים מדווחים ‏cart-total-pulse וה-live region קורא את המשפט; באמצע ההסרה השורה קיימת עם ‏data-leaving, ‏cart-line-leave ‏0.24s, ‏opacity ‏0.61 / 0.82 / 0.72, ‏max-height מתקפל, הפקדים מושבתים, ואז ‏0 שורות והמצב הריק; הסיידבר גדל ‏18px (שורת המע״מ). "
    "נעוץ ב-cart-line-remove-animation.test.tsx (15), ‏cart-totals-breakdown.test.tsx (10) ו-e2e/cart-page.spec.ts (‏8/8 ב-chromium + mobile-chrome, כולל ‏reduced motion). שערים: ‏vitest ‏846 קבצים / ‏9812 ירוקים (‏12 דולגו), ‏type-check ו-lint נקיים, ‏build ירוק (‏rm -rf .next, פעמיים), שער העגלה ‏REFUSED כמו ב-UX13 (\"live side is our-build\", אין צילום קפוא של העגלה; השורה נכתבה על ידי השער). שכני ‏e2e (‏cart, touch-targets, a11y בשני הפרויקטים): ‏100 עברו, ‏55 נכשלו, ‏5 דולגו, הקבוצה הידועה של ‏UX15 פלוס ‏cart.spec:274 במובייל (ההוספה בדף המוצר לא נתפסה; ‏logs/ux16/neighbours-diff.txt). "
    "‏COMPONENT-QUEUE קיבל שורת ledger (UX16). הפירוט ב\"החלטות שהתקבלו לבד (UX16)\". המשך מ: ‏UX17)"
)
decisions = (
    "**החלטות שהתקבלו לבד (UX16, 18:40):** (1) **כתיבת ה-store נדחית עד סוף האנימציה** (‏240ms) ולא נורית מיד עם ‏ghost: ה-store מסיר אופטימית את השורה מהרשימה ברגע הקריאה, ו-ghost היה דורש ‏snapshot ברמת ‏CartPageView; הדחייה פשוטה, והסרה שנדחתה מחזירה את השורה כי ה-key נשמר. "
    "(2) **‏fallback של ‏450ms במקום בדיקת ‏matchMedia**: הכלל הגלובלי ב-globals.css מקצר כל אנימציה ל-0.01ms ולא ל-none, ולכן ‏animationend נורה גם ב-reduced motion; הטיימר נשאר רק למקרה של ‏stylesheet שלא נטען או ‏renderer בלי ‏layout. "
    "(3) **שורת \"סך החיסכון\" רק משתי הנחות ומעלה**: הנחה אחת ואחריה אותו מספר תחת \"חיסכון\" הוא אותו מספר פעמיים; \"חסכת\" מתחת לסכום נשאר לכל חיסכון. "
    "(4) **הערת מע״מ כטקסט ולא כסכום**: שורת קופון היא תשלום מקדמה ומע״מ מחושב במימוש, ו-extractVat על הסכום היה מצהיר מספר לא נכון לסל מעורב; התקנון (‏wp-migrated) אומר שהמחירים כוללים מע״מ, וזה מה שנכתב. "
    "(5) **פירוט לפי מוצר סגור כברירת מחדל ורק כשיש יותר מיחידה אחת**: שורה אחת ביחידה אחת היא הפירוט של עצמה. "
    "(6) **ה-probe נפל ב-380 על עגלה ריקה**: ה-badge זז אופטימית לפני תשובת השרת, ו-goto מיד אחריו ביטל את ה-server action באמצע; ההמתנה היא ל-toast \"נוסף לעגלה\". נשמר כזיכרון. "
    "(7) **‏jsdom מפיל את ‏animationName**: ‏fireEvent.animationEnd שולח ‏Event רגיל ושלושה טסטים דיווחו \"called 0 times\"; ‏defineProperty על ‏createEvent. נשמר כזיכרון. "
    "(8) **שכן ‏cart.spec:274 במובייל**: ‏\"add-to-cart did not stick: 0 -> 0\" גם בהרצה בודדת, בזמן שלוג השרת מראה ‏db.query_failed / ‏stock.available_read_failed עם ‏HANGING_PROMISE_REJECTION ב-/product/[slug] (קריאת מלאי אחרי סיום ה-prerender); עבר ב-chromium, ו-cart-page.spec של השלב הזה הוסיף לסל במובייל ארבע פעמים; לא בנתיב הקוד של השלב. "
    "(9) **שער העגלה**: ריצה אחת ב-380 מסרבת (‏rc=5) וכותבת שורת ‏REFUSED; לא הורץ ‏--live-png כי אין צילום קפוא של העגלה (‏UX13 תיעד אותו דבר). "
    "(10) **‏Supabase MCP ו-GitHub MCP לא מאושרים בסשן**; לא נדרשו: אין שינוי סכימה ואין ‏PR (הענף נדחף ישירות כמו ‏UX02 עד ‏UX15). "
    "(11) **תחזוקה**: גיבוי היום ‏14:56 ב-~/ (‏812MB) קיים; בדסקטופ היו חמישה, נמחקו ‏10-09, ‏10-13 ו-10-14-0447 ונשארו שלושת האחרונים (החריג המאושר מראש); ‏caffeinate ‏3 מופעים, ‏SleepDisabled 1. "
    "(12) **שרתים**: ‏3352 (לפני) ו-3353 (אחרי) נהרגו לפי ‏PID של ה-listener לפני כל ‏build; ה-build השני הוא תיקון ‏CSS של החץ בלבד."
)
lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX15'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
