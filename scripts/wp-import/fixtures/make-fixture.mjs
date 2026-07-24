#!/usr/bin/env node
// Write a small synthetic WooCommerce export into wp_import/raw/, so the whole
// pipeline can be exercised offline without touching the live store.
//
//   node scripts/wp-import/fixtures/make-fixture.mjs
//   node scripts/wp-import/run.mjs
//
// The fixture is deliberately dirty. It carries the failure modes we know the
// real catalog has, so a green run against it means something:
//
//   * percent-encoded Hebrew slugs
//   * Gutenberg comments, shortcodes and a <script> tag in post_content
//   * a sale price above the regular price (not a discount)
//   * a product with no price
//   * a product with no category
//   * a product referencing an attachment that does not exist
//   * two products that normalize to the same slug
//   * a trashed product that must not be imported
//   * a customer with a broken email
//   * a customer whose meta contains a password hash

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PATHS } from '../config.mjs'

const enc = (s) => encodeURIComponent(s).toLowerCase()

const categories = [
  { id: 10, name: 'מסעדות', slug: enc('מסעדות'), parent: 0, description: 'קופונים למסעדות', count: 3, menu_order: 1, image: { id: 900, src: 'https://kenyonexpress.co.il/wp-content/uploads/2024/01/rest-300x200.jpg', alt: 'מסעדות' } },
  { id: 11, name: 'סושי', slug: enc('סושי'), parent: 10, description: '', count: 2, menu_order: 2, image: null },
  { id: 12, name: 'Electronics', slug: 'electronics', parent: 0, description: '<p>Gadgets</p>', count: 1, menu_order: 3, image: null },
]

const image = (id, name) => ({
  id,
  src: `https://kenyonexpress.co.il/wp-content/uploads/2024/03/${name}-1024x768.jpg`,
  name,
  alt: name,
  mime_type: 'image/jpeg',
  width: 1024,
  height: 768,
  date_created_gmt: '2024-03-01T09:00:00',
})

const products = [
  {
    id: 101,
    name: 'שובר לסושי בר',
    slug: enc('שובר-לסושי'),
    permalink: `https://kenyonexpress.co.il/product/${enc('שובר-לסושי')}/`,
    type: 'simple',
    status: 'publish',
    description: '<!-- wp:paragraph --><div class="vc_row"><p>ארוחה זוגית <b>מלאה</b> במסעדת הסושי.</p></div><!-- /wp:paragraph -->[vc_button]<script>track()</script>',
    short_description: '<p>ארוחה זוגית</p>',
    sku: 'SUSHI-01',
    price: '99',
    regular_price: '199',
    sale_price: '99',
    stock_status: 'instock',
    stock_quantity: 50,
    manage_stock: 'yes',
    virtual: 'yes',
    categories: [{ id: 11, name: 'סושי', slug: enc('סושי') }, { id: 10, name: 'מסעדות', slug: enc('מסעדות') }],
    tags: [{ name: 'זוגי' }],
    images: [image(901, 'sushi-main'), image(902, 'sushi-gallery')],
    total_sales: 240,
    date_created_gmt: '2024-03-01T09:00:00',
    date_modified_gmt: '2025-01-11T12:00:00',
    meta_data: [{ key: '_yoast_wpseo_title', value: 'שובר לסושי בר | קניון אקספרס' }],
  },
  {
    // same normalized slug as 101: exercises deterministic collision suffixes
    id: 102,
    name: 'שובר לסושי',
    slug: enc('שובר-לסושי'),
    permalink: `https://kenyonexpress.co.il/product/${enc('שובר-לסושי')}-2/`,
    type: 'simple',
    status: 'publish',
    description: '<p>שובר נוסף</p>',
    sku: 'SUSHI-02',
    price: '120',
    regular_price: '120',
    sale_price: '',
    stock_status: 'instock',
    categories: [{ id: 11, name: 'סושי', slug: enc('סושי') }],
    images: [image(903, 'sushi-two')],
    date_created_gmt: '2024-04-01T09:00:00',
    meta_data: [],
  },
  {
    // sale price ABOVE regular: must NOT produce a strike-through
    id: 103,
    name: 'אוזניות אלחוטיות',
    slug: 'wireless-headphones',
    permalink: 'https://kenyonexpress.co.il/product/wireless-headphones/',
    type: 'simple',
    status: 'publish',
    description: '<p>Bluetooth 5.3</p>',
    sku: 'HP-01',
    price: '349',
    regular_price: '349',
    sale_price: '399',
    stock_status: 'instock',
    categories: [{ id: 12, name: 'Electronics', slug: 'electronics' }],
    images: [image(904, 'headphones')],
    date_created_gmt: '2024-05-01T09:00:00',
    meta_data: [],
  },
  {
    // no parseable price: must be forced to draft, never active
    id: 104,
    name: 'מוצר בלי מחיר',
    slug: 'no-price-item',
    permalink: 'https://kenyonexpress.co.il/product/no-price-item/',
    type: 'simple',
    status: 'publish',
    description: '<p>?</p>',
    price: '',
    regular_price: '',
    sale_price: '',
    stock_status: 'instock',
    categories: [{ id: 12, name: 'Electronics', slug: 'electronics' }],
    images: [image(905, 'mystery')],
    date_created_gmt: '2024-06-01T09:00:00',
    meta_data: [],
  },
  {
    // no category at all
    id: 105,
    name: 'מוצר יתום',
    slug: 'orphan-item',
    permalink: 'https://kenyonexpress.co.il/product/orphan-item/',
    type: 'simple',
    status: 'publish',
    description: '<p>no category</p>',
    price: '49',
    regular_price: '49',
    stock_status: 'instock',
    categories: [],
    images: [],
    date_created_gmt: '2024-06-15T09:00:00',
    meta_data: [],
  },
  {
    // out of stock: projects as sold_out, not active
    id: 106,
    name: 'אזל מהמלאי',
    slug: 'sold-out-item',
    permalink: 'https://kenyonexpress.co.il/product/sold-out-item/',
    type: 'simple',
    status: 'publish',
    description: '<p>gone</p>',
    price: '75',
    regular_price: '75',
    stock_status: 'outofstock',
    categories: [{ id: 10, name: 'מסעדות', slug: enc('מסעדות') }],
    images: [image(906, 'empty')],
    date_created_gmt: '2024-07-01T09:00:00',
    meta_data: [],
  },
  {
    // trashed: must never reach the catalog
    id: 107,
    name: 'נמחק',
    slug: 'deleted-item',
    type: 'simple',
    status: 'trash',
    description: '',
    price: '10',
    regular_price: '10',
    categories: [{ id: 12, name: 'Electronics', slug: 'electronics' }],
    images: [],
    date_created_gmt: '2023-01-01T09:00:00',
    meta_data: [],
  },
]

const customers = [
  {
    id: 501,
    email: 'Dana@Example.co.il ',
    first_name: 'דנה',
    last_name: 'לוי',
    display_name: 'דנה לוי',
    date_created_gmt: '2023-05-01T10:00:00',
    billing: { phone: '+972-54-123 4567', email: 'dana@example.co.il', city: 'תל אביב' },
    shipping: {},
    is_paying_customer: true,
    orders_count: 3,
    total_spent: '540.00',
    meta_data: [
      { key: 'newsletter_optin', value: 'yes' },
      // must be stripped before staging: a hash in the archive is an incident
      { key: 'user_pass', value: '$P$Bx9kJ2fakehashvalue' },
    ],
  },
  {
    id: 502,
    email: 'not-an-email',
    first_name: 'יוסי',
    last_name: '',
    date_created_gmt: '2024-02-01T10:00:00',
    billing: { phone: '03-1234567' },
    shipping: {},
    meta_data: [],
  },
]

const orders = [
  {
    id: 9001,
    number: '9001',
    status: 'completed',
    currency: 'ILS',
    customer_id: 501,
    date_created_gmt: '2024-08-01T18:00:00',
    date_paid_gmt: '2024-08-01T18:01:00',
    date_completed_gmt: '2024-08-01T18:05:00',
    total: '199.00',
    total_tax: '0',
    shipping_total: '0',
    discount_total: '0',
    payment_method: 'cardcom',
    payment_method_title: 'Cardcom',
    transaction_id: 'TXN-11223',
    billing: { email: 'dana@example.co.il', phone: '0541234567', first_name: 'דנה' },
    shipping: {},
    line_items: [
      { id: 70001, type: 'line_item', name: 'שובר לסושי בר', product_id: 101, quantity: 1, subtotal: '199.00', total: '199.00', tax: '0' },
    ],
    refunds: [],
    meta_data: [],
  },
]

const coupons = [
  { id: 8001, code: 'WELCOME10', status: 'publish', discount_type: 'percent', amount: '10', usage_limit: null, usage_count: 42, date_expires: '2025-12-31T00:00:00', meta_data: [] },
]

function writePage(entity, rows) {
  const file = resolve(PATHS.raw, `${entity}_page_0001.json`)
  writeFileSync(
    file,
    `${JSON.stringify({ entity, page: 1, fetched_at: '2026-07-24T00:00:00.000Z', source: { fixture: true }, rows }, null, 2)}\n`,
  )
  process.stdout.write(`  ${entity.padEnd(10)} ${String(rows.length).padStart(3)} rows -> ${file}\n`)
}

for (const dir of Object.values(PATHS)) mkdirSync(dir, { recursive: true })

// product 101 references attachment 999, which is in no media inventory: the
// missing-image gate must catch it.
products[0].gallery_missing = true
products[0].images.push({ id: 999, src: '', name: 'ghost' })

process.stdout.write('writing fixture\n')
writePage('category', categories)
writePage('product', products)
writePage('customer', customers)
writePage('order', orders)
writePage('coupon', coupons)
process.stdout.write('done. now run: node scripts/wp-import/run.mjs transform\n')
