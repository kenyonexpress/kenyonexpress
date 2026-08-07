import type { LegalDocument } from '@/content/legal/types'

/**
 * Cancellation and returns (מדיניות ביטולים והחזרות).
 *
 * WHY THIS ONE IS WRITTEN AND NOT MIGRATED
 *
 * `/refund_returns` exists in the WordPress export and is 5,149 characters of
 * the WooCommerce SAMPLE PAGE, in English, beginning "This is a sample page"
 * and promising a 30 day window nobody agreed to. A returns policy is a binding
 * commitment, so that text is not migrated - see the header of
 * `scripts/legal/extract-wp-legal.mjs`.
 *
 * WHERE EVERY CLAUSE BELOW COMES FROM
 *
 * Nothing here is invented. Each statement traces to one of three sources:
 *
 *  1. The statute - חוק הגנת הצרכן, התשמ"א-1981 and תקנות הגנת הצרכן (ביטול
 *     עסקה), התשע"א-2010. The 14 day window and the "5% or ₪100, whichever is
 *     lower" cancellation fee are the law's numbers, not ours.
 *  2. The site's OWN published תקנון, which already carries a
 *     "החזרות וביטולים" section in Hebrew and is migrated verbatim elsewhere.
 *  3. What the code actually does. `computeCancellationFee` is literally
 *     `min(5%, ₪10000 agorot)` and returns zero on a defect claim;
 *     `planOrderRefund` refuses a coupon that was already redeemed or has
 *     expired; a cancellation made on the day of the charge is sent to the
 *     clearing house as a cancellation rather than a credit. A page that
 *     promised something the code does not do would be a promise the system
 *     breaks on its own.
 */
export const cancellationPolicy: LegalDocument = {
  title: 'מדיניות ביטולים והחזרות',
  updatedAt: '2026-08-07',
  description:
    'ביטול עסקה, החזר כספי ודמי ביטול בקניון אקספרס: מה קובע החוק, מה תקף לקופונים ומה למוצרים פיזיים.',
  reviewNotice:
    'הנוסח נכתב על בסיס הוראות חוק הגנת הצרכן ותקנות ביטול עסקה, על בסיס התקנון המפורסם של האתר ועל בסיס אופן פעולת המערכת בפועל. הוא טעון אישור עורך דין לפני פרסום סופי.',
  blocks: [
    {
      type: 'paragraph',
      text: 'מדיניות זו מפרטת כיצד מבטלים עסקה שנעשתה באתר קניון אקספרס וכיצד מתבצע ההחזר הכספי. אין במדיניות זו כדי לגרוע מזכויות המוקנות לצרכן על פי חוק הגנת הצרכן, התשמ"א-1981 ותקנות הגנת הצרכן (ביטול עסקה), התשע"א-2010.',
    },
    { type: 'heading', text: 'איך מבטלים' },
    {
      type: 'unordered',
      items: [
        'ניתן לפנות דרך עמוד "צור קשר" באתר, בדואר אלקטרוני info@kenyonexpress.co.il או בוואטסאפ 052-463-5550.',
        'בפנייה יש לציין את מספר ההזמנה, את הפריט שאותו מבקשים לבטל ואת סיבת הביטול.',
        'הודעת ביטול תיקלט גם אם נשלחה בכל אחת מדרכי ההתקשרות שפורסמו על ידינו, ולא רק בדרך אחת מהן.',
      ],
    },
    { type: 'heading', text: 'חלון הביטול' },
    {
      type: 'unordered',
      items: [
        'ברכישה מרחוק ניתן לבטל עסקה בתוך 14 ימים מיום ביצוע העסקה או מיום קבלת המוצר, לפי המאוחר, ובעסקת שירות בתוך 14 ימים מיום ביצוע העסקה ובלבד שהביטול ייעשה לפחות שני ימים, שאינם ימי מנוחה, לפני המועד שבו אמור השירות להינתן.',
        'לאדם עם מוגבלות, לאזרח ותיק ולעולה חדש עומדת תקופת ביטול ארוכה יותר על פי חוק, בתוך ארבעה חודשים מיום העסקה, בכפוף להצגת תעודה מתאימה.',
        'ביטול שנעשה באותו יום שבו בוצע החיוב מבוטל מול חברת האשראי כעסקה שלא הועברה לסליקה, ולכן ההחזר מופיע מהר יותר בדף החשבון.',
      ],
    },
    { type: 'heading', text: 'דמי ביטול' },
    {
      type: 'unordered',
      items: [
        'בביטול שאינו עקב פגם או אי-התאמה, ייגבו דמי ביטול בשיעור של 5% ממחיר העסקה או 100 ש"ח, לפי הנמוך מביניהם. זהו השיעור המרבי הקבוע בחוק, והמערכת מחשבת אותו כך בפועל.',
        'בביטול עקב פגם, אי-התאמה בין המוצר או השירות לבין הפרטים שנמסרו, או אי-אספקה במועד, לא ייגבו דמי ביטול כלל וההחזר יהיה מלא.',
        'ההחזר מתבצע לאמצעי התשלום שבו בוצעה העסקה. סכום ששולם מיתרת הארנק באתר מוחזר ליתרת הארנק.',
      ],
    },
    { type: 'heading', text: 'קופונים ושוברים' },
    {
      type: 'unordered',
      items: [
        'קופון שנרכש ולא מומש ניתן לביטול בהתאם לחלון הביטול ולדמי הביטול שלעיל.',
        'קופון שכבר מומש בבית העסק אינו ניתן לביטול דרך האתר, משום שהשירות או המוצר כבר סופקו. פנייה במקרה כזה מטופלת מול בית העסק ומול שירות הלקוחות שלנו לגופו של עניין.',
        'קופון שפג תוקפו אינו ניתן למימוש בבית העסק. אם לדעתכם פג התוקף בנסיבות שאינן תלויות בכם, פנו אלינו.',
        'מחיר הקופון באתר הוא התשלום המקדמי בלבד. יתרת התשלום, ככל שקיימת, משולמת ישירות בבית העסק במועד המימוש, וביטול מול בית העסק של תשלום שנעשה שם אינו עובר דרך האתר.',
      ],
    },
    { type: 'heading', text: 'מוצרים פיזיים' },
    {
      type: 'unordered',
      items: [
        'החזרת מוצר תיעשה כשהוא באריזתו המקורית, בצירוף החשבונית, וכשלא נעשה בו שימוש.',
        'בביטול שאינו עקב פגם, עלות החזרת המוצר חלה על הלקוח.',
        'מוצר שלא נאסף או שהוחזר עקב טעות בפרטים שנמסרו בהזמנה הוא באחריות הלקוח.',
        'יש לבדוק את ההזמנה עם קבלתה ולפנות אלינו מיד אם התקבל פריט פגום או פריט שגוי.',
      ],
    },
    { type: 'heading', text: 'מי אחראי למוצר' },
    {
      type: 'paragraph',
      text: 'קניון אקספרס היא פלטפורמה המרכזת מבצעים של בתי עסק. המוצר או השירות עצמו מסופק על ידי בית העסק המפרסם, ובשאלות על טיב השירות, מועדי הפעילות והתנאים במקום יש לפנות אליו ישירות. ההתקשרות הכספית מול האתר, ובכלל זה ההחזר הכספי, מטופלת מולנו.',
    },
    { type: 'heading', text: 'זמן ההחזר' },
    {
      type: 'paragraph',
      text: 'לאחר אישור הביטול יבוצע ההחזר לאמצעי התשלום בתוך המועד הקבוע בחוק. מועד הופעת הזיכוי בדף החשבון תלוי בחברת האשראי, ובדרך כלל נדרשים עד שני מחזורי חיוב.',
    },
  ],
}
