/**
 * Verifies ProductForm covers all required fields from the database schema
 * for coupon vs physical vs recurring products.
 *
 * This complements product-form-schema.test.ts (validation rules) by checking
 * that the schema itself covers the database columns.
 */
import { productSchema } from '@/lib/admin/product-form-schema'
import { describe, expect, it } from 'vitest'

describe('ProductForm field coverage', () => {
  describe('Coupon-specific fields', () => {
    it('validates coupon_price_ils is present in schema', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'coupon',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'draft',
        coupon_expiry_days: 30,
        coupon_price_ils: 50,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.coupon_price_ils).toBe(50)
      }
    })

    it('validates coupon_expiry_days is required for coupons', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'coupon',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'draft',
        // Missing coupon_expiry_days
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('coupon_expiry_days'))
        expect(issue).toBeDefined()
      }
    })
  })

  describe('Physical-specific fields', () => {
    it('validates discount_percent is present in schema', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'physical',
        city: 'תל אביב',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'draft',
        discount_percent: 15,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.discount_percent).toBe(15)
      }
    })

    it('validates city is required for active physical products', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'physical',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'active',
        // Missing city
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('city'))
        expect(issue?.message).toContain('עיר נדרשת')
      }
    })

    it('allows draft physical products without city', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'physical',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'draft',
        // No city for draft
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Recurring-specific fields', () => {
    it('validates recurring_amount_ils is required', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'recurring',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'draft',
        billing_interval: 'monthly',
        // Missing recurring_amount_ils
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('recurring_amount_ils'))
        expect(issue).toBeDefined()
      }
    })

    it('validates billing_interval is required', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'recurring',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'draft',
        recurring_amount_ils: 49,
        // Missing billing_interval
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('billing_interval'))
        expect(issue).toBeDefined()
      }
    })

    it('accepts valid recurring product', () => {
      const result = productSchema.safeParse({
        slug: 'test',
        name_he: 'מבחן',
        type: 'recurring',
        kenyon_price: 100,
        platform_percent: 10,
        status: 'draft',
        recurring_amount_ils: 49,
        billing_interval: 'monthly',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Common fields across all types', () => {
    it.each(['physical', 'coupon', 'recurring'] as const)(
      '%s products accept all common fields',
      (type) => {
        const base = {
          slug: 'test',
          name_he: 'מבחן',
          name_en: 'Test',
          type,
          kenyon_price: 100,
          full_price: 120,
          platform_percent: 10,
          supplier_split_percent: 90,
          status: 'draft' as const,
          sku: 'TEST-001',
          stock_quantity: 10,
          is_featured: true,
          weekend_only: false,
          free_shipping: true,
          short_description_he: 'תיאור',
          brand: 'Brand',
          video_url: 'https://example.com/video',
          barcode: '123456',
          low_stock_threshold: 5,
          max_per_order: 10,
          requires_shipping: true,
          weight_grams: 500,
          length_mm: 100,
          width_mm: 50,
          height_mm: 30,
          warranty_months: 12,
          condition: 'new' as const,
          seo_title: 'SEO Title',
          seo_description: 'SEO Description',
          seo_keywords: 'keyword1, keyword2',
        }

        const typeSpecific =
          type === 'coupon'
            ? { coupon_expiry_days: 30 }
            : type === 'recurring'
              ? { recurring_amount_ils: 49, billing_interval: 'monthly' as const }
              : { city: 'תל אביב' }

        const result = productSchema.safeParse({ ...base, ...typeSpecific })
        expect(result.success).toBe(true)
      },
    )
  })
})
