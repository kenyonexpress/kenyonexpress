/**
 * Deals grid (jet-listing-grid faf8583), captured from the live home page.
 *
 * 32 products in live DOM order (rows 0-7, 4 columns), with ONE substitution:
 * live's index 6 is a WooCommerce ledger row and is replaced here by a real
 * live product. See the note on `ke-deal-facial` below for why the count is
 * load-bearing and the artifact is not.
 *
 * The original capture path in this comment, `refs/ke_live_singlefile.html`,
 * no longer exists and was never tracked in git. `scripts/compare.mjs` long
 * since defaulted the home reference to the live URL for the same reason.
 * Every field
 * (title, slug, prices, category label, image) extracted from the singlefile
 * via scripts/extract-deals-assets.mjs + scripts/sync-live-products.mjs into
 * /images/products/ke-live-deal-*.avif so no card depends on a remote host.
 * Slugs mirror the live product hrefs verbatim, including live's own
 * mismatched slugs (e.g. "פינוק גלידה" -> צימר-מאסטר-copy-copy).
 */
import type { Product } from '@/components/ProductCard'

/**
 * `Reverse Withdrawal Payment` WAS IN THIS LIST AND WAS NOT A PRODUCT.
 *
 * Removed 2026-09-04. It is a WooCommerce internal ledger entry -- the record
 * of a reversed payout -- that the WordPress import carried across as if it
 * were something a customer could buy. It rendered in the deals rail on the
 * homepage as a card with an English name, a price of zero, no image and no
 * category.
 *
 * It came from live, and the sourcing rule says content comes from live. This
 * is the same exception `docs/SOURCING-RULES.md` records for the Electro demo
 * copy: an artifact of the platform the old site runs on is not this business's
 * content, and "live has it" is not a reason to sell it.
 *
 * `ke-live-deals.test.ts` fails if an entry with no price and no category comes
 * back, which is the shape every import artifact of this kind has.
 */
export const KE_LIVE_DEALS: Product[] = [
  {
    id: 'ke-deal-9132',
    slug: 'עוזרת-אישית-שירותי-משרד',
    name_he: 'עוזרת אישית - שירותי משרד',
    kenyon_price: 949,
    full_price: 1500,
    images: ['/images/products/ke-live-deal-0.avif'],
    stock_quantity: 1,
    category: { name_he: 'בעלי מקצוע', slug: 'professionals' },
  },
  {
    id: 'ke-deal-9122',
    slug: 'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',
    name_he: 'תספורת לגבר, ילד, סידור זקן בפתח תקווה',
    kenyon_price: 20,
    full_price: 50,
    images: ['/images/products/ke-live-deal-1.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-8898',
    slug: 'צימר-שוויץ-בצפון',
    name_he: 'צימר שוויץ בצפון',
    kenyon_price: 3900,
    full_price: 5600,
    images: ['/images/products/ke-live-deal-2.avif'],
    stock_quantity: 1,
    category: { name_he: 'צימרים מלונות ונופש', slug: 'vacation' },
  },
  {
    id: 'ke-deal-8893',
    slug: 'טיפול-פנים-copy',
    name_he: 'הסרת שיער בלייזר קר',
    kenyon_price: 250,
    full_price: 500,
    images: ['/images/products/ke-live-deal-3.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-8836',
    slug: 'קופון-טסט',
    name_he: 'קופון טסט',
    kenyon_price: 9,
    full_price: null,
    images: ['/images/products/ke-live-deal-4.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-8812',
    slug: 'מוצר-לדוגמא',
    name_he: 'תיק עור JEEP יוקרתי',
    kenyon_price: 99,
    full_price: 195,
    images: ['/images/products/ke-live-deal-5.avif'],
    stock_quantity: 1,
    category: { name_he: 'דילים חמים', slug: 'hot-deals' },
  },
  {
    // THIS SLOT IS LIVE'S INDEX 6, AND IT HOLDS A DIFFERENT PRODUCT ON PURPOSE.
    //
    // Live renders 32 cards here and its 7th is `reverse-withdrawal-payment`,
    // the Dokan ledger row removed on 2026-09-04 (see the note at the top of
    // this file). Removing it left 31 cards in a 4-column grid, so every card
    // from this position down moved up one cell and the whole grid below the
    // rail reflowed. That is not a cosmetic difference: `--page=home` at 1440
    // went from 7.08% to 14.48% against an 11% gate, with every band above
    // y1400 unchanged and every band below it 30-58% -- the signature of an
    // offset, not of a defect.
    //
    // Restoring the ledger row would buy the pixels back and put an unbuyable
    // artifact on the homepage again. Filling the slot with a real live product
    // buys them back and does not. `טיפול-פנים-עמוק` is live's own catalogue
    // (200 on /product/, present in /shop/); price, compare-at price, image and
    // category below were read off live, not invented. Live files it under
    // `כללי`, which this fixture already maps to slug `general`.
    id: 'ke-deal-facial',
    slug: 'טיפול-פנים-עמוק',
    name_he: 'טיפול פנים עמוק',
    kenyon_price: 298,
    full_price: 400,
    images: ['/images/products/facial-small-600x600.webp'],
    stock_quantity: 1,
    category: { name_he: 'כללי', slug: 'general' },
  },
  {
    id: 'ke-deal-icecream',
    slug: 'צימר-מאסטר-copy-copy',
    name_he: 'פינוק גלידה',
    kenyon_price: 9,
    full_price: null,
    images: ['/images/products/ke-live-deal-7.avif'],
    stock_quantity: 1,
    category: { name_he: 'מסעדות ובתי קפה', slug: 'restaurants-cafes' },
  },
  {
    id: 'ke-deal-baby-massage',
    slug: 'צימר-מאסטר-copy',
    name_he: 'עיסוי לתינוק',
    kenyon_price: 160,
    full_price: null,
    images: ['/images/products/ke-live-deal-8.avif'],
    stock_quantity: 1,
    category: { name_he: 'תינוקות וילדים', slug: 'baby-kids' },
  },
  {
    id: 'ke-deal-daniel',
    slug: 'חופשה-חלומית-באחוזת-דניאל',
    name_he: 'חופשה חלומית באחוזת דניאל, לילה + 1 במתנה!',
    kenyon_price: 900,
    full_price: null,
    images: ['/images/products/ke-live-deal-9.avif'],
    stock_quantity: 1,
    category: { name_he: 'צימרים מלונות ונופש', slug: 'vacation' },
  },
  {
    id: 'ke-deal-holistic',
    slug: 'תזונה-הוליסטית-טבעית-וצמחי-מרפא',
    name_he: 'טיפול בתזונה הוליסטית טבעית וצמחי מרפא',
    kenyon_price: 9,
    full_price: null,
    images: ['/images/products/ke-live-deal-10.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-reflexology',
    slug: 'אבחון-ואבחוןטיפול-רפסולוגי',
    name_he: 'אבחון וטיפול רפסולוגי',
    kenyon_price: 9,
    full_price: null,
    images: ['/images/products/ke-live-deal-11.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-facial',
    slug: 'עיסוי-מאסטר',
    name_he: 'טיפול פנים',
    kenyon_price: 99,
    full_price: 150,
    images: ['/images/products/ke-live-deal-12.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-massages',
    slug: 'עיסוי-מפנק-לגבר-45-דקות-רק-ב108₪',
    name_he: 'מבחר עיסויים לבחירה',
    kenyon_price: 20,
    full_price: null,
    images: ['/images/products/ke-live-deal-13.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-master-massage',
    slug: 'עיסוי-משולב-מפנק-לגבר-רק-108₪',
    name_he: 'עיסוי מאסטר',
    kenyon_price: 9,
    full_price: null,
    images: ['/images/products/ke-live-deal-14.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-master-zimmer',
    slug: 'צימר-מאסטר',
    name_he: '! צימר מאסטר',
    kenyon_price: 699,
    full_price: 899,
    images: ['/images/products/ke-live-deal-15.avif'],
    stock_quantity: 1,
    category: { name_he: 'צימרים מלונות ונופש', slug: 'vacation' },
  },
  {
    id: 'ke-deal-cosmetician',
    slug: 'קוסמטיקאית',
    name_he: 'קוסמטיקאית. אזל המלאי',
    kenyon_price: 99,
    full_price: 149,
    images: ['/images/products/ke-live-deal-16.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-pamper-massage',
    slug: 'עיסוי-מפנק',
    name_he: 'עיסוי מפנק',
    kenyon_price: 249,
    full_price: null,
    images: ['/images/products/ke-live-deal-17.avif'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-master-product',
    slug: 'restaurants-meat-3',
    name_he: 'מוצר ראשי מאסטר Master Product',
    kenyon_price: 1,
    full_price: 400,
    images: ['/images/products/ke-live-deal-18.avif'],
    stock_quantity: 1,
    category: { name_he: 'מסעדות ובתי קפה', slug: 'restaurants-cafes' },
  },
  {
    id: 'ke-deal-restaurant-meat',
    slug: 'restaurants-meat-2',
    name_he: 'בשר במסעדה',
    kenyon_price: null,
    full_price: null,
    images: ['/images/products/ke-live-deal-19.jpg'],
    stock_quantity: 1,
    category: { name_he: 'מסעדות ובתי קפה', slug: 'restaurants-cafes' },
  },
  {
    id: 'ke-deal-fb-campaign',
    slug: 'bar-drink',
    name_he: 'קמפיין ענק בפייסבוק',
    kenyon_price: 999,
    full_price: 1600,
    images: ['/images/products/ke-live-deal-20.avif'],
    stock_quantity: 1,
    category: { name_he: 'בעלי מקצוע', slug: 'professionals' },
  },
  {
    id: 'ke-deal-maldives-vacation',
    slug: 'island-of-maldives',
    name_he: 'חופשה במלדיבים',
    kenyon_price: 2000,
    full_price: null,
    images: ['/images/products/ke-live-deal-21.avif'],
    stock_quantity: 1,
    category: { name_he: 'צימרים מלונות ונופש', slug: 'vacation' },
  },
  {
    id: 'ke-deal-maldives-flight',
    slug: 'travelling-to-the-island-of-maldives',
    name_he: 'טיסה למלדיבים',
    kenyon_price: 800,
    full_price: 1000,
    images: ['/images/products/ke-live-deal-22.avif'],
    stock_quantity: 1,
    category: { name_he: 'צימרים מלונות ונופש', slug: 'vacation' },
  },
  {
    id: 'ke-deal-baby-kit',
    slug: 'pampers-premium-care-diaper-pants-medium',
    name_he: 'מארז מפנק לתינוק',
    kenyon_price: 150,
    full_price: 200,
    images: ['/images/products/ke-live-deal-23.avif'],
    stock_quantity: 1,
    category: { name_he: 'תינוקות וילדים', slug: 'baby-kids' },
  },
  {
    id: 'ke-deal-meat-meal',
    slug: 'barbecue-2',
    name_he: 'ארוחה בשרית',
    kenyon_price: 180,
    full_price: 199,
    images: ['/images/products/ke-live-deal-24.avif'],
    stock_quantity: 1,
    category: { name_he: 'מסעדות ובתי קפה', slug: 'restaurants-cafes' },
  },
  {
    id: 'ke-deal-meat-restaurant',
    slug: 'barbecue',
    name_he: 'מסעדה בשרית',
    kenyon_price: 99,
    full_price: null,
    images: ['/images/products/ke-live-deal-25.avif'],
    stock_quantity: 1,
    category: { name_he: 'מסעדות ובתי קפה', slug: 'restaurants-cafes' },
  },
  {
    id: 'ke-deal-hotel-tiberias',
    slug: 'מלון-5-כוכבים-בטבריה',
    name_he: 'מלון 5 כוכבים בטבריה',
    kenyon_price: 480,
    full_price: null,
    images: ['/images/products/ke-live-deal-26.avif'],
    stock_quantity: 1,
    category: { name_he: 'כללי', slug: 'general' },
  },
  {
    id: 'ke-deal-iphone-13',
    slug: 'אייפון-13',
    name_he: 'אייפון 13',
    kenyon_price: 800,
    full_price: 1000,
    images: ['/images/products/ke-live-deal-27.avif'],
    stock_quantity: 1,
    category: { name_he: 'טלפונים מחשבים ואביזרים', slug: 'phones-computers' },
  },
  {
    id: 'ke-deal-galaxy-s22',
    slug: 'samsung-galaxy-s22-128gb-samsung-galaxy-s22-128gb-5g',
    name_he: 'סמסונג גלקסי Samsung Galaxy S22 128GB- 5G',
    kenyon_price: 1800,
    full_price: 2100,
    images: ['/images/products/ke-live-deal-28.avif'],
    stock_quantity: 1,
    category: { name_he: 'טלפונים מחשבים ואביזרים', slug: 'phones-computers' },
  },
  {
    id: 'ke-deal-hotel-4-stars',
    slug: 'מלון-4-כוכבים-פלוס-ארוחת-בוקר',
    name_he: 'מלון 4 כוכבים- פלוס ארוחת בוקר',
    kenyon_price: 300,
    full_price: 350,
    images: ['/images/products/ke-live-deal-29.avif'],
    stock_quantity: 1,
    category: { name_he: 'כללי', slug: 'general' },
  },
  {
    id: 'ke-deal-airpods-3',
    slug: 'אוזניות-איירפודס-3',
    name_he: 'אוזניות AirPods 3',
    kenyon_price: 600,
    full_price: 675,
    images: ['/images/products/ke-live-deal-30.avif'],
    stock_quantity: 1,
    category: { name_he: 'כללי', slug: 'general' },
  },
  {
    id: 'ke-deal-cafe-breakfast',
    slug: 'ארוחת-בוקר-זוגית-בקפה-קפה',
    name_he: 'ארוחת בוקר זוגית בקפה קפה',
    kenyon_price: 90,
    full_price: 110,
    images: ['/images/products/ke-live-deal-31.avif'],
    stock_quantity: 1,
    category: { name_he: 'כללי', slug: 'general' },
  },
]
