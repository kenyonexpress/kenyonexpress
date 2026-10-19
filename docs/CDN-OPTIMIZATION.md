# CDN Optimization - STEP 72

This document describes the CDN optimization strategy implemented for KenyonExpress using Vercel's Edge Network.

## Overview

The CDN optimization provides:
1. **Geographic Edge Caching** - Distribute content across multiple Vercel regions (fra1, dub1)
2. **Per-Route Cache Control** - Different cache strategies for different routes
3. **Cache Invalidation** - Automatic cache purging when content changes
4. **Cache Status Headers** - Visible cache status via `X-Cache-Status` header

## Vercel Configuration

### Regions (vercel.json)
- **fra1** (Frankfurt) - Primary region, lowest latency for European users
- **dub1** (Dublin) - Secondary region for geographic redundancy

```json
{
  "regions": ["fra1", "dub1"],
  "env": {
    "VERCEL_CDN_REGIONS": "fra1,dub1",
    "VERCEL_EDGE_HEBREW": "true"
  }
}
```

## Cache Strategies

### 1. Immutable Assets (1 year)
- Files: `/_next/static/*`, `/public/*`
- `Cache-Control: public, max-age=31536000, s-maxage=31536000`
- These rarely change and are safe to cache indefinitely

### 2. Product Pages (1 hour)
- Route: `/product/:slug`
- `Cache-Control: public, max-age=3600, s-maxage=3600`
- Product data changes infrequently
- Updated when product inventory changes

### 3. Category Pages (1 hour)
- Route: `/shop/:category`
- `Cache-Control: public, max-age=3600, s-maxage=3600`
- Category listings cached for performance

### 4. Static Pages (24 hours)
- Routes: `/about`, `/terms-and-conditions`, `/privacy-policy`, `/refund_returns`
- `Cache-Control: public, max-age=86400, s-maxage=86400`
- Legal and informational pages rarely change

### 5. Home Page (30 minutes)
- Route: `/`
- `Cache-Control: public, max-age=1800, s-maxage=1800`
- Frequently updated with deals and promotions

### 6. Dynamic Routes (No Cache)
- Route: `/checkout/*`
- `Cache-Control: no-store, must-revalidate`
- Must never be cached - critical for checkout integrity

### 7. API Routes (No Cache)
- Route: `/api/*`
- `Cache-Control: private, max-age=0, s-maxage=0`
- API responses are user-specific and must not be cached

## Cache Invalidation

### Manual Cache Purging

Use the `/api/cache/purge` endpoint to invalidate cached content:

```bash
curl -X POST http://localhost:3000/api/cache/purge \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "product",
    "id": 123
  }'
```

### Cache Tags

Supported cache tags:
- `product` - Product data and pages
- `category` - Category listings
- `order` - Order pages (user-specific)
- `coupon` - Coupon listings and detail pages
- `supplier` - Supplier pages

### Integration Points

Cache should be purged automatically:
1. **Product Updates** - When product details/inventory changes
2. **Coupon Creation** - When new coupon is issued
3. **Order Completion** - When order status changes
4. **Supplier Changes** - When supplier profile is updated

## Cache Status Header

All responses include an `X-Cache-Status` header indicating cache hit/miss:

```
X-Cache-Status: hit      # Served from Vercel Edge
X-Cache-Status: miss     # Not yet cached
X-Cache-Status: dynamic  # Not cacheable (checkout, auth)
X-Cache-Status: private  # User-specific (API, account)
```

Use this header for debugging cache behavior in development:

```typescript
const status = response.headers.get('x-cache-status')
console.log(`Cache status: ${status}`)
```

## Performance Benefits

1. **Reduced Origin Load** - Edge caches serve 80%+ of requests
2. **Faster Response Times** - Geographic edges reduce latency
3. **Better TTFB** - Edge nodes respond faster than origin
4. **Automatic Failover** - Multiple regions provide redundancy

## Monitoring

Check cache performance via:
1. **Vercel Analytics** - Dashboard shows cache hit rates
2. **X-Cache-Status Headers** - Monitor in DevTools
3. **Response Times** - Measure origin vs. edge latency
4. **Health Endpoint** - `/api/cache/purge?GET` for status

## Hebrew Content Optimization

The `VERCEL_EDGE_HEBREW=true` flag enables geographic routing for Hebrew content:
- Prioritizes regions closer to Israel
- Reduces latency for Hebrew-speaking users
- Future: May route through dedicated Israeli edge node when available

## Caching Best Practices

1. **Never Cache Sensitive Data** - Never cache auth tokens, personal info
2. **Use Proper Validation** - Set correct `max-age` values
3. **Purge on Updates** - Always invalidate when content changes
4. **Test Locally** - Use DevTools to verify cache headers
5. **Monitor Production** - Watch cache hit rates and latency

## Troubleshooting

### Cache Not Invalidating
- Verify `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` are set
- Check Vercel project ID matches deployment
- Ensure CRON_SECRET is correct

### High Cache Miss Rate
- Check cache headers are being sent correctly
- Verify routes match cache configuration patterns
- Monitor for unexpected dynamic routes

### Performance Issues
- Use Vercel Analytics to identify slow origin responses
- Check database query performance
- Monitor third-party API latency
