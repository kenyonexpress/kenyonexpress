# -*- coding: utf-8 -*-
# UX17: prepend the Updated line, demote the previous one, add the decisions block.
import io
p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
updated = (
    "Updated: 2026-10-14 19:35 (UX17 קופה בשלושה שלבים, השלמת רחובות ובורר אמצעי תשלום. "
    "**נמדד לפני** (‏logs/ux17/before.json, ה-build הקיים של ‏47ced0878 ב-380/768/1440 על ‏3354, שורה אחת של ‏/product/6253 בסל): אין מסילת שלבים, כל שלוש הסקציות פתוחות בבת אחת (‏4 + 14 + 1 שדות), שדה הרחוב ‏input רגיל בלי ‏role ובלי רשימה בהקלדה, בלוק התשלום שורת רדיו אחת לקריאה בלבד ואפס רדיו ‏token_id לאורח, כפתור התשלום בתוך ה-aside ב-y=3065 מתוך ‏3655px ב-380. "
    "**עכשיו**: ‏lib/checkout/steps.ts קיבל שכבת שלושה שלבים מעל ארבע הסקציות (‏CHECKOUT_FLOW_STEPS, ‏validateFlowStep, ‏firstFlowStepWithErrors, ‏initialFlowStep: כתובת שמורה פותחת בשלב הכתובת כי המועד, המוביל וההערות חיים שם); ‏CheckoutForm מרנדר ‏nav.checkout-steps (‏aria-current=step, שלב שהושלם הוא כפתור), גוף אחד פתוח והשאר ‏hidden ולא מפורקים (השדות לא מבוקרים, ה-autofill וה-resume כותבים ל-DOM, ה-submit היחיד עדיין שופט את כל הטופס ופותח את השלב שמחזיק את השגיאה הראשונה), שלב שהושלם מציג שורת סיכום ו\"ערוך\", \"המשך\" שופט את השלב שלו בלבד, חזרה מגוגל נפתחת על השלב הראשון שחסר בו משהו. ‏StreetAutocomplete (‏combobox מעל ‏input ‏street לא מבוקר, ‏debounce ‏180ms, שואל רק בפוקוס עם עיר ושני תווים, מבטל תשובות ישנות, ספירה ‏sr-only) מעל ‏/api/checkout/streets (‏rate limit ‏street-lookup ‏60/10 דק׳, ‏4s, ‏CacheControl.streets) מעל ‏lib/checkout/street-autocomplete.ts (רשימת הרחובות של הלמ\"ס ב-data.gov.il, ‏plain=false עם ‏to_tsquery מחובר ב-& וקידומת ‏:*, מילות העיר בשאילתה ונבדקות שוב אצלנו, דירוג לפי קידומת, עד ‏8; ‏ISRAEL_STREETS_LOOKUP_URL לא מוגדר = הרישום, ‏off, או תבנית ‏https). ‏PaymentMethodSelector מעל ‏lib/checkout/payment-methods.ts: קבוצת רדיו ‏token_id של הכרטיסים השמורים (מותג בעברית + ארבע ספרות, תג ברירת מחדל) והדף המאובטח (\"כרטיס אשראי\"/\"כרטיס אחר\" עם סימני המותג של הפוטר); רק מה ש-submitCheckout יכול לחייב, בלי ‏Bit ובלי ארנקים. בלוק התשלום עבר מתחת לטבלה אל השלב השלישי. ‏CSS חדש על טוקנים ו-rem בלבד (‏checkout-page.css ירד ל-188/69 ‏px/hex מ-193/72); ‏.checkout-field__hint ל---color-muted כי ‏axe מדד ‏#777 ב-4.48:1 על רמז המועד. "
    "**נמדד אחרי** (‏logs/ux17/after.json, ‏build טרי על ‏3355): מסילה של ‏3 עם שלב ‏1 נוכחי, ‏4 שדות גלויים ו-0 בשני האחרים, כפתור התשלום מוסתר עד שלב ‏3, הדף ‏1972/1918/1696px (היה ‏3655/3475/2890); הרחוב ‏role=combobox ואחרי \"דיז\" בתל אביב נפתחת רשימה דיזנגוף / דיזנגוף סנטר / ככר דיזנגוף עם \"3 רחובות מוצעים\"; רדיו ‏token_id=new אחד מסומן לאורח. "
    "נעוץ ב-flow-steps.test.ts (14), ‏payment-methods.test.ts (9), ‏street-autocomplete.test.ts (20), ‏streets/route.test.ts (5), ‏street-autocomplete.test.tsx (12), ‏payment-method-selector.test.tsx (5), ‏multi-step-checkout.test.tsx (23, במקום ‏single-page-checkout.test.tsx), ‏e2e/checkout-steps.spec.ts (‏10 עברו, ‏2 דולגו כי שער התשלום סגור ב-build המקומי), ‏a11y של הקופה ‏2/2 בשלושת השלבים. שערים: ‏vitest ‏852 קבצים / ‏9878 ירוקים, ‏type-check ו-lint נקיים, ‏hardcoded gate נקי (‏--range=HEAD), ‏build ירוק פעמיים, שער הקופה ‏REFUSED כמו ב-UX13/16 (\"live side is our-build\"). ‏COMPONENT-QUEUE קיבל שורת ledger (UX17). הפירוט ב\"החלטות שהתקבלו לבד (UX17)\". המשך מ: ‏UX18)"
)
decisions = (
    "**החלטות שהתקבלו לבד (UX17, 19:35):** (1) **שלושה שלבים ולא ארבעה**: סקירת ההזמנה יושבת ב-aside לאורך כל הדרך, ושלב \"ביקורת\" שלא שואל כלום היה לחיצה בלי תוכן; ‏review+confirm הם שלב התשלום. "
    "(2) **הגופים מוסתרים ולא מפורקים**: השדות לא מבוקרים (ה-autofill של המיקוד וה-resume כותבים ‏DOM), ו-input מוסתר עדיין נשלח; לכן ה-submit היחיד נשאר כמו שהיה. "
    "(3) **כתובת שמורה נפתחת בשלב הכתובת ולא בתשלום**: המועד, המוביל וההערות חיים שם; שלב הפרטים הוא סיכום בלי \"ערוך\" כי אין מה לערוך. "
    "(4) **הרחובות מהרישום הציבורי כברירת מחדל** (בניגוד למיקוד, שם ה-URL הוא קונפיגורציה בלבד): ‏API פתוח בלי מפתח, נמדד מהמכונה ב-14.10; ‏q/filters כ-JSON עם מפתחות בעברית נדחים בדף ‏HTML של האתר, ‏to_tsquery מחובר ב-& עם ‏:* עובד. "
    "(5) **אין ‏Bit/ארנקים בבורר**: ‏src/lib/payments לא יודע לחייב דרכם; הבורר מציע רק טוקן שמור או הדף המאובטח. "
    "(6) **ה-CSS החדש על טוקנים ו-rem**: שער ה-hardcoded ב-CI סופר ‏px/hex לקובץ; הקובץ ירד נטו. "
    "(7) **‏e2e של ה-submit השלם מדולג כששער התשלום סגור**: ה-handler עוצר לפני השיפוט (בכוונה), אז הטסט מוצמד ב-vitest בלבד. "
    "(8) **ה-probe הראשון חיכה ‏900ms לרשימת הרחובות ולא ראה אותה**: ‏debounce + ‏RPC של ‏rate limit (‏318ms) + הרישום > ‏900ms; ה-probe מחכה ל-response. "
    "(9) **‏locator('.checkout-steps') נפל ב-strict mode**: ה-Suspense shell שומר את הקופסה תחת אותה מחלקה; ה-spec מצביע על ‏nav. נשמר כזיכרון. "
    "(10) **‏Supabase MCP ו-GitHub MCP לא מאושרים בסשן**; לא נדרשו: אין שינוי סכימה ואין ‏PR (הענף נדחף ישירות כמו ‏UX02 עד ‏UX16). "
    "(11) **שרתים**: ‏3354 (לפני) ו-3355 (אחרי, פעמיים) נהרגו לפי ‏PID של ה-listener; ה-build השני הוא תיקון הניגודיות של הרמז בלבד."
)
lines = s.split('\n')
assert lines[2].startswith('Updated: '), lines[2][:40]
prev = 'קודם: ' + lines[2][len('Updated: '):]
lines[2] = updated
lines.insert(3, prev)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX16'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated; decisions at line', idx + 1)
