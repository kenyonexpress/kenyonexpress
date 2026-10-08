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
 *
 * STEP 53 added the mission, the story, the team, the press registry and the
 * contact block, under the same rule:
 *
 * - THE STORY names what the repo can show. The live site ran WordPress and
 *   WooCommerce (`KE_LIVE_SPEC.md`, the legacy redirect map, the WordPress
 *   export the legal content was mined from), and this codebase is the
 *   rebuild. No year is given because none is recorded anywhere here.
 * - THE TEAM is one person, by first name and role. The repo records Ofir as
 *   the owner who takes every decision (`docs/DECISIONS.md`), the inbox that
 *   receives support mail (`SUPPORT_TO`) and the number WhatsApp messages are
 *   forwarded to (`server/whatsapp/forward-to-owner`). A surname is not
 *   recorded in the repo, so none is printed; a biography would be invention.
 * - PRESS MENTIONS ARE A REGISTRY, AND IT IS EMPTY. Nothing in the repo, the
 *   captured live site or the specs records a single article about the site
 *   (measured: zero matches for עיתונות / כתבו עלינו / press). An empty list
 *   renders a press-contact block, not a row of invented logos, and
 *   `about.test.ts` refuses an entry without a real URL, outlet and date, so
 *   the first mention has to be a real one.
 */

export interface AboutSection {
  heading: string
  paragraphs: string[]
}

export const ABOUT_UPDATED_AT = '2026-10-08'

export const aboutIntro =
  'קניון אקספרס היא פלטפורמה ישראלית לרכישת קופונים ומוצרים מבתי עסק. אנחנו מוכרים שוברים שנרכשים כאן ומומשים אצל בית העסק עצמו, ומוצרים שנשלחים אליכם הביתה.'

/**
 * The mission, in two paragraphs. Each sentence is a promise the code keeps:
 * the balance is paid at the counter (`CouponOffer`), an expired coupon is
 * credited back (`expire-vouchers` cron), and the business details on a
 * voucher are frozen at purchase (`order_items` snapshot).
 */
export const aboutMission: AboutSection = {
  heading: 'המשימה שלנו',
  paragraphs: [
    'להפוך רכישת קופון לעסקה הוגנת לשני הצדדים: הלקוח משלם כאן רק מקדמה ויודע מראש בדיוק מה ישלם בבית העסק, ובית העסק מקבל לקוח שכבר התחייב להגיע.',
    'ובעיקר, שאף אחד לא יפסיד כסף על קופון שנשכח. אצלנו קופון שפג תוקפו חוזר לארנק של הלקוח באתר, ולא נעלם.',
  ],
}

/**
 * The story. What the repo can show and nothing it cannot: a WooCommerce
 * storefront that was rebuilt, and the model that rebuild was built around.
 */
export const aboutStory: AboutSection = {
  heading: 'הסיפור',
  paragraphs: [
    'קניון אקספרס התחיל כחנות קופונים קטנה על גבי WooCommerce. החנות עבדה, אבל כל קופון היה קובץ PDF שנשלח במייל, ובית העסק לא יכול היה לדעת אם שובר כבר מומש.',
    'האתר הזה הוא בנייה מחדש מהיסוד, סביב שלושה דברים שרצינו לתקן: שובר אישי עם קוד QR חתום שנסרק פעם אחת בלבד, יתרה שמוצגת לפני הרכישה ומשולמת בבית העסק עצמו, ותוקף שלא מחלט את הכסף של הלקוח.',
    'הכתובות הישנות של החנות ממשיכות לעבוד ומפנות לעמודים החדשים, כך שקישור ששמרתם לא נשבר.',
  ],
}

export interface TeamMember {
  /** As printed. First name only when that is all the repo records. */
  name: string
  role: string
  /** One line of what this person does here, each clause something the code routes to them. */
  about: string
}

/**
 * The team. One entry today, and the entry says only what the repo routes to
 * this person: support mail (`supportEmail`), WhatsApp forwarding
 * (`forward-to-owner`), and every product decision (`docs/DECISIONS.md`).
 */
export const aboutTeam: readonly TeamMember[] = [
  {
    name: 'אופיר',
    role: 'מייסד ומפעיל האתר',
    about:
      'מנהל את הקטלוג ואת הקשר עם בתי העסק, ועונה בעצמו לפניות בוואטסאפ ובמייל. כל החלטה על איך האתר עובד עוברת דרכו.',
  },
] as const

export interface PressMention {
  /** The publication, as the reader knows it. */
  outlet: string
  /** The article's own headline, unedited. */
  title: string
  /** The article, absolute https URL. */
  url: string
  /** ISO date, YYYY-MM-DD, the article's own date. */
  publishedAt: string
}

/**
 * Articles about the site. EMPTY until a real one exists: the first entry
 * has to carry the article's own URL and date, and the test enforces that.
 */
export const pressMentions: readonly PressMention[] = []

/** What the press section says while the registry is empty. */
export const PRESS_EMPTY_COPY = {
  heading: 'כתבו עלינו',
  body: 'עדיין לא פורסמה כתבה על קניון אקספרס, ולא נמציא אחת. כשתהיה, היא תופיע כאן עם קישור למקור.',
  invite: 'עיתונאים ובלוגרים שרוצים לכתוב על המודל, על בתי העסק או על האתר מוזמנים לפנות במייל:',
  /** The `mailto:` subject, so a press mail is recognisable in the inbox. */
  subject: 'פנייה עיתונאית',
} as const

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
