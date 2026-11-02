#!/usr/bin/env node
/**
 * C148: the single source of the deal master templates.
 *
 * Writes:
 *   src/lib/deal-templates/masters.json        (read by the admin + tests)
 *   migrations/pending/328_deal_templates.sql  (table + seed, idempotent)
 *
 * Every master carries ONLY the fields its deal type needs. The fields every
 * deal shares (title, price, gallery, supplier block, legal block ...) live in
 * src/lib/deal-templates/common.ts and are not repeated per row.
 *
 * Field types: text | textarea | int | money | select | multiselect | bool | list | date
 *   money  - admin types whole shekels, stored as integer agorot (`<key>_agorot`)
 *   list   - free list of short strings (one per line)
 *
 * Run: node scripts/deal-templates/build-masters.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// --- field helpers -----------------------------------------------------------
const f = (key, label, type, extra = {}) => ({ key, label, type, ...extra })
const req = (field) => ({ ...field, required: true })

const CONDITION = ['חדש', 'מחודש', 'משומש']
const KOSHER = ['לא כשר', 'כשר', 'כשר למהדרין']
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const STORAGE = ['64', '128', '256', '512', '1024', '2048']
const DURATIONS = ['30', '45', '60', '75', '90', '120']
const BOARD = ['לינה בלבד', 'לינה וארוחת בוקר', 'חצי פנסיון', 'פנסיון מלא', 'הכל כלול']
const REGIONS = ['צפון', 'גליל וגולן', 'מרכז', 'שרון', 'ירושלים והסביבה', 'דרום', 'ים המלח', 'אילת']
const ANIMALS = ['כלב', 'חתול', 'ציפור', 'מכרסם', 'דגים', 'אחר']

const brand = (opts) =>
  opts ? f('brand', 'מותג', 'select', { options: opts }) : f('brand', 'מותג', 'text')
const model = () => req(f('model', 'דגם', 'text'))
const color = () => f('color', 'צבע', 'text')
const warranty = (def = 12) =>
  req(f('warranty_months', 'אחריות (חודשים)', 'int', { min: 0, max: 120, default: def }))
const condition = () =>
  req(f('condition', 'מצב המוצר', 'select', { options: CONDITION, default: 'חדש' }))
const accessories = () => f('included_accessories', 'אביזרים כלולים באריזה', 'list')
const importer = () =>
  req(
    f('import_type', 'סוג יבוא', 'select', {
      options: ['יבואן רשמי', 'יבוא מקביל', 'לא רלוונטי'],
      default: 'יבואן רשמי',
    }),
  )
const duration = (def = '60') =>
  req(f('duration_min', 'משך הטיפול (דקות)', 'select', { options: DURATIONS, default: def }))
const booking = () => f('booking_required', 'נדרש תיאום מראש', 'bool', { default: true })
const bring = () => f('what_to_bring', 'מה להביא', 'textarea')
const kosher = () => req(f('kosher', 'כשרות', 'select', { options: KOSHER }))
const validDays = () => f('valid_days', 'ימים בהם השובר תקף', 'multiselect', { options: WEEKDAYS })
const minAge = (def) => f('min_age', 'גיל מינימום', 'int', { min: 0, max: 99, default: def })

// --- masters -----------------------------------------------------------------
const P = 'physical'
const C = 'coupon'

const masters = [
  // ---------- phones, computers, electronics ----------
  {
    slug: 'iphone',
    name_he: 'אייפון',
    product_type: P,
    category_slug: 'phones-computers',
    fields: [
      req(
        f('model', 'דגם', 'select', {
          options: [
            'iPhone 13',
            'iPhone 13 Pro',
            'iPhone 14',
            'iPhone 14 Pro',
            'iPhone 15',
            'iPhone 15 Pro',
            'iPhone 15 Pro Max',
            'iPhone 16',
            'iPhone 16 Plus',
            'iPhone 16 Pro',
            'iPhone 16 Pro Max',
            'iPhone 16e',
            'iPhone 17',
            'iPhone 17 Pro',
            'iPhone 17 Pro Max',
            'iPhone Air',
          ],
        }),
      ),
      req(f('storage_gb', 'נפח אחסון (GB)', 'select', { options: STORAGE })),
      req(f('color', 'צבע', 'text')),
      warranty(12),
      condition(),
      accessories(),
      importer(),
    ],
    defaults: { included_accessories: ['כבל USB-C'] },
  },
  {
    slug: 'android-phone',
    name_he: 'טלפון אנדרואיד',
    product_type: P,
    category_slug: 'phones-computers',
    fields: [
      req(brand(['Samsung', 'Xiaomi', 'Google Pixel', 'OnePlus', 'Motorola', 'Oppo', 'אחר'])),
      model(),
      req(f('storage_gb', 'נפח אחסון (GB)', 'select', { options: STORAGE })),
      f('ram_gb', 'זיכרון RAM (GB)', 'int', { min: 1, max: 32 }),
      f('network', 'דור רשת', 'select', { options: ['4G', '5G'], default: '5G' }),
      f('dual_sim', 'תמיכה בשני כרטיסי SIM', 'bool'),
      color(),
      warranty(12),
      condition(),
      accessories(),
      importer(),
    ],
  },
  {
    slug: 'laptop',
    name_he: 'מחשב נייד',
    product_type: P,
    category_slug: 'phones-computers',
    fields: [
      req(brand(['Apple', 'Lenovo', 'Dell', 'HP', 'Asus', 'Acer', 'MSI', 'Microsoft', 'אחר'])),
      model(),
      req(f('cpu', 'מעבד', 'text')),
      req(f('ram_gb', 'זיכרון RAM (GB)', 'int', { min: 2, max: 256 })),
      req(f('storage_gb', 'נפח אחסון (GB)', 'select', { options: STORAGE })),
      f('storage_type', 'סוג אחסון', 'select', { options: ['SSD', 'HDD'], default: 'SSD' }),
      req(f('screen_inch', 'גודל מסך (אינץ׳)', 'text')),
      f('os', 'מערכת הפעלה', 'select', {
        options: ['macOS', 'Windows 11', 'ChromeOS', 'Linux', 'ללא'],
      }),
      f('hebrew_keyboard', 'מקלדת עברית', 'bool', { default: true }),
      color(),
      warranty(12),
      condition(),
      importer(),
    ],
  },
  {
    slug: 'tablet',
    name_he: 'טאבלט',
    product_type: P,
    category_slug: 'phones-computers',
    fields: [
      req(brand(['Apple', 'Samsung', 'Lenovo', 'Xiaomi', 'אחר'])),
      model(),
      req(f('storage_gb', 'נפח אחסון (GB)', 'select', { options: STORAGE })),
      req(f('screen_inch', 'גודל מסך (אינץ׳)', 'text')),
      req(f('connectivity', 'קישוריות', 'select', { options: ['Wi-Fi', 'Wi-Fi + סלולר'] })),
      color(),
      warranty(12),
      condition(),
      accessories(),
      importer(),
    ],
  },
  {
    slug: 'headphones',
    name_he: 'אוזניות',
    product_type: P,
    category_slug: 'electronics',
    fields: [
      req(brand(['Apple', 'Sony', 'Samsung', 'JBL', 'Bose', 'Beats', 'Sennheiser', 'אחר'])),
      model(),
      req(f('form_factor', 'סוג', 'select', { options: ['תוך אוזן', 'על האוזן', 'סביב האוזן'] })),
      req(
        f('connection', 'חיבור', 'select', { options: ['Bluetooth', 'חוטי', 'Bluetooth + חוטי'] }),
      ),
      f('noise_cancelling', 'סינון רעשים אקטיבי (ANC)', 'bool'),
      f('battery_hours', 'זמן סוללה (שעות)', 'int', { min: 0, max: 200 }),
      color(),
      warranty(12),
      condition(),
      importer(),
    ],
  },
  {
    slug: 'smartwatch',
    name_he: 'שעון חכם',
    product_type: P,
    category_slug: 'electronics',
    fields: [
      req(brand(['Apple', 'Samsung', 'Garmin', 'Xiaomi', 'Huawei', 'Amazfit', 'אחר'])),
      model(),
      f('case_size_mm', 'גודל מארז (מ״מ)', 'int', { min: 20, max: 60 }),
      req(f('compatible_os', 'תאימות', 'select', { options: ['iOS', 'Android', 'iOS ו-Android'] })),
      f('gps', 'GPS מובנה', 'bool'),
      f('water_resistance', 'עמידות במים', 'text'),
      color(),
      warranty(12),
      condition(),
      importer(),
    ],
  },
  {
    slug: 'speaker',
    name_he: 'רמקול נייד',
    product_type: P,
    category_slug: 'electronics',
    fields: [
      req(brand(['JBL', 'Sony', 'Bose', 'Marshall', 'Anker', 'אחר'])),
      model(),
      f('power_watt', 'הספק (ואט)', 'int', { min: 1, max: 2000 }),
      f('battery_hours', 'זמן סוללה (שעות)', 'int', { min: 0, max: 200 }),
      f('water_resistance', 'עמידות במים', 'text'),
      color(),
      warranty(12),
      importer(),
    ],
  },
  {
    slug: 'gaming-console',
    name_he: 'קונסולת משחקים',
    product_type: P,
    category_slug: 'electronics',
    fields: [
      req(brand(['Sony PlayStation', 'Microsoft Xbox', 'Nintendo', 'אחר'])),
      model(),
      req(f('edition', 'גרסה', 'select', { options: ['עם כונן דיסקים', 'דיגיטלית'] })),
      req(f('storage_gb', 'נפח אחסון (GB)', 'select', { options: STORAGE })),
      f('controllers_included', 'בקרים כלולים', 'int', { min: 0, max: 4, default: 1 }),
      f('included_games', 'משחקים כלולים', 'list'),
      warranty(12),
      condition(),
      importer(),
    ],
  },
  {
    slug: 'camera-drone',
    name_he: 'מצלמה / רחפן',
    product_type: P,
    category_slug: 'electronics',
    fields: [
      req(f('product_kind', 'סוג מוצר', 'select', { options: ['מצלמה', 'מצלמת אקשן', 'רחפן'] })),
      req(brand(['DJI', 'GoPro', 'Canon', 'Sony', 'Nikon', 'Insta360', 'אחר'])),
      model(),
      f('video_resolution', 'רזולוציית וידאו', 'select', {
        options: ['Full HD', '2.7K', '4K', '5K', '8K'],
      }),
      f('megapixels', 'מגה פיקסל', 'int', { min: 1, max: 200 }),
      f('battery_minutes', 'זמן סוללה / טיסה (דקות)', 'int', { min: 0, max: 600 }),
      accessories(),
      warranty(12),
      condition(),
      importer(),
    ],
  },
  {
    slug: 'power-accessories',
    name_he: 'מטענים וסוללות ניידות',
    product_type: P,
    category_slug: 'electronics',
    fields: [
      req(
        f('accessory_type', 'סוג', 'select', {
          options: ['סוללה ניידת', 'מטען קיר', 'מטען אלחוטי', 'כבל', 'מטען לרכב'],
        }),
      ),
      brand(),
      model(),
      f('capacity_mah', 'קיבולת (mAh)', 'int', { min: 0, max: 100000 }),
      f('output_watt', 'הספק טעינה (ואט)', 'int', { min: 0, max: 500 }),
      f('connectors', 'חיבורים', 'multiselect', {
        options: ['USB-C', 'USB-A', 'Lightning', 'MagSafe', 'Qi'],
      }),
      warranty(12),
    ],
  },
  {
    slug: 'computer-accessories',
    name_he: 'ציוד היקפי למחשב',
    product_type: P,
    category_slug: 'phones-computers',
    fields: [
      req(
        f('accessory_type', 'סוג', 'select', {
          options: ['מקלדת', 'עכבר', 'מסך', 'מצלמת רשת', 'תיק למחשב', 'מעמד', 'אחר'],
        }),
      ),
      brand(),
      model(),
      f('connection', 'חיבור', 'select', {
        options: ['USB', 'Bluetooth', 'אלחוטי 2.4GHz', 'לא רלוונטי'],
      }),
      f('keyboard_layout', 'פריסת מקלדת', 'select', {
        options: ['עברית/אנגלית', 'אנגלית בלבד', 'לא רלוונטי'],
      }),
      f('compatible_with', 'תואם ל', 'text'),
      color(),
      warranty(12),
    ],
  },
  // ---------- home ----------
  {
    slug: 'home-kitchen',
    name_he: 'כלי בית ומטבח',
    product_type: P,
    category_slug: 'hot-deals',
    fields: [
      req(f('product_kind', 'סוג מוצר', 'text')),
      brand(),
      f('model', 'דגם', 'text'),
      f('material', 'חומר', 'text'),
      f('set_items', 'מספר פריטים בסט', 'int', { min: 1, max: 200 }),
      f('dimensions_cm', 'מידות (ס״מ)', 'text'),
      f('dishwasher_safe', 'מתאים למדיח', 'bool'),
      f('induction_ready', 'מתאים לכיריים אינדוקציה', 'bool'),
      warranty(12),
    ],
  },
  {
    slug: 'home-textile',
    name_he: 'מצעים וטקסטיל לבית',
    product_type: P,
    category_slug: 'hot-deals',
    fields: [
      req(
        f('product_kind', 'סוג מוצר', 'select', {
          options: ['שמיכה', 'סט מצעים', 'כרית', 'מגבות', 'שטיח', 'אחר'],
        }),
      ),
      req(f('size', 'מידה', 'text')),
      f('material', 'בד / חומר', 'text'),
      f('fill_material', 'מילוי', 'text'),
      f('washing_instructions', 'הוראות כביסה', 'text'),
      color(),
    ],
  },
  {
    slug: 'home-lighting',
    name_he: 'תאורה לבית',
    product_type: P,
    category_slug: 'hot-deals',
    fields: [
      req(
        f('product_kind', 'סוג מוצר', 'select', {
          options: ['מנורת שולחן', 'מנורה עומדת', 'גוף תאורה', 'פס לד', 'נורה חכמה'],
        }),
      ),
      brand(),
      f('power_watt', 'הספק (ואט)', 'int', { min: 0, max: 1000 }),
      f('color_temperature_k', 'גוון אור (קלווין)', 'text'),
      f('dimmable', 'ניתן לעמעום', 'bool'),
      f('power_source', 'מקור מתח', 'select', { options: ['חשמל', 'סוללה נטענת', 'USB'] }),
      warranty(12),
    ],
  },
  {
    slug: 'bags-fashion',
    name_he: 'תיקים ואופנה',
    product_type: P,
    category_slug: 'hot-deals',
    fields: [
      req(
        f('product_kind', 'סוג מוצר', 'select', {
          options: ['תיק יד', 'תיק גב', 'תיק למחשב', 'ארנק', 'מזוודה', 'אחר'],
        }),
      ),
      brand(),
      req(f('material', 'חומר', 'text')),
      req(color()),
      f('dimensions_cm', 'מידות (ס״מ)', 'text'),
      f('laptop_fit_inch', 'מתאים למחשב עד (אינץ׳)', 'int', { min: 10, max: 18 }),
      warranty(6),
    ],
  },
  {
    slug: 'gift-box',
    name_he: 'מארז מתנה',
    product_type: P,
    category_slug: 'hot-deals',
    fields: [
      req(f('items_included', 'מה במארז', 'list')),
      f('occasion', 'מתאים ל', 'select', {
        options: ['לידה', 'יום הולדת', 'חג', 'זוגיות', 'תודה', 'כללי'],
      }),
      f('gift_wrap', 'עטיפת מתנה כלולה', 'bool', { default: true }),
      f('greeting_card', 'כרטיס ברכה אישי', 'bool'),
    ],
  },
  // ---------- baby & kids ----------
  {
    slug: 'baby-gear',
    name_he: 'ציוד לתינוקות',
    product_type: P,
    category_slug: 'baby-kids',
    fields: [
      req(
        f('product_kind', 'סוג מוצר', 'select', {
          options: [
            'עגלה',
            'כיסא בטיחות לרכב',
            'מיטה / עריסה',
            'כיסא אוכל',
            'מנשא',
            'משאבת חלב',
            'אחר',
          ],
        }),
      ),
      brand(),
      f('model', 'דגם', 'text'),
      req(f('age_range', 'טווח גילאים', 'text')),
      f('max_weight_kg', 'משקל ילד מקסימלי (ק״ג)', 'int', { min: 0, max: 50 }),
      req(f('safety_standard', 'תקן בטיחות', 'text', { default: 'תקן ישראלי' })),
      color(),
      warranty(12),
      importer(),
    ],
  },
  {
    slug: 'baby-consumables',
    name_he: 'חיתולים ומוצרי היגיינה לתינוק',
    product_type: P,
    category_slug: 'baby-kids',
    fields: [
      req(brand(['Pampers', 'Huggies', 'טיטולים', 'אחר'])),
      f('product_line', 'סדרה', 'text'),
      req(f('size', 'מידה', 'text')),
      f('weight_range_kg', 'טווח משקל (ק״ג)', 'text'),
      req(f('units_per_pack', 'יחידות באריזה', 'int', { min: 1, max: 1000 })),
      f('packs', 'מספר אריזות', 'int', { min: 1, max: 50, default: 1 }),
      f('expiry_date', 'תאריך תפוגה', 'date'),
    ],
  },
  {
    slug: 'kids-toys',
    name_he: 'צעצועים לילדים',
    product_type: P,
    category_slug: 'baby-kids',
    fields: [
      brand(),
      req(f('age_min_years', 'גיל מינימלי (שנים)', 'int', { min: 0, max: 18 })),
      f('age_max_years', 'גיל מקסימלי (שנים)', 'int', { min: 0, max: 99 }),
      f('material', 'חומר', 'text'),
      f('pieces', 'מספר חלקים', 'int', { min: 1, max: 10000 }),
      f('batteries_required', 'דורש סוללות', 'bool'),
      req(f('safety_standard', 'תקן בטיחות', 'text', { default: 'תקן ישראלי 562' })),
      f('small_parts_warning', 'אזהרת חלקים קטנים (מתחת לגיל 3)', 'bool'),
    ],
  },
  // ---------- pets ----------
  {
    slug: 'pet-food',
    name_he: 'מזון לחיות מחמד',
    product_type: P,
    category_slug: 'pets',
    fields: [
      req(brand()),
      req(f('animal', 'מתאים ל', 'select', { options: ANIMALS })),
      req(
        f('life_stage', 'שלב חיים', 'select', { options: ['גור', 'בוגר', 'מבוגר', 'כל הגילאים'] }),
      ),
      req(f('weight_kg', 'משקל אריזה (ק״ג)', 'text')),
      f('flavor', 'טעם', 'text'),
      f('special_diet', 'תזונה מיוחדת', 'multiselect', {
        options: ['ללא דגנים', 'היפואלרגני', 'דל שומן', 'מעוקרים', 'רפואי'],
      }),
      f('expiry_date', 'תאריך תפוגה', 'date'),
    ],
  },
  {
    slug: 'pet-gear',
    name_he: 'ציוד לחיות מחמד',
    product_type: P,
    category_slug: 'pets',
    fields: [
      req(
        f('product_kind', 'סוג מוצר', 'select', {
          options: [
            'מיטה',
            'רצועה / קולר',
            'כלוב / מנשא',
            'צעצוע',
            'קערה',
            'טיפוח',
            'חול לחתולים',
            'אחר',
          ],
        }),
      ),
      req(f('animal', 'מתאים ל', 'select', { options: ANIMALS })),
      f('size', 'מידה', 'select', { options: ['XS', 'S', 'M', 'L', 'XL', 'אחיד'] }),
      f('material', 'חומר', 'text'),
      f('dimensions_cm', 'מידות (ס״מ)', 'text'),
      color(),
    ],
  },
  {
    slug: 'general-physical',
    name_he: 'מוצר פיזי כללי',
    product_type: P,
    category_slug: null,
    fields: [
      brand(),
      f('model', 'דגם', 'text'),
      f('specs', 'מפרט', 'list'),
      warranty(12),
      condition(),
      importer(),
    ],
  },

  // ---------- food ----------
  {
    slug: 'restaurant',
    name_he: 'דיל מסעדה',
    product_type: C,
    category_slug: 'restaurants-cafes',
    fields: [
      req(
        f('meal_type', 'סוג הארוחה', 'select', {
          options: [
            'ארוחת צהריים',
            'ארוחת ערב',
            'ארוחה עסקית',
            'ארוחה זוגית',
            'ארוחה משפחתית',
            'ארוחת שף',
            'בופה',
          ],
        }),
      ),
      req(f('max_diners', 'מספר סועדים', 'int', { min: 1, max: 30, default: 2 })),
      req(f('menu_includes', 'מה כלול בתפריט', 'list')),
      kosher(),
      f('cuisine', 'סוג מטבח', 'select', {
        options: ['בשרי', 'חלבי', 'דגים', 'טבעוני', 'איטלקי', 'אסייתי', 'ים תיכוני', 'אחר'],
      }),
      f('drinks_included', 'שתייה כלולה', 'bool'),
      booking(),
      validDays(),
    ],
  },
  {
    slug: 'cafe',
    name_he: 'דיל בית קפה',
    product_type: C,
    category_slug: 'restaurants-cafes',
    fields: [
      req(
        f('meal_type', 'סוג הדיל', 'select', {
          options: ['ארוחת בוקר', 'בראנץ׳', 'קפה ומאפה', 'ארוחת בוקר זוגית'],
        }),
      ),
      req(f('max_diners', 'מספר סועדים', 'int', { min: 1, max: 10, default: 2 })),
      req(f('menu_includes', 'מה כלול', 'list')),
      kosher(),
      f('valid_hours', 'שעות מימוש', 'text', { default: 'עד 12:00' }),
      booking(),
      validDays(),
    ],
  },
  {
    slug: 'dessert-icecream',
    name_he: 'גלידה וקינוחים',
    product_type: C,
    category_slug: 'restaurants-cafes',
    fields: [
      req(f('package_kind', 'סוג החבילה', 'text')),
      req(f('servings', 'מספר מנות', 'int', { min: 1, max: 50 })),
      f('flavors_choice', 'בחירת טעמים', 'text'),
      kosher(),
      f('takeaway', 'אפשרות לקחת הביתה', 'bool'),
    ],
  },
  {
    slug: 'bar-cocktails',
    name_he: 'בר וקוקטיילים',
    product_type: C,
    category_slug: 'restaurants-cafes',
    fields: [
      req(f('drinks_count', 'מספר משקאות', 'int', { min: 1, max: 20 })),
      req(f('max_guests', 'מספר אורחים', 'int', { min: 1, max: 20, default: 2 })),
      f('includes_food', 'כולל מנה / נשנושים', 'bool'),
      req(minAge(18)),
      f('valid_hours', 'שעות מימוש', 'text'),
      booking(),
      validDays(),
    ],
    defaults: { min_age: 18 },
  },

  // ---------- wellness & beauty ----------
  {
    slug: 'massage',
    name_he: 'עיסוי',
    product_type: C,
    category_slug: 'beauty-health',
    fields: [
      duration('60'),
      req(
        f('treatment_type', 'סוג העיסוי', 'select', {
          options: [
            'שוודי',
            'רקמות עמוק',
            'תאילנדי',
            'אבנים חמות',
            'רפואי',
            'ספורט',
            'הריון',
            'שיאצו',
            'לבחירה',
          ],
        }),
      ),
      f('couple', 'עיסוי זוגי', 'bool'),
      f('therapist_gender', 'מטפל/ת', 'select', {
        options: ['לבחירה', 'מטפל', 'מטפלת'],
        default: 'לבחירה',
      }),
      bring(),
      booking(),
    ],
    defaults: { what_to_bring: 'בגדים נוחים. מגבות וחלוק מסופקים במקום.' },
  },
  {
    slug: 'spa',
    name_he: 'יום ספא',
    product_type: C,
    category_slug: 'beauty-health',
    fields: [
      req(f('package_name', 'שם החבילה', 'text')),
      duration('120'),
      req(f('treatments_included', 'טיפולים כלולים', 'list')),
      f('facilities', 'מתקנים', 'multiselect', {
        options: ['בריכה', 'ג׳קוזי', 'סאונה יבשה', 'סאונה רטובה', 'חמאם', 'חדר מנוחה', 'חדר כושר'],
      }),
      f('couple', 'חבילה זוגית', 'bool'),
      f('meal_included', 'כולל ארוחה / כיבוד', 'bool'),
      minAge(16),
      bring(),
      booking(),
    ],
    defaults: { what_to_bring: 'בגד ים וכפכפים. חלוק ומגבת מסופקים במקום.' },
  },
  {
    slug: 'beauty-treatment',
    name_he: 'טיפול יופי',
    product_type: C,
    category_slug: 'beauty-health',
    fields: [
      req(
        f('treatment_type', 'סוג הטיפול', 'select', {
          options: [
            'טיפול פנים',
            'מניקור',
            'פדיקור',
            'עיצוב גבות',
            'הרמת ריסים',
            'איפור',
            'פילינג',
            'אחר',
          ],
        }),
      ),
      duration('60'),
      f('sessions', 'מספר טיפולים', 'int', { min: 1, max: 20, default: 1 }),
      f('products_used', 'מוצרים בשימוש', 'text'),
      f('suitable_for', 'מתאים ל', 'text'),
      booking(),
    ],
  },
  {
    slug: 'laser-hair-removal',
    name_he: 'הסרת שיער בלייזר',
    product_type: C,
    category_slug: 'beauty-health',
    fields: [
      req(
        f('treatment_areas', 'אזורי טיפול', 'multiselect', {
          options: ['פנים', 'בית שחי', 'ידיים', 'רגליים', 'מפשעה', 'גב', 'בטן', 'גוף מלא'],
        }),
      ),
      req(f('sessions', 'מספר טיפולים', 'int', { min: 1, max: 30, default: 6 })),
      f('device_type', 'סוג המכשיר', 'text'),
      f('gender', 'מתאים ל', 'select', { options: ['נשים', 'גברים', 'נשים וגברים'] }),
      f('consultation_included', 'פגישת ייעוץ ובדיקת רגישות כלולה', 'bool', { default: true }),
      booking(),
    ],
  },
  {
    slug: 'hair-barber',
    name_he: 'מספרה וברבר',
    product_type: C,
    category_slug: 'beauty-health',
    fields: [
      req(
        f('service_type', 'שירות', 'multiselect', {
          options: ['תספורת גבר', 'תספורת אישה', 'תספורת ילד', 'סידור זקן', 'צבע', 'פן', 'החלקה'],
        }),
      ),
      f('duration_min', 'משך (דקות)', 'int', { min: 10, max: 300 }),
      f('stylist_level', 'רמת הספר/ית', 'select', {
        options: ['ספר/ית', 'ספר/ית בכיר/ה', 'בעל/ת המספרה'],
      }),
      booking(),
    ],
  },
  {
    slug: 'alternative-medicine',
    name_he: 'רפואה משלימה',
    product_type: C,
    category_slug: 'beauty-health',
    fields: [
      req(
        f('therapy_type', 'סוג הטיפול', 'select', {
          options: [
            'רפלקסולוגיה',
            'נטורופתיה',
            'תזונה הוליסטית',
            'דיקור סיני',
            'שיאצו',
            'הומאופתיה',
            'אחר',
          ],
        }),
      ),
      duration('60'),
      f('sessions', 'מספר מפגשים', 'int', { min: 1, max: 20, default: 1 }),
      f('includes_diagnosis', 'כולל אבחון', 'bool'),
      f('practitioner_certification', 'הסמכת המטפל/ת', 'text'),
      booking(),
    ],
  },
  {
    slug: 'fitness-yoga',
    name_he: 'כושר ויוגה',
    product_type: C,
    category_slug: 'beauty-health',
    fields: [
      req(
        f('class_type', 'סוג האימון', 'select', {
          options: ['יוגה', 'פילאטיס', 'אימון אישי', 'סטודיו', 'חדר כושר', 'אחר'],
        }),
      ),
      req(f('format', 'מתכונת', 'select', { options: ['פרטי', 'קבוצתי', 'זוגי'] })),
      duration('60'),
      f('sessions', 'מספר מפגשים', 'int', { min: 1, max: 100, default: 1 }),
      f('level', 'רמה', 'select', {
        options: ['מתחילים', 'מתקדמים', 'כל הרמות'],
        default: 'כל הרמות',
      }),
      f('equipment_provided', 'ציוד מסופק', 'bool'),
      bring(),
      booking(),
    ],
  },

  // ---------- vacation ----------
  {
    slug: 'tzimmer',
    name_he: 'צימר',
    product_type: C,
    category_slug: 'vacation',
    fields: [
      req(f('nights', 'מספר לילות', 'int', { min: 1, max: 14, default: 1 })),
      req(f('max_guests', 'מספר אורחים מקסימלי', 'int', { min: 1, max: 20, default: 2 })),
      req(
        f('checkin_checkout', 'שעות כניסה ויציאה', 'text', { default: 'כניסה 15:00, יציאה 11:00' }),
      ),
      req(
        f('amenities', 'מתקנים', 'multiselect', {
          options: [
            'ג׳קוזי',
            'בריכה פרטית',
            'בריכה משותפת',
            'סאונה',
            'מטבחון',
            'מנגל',
            'Wi-Fi',
            'חניה',
            'נוף',
            'נגיש',
          ],
        }),
      ),
      req(f('weekend_price', 'מחיר לסוף שבוע (₪)', 'money')),
      f('breakfast_included', 'ארוחת בוקר כלולה', 'bool'),
      f('region', 'אזור', 'select', { options: REGIONS }),
      f('pets_allowed', 'מותר עם חיות מחמד', 'bool'),
      kosher(),
    ],
  },
  {
    slug: 'hotel',
    name_he: 'מלון',
    product_type: C,
    category_slug: 'vacation',
    fields: [
      req(f('stars', 'דירוג כוכבים', 'select', { options: ['3', '4', '5'] })),
      req(f('nights', 'מספר לילות', 'int', { min: 1, max: 30, default: 1 })),
      req(f('max_guests', 'מספר אורחים בחדר', 'int', { min: 1, max: 10, default: 2 })),
      req(
        f('board_basis', 'בסיס אירוח', 'select', { options: BOARD, default: 'לינה וארוחת בוקר' }),
      ),
      f('room_type', 'סוג חדר', 'text'),
      req(
        f('checkin_checkout', 'שעות כניסה ויציאה', 'text', { default: 'כניסה 15:00, יציאה 11:00' }),
      ),
      f('amenities', 'מתקנים', 'multiselect', {
        options: ['בריכה', 'ספא', 'חדר כושר', 'חוף פרטי', 'מועדון ילדים', 'Wi-Fi', 'חניה', 'נגיש'],
      }),
      f('weekend_price', 'מחיר לסוף שבוע (₪)', 'money'),
      f('region', 'אזור', 'select', { options: REGIONS }),
      kosher(),
    ],
  },
  {
    slug: 'vacation-package',
    name_he: 'חבילת נופש בחו״ל',
    product_type: C,
    category_slug: 'vacation',
    fields: [
      req(f('destination', 'יעד', 'text')),
      req(f('nights', 'מספר לילות', 'int', { min: 1, max: 60 })),
      req(f('travelers', 'מספר נוסעים', 'int', { min: 1, max: 10, default: 2 })),
      req(f('flights_included', 'טיסות כלולות', 'bool', { default: true })),
      f('departure_airport', 'שדה המראה', 'text', { default: 'נתב״ג' }),
      f('hotel_name', 'שם המלון', 'text'),
      f('hotel_stars', 'דירוג המלון', 'select', { options: ['3', '4', '5'] }),
      req(f('board_basis', 'בסיס אירוח', 'select', { options: BOARD })),
      f('luggage_kg', 'כבודה (ק״ג)', 'int', { min: 0, max: 50 }),
      f('departure_dates', 'תאריכי יציאה', 'list'),
      f('transfers_included', 'העברות משדה התעופה', 'bool'),
      f('insurance_included', 'ביטוח נסיעות כלול', 'bool'),
    ],
  },
  {
    slug: 'flight',
    name_he: 'טיסה',
    product_type: C,
    category_slug: 'vacation',
    fields: [
      req(f('destination', 'יעד', 'text')),
      req(f('trip_type', 'סוג', 'select', { options: ['הלוך ושוב', 'כיוון אחד'] })),
      f('airline', 'חברת תעופה', 'text'),
      f('departure_airport', 'שדה המראה', 'text', { default: 'נתב״ג' }),
      req(f('passengers', 'מספר נוסעים', 'int', { min: 1, max: 10, default: 1 })),
      f('luggage_kg', 'כבודה (ק״ג)', 'int', { min: 0, max: 50 }),
      f('departure_dates', 'תאריכי יציאה', 'list'),
    ],
  },
  {
    slug: 'organized-tour',
    name_he: 'טיול מאורגן',
    product_type: C,
    category_slug: 'vacation',
    fields: [
      req(f('destination', 'יעד', 'text')),
      req(f('days', 'מספר ימים', 'int', { min: 1, max: 60 })),
      f('group_size', 'גודל קבוצה מקסימלי', 'int', { min: 1, max: 100 }),
      f('guide_language', 'שפת ההדרכה', 'text', { default: 'עברית' }),
      req(f('includes', 'מה כלול', 'list')),
      f('flights_included', 'טיסות כלולות', 'bool'),
      f('departure_dates', 'תאריכי יציאה', 'list'),
    ],
  },

  // ---------- experiences, tickets, courses ----------
  {
    slug: 'attraction-tickets',
    name_he: 'כרטיסים לאטרקציות',
    product_type: C,
    category_slug: 'hot-deals',
    fields: [
      req(
        f('attraction_type', 'סוג', 'select', {
          options: ['פארק מים', 'פארק שעשועים', 'קולנוע', 'הופעה', 'מוזיאון', 'אחר'],
        }),
      ),
      req(f('tickets_count', 'מספר כרטיסים', 'int', { min: 1, max: 20, default: 1 })),
      f('age_restrictions', 'הגבלות גיל', 'text'),
      f('includes', 'כולל', 'list'),
      validDays(),
      booking(),
    ],
  },
  {
    slug: 'experience-tour',
    name_he: 'חוויה וסיור',
    product_type: C,
    category_slug: 'restaurants-cafes',
    fields: [
      req(
        f('experience_type', 'סוג החוויה', 'select', {
          options: ['סיור במזקקה', 'טעימות יין', 'סיור קולינרי', 'סדנה', 'אתגר / אקסטרים', 'אחר'],
        }),
      ),
      duration('90'),
      req(f('max_guests', 'מספר משתתפים', 'int', { min: 1, max: 50, default: 2 })),
      f('tasting_items', 'מספר טעימות', 'int', { min: 0, max: 50 }),
      minAge(18),
      f('language', 'שפה', 'text', { default: 'עברית' }),
      booking(),
    ],
  },
  {
    slug: 'workshop-course',
    name_he: 'סדנה וקורס',
    product_type: C,
    category_slug: 'courses',
    fields: [
      req(f('topic', 'נושא', 'text')),
      req(f('format', 'מתכונת', 'select', { options: ['פרונטלי', 'אונליין', 'משולב'] })),
      req(f('sessions', 'מספר מפגשים', 'int', { min: 1, max: 100, default: 1 })),
      f('duration_min', 'משך מפגש (דקות)', 'int', { min: 15, max: 600 }),
      f('max_participants', 'משתתפים מקסימום', 'int', { min: 1, max: 500 }),
      f('materials_included', 'חומרים כלולים', 'bool'),
      f('certificate', 'תעודה בסיום', 'bool'),
    ],
  },
  {
    slug: 'professional-service',
    name_he: 'שירות מקצועי',
    product_type: C,
    category_slug: 'professionals',
    fields: [
      req(f('service_type', 'סוג השירות', 'text')),
      req(f('scope', 'היקף השירות', 'textarea')),
      f('delivery_days', 'זמן ביצוע (ימים)', 'int', { min: 0, max: 365 }),
      f('service_area', 'אזור שירות', 'multiselect', { options: REGIONS }),
      f('includes', 'מה כלול', 'list'),
      f('revisions', 'מספר תיקונים', 'int', { min: 0, max: 50 }),
      f('license_number', 'מספר רישיון / תעודה', 'text'),
    ],
  },
  {
    slug: 'store-voucher',
    name_he: 'שובר קנייה בחנות',
    product_type: C,
    category_slug: 'hot-deals',
    fields: [
      req(f('voucher_value', 'שווי השובר (₪)', 'money')),
      req(f('store_type', 'סוג החנות', 'text')),
      f('branches', 'סניפים', 'list'),
      f('exclusions', 'החרגות', 'textarea'),
      f('partial_use', 'ניתן לממש בחלקים', 'bool'),
    ],
  },
  {
    slug: 'general-coupon',
    name_he: 'שובר כללי',
    product_type: C,
    category_slug: null,
    fields: [
      f('includes', 'מה כלול', 'list'),
      f('max_guests', 'מספר משתתפים', 'int', { min: 1, max: 50 }),
      booking(),
      validDays(),
    ],
  },
]

// --- sanity ------------------------------------------------------------------
const TYPES = new Set([
  'text',
  'textarea',
  'int',
  'money',
  'select',
  'multiselect',
  'bool',
  'list',
  'date',
])
const seen = new Set()
for (const m of masters) {
  if (seen.has(m.slug)) throw new Error(`duplicate slug ${m.slug}`)
  seen.add(m.slug)
  const keys = new Set()
  for (const fd of m.fields) {
    if (!TYPES.has(fd.type)) throw new Error(`${m.slug}.${fd.key}: bad type ${fd.type}`)
    if (keys.has(fd.key)) throw new Error(`${m.slug}: duplicate field ${fd.key}`)
    keys.add(fd.key)
    if ((fd.type === 'select' || fd.type === 'multiselect') && !fd.options?.length)
      throw new Error(`${m.slug}.${fd.key}: options missing`)
  }
  m.defaults = {
    ...(m.product_type === 'coupon'
      ? { validity_days: 90 }
      : { shipping_price_agorot: 0, supplier_transfer_days: 14, cancellation_window_days: 14 }),
    cashback_percent: 0,
    max_units_per_order: m.product_type === 'coupon' ? 10 : 5,
    ...Object.fromEntries(
      m.fields.filter((fd) => fd.default !== undefined).map((fd) => [fd.key, fd.default]),
    ),
    ...(m.defaults ?? {}),
  }
}

writeFileSync(
  resolve(root, 'src/lib/deal-templates/masters.json'),
  `${JSON.stringify(masters, null, 2)}\n`,
)

// --- migration -----------------------------------------------------------------
const q = (s) => (s == null ? 'null' : `'${String(s).replaceAll("'", "''")}'`)
const rows = masters
  .map(
    (m) =>
      `  (${q(m.slug)}, ${q(m.name_he)}, ${q(m.product_type)}, ${q(m.category_slug)}, ${q(JSON.stringify(m.fields))}::jsonb, ${q(JSON.stringify(m.defaults))}::jsonb, true)`,
  )
  .join(',\n')

const sql = `-- 328_deal_templates.sql (C148)
--
-- One master template per deal type. The admin wizard at
-- /admin/products/new (step 1) lists these; step 2 renders a form from
-- \`fields\` and pre-fills it from \`defaults\`. Admins can clone the closest
-- master into a new one (is_system = false, parent_slug = the source).
--
-- \`fields\` holds ONLY the type-specific fields. The fields every deal shares
-- (title, price, gallery, supplier block, legal block ...) are defined once in
-- src/lib/deal-templates/common.ts. Template values land in
-- products.attributes (jsonb, existing column). Money inside \`defaults\` is
-- integer agorot (*_agorot keys); no decimal money column exists here.
--
-- GENERATED by scripts/deal-templates/build-masters.mjs. Idempotent: the
-- table is created if missing and system rows are upserted by slug, so a
-- re-run refreshes the masters without touching admin-created ones.
-- Apply: supabase db query --linked -f migrations/pending/328_deal_templates.sql

create table if not exists public.deal_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_he text not null check (length(btrim(name_he)) between 2 and 80),
  product_type text not null check (product_type in ('coupon', 'physical')),
  category_slug text,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  defaults jsonb not null default '{}'::jsonb check (jsonb_typeof(defaults) = 'object'),
  is_system boolean not null default false,
  parent_slug text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.deal_templates is
  'C148 deal master templates: one per deal type, fields schema + defaults for the admin product wizard';

-- Staff-only: read and written through the service role behind requireSection('catalog').
alter table public.deal_templates enable row level security;
revoke all on public.deal_templates from anon, authenticated;

insert into public.deal_templates (slug, name_he, product_type, category_slug, fields, defaults, is_system)
values
${rows}
on conflict (slug) do update set
  name_he = excluded.name_he,
  product_type = excluded.product_type,
  category_slug = excluded.category_slug,
  fields = excluded.fields,
  defaults = excluded.defaults,
  updated_at = now()
where public.deal_templates.is_system;
`
writeFileSync(resolve(root, 'migrations/pending/328_deal_templates.sql'), sql)
console.log(
  `masters: ${masters.length} (coupon ${masters.filter((m) => m.product_type === C).length}, physical ${masters.filter((m) => m.product_type === P).length})`,
)
