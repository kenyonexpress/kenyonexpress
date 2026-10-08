import { ATTRIBUTION_COOKIE, ATTRIBUTION_WINDOW_DAYS } from '@/lib/analytics/attribution'
import {
  CHECKOUT_VARIANT_CACHE_KEY,
  CHECKOUT_VARIANT_COOKIE,
} from '@/lib/analytics/checkout-variant'
import { CONSENT_COOKIE, CONSENT_MAX_AGE_SECONDS } from '@/lib/analytics/consent'
import { REPLAY_OPTIN_COOKIE, REPLAY_OPTIN_MAX_AGE_SECONDS } from '@/lib/analytics/replay-optin'
import { BUGGY_SESSION_STORAGE_KEY } from '@/lib/analytics/replay-trigger'
import { SESSION_STORAGE_KEY } from '@/lib/analytics/session'
import { SIGNUP_UID_COOKIE, SIGNUP_UID_MAX_AGE } from '@/lib/auth/signup-phone'
import { CART_COUPON_COOKIE, CART_EXPIRY_DAYS } from '@/lib/cart/coupon-cookie'
import { GUEST_SESSION_COOKIE, GUEST_SESSION_MAX_AGE } from '@/lib/cart/guest-session-cookie'
import { CART_FALLBACK_KEY } from '@/lib/cart/local-fallback'
import { CART_SHIPPING_COOKIE } from '@/lib/cart/shipping-cookie'
import { POSTHOG_ID_COOKIE } from '@/lib/observability/posthog'
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE } from '@/lib/referrals/cookie'
import type { LegalDoc } from './types'

/**
 * The cookie policy.
 *
 * EVERY NAME IN THE TABLES IS THE CONSTANT THE CODE SETS, IMPORTED. A cookie
 * policy that lists `ke_session` while the browser receives `ke_session_id` is
 * the sentence a regulator quotes back, and it is also the sentence that
 * stops a customer finding the cookie they want to delete. So the names and
 * the lifetimes are read from the modules that own them, and renaming a
 * cookie without touching this file is a type error, not a drift.
 *
 * WHY A SEPARATE PAGE FROM THE PRIVACY POLICY. The privacy policy's cookie
 * section (privacy.ts, `cookies`) names the seven a reader is most likely to
 * ask about and explains the two consent doors. This page is the full
 * inventory: every cookie, localStorage and sessionStorage key the storefront
 * writes, who writes it, for how long, and under which consent category. The
 * policy links here; `legal-pages.test.ts` holds that the inventory covers
 * every `ke_` constant the code declares.
 *
 * WHAT "NECESSARY" MEANS HERE is what `lib/analytics/consent.ts` says it
 * means: not a category the banner asks about. Session, cart, login and the
 * consent record itself are not gated, and cannot be refused from inside the
 * site, only from the browser.
 */
const days = (seconds: number): string => `${Math.round(seconds / 86_400)} ימים`
const months = (seconds: number): string => `${Math.round(seconds / (86_400 * 30))} חודשים`

/**
 * Three keys are literals rather than imports, on purpose: `CART_MIRROR_KEY`
 * and `SAVED_FOR_LATER_KEY` live in modules that construct zustand stores,
 * `DELIVERY_CITY_KEY` is exported from a 'use client' component (a value
 * import from one of those is a proxy on the server), and PostHog's
 * localStorage key is not exported at all. `legal-pages.test.ts` greps every
 * `ke_` constant the code declares and fails if one is missing from this page,
 * so a literal here is held to the same standard as an import.
 */
const CART_MIRROR_KEY = 'ke_cart_mirror_v1'
const SAVED_FOR_LATER_KEY = 'ke_saved_for_later_v1'
const DELIVERY_CITY_KEY = 'ke_delivery_city_v1'
const POSTHOG_DISTINCT_ID_KEY = 'ke_ph_distinct_id'

const NECESSARY = 'הכרחית'
const ANALYTICS = 'מדידת שימוש'
const MARKETING = 'מדידת פרסום'

const cookieRows: string[][] = [
  [
    GUEST_SESSION_COOKIE,
    NECESSARY,
    days(GUEST_SESSION_MAX_AGE),
    'מזהה אקראי של עגלת הקניות של מבקר שאינו מחובר לחשבון. אינו נגיש לסקריפטים בדפדפן.',
  ],
  [
    CONSENT_COOKIE,
    NECESSARY,
    months(CONSENT_MAX_AGE_SECONDS),
    'ההחלטה שלכם בבאנר ההסכמה, לפי סוג, יחד עם גרסת הנוסח שאושרה. אם הנוסח משתנה מהותית, תישאלו שוב.',
  ],
  [
    CART_COUPON_COOKIE,
    NECESSARY,
    days(CART_EXPIRY_DAYS * 86_400),
    'קודי הקופון שהוזנו לעגלה, כדי שיישארו בה בין עמודים. המחיר מחושב מחדש בכל טעינה ואינו נשמר בעוגייה.',
  ],
  [
    CART_SHIPPING_COOKIE,
    NECESSARY,
    days(CART_EXPIRY_DAYS * 86_400),
    'שיטת המשלוח שבחרתם בעגלה. העוגייה מכילה את מזהה השיטה בלבד; המחיר נקרא מחדש בכל פעם.',
  ],
  [
    REFERRAL_COOKIE,
    NECESSARY,
    days(REFERRAL_COOKIE_MAX_AGE),
    'נוצרת רק אם הגעתם דרך קישור הפניה של חבר, ושומרת את קוד ההפניה כדי שההטבה תיזקף לשניכם. אינה נגישה לסקריפטים בדפדפן.',
  ],
  [
    SIGNUP_UID_COOKIE,
    NECESSARY,
    `${SIGNUP_UID_MAX_AGE / 60} דקות`,
    'בזמן ההרשמה בלבד: מזהה החשבון החדש בין שליחת הטופס לבין לחיצה על "שלח קוד שוב". מוגבלת לעמוד ההרשמה.',
  ],
  [
    'עוגיות התחברות של Supabase (sb-…-auth-token)',
    NECESSARY,
    'כל עוד אתם מחוברים',
    'שמירת מצב ההתחברות לחשבון בין עמודים ובין ביקורים. נמחקות ביציאה מהחשבון.',
  ],
  [
    ATTRIBUTION_COOKIE,
    ANALYTICS,
    `${ATTRIBUTION_WINDOW_DAYS} ימים`,
    'פרמטרי הקמפיין (utm) שדרכם הגעתם לאתר, בביקור הראשון ובאחרון, למדידת ערוצי שיווק.',
  ],
  [
    POSTHOG_ID_COOKIE,
    ANALYTICS,
    days(GUEST_SESSION_MAX_AGE),
    'העתק של המזהה האנונימי של כלי המדידה, כדי שרכישה שהושלמה תשויך לאותו ביקור. אינו מזהה אתכם אישית.',
  ],
  [
    CHECKOUT_VARIANT_COOKIE,
    ANALYTICS,
    'עד סגירת הדפדפן',
    'באיזו גרסה של מסך התשלום צפיתם, לצורך השוואה בין גרסאות. אינה משפיעה על המחיר.',
  ],
  [
    REPLAY_OPTIN_COOKIE,
    ANALYTICS,
    months(REPLAY_OPTIN_MAX_AGE_SECONDS),
    'הסכמה מפורשת, שניתנת רק מהאזור האישי, להקלטת הפעולות במסך לצורך טיפול בתקלה. כבויה כברירת מחדל.',
  ],
]

const storageRows: string[][] = [
  [
    CART_MIRROR_KEY,
    'localStorage',
    NECESSARY,
    'מספר הפריטים בעגלה, כדי שהמונה בראש העמוד יוצג מיד בטעינה. נדרס בתשובה הראשונה מהשרת.',
  ],
  [
    CART_FALLBACK_KEY,
    'localStorage',
    NECESSARY,
    `תמונת מצב של העגלה להצגה כשאין חיבור. אינה משמשת לחיוב, ונמחקת לאחר ${CART_EXPIRY_DAYS} ימים.`,
  ],
  [
    SAVED_FOR_LATER_KEY,
    'localStorage',
    NECESSARY,
    'הפריטים ששמרתם "לפעם אחרת" מהעגלה, עם המחיר כפי שהיה בעת השמירה. החזרה לעגלה מתמחרת מחדש.',
  ],
  [
    DELIVERY_CITY_KEY,
    'localStorage',
    NECESSARY,
    'היישוב שבחרתם להערכת זמן המשלוח בעגלה, כדי שלא תישאלו שוב. אינו נשלח לשרת.',
  ],
  [
    SESSION_STORAGE_KEY,
    'אחסון דפדפן',
    ANALYTICS,
    'מזהה ביקור אקראי, שמתחדש לאחר 30 דקות ללא פעילות, לקיבוץ צפיות עמוד לביקור אחד.',
  ],
  [
    POSTHOG_DISTINCT_ID_KEY,
    'localStorage',
    ANALYTICS,
    'המזהה האנונימי של כלי המדידה, קבוע לדפדפן זה. אינו מכיל פרטים מזהים.',
  ],
  [
    CHECKOUT_VARIANT_CACHE_KEY,
    'sessionStorage',
    ANALYTICS,
    'גרסת מסך התשלום שהוקצתה לביקור זה, כדי שלא תתחלף באמצע הקנייה. נמחק בסגירת הלשונית.',
  ],
  [
    BUGGY_SESSION_STORAGE_KEY,
    'sessionStorage',
    ANALYTICS,
    'סימון שבביקור זה אירעה שגיאה, כדי שהקלטת מסך, אם אישרתם אותה, תתחיל רק אז. נמחק בסגירת הלשונית.',
  ],
]

const thirdPartyRows: string[][] = [
  [
    'PostHog',
    ANALYTICS,
    'עוגיות ואחסון בקידומת ph_',
    'ספירת עמודים, עגלה ורכישות תחת מזהה אנונימי, וניסויי ממשק. נטען רק לאחר הסכמה לסוג "מדידת שימוש באתר".',
  ],
  [
    'Google Analytics 4',
    MARKETING,
    '_ga, _ga_*',
    'מדידת קמפיינים והמרות. אינו נטען כלל לפני הסכמה לסוג "מדידת פרסום".',
  ],
  [
    'Meta Pixel',
    MARKETING,
    '_fbp, _fbc',
    'מדידת פרסום בפייסבוק ובאינסטגרם והתאמת מודעות. אינו נטען כלל לפני הסכמה לסוג "מדידת פרסום".',
  ],
  [
    'Cardcom',
    NECESSARY,
    'עוגיות של עמוד התשלום',
    'עמוד התשלום המאובטח של חברת הסליקה, שאליו אתם מועברים בעת החיוב. פועל לפי מדיניות הפרטיות של Cardcom.',
  ],
]

export const cookiesDoc: LegalDoc = {
  slug: 'cookies',
  path: '/cookies',
  title: 'מדיניות עוגיות',
  description:
    'מדיניות העוגיות של קניון אקספרס: רשימה מלאה של כל עוגייה ופריט אחסון בדפדפן שהאתר מציב, משך חייו ומטרתו, שני סוגי ההסכמה, כלי צד שלישי שנטענים רק לאחר הסכמה, ואיך משנים את ההחלטה בכל עת.',
  updatedAt: '2026-10-08',
  version: '1.0',
  effectiveAt: '2026-10-08',
  history: [
    {
      version: '1.0',
      effectiveAt: '2026-10-08',
      summary:
        'נוסח ראשון: הרשימה המלאה של העוגיות ופריטי האחסון, שני סוגי ההסכמה, כלי צד שלישי ודרכי שינוי ההחלטה.',
    },
  ],
  reviewNotice:
    'הרשימות בעמוד זה נגזרות ישירות מהקוד שמציב את העוגיות, ולכן הן מתארות את המצב בפועל. הנוסח המשפטי טרם עבר אישור עורך דין, והוא משלים את מדיניות הפרטיות ואינו מחליף אותה.',
  intro: [
    'עמוד זה מפרט אילו עוגיות ופריטי אחסון בדפדפן מציב אתר קניון אקספרס, מי מציב אותם, לכמה זמן ולאיזו מטרה, ואיך אתם שולטים בהם. הוא משלים את סעיף העוגיות במדיניות הפרטיות ומהווה חלק בלתי נפרד ממנה.',
    'העיקרון שמנחה אותנו פשוט: מה שנדרש כדי שהאתר יעבוד מוצב תמיד, וכל השאר מוצב רק אחרי שאמרתם כן, לכל סוג בנפרד.',
  ],
  sections: [
    {
      id: 'what',
      title: 'מהן עוגיות ופריטי אחסון',
      blocks: [
        {
          type: 'paragraph',
          text: 'עוגייה (cookie) היא קובץ טקסט קטן שאתר שומר בדפדפן שלכם, והדפדפן מחזיר אותו לאתר בכל בקשה. בנוסף לעוגיות, הדפדפן מאפשר לאתר לשמור מידע בשני מחסנים מקומיים: localStorage, שנשאר עד שנמחק, ו-sessionStorage, שנמחק בסגירת הלשונית. המידע בשני המחסנים אינו נשלח לשרת מעצמו, והאתר עושה בהם שימוש בעיקר כדי שהעגלה והעדפותיכם יוצגו מיד.',
        },
        {
          type: 'paragraph',
          text: 'כל העוגיות ופריטי האחסון שהאתר עצמו מציב נושאים את הקידומת ke_, כדי שתוכלו לזהות אותם בקלות בכלי הדפדפן ולמחוק אותם אם תרצו.',
        },
      ],
    },
    {
      id: 'categories',
      title: 'שלושה סוגים, שתי שאלות',
      blocks: [
        {
          type: 'unordered',
          items: [
            'הכרחיות: נדרשות לתפעול האתר. בלעדיהן העגלה, ההתחברות, בחירת המשלוח והתשלום אינם יכולים לפעול. הן מוצבות תמיד, ואינן נשאלות בבאנר ההסכמה. אפשר לחסום אותן בהגדרות הדפדפן, אך אז חלקים מהאתר לא יעבדו.',
            'מדידת שימוש באתר: כלי המדידה שלנו ו-PostHog, שמתעדים אילו עמודים נצפו, מה נוסף לעגלה ומה נרכש, תחת מזהה אנונימי, כדי שנבין מה עובד באתר ומה לא. מוצבות רק לאחר הסכמה לסוג זה.',
            'מדידת פרסום: Google Analytics ו-Meta Pixel, שמודדים אילו קמפיינים הביאו רכישות ומאפשרים התאמת פרסום. הסקריפטים שלהם אינם נטענים כלל, ולא נשלחת אליהם כל בקשה, לפני הסכמה לסוג זה.',
          ],
        },
        {
          type: 'paragraph',
          text: 'בבאנר ההסכמה אפשר לאשר את שני הסוגים, אחד מהם או אף אחד. ההחלטה נשמרת בעוגיית ke_consent יחד עם גרסת הנוסח שאושרה, ואם נוסח הבאנר ישתנה מהותית, תישאלו שוב ולא נסתמך על הסכמה שניתנה לנוסח אחר.',
        },
        {
          type: 'note',
          text: 'דפדפן ששולח אות "אל תעקוב" (Do Not Track) או Global Privacy Control מטופל כסירוב לשני הסוגים, גם אם לחצתם אישור בבאנר.',
        },
      ],
    },
    {
      id: 'cookie-list',
      title: 'העוגיות שהאתר מציב',
      blocks: [
        {
          type: 'paragraph',
          text: 'הטבלה מונה כל עוגייה שהאתר מציב בדפדפן שלכם. משך החיים הוא הזמן המרבי; עוגייה של עגלה או של ביקור מתחדשת בכל פעולה, ועוגייה של הרשמה נמחקת מיד עם סיומה.',
        },
        {
          type: 'table',
          caption: 'עוגיות של האתר',
          head: ['שם', 'סוג', 'משך חיים', 'למה היא משמשת'],
          rows: cookieRows,
        },
      ],
    },
    {
      id: 'storage-list',
      title: 'פריטי אחסון בדפדפן',
      blocks: [
        {
          type: 'paragraph',
          text: 'פריטים אלה נשמרים במחסן המקומי של הדפדפן ולא נשלחים לשרת מעצמם. אף אחד מהם אינו מכיל פרטי תשלום, ואף אחד מהם אינו קובע מחיר: כל מחיר מחושב מחדש בשרת בכל פעם.',
        },
        {
          type: 'table',
          caption: 'פריטי אחסון בדפדפן',
          head: ['מפתח', 'מחסן', 'סוג', 'למה הוא משמש'],
          rows: storageRows,
        },
      ],
    },
    {
      id: 'third-party',
      title: 'כלים של צד שלישי',
      blocks: [
        {
          type: 'paragraph',
          text: 'הכלים הבאים מציבים עוגיות משלהם, בהתאם למדיניות הפרטיות של כל אחד מהם. כלי מדידה ופרסום אינם נטענים לפני הסכמה לסוג המתאים, ולכן גם העוגיות שלהם אינן קיימות בדפדפן לפני כן. עמוד התשלום של חברת הסליקה נדרש לביצוע החיוב והוא בגדר הכרחי.',
        },
        {
          type: 'table',
          caption: 'כלים של צד שלישי',
          head: ['כלי', 'סוג', 'עוגיות אופייניות', 'למה הוא משמש'],
          rows: thirdPartyRows,
        },
        {
          type: 'paragraph',
          text: 'רשימת כל הספקים שמקבלים מידע, המידע שנמסר לכל אחד מהם ומצב הסכמי עיבוד המידע מולם מופיעה בסעיף "למי המידע נמסר" במדיניות הפרטיות.',
        },
      ],
    },
    {
      id: 'manage',
      title: 'איך משנים את ההחלטה',
      blocks: [
        {
          type: 'ordered',
          items: [
            'בבאנר ההסכמה, בביקור הראשון, או בכל עת לאחר מכן בעמוד "פרטיות ונתונים" באזור האישי, שם אפשר לאשר או לבטל כל סוג בנפרד. ביטול הסכמה מפסיק את הטעינה של הכלים מאותו רגע; מידע שנאסף לפני כן מטופל לפי מדיניות הפרטיות.',
            'בהגדרות הדפדפן: כל דפדפן מאפשר לצפות בעוגיות ובאחסון של אתר, למחוק אותם ולחסום אותם. הוראות מפורטות נמצאות בעזרה של Chrome, Safari, Firefox ו-Edge. מחיקת העוגיות ההכרחיות תרוקן את העגלה ותנתק אתכם מהחשבון.',
            'הקלטת מסך לצורך טיפול בתקלה כבויה כברירת מחדל, ומופעלת רק מתוך האזור האישי ורק אם אישרתם גם את סוג "מדידת שימוש באתר". אפשר לכבות אותה באותו מקום.',
          ],
        },
      ],
    },
    {
      id: 'changes',
      title: 'שינויים במדיניות',
      blocks: [
        {
          type: 'paragraph',
          text: 'כאשר נוסיף עוגייה, נסיר אחת או נשנה את מטרתה, נעדכן את הטבלאות ואת מספר הגרסה ותאריך התוקף בראש העמוד, והשינוי יפורט בהיסטוריית הגרסאות בתחתיתו. שינוי מהותי בסוגי ההסכמה יוביל לכך שתישאלו שוב בבאנר, ולא נסתמך על הסכמה שניתנה לנוסח קודם.',
        },
      ],
    },
  ],
}
