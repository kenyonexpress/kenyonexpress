/**
 * THE PROCESSOR REGISTER: every third party that handles personal data for
 * this site, with the contract that lets it.
 *
 * Amendment 13 of the Protection of Privacy Law (s. 17 on outsourcing, and
 * the 2017 Security Regulations, reg. 15) and GDPR Art. 28 both require a
 * written agreement with every processor, and both require the controller to
 * be able to say who those processors are. This file is that list in a form
 * two consumers read:
 *
 *   - the privacy policy (`app/(legal)/_content/privacy.ts`) renders its
 *     "who the data is shared with" table FROM this register, so a vendor
 *     added to the code and not to this file is a test failure, not a
 *     policy that quietly lies;
 *   - `processors.test.ts` checks every vendor the code actually calls
 *     (by the env var that enables it) has a row here.
 *
 * `agreement` records the DPA by URL and HOW it binds. Three shapes exist in
 * practice and they are not interchangeable:
 *   'terms'      the DPA is incorporated into the vendor's terms of service
 *                and binds on account acceptance; nothing to sign.
 *   'signature'  the vendor counter-signs on request (dashboard or email);
 *                `status: 'pending'` until Ofir has done that, and the
 *                policy's transfer section stays honest about it.
 *   'contract'   a bilateral agreement (the Cardcom merchant contract), on
 *                paper, outside any URL.
 *
 * Status is a fact about the account, not about the code, so it is a string
 * here and a line in docs/ARCHITECTURE-LEGAL-COMPLIANCE.md §7, both updated
 * by hand when a signature lands. Nothing in the build can observe it.
 */

export type ProcessorRole = 'processor' | 'controller' | 'joint'

export type AgreementBinding = 'terms' | 'signature' | 'contract'

export type AgreementStatus = 'in-force' | 'pending'

export interface Processor {
  /** Stable key, used by the tests and the docs. */
  id: string
  /** As the policy names it, in Hebrew, with the brand in Latin where it is a brand. */
  name: string
  /** The `process.env` key whose presence means the code can call this vendor. */
  enabledBy: string | null
  role: ProcessorRole
  /** Policy column 2: what personal data reaches it. */
  dataShared: string
  /** Policy column 3: why. */
  purpose: string
  /** Where its servers are, for the transfer section. */
  region: 'IL' | 'EU' | 'US' | 'EU/US'
  /** Only behind the consent banner: which door. Null for necessary processors. */
  consentCategory: 'analytics' | 'marketing' | null
  agreement: {
    url: string | null
    binding: AgreementBinding
    status: AgreementStatus
    /** One line on how it binds and what, if anything, is still to do. */
    note: string
  }
}

export const PROCESSORS: ReadonlyArray<Processor> = [
  {
    id: 'vercel',
    name: 'ספק אירוח האתר (Vercel)',
    enabledBy: 'VERCEL',
    role: 'processor',
    dataShared: 'נתוני בקשה טכניים, לרבות כתובת IP, ורישומי שגיאות של השרת',
    purpose: 'הגשת האתר, ביצועים ואבטחה',
    region: 'EU/US',
    consentCategory: null,
    agreement: {
      url: 'https://vercel.com/legal/dpa',
      binding: 'terms',
      status: 'in-force',
      note: 'ה-DPA מצורף לתנאי השירות ומחייב עם קבלתם; כולל SCC להעברה מחוץ לאיחוד. אין מה לחתום.',
    },
  },
  {
    id: 'supabase',
    name: 'ספק אחסון וניהול נתונים (Supabase)',
    enabledBy: 'NEXT_PUBLIC_SUPABASE_URL',
    role: 'processor',
    dataShared: 'מסד הנתונים של החשבונות, ההזמנות והקופונים, ועוגיות ההתחברות',
    purpose: 'אחסון מאובטח והפעלת האתר',
    region: 'EU',
    consentCategory: null,
    agreement: {
      url: 'https://supabase.com/legal/dpa',
      binding: 'signature',
      status: 'pending',
      note: 'ה-DPA מחייב עם קבלת התנאים (סעיף 12.2 שלו), והעותק החתום מופק מ-Dashboard > Legal Documents (PandaDoc). ממתין לחתימת אופיר.',
    },
  },
  {
    id: 'cardcom',
    name: 'חברת הסליקה (Cardcom)',
    enabledBy: 'CARDCOM_TERMINAL_NUMBER',
    role: 'processor',
    dataShared: 'פרטי התשלום שמסרתם במסך הסליקה וסכום העסקה',
    purpose: 'ביצוע החיוב, זיכויים והחזרים',
    region: 'IL',
    consentCategory: null,
    agreement: {
      url: null,
      binding: 'contract',
      status: 'in-force',
      note: 'הסכם סליקה ישראלי; קארדקום היא גם בעלת מאגר מורשית לפי חוק הגנת הפרטיות, ופרטי הכרטיס לעולם אינם מגיעים לאתר.',
    },
  },
  {
    id: 'resend',
    name: 'ספק דיוור (Resend)',
    enabledBy: 'RESEND_API_KEY',
    role: 'processor',
    dataShared: 'כתובת הדואר האלקטרוני ותוכן ההודעה',
    purpose: 'שליחת אישורי הזמנה, קופונים והודעות שירות',
    region: 'US',
    consentCategory: null,
    agreement: {
      url: 'https://resend.com/legal/dpa',
      binding: 'terms',
      status: 'in-force',
      note: 'ה-DPA חתום מראש על ידי Resend ונכנס לתוקף עם פתיחת החשבון; מאושר ב-EU-US Data Privacy Framework.',
    },
  },
  {
    id: 'twilio',
    name: 'ספק הודעות SMS ו-WhatsApp (Twilio)',
    enabledBy: 'TWILIO_ACCOUNT_SID',
    role: 'processor',
    dataShared: 'מספר הטלפון ותוכן ההודעה',
    purpose: 'קוד אימות בכניסה, עדכוני הזמנה ומשלוח, והודעות שאישרתם לקבל',
    region: 'US',
    consentCategory: null,
    agreement: {
      url: 'https://www.twilio.com/en-us/legal/data-protection-addendum',
      binding: 'terms',
      status: 'in-force',
      note: 'ה-DPA מצורף לתנאי השירות של Twilio ומחייב עם קבלתם.',
    },
  },
  {
    id: 'sentry',
    name: 'ניטור שגיאות (Sentry)',
    enabledBy: 'SENTRY_DSN',
    role: 'processor',
    dataShared: 'רישומי שגיאות טכניות, לאחר הסרת שם, מייל, טלפון ומספרי זיהוי',
    purpose: 'איתור ותיקון תקלות באתר',
    region: 'US',
    consentCategory: null,
    agreement: {
      url: 'https://sentry.io/legal/dpa/',
      binding: 'terms',
      status: 'in-force',
      note: 'ה-DPA מתקבל אלקטרונית עם תנאי השירות; הסקרבר ב-lib/observability/scrub.ts הוא מה שמגביל את המידע שמגיע לשם.',
    },
  },
  {
    id: 'posthog',
    name: 'מדידת שימוש (PostHog)',
    enabledBy: 'NEXT_PUBLIC_POSTHOG_KEY',
    role: 'processor',
    dataShared: 'אירועי שימוש באתר בהסכמה (עמודים, עגלה, רכישות) תחת מזהה אנונימי',
    purpose: 'ניתוח משפכי רכישה ושיפור האתר',
    region: 'US',
    consentCategory: 'analytics',
    agreement: {
      url: 'https://posthog.com/dpa',
      binding: 'signature',
      status: 'pending',
      note: 'PostHog מפיקה DPA לבקשה דרך הטופס בכתובת זו ומחזירה לחתימה ב-PandaDoc. ממתין לבקשה של אופיר.',
    },
  },
  {
    id: 'google',
    name: 'Google (התחברות ו-Google Analytics)',
    enabledBy: 'NEXT_PUBLIC_GA4_MEASUREMENT_ID',
    role: 'joint',
    dataShared: 'זיהוי לצורך התחברות, ובכפוף להסכמה גם נתוני שימוש באתר, בלי שם, מייל או טלפון',
    purpose: 'התחברות לחשבון ומדידת פרסום',
    region: 'EU/US',
    consentCategory: 'marketing',
    agreement: {
      url: 'https://business.safety.google/adsprocessorterms/',
      binding: 'terms',
      status: 'in-force',
      note: 'תנאי עיבוד הנתונים של Google Ads/Analytics מתקבלים בהגדרות הנכס ב-GA4; Google היא בעלת שליטה משותפת על נתוני הפרסום.',
    },
  },
  {
    id: 'meta',
    name: 'Meta (Meta Pixel)',
    enabledBy: 'NEXT_PUBLIC_META_PIXEL_ID',
    role: 'joint',
    dataShared: 'בכפוף להסכמה בלבד: אירועי צפייה ורכישה, בלי שם, מייל או טלפון',
    purpose: 'מדידת קמפיינים פרסומיים',
    region: 'EU/US',
    consentCategory: 'marketing',
    agreement: {
      url: 'https://www.facebook.com/legal/terms/businesstools',
      binding: 'terms',
      status: 'in-force',
      note: 'תנאי Business Tools של Meta מתקבלים עם יצירת הפיקסל; Meta היא בעלת שליטה משותפת על אירועי הפיקסל.',
    },
  },
]

export function processorById(id: string): Processor | undefined {
  return PROCESSORS.find((p) => p.id === id)
}

/** The rows that still need a human signature, for the docs and the STATE entry. */
export function pendingAgreements(): ReadonlyArray<Processor> {
  return PROCESSORS.filter((p) => p.agreement.status === 'pending')
}
