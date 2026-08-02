/**
 * Lighthouse CI assertions for KenyonExpress storefront.
 *
 * Target: Performance ≥ 90, Accessibility ≥ 90 (ARCHITECTURE-SEO-PERFORMANCE §0).
 * Run against a local production server:
 *   pnpm build && pnpm start &
 *   pnpm lighthouse:ci
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/products',
        // Prefer a real slug via COMPARE_PRODUCT_SLUG when available.
        process.env.COMPARE_PRODUCT_URL || 'http://localhost:3000/products',
      ],
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
        chromeFlags: '--no-sandbox',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
}
