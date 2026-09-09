import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// Stdlib-only .mjs, deliberately not TypeScript: a lockfile or a transpile
// problem must never be what stops a production probe from running in CI.
import { classify, declaredUrls, summarize } from '../../scripts/canonical-host-probe.mjs'

/**
 * THE GATE FOR "THE URL WE PUBLISH IS NOT THE URL WE SERVE".
 *
 * MEASURED 2026-09-09 against the live custom domain:
 *
 *   https://kenyonexpress.co.il/   308 -> https://www.kenyonexpress.co.il/
 *   <link rel="canonical" href="https://kenyonexpress.co.il"/>
 *   <meta property="og:url" content="https://kenyonexpress.co.il"/>
 *   every <loc> in /sitemap.xml    https://kenyonexpress.co.il/...
 *
 * Vercel serves `www` and redirects the apex. The code defaults the other way
 * (`NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'` in
 * `src/app/layout.tsx`). Both sides are internally consistent and they name
 * different hosts, so every canonical URL the site publishes is a redirect.
 *
 * WHY NOTHING SAW IT. `production-smoke.yml` probes the base it is handed and
 * never the host the page nominates; `deployed-cron-probe.mjs` asks about
 * routes, not hostnames; and every SEO test in `src/` compares rendered
 * metadata to a constant in this same repository, which is the half that is
 * not wrong.
 *
 * WHAT THIS FILE ASSERTS is the classification and the parsing, not the
 * network. A test that probed production would go red for reasons outside the
 * commit and be deleted within a week. The probe itself belongs in
 * `production-smoke.yml`, which is allowed to be red about production.
 *
 * The trap held shut here is `3xx === ok`. "It still resolves, Google follows
 * it" is true and is exactly the reasoning that would let this sit forever, and
 * it stops being true the day the redirect direction changes at Vercel without
 * anyone touching this repository. Then the canonical is a 404 and every gate
 * except this one is still green.
 */

describe('what the canonical probe calls healthy', () => {
  it('only a direct 200 passes', () => {
    expect(classify(200)).toEqual({ ok: true, verdict: 'served-directly' })
  })

  it('CANONICAL_IS_A_REDIRECT: 3xx is a failure, not a warning', () => {
    // The measured defect. 308 is what the apex answered on 2026-09-09.
    expect(classify(308)).toEqual({ ok: false, verdict: 'canonical-is-a-redirect' })
    for (const status of [301, 302, 303, 307]) {
      expect(classify(status).ok).toBe(false)
      expect(classify(status).verdict).toBe('canonical-is-a-redirect')
    }
  })

  it('does not call a missing or unreachable canonical healthy', () => {
    expect(classify(404)).toEqual({ ok: false, verdict: 'canonical-not-served' })
    expect(classify(0)).toEqual({ ok: false, verdict: 'no-response' })
    expect(classify(500).ok).toBe(false)
  })

  it('fails the run when any single declaration fails, and passes only when none do', () => {
    expect(summarize([{ ok: true }, { ok: true }]).exitCode).toBe(0)
    const oneBad = [{ ok: true }, { ok: false, url: 'https://kenyonexpress.co.il' }]
    expect(summarize(oneBad).exitCode).toBe(1)
    expect(summarize(oneBad).failed).toHaveLength(1)
  })
})

describe('which URLs count as declared', () => {
  const HTML = [
    '<link rel="canonical" href="https://kenyonexpress.co.il"/>',
    '<meta property="og:url" content="https://kenyonexpress.co.il"/>',
  ].join('')
  const SITEMAP = '<urlset><url><loc>https://kenyonexpress.co.il/</loc></url></urlset>'

  it('reads all three declarations, because they come from three code paths', () => {
    // metadata.alternates, metadata.openGraph and sitemap.ts are separate and
    // have drifted apart before, so a probe that read only the canonical would
    // miss a sitemap still pointing at the old host.
    const found = declaredUrls({
      html: [
        '<link rel="canonical" href="https://www.kenyonexpress.co.il/"/>',
        '<meta property="og:url" content="https://kenyonexpress.co.il/og"/>',
      ].join(''),
      sitemapXml: '<urlset><url><loc>https://old.example.com/</loc></url></urlset>',
    })
    expect(found.map((f) => f.source)).toEqual([
      'link rel=canonical',
      'og:url',
      'sitemap.xml first <loc>',
    ])
  })

  it('deduplicates when all three agree, so the common case costs one request', () => {
    const found = declaredUrls({ html: HTML, sitemapXml: SITEMAP })
    expect(found).toHaveLength(1)
    expect(found[0]?.url).toBe('https://kenyonexpress.co.il')
  })

  it('treats a trailing slash as the same URL and not a second one', () => {
    const found = declaredUrls({
      html: '<link rel="canonical" href="https://kenyonexpress.co.il/"/>',
      sitemapXml: '<urlset><url><loc>https://kenyonexpress.co.il</loc></url></urlset>',
    })
    expect(found).toHaveLength(1)
  })

  it('returns nothing rather than guessing when the page declares no address', () => {
    // main() turns this into exit 1 with its own message. A probe that invented
    // a URL here would report on a host the page never named.
    expect(declaredUrls({ html: '<html></html>', sitemapXml: '' })).toEqual([])
    expect(declaredUrls()).toEqual([])
  })
})

describe('the probe does not follow the redirect it exists to find', () => {
  it("requests the declared URL with redirect: 'manual'", () => {
    // Following redirects would turn the 308 into the 200 at the end of it and
    // report the defect as healthy. This is the whole mechanism, so it is
    // asserted against the source rather than left to a comment.
    const source = readFileSync(resolve(process.cwd(), 'scripts/canonical-host-probe.mjs'), 'utf8')
    expect(source).toContain("redirect: 'manual'")
  })
})
