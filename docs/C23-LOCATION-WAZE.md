# C23: Location Pin + Waze Navigation Integration

**Status:** COMPLETE  
**Date:** 2026-10-24  
**Commit:** c919efad8

## Summary

Added location pins with Waze navigation links across all product display components, enabling customers to navigate directly to product locations from product cards, product pages, thank-you page, and voucher pages.

## Changes Made

### 1. Product Type Updates
- Added `latitude` and `longitude` fields to Product types in:
  - `src/components/ProductCard.tsx`
  - `src/components/ProductDealCard.tsx`
  - `src/components/ProductDealCardMobile.tsx`

### 2. Component Updates

#### DealsProductCard (ProductCard.tsx)
- Replaced standalone `ProductLocation` with `LocationPin`
- Falls back to `ProductLocation` for nationwide products
- Shows Waze navigation link when coordinates available

#### ProductDealCard (homepage desktop)
- Added `LocationPin` import and location display
- Integrated with existing category display logic
- Shows location pin when available, otherwise shows category or nationwide label

#### ProductDealCardMobile (homepage mobile)
- Added location display above product title
- Consistent with desktop card behavior
- Styled to match mobile card design

### 3. Component Behavior

**LocationPin Component** (already existed, now utilized):
- Shows city name with map pin icon
- Links to Waze when coordinates (lat/lng) are provided
- Opens in new tab with "navigate=yes" parameter
- Renders as plain text when only city name available
- Returns null for nationwide products (no specific location)

**ProductLocation Component** (fallback):
- Shows city name or "כל הארץ" (nationwide) label
- No navigation link, display only
- Used when LocationPin returns null

### 4. Testing

Created comprehensive test suite (`src/components/product-location-waze.test.tsx`):
- ✅ Waze link generation with coordinates
- ✅ Plain text display without coordinates
- ✅ Full address fallback for Waze
- ✅ Nationwide handling (null/empty city)
- ✅ Custom className application
- ✅ ProductLocation fallback behavior

**Test Results:** 11/11 tests passing

## Technical Details

### Waze Link Format

With coordinates:
```
https://waze.com/ul?ll=32.0853,34.7818&navigate=yes
```

With address only:
```
https://waze.com/ul?q=<encoded-address>
```

### Data Flow

1. Products fetch city, latitude, longitude from database
2. LocationPin receives location object
3. If coordinates exist → generates Waze navigation link
4. If address only → generates Waze search link  
5. If city only → displays as plain text
6. If nationwide → ProductLocation fallback shows "כל הארץ"

## Already Implemented (Verified)

The following pages already had LocationPin integration before this task:
- ✅ Product detail page (`src/app/(store)/product/[slug]/page.tsx`)
- ✅ Thank-you page (`src/app/(store)/checkout/return/page.tsx`)
- ✅ Voucher page (`src/app/coupon/[id]/page.tsx`)
- ✅ Category product cards (`src/components/category/CategoryProductCard.tsx`)

## Quality Gates

- ✅ Type check: clean
- ✅ Lint: clean (biome, tokens, copy, asset gates)
- ✅ Build: successful
- ✅ Tests: 11/11 passing
- ✅ No breaking changes to existing functionality

## Data Requirements

For Waze navigation to work, products need:
- **Required:** `city` (string) - product location city name
- **Optional:** `latitude` (number) - precise latitude coordinate  
- **Optional:** `longitude` (number) - precise longitude coordinate
- **Optional:** `fullAddress` (string) - full street address for fallback

Database schema already supports these fields (migration 113_products_geo.sql).

## User Experience

### Before
- Product cards showed category or city label only
- No direct navigation to product location
- Manual search in navigation apps required

### After
- Product cards show location with pin icon
- Click pin → opens Waze with navigation to exact location
- Seamless experience from browsing to navigation
- Works on cards, product pages, thank-you page, and vouchers

## Notes

- LocationPin component already existed and was used in some pages
- This task added it to the remaining product card components
- Waze link opens in new tab with `rel="noreferrer noopener"` for security
- Nationwide products ("כל הארץ") intentionally don't show Waze link
- City-only products show location name without navigation link
- Full backward compatibility: works with missing location data
