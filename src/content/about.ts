/**
 * What this site is, said only in terms of what the code actually does.
 *
 * An "about" page is the easiest page on a site to fill with plausible
 * sentences - founding years, team sizes, customer counts - and every one of
 * them is a claim a regulator, a supplier or a customer can hold the business
 * to. Israeli consumer law treats a factual claim in marketing copy as binding.
 *
 * So the rule here is the one `content/legal/faq.ts` already applies: every
 * paragraph describes behaviour that exists in this repository today. A coupon
 * is issued per unit at payment and carries a signed QR the business scans; the
 * price on the site is a prepayment and the balance is paid at the counter;
 * validity comes from a mandatory per-product field with NO default, because
 * `finalizeOrder` refuses to issue a voucher without one; an unredeemed coupon
 * that expires is credited back to the customer's wallet by the nightly job.
 *
 * NO NUMBERS THAT ARE NOT MEASURED. No "thousands of customers", no "hundreds
 * of businesses", no founding date. The catalogue currently holds 80 products,
 * and quoting a figure that changes weekly on a static page is a claim that
 * goes stale without anybody noticing.
 */

export interface AboutSection {
  heading: string
  paragraphs: string[]
}

export const ABOUT_UPDATED_AT = '2026-08-10'

export const aboutIntro =
  'קניון אקספרס היא פלטפורמה ישראלית לרכישת קופונים ומוצרים מבתי עסק. אנחנו מוכרים שוברים שנרכשים כאן ומומשים אצל בית העסק עצמו, ומוצרים שנשלחים אליכם הביתה.'

export const aboutSections: readonly AboutSection[] = [
  {
    heading: 'איך קופון עובד כאן',
    paragraphs: [
      'המחיר שמוצג באתר הוא התשלום המקדים. הוא נגבה בעת הרכישה, ומיד אחריו נוצר שובר אישי לכל יחידה שנרכשה, עם קוד QR חתום.',
      'את השובר מציגים בבית העסק, שם סורקים אותו. אם נותרה יתרה לתשלום, היא נגבית בבית העסק עצמו ולא דרכנו. סכום היתרה מוצג בדף המוצר לפני הרכישה ועל השובר עצמו.',
      'שובר נסרק פעם אחת בלבד. הבדיקה נעשית במסד הנתונים ברגע הסריקה, ולא במכשיר שסורק, כך ששובר שכבר מומש נדחה גם אם התמונה שלו נשמרה או צולמה.',
    ],
  },
  {
    heading: 'תוקף, ומה קורה כשהוא נגמר',
    paragraphs: [
      'לכל מוצר קופון יש תקופת תוקף משלו, שנקבעת מראש ומוצגת לפני הרכישה. אין אצלנו ברירת מחדל: מוצר בלי תוקף מוגדר פשוט לא מנפיק שובר.',
      'קופון שלא מומש עד תום התוקף אינו מאבד את הכסף. מדי לילה רצה בדיקה שמזכה את הארנק שלכם באתר בסכום ששולם עליו כאן. פקיעה אינה חילוט.',
      'לפני שהתוקף נגמר אנחנו שולחים תזכורת - שבוע לפני, ושוב יום לפני.',
    ],
  },
  {
    heading: 'כסף, החזרים וחשבוניות',
    paragraphs: [
      'הסליקה מתבצעת דרך Cardcom. אנחנו לא שומרים מספרי כרטיס אשראי; כרטיס שנשמר לתשלום עתידי נשמר כטוקן אצל חברת הסליקה בלבד.',
      'על כל תשלום מונפק מסמך: קבלה על רכישת קופון, וחשבונית מס-קבלה על מוצר פיזי. המסמך זמין באזור האישי תחת ההזמנה, ונשלח גם בקישור במייל האישור.',
      'ביטול עסקה נעשה לפי חוק הגנת הצרכן. פירוט מלא של הזכויות, דמי הביטול והחריגים נמצא בעמוד מדיניות הביטולים.',
    ],
  },
  {
    heading: 'בתי העסק',
    paragraphs: [
      'כל דיל מגיע מבית עסק אמיתי, ופרטי העסק - שם, כתובת וטלפון - מוצגים בדף המוצר ונשמרים על ההזמנה כפי שהיו ביום הרכישה. שינוי שם או כתובת בהמשך לא משנה את מה שכתוב על השובר שכבר נרכש.',
      'בית עסק שמעוניין להצטרף יכול לפנות אלינו דרך עמוד הצטרפות הספקים.',
    ],
  },
  {
    heading: 'נגישות ופרטיות',
    paragraphs: [
      'האתר נבנה בעברית עם תמיכה מלאה בכיווניות ימין-לשמאל, ונבדק מול תקן הנגישות. הצהרת הנגישות המלאה נמצאת בעמוד ייעודי.',
      'איננו שומרים מי חיפש מה: נתוני החיפוש נשמרים כמונחים בלבד, בלי משתמש ובלי כתובת IP. היסטוריית החיפוש האישית שלכם גלויה לכם בלבד וניתנת למחיקה.',
    ],
  },
] as const
