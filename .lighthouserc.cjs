/**
 * Lighthouse CI assertions for the KenyonExpress storefront.
 *
 * THIS FILE IS THE lhci SPELLING OF THE BUDGETS, NOT THE GATE.
 * The gate CI actually runs is `pnpm lighthouse:budgets`
 * (scripts/lighthouse-budgets.mjs), because `@lhci/cli` is not a dependency of
 * this repo and cannot become one cheaply: `npm install` does not work here at
 * all (AGENTS.md), and `lighthouse` itself is already installed. This config is
 * kept in step so that anyone who does run lhci gets the same answer, and so
 * the numbers have one authoritative home per tool rather than three.
 *
 * The two web-vitals budgets are `error`, because they are the contract:
 *   LCP  < 2500ms
 *   CLS  < 0.1
 *
 * The category scores stay `warn`. A score is a weighted blend of ten metrics
 * and a single point of movement in any of them can flip it; failing a PR on
 * that teaches people to re-run CI until it passes, which is how a gate stops
 * being read at all.
 *
 * Run against a local production server:
 *   pnpm build && PORT=3311 pnpm start &
 *   LOCAL_BASE=http://localhost:3311 pnpm lighthouse:budgets
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/products',
        // The product page. Prefer a real slug: the catalogue is DB-driven with
        // Hebrew slugs, and a 404 passes every budget there is.
        process.env.COMPARE_PRODUCT_URL ||
          process.env.LH_PRODUCT_URL ||
          'http://localhost:3000/product/e2e-test-physical',
      ],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
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
