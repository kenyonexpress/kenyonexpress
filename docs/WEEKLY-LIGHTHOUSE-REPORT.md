# Weekly Lighthouse Audit Report

**Date:** 2026-10-17
**Generated:** 2026-10-17T17:44:38.892Z

## Summary

- **Pages Measured:** 9/10
- **Failures:** 3
- **Threshold:** Performance ≥ 90, Accessibility ≥ 90

## Results

| Page | Performance | Accessibility | SEO | Status |
|------|-------------|----------------|-----|--------|
| Homepage | 93 ✅ | 96 ✅ | 100 | ✅ PASS |
| Products Catalog | 92 ✅ | 97 ✅ | 100 | ✅ PASS |
| Search Results | 97 ✅ | 96 ✅ | 92 | ✅ PASS |
| Shopping Cart | 97 ✅ | 96 ✅ | 69 | ✅ PASS |
| Checkout | 88 ❌ | 96 ✅ | 69 | ⚠️ ALERT |
| Contact Form | 96 ✅ | 97 ✅ | 100 | ✅ PASS |
| User Account | 98 ✅ | 95 ✅ | 100 | ✅ PASS |
| Privacy Policy | 89 ❌ | 97 ✅ | 100 | ⚠️ ALERT |
| Terms & Conditions | 95 ✅ | 97 ✅ | 100 | ✅ PASS |

## Alert Details

### 🚨 3 Critical Alerts

- **Category (Hot Deals)**: Lighthouse measurement failed
- **Checkout**
  - URL: `/checkout`
  - Performance: 88 (threshold: 90)
  - Accessibility: 96 (threshold: 90)
  - SEO: 69

- **Privacy Policy**
  - URL: `/privacy-policy`
  - Performance: 89 (threshold: 90)
  - Accessibility: 97 (threshold: 90)
  - SEO: 100

## Raw Data

```json
[
  {
    "page": "Homepage",
    "url": "/",
    "performance": 93,
    "accessibility": 96,
    "seo": 100,
    "timestamp": "2026-10-17T17:42:29.513Z"
  },
  {
    "page": "Products Catalog",
    "url": "/products",
    "performance": 92,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:42:42.955Z"
  },
  {
    "page": "Search Results",
    "url": "/search?q=אוזניות",
    "performance": 97,
    "accessibility": 96,
    "seo": 92,
    "timestamp": "2026-10-17T17:43:27.616Z"
  },
  {
    "page": "Shopping Cart",
    "url": "/cart",
    "performance": 97,
    "accessibility": 96,
    "seo": 69,
    "timestamp": "2026-10-17T17:43:38.113Z"
  },
  {
    "page": "Checkout",
    "url": "/checkout",
    "performance": 88,
    "accessibility": 96,
    "seo": 69,
    "timestamp": "2026-10-17T17:43:50.272Z"
  },
  {
    "page": "Contact Form",
    "url": "/contact",
    "performance": 96,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:44:01.683Z"
  },
  {
    "page": "User Account",
    "url": "/account/affiliate",
    "performance": 98,
    "accessibility": 95,
    "seo": 100,
    "timestamp": "2026-10-17T17:44:12.870Z"
  },
  {
    "page": "Privacy Policy",
    "url": "/privacy-policy",
    "performance": 89,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:44:25.278Z"
  },
  {
    "page": "Terms & Conditions",
    "url": "/terms-and-conditions",
    "performance": 95,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:44:38.891Z"
  }
]
```
