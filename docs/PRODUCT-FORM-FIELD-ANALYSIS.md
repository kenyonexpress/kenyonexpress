# Product Form Field Analysis: Coupon vs Physical

**Task:** Verify `/admin/products/new` correctly shows fields for coupon vs physical products  
**Method:** Compare ProductForm.tsx conditional rendering with product-form-schema.ts validation  
**Database Schema:** `src/types/database.ts` line 2121 (55 user-editable fields)

## Key Type-Specific Fields

### Coupon Products Only
- `coupon_price_ils` — Required, shown lines 641-691
- Derived badge percent (read-only display)

### Physical Products Only  
- `discount_percent` — Required, shown lines 791-830
- `city` — Required for non-draft (validation in schema line 184)

### Recurring Products Only
- `recurring_amount_agorot` — Required, shown lines 692-790
- `billing_interval` — Required
- `billing_interval_count` — Optional, default 1

## Field Visibility by Type

| Field | Physical | Coupon | Recurring | Location |
|-------|----------|--------|-----------|----------|
| `offer_valid_until` | ✓ (line 791-830) | ✓ (line 833-850) | ✗ | Both non-recurring |
| `discount_percent` | ✓ (line 791-830) | ✗ | ✗ | Physical only |
| `coupon_price_ils` | ✗ | ✓ (line 641-691) | ✗ | Coupon only |
| `recurring_amount_agorot` | ✗ | ✗ | ✓ (line 692-790) | Recurring only |
| `vat_exempt` | ✓ (line 1268-1287) | ✗ | ✓ | Not coupon |
| `tags` | ✓ (line 1288-1305) | ✗ | ✓ | Not coupon |
| Coupon details section | ✓ (line 1020-1096) | ✓ | ✗ | Not recurring |
| Location fields | ✓ required (line 1152) | ✓ optional | ✗ | Not recurring |

## Validation Rules (from product-form-schema.ts)

**Coupon products:**
- Must have `coupon_expiry_days` (line 175-181)
- `coupon_price_ils ≤ kenyon_price` (line 215-225)

**Physical products:**
- Must have `city` when status != 'draft' (line 183-194)
- Can optionally enable `is_coupon_enabled` (inherits coupon rules)

**Recurring products:**
- Must have `recurring_amount_ils` (line 228-234)
- Must have `billing_interval` (line 236-242)

**All products:**
- `platform_percent + supplier_split_percent = 100%` (line 244-253)

## Common Fields (All Types)

All 3 types show:
- Identity: `name_he`, `name_en`, `slug`, `description_he`
- Pricing: `kenyon_price`, `full_price`, `platform_percent`, `supplier_split_percent`
- Inventory: `stock_quantity`, `low_stock_threshold`, `max_per_order`
- Marketing: `short_description_he`, `brand`, `highlights`, `video_url`, `barcode`
- Logistics: `requires_shipping`, `free_shipping`, `shipping_price_agorot`, `whatsapp_enabled`
- Physical: `weight_grams`, `length_mm`, `width_mm`, `height_mm`, `warranty_months`, `condition`
- SEO: `seo_title`, `seo_description`, `seo_keywords`
- Meta: `category_id`, `supplier_id`, `status`, `sku`, `images`

## Findings

1. **No duplicate fields** — Ternary structure ensures only one pricing section renders
2. **All 55 DB fields present** — Form covers full schema
3. **Validation matches DB** — Schema rules match form conditionals
4. **Permission model works** — `hidePricing` correctly hides money fields

## Conclusion

ProductForm correctly implements field visibility for all 3 product types.
No bugs found, no changes needed.
