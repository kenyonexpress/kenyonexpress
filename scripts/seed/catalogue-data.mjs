/**
 * The 14 suppliers and 40 deals `seed-catalogue.mjs` writes.
 *
 * Pure data and pure helpers, in its own module so `catalogue-data.test.ts` can
 * assert the invariants without a database. Every rule below is one the
 * catalogue enforces somewhere else and that a seed can quietly violate:
 *
 *   - `platform_percent` is NOT NULL with no DEFAULT (migration 050), and the
 *     commission engine refuses a line without one. It is DIFFERENT per product
 *     here, because a seed where every row shares a number is a seed that would
 *     not have caught a hardcoded percent.
 *   - A coupon's `coupon_price_ils` is the ABSOLUTE amount charged online and is
 *     always strictly less than the sticker price. Equal or greater is not a
 *     discount, and the storefront would render a 0% badge or a negative one.
 *   - Every supplier carries an address, a city, a phone and a logo. That is the
 *     point rather than a detail: production has 11 suppliers with none of those,
 *     and the publish gate means none of their products can be edited in the
 *     admin. A seed that reproduced the gap would seed the bug.
 *
 * IDs are fixed in a reserved namespace (`5eed…`) so the whole set is
 * recognisable in a table, re-runnable as an upsert, and removable by exactly
 * the rows it created.
 */

/**
 * `5eed0000-0000-4000-8000-<1|2>00000000NN` — reserved, recognisable, stable.
 *
 * The last group is exactly 12 hex digits, and that is asserted rather than
 * eyeballed: the first version of this function emitted ELEVEN, which Postgres
 * rejects with 22P02 on the first row of the insert. It looked right in the
 * generated SQL, because a UUID is just a long string until something parses it.
 */
export function seedId(kind, index) {
  const prefix = kind === 'supplier' ? '1' : '2'
  return `5eed0000-0000-4000-8000-${prefix}${String(index).padStart(11, '0')}`
}

/** picsum is on the image allowlist and, since [50], in the CSP `img-src`. */
function image(slug) {
  return `https://picsum.photos/seed/${slug}/800/800`
}

const CITIES = [
  ['תל אביב', 'דיזנגוף 120'],
  ['ירושלים', 'יפו 34'],
  ['חיפה', 'הנשיא 8'],
  ['באר שבע', 'רגר 55'],
  ['ראשון לציון', 'רוטשילד 41'],
  ['נתניה', 'הרצל 12'],
  ['אשדוד', 'הגדוד העברי 7'],
  ['פתח תקווה', 'ההסתדרות 22'],
  ['רמת גן', 'ביאליק 63'],
  ['אילת', 'התמרים 3'],
  ['חולון', 'סוקולוב 15'],
  ['הרצליה', 'סוקולוב 88'],
  ['מודיעין', 'עמק דותן 4'],
  ['רעננה', 'אחוזה 120'],
]

const SUPPLIER_NAMES = [
  'מסעדת הים הכחול',
  'ספא נופר',
  'פארק אתגרים',
  'בית קפה שקד',
  'מספרת אלגנס',
  'סטודיו יוגה נשימה',
  'מלון גן העיר',
  'פיצה נאפולי',
  'קליניקת עור ואור',
  'מרכז הבאולינג',
  // Added for the three open taxonomies the seed used to skip. See DEALS.
  'פטשופ החברים',
  'מרכז חוגים זאטוטים',
  'אינסטלציה ומיזוג רן',
  'מעבדת סלולר טק',
]

export const SUPPLIERS = SUPPLIER_NAMES.map((name, i) => {
  const [city, street] = CITIES[i]
  return {
    id: seedId('supplier', i + 1),
    name,
    // Complete on purpose. See the header.
    contactName: 'מנהל/ת הסניף',
    contactEmail: `seed-supplier-${i + 1}@example.test`,
    contactPhone: `03-${String(5000000 + i * 11111).slice(0, 7)}`,
    whatsapp: `05${i}-${String(1000000 + i * 12345).slice(0, 7)}`,
    address: street,
    city,
    website: `https://example.test/seed-supplier-${i + 1}`,
    businessId: `51${String(1000000 + i).padStart(7, '0')}`,
    logoUrl: image(`supplier-${i + 1}`),
    // Distinct per supplier, for the same reason the products' percents are.
    defaultSplitPercent: 60 + i * 2,
  }
})

/**
 * 40 deals mapped onto categories that ALREADY EXIST in production (measured:
 * 12 active category slugs). A seed that invented its own categories would put
 * demo rows in the navigation.
 *
 * The last nine were added on 19.08 for a reason the launch bar names: the
 * seed reached four categories, and `baby-kids`, `pets` and `professionals`
 * were three of the seven open taxonomies it left with nothing. Production
 * covers 0 of those 7 with a real coupon, so a staging reset that also covered
 * none of them could not show what the gap looks like once it is closed.
 *
 * The three collections (`hot-deals`, `under-99`, `new`) are still untouched,
 * and that is not an omission. Membership in them is a rule about price or
 * recency, and `categories` has no column that expresses one; a row put there
 * by hand is a hand-placed row, not a collection that works. `courses` stays
 * empty until there is a subscription product, and `electronics` is not in the
 * live menu.
 */
const DEALS = [
  // restaurants + cafés
  ['ארוחה זוגית מלאה', 'restaurants-cafes', 0, 320, 149],
  ['בראנץ׳ לשניים', 'restaurants-cafes', 1, 180, 89],
  ['פיצה משפחתית + שתייה', 'restaurants-cafes', 7, 120, 59],
  ['ארוחת שף 5 מנות', 'restaurants-cafes', 0, 480, 239],
  ['קפה ומאפה', 'restaurants-cafes', 3, 46, 22],
  ['ארוחת בוקר בופה', 'restaurants-cafes', 3, 98, 49],
  ['סושי 64 יחידות', 'restaurants-cafes', 0, 260, 129],
  ['המבורגר + צ׳יפס + שתייה', 'restaurants-cafes', 7, 92, 45],
  ['ארוחה טבעונית זוגית', 'restaurants-cafes', 3, 210, 99],
  ['קינוח שף לזוג', 'restaurants-cafes', 0, 70, 34],
  // spa + beauty
  ['עיסוי שוודי 60 דקות', 'beauty-health', 1, 340, 169],
  ['יום ספא זוגי', 'beauty-health', 1, 690, 329],
  ['טיפול פנים מתקדם', 'beauty-health', 8, 420, 199],
  ['תספורת + פן', 'beauty-health', 4, 150, 69],
  ['מניקור ופדיקור', 'beauty-health', 4, 190, 89],
  ['הסרת שיער בלייזר', 'beauty-health', 8, 550, 249],
  ['עיסוי רקמות עמוק', 'beauty-health', 1, 380, 179],
  ['צביעת שיער מלאה', 'beauty-health', 4, 300, 139],
  ['כרטיסייה 5 שיעורי יוגה', 'beauty-health', 5, 400, 189],
  ['סדנת נשימה ומדיטציה', 'beauty-health', 5, 160, 79],
  // attractions + vacation
  ['כניסה לפארק אתגרים', 'vacation', 2, 140, 69],
  ['לילה זוגי במלון בוטיק', 'vacation', 6, 890, 449],
  ['משחק באולינג לזוג', 'vacation', 9, 120, 55],
  ['סופ״ש משפחתי', 'vacation', 6, 1490, 749],
  ['חדר בריחה ל-4', 'vacation', 2, 400, 189],
  ['שייט זריחה', 'vacation', 9, 220, 109],
  ['כרטיס לפארק מים', 'vacation', 2, 180, 89],
  ['ארוחת ערב + לינה', 'vacation', 6, 1100, 549],
  // physical goods, so the seed is not all coupons
  ['אוזניות אלחוטיות', 'phones-computers', 8, 399, null],
  ['שעון חכם', 'phones-computers', 8, 690, null],
  // pets
  ['טיפוח וספר לכלב קטן', 'pets', 10, 220, 109],
  ['חיסון שנתי ובדיקה וטרינרית', 'pets', 10, 400, 199],
  ['שק מזון פרימיום 12 קילו', 'pets', 10, 340, null],
  // baby + kids
  ['כרטיסייה לחוג התעמלות לפעוטות', 'baby-kids', 11, 480, 229],
  ['צילומי גיל שנה בסטודיו', 'baby-kids', 11, 750, 349],
  ['סדנת הורים ותינוקות', 'baby-kids', 11, 260, 129],
  // professionals
  ['ביקור חשמלאי ואבחון תקלה', 'professionals', 12, 350, 169],
  ['ניקוי מזגן מקצועי', 'professionals', 12, 280, 139],
  ['פתיחת סתימה דחופה', 'professionals', 12, 450, 219],
  // phones-computers held two physical rows and no coupon, which is exactly
  // what production has there. The bar asks every open taxonomy for a coupon,
  // so the seed answers it with a service rather than by dropping the row.
  ['תיקון מסך סמארטפון', 'phones-computers', 13, 450, 219],
]

export const PRODUCTS = DEALS.map(
  ([name, categorySlug, supplierIndex, priceIls, couponPriceIls], i) => {
    const slug = `seed-deal-${String(i + 1).padStart(2, '0')}`
    return {
      id: seedId('product', i + 1),
      slug,
      nameHe: name,
      categorySlug,
      supplierId: seedId('supplier', supplierIndex + 1),
      type: couponPriceIls === null ? 'physical' : 'coupon',
      priceIls,
      couponPriceIls,
      // A different percent for every product. `products.platform_percent` is NOT
      // NULL with no default, and the engine snapshots it per line at purchase.
      platformPercent: 8 + (i % 17),
      imageUrl: image(slug),
      shortDescriptionHe: `${name} — מבצע בלעדי בקניון אקספרס.`,
      seoDescription: `${name} במחיר מיוחד בקניון אקספרס. כמות מוגבלת.`,
      // Coupons are minted on payment and have no stock; physical goods do.
      stockQuantity: couponPriceIls === null ? 25 : null,
      couponExpiryDays: couponPriceIls === null ? null : 90,
    }
  },
)

/** Every id this seed owns, for the teardown. */
export function seededIds() {
  return {
    suppliers: SUPPLIERS.map((s) => s.id),
    products: PRODUCTS.map((p) => p.id),
  }
}
