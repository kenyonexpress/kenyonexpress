# Weekly Lighthouse Audit Report

**Date:** 2026-10-17
**Generated:** 2026-10-17T17:55:08.654Z

## Summary

- **Pages Measured:** 10/10
- **Failures:** 1
- **Threshold:** Performance ≥ 90, Accessibility ≥ 90

## Results

| Page | Performance | Accessibility | SEO | Status |
|------|-------------|----------------|-----|--------|
| Homepage | 94 ✅ | 96 ✅ | 100 | ✅ PASS |
| Products Catalog | 98 ✅ | 97 ✅ | 100 | ✅ PASS |
| Category (Hot Deals) | 96 ✅ | 96 ✅ | 92 | ✅ PASS |
| Search Results | 98 ✅ | 96 ✅ | 92 | ✅ PASS |
| Shopping Cart | 96 ✅ | 96 ✅ | 69 | ✅ PASS |
| Checkout | 87 ❌ | 96 ✅ | 69 | ⚠️ ALERT |
| Contact Form | 96 ✅ | 97 ✅ | 100 | ✅ PASS |
| User Account | 98 ✅ | 95 ✅ | 100 | ✅ PASS |
| Privacy Policy | 95 ✅ | 97 ✅ | 100 | ✅ PASS |
| Terms & Conditions | 95 ✅ | 97 ✅ | 100 | ✅ PASS |

## Alert Details

### 🚨 1 Critical Alerts

- **Checkout**
  - URL: `/checkout`
  - Performance: 87 (threshold: 90)
  - Accessibility: 96 (threshold: 90)
  - SEO: 69

## Raw Data

```json
[
  {
    "page": "Homepage",
    "url": "/",
    "performance": 94,
    "accessibility": 96,
    "seo": 100,
    "timestamp": "2026-10-17T17:53:22.479Z"
  },
  {
    "page": "Products Catalog",
    "url": "/products",
    "performance": 98,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:53:34.752Z"
  },
  {
    "page": "Category (Hot Deals)",
    "url": "/category/hot-deals",
    "performance": 96,
    "accessibility": 96,
    "seo": 92,
    "timestamp": "2026-10-17T17:53:46.395Z"
  },
  {
    "page": "Search Results",
    "url": "/search?q=אוזניות",
    "performance": 98,
    "accessibility": 96,
    "seo": 92,
    "timestamp": "2026-10-17T17:53:58.311Z"
  },
  {
    "page": "Shopping Cart",
    "url": "/cart",
    "performance": 96,
    "accessibility": 96,
    "seo": 69,
    "timestamp": "2026-10-17T17:54:09.738Z"
  },
  {
    "page": "Checkout",
    "url": "/checkout",
    "performance": 87,
    "accessibility": 96,
    "seo": 69,
    "timestamp": "2026-10-17T17:54:22.376Z"
  },
  {
    "page": "Contact Form",
    "url": "/contact",
    "performance": 96,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:54:33.787Z"
  },
  {
    "page": "User Account",
    "url": "/account/affiliate",
    "performance": 98,
    "accessibility": 95,
    "seo": 100,
    "timestamp": "2026-10-17T17:54:45.025Z"
  },
  {
    "page": "Privacy Policy",
    "url": "/privacy-policy",
    "performance": 95,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:54:56.868Z"
  },
  {
    "page": "Terms & Conditions",
    "url": "/terms-and-conditions",
    "performance": 95,
    "accessibility": 97,
    "seo": 100,
    "timestamp": "2026-10-17T17:55:08.654Z"
  }
]
```
