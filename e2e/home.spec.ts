import { expect, test } from '@playwright/test'
// Relative, not the `@/` alias: no other spec uses the alias, and this import
// only has to reach one dependency-free module.
import {
  CONSENT_PREPAINT_SCRIPT,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'

test.describe('homepage', () => {
  test('loads with RTL layout and the Hebrew locale', async ({ page }) => {
    await page.goto('/')

    // Hebrew, not the Latin brand name. The SEO pass made every customer-facing
    // title Hebrew on purpose (`src/app/layout.tsx` serves
    // "קניון אקספרס | קופונים ומבצעים"); this assertion was left behind and
    // failed against the title the page actually serves. Carried over from the
    // ke-verify worktree, which held it uncommitted.
    await expect(page).toHaveTitle(/קניון אקספרס/)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('dir', 'rtl')
    await expect(html).toHaveAttribute('lang', 'he')
  })

  /**
   * THE SITE HAS NO SEARCH FIELD, asserted against the rendered DOM.
   *
   * `src/components/layout/no-search-ui.test.ts` reads the source; this reads
   * the page. Both are needed: source can be clean while a third-party widget
   * or a dynamic import puts an input on screen, and a rendered check alone
   * cannot see a component sitting in the tree waiting to be imported again.
   *
   * The newsletter's address field is the one input the shell carries. It
   * subscribes and never queries the catalogue, so it is matched by name here
   * rather than exempted by a blanket count.
   */
  test('renders no search field anywhere in the shell', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('input[type="search"]')).toHaveCount(0)
    await expect(page.locator('[role="search"], [role="searchbox"]')).toHaveCount(0)

    const typed = page.locator('input:not([type="hidden"])')
    for (const input of await typed.all()) {
      const type = await input.getAttribute('type')
      expect(type, 'the newsletter address field is the only input the shell may carry').toBe(
        'email',
      )
    }
  })

  test('renders product links with add-to-cart buttons', async ({ page }) => {
    await page.goto('/')

    const productLink = page.locator('a[href^="/product/"]').first()
    await expect(productLink).toBeVisible({ timeout: 15000 })

    // Deal cards expose add-to-cart via Hebrew aria-label (revealed on hover,
    // so assert presence rather than visibility)
    await expect(page.getByRole('button', { name: /הוסף .* לעגלה/ }).first()).toBeAttached()
  })

  /**
   * The deal card image has to occupy a box, not merely exist.
   *
   * This is an end-to-end test and not a unit one because jsdom has no layout
   * engine, and layout is the entire failure: `.p_con__image-wrap` sets no
   * height of its own and takes it from the in-flow image inside it. Giving
   * that image next/image's `fill` writes `position:absolute` as an inline
   * style, the wrap loses the only thing it was measuring, and it collapses.
   *
   * All 32 cards on the homepage shipped that way. The images were fetched and
   * decoded - naturalWidth 459 - and painted into a box of 239x0, so nothing
   * errored, no request failed, and the Lighthouse score the change was made
   * for went up. The page came out 3504px instead of 5492px and the homepage
   * pixel diff doubled to 22.4%. Every signal that was being watched said the
   * change was an improvement.
   */
  test('deal card images occupy a box, not just load', async ({ page }) => {
    await page.goto('/')
    const img = page.locator('.p_con__image').first()
    await expect(img).toBeVisible({ timeout: 15000 })

    const painted = await img.evaluate((el: HTMLImageElement) => ({
      height: Math.round(el.getBoundingClientRect().height),
      width: Math.round(el.getBoundingClientRect().width),
      naturalWidth: el.naturalWidth,
    }))

    expect(painted.naturalWidth, 'the image never decoded').toBeGreaterThan(0)
    // 245px is live's card image height, pinned in product-card-deals.css.
    // Asserting a real box rather than the exact number keeps this a guard
    // against collapse and not a second copy of the stylesheet.
    expect(painted.height, 'image box collapsed to zero height').toBeGreaterThan(100)
    expect(painted.width).toBeGreaterThan(100)
  })

  /**
   * ...and it has to be the SAME box on every card.
   *
   * The test above deliberately asserts "not collapsed" rather than a number,
   * and that looseness is what let the next one through. [35] put
   * `style={{ width: 'auto', height: 'auto' }}` on the card image to silence
   * next/image's "width or height modified, but not the other" console line.
   * An inline style beats a class, so `.p_con__image`'s `height: 245px` stopped
   * applying and every thumb rendered at its own source aspect: measured 31 of
   * 31 off the pin, from 124px to 361px. Nothing collapsed, so the guard above
   * stayed green, and the homepage pixel gate went 11.26-11.62% -> 24.16%.
   *
   * The warning that bought is dev-only (guarded by NODE_ENV in
   * next/dist/client/image-component.js:84) and cannot be avoided here anyway:
   * rendering at live's aspect means the rendered width is not the declared 400.
   *
   * Every card, not the first: a rule that stops applying stops applying
   * everywhere, but a single sample happens to look right whenever the source
   * artwork is near 245 tall.
   */
  test('every deal card image is pinned to the same 245px height', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.p_con__image').first()).toBeVisible({ timeout: 15000 })

    const heights = await page
      .locator('.p_con__image')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))

    expect(heights.length, 'no deal cards on the homepage to measure').toBeGreaterThan(10)
    const offPin = heights.filter((h) => h !== 245)
    expect(
      offPin,
      `deal thumbs off the 245px pin in src/styles/product-card-deals.css: ${offPin.join(', ')}`,
    ).toHaveLength(0)
  })

  /**
   * The optimizer has to actually optimize, not fall back to the source.
   *
   * `optimizeImage` in next/dist/server/image-optimizer.js wraps its work in a
   * try/catch whose catch returns the ORIGINAL bytes with the original content
   * type, and it does not log. So a sharp that cannot decode an input produces
   * a response that is a valid image, has a 200, and is byte-for-byte the
   * source file - identical at every `w` the browser could ask for.
   *
   * That is exactly what shipped. pnpm gave next its own sharp 0.34.5 while the
   * app resolved the 0.35.3 it declares, and 0.34.5 (libvips 8.17.3) throws
   * `source: bad seek` on this repo's AVIF product images. Every AVIF was
   * delivered at its full 2048px source: 93KB per deal card, 32 of them, to
   * paint 157px boxes on a phone. Measured 93264 -> 4176 bytes at w=288 once
   * one sharp was pinned for the whole tree.
   *
   * Compares the optimizer's answer AT TWO WIDTHS, rather than against the
   * source's byte count, so it keeps meaning something when the artwork is
   * replaced and when the codec changes. See the note on the assertion.
   */
  test('the image optimizer re-encodes per width instead of passing the source through', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    const img = page.locator('.p_con__image').first()
    await expect(img).toBeVisible({ timeout: 15000 })

    const optimizedUrl = await img.evaluate((el: HTMLImageElement) => el.currentSrc)
    expect(optimizedUrl, 'deal card is not going through the optimizer').toContain('/_next/image')

    const sourceUrl = new URL(optimizedUrl).searchParams.get('url')
    expect(sourceUrl, 'optimizer URL carries no source').toBeTruthy()

    const [optimized, source] = await Promise.all([
      request.get(optimizedUrl),
      request.get(sourceUrl as string),
    ])
    const optimizedBytes = (await optimized.body()).length
    const sourceBytes = (await source.body()).length
    expect(sourceBytes, 'source image did not load').toBeGreaterThan(0)

    // The bug this test exists for is the pass-through: when sharp cannot
    // decode the source, next catches the throw and serves the ORIGINAL bytes
    // with a 200 and no log, identically at every `w`. So identical bytes
    // across two widths is the actual signature, and that is what is asserted.
    //
    // It used to assert `optimized < source / 2` instead, which is not an
    // invariant of a working optimizer. The sources here are AVIF and the
    // output is WebP; on a phone the deal card legitimately asks for a rung
    // where WebP is LARGER than the AVIF it came from. Measured on this build:
    // w=256 -> 9304B, w=384 -> 16808B, w=640 -> 27952B against a 22062B source.
    // The optimizer was working correctly and the old assertion called it a
    // failure the moment the mobile project started running this file.
    const twoWidths = await Promise.all(
      [256, 640].map(async (w) => {
        const u = new URL(optimizedUrl)
        u.searchParams.set('w', String(w))
        return (await (await request.get(u.toString())).body()).length
      }),
    )

    expect(
      twoWidths[0],
      `optimizer returned ${twoWidths[0]}B at w=256 and ${twoWidths[1]}B at w=640 - identical bytes at different widths is exactly what a pass-through fallback looks like`,
    ).not.toBe(twoWidths[1])
    const [small, large] = twoWidths as [number, number]
    expect(small, 'w=256 should be cheaper than w=640').toBeLessThan(large)
    expect(optimizedBytes, 'optimizer returned nothing').toBeGreaterThan(0)
  })

  /**
   * A phone must not be handed the desktop hero raster.
   *
   * The five slide images sit in a full-bleed box that is only `h-[42%]` of the
   * slider, and the frames are near-square under `object-contain`, so height is
   * the constraint: measured at 320/360/390/412/768/1023 the painted width is a
   * constant 174-193px at every one of them. They declared `100vw` anyway, so a
   * 412px phone at dpr 1.75 asked the optimizer for 750px - four slides at
   * 55-96KB each to paint 193px.
   *
   * The assertion is on the `w` the browser actually picked out of the srcset,
   * because that is the byte count. A viewport is set explicitly rather than
   * inherited from the desktop project: this only means anything below 1024px.
   */
  test('the hero serves a phone-sized raster to a phone', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 823 })
    await page.goto('/')
    await page.waitForTimeout(2500)

    const picked = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        // The app slide's store badge lives in the copy column and is a
        // different box with its own sizes, so it is not one of these five.
        .filter((el) => !el.closest('.hero-copy-column'))
        .map((el) => (el as HTMLImageElement).currentSrc)
        .filter((src) => /hero(%2F|\/)slider/.test(src))
        .map((src) => Number(new URL(src, location.href).searchParams.get('w')))
        .filter((w) => Number.isFinite(w) && w > 0),
    )

    expect(picked.length, 'no hero slide image resolved').toBeGreaterThan(0)

    // The bound is DERIVED from the device pixel ratio, not hardcoded.
    //
    // It used to be a flat 384, which is the rung above 193 * 1.75 -- correct
    // for the 412px dpr-1.75 phone this test was written against, and wrong the
    // moment it also ran under the `mobile-chrome` project, whose Pixel 5 is
    // dpr 2.75. There 193 * 2.75 is 531 and the smallest rung that covers it is
    // 640, so the browser was doing exactly the right thing and the assertion
    // called it a regression. Setting a viewport does not change the ratio; it
    // comes from the project.
    //
    // What this actually guards is unchanged: that the slide asks for the rung
    // its 193px paint needs and not one above it. With `100vw` back in place
    // the request goes to the full viewport width and still fails.
    const dpr = await page.evaluate(() => window.devicePixelRatio)
    const RUNGS = [16, 32, 48, 64, 96, 128, 256, 288, 384, 640, 750, 828, 1080, 1200, 1920, 2048]
    const needed = 193 * dpr
    const allowed = (RUNGS.find((r) => r >= needed) ?? RUNGS[RUNGS.length - 1]) as number

    for (const w of picked) {
      expect(
        w,
        `hero slide fetched at w=${w} for a 193px paint at dpr ${dpr} (rung ${allowed} covers it)`,
      ).toBeLessThanOrEqual(allowed)
    }
  })

  /**
   * The consent banner's paragraph is 382x91 on a 412px phone: the largest
   * element in the viewport, so it IS the homepage's LCP element. While it was
   * gated on a useEffect it could not paint until hydration finished, which on
   * an emulated slow-4G link with 4x CPU throttling put it at 3.7-3.9s against
   * a 1.0s first paint. It now paints AT first paint, in all three runs.
   *
   * Asserted on the RESPONSE BYTES rather than on the rendered page, because
   * the rendered page cannot tell the two apart: React puts the same section in
   * the DOM either way, a few hundred milliseconds later. What changed is that
   * it is in the document the server sent.
   */
  test('consent banner ships in the HTML, not built by React', async ({ request }) => {
    const html = await (await request.get('/')).text()

    expect(html, 'banner is not in the server response').toContain('data-consent-banner')
    expect(html, 'banner text is not in the server response').toContain('אנחנו אוספים נתוני שימוש')
  })

  test('consent banner is visible to a visitor who has not decided', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('[data-consent-banner]')).toBeVisible()
  })

  /**
   * With script off the banner has to be gone, and that is not the same rule as
   * the one above.
   *
   * The decision lives in a cookie only script can read, so a no-script visitor
   * cannot be recognised as having answered and would be shown the banner on
   * every page with two buttons that do nothing. There is also nothing to
   * consent to: the analytics it gates is itself script. A <noscript> style in
   * the layout hides it. This test asserted the opposite when it was written,
   * and the E2E run is what said so.
   */
  test('consent banner is absent when script is off', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')

    await expect(page.locator('[data-consent-banner]')).toBeAttached()
    await expect(page.locator('[data-consent-banner]')).toBeHidden()
    await context.close()
  })

  /**
   * The pre-paint snippet has to reach the browser AS WRITTEN.
   *
   * This is not paranoia about a string. The first build of this change shipped
   * a snippet with three chunks of its source silently missing, because it was
   * authored as four template literals joined by `+` and the production build
   * folds that by OVERWRITING each operand's trailing text with the next
   * operand's leading text instead of joining them. What arrived was still
   * valid-looking JavaScript, it was served with a 200, and it threw at parse
   * time in every visitor's browser - so the banner was simply never hidden and
   * nothing anywhere reported a problem. Written as ONE template literal it
   * compiles intact (verified against .next/server/chunks on both shapes).
   *
   * Comparing the served bytes to the module constant is the only assertion
   * that can catch that class of failure: every other test in this file runs
   * the shipped code, so a snippet that is mangled but still parses passes them
   * all.
   */
  test('the pre-paint consent snippet survives the build byte for byte', async ({ request }) => {
    const html = await (await request.get('/')).text()

    expect(html, 'pre-paint snippet is not in the response as written').toContain(
      CONSENT_PREPAINT_SCRIPT,
    )
  })

  test('consent banner is hidden for a visitor who decided', async ({ context, page, baseURL }) => {
    await context.addCookies([
      {
        name: 'ke_consent',
        // Built from the constant, not spelled out. This was hardcoded to
        // `granted.1` and went red the moment CONSENT_WORDING_VERSION was
        // bumped 1 -> 2, which is the version field doing exactly its job:
        // a decision made against superseded wording is not consent, so the
        // pre-paint snippet correctly refused to mark the document and the
        // test read that as a broken snippet.
        value: serializeConsent({ decision: 'granted', wordingVersion: CONSENT_WORDING_VERSION }),
        domain: new URL(baseURL as string).hostname,
        path: '/',
      },
    ])
    await page.goto('/')

    // Attached but not visible: the markup is the same for every visitor, so
    // the response stays cacheable, and CSS - not React - does the hiding. The
    // attribute is asserted too, because `display:none` from any other source
    // would satisfy toBeHidden and say nothing about the snippet having run.
    await expect(page.locator('html')).toHaveAttribute('data-consent', 'decided')
    await expect(page.locator('[data-consent-banner]')).toBeAttached()
    await expect(page.locator('[data-consent-banner]')).toBeHidden()
  })

  test('offers category navigation into the archives', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('a[href^="/category/"]').first()).toBeAttached({ timeout: 15000 })
  })

  test('shows a cart control in the header before anything is added', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /עגלת קניות/ }).first()).toBeVisible()
  })

  test('search results page finds products', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent('צימר')}`)
    await expect(page.getByRole('heading', { name: /תוצאות חיפוש/ })).toBeVisible()
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible()
  })

  test('short query shows the minimum-characters hint', async ({ page }) => {
    await page.goto('/search?q=a')
    await expect(page.getByText('הקלידו לפחות 2 תווים כדי לחפש')).toBeVisible()
  })

  test('a search term with SQL wildcards is treated as text, not a pattern', async ({ page }) => {
    // Guards the LIKE/PostgREST escaping fix (commit 876aae0): these must not
    // error the request or silently match everything.
    for (const term of ['%%', '100%_x', 'a,b']) {
      const response = await page.goto(`/search?q=${encodeURIComponent(term)}`)
      expect(response?.status(), term).toBe(200)
      await expect(page.getByRole('heading', { name: /תוצאות חיפוש/ })).toBeVisible()
    }
  })

  /**
   * EVERY CATEGORY LINK ON THE HOME PAGE MUST LEAD SOMEWHERE.
   *
   * The page carries two sets of hard-coded category hrefs - the five strip
   * tiles, and one per card in the 32-card deals grid - and neither is derived
   * from the categories table, so nothing connected them to what exists. Four
   * of the deal cards are labelled "כללי" and pointed at `/category/general`,
   * a category this catalogue does not have and has no plan to have.
   *
   * It survived because the route answered a soft `200` for an unknown slug.
   * Nothing that looked at status codes could see it, INCLUDING "reaching the
   * footer costs no 404s" - and that test still cannot see it, because a
   * category link on this page is never prefetched. So the links are collected
   * and requested outright.
   */
  test('every category link on the home page resolves', async ({ page, request }) => {
    await page.goto('/')
    const hrefs = [
      ...new Set(
        await page
          .locator('a[href^="/category/"]')
          .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '')),
      ),
    ].filter(Boolean)

    // The strip alone is five, so an empty list means the selector broke rather
    // than that the page is clean.
    expect(hrefs.length).toBeGreaterThanOrEqual(5)

    const dead: string[] = []
    for (const href of hrefs) {
      const status = (await request.get(href)).status()
      if (status !== 200) dead.push(`${status} ${href}`)
    }
    expect(dead, dead.join(', ')).toEqual([])
  })

  /**
   * The homepage ships ONE stylesheet.
   *
   * Every stylesheet imported by a route segment becomes its own chunk and its
   * own render-blocking <link>. This page had four; three of them carried 8.6KB
   * between them and Lighthouse mobile charged 304ms for each, 870ms in total.
   * They now live in the root layout (see the note there) and arrive in one
   * request.
   *
   * The count is the assertion, not the bytes: nothing warns when a new
   * `import '@/styles/x.css'` inside a page or a component adds a round trip to
   * the critical path, and it is invisible in the diff that adds it.
   */
  test('the homepage costs one render-blocking stylesheet', async ({ page }) => {
    await page.goto('/')

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map((l) => (l as HTMLLinkElement).getAttribute('href') ?? '')
        // next/font injects its own <link> for the self-hosted Heebo; this is
        // about the CSS chunks the app's own imports produce.
        .filter((href) => href.endsWith('.css')),
    )

    expect(sheets, `homepage stylesheets: ${sheets.join(', ')}`).toHaveLength(1)
  })

  /**
   * Nothing the homepage asks for may 404, INCLUDING what it prefetches.
   *
   * The footer and the masthead carry six links copied over from the live
   * WordPress theme, four of which have no page in this app. next prefetches a
   * link when it scrolls into view, so reaching the bottom of any page on the
   * site fired six 404s - six full renders on a `no-store` app, per page view,
   * for links nobody clicked. Two of the six were simply pointing at the
   * WordPress path for a page that does exist here.
   *
   * The scroll is the test: without it the footer never enters the viewport and
   * the prefetches never happen, which is exactly why this was invisible.
   */
  test('reaching the footer costs no 404s', async ({ page }) => {
    const failed: string[] = []
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      // /_vercel/insights/script.js and /_vercel/speed-insights/script.js are
      // injected by @vercel/analytics and served by the PLATFORM, not by this
      // app. They 404 on every localhost run and always will, so counting them
      // makes a test about our own prefetches impossible to pass anywhere but a
      // deployment. Our links are still counted.
      if (pathname.startsWith('/_vercel/')) return
      if (r.status() >= 400) failed.push(`${r.status()} ${pathname}`)
    })

    await page.goto('/')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    // Prefetch is queued off the intersection observer, not awaited by anything.
    await page.waitForTimeout(3000)

    expect(failed, failed.join(', ')).toEqual([])
  })

  /**
   * The hero must NOT advance on its own before the visitor has interacted, and
   * must advance after.
   *
   * Both halves are the test, and the second half is the reason it exists.
   * Revealing a slide is a late paint of a large element, and on a 412px phone
   * over real slow 4G that is what set the homepage's LCP: 9096ms against a
   * 900ms first paint, for an element 1% larger than the one already on screen
   * (see the note on the autoplay effect in HeroSlider.tsx). Gating the
   * interval on input takes LCP to 884-904ms. But a gate that never opens is a
   * carousel that is quietly broken, and nothing else in this suite would say
   * so, because every other assertion here is about the FIRST slide.
   *
   * 7 seconds is deliberately longer than one 5000ms interval, so a slider that
   * still autoplays fails rather than races.
   */
  test('the hero holds its first slide until the visitor interacts, then rotates', async ({
    page,
  }) => {
    await page.goto('/')
    const slider = page.locator('[data-hero-slider]')
    // ONE slider, and waiting for that is the point.
    //
    // The homepage renders `<Suspense fallback={<HeroSection />}><CmsHero /></Suspense>`,
    // so the authored hero ships as the fallback and the CMS hero replaces it.
    // Both carry data-hero-slider, and both are in the response: `curl` counts
    // the attribute twice. React removes the fallback on hydration, and the
    // hydrated DOM measured at rest holds exactly one. Under the full suite at
    // two workers hydration is slower, this assertion arrived inside that
    // window, and strict mode failed on "resolved to 2 elements" - a race in
    // the test, not a duplicate hero.
    await expect(slider).toHaveCount(1)
    await expect(slider).toBeVisible()

    const activeDot = () => slider.locator('button[aria-current="true"]').getAttribute('aria-label')

    expect(await activeDot()).toBe('שקופית 1')
    await page.waitForTimeout(7000)
    expect(await activeDot(), 'hero advanced without any interaction').toBe('שקופית 1')

    // A press anywhere, not on the slider: the gate is on the document, because
    // what closes the LCP window is any input on the page.
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await expect
      .poll(activeDot, { timeout: 12000, message: 'hero never rotated after interaction' })
      .not.toBe('שקופית 1')
  })

  /**
   * The desktop hero paints the optimized still first and swaps the animation
   * in only after the animated file has fully arrived.
   *
   * Both halves are the test, for the same reason the autoplay test above
   * guards both of its halves. The first half is the LCP fix of [22](ד): with
   * the animated `<source>` in the initial markup plus its head preload, the
   * desktop's first hero paint waited for all 794404 bytes and LCP was
   * 12.1-12.9s on slow 4G + cpu/4 against a ~1s FCP. The second half is [16]'s
   * measured trade - desktop gets the animation - which the swap must still
   * honour; without this assertion, deleting the swap effect would pass every
   * other test in the suite and quietly serve desktops a still forever.
   *
   * The animated file is held on the wire because localhost cannot show the
   * pre-swap state otherwise: download and swap land inside the first second.
   * Holding the request is the slow connection, made deterministic.
   */
  test('the desktop hero paints the still first, then swaps in the animation once it arrives', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    let releaseAnimation = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseAnimation = resolve
    })
    await page.route('**/*animation-steps.webp', async (route) => {
      await gate
      await route.continue()
    })

    await page.goto('/')

    // Same Suspense fallback race as the autoplay test above: until React drops
    // the fallback there are two sliders, and `.first()` would measure the one
    // that is about to be removed.
    await expect(page.locator('[data-hero-slider]')).toHaveCount(1)
    const heroImg = page.locator('[data-hero-slider] picture img').first()
    await expect
      .poll(() => heroImg.evaluate((el: HTMLImageElement) => el.currentSrc), {
        message: 'hero never painted the optimized still',
      })
      .toContain('animation-still')
    expect(
      await page.locator('[data-hero-slider] picture source').count(),
      'animated <source> mounted before its file arrived',
    ).toBe(0)

    releaseAnimation()
    await expect
      .poll(() => heroImg.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15000,
        message: 'desktop never swapped the animation in - the [16] trade was silently reversed',
      })
      .toContain('animation-steps')
  })
})
