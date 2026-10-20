/**
 * Lighthouse CI assertions for KenyonExpress storefront.
 *
 * Target: Performance ≥ 90, Accessibility ≥ 90 (ARCHITECTURE-SEO-PERFORMANCE §0).
 * Run against a local production server (any port; pnpm start falls back to
 * the next free port when PORT is taken, so pass the port you verified):
 *   pnpm build && PORT=3361 pnpm start &
 *   LHCI_BASE_URL=http://localhost:3361 pnpm lhci:autorun
 *
 * Scores land in .lighthouseci/reports/ (ignored) and are summarised by hand
 * into docs/LIGHTHOUSE-STATUS.md. Nothing is uploaded anywhere: the earlier
 * `temporary-public-storage` target published the HTML reports to a public
 * Google bucket (see .lighthouseci/links.json), which is not wanted for a
 * build of a storefront that is not yet live.
 *
 * READ docs/PERFORMANCE-BUDGET.md before acting on a red Performance score:
 * on localhost the throttling is simulated and two runs of one tree can
 * differ by 5-10 points. numberOfRuns 3 makes lhci take the median.
 */
const base = (
  process.env.LHCI_BASE_URL ??
  process.env.LOCAL_BASE ??
  'http://localhost:3000'
).replace(/\/$/, '')
const productPath = process.env.COMPARE_PRODUCT_SLUG
  ? `/product/${encodeURIComponent(process.env.COMPARE_PRODUCT_SLUG)}`
  : '/products'

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/products`, `${base}${productPath}`],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        chromeFlags: '--no-sandbox --headless=new',
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
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%.%%EXTENSION%%',
    },
  },
}
