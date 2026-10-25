# F56: Admin Product Upload - COMPLETE

**Goal**: Complete admin product upload with R2 images, all required features implemented.

**Status**: ✅ DONE (2026-10-25)

## Implemented Features

### 1. Category Multi-Select ✅
- Checkbox list for selecting multiple categories
- First selected category stored in `category_id` (backward compatible)
- All selections stored in `category_ids` JSON field
- UI shows hint: "ניתן לבחור מספר קטגוריות. הראשונה תשמש כקטגוריה ראשית"

**Code**: `src/components/admin/ProductForm.tsx` lines 352-378

### 2. Original Price with Source URL ✅
- `original_price` field (numeric, ₪) - "מחיר מקורי"
- `source_url` field (URL) - "קישור למקור"
- Allows tracking product source and comparing prices
- Hints explain purpose to admin users

**Code**: `src/components/admin/ProductForm.tsx` lines 611-642

### 3. Valid From & Valid Until Dates ✅
- `valid_from` date picker - "המבצע מתחיל ב"
- `offer_valid_until` date picker - "המבצע בתוקף עד"
- Three-column layout with discount_percent

**Code**: `src/components/admin/ProductForm.tsx` lines 829-859

### 4. R2 Image Upload with AVIF/WebP Pipeline ✅
- **Already implemented** via ImageUploader component
- Cloudflare R2 integration: `src/lib/storage/r2.ts`
- Now exported from `src/lib/r2/index.ts` (as required by goal)
- Sharp-based AVIF/WebP conversion
- Multiple renditions, blur placeholders

### 5. Platform Percent Slider 0-100% ✅
- **Already implemented** with live supplier split calculation
- Min: 0, Max: 100, Step: 0.01
- Auto-updates supplier_split_percent to maintain 100% total

### 6. Supplier Dropdown ✅
- **Already implemented** from suppliers table
- Shows supplier status and validates completeness

### 7. Type Toggle Changes Form ✅
- **Already implemented**
- Coupon: shows coupon price, expiry, min purchase
- Physical: shows discount, offer dates
- Recurring: shows amount, billing interval, preview

### 8. Hebrew RTL Throughout ✅
- **Already implemented**
- All labels in Hebrew
- `dir="ltr"` only on number/URL inputs

### 9. Save Draft / Publish ✅
- **Already implemented**
- Status defaults to 'draft'
- Dropdown allows changing to 'active' (publish)

### 10. Edit Page ✅
- **Already implemented**
- `/admin/products/[id]/edit` uses same ProductForm

### 11. Max Quantity ✅
- **Already implemented** as `max_per_order`
- "מקסימום ליחידת הזמנה"

## Database Migration

**File**: `migrations/pending/306_product_upload_fields.sql`

Adds to products table:
- `original_price` numeric(10,2)
- `source_url` text
- `valid_from` timestamptz

Creates junction table:
- `product_categories` (product_id, category_id, sort_order)
- Complete RLS policies matching products table
- Indexes on both foreign keys

## Tests

**File**: `src/components/admin/__tests__/ProductForm.test.tsx`

13 test cases covering:
- Category multi-select rendering and selection
- original_price field presence and type
- source_url field with URL type and placeholder
- valid_from and valid_until date fields
- platform_percent slider with 0-100 range
- Supplier dropdown with options
- Type toggle with all three options
- Status defaults to draft
- Status can change to active (publish)
- max_per_order field
- ImageUploader integration
- Hebrew RTL labels

## Build Verification

```bash
pnpm typecheck  # ✅ PASS
pnpm lint       # ✅ PASS
pnpm build      # ✅ PASS (all routes compiled)
```

## Files Changed

1. `src/lib/r2/index.ts` - Created (exports R2 functions)
2. `src/components/admin/ProductForm.tsx` - Modified (added 3 features)
3. `src/components/admin/__tests__/ProductForm.test.tsx` - Created (13 tests)
4. `migrations/pending/306_product_upload_fields.sql` - Created (schema)

## Commit

**SHA**: af4544f58  
**Message**: "F56 admin product upload with R2 images"  
**Paths Staged**: 
- `src/app/(admin)/admin/products`
- `src/lib/r2`
- `src/components/admin`
- `migrations/pending/306_product_upload_fields.sql`

## Result

**F56: DONE**

All required features implemented:
- ✅ Category multi-select
- ✅ original_price with source URL field
- ✅ valid_from valid_until dates
- ✅ R2 image upload (existing + new export path)
- ✅ platform_percent slider 0-100%
- ✅ Supplier dropdown
- ✅ Type toggle changes form
- ✅ Hebrew RTL throughout
- ✅ Save creates draft, publish to active
- ✅ Edit page same form
- ✅ max_quantity (max_per_order)
- ✅ Tests added
- ✅ Migration created
- ✅ All builds pass

**Completed**: 2026-10-25  
**Committed**: af4544f58
