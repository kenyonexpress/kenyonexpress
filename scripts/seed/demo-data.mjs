/**
 * The demo-production profile (marathon step 16): 3 suppliers, 40 physical
 * products, 20 coupons -- the composition CLOSEOUT §4 and §9(ז) name.
 *
 * SAME RULES AS catalogue-data.mjs (docs/SEED.md): emitted as SQL only,
 * never executed by a script; fixed recognisable UUIDs so --clean-sql can
 * remove exactly this set; categories referenced by SLUG against the ones
 * production already has, never invented; every supplier complete enough to
 * render a supplier page.
 *
 * ITS OWN NAMESPACE. `d3e30000-…` rather than catalogue-data's `5eed0000-…`,
 * so the two seeds can coexist, be counted apart, and be removed apart.
 */

export function demoId(kind, index) {
  const prefix = kind === 'supplier' ? '1' : '2'
  return `d3e30000-0000-4000-8000-${prefix}${String(index).padStart(11, '0')}`
}

function image(slug) {
  return `https://picsum.photos/seed/${slug}/800/800`
}

const SUPPLIER_SPECS = [
  ['רשת חשמל הבית', 'תל אביב', 'אבן גבירול 90'],
  ['מסעדת שף הגליל', 'חיפה', 'שדרות בן גוריון 22'],
  ['ספא ומלון הרי יהודה', 'ירושלים', 'עמק רפאים 17'],
]

export const DEMO_SUPPLIERS = SUPPLIER_SPECS.map(([name, city, street], i) => ({
  id: demoId('supplier', i + 1),
  name: String(name),
  contactName: 'מנהל/ת הסניף',
  contactEmail: `demo-supplier-${i + 1}@example.test`,
  contactPhone: `03-${String(6000000 + i * 13131).slice(0, 7)}`,
  whatsapp: `05${i}-${String(2000000 + i * 21212).slice(0, 7)}`,
  address: String(street),
  city: String(city),
  website: `https://example.test/demo-supplier-${i + 1}`,
  businessId: `52${String(2000000 + i).padStart(7, '0')}`,
  logoUrl: image(`demo-supplier-${i + 1}`),
  defaultSplitPercent: 65 + i * 5,
}))

/**
 * 40 physical products for supplier 1 (a home-electronics chain: the one
 * vertical where forty DISTINCT physical items are believable), spread over
 * the two live physical-friendly taxonomies.
 */
const PHYSICAL_LINES = [
  ['מקרר משרדי 90 ליטר', 1290],
  ['קומקום נירוסטה מהיר', 129],
  ['טוסטר לחיצה 4 פרוסות', 189],
  ['מיקסר יד 500W', 159],
  ['בלנדר מוט טורבו', 199],
  ['מגהץ אדים קרמי', 149],
  ['שואב אבק אלחוטי', 690],
  ['מאוורר עמוד 18 אינץ׳', 179],
  ['תנור אובן 45 ליטר', 549],
  ['מיחם שבת 30 כוסות', 229],
  ['מצנם דיגיטלי', 139],
  ['סיר לחץ חשמלי 6 ליטר', 399],
  ['מחבת גריל 28 ס״מ', 119],
  ['סט סכינים 5 חלקים', 169],
  ['קוצץ ירקות חשמלי', 99],
  ['מטחנת קפה', 189],
  ['מקציף חלב', 129],
  ['משקל מטבח דיגיטלי', 59],
  ['מייבש שיער מקצועי', 219],
  ['מחליק שיער קרמי', 249],
  ['מכונת תספורת נטענת', 199],
  ['מסיר שיער IPL', 899],
  ['משקל אמבטיה חכם', 149],
  ['מד לחץ דם דיגיטלי', 259],
  ['מכשיר אינהלציה', 189],
  ['כרית עיסוי שיאצו', 299],
  ['אקדח עיסוי ספורט', 449],
  ['מזרן חשמלי זוגי', 329],
  ['שמיכה חשמלית יחיד', 219],
  ['מפזר חום לאמבטיה', 169],
  ['רדיאטור 12 צלעות', 499],
  ['מאוורר תקרה עם שלט', 389],
  ['מצלמת אבטחה ביתית', 249],
  ['פעמון דלת חכם', 199],
  ['שקע חכם WiFi זוג', 99],
  ['נורות LED חכמות רביעייה', 149],
  ['מטען אלחוטי מהיר', 89],
  ['סוללת גיבוי 20000mAh', 129],
  ['אוזניות בלוטות׳ ספורט', 159],
  ['רמקול בלוטות׳ עמיד מים', 199],
]

/** 20 coupons split between the restaurant (2) and the spa-hotel (3). */
const COUPON_LINES = [
  ['ארוחת שף זוגית', 2, 420, 89],
  ['ארוחת בוקר זוגית', 2, 160, 39],
  ['ערב טעימות יין ובשר', 2, 520, 109],
  ['ארוחה משפחתית לארבעה', 2, 560, 119],
  ['עסקית צהריים ליחיד', 2, 98, 25],
  ['פלטת גבינות ויין לזוג', 2, 220, 55],
  ['ארוחת ילדים + קינוח', 2, 78, 19],
  ['שולחן שף ליחיד', 2, 340, 79],
  ['קינוחי הבית לזוג', 2, 96, 24],
  ['ארוחה צמחונית זוגית', 2, 260, 59],
  ['עיסוי שוודי 50 דקות', 3, 320, 79],
  ['יום ספא זוגי + בריכה', 3, 690, 149],
  ['עיסוי אבנים חמות', 3, 380, 95],
  ['לילה זוגי + ארוחת בוקר', 3, 990, 199],
  ['טיפול פנים יוקרתי', 3, 420, 99],
  ['חבילת פינוק ליולדת', 3, 520, 119],
  ['שעת ג׳קוזי פרטי לזוג', 3, 360, 85],
  ['סוויטה ליום כיף זוגי', 3, 780, 169],
  ['עיסוי רקמות עמוק', 3, 340, 89],
  ['ערכת ספא ביתית + טיפול', 3, 450, 105],
]

const PHYSICAL_CATEGORY = 'phones-computers'
const COUPON_CATEGORIES = { 2: 'restaurants-cafes', 3: 'vacation' }

export const DEMO_PRODUCTS = [
  ...PHYSICAL_LINES.map(([name, priceIls], i) => ({
    id: demoId('product', i + 1),
    slug: `demo-physical-${i + 1}`,
    nameHe: String(name),
    categorySlug: PHYSICAL_CATEGORY,
    supplierId: demoId('supplier', 1),
    type: 'physical',
    priceIls: Number(priceIls),
    couponPriceIls: null,
    platformPercent: 10,
    imageUrl: image(`demo-physical-${i + 1}`),
    shortDescriptionHe: `${name} — מוצר הדגמה, ללא כסף אמיתי.`,
    seoDescription: `${name} במשלוח מהיר. פריט הדגמה.`,
    stockQuantity: 25,
    couponExpiryDays: null,
  })),
  ...COUPON_LINES.map(([name, supplierIndex, priceIls, couponPriceIls], i) => ({
    id: demoId('product', 41 + i),
    slug: `demo-coupon-${i + 1}`,
    nameHe: String(name),
    categorySlug: COUPON_CATEGORIES[Number(supplierIndex)],
    supplierId: demoId('supplier', Number(supplierIndex)),
    type: 'coupon',
    priceIls: Number(priceIls),
    couponPriceIls: Number(couponPriceIls),
    platformPercent: 100,
    imageUrl: image(`demo-coupon-${i + 1}`),
    shortDescriptionHe: `${name} — שובר הדגמה, ללא כסף אמיתי.`,
    seoDescription: `${name} בקופון. פריט הדגמה.`,
    stockQuantity: null,
    couponExpiryDays: 90,
  })),
]

export function demoIds() {
  return {
    suppliers: DEMO_SUPPLIERS.map((s) => s.id),
    products: DEMO_PRODUCTS.map((p) => p.id),
  }
}
