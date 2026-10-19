# Infinite Scroll with Intersection Observer

## Overview

The infinite scroll implementation uses the **Intersection Observer API** to detect when users scroll near the bottom of a product listing and automatically load more items. This provides a seamless browsing experience without requiring users to click pagination buttons.

## Components

### InfiniteScrollLoader

**Location:** `src/components/category/InfiniteScrollLoader.tsx`

A sentinel element that uses the Intersection Observer API to detect when the user has scrolled near the bottom of the page. When detected, it triggers a callback to load more items.

#### Props

```typescript
type Props = {
  onLoadMore: () => void     // Callback when sentinel becomes visible
  isLoading?: boolean        // Show loading spinner (default: false)
  hasMore?: boolean          // Display sentinel only if more items exist (default: true)
}
```

#### Usage

```tsx
<InfiniteScrollLoader
  onLoadMore={handleLoadMore}
  isLoading={isLoading}
  hasMore={hasMore}
/>
```

#### Features

- **Intersection Observer API**: Efficiently detects when the sentinel element enters the viewport
- **Loading Indicator**: Animated spinner shows while fetching new items
- **Accessibility**: Includes `aria-live="polite"` and `aria-busy` attributes
- **Smart Triggering**: Does not trigger loading when already loading or when no more items exist
- **Threshold Detection**: Configured with 0.5 threshold (50% visibility) to trigger loading before user scrolls all the way

#### Technical Details

- **Threshold**: 0.5 (50% of the sentinel must be visible to trigger)
- **Sentinel Height**: 100px (gives user time to see the loading indicator)
- **Animation**: CSS spinner with smooth rotation animation
- **Cleanup**: Properly unobserves on unmount to prevent memory leaks

### CategoryGridWithInfiniteScroll

**Location:** `src/components/category/CategoryGridWithInfiniteScroll.tsx`

Displays a grid of products with infinite scroll enabled for category pages.

#### Props

```typescript
type Props = {
  initialItems: CategoryProduct[]           // Initial product list
  totalCount: number                        // Total number of products available
  currentPage: number                       // Current page number
  pageSize: number                          // Products per page
  categorySlug: string                      // Category identifier
  params: Record<string, string | undefined> // Filter parameters
  viewMode?: ViewMode                       // Grid view mode (4-col, 3-col, 2-col, list)
}
```

#### Usage

```tsx
<CategoryGridWithInfiniteScroll
  initialItems={products}
  totalCount={100}
  currentPage={1}
  pageSize={20}
  categorySlug="electronics"
  params={filterParams}
  viewMode="4-col"
/>
```

### ShopGridWithInfiniteScroll

**Location:** `src/components/shop/ShopGridWithInfiniteScroll.tsx`

Displays a grid of products with infinite scroll enabled for shop/search pages.

#### Props

```typescript
type Props = {
  initialItems: CategoryProduct[]           // Initial product list
  totalCount: number                        // Total number of products available
  pageSize: number                          // Products per page
  params: Record<string, string | undefined> // Filter parameters
  viewMode?: ViewMode                       // Grid view mode
}
```

## How It Works

### Flow Diagram

```
User Scrolls → Sentinel enters viewport
           ↓
Intersection Observer detects (threshold 0.5)
           ↓
onLoadMore callback triggered
           ↓
isLoading = true → Spinner appears
           ↓
Fetch next page from API
           ↓
Items appended to list
           ↓
isLoading = false → Spinner disappears
           ↓
New products visible
           ↓
(Repeat if hasMore = true)
```

### Loading State

1. **User scrolls** → Sentinel becomes visible
2. **onLoadMore triggered** → Component sets `isLoading = true`
3. **Spinner appears** → Visual feedback to user
4. **API request** → Fetch next page of products
5. **Spinner disappears** → `isLoading = false`
6. **New items rendered** → Seamless addition to grid

### End of Results

When all items are loaded (`hasMore = false`):
- Sentinel is removed from DOM
- Loading indicator no longer appears
- "End of results" message displayed (in CategoryGridWithInfiniteScroll)

## Styling

### CSS Classes

```css
.infinite-scroll-loader {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 40px;
}

.infinite-scroll-loader__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--cat-bar);
  border-top-color: var(--cat-brand);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

### Animation

The spinner uses a smooth rotation animation:
```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

## Accessibility

### ARIA Attributes

- **aria-live="polite"**: Announces loading state to screen readers
- **aria-busy**: Indicates when loading is in progress
  - `true` when fetching items
  - `false` when idle

### Keyboard Navigation

- Sentinel element is invisible to keyboard navigation
- Infinite scroll works automatically as user scrolls
- No additional keyboard interaction required

### Screen Readers

Screen readers announce:
- "Loading..." when spinner appears
- "No more results" when all items loaded

## Performance Considerations

### Intersection Observer Benefits

1. **Efficient**: Native browser API, no polling needed
2. **Optimized**: Only observes when element exists
3. **Non-blocking**: Doesn't interfere with main thread
4. **Memory efficient**: Automatically cleanup on unmount

### Data Fetching

- **Debounced**: Only one request at a time (`isLoading` prevents multiple calls)
- **Error handling**: Silent failure with retry on next scroll
- **Network efficient**: Only fetches needed pages

### Rendering

- **Skeleton loading**: Shows placeholder cards while fetching
- **Lazy rendering**: Grid renders incrementally as items load
- **No reflow**: Reserved space prevents layout shift

## Browser Support

The Intersection Observer API is supported in all modern browsers:

- ✅ Chrome 51+
- ✅ Firefox 55+
- ✅ Safari 12.1+
- ✅ Edge 16+
- ✅ iOS Safari 12.2+
- ✅ Android Chrome 59+

For older browsers, a polyfill would be needed (not included by default).

## Testing

### Unit Tests

Location: `src/components/category/InfiniteScrollLoader.test.tsx`

Tests cover:
- Component rendering
- Intersection Observer setup
- Loading indicator display
- Callback triggering
- Accessibility attributes
- Edge cases (no more items, already loading)
- Cleanup on unmount

Run tests:
```bash
pnpm test src/components/category/InfiniteScrollLoader.test.tsx
```

### E2E Testing

Infinite scroll can be tested in E2E tests by:

1. Scrolling to bottom of product grid
2. Verifying new products appear
3. Checking loading spinner visibility
4. Confirming no duplicate products

## Configuration

### Threshold

The threshold controls when the sentinel triggers loading:

```typescript
{ threshold: 0.5 }  // 50% visibility
```

Adjust if you want to:
- Load earlier: Decrease threshold (e.g., 0.1)
- Load later: Increase threshold (e.g., 0.9)

### Sentinel Height

Change sentinel height in `category-page.css`:

```css
.infinite-scroll-loader {
  height: 100px;  /* Adjust based on loading state visibility preference */
}
```

Taller height = more scroll before loading
Shorter height = more eager loading

## Troubleshooting

### Infinite scroll not triggering

1. **Check `hasMore` prop**: Should be `true` while items remain
2. **Check `onLoadMore` callback**: Should update state and fetch new items
3. **Verify threshold**: Element may not be intersecting at 0.5
4. **Check `isLoading` state**: Must be `false` to allow new requests

### Spinner not appearing

1. **Check `isLoading` prop**: Should be `true` while fetching
2. **Verify CSS loaded**: Check `infinite-scroll-loader__spinner` styling
3. **Check animation**: Spinner should rotate smoothly

### Duplicate items

1. **Check API response**: Ensure no overlapping page ranges
2. **Check deduplication**: Grid should handle duplicate keys gracefully

### Memory leaks

1. **Verify cleanup**: Component should unobserve on unmount
2. **Check event listeners**: No orphaned observers should remain

## Related Components

- **CategoryGridSkeleton**: Placeholder shown while loading
- **CategoryProductCard**: Individual product in grid
- **CategoryGridWithInfiniteScroll**: Main grid component with infinite scroll

## Examples

### Basic Usage

```tsx
<InfiniteScrollLoader
  onLoadMore={() => fetchNextPage()}
  isLoading={isFetching}
  hasMore={totalPages > currentPage}
/>
```

### With Category Filter

```tsx
<CategoryGridWithInfiniteScroll
  initialItems={products}
  totalCount={filteredTotal}
  currentPage={1}
  pageSize={20}
  categorySlug="electronics"
  params={{ minPrice: "100", maxPrice: "1000" }}
  viewMode="4-col"
/>
```

### With Search

```tsx
<ShopGridWithInfiniteScroll
  initialItems={searchResults}
  totalCount={totalMatches}
  pageSize={20}
  params={{ q: "laptop", sort: "price" }}
  viewMode="3-col"
/>
```

## Future Enhancements

Potential improvements:

1. **Virtual scrolling**: For very large lists (1000+ items)
2. **Bidirectional scroll**: Load items above and below
3. **Save scroll position**: Restore on back navigation
4. **Customizable loading UI**: Different spinner styles
5. **Analytics**: Track scroll depth and load more frequency
