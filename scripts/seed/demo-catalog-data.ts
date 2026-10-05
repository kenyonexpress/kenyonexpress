/**
 * The demo catalogue (queue item W04): 12 suppliers, 60 coupons and 12
 * physical products, spread over the eleven live categories.
 *
 * MONEY IS AGOROT HERE. Every price in this file is an integer number of
 * agorot. The database's live money columns are shekel numerics
 * (`kenyon_price`, `price_ils`, `full_price`, `coupon_price_ils`; the
 * `*_agorot` columns beside them are generated, see docs/SEED.md), so the
 * conversion happens exactly once, at the write edge in
 * `scripts/seed-demo-catalog.ts`, through `agorotToIls` from
 * `src/lib/commerce/money.ts`. Nothing in this module does arithmetic on money.
 *
 * SLUGS ARE `demo-` PREFIXED, AND THAT IS THE REMOVAL CONTRACT. The
 * `scripts/remove-demo-catalog.ts` script deletes products by that prefix and
 * nothing else, so a real product must never be given one. The catalogue
 * safety rules (`src/lib/catalogue/safety-rules.ts`) flag `demo` as a template
 * marker on purpose: these rows are for a disposable database and the gate is
 * what keeps them out of production's snapshot.
 *
 * IDS ARE A FIXED NAMESPACE, `de30de30-0000-4000-8000-…`, distinct from the
 * `5eed…` catalogue seed and the `d3e3…` SQL-only demo profile, so the three
 * can coexist, be counted apart and be removed apart.
 *
 * CATEGORIES ARE REFERENCED BY SLUG against the rows production already has
 * (`supabase/migrations/018_seed_categories.sql`, re-read live 2026-10-05) and
 * never invented. `hot-deals`, `under-99` and `new` are collections with a
 * rule (`src/lib/category-page.ts`), and the rule is ADDITIVE to a hand
 * assignment, so a row placed in one of them by `category_id` shows there
 * regardless of the rule. The `under-99` rows are also priced under 99 so the
 * rule and the assignment agree.
 */

export const DEMO_SLUG_PREFIX = 'demo-'

export const DEMO_ID_PREFIX = 'de30de30-0000-4000-8000-'

/** Fixed, recognisable ids. `1` for suppliers, `2` for products, `3` for assets. */
export function demoCatalogId(kind: 'supplier' | 'product', index: number): string {
  const prefix = kind === 'supplier' ? '1' : '2'
  return `${DEMO_ID_PREFIX}${prefix}${String(index).padStart(11, '0')}`
}

export function isDemoCatalogId(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX)
}

export function isDemoSlug(slug: string): boolean {
  return slug.startsWith(DEMO_SLUG_PREFIX)
}

/** The eleven live categories the brief names, by canonical slug. */
export const DEMO_CATEGORY_SLUGS = [
  'hot-deals',
  'under-99',
  'new',
  'restaurants-cafes',
  'beauty-health',
  'phones-computers',
  'baby-kids',
  'vacation',
  'pets',
  'professionals',
  'courses',
] as const

export type DemoCategorySlug = (typeof DEMO_CATEGORY_SLUGS)[number]

/** Agorot bound for the `under-99` collection: ₪99.00. */
export const UNDER_99_AGOROT = 9900

export type DemoSupplier = {
  id: string
  name: string
  contactName: string
  contactEmail: string
  contactPhone: string
  whatsapp: string
  address: string
  city: string
  website: string
  businessId: string
  /** Object key under which the generated logo is stored; the URL is decided at upload. */
  logoKey: string
}

type SupplierSpec = [
  name: string,
  city: string,
  address: string,
  contactName: string,
  phone: string,
  businessId: string,
]

const SUPPLIER_SPECS: readonly SupplierSpec[] = [
  [
    'מסעדת הדייגים של יפו',
    'תל אביב-יפו',
    'רציף העלייה השנייה 12',
    'יוסי חדד',
    '03-6821144',
    '515234671',
  ],
  ['קפה שחרית', 'רמת גן', 'ביאליק 48', 'מיכל ברק', '03-5740233', '515778302'],
  ['ספא נווה מדבר', 'הרצליה', 'רמת ים 110', 'נועה אלון', '09-9560711', '514902188'],
  [
    'קליניקת אור לייזר ואסתטיקה',
    'פתח תקווה',
    'ז׳בוטינסקי 92',
    'ד״ר רונית שפירא',
    '03-9211870',
    '515660429',
  ],
  ['צימרי ערפילי הגליל', 'ראש פינה', 'דרך הגליל 7', 'אבי לוי', '04-6935522', '558123744'],
  ['מלון חוף הזהב אילת', 'אילת', 'שדרות התמרים 28', 'קרן מזרחי', '08-6366000', '512345660'],
  ['אלקטרו-פיקס טכנאים לבית', 'חולון', 'סוקולוב 61', 'דני כהן', '03-5030117', '558994201'],
  [
    'אקדמיית אקספרס ללימודי דיגיטל',
    'תל אביב-יפו',
    'הארבעה 21',
    'תמר גולן',
    '03-7441520',
    '516002937',
  ],
  ['גן המשחקים של נועה', 'ראשון לציון', 'רוטשילד 77', 'נועה פרידמן', '03-9661208', '558400115'],
  ['פטשופ זנב מכשכש', 'באר שבע', 'רגר 112', 'עומר ביטון', '08-6279444', '515311876'],
  ['סלולר סנטר נתניה', 'נתניה', 'הרצל 36', 'אלי אוחיון', '09-8622290', '514477018'],
  ['בייבי-לנד ציוד לתינוקות', 'חיפה', 'הנמל 40', 'שירה נחום', '04-8521133', '515903342'],
]

function supplierKey(index: number): string {
  return `demo-supplier-${String(index).padStart(2, '0')}`
}

export const DEMO_SUPPLIERS: readonly DemoSupplier[] = SUPPLIER_SPECS.map(
  ([name, city, address, contactName, phone, businessId], i) => {
    const index = i + 1
    const key = supplierKey(index)
    return {
      id: demoCatalogId('supplier', index),
      name,
      contactName,
      contactEmail: `${key}@example.test`,
      contactPhone: phone,
      whatsapp: `05${(index % 9) + 1}-${String(2000000 + index * 37037).slice(0, 7)}`,
      address,
      city,
      website: `https://example.test/${key}`,
      businessId,
      logoKey: `demo-catalog/suppliers/${key}`,
    }
  },
)

export type DemoProduct = {
  id: string
  slug: string
  type: 'coupon' | 'physical'
  nameHe: string
  /** Exactly two sentences, each ending in a full stop. */
  descriptionHe: string
  shortDescriptionHe: string
  /** What the shopper pays on the site, in agorot. */
  priceAgorot: number
  /** The crossed-out reference price, in agorot. Always above `priceAgorot`. */
  originalPriceAgorot: number
  categorySlug: DemoCategorySlug
  supplierId: string
  /** Coupon only: days from today until the OFFER itself lapses. */
  offerValidDays: number | null
  /** Coupon only: days an issued voucher stays valid after purchase. */
  couponExpiryDays: number | null
  /** Physical only. */
  stockQuantity: number | null
  platformPercent: number
  /** Object key prefix for the generated image; the URL is decided at upload. */
  imageKey: string
  featured: boolean
}

/**
 * [slug tail, name, sentence 1, sentence 2, price ₪, original ₪, category,
 *  supplier index (1-based), offer validity days]
 *
 * Shekel values in this table are WHOLE SHEKELS for readability and are turned
 * into agorot below with an integer multiply, never a float. A price with
 * agorot in it would be written here as agorot directly.
 */
type CouponSpec = [
  tail: string,
  name: string,
  s1: string,
  s2: string,
  priceIls: number,
  originalIls: number,
  category: DemoCategorySlug,
  supplier: number,
  validDays: number,
]

const COUPON_SPECS: readonly CouponSpec[] = [
  // restaurants-cafes (10)
  [
    'fish-dinner-for-two-jaffa',
    'ארוחת דגים זוגית בנמל יפו',
    'ארוחה זוגית הכוללת שני מנות דג טרי מהמפרץ, שתי מנות ראשונות ולחם הבית.',
    'השובר תקף בימים א׳ עד ה׳ בתיאום מראש מול המסעדה.',
    189,
    320,
    'restaurants-cafes',
    1,
    120,
  ],
  [
    'seafood-platter-family',
    'מגש פירות ים משפחתי לארבעה',
    'מגש עשיר לארבעה סועדים עם שרימפס, קלמרי ומולים בחמאת שום.',
    'כולל ארבע שתיות קלות ולחם מחמצת חם.',
    299,
    480,
    'restaurants-cafes',
    1,
    90,
  ],
  [
    'business-lunch-fish',
    'עסקית דג צהריים ליחיד',
    'מנת דג היום עם תוספת לבחירה ושתייה קלה.',
    'מוגש בין השעות 12:00 ל-16:00 בכל ימות השבוע.',
    59,
    98,
    'restaurants-cafes',
    1,
    90,
  ],
  [
    'israeli-breakfast-for-two',
    'ארוחת בוקר ישראלית זוגית',
    'שתי ביצים לבחירה, סלט קצוץ, מבחר גבינות, סלטונים ולחם מחמצת.',
    'כולל שני משקאות חמים ומיץ תפוזים סחוט.',
    79,
    128,
    'restaurants-cafes',
    2,
    120,
  ],
  [
    'coffee-and-pastry-pass-10',
    'כרטיסייה של עשר כוסות קפה ומאפה',
    'עשר כוסות קפה גדולות לבחירה, כל אחת עם מאפה טרי מהבוקר.',
    'הכרטיסייה אישית ואינה מוגבלת בזמן בשעות הפעילות.',
    149,
    250,
    'restaurants-cafes',
    2,
    180,
  ],
  [
    'brunch-weekend-couple',
    'בראנץ׳ סוף שבוע לזוג',
    'שקשוקה או בנדיקט לבחירה, סלט בריאות ומגש מאפים לשולחן.',
    'תקף בימי שישי ושבת עד השעה 14:00.',
    99,
    160,
    'restaurants-cafes',
    2,
    90,
  ],
  [
    'kids-meal-and-dessert',
    'ארוחת ילדים עם קינוח',
    'מנה עיקרית לילד לבחירה, שתייה וגלידה או וופל בלגי.',
    'מתאימה לילדים עד גיל 12 בליווי מבוגר.',
    29,
    48,
    'restaurants-cafes',
    2,
    90,
  ],
  [
    'chef-tasting-menu',
    'תפריט טעימות של השף לזוג',
    'שבע מנות קטנות המשתנות לפי הדיג היומי והשוק.',
    'כולל זוג כוסות יין לבן מהגולן.',
    349,
    560,
    'restaurants-cafes',
    1,
    60,
  ],
  [
    'vegan-dinner-for-two',
    'ארוחה טבעונית זוגית',
    'שתי מנות עיקריות טבעוניות, שתי מנות פתיחה וקינוח משותף.',
    'התפריט מתחלף עונתית ומבוסס על ירקות מהשוק.',
    139,
    230,
    'restaurants-cafes',
    2,
    120,
  ],
  [
    'dessert-platter-cafe',
    'מגש קינוחים לשולחן',
    'ארבעה קינוחים מתחלפים מהקונדיטוריה של בית הקפה.',
    'מתאים לשניים עד ארבעה סועדים, כולל קנקן תה.',
    69,
    110,
    'restaurants-cafes',
    2,
    90,
  ],

  // beauty-health (10)
  [
    'swedish-massage-60',
    'עיסוי שוודי 60 דקות',
    'עיסוי שוודי מלא בחדר טיפולים פרטי עם שמנים ארומטיים.',
    'כולל כניסה לחדר המנוחה ושתייה חמה אחרי הטיפול.',
    179,
    320,
    'beauty-health',
    3,
    120,
  ],
  [
    'couples-spa-day',
    'יום ספא זוגי עם עיסוי',
    'כניסה זוגית למתחם הספא, עיסוי 50 דקות לכל אחד וארוחת בוקר קלה.',
    'הכניסה כוללת סאונה יבשה, ג׳קוזי ובריכה מחוממת.',
    449,
    790,
    'beauty-health',
    3,
    90,
  ],
  [
    'hot-stone-massage',
    'עיסוי אבנים חמות 75 דקות',
    'אבני בזלת מחוממות משולבות בעיסוי שוודי להרפיית שרירים עמוקה.',
    'מומלץ להגיע רבע שעה לפני המועד שנקבע.',
    219,
    380,
    'beauty-health',
    3,
    120,
  ],
  [
    'facial-treatment-classic',
    'טיפול פנים קלאסי',
    'ניקוי עמוק, פילינג עדין, מסכה מותאמת לסוג העור וסרום לחות.',
    'הטיפול נמשך כשעה ומתאים לכל סוגי העור.',
    169,
    290,
    'beauty-health',
    4,
    120,
  ],
  [
    'laser-hair-removal-trial',
    'טיפול ניסיון בהסרת שיער בלייזר',
    'טיפול לייזר באזור אחד לבחירה במכשיר דיודה מקורר.',
    'כולל פגישת ייעוץ ובדיקת התאמה לפני הטיפול.',
    99,
    250,
    'beauty-health',
    4,
    90,
  ],
  [
    'laser-six-pack-underarms',
    'שישה טיפולי לייזר לבתי השחי',
    'סדרה מלאה של שישה טיפולים במרווחי זמן של כחודש.',
    'התוקף מחושב מתאריך הטיפול הראשון ולא מיום הרכישה.',
    490,
    900,
    'beauty-health',
    4,
    180,
  ],
  [
    'deep-tissue-massage',
    'עיסוי רקמות עמוק 50 דקות',
    'עיסוי ממוקד לשחרור מתחים בגב, בצוואר ובכתפיים.',
    'מתאים לספורטאים ולמי שיושב שעות ארוכות מול מסך.',
    159,
    280,
    'beauty-health',
    3,
    120,
  ],
  [
    'reflexology-session',
    'טיפול רפלקסולוגיה 45 דקות',
    'לחיצות מדויקות בכפות הרגליים לפי מפת האזורים.',
    'הטיפול מתבצע על ידי מטפלת מוסמכת בחדר שקט.',
    129,
    220,
    'beauty-health',
    3,
    90,
  ],
  [
    'skin-rejuvenation-ipl',
    'טיפול חידוש עור בפוטותרפיה',
    'טיפול להבהרת כתמי שמש ואיחוד גוון העור בטכנולוגיית IPL.',
    'הטיפול אינו מתאים לעור שזוף טרי.',
    349,
    600,
    'beauty-health',
    4,
    120,
  ],
  [
    'manicure-pedicure-combo',
    'מניקור ופדיקור משולב',
    'טיפול ידיים ורגליים מלא כולל עיצוב, הסרת עור קשה ולק ג׳ל.',
    'אורך הטיפול כשעה וחצי בתיאום מראש.',
    119,
    190,
    'beauty-health',
    4,
    90,
  ],

  // vacation (8)
  [
    'galilee-cabin-midweek',
    'לילה בצימר בגליל באמצע השבוע',
    'לילה זוגי בבקתת עץ עם ג׳קוזי פרטי ונוף להרי הגליל.',
    'כולל ארוחת בוקר כפרית המוגשת לצימר.',
    590,
    950,
    'vacation',
    5,
    180,
  ],
  [
    'galilee-cabin-weekend',
    'סוף שבוע זוגי בצימר בגליל',
    'שני לילות בצימר מאובזר עם בריכה פרטית מחוממת.',
    'כולל סלסלת פירות ויין בהגעה וארוחות בוקר.',
    1390,
    2200,
    'vacation',
    5,
    180,
  ],
  [
    'galilee-family-cabin',
    'צימר משפחתי לזוג ושני ילדים',
    'לילה בסוויטה משפחתית עם חדר ילדים נפרד ופינת משחקים.',
    'הגישה לבריכה המשותפת כלולה במחיר.',
    790,
    1250,
    'vacation',
    5,
    120,
  ],
  [
    'eilat-hotel-night-couple',
    'לילה זוגי במלון על החוף באילת',
    'חדר זוגי עם מרפסת לים וארוחת בוקר בופה.',
    'כולל כניסה חופשית לבריכה ולחדר הכושר.',
    690,
    1100,
    'vacation',
    6,
    150,
  ],
  [
    'eilat-hotel-two-nights-hb',
    'שני לילות באילת בחצי פנסיון',
    'שני לילות בחדר זוגי עם ארוחות בוקר וערב במסעדת המלון.',
    'ילד אחד עד גיל 6 מתארח חינם בחדר ההורים.',
    1590,
    2600,
    'vacation',
    6,
    150,
  ],
  [
    'eilat-day-pass-pool',
    'יום כיף בבריכת המלון באילת',
    'כניסה ליום שלם לבריכה, למגלשות ולמיטות השיזוף.',
    'כולל ארוחת צהריים קלה בבר הבריכה.',
    119,
    200,
    'vacation',
    6,
    90,
  ],
  [
    'galilee-jacuzzi-hour',
    'שעת ג׳קוזי פרטי בצימר',
    'שעה בג׳קוזי חיצוני פרטי בחצר הצימר עם נוף לכנרת.',
    'מתאים לזוג, כולל מגבות ושתייה קרה.',
    149,
    240,
    'vacation',
    5,
    90,
  ],
  [
    'eilat-suite-anniversary',
    'סוויטת יום נישואין באילת',
    'לילה בסוויטה עם ג׳קוזי, עיצוב רומנטי ובקבוק יין מבעבע.',
    'כולל צ׳ק-אאוט מאוחר עד השעה 14:00.',
    990,
    1600,
    'vacation',
    6,
    120,
  ],

  // professionals (6)
  [
    'ac-service-visit',
    'ביקור טכנאי מזגנים כולל ניקוי',
    'ביקור טכנאי לבדיקת מזגן אחד, ניקוי מסננים ובדיקת גז.',
    'תיקון או חלקים נוספים יתומחרו בנפרד במקום.',
    149,
    260,
    'professionals',
    7,
    120,
  ],
  [
    'electrician-hour',
    'שעת עבודה של חשמלאי מוסמך',
    'שעת עבודה לתיקוני חשמל ביתיים כולל הגעה.',
    'חומרים וחלקי חילוף אינם כלולים במחיר.',
    199,
    320,
    'professionals',
    7,
    120,
  ],
  [
    'plumber-leak-check',
    'בדיקת נזילות ואיתור רטיבות',
    'איתור מקור רטיבות במצלמה תרמית ובדיקת לחץ בצנרת.',
    'הדוח מועבר במייל יחד עם המלצות לתיקון.',
    249,
    420,
    'professionals',
    7,
    90,
  ],
  [
    'handyman-two-hours',
    'שעתיים הנדימן לתליות והרכבות',
    'שעתיים עבודה לתליית מדפים, טלוויזיות והרכבת רהיטים.',
    'כולל כלים ובורגי עיגון סטנדרטיים.',
    229,
    380,
    'professionals',
    7,
    120,
  ],
  [
    'water-heater-service',
    'טיפול שנתי לדוד שמש',
    'ניקוי אבנית, בדיקת גוף חימום והחלפת אנודה במידת הצורך.',
    'השירות ניתן בגוש דן והשרון בלבד.',
    189,
    310,
    'professionals',
    7,
    150,
  ],
  [
    'home-network-setup',
    'התקנת רשת ביתית ונתב',
    'חיבור והגדרת נתב, נקודות גישה וכיסוי אלחוטי לכל הבית.',
    'כולל בדיקת מהירות בסיום בכל חדר.',
    279,
    450,
    'professionals',
    7,
    120,
  ],

  // courses (4)
  [
    'digital-marketing-intro',
    'סדנת היכרות עם שיווק דיגיטלי',
    'מפגש של ארבע שעות על קמפיינים ממומנים, תוכן ומדידה.',
    'מתאים לבעלי עסקים קטנים ללא ידע קודם.',
    149,
    290,
    'courses',
    8,
    180,
  ],
  [
    'excel-for-business-course',
    'קורס אקסל לעסקים בשישה מפגשים',
    'שישה מפגשים ערב על נוסחאות, טבלאות ציר ודוחות.',
    'כולל חומרי תרגול והקלטות של השיעורים.',
    590,
    980,
    'courses',
    8,
    180,
  ],
  [
    'smartphone-photography-workshop',
    'סדנת צילום בסמארטפון',
    'סדנה מעשית בת שלוש שעות על קומפוזיציה, תאורה ועריכה.',
    'מסתיימת בצילום מודרך ברחובות העיר.',
    99,
    180,
    'courses',
    8,
    120,
  ],
  [
    'ai-tools-for-work',
    'סדנת כלי בינה מלאכותית לעבודה',
    'מפגש של שלוש שעות על כתיבה, סיכום ואוטומציה בעזרת כלי AI.',
    'מתקיים בקבוצות קטנות של עד שנים עשר משתתפים.',
    179,
    320,
    'courses',
    8,
    120,
  ],

  // baby-kids coupons (4)
  [
    'kids-playground-entry-5',
    'כרטיסייה של חמש כניסות למתחם המשחקים',
    'חמש כניסות למתחם משחקים מקורה לילדים עד גיל 10.',
    'הכניסה כוללת גרביים מונעות החלקה ושעה וחצי משחק.',
    149,
    250,
    'baby-kids',
    9,
    180,
  ],
  [
    'birthday-party-package',
    'חבילת יום הולדת ל-15 ילדים',
    'שעתיים במתחם עם מדריכה, פיצות, שתייה ועוגת יום הולדת.',
    'ניתן להוסיף ילדים בתשלום נוסף במקום.',
    990,
    1500,
    'baby-kids',
    9,
    180,
  ],
  [
    'baby-massage-workshop',
    'סדנת עיסוי תינוקות להורים',
    'שני מפגשים להורים לתינוקות עד גיל שנה בהדרכת מטפלת מוסמכת.',
    'כולל שמן עיסוי טבעי לקחת הביתה.',
    129,
    220,
    'baby-kids',
    9,
    120,
  ],
  [
    'kids-cooking-class',
    'שיעור בישול לילדים',
    'שיעור של שעה וחצי לילדים בגילאי 6 עד 12 בהכנת פסטה ועוגיות.',
    'הילדים לוקחים הביתה את מה שהכינו.',
    79,
    130,
    'baby-kids',
    9,
    90,
  ],

  // pets coupons (4)
  [
    'dog-grooming-full',
    'טיפוח כלב מלא במספרה',
    'רחצה, ייבוש, תספורת וגזירת ציפורניים לכלב עד 20 ק״ג.',
    'כולל ניקוי אוזניים ובדיקת עור בסיסית.',
    149,
    240,
    'pets',
    10,
    120,
  ],
  [
    'vet-checkup-and-vaccine',
    'ביקור וטרינר וחיסון שנתי',
    'ביקורת כללית אצל וטרינר הבית וחיסון משושה לכלב או מרובע לחתול.',
    'התור נקבע מראש בטלפון או בוואטסאפ.',
    179,
    280,
    'pets',
    10,
    150,
  ],
  [
    'cat-hotel-three-nights',
    'שלושה לילות בפנסיון לחתולים',
    'אירוח בחדר פרטי עם עץ טיפוס, האכלה פעמיים ביום וניקיון יומי.',
    'נדרש פנקס חיסונים בתוקף בקבלה.',
    219,
    360,
    'pets',
    10,
    180,
  ],
  [
    'puppy-training-class',
    'קורס אילוף גורים בחמישה מפגשים',
    'חמישה מפגשים קבוצתיים לגורים עד גיל חצי שנה.',
    'המפגשים נערכים בגינת האילוף של החנות.',
    390,
    650,
    'pets',
    10,
    180,
  ],

  // phones-computers coupons (3)
  [
    'screen-replacement-voucher',
    'שובר להחלפת מסך לסמארטפון',
    'החלפת מסך שבור במעבדה עם אחריות של שישה חודשים על העבודה.',
    'מחיר החלק נקבע לפי הדגם ומוצג לפני התיקון.',
    99,
    180,
    'phones-computers',
    11,
    120,
  ],
  [
    'laptop-tuneup',
    'שדרוג וניקוי מחשב נייד',
    'ניקוי פנימי מאבק, החלפת משחה תרמית ואופטימיזציה של מערכת ההפעלה.',
    'כולל גיבוי קבצים לפני העבודה.',
    149,
    260,
    'phones-computers',
    11,
    120,
  ],
  [
    'data-recovery-check',
    'אבחון שחזור מידע מדיסק קשיח',
    'בדיקת תקינות וניסיון שחזור ראשוני לדיסק קשיח או כונן SSD.',
    'אם השחזור מצליח, עלות ההמשך מקוזזת מהשובר.',
    129,
    220,
    'phones-computers',
    11,
    90,
  ],

  // hot-deals coupons (4), hand-assigned to the collection and featured
  [
    'hot-deal-sushi-for-two',
    'מגש סושי זוגי 48 יחידות',
    'מגש משולב של 48 יחידות ניגירי, מאקי ואינסייד-אאוט.',
    'השובר תקף לאיסוף עצמי בלבד.',
    119,
    220,
    'hot-deals',
    1,
    60,
  ],
  [
    'hot-deal-spa-sunrise',
    'כניסה לספא בשעות הבוקר',
    'כניסה למתחם הספא בין 8:00 ל-11:00 כולל ארוחת בוקר קלה.',
    'בימי חול בלבד ובמספר מקומות מוגבל.',
    89,
    190,
    'hot-deals',
    3,
    60,
  ],
  [
    'hot-deal-eilat-last-minute',
    'לילה באילת ברגע האחרון',
    'לילה זוגי במלון על החוף במימוש עד שלושים יום מהרכישה.',
    'ההזמנה כפופה לזמינות ואינה תקפה בחגים.',
    490,
    950,
    'hot-deals',
    6,
    30,
  ],
  [
    'hot-deal-ac-cleaning',
    'ניקוי מזגן יסודי במחיר מבצע',
    'ניקוי יחידה פנימית וחיצונית בלחץ מים וחיטוי.',
    'המבצע מוגבל למזגן אחד לכל שובר.',
    99,
    220,
    'hot-deals',
    7,
    60,
  ],

  // under-99 coupons (4), all under ₪99
  [
    'under-99-coffee-card-5',
    'כרטיסייה של חמש כוסות קפה',
    'חמש כוסות קפה גדולות לבחירה מכל התפריט.',
    'הכרטיסייה אינה מוגבלת בזמן בשעות הפעילות.',
    59,
    95,
    'under-99',
    2,
    180,
  ],
  [
    'under-99-nail-polish',
    'מניקור עם לק ג׳ל',
    'עיצוב ציפורניים, טיפול בקוטיקולה ולק ג׳ל בצבע לבחירה.',
    'הטיפול נמשך כ-45 דקות.',
    69,
    120,
    'under-99',
    4,
    90,
  ],
  [
    'under-99-dog-wash',
    'רחצה וייבוש לכלב קטן',
    'רחצה בשמפו היפואלרגני, ייבוש וסירוק לכלב עד 10 ק״ג.',
    'ללא תספורת, בתיאום מראש.',
    49,
    85,
    'under-99',
    10,
    90,
  ],
  [
    'under-99-kids-play-entry',
    'כניסה בודדת למתחם המשחקים',
    'כניסה לשעה וחצי למתחם המשחקים המקורה לילד אחד.',
    'מבוגר מלווה נכנס ללא תשלום.',
    39,
    60,
    'under-99',
    9,
    120,
  ],

  // new (3), hand-assigned to the collection
  [
    'new-wine-tasting-evening',
    'ערב טעימות יין בנמל',
    'טעימה מודרכת של חמישה יינות ישראליים עם מגש גבינות.',
    'הערב מתקיים בימי חמישי בשעה 20:00.',
    149,
    240,
    'new',
    1,
    90,
  ],
  [
    'new-couple-facial',
    'טיפול פנים זוגי',
    'שני טיפולי פנים במקביל בחדר זוגי עם מסכה מותאמת אישית.',
    'כולל כוס תה צמחים בסיום.',
    299,
    480,
    'new',
    4,
    120,
  ],
  [
    'new-video-editing-workshop',
    'סדנת עריכת וידאו לרשתות',
    'סדנה של ארבע שעות על עריכה בטלפון לטיקטוק ולאינסטגרם.',
    'כל משתתף יוצא עם סרטון ערוך משלו.',
    129,
    220,
    'new',
    8,
    120,
  ],
]

type PhysicalSpec = [
  tail: string,
  name: string,
  s1: string,
  s2: string,
  priceIls: number,
  originalIls: number,
  category: DemoCategorySlug,
  supplier: number,
  stock: number,
]

const PHYSICAL_SPECS: readonly PhysicalSpec[] = [
  // phones-computers (4)
  [
    'wireless-earbuds-anc',
    'אוזניות אלחוטיות עם ביטול רעשים',
    'אוזניות בלוטות׳ עם ביטול רעשים אקטיבי ועד 30 שעות האזנה עם הנרתיק.',
    'עמידות למים בתקן IPX4 ושלושה גדלי גומיות באריזה.',
    249,
    399,
    'phones-computers',
    11,
    40,
  ],
  [
    'power-bank-20000',
    'סוללת גיבוי 20,000 מיליאמפר',
    'סוללת גיבוי עם טעינה מהירה 65 וואט ושתי יציאות USB-C.',
    'טוענת מחשב נייד וסמארטפון במקביל.',
    149,
    229,
    'phones-computers',
    11,
    60,
  ],
  [
    'magsafe-charger-stand',
    'מעמד טעינה אלחוטי שלושה באחד',
    'מעמד טעינה לטלפון, לשעון ולאוזניות בעיצוב מתקפל.',
    'מגיע עם ספק כוח 30 וואט וכבל באורך מטר וחצי.',
    179,
    279,
    'phones-computers',
    11,
    35,
  ],
  [
    'usb-c-hub-7in1',
    'מפצל USB-C שבעה באחד',
    'מפצל עם HDMI 4K, שלוש כניסות USB, קורא כרטיסים וטעינה עוברת.',
    'גוף אלומיניום דק המתאים לכל מחשב נייד עם USB-C.',
    119,
    189,
    'phones-computers',
    11,
    50,
  ],

  // baby-kids (2)
  [
    'baby-carrier-ergonomic',
    'מנשא ארגונומי לתינוק',
    'מנשא עם תמיכה מלאה בירכיים ובגב מגיל לידה ועד 20 ק״ג.',
    'בד נושם ושלוש תנוחות נשיאה.',
    299,
    449,
    'baby-kids',
    12,
    25,
  ],
  [
    'stroller-organizer-bag',
    'תיק ארגונית לעגלה',
    'תיק נתלה לידית העגלה עם תאים לבקבוקים, לטלפון ולמגבונים.',
    'נסגר ברוכסן ועמיד למים.',
    89,
    139,
    'baby-kids',
    12,
    70,
  ],

  // pets (2)
  [
    'dog-bed-orthopedic-large',
    'מיטה אורתופדית לכלב גדול',
    'מיטה עם ספוג זיכרון וכיסוי נשלף לכביסה לכלבים עד 45 ק״ג.',
    'תחתית מונעת החלקה המתאימה לרצפה ולמרפסת.',
    229,
    349,
    'pets',
    10,
    20,
  ],
  [
    'cat-scratching-tower',
    'עץ טיפוס וגירוד לחתול',
    'עץ בגובה מטר וחצי עם שלושה מפלסים, מערה ועמודי סיזל.',
    'מגיע מפורק עם הוראות הרכבה בעברית.',
    199,
    320,
    'pets',
    10,
    15,
  ],

  // hot-deals (1), featured
  [
    'hot-deal-smartwatch',
    'שעון חכם עם מד דופק ו-GPS',
    'שעון חכם עם מסך AMOLED, מדידת דופק רציפה ו-GPS מובנה.',
    'סוללה לשבוע שלם ועמידות למים עד 50 מטר.',
    349,
    699,
    'hot-deals',
    11,
    30,
  ],

  // under-99 (2)
  [
    'under-99-phone-case-clear',
    'כיסוי שקוף מוקשח לסמארטפון',
    'כיסוי שקוף עם פינות סופגות זעזועים שאינו מצהיב.',
    'מתאים לדגמים הנפוצים, לבחירה בעת האיסוף.',
    39,
    69,
    'under-99',
    11,
    120,
  ],
  [
    'under-99-baby-bibs-set',
    'סט חמישה סינרי סיליקון לתינוק',
    'חמישה סינרים עם כיס לאיסוף פירורים ורצועה מתכווננת.',
    'נשטפים במדיח ומתאימים מגיל חצי שנה.',
    59,
    95,
    'under-99',
    12,
    80,
  ],

  // new (1)
  [
    'new-night-light-projector',
    'מנורת לילה מקרינת כוכבים',
    'מנורה לחדר ילדים המקרינה שמי כוכבים בשמונה צבעים.',
    'כיבוי אוטומטי אחרי 30 או 60 דקות ושלט רחוק.',
    129,
    199,
    'new',
    12,
    45,
  ],
]

const AGOROT_PER_ILS = 100

/** Whole shekels to agorot with an integer multiply. No float path. */
function wholeIlsToAgorot(ils: number): number {
  if (!Number.isInteger(ils) || ils <= 0) {
    throw new RangeError(`demo catalogue prices are whole shekels, got ${ils}`)
  }
  return ils * AGOROT_PER_ILS
}

/** Collections platform fee: coupons settle online, so the share is higher. */
const COUPON_PLATFORM_PERCENT = 15
const PHYSICAL_PLATFORM_PERCENT = 10
/** Days an issued coupon voucher stays valid; the admin form's default. */
const COUPON_EXPIRY_DAYS = 90

function imageKeyFor(slug: string): string {
  return `demo-catalog/products/${slug}`
}

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  ...COUPON_SPECS.map(
    (
      [tail, name, s1, s2, priceIls, originalIls, category, supplier, validDays],
      i,
    ): DemoProduct => {
      const slug = `${DEMO_SLUG_PREFIX}${tail}`
      return {
        id: demoCatalogId('product', i + 1),
        slug,
        type: 'coupon',
        nameHe: name,
        descriptionHe: `${s1} ${s2}`,
        shortDescriptionHe: s1,
        priceAgorot: wholeIlsToAgorot(priceIls),
        originalPriceAgorot: wholeIlsToAgorot(originalIls),
        categorySlug: category,
        supplierId: demoCatalogId('supplier', supplier),
        offerValidDays: validDays,
        couponExpiryDays: COUPON_EXPIRY_DAYS,
        stockQuantity: null,
        platformPercent: COUPON_PLATFORM_PERCENT,
        imageKey: imageKeyFor(slug),
        featured: category === 'hot-deals',
      }
    },
  ),
  ...PHYSICAL_SPECS.map(
    ([tail, name, s1, s2, priceIls, originalIls, category, supplier, stock], i): DemoProduct => {
      const slug = `${DEMO_SLUG_PREFIX}${tail}`
      return {
        id: demoCatalogId('product', COUPON_SPECS.length + i + 1),
        slug,
        type: 'physical',
        nameHe: name,
        descriptionHe: `${s1} ${s2}`,
        shortDescriptionHe: s1,
        priceAgorot: wholeIlsToAgorot(priceIls),
        originalPriceAgorot: wholeIlsToAgorot(originalIls),
        categorySlug: category,
        supplierId: demoCatalogId('supplier', supplier),
        offerValidDays: null,
        couponExpiryDays: null,
        stockQuantity: stock,
        platformPercent: PHYSICAL_PLATFORM_PERCENT,
        imageKey: imageKeyFor(slug),
        featured: category === 'hot-deals',
      }
    },
  ),
]

export function demoCatalogIds(): { suppliers: string[]; products: string[] } {
  return {
    suppliers: DEMO_SUPPLIERS.map((s) => s.id),
    products: DEMO_PRODUCTS.map((p) => p.id),
  }
}

export function supplierOf(product: DemoProduct): DemoSupplier {
  const supplier = DEMO_SUPPLIERS.find((s) => s.id === product.supplierId)
  if (!supplier) throw new Error(`${product.slug}: unknown supplier ${product.supplierId}`)
  return supplier
}

/** Per-category counts, for the plan printout and for STATE.md. */
export function countsByCategory(): Record<
  DemoCategorySlug,
  { coupons: number; physical: number }
> {
  const out = Object.fromEntries(
    DEMO_CATEGORY_SLUGS.map((slug) => [slug, { coupons: 0, physical: 0 }]),
  ) as Record<DemoCategorySlug, { coupons: number; physical: number }>
  for (const p of DEMO_PRODUCTS) {
    if (p.type === 'coupon') out[p.categorySlug].coupons += 1
    else out[p.categorySlug].physical += 1
  }
  return out
}
