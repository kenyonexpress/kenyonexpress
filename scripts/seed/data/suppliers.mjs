// scripts/seed/data/suppliers.mjs
//
// Ten suppliers, complete enough to exercise every screen that shows one.
//
// A supplier is not just a name on a product card. The supplier portal, the
// order confirmation and the redemption receipt each read a different subset of
// this row, and a half-filled supplier is how a screen ends up rendering an
// empty contact block that nobody notices until a customer needs to phone the
// business. So every supplier here carries the full set: legal id, contact
// person, two phone numbers, a street address, a city, a site and a logo.
//
// The businesses are fictional. The shapes are not: business_id is nine digits
// as the Israeli registrar issues them (a חברה בע״מ starts 51, an עוסק מורשה
// starts 03 or 05), landlines carry a real area code for the city given, and
// mobiles are 05x. Nothing here resolves to a real business, and no real phone
// number is used: every mobile is in the 050-000xxxx block, which carriers do
// not allocate.
//
// SPLITS
//
// default_split_percent is the supplier's share of the on-site charge, and the
// platform's share is the remainder. The pair is stored on the product too
// (products.supplier_split_percent + products.platform_percent, held to 100 by
// products_split_pair_sums_to_100), because an order line has to be able to
// state the terms it was bought under months later. These ten carry different
// splits on purpose: a seed where every supplier is on 70/30 cannot show that
// the split is per-supplier, and migration 070 exists precisely because it is.

export const SUPPLIERS = [
  {
    key: 'lehem-erez',
    name: 'לחם של ארז - מאפייה ובית קפה',
    contact_name: 'ארז בן חמו',
    contact_email: 'erez@lehem-erez.example.co.il',
    contact_phone: '03-5561840',
    whatsapp: '050-0001840',
    address: 'רחוב אבן גבירול 71',
    city: 'תל אביב-יפו',
    website: 'https://lehem-erez.example.co.il',
    business_id: '514872051',
    logo_url: '/images/products/ke-live-deal-31.avif',
    default_split_percent: 78,
    status: 'active',
    notes: 'מאפייה בוטיק ובית קפה. מימוש קופונים בסניף אבן גבירול בלבד, כולל בשבתות.',
    categories: ['restaurants-cafes'],
    owner: { fullName: 'ארז בן חמו', email: 'erez.owner@lehem-erez.example.co.il' },
    scanner: { fullName: 'נועה שקד', email: 'noa.scanner@lehem-erez.example.co.il' },
  },
  {
    key: 'cafe-nimrod',
    name: 'קפה נמרוד',
    contact_name: 'נמרוד אלקיים',
    contact_email: 'hello@cafe-nimrod.example.co.il',
    contact_phone: '04-8622117',
    whatsapp: '050-0002117',
    address: 'שדרות מוריה 112',
    city: 'חיפה',
    website: 'https://cafe-nimrod.example.co.il',
    business_id: '036548219',
    logo_url: '/images/products/ke-live-deal-24.avif',
    default_split_percent: 75,
    status: 'active',
    notes: 'בית קפה שכונתי בכרמל. ארוחות בוקר עד 12:00, קופונים תקפים בכל ימות השבוע.',
    categories: ['restaurants-cafes'],
    owner: { fullName: 'נמרוד אלקיים', email: 'nimrod.owner@cafe-nimrod.example.co.il' },
    scanner: { fullName: 'יסמין דוד', email: 'yasmin.scanner@cafe-nimrod.example.co.il' },
  },
  {
    key: 'derma-skin',
    name: 'דרמה סקין - קליניקה לטיפולי עור',
    contact_name: 'ד"ר מיכל אורן',
    contact_email: 'clinic@derma-skin.example.co.il',
    contact_phone: '03-6127430',
    whatsapp: '050-0007430',
    address: 'ז׳בוטינסקי 155, מגדל התאומים',
    city: 'רמת גן',
    website: 'https://derma-skin.example.co.il',
    business_id: '515903274',
    logo_url: '/images/products/facial-small-600x600.webp',
    default_split_percent: 70,
    status: 'active',
    notes: 'קליניקה רפואית. כל טיפול מחייב תיאום מראש ובדיקת התאמה, מימוש בימים א-ה.',
    categories: ['beauty-health', 'courses'],
    owner: { fullName: 'מיכל אורן', email: 'michal.owner@derma-skin.example.co.il' },
    scanner: { fullName: 'רותם כהן', email: 'rotem.scanner@derma-skin.example.co.il' },
  },
  {
    key: 'avi-style',
    name: 'אבי סטייל - ברברשופ',
    contact_name: 'אבי מזרחי',
    contact_email: 'avi@avistyle.example.co.il',
    contact_phone: '03-9231765',
    whatsapp: '050-0001765',
    address: 'חיים עוזר 18',
    city: 'פתח תקווה',
    website: 'https://avistyle.example.co.il',
    business_id: '037761204',
    logo_url: '/images/products/ke-live-deal-1.avif',
    default_split_percent: 82,
    status: 'active',
    notes: 'מספרת גברים. ללא תור מראש, מימוש בהצגת הקוד בקופה.',
    categories: ['beauty-health'],
    owner: { fullName: 'אבי מזרחי', email: 'avi.owner@avistyle.example.co.il' },
    scanner: { fullName: 'דניאל מזרחי', email: 'daniel.scanner@avistyle.example.co.il' },
  },
  {
    key: 'celullar-express',
    name: 'סלולר אקספרס',
    contact_name: 'שרון ביטון',
    contact_email: 'sales@cellular-express.example.co.il',
    contact_phone: '03-9518860',
    whatsapp: '050-0008860',
    address: 'שדרות ירושלים 24',
    city: 'ראשון לציון',
    website: 'https://cellular-express.example.co.il',
    business_id: '516204833',
    logo_url: '/images/products/ke-live-deal-27.avif',
    default_split_percent: 88,
    status: 'active',
    notes: 'רשת חנויות סלולר. מוצרים פיזיים עם משלוח עד הבית, אחריות יבואן רשמי.',
    categories: ['phones-computers'],
    owner: { fullName: 'שרון ביטון', email: 'sharon.owner@cellular-express.example.co.il' },
    scanner: { fullName: 'עומר לוי', email: 'omer.scanner@cellular-express.example.co.il' },
  },
  {
    key: 'techno-line',
    name: 'טכנו ליין יבוא ושיווק בע"מ',
    contact_name: 'ליאור פרידמן',
    contact_email: 'orders@technoline.example.co.il',
    contact_phone: '08-8563900',
    whatsapp: '050-0003900',
    address: 'האורגים 12, אזור תעשייה צפוני',
    city: 'אשדוד',
    website: 'https://technoline.example.co.il',
    business_id: '512338907',
    logo_url: '/images/products/sony3-600x600.webp',
    default_split_percent: 85,
    status: 'active',
    notes: 'יבואן ישיר. משלוחים בימים א-ה, אספקה תוך 3 ימי עסקים למרכז ו-5 לפריפריה.',
    categories: ['phones-computers'],
    owner: { fullName: 'ליאור פרידמן', email: 'lior.owner@technoline.example.co.il' },
    scanner: { fullName: 'הילה שמש', email: 'hila.scanner@technoline.example.co.il' },
  },
  {
    key: 'baby-land',
    name: 'בייבי לנד - הכל לתינוק',
    contact_name: 'טליה גרינברג',
    contact_email: 'service@babyland.example.co.il',
    contact_phone: '09-8657712',
    whatsapp: '050-0007712',
    address: 'הרצל 61',
    city: 'נתניה',
    website: 'https://babyland.example.co.il',
    business_id: '514099318',
    logo_url: '/images/products/e-baby-d2.webp',
    default_split_percent: 80,
    status: 'active',
    notes: 'חנות מוצרי תינוקות. כל מוצרי הבטיחות נושאים תקן ישראלי, החזרה עד 14 יום.',
    categories: ['baby-kids'],
    owner: { fullName: 'טליה גרינברג', email: 'talia.owner@babyland.example.co.il' },
    scanner: { fullName: 'איתי גרינברג', email: 'itay.scanner@babyland.example.co.il' },
  },
  {
    key: 'harei-meron',
    name: 'צימרי הרי מירון',
    contact_name: 'יוסי אזולאי',
    contact_email: 'booking@harei-meron.example.co.il',
    contact_phone: '04-6987240',
    whatsapp: '050-0007240',
    address: 'מושב שפר, ד.נ. מרום הגליל',
    city: 'צפת',
    website: 'https://harei-meron.example.co.il',
    business_id: '038812650',
    logo_url: '/images/products/ke-live-deal-15.avif',
    default_split_percent: 72,
    status: 'active',
    notes: 'ארבעה צימרים זוגיים עם ג׳קוזי. חובה לתאם תאריך טלפונית לפני הגעה, כפוף לזמינות.',
    categories: ['vacation'],
    owner: { fullName: 'יוסי אזולאי', email: 'yossi.owner@harei-meron.example.co.il' },
    scanner: { fullName: 'שירה אזולאי', email: 'shira.scanner@harei-meron.example.co.il' },
  },
  {
    key: 'hayot-vahetzi',
    name: 'חיות וחצי - פט שופ',
    contact_name: 'אורי שרעבי',
    contact_email: 'info@hayot.example.co.il',
    contact_phone: '08-6412290',
    whatsapp: '050-0002290',
    address: 'רחוב הפלמ״ח 9',
    city: 'באר שבע',
    website: 'https://hayot.example.co.il',
    business_id: '039205518',
    logo_url: '/images/products/137_dl_photo_ffd5b-600x464.webp',
    default_split_percent: 79,
    status: 'active',
    notes: 'פט שופ ומספרת חיות. מזון במשלוח, טיפוח בתיאום מראש.',
    categories: ['pets'],
    owner: { fullName: 'אורי שרעבי', email: 'uri.owner@hayot.example.co.il' },
    scanner: { fullName: 'מאיה שרעבי', email: 'maya.scanner@hayot.example.co.il' },
  },
  {
    key: 'electro-fix',
    name: 'אלקטרו פיקס - שירותי חשמל',
    contact_name: 'רונן ביטון',
    contact_email: 'service@electrofix.example.co.il',
    contact_phone: '02-6714408',
    whatsapp: '050-0004408',
    address: 'כנפי נשרים 15',
    city: 'ירושלים',
    website: 'https://electrofix.example.co.il',
    business_id: '515774209',
    logo_url: '/images/products/ke-live-deal-20.avif',
    default_split_percent: 76,
    // The one supplier that is not `active`: the supplier portal, the admin
    // supplier list and the checkout all treat a suspended supplier
    // differently, and with ten active suppliers none of those branches is
    // ever taken on seeded data.
    status: 'suspended',
    notes: 'חשמלאי מוסמך + קורסים דיגיטליים. הושעה זמנית עד להשלמת מסמכי ביטוח (דמו).',
    categories: ['professionals', 'courses'],
    owner: { fullName: 'רונן ביטון', email: 'ronen.owner@electrofix.example.co.il' },
    scanner: { fullName: 'אלון ביטון', email: 'alon.scanner@electrofix.example.co.il' },
  },
]

export const SUPPLIER_KEYS = SUPPLIERS.map((supplier) => supplier.key)

/** The suppliers that can carry a product in `categoryKey`. */
export function suppliersForCategory(categoryKey) {
  return SUPPLIERS.filter((supplier) => supplier.categories.includes(categoryKey))
}

/** The platform's share is whatever the supplier's is not. */
export function platformPercentFor(supplier) {
  return 100 - supplier.default_split_percent
}
