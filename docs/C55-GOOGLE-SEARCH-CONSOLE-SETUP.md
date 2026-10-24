# C55: Google Search Console Setup & Sitemap Submission

## Overview

This document provides step-by-step instructions for:
1. Verifying domain ownership via DNS TXT record
2. Submitting the sitemap to Google Search Console
3. Verifying the setup is working correctly

## Current Status

✅ **Sitemap Available**: https://www.kenyonexpress.co.il/sitemap.xml
✅ **Sitemap Format**: Valid XML with proper headers
✅ **Robots.txt**: References sitemap at https://kenyonexpress.co.il/sitemap.xml
✅ **Domain**: www.kenyonexpress.co.il (apex redirects to www via 308)

## Step 1: Domain Verification via DNS TXT Record

### 1.1 Access Google Search Console

1. Go to: https://search.google.com/search-console/
2. Sign in with your Google account (use kenyonexpress@gmail.com)
3. Click "Add Property" or "Add a property"

### 1.2 Choose Verification Method

**Important**: Use "Domain" property type, not "URL prefix"
- Domain property type verifies: `kenyonexpress.co.il`
- This covers: http/https, www/non-www, all subdomains

#### Why Domain Property?

From STATE.md memory (C49-M15):
> Canonical URLs in code declare https://kenyonexpress.co.il (apex) but domain 
> configuration serves from https://www.kenyonexpress.co.il (www subdomain).

Using Domain property type handles both apex and www automatically.

### 1.3 Get DNS TXT Verification Token

Google Search Console will provide a TXT record in this format:
```
google-site-verification=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Example format:**
```
Type: TXT
Host: @ (or kenyonexpress.co.il)
Value: google-site-verification=abc123def456ghi789jkl...
```

### 1.4 Add DNS TXT Record

#### Option A: Via Vercel (if DNS is managed there)

```bash
# Check current Vercel DNS settings
vercel dns ls kenyonexpress.co.il

# Add TXT record via Vercel CLI
vercel dns add kenyonexpress.co.il @ TXT "google-site-verification=YOUR_TOKEN_HERE"
```

#### Option B: Via Domain Registrar

1. Log into your domain registrar (check `docs/PRODUCTION-SECRETS.md` for registrar info)
2. Navigate to DNS management
3. Add a new TXT record:
   - **Name/Host**: @ (or root/apex)
   - **Type**: TXT
   - **Value**: `google-site-verification=YOUR_TOKEN_HERE`
   - **TTL**: 3600 (1 hour) or default

#### Option C: Via Cloudflare (if DNS is there)

Based on memory (dns-zone-refused-at-cloudflare.md):
> 25.09: registrar NS is ns1/ns2.vercel.com (dead), Vercel needs ns1/ns2/ns3.vercel-dns.com

Check where DNS is actually hosted first:
```bash
dig NS kenyonexpress.co.il +short
```

### 1.5 Verify DNS TXT Record

Wait 5-15 minutes for DNS propagation, then verify:

```bash
# Check TXT records
dig TXT kenyonexpress.co.il +short

# Should show:
# "google-site-verification=YOUR_TOKEN"

# Or use Google's DNS
dig @8.8.8.8 TXT kenyonexpress.co.il +short
```

### 1.6 Complete Verification in GSC

1. Return to Google Search Console
2. Click "Verify" button
3. Google will check for the TXT record
4. Verification should succeed within seconds if DNS propagated

**Expected Result**: ✅ "Ownership verified"

## Step 2: Submit Sitemap

### 2.1 Navigate to Sitemaps Section

1. In Google Search Console, select your verified property
2. Click "Sitemaps" in the left sidebar
3. Click "Add a new sitemap"

### 2.2 Submit Sitemap URL

Enter the sitemap URL:
```
https://www.kenyonexpress.co.il/sitemap.xml
```

**Note**: Use the www subdomain since that's where the site actually serves (apex redirects to www).

Alternatively, submit apex (GSC will follow the redirect):
```
https://kenyonexpress.co.il/sitemap.xml
```

### 2.3 Verify Submission

After submission, Google will:
1. Fetch the sitemap (may take a few minutes to hours)
2. Parse the URLs
3. Show status as "Success" if valid

**Expected counts** (based on current sitemap):
- Static pages: ~15-20 URLs (home, products, coupons, blog, legal pages, etc.)
- Categories: ~7-12 URLs (categories with products only)
- Products: ~44-66 URLs (active products)
- Suppliers: ~10-11 URLs
- **Total**: ~76-109 URLs

From STATE.md (C31):
> sitemap 75 URLs

### 2.4 Check for Errors

Common errors to watch for:
- ❌ **Could not fetch**: Check URL accessibility
- ❌ **Couldn't fetch**: Temporary network issue, retry in 24h
- ❌ **Redirect error**: Should not happen (www is canonical)
- ❌ **Unsupported format**: Should not happen (valid XML)

All should be ✅ **Success** with 0 errors.

## Step 3: Verification & Monitoring

### 3.1 Verify Sitemap is Indexed

After 1-3 days, check indexing status:
1. Go to "Sitemaps" in GSC
2. Check "Discovered URLs" count
3. Should match submitted URLs count (~75-109)

### 3.2 Check Coverage Report

1. Go to "Coverage" in GSC
2. Check for errors or warnings
3. Valid pages should show as "Valid"

### 3.3 Monitor Index Status

Run this query in Google Search:
```
site:kenyonexpress.co.il
```

Should eventually show all submitted URLs.

### 3.4 Automated Verification Script

Use the verification script to check DNS and sitemap:
```bash
node scripts/verify-google-search-console.mjs
```

This will check:
- ✅ DNS TXT record exists
- ✅ Sitemap is accessible
- ✅ Sitemap has valid XML
- ✅ Sitemap returns correct content-type
- ✅ Robots.txt references sitemap

## Troubleshooting

### DNS TXT Record Not Found

```bash
# Force flush DNS cache
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Check with multiple DNS servers
dig @8.8.8.8 TXT kenyonexpress.co.il +short
dig @1.1.1.1 TXT kenyonexpress.co.il +short
```

### Sitemap 404 or 5xx Error

```bash
# Check production deployment
curl -I https://www.kenyonexpress.co.il/sitemap.xml

# Should return:
# HTTP/2 200
# content-type: application/xml
```

### Sitemap Has Wrong Domain

Current issue from STATE.md (C49-M15):
> Canonical URLs in code declare https://kenyonexpress.co.il (apex) but domain 
> configuration serves from https://www.kenyonexpress.co.il (www subdomain).

**Resolution**: The sitemap uses apex URLs (kenyonexpress.co.il) but is served from www.
Google will follow the 308 redirect and understand the canonical relationship.

**If needed**, update `src/lib/site-url.ts`:
```typescript
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.kenyonexpress.co.il'
  return raw.replace(/\/+$/, '')
}
```

But test first - the current setup may be fine.

### Verification Fails in GSC

Common causes:
1. **DNS not propagated**: Wait 1-24 hours and retry
2. **Wrong TXT value**: Copy-paste exactly from GSC
3. **TXT record on subdomain**: Must be on root domain (@)
4. **Multiple TXT records**: Some DNS providers require separate records

## Post-Setup: Maintenance

### When to Resubmit Sitemap

**Never needed** - Google automatically re-crawls periodically.

Only resubmit if:
- Major site restructure
- Sitemap URL changes
- Sitemap was showing errors and you fixed them

### Sitemap Updates

Sitemap is dynamic and updates automatically:
- Cache life: 1 hour (`cacheLife('hours')`)
- Revalidates on catalogue changes (`CATALOGUE_TAG`)
- Falls back to last good version on error

### Monitoring

Weekly check:
1. GSC Coverage report: Should be green
2. GSC Sitemaps: Should show "Success" with 0 errors
3. Indexed URLs: Should match submitted count

## Success Criteria

✅ **DNS TXT Verification**
- TXT record visible in `dig TXT kenyonexpress.co.il`
- GSC shows "Ownership verified"
- No verification errors

✅ **Sitemap Submission**  
- Sitemap URL accepted in GSC
- Status shows "Success" (not "Could not fetch")
- Discovered URLs matches submitted count
- 0 errors reported

✅ **Zero Errors**
- GSC Sitemaps page: 0 errors
- GSC Coverage report: No errors for sitemap URLs
- `scripts/verify-google-search-console.mjs` passes all checks

## Related Documentation

- `docs/C31-SEO-IMPLEMENTATION.md` - Overall SEO implementation
- `docs/C31-GOOGLE-RICH-RESULTS-INSTRUCTIONS.md` - Rich results testing
- `src/app/sitemap.ts` - Sitemap implementation
- `src/app/robots.ts` - Robots.txt implementation

## References

- Google Search Console: https://search.google.com/search-console/
- Sitemap Protocol: https://www.sitemaps.org/protocol.html
- Google Sitemap Guidelines: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- DNS TXT Verification: https://support.google.com/webmasters/answer/9008080
