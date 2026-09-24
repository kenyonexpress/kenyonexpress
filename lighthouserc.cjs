/**
 * Lighthouse CI (`@lhci/cli`) configuration.
 *
 * Run with `pnpm lighthouse:ci` against a server already listening on
 * LOCAL_BASE (default http://localhost:3000). In CI, LHCI_START_SERVER=1 has
 * lhci boot `pnpm start` itself from the downloaded build artifact, so the
 * production build the E2E job tests is the one that gets scored, not a
 * second one compiled here.
 *
 * WHICH ASSERTIONS ARE ERRORS AND WHICH ARE WARNINGS, AND WHY.
 *
 * Accessibility, best practices and SEO are deterministic audits of the
 * document: the same HTML gives the same score on every machine. Those are
 * `error` at 0.9, the floor scripts/lighthouse-smoke.mjs has always used, and
 * a drop below it is a real regression in the page.
 *
 * Performance is NOT deterministic on a CI runner. docs/PERFORMANCE-BUDGET.md
 * records the measurement: Lighthouse's default `simulate` throttling models
 * a mid-tier phone from an unthrottled load, and two consecutive runs of an
 * unchanged tree returned 75 and 70, a 5-point spread larger than most real
 * changes. A blocking gate on that number would fail on runner load and pass
 * on luck, and a red that says nothing about the code teaches people to
 * ignore red. So performance is `warn`, the run collects THREE samples and
 * asserts on the median, and the page-weight budgets below are the part that
 * IS deterministic: total bytes, script bytes, request counts and the CLS the
 * layout-stability spec already guards. A budget breach is a regression
 * whatever the simulated score says.
 *
 * The URL list is the storefront's public surface: home, catalogue, cart and
 * login. Product and category pages need a real slug, which is DB-driven and
 * Hebrew, so they are measured by scripts/lighthouse-sweep.mjs locally rather
 * than hard-coded here to rot with the seed. Checkout needs a cart, which
 * Lighthouse cannot create; see the assert block for what happened when it
 * was listed anyway.
 */

const base = (process.env.LOCAL_BASE ?? 'http://localhost:3000').replace(/\/$/, '')

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/products`, `${base}/cart`, `${base}/login`],
      numberOfRuns: 3,
      // CI sets LHCI_START_SERVER=1 and lets lhci boot the production build
      // from the downloaded artifact; locally the server is already up.
      ...(process.env.LHCI_START_SERVER
        ? {
            startServerCommand: 'pnpm start',
            startServerReadyPattern: 'Ready in',
            startServerReadyTimeout: 120_000,
          }
        : {}),
      settings: {
        // The audits that matter for a storefront; PWA was removed upstream.
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        chromeFlags: '--headless=new --no-sandbox --disable-gpu',
        // he-IL, like the Playwright suite, so the RTL document is what is scored.
        locale: 'he',
      },
    },
    assert: {
      // Per-URL-pattern assertions. Measured locally 2026-09-17 before the
      // matrix existed, 12 runs: the one global list failed on three things
      // that are the DESIGN, not regressions, and would have taught people
      // to ignore this job on its first run.
      //
      //  - /cart is `noindex`, so `is-crawlable` scores 0 and the SEO category
      //    lands at 0.69 by construction. SEO is asserted on the indexable
      //    pages only.
      //  - Every page carries one or two Next CSS chunks in <head>, which
      //    Lighthouse counts as render-blocking (150-300 ms simulated). That
      //    is how a stylesheet works; the assertion is a warning with a
      //    ceiling of 2 so a THIRD blocking resource still shows up.
      //  - /checkout with an empty cart redirects to /cart client-side and
      //    the swap scores CLS 0.36. Lighthouse cannot fill a cart, so
      //    /checkout is not in the URL list; e2e/visual.spec.ts snapshots the
      //    populated checkout form instead.
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          // Median of the three runs, not the worst one: the variance is the
          // runner's, not the page's.
          aggregationMethod: 'median',
          assertions: {
            'categories:accessibility': ['error', { minScore: 0.9 }],
            'categories:best-practices': ['error', { minScore: 0.9 }],
            'categories:performance': ['warn', { minScore: 0.8 }],

            // Deterministic budgets, measured 2026-09-06 (docs/PERFORMANCE-BUDGET.md):
            // 703 KiB total, 311 KiB of JavaScript in 21 requests, CLS 0. Each
            // ceiling leaves headroom for ordinary growth and fails on the kind
            // of change that once shipped a 777 KB animated hero.
            'resource-summary:total:size': ['error', { maxNumericValue: 1_200_000 }],
            'resource-summary:script:size': ['error', { maxNumericValue: 600_000 }],
            'resource-summary:image:size': ['error', { maxNumericValue: 800_000 }],
            'resource-summary:third-party:count': ['warn', { maxNumericValue: 10 }],
            'render-blocking-resources': ['warn', { maxLength: 2 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],

            // Informational: useful in the report, too noisy to gate on.
            'uses-responsive-images': 'off',
            'unused-javascript': 'off',
            'unused-css-rules': 'off',
            'bf-cache': 'off',
            'non-composited-animations': 'off',
          },
        },
        {
          // The indexable storefront pages: home and the catalogue.
          matchingUrlPattern: '^https?://[^/]+/(products/?)?$',
          aggregationMethod: 'median',
          assertions: {
            'categories:seo': ['error', { minScore: 0.9 }],
          },
        },
      ],
    },
    upload: {
      // Kept as a CI artifact (.lighthouseci/) and, when LHCI_GITHUB_APP_TOKEN
      // is set, posted as a status check. No LHCI server is involved.
      target: 'filesystem',
      outputDir: '.lighthouseci',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%',
    },
  },
}
