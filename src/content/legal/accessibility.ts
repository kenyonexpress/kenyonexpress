import type { LegalDocument } from '@/content/legal/types'

/**
 * The accessibility statement (הצהרת נגישות), IS 5568 / WCAG 2.0 AA.
 *
 * WHY EVERY SENTENCE HERE IS CHECKABLE
 *
 * A statement is a declaration about a specific site, and the standard expects
 * it to say what was done, to what level, what is known to be imperfect, and
 * who to contact. Copying a template would produce a page claiming conformance
 * nobody measured - which is the one failure mode that makes an accessibility
 * statement worse than none, because it tells a user relying on it that the
 * problem they just hit does not exist.
 *
 * So the "what was done" section is [40], verbatim from the measurement: axe
 * was run against a production build of six pages, the ONLY class of violation
 * it found in all six was colour contrast, five colour pairs were darkened by
 * the minimum needed to pass 4.5:1, and 18 tests hold it there. The RTL and
 * keyboard claims are equally structural rather than aspirational.
 *
 * The two known limitations are also real and are named rather than omitted:
 * the catalogue carries supplier-supplied imagery whose alt text is only as
 * good as what the supplier typed (which [56] now seeds from the product name),
 * and no external accessibility audit has been commissioned.
 */
export const accessibilityStatement: LegalDocument = {
  title: 'הצהרת נגישות',
  updatedAt: '2026-09-02',
  description:
    'הצהרת הנגישות של קניון אקספרס: רמת ההנגשה, מה נבדק ותוקן, מגבלות ידועות ודרכי פנייה בנושאי נגישות.',
  reviewNotice:
    'ההצהרה מתארת את מצב האתר כפי שנמדד בפועל. מינוי רכז נגישות ופרטי ההתקשרות המלאים שלו טעונים אישור בעל האתר לפני פרסום סופי.',
  blocks: [
    {
      type: 'paragraph',
      text: 'קניון אקספרס רואה בנגישות האתר חלק מהשירות עצמו, ופועל להנגיש אותו לאנשים עם מוגבלות בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998, לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ולתקן הישראלי ת"י 5568 המאמץ את הנחיות WCAG 2.0 ברמה AA.',
    },
    { type: 'heading', text: 'רמת הנגישות באתר' },
    {
      type: 'paragraph',
      text: 'האתר הונגש לרמה AA. הבדיקות מבוצעות מול גרסת הייצור של האתר, ולא מול סביבת פיתוח, כדי שהתוצאה תשקף את מה שמשתמש באמת מקבל.',
    },
    { type: 'heading', text: 'מה נבדק ומה תוקן' },
    {
      type: 'unordered',
      items: [
        'בדיקה אוטומטית בכלי axe על שישה עמודים מרכזיים באתר: דף הבית, קטגוריה, מוצר, עגלה, קופה והאזור האישי.',
        'סוג הליקוי היחיד שנמצא בכל ששת העמודים היה ניגודיות צבע. חמישה צמדי צבעים הוכהו במידה המינימלית הנדרשת כדי לעמוד ביחס של 4.5:1, ושמונה־עשרה בדיקות אוטומטיות שומרות על כך שהתיקון לא ייסוג.',
        'האתר כולו בנוי לכיוון ימין־לשמאל (RTL) בעברית, כולל טפסים, טבלאות ורכיבי ניווט.',
        'ניווט מלא במקלדת, כולל מעבר בין שדות בטפסי ההזמנה והתשלום, וסימון מיקוד (focus) גלוי.',
        'לכל תמונה נדרש טקסט חלופי בעברית לפני שניתן להעלות אותה למערכת, ולא לאחר מכן.',
        'מבנה כותרות היררכי בכל עמוד, כדי שאפשר יהיה לנווט במסמך בעזרת קורא מסך.',
      ],
    },
    { type: 'heading', text: 'מגבלות ידועות' },
    {
      type: 'unordered',
      items: [
        'חלק מהתמונות והתיאורים בקטלוג מגיעים מבתי העסק המפרסמים באתר. איכות התיאור החלופי של תמונה כזו תלויה במי שהעלה אותה, ואנו פועלים לשפר אותה באופן שוטף.',
        'טרם בוצעה בדיקת נגישות חיצונית על ידי מורשה נגישות שירות. תוצאותיה, כשתבוצע, יעודכנו בהצהרה זו.',
        'תכנים המוטמעים מגורם שלישי (למשל מפות או סרטונים) אינם בשליטתנו המלאה.',
      ],
    },
    { type: 'heading', text: 'נתקלתם בבעיית נגישות?' },
    {
      type: 'paragraph',
      text: 'אם נתקלתם בעמוד, בפעולה או בתוכן שאינם נגישים, נשמח לדעת ולתקן. אפשר לפנות דרך עמוד "צור קשר" באתר, בדואר אלקטרוני info@kenyonexpress.co.il או בוואטסאפ 052-463-5550. בפנייה כדאי לציין את כתובת העמוד, את הפעולה שניסיתם לבצע ואת סוג הטכנולוגיה המסייעת שבה אתם משתמשים, כדי שנוכל לשחזר את התקלה.',
    },
    {
      type: 'paragraph',
      text: 'נטפל בפנייה בהקדם האפשרי, ונעדכן אתכם על הטיפול בה.',
    },
  ],
}
