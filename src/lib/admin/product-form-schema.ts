import { z } from 'zod'

/**
 * The product form's validation, lifted out of `src/server/actions/admin/products.ts`
 * on 2026-08-11. It lives here because a `'use server'` module may export only
 * async functions, which made the single most branch-heavy piece of logic in the
 * admin, the type-dependent refinements below, impossible to unit test. Nothing
 * about the rules changed in the move.
 */
export const productSchema = z
  .object({
    id: z.string().uuid().optional(),
    supplier_id: z.string().uuid().nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    slug: z
      .string()
      .min(2, 'קישור חייב להכיל לפחות 2 תווים')
      .regex(/^[a-z0-9-]+$/, 'קישור יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד'),
    name_he: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
    name_en: z.string().nullable().optional(),
    description_he: z.string().nullable().optional(),
    type: z.enum(['physical', 'coupon', 'recurring']),
    // Recurring only. The form types shekels; the column stores agorot, and the
    // conversion happens once, below, through money.ts. These three are named
    // for the form and are stripped from the row spread - `recurring_amount_ils`
    // is not a column at all, and the other two reach the row only through
    // buildProductMoneyWrite.
    recurring_amount_ils: z.coerce.number().positive().nullable().optional(),
    billing_interval: z.enum(['monthly', 'yearly']).nullable().optional(),
    billing_interval_count: z.coerce.number().int().min(1).nullable().optional(),
    kenyon_price: z.coerce.number().min(0, 'מחיר בקניון נדרש'),
    full_price: z.coerce.number().min(0).nullable().optional(),
    // CONTRADICTIONS C1: no default exists anywhere, on purpose. It is the only
    // split handle, and since 2026-07-27 it governs coupons too. A product
    // without it cannot be priced, so the storefront hides it rather than
    // guessing; that is why this is required rather than nullable.
    platform_percent: z.coerce
      .number({ invalid_type_error: 'עמלת פלטפורמה נדרשת' })
      .min(0, 'עמלה לא יכולה להיות שלילית')
      .max(100, 'עמלה לא יכולה לעלות על 100'),
    // The supplier's half. Sent so the admin can type either side; the pair is
    // completed and checked against 100 by completeSplitPair before it is
    // written, and the DB CHECK products_split_pair_sums_to_100 backs that up.
    supplier_split_percent: z.coerce.number().min(0).max(100).nullable().optional(),
    // Physical: reduces the on-site charge. Coupon: badge only, and recomputed
    // from the two prices so the page cannot quote a saving checkout will not
    // honour (ADMIN-ARCHITECTURE.md section 3.2).
    discount_percent: z.coerce.number().min(0).max(100).nullable().optional(),
    // Absolute shekel amount charged on this site for a coupon. Not a percent,
    // and no default: see lib/commerce/coupon-offer.ts for the bug that caused.
    coupon_price_ils: z.coerce.number().positive().nullable().optional(),
    offer_valid_until: z.string().nullable().optional(),
    is_coupon_enabled: z.coerce.boolean().default(false),
    // CONTRADICTIONS C7: coupon validity is a per-product field, 30/60/90 or any
    // other integer. No default: an unset value used to become a silent 90 days
    // in finalize, which is a consumer-facing promise nobody made. Required on a
    // coupon product, meaningless on a physical one.
    coupon_expiry_days: z.coerce
      .number({ invalid_type_error: 'תוקף קופון בימים נדרש' })
      .int('תוקף חייב להיות מספר שלם של ימים')
      .min(1, 'תוקף חייב להיות לפחות יום אחד')
      .nullable()
      .optional(),
    sku: z.string().nullable().optional(),
    stock_quantity: z.coerce.number().int().min(0).nullable().optional(),
    is_featured: z.coerce.boolean().default(false),
    status: z.enum(['draft', 'active', 'paused', 'archived']),
    // content/marketing (048)
    short_description_he: z.string().max(300, 'תיאור קצר עד 300 תווים').nullable().optional(),
    brand: z.string().nullable().optional(),
    highlights: z.array(z.string().min(1)).default([]),
    video_url: z.string().url('כתובת וידאו לא תקינה').nullable().optional(),
    barcode: z.string().nullable().optional(),
    // inventory (048)
    low_stock_threshold: z.coerce.number().int().min(0).default(5),
    max_per_order: z.coerce.number().int().min(1).nullable().optional(),
    // logistics (048)
    requires_shipping: z.coerce.boolean().default(true),
    whatsapp_enabled: z.coerce.boolean().default(false),
    weight_grams: z.coerce.number().int().min(0).nullable().optional(),
    // Millimetres, whole. The cm columns are superseded by migration 112 and
    // are no longer written; readDimensionMm still converts them for display.
    length_mm: z.coerce.number().int().positive().nullable().optional(),
    width_mm: z.coerce.number().int().positive().nullable().optional(),
    height_mm: z.coerce.number().int().positive().nullable().optional(),
    vat_exempt: z.coerce.boolean().default(false),
    tags: z.array(z.string().min(1)).default([]),
    warranty_months: z.coerce.number().int().min(0).nullable().optional(),
    condition: z.enum(['new', 'refurbished', 'used']).nullable().optional(),
    // coupon specifics (048)
    coupon_terms_he: z.string().nullable().optional(),
    redemption_instructions_he: z.string().nullable().optional(),
    min_purchase_ils: z.coerce.number().min(0).nullable().optional(),
    // SEO (048)
    seo_title: z.string().max(70, 'כותרת SEO עד 70 תווים').nullable().optional(),
    seo_description: z.string().max(170, 'תיאור SEO עד 170 תווים').nullable().optional(),
    seo_keywords: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // A coupon cannot be sold without a validity period (C7). Checked here
    // rather than in the field schema because it depends on the product type.
    if ((data.type === 'coupon' || data.is_coupon_enabled) && data.coupon_expiry_days == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'תוקף קופון בימים נדרש למוצר קופון',
        path: ['coupon_expiry_days'],
      })
    }
    if (data.full_price != null && data.full_price < data.kenyon_price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'מחיר מלא חייב להיות גדול או שווה למחיר בקניון',
        path: ['full_price'],
      })
    }
    // Mirrors products_coupon_price_within_price, which was added NOT VALID and
    // so cannot be relied on alone for rows that predate it.
    if (data.coupon_price_ils != null && data.coupon_price_ils > data.kenyon_price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'מחיר הקופון לא יכול לעלות על המחיר הרגיל',
        path: ['coupon_price_ils'],
      })
    }
    // A subscription with no amount is not free, it is unconfigured. Refusing
    // here is the same rule that keeps platform_percent from defaulting.
    if (data.type === 'recurring') {
      if (data.recurring_amount_ils == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'סכום החיוב התקופתי נדרש למוצר עם חיוב חודשי קבוע',
          path: ['recurring_amount_ils'],
        })
      }
      if (data.billing_interval == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'תדירות חיוב נדרשת למוצר עם חיוב חודשי קבוע',
          path: ['billing_interval'],
        })
      }
    }
    if (data.supplier_split_percent != null) {
      const sum = Math.round((data.platform_percent + data.supplier_split_percent) * 100) / 100
      if (sum !== 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `עמלת פלטפורמה ואחוז לספק חייבים להסתכם ב-100%. כרגע ${sum}%.`,
          path: ['supplier_split_percent'],
        })
      }
    }
  })

export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name_he: z.string().min(1),
  sku: z.string().min(1),
  price: z.coerce.number().min(0).nullable().optional(),
  price_modifier: z.coerce.number().default(0),
  stock_quantity: z.coerce.number().int().min(0).nullable().optional(),
  is_active: z.coerce.boolean().default(true),
})

export type ProductInput = z.infer<typeof productSchema>
