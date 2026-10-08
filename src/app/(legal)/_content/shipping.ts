import { CARRIER_IDS, CARRIER_REGISTRY } from '@/lib/shipping/carrier-registry'
import { DELIVERY_BANDS } from '@/lib/shipping/estimate'
import { SHIPPING_METHODS } from '@/lib/shipping/methods'
import type { LegalDoc } from './types'

/**
 * Shipping and delivery.
 *
 * EVERY NUMBER HERE IS READ OFF THE CODE THAT CHARGES AND PROMISES IT.
 *  - The two methods a shopper can pick, their labels and their descriptions,
 *    are `SHIPPING_METHODS` in `lib/shipping/methods.ts`, and the method list
 *    below is RENDERED from that registry so a renamed method cannot leave the
 *    policy describing one that no longer exists.
 *  - Shipping is free in every zone today: `lib/shipping/zones.ts` seeds
 *    `flatAgorot: 0, freeAboveAgorot: 0` for all five zones, and
 *    `lib/shipping/quote.ts` says in its own words that the site prints
 *    "משלוח מהיר חינם" and the shopper line is the zone's rate. The policy
 *    states that, and states where a future rate would be shown (the cart and
 *    the order summary before payment), so a rate the table grows later is a
 *    policy the page already covers.
 *  - The delivery bands (3-4, 3-5, 5-7 business days by distance from the
 *    Tel Aviv hub) are `DELIVERY_BANDS` in `lib/shipping/estimate.ts`, and sit
 *    inside the 3-7 the method description promises.
 *  - Carrier names and service windows are `lib/shipping/carrier-registry.ts`.
 *    They are listed as the couriers the platform works with, not as a menu:
 *    which of them is offered on a given order depends on the carriers the
 *    operator has enabled and on the destination.
 *  - A coupon is not shipped at all. The voucher and its QR code arrive by
 *    email right after payment (`lib/email/voucher-email.ts`), and that is the
 *    first thing this page says, because it is most of the catalogue.
 *
 * What this page does NOT do is restate the cancellation rules. A parcel that
 * arrives damaged or never arrives is a returns question, and the returns
 * policy owns it; this page says where the question goes.
 */
const methodItems = SHIPPING_METHODS.map((method) => `${method.label}: ${method.description}.`)

function businessDays(min: number, max: number): string {
  if (min === max) return min === 1 ? 'עד יום עסקים אחד' : `${min} ימי עסקים`
  return `${min} עד ${max} ימי עסקים`
}

/** One row per carrier service, in registry order. */
const carrierRows: string[][] = CARRIER_IDS.flatMap((id) => {
  const carrier = CARRIER_REGISTRY[id]
  return carrier.services.map((service) => [
    carrier.label,
    service.label,
    businessDays(service.minDays, service.maxDays),
  ])
})

/** The three distance bands, named for the reader and timed by the code. */
const BAND_NAMES: Record<
  (typeof DELIVERY_BANDS)[number]['band'],
  [area: string, distance: string]
> = {
  metro: ['גוש דן והמרכז', 'עד 30 ק"מ'],
  regional: ['השרון, השפלה, ירושלים, חיפה ובאר שבע', 'עד 130 ק"מ'],
  remote: ['הגליל, הגולן, הנגב הדרומי, אילת והערבה', 'מעל 130 ק"מ'],
}

const bandRows: string[][] = DELIVERY_BANDS.map((band) => [
  ...BAND_NAMES[band.band],
  businessDays(band.min, band.max),
])

export const shippingDoc: LegalDoc = {
  slug: 'shipping',
  path: '/shipping',
  title: 'מדיניות משלוחים ואספקה',
  description:
    'מדיניות המשלוחים של קניון אקספרס: אספקה דיגיטלית מיידית של קופונים, אפשרויות המשלוח למוצרים פיזיים, דמי משלוח, זמני אספקה לפי אזור, חברות השילוח, מעקב אחר משלוח וטיפול במשלוח שהתעכב או ניזוק.',
  updatedAt: '2026-10-08',
  version: '1.0',
  effectiveAt: '2026-10-08',
  history: [
    {
      version: '1.0',
      effectiveAt: '2026-10-08',
      summary:
        'נוסח ראשון: אספקת קופונים בדואר אלקטרוני, שתי שיטות המשלוח למוצרים פיזיים, דמי משלוח, זמני אספקה לפי אזור, חברות השילוח ומעקב.',
    },
  ],
  reviewNotice:
    'הנוסח מתאר את אפשרויות המשלוח, דמי המשלוח וזמני האספקה כפי שהם מוגדרים במערכת האתר בפועל. הוא טרם עבר אישור עורך דין. בכל סתירה בין עמוד זה לבין הוראות חוק הגנת הצרכן שאין להתנות עליהן, הוראות החוק גוברות.',
  intro: [
    'עמוד זה מסביר כיצד מגיעים אליכם המוצרים שרכשתם בקניון אקספרס: קופונים והטבות, שמסופקים דיגיטלית ומיד, ומוצרים פיזיים, שנשלחים אליכם או נאספים מהספק.',
    'המדיניות מהווה חלק בלתי נפרד מתקנון האתר. בכל שאלה שאינה נענית כאן ניתן לפנות אלינו בערוצים המפורטים בתחתית העמוד.',
  ],
  sections: [
    {
      id: 'digital',
      title: 'קופונים והטבות: אספקה דיגיטלית',
      blocks: [
        {
          type: 'ordered',
          items: [
            'קופון, שובר או הטבה למימוש בבית עסק אינם נשלחים בדואר ואינם כרוכים בדמי משלוח. מיד לאחר אישור התשלום נשלח לכתובת הדואר האלקטרוני שמסרתם בהזמנה הקופון עם קוד QR למימוש, והוא זמין גם באזור האישי באתר תחת "הזמנות".',
            'אם הקופון לא הגיע בתוך דקות ספורות, יש לבדוק את תיקיית דואר הזבל ואת כתובת הדואר האלקטרוני שבחשבון. בכל מקרה הקופון מופיע באזור האישי, ואינו תלוי בהגעת ההודעה.',
            'מימוש הקופון, תוקפו ותנאיו מפורטים בתקנון האתר ובעמוד הדיל. ביטול רכישת קופון שטרם מומש מתבצע לפי מדיניות הביטולים וההחזרות.',
          ],
        },
      ],
    },
    {
      id: 'methods',
      title: 'מוצרים פיזיים: שיטות האספקה',
      blocks: [
        {
          type: 'paragraph',
          text: 'במוצרים פיזיים נבחרת שיטת האספקה בעגלת הקניות ובמסך סיכום ההזמנה, לפני התשלום. השיטות הקיימות:',
        },
        { type: 'unordered', items: methodItems },
        {
          type: 'paragraph',
          text: 'האספקה מתבצעת על ידי הספק שממנו נרכש המוצר או מטעמו. באיסוף עצמי הספק יוצר אתכם קשר לתיאום מועד ומקום האיסוף לאחר אישור ההזמנה, ובאחריותכם להגיע במועד שתואם או לתאם מועד חלופי.',
        },
      ],
    },
    {
      id: 'fees',
      title: 'דמי משלוח',
      blocks: [
        {
          type: 'note',
          text: 'נכון למועד העדכון של מדיניות זו, המשלוח למוצרים פיזיים הוא ללא תשלום לכל יישוב בישראל, ללא סכום רכישה מינימלי.',
        },
        {
          type: 'ordered',
          items: [
            'אם בעתיד ייקבעו דמי משלוח לאזור מסוים או סכום רכישה שמעליו המשלוח חינם, הם יוצגו בעגלת הקניות ובמסך סיכום ההזמנה לפני התשלום, וייכללו בסכום הכולל לחיוב. לא ייגבו דמי משלוח שלא הוצגו לכם לפני אישור התשלום.',
            'דמי משלוח, ככל שנגבו, נגבים בשקלים חדשים, והם חלק מסכום העסקה לצורך חישוב החזר במקרה של ביטול, כמפורט במדיניות הביטולים וההחזרות.',
            'איסוף עצמי מהספק אינו כרוך בתשלום.',
          ],
        },
      ],
    },
    {
      id: 'areas',
      title: 'אזורי חלוקה וזמני אספקה',
      blocks: [
        {
          type: 'paragraph',
          text: 'המשלוחים מתבצעים בתחומי מדינת ישראל בלבד. זמני האספקה נמנים בימי עסקים (ראשון עד חמישי, למעט ערבי חג, חגים וימי שבתון), החל מיום אישור העסקה על ידי חברת האשראי. הזמנה שאושרה לאחר שעות הפעילות נמנית מיום העסקים הבא.',
        },
        {
          type: 'table',
          caption: 'הערכת זמן אספקה לפי מרחק יישוב היעד ממרכז הארץ',
          head: ['אזור', 'מרחק מתל אביב', 'זמן אספקה משוער'],
          rows: bandRows,
        },
        {
          type: 'ordered',
          items: [
            'ההערכה בטבלה מוצגת גם בעגלת הקניות לפי יישוב היעד שתבחרו, והיא הערכה ולא התחייבות למועד מדויק. בכל מקרה זמן האספקה לא יעלה על 7 ימי עסקים, אלא אם צוין אחרת בעמוד המוצר.',
            'במוצר שבעמודו צוין זמן אספקה שונה, גובר הזמן שצוין בעמוד המוצר.',
            'ליישובים שחברות השילוח מגיעות אליהם בתדירות נמוכה, ליישובים מעבר לקו הירוק ולמקומות שחלות עליהם מגבלות ביטחוניות, ייתכן זמן אספקה ארוך יותר. במקרה כזה נעדכן אתכם לפני המשלוח.',
          ],
        },
      ],
    },
    {
      id: 'carriers',
      title: 'חברות השילוח',
      blocks: [
        {
          type: 'paragraph',
          text: 'המשלוחים מבוצעים באמצעות חברות שילוח שהפלטפורמה או הספק עובדים איתן. אפשרויות השילוח המוצעות להזמנה מסוימת תלויות ביישוב היעד ובזמינות החברה, ומוצגות לבחירה במסך סיכום ההזמנה כאשר יש יותר מאפשרות אחת. חברות השילוח שהמערכת עובדת איתן וזמני השירות שהן מצהירות עליהם:',
        },
        {
          type: 'table',
          head: ['חברת שילוח', 'שירות', 'זמן אספקה מוצהר'],
          rows: carrierRows,
        },
        {
          type: 'paragraph',
          text: 'לצורך ביצוע המשלוח נמסרים לחברת השילוח שמכם, כתובת המשלוח ומספר הטלפון שמסרתם בהזמנה, ולא מעבר לכך. פרטים נוספים במדיניות הפרטיות.',
        },
      ],
    },
    {
      id: 'tracking',
      title: 'מעקב אחר המשלוח ועדכונים',
      blocks: [
        {
          type: 'ordered',
          items: [
            'כאשר ההזמנה נמסרת לחברת השילוח נשלח אליכם עדכון בדואר אלקטרוני, ואם אישרתם קבלת הודעות, גם במסרון או בוואטסאפ, הכולל את מספר המעקב כאשר חברת השילוח מספקת אחד.',
            'מצב ההזמנה ומספר המעקב מוצגים בכל עת באזור האישי באתר תחת "הזמנות".',
            'עם מסירת המשלוח נשלח עדכון נוסף. אם קיבלתם עדכון מסירה והמשלוח לא הגיע אליכם, פנו אלינו בהקדם כדי שנברר מול חברת השילוח.',
          ],
        },
      ],
    },
    {
      id: 'address',
      title: 'כתובת המשלוח ושינויה',
      blocks: [
        {
          type: 'ordered',
          items: [
            'באחריותכם למסור כתובת מלאה ומדויקת, כולל מספר דירה, קומה וקוד כניסה ככל שנדרש, ומספר טלפון זמין. משלוח שחזר בשל כתובת שגויה או בשל אי זמינות לקבלתו יישלח שנית לאחר תיאום, ואם נגבו דמי משלוח, המשלוח החוזר עלול להיות כרוך בדמי משלוח נוספים שיוצגו לכם מראש.',
            'שינוי כתובת אפשרי כל עוד ההזמנה לא נמסרה לחברת השילוח. לשינוי יש לפנות אלינו מיד עם גילוי הטעות, בציון מספר ההזמנה.',
            'אם המשלוח נמסר לאדם אחר בכתובת שמסרתם, כגון בן משפחה, שכן או מזכירות הבניין, ייחשב הדבר כמסירה לידיכם.',
          ],
        },
      ],
    },
    {
      id: 'delays',
      title: 'עיכוב, משלוח שלא הגיע ומוצר שניזוק',
      blocks: [
        {
          type: 'ordered',
          items: [
            'אם חלפו זמני האספקה שצוינו לעיל והמשלוח לא הגיע, פנו אלינו ונברר את מיקומו מול הספק וחברת השילוח. במקרה של עיכוב מהותי תוצע לכם בחירה בין המתנה למשלוח לבין ביטול העסקה והשבת מלוא התשלום, ללא דמי ביטול.',
            'עיכוב הנובע מכוח עליון, מפעולות איבה, משביתה או השבתה, ממזג אוויר קיצוני, ממגבלות רגולטוריות או מכל אירוע שאינו בשליטת הפלטפורמה, הספק או חברת השילוח, לא ייחשב הפרה, ונעדכן אתכם על משכו הצפוי.',
            'יש לבדוק את המשלוח עם קבלתו. מוצר שהגיע פגום, שבור, חסר או שונה מההזמנה יש לדווח עליו בהקדם, רצוי עם צילום, ויחולו עליו הוראות מדיניות הביטולים וההחזרות ודין הגנת הצרכן. במקרה כזה לא ייגבו דמי ביטול והחזרת המוצר תהיה על חשבוננו.',
          ],
        },
        {
          type: 'note',
          text: 'שאלות על ביטול הזמנה, החזרת מוצר או קבלת החזר כספי נענות במדיניות הביטולים וההחזרות. עמוד זה עוסק באופן האספקה בלבד.',
        },
      ],
    },
    {
      id: 'changes',
      title: 'שינויים במדיניות',
      blocks: [
        {
          type: 'paragraph',
          text: 'אנו רשאים לעדכן מדיניות זו מעת לעת, למשל עם הוספת חברת שילוח, שינוי באזורי החלוקה או קביעת דמי משלוח. כל גרסה מקבלת מספר ותאריך תחילת תוקף, המוצגים בראש העמוד, והגרסאות הקודמות מפורטות בתחתיתו. על הזמנה חלה המדיניות שהייתה בתוקף במועד ביצועה.',
        },
      ],
    },
  ],
}
