/**
 * The trust pages: the story, how the thing works, and what happens to money.
 *
 * SAME RULE AS `src/content/about.ts`, AND FOR THE SAME REASON. Every sentence
 * here describes behaviour that exists in this repository today. Israeli
 * consumer law treats a factual claim in marketing copy as binding, so a
 * paragraph that is merely plausible is a liability rather than a draft.
 *
 * THREE CLAIMS THAT WERE ASKED FOR AND ARE NOT WRITTEN HERE, each replaced by
 * the true version of itself:
 *
 * 1. "THE CHEAPEST DEALS IN ISRAEL." A superlative about every competitor's
 *    price is a comparative advertising claim that nobody in this codebase can
 *    substantiate, and it goes stale the day someone else discounts. What is
 *    substantiable is the MECHANISM that makes the price low, which is what
 *    `whyItIsCheap` says: a prepayment rather than a full price, a commission
 *    that is a per product number instead of a fixed markup, and a balance
 *    that is paid at the counter and never passes through us and is therefore
 *    never marked up.
 *
 * 2. "YOUR MONEY IS HELD IN ESCROW UNTIL YOU REDEEM." It is not, and saying so
 *    would be the single most dangerous sentence on the site. The escrow model
 *    was abolished on 2026-07-28 (see `settlement.ts` and
 *    `no-escrow-in-supplier-due.test.ts`): a coupon prepayment settles at
 *    payment time and there is no held balance and no release on scan. The
 *    payment page therefore EXPLAINS what escrow is, says plainly that this is
 *    not the model here, and sets out the protections that do exist. A reader
 *    who wanted escrow deserves to learn that in one sentence rather than to
 *    discover it during a dispute.
 *
 * 3. ANY NUMBER THAT IS NOT MEASURED. No founding year, no customer count, no
 *    business count. The catalogue changes weekly and a static page cannot
 *    track it.
 */

export interface TrustSection {
  heading: string
  paragraphs: readonly string[]
}

/**
 * One step in an illustrated flow.
 *
 * `icon` is a key, not markup. The drawing lives in `StepIllustration.tsx` so
 * that this file stays reviewable as text: a person checking what the site
 * claims should not have to read SVG path data to do it.
 */
export interface TrustStep {
  icon: 'browse' | 'pay' | 'scan' | 'join' | 'publish' | 'settle'
  title: string
  description: string
  /** The precise, checkable detail under the plain sentence. Optional. */
  note?: string
}

export const TRUST_UPDATED_AT = '2026-09-01'

/* ------------------------------------------------------------------ /about */

export const aboutLede =
  'קניון אקספרס היא פלטפורמה ישראלית שמחברת בין אנשים שרוצים לצאת מהבית לבין בתי עסק שרוצים למלא שולחנות וכיסאות. אנחנו מוכרים שוברים שנרכשים כאן ומומשים בבית העסק עצמו, ומוצרים שנשלחים אליכם הביתה.'

export const aboutStory: readonly TrustSection[] = [
  {
    heading: 'הסיפור',
    paragraphs: [
      'האתר הזה התחיל כאתר ווקומרס, ונבנה מחדש מהיסוד כשהתברר שהבעיה האמיתית איננה עיצוב אלא כסף. באתר הישן מחיר שהוצג ללקוח ומחיר שנגבה בפועל חושבו בשני מקומות שונים, ושני מקומות שמחשבים מחיר הם שני מחירים שנפרדים זה מזה במוקדם או במאוחר.',
      'הגרסה הזו נבנתה סביב ההפך מכך. כל סכום כסף במערכת הוא מספר שלם באגורות, כל חישוב עובר דרך מודול אחד, ואין בשום מקום במסלול הכסף מספר עשרוני. זו איננה החלטה טכנית בלבד: היא הסיבה שהמחיר שאתם רואים בדף המוצר הוא בדיוק הסכום שיחויב בכרטיס.',
    ],
  },
  {
    heading: 'החזון',
    paragraphs: [
      'שדיל יהיה דבר משעמם. בלי כוכביות, בלי תנאים שמתגלים בקופה, ובלי הפתעות ביום המימוש. לפני הרכישה כתוב כמה משלמים כאן, כמה נשאר לשלם בבית העסק, ועד מתי השובר תקף, והשלושה האלה נשמרים על ההזמנה כפי שהיו ביום הקנייה.',
      'אנחנו רוצים שגם לבית העסק זה יהיה משעמם. עסק שמצטרף מקבל אחוז עמלה שנקבע לו פרטנית, מצולם על ההזמנה ברגע הרכישה, ואינו משתנה למפרע. עסק שיודע מראש כמה יקבל יכול לתמחר דיל טוב, וזה בדיוק העסק שאנחנו רוצים להביא אליכם.',
    ],
  },
]

export const whyItIsCheap: TrustSection = {
  heading: 'למה המחיר כאן נמוך',
  paragraphs: [
    'הסיבה הראשונה היא שאתם לא משלמים כאן את מלוא המחיר. הסכום באתר הוא תשלום מקדים, והיתרה נגבית בבית העסק בזמן המימוש. היתרה איננה עוברת דרכנו כלל, ולכן גם איננה נושאת עמלה: אנחנו לא מגלגלים עליה שום תוספת, מפני שהיא מעולם לא הייתה אצלנו.',
    'הסיבה השנייה היא שאין כאן שיעור עמלה אחיד. לכל מוצר יש אחוז פלטפורמה משלו, שנקבע מול בית העסק ומצולם על שורת ההזמנה בזמן הרכישה. מרווח אחיד לכל הקטלוג היה מכריח כל עסק לתמחר לפי הממוצע, כלומר להעלות מחיר של דילים טובים כדי לכסות אחרים.',
    'הסיבה השלישית היא שלא נכנס בדרך אף גורם נוסף. הדיל מגיע מבית העסק עצמו, ופרטיו, השם, הכתובת והטלפון, מוצגים בדף המוצר. אין מפיץ ואין מתווך שגובה נתח בדרך.',
    'ומה שלא נאמר כאן במכוון: אנחנו לא טוענים שכל דיל אצלנו זול מכל דיל אחר בישראל. מי שרוצה להשוות מוזמן להשוות. מה שאנחנו כן מתחייבים לו הוא שהמחיר שכתוב הוא המחיר שנגבה, ושמה שנותר לשלם כתוב לפני הרכישה ולא אחריה.',
  ],
}

/* ------------------------------------------------- /about/how-it-works */

export const buyerStepsLede = 'שלושה צעדים, מהרגע שמצאתם דיל ועד שאכלתם. אין שלב רביעי נסתר.'

export const buyerSteps: readonly TrustStep[] = [
  {
    icon: 'browse',
    title: 'בוחרים דיל',
    description:
      'בדף המוצר מוצגים שלושה מספרים לפני כל לחיצה: כמה משלמים כאן, כמה יישאר לשלם בבית העסק, ועד מתי השובר תקף.',
    note: 'מוצר קופון בלי תקופת תוקף מוגדרת לא מנפיק שובר כלל. אין ברירת מחדל.',
  },
  {
    icon: 'pay',
    title: 'משלמים כאן',
    description:
      'התשלום עובר בעמוד מאובטח של Cardcom. פרטי הכרטיס אינם עוברים דרך השרתים שלנו ואינם נשמרים אצלנו, וכרטיס שנשמר לפעם הבאה נשמר כטוקן אצל חברת הסליקה בלבד.',
    note: 'הכניסה לחשבון נדרשת רק ברגע התשלום. עד אז אפשר לגלוש ולמלא סל כאורח.',
  },
  {
    icon: 'scan',
    title: 'מממשים בבית העסק',
    description:
      'מיד אחרי התשלום נוצר שובר אישי לכל יחידה שנרכשה, עם קוד QR חתום, ונשלח למייל וזמין באזור האישי. בבית העסק סורקים אותו ומשלימים את היתרה במקום.',
    note: 'הבדיקה נעשית במסד הנתונים ברגע הסריקה ולא במכשיר הסורק, ולכן שובר שכבר מומש נדחה גם אם צולם או הועבר הלאה.',
  },
]

export const supplierStepsLede = 'ולבית העסק, אותם שלושה צעדים מהצד השני של הדלפק.'

export const supplierSteps: readonly TrustStep[] = [
  {
    icon: 'join',
    title: 'מצטרפים',
    description:
      'בית העסק משאיר פרטים בעמוד הצטרפות הספקים, ואנחנו חוזרים אליו. בשיחה נקבעים אחוז הפלטפורמה ותנאי הדיל, פרטנית ולא לפי טבלה אחידה.',
  },
  {
    icon: 'publish',
    title: 'מפרסמים דיל',
    description:
      'בפורטל הספקים מגדירים את המחיר המקדים, את היתרה שתיגבה בעסק ואת תקופת התוקף. השלושה מוצגים ללקוח בדף המוצר בדיוק כפי שהוגדרו.',
    note: 'אחוז הפלטפורמה מצולם על שורת ההזמנה בזמן הרכישה. עריכה של המוצר מחר לא משנה הזמנה שכבר בוצעה.',
  },
  {
    icon: 'settle',
    title: 'סורקים ומקבלים',
    description:
      'בזמן המימוש סורקים את ה QR, המערכת מאשרת או דוחה מיידית, והיתרה נגבית בקופה של בית העסק ואיננה עוברת דרכנו. חלקו של בית העסק בתשלום המקדים מוצג בלוח הבקרה שלו לפי אותו אחוז.',
  },
]

/* --------------------------------------------- /about/payment-security */

export const paymentLede =
  'מה קורה לכסף שלכם מרגע הלחיצה על "לתשלום". בעברית פשוטה, בלי הפניות לתקנון.'

export const paymentSections: readonly TrustSection[] = [
  {
    heading: 'איפה מוקלד הכרטיס',
    paragraphs: [
      'הסליקה מתבצעת דרך Cardcom, חברת סליקה ישראלית מורשית. בלחיצה על תשלום נפתח עמוד תשלום שלהם, ופרטי הכרטיס מוקלדים שם ולא אצלנו. מספר הכרטיס איננו עובר דרך השרתים שלנו ואיננו נשמר בהם בשום שלב.',
      'מי שמסמן שמירת כרטיס לפעם הבאה לא משאיר אצלנו כרטיס. מה שנשמר הוא טוקן, מזהה חסר משמעות בפני עצמו, שאפשר לחייב בו רק דרך אותה חברת סליקה ורק דרך הטרמינל שיצר אותו. טוקן שידלוף איננו כרטיס אשראי ואי אפשר לקנות בו בשום מקום אחר.',
    ],
  },
  {
    heading: 'איך אנחנו יודעים שבאמת שילמתם',
    paragraphs: [
      'בסוף התשלום Cardcom שולחת אלינו הודעה. אנחנו לא סומכים על תוכן ההודעה הזו. בכל פעם אנחנו פונים בחזרה לחברת הסליקה, משרת לשרת, ושואלים אותה מה הסכום ומה הסטטוס, והתשובה שלה היא המקור היחיד שנחשב.',
      'המשמעות המעשית: מי ששולח לנו הודעה מזויפת שאומרת "שולם" לא מקבל שובר, מפני שהאימות החוזר יגלה שלא שולם דבר. בכיוון השני, הודעה שנשלחת פעמיים לא מנפיקה שני שוברים ולא מחייבת פעמיים, כי כל פעולה מזוהה במפתח ייחודי וחזרה עליה איננה עושה דבר.',
    ],
  },
  {
    heading: 'נאמנות (escrow): מה זה, ומה המצב כאן',
    paragraphs: [
      'נאמנות היא הסדר שבו הכסף שאתם משלמים יושב אצל צד שלישי ומשוחרר לבית העסק רק אחרי שקיבלתם את מה שקניתם.',
      'כאן אין הסדר כזה, ואנחנו אומרים את זה במפורש כדי שלא תניחו אחרת. התשלום המקדים על קופון מוסדר במלואו ברגע התשלום, ואין סכום שמוחזק ואין שחרור בזמן הסריקה. הסיבה היא שבמודל הזה בית העסק גובה את עיקר התמורה ישירות מכם בקופה, כך שהסכום שעובר דרכנו הוא חלק קטן מהעסקה ולא מלואה.',
      'מה שמחליף נאמנות כאן הוא שהחשיפה שלכם מוגבלת מלכתחילה לתשלום המקדים, ושעל הסכום הזה חלות ההגנות שבסעיף הבא. אם אתם מחפשים דווקא הסדר נאמנות, זו הסיבה שכדאי לדעת עליה לפני הרכישה ולא במהלך מחלוקת.',
    ],
  },
  {
    heading: 'מה מגן עליכם בפועל',
    paragraphs: [
      'שובר שלא מומש עד תום התוקף איננו מאבד את הכסף. מדי לילה רצה בדיקה שמזכה את הארנק שלכם באתר בסכום ששולם עליו כאן. פקיעה איננה חילוט, ולפני שהתוקף נגמר נשלחות שתי תזכורות, שבוע לפני ויום לפני.',
      'ביטול עסקה נעשה לפי חוק הגנת הצרכן. דמי הביטול שהחוק מתיר הם הנמוך מבין 5 אחוזים מהעסקה או 100 שקלים, וזה בדיוק מה שהמערכת מחשבת. בביטול בשל פגם או אי התאמה דמי הביטול הם אפס.',
      'על כל תשלום מונפק מסמך: קבלה על רכישת קופון, וחשבונית מס קבלה על מוצר פיזי. המסמך זמין באזור האישי תחת ההזמנה ונשלח גם בקישור במייל האישור.',
      'ומעל הכל, ההגנה הרגילה של כרטיס האשראי שלכם עומדת בעינה. עסקה שלא הכרתם היא עסקה שאפשר להתמודד איתה מול חברת האשראי בדיוק כמו בכל רכישה מקוונת אחרת.',
    ],
  },
  {
    heading: 'השובר עצמו',
    paragraphs: [
      'ה QR שעל השובר איננו מספר סידורי אלא מחרוזת חתומה. שובר שיוצר בלי המפתח שלנו נדחה בסריקה, כך שצילום מסך של שובר של מישהו אחר או ניסיון לייצר שובר לבד אינם עובדים.',
      'סריקה מאשרת שובר פעם אחת בלבד, והבדיקה נעשית מול מסד הנתונים ולא במכשיר שסורק. אין מצב של סריקה חלקית ואין סריקה שנייה.',
    ],
  },
]
