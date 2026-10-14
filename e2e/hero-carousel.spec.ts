import { expect, test } from '@playwright/test'

/**
 * UX05: THE HERO CAROUSEL IN A BROWSER. hero-carousel.test.tsx proves the
 * component logic in jsdom; this proves what Chromium does with it on the
 * built page, which is where the "before" was measured (logs/ux05/before.json,
 * 14.10.2026, at 380 and 1440):
 *
 *   swipe     a 120px touch swipe either way left the slider on slide 1
 *   progress  no indicator of any kind on the current dot
 *   status    no text position for assistive tech
 *   lazy      every slide mounted its media the moment the visitor engaged
 *
 * The swipe is driven through CDP Input.dispatchTouchEvent, because
 * page.touchscreen only taps and page.mouse is a mouse, which the handler
 * ignores by design (live's RS touchOnDesktop is off). Both projects run on
 * Chromium, so the CDP session is available on both.
 *
 * The LCP gate (home.spec: "holds its first slide until the visitor
 * interacts") is not re-asserted here; it is unchanged and that spec owns it.
 */

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

async function settledSlider(page: Page) {
  const slider = page.locator('[data-hero-slider]')
  // The CMS hero replaces the Suspense fallback on hydration; wait for one.
  await expect(slider).toHaveCount(1)
  await expect(slider).toBeVisible()
  return slider
}

const activeDot = (page: Page) =>
  page.locator('[data-hero-slider] button[aria-current="true"]').getAttribute('aria-label')

async function swipe(page: Page, { x0, x1, y }: { x0: number; x1: number; y: number }) {
  const cdp = await page.context().newCDPSession(page)
  const steps = 8
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/**
 * Engage the page off the slider, so the hover pause is not holding the timer.
 * Polled: the pointerdown listener is attached in an effect AFTER the slider is
 * in the DOM, and on a loaded machine (this spec first ran beside the parity
 * gate and four other specs) a single click landed in that gap and started
 * nothing. `ready` is the signal that the click took; it defaults to the
 * running progress fill, which reduced motion never shows.
 */
async function engage(page: Page, ready = '[data-hero-slider] [data-hero-progress="running"]') {
  await expect
    .poll(
      async () => {
        await page.locator('body').click({ position: { x: 5, y: 5 } })
        return page.locator(ready).count()
      },
      { message: 'the hero never engaged' },
    )
    .toBeGreaterThan(0)
}

/** How many slides have mounted their media (placeholder or raster). */
const mountedSlides = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-hero-slider] > [aria-hidden]')].filter((s) =>
        s.querySelector('[data-awaiting-photography], img'),
      ).length,
  )

test.beforeEach(async ({ page }) => {
  await preset(page)
})

test('a touch swipe pages the hero: right is next in RTL, left is back, a short drag is nothing', async ({
  page,
}) => {
  await page.goto('/')
  const slider = await settledSlider(page)
  expect(await activeDot(page)).toBe('שקופית 1')

  const box = await slider.boundingBox()
  expect(box).not.toBeNull()
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2
  const x = (box?.x ?? 0) + (box?.width ?? 0) * 0.4

  await swipe(page, { x0: x, x1: x + 120, y })
  await expect.poll(() => activeDot(page), { message: 'swipe right did not page' }).toBe('שקופית 2')

  await swipe(page, { x0: x + 120, x1: x, y })
  await expect
    .poll(() => activeDot(page), { message: 'swipe left did not page back' })
    .toBe('שקופית 1')

  await swipe(page, { x0: x, x1: x + 30, y })
  await page.waitForTimeout(400)
  expect(await activeDot(page), 'a 30px drag paged').toBe('שקופית 1')
})

test('the current dot carries a 5s progress fill while rotating and reads full at rest', async ({
  page,
}) => {
  await page.goto('/')
  await settledSlider(page)
  const fill = page.locator('[data-hero-slider] button[aria-current="true"] [data-hero-progress]')
  await expect(fill).toHaveAttribute('data-hero-progress', 'idle')
  expect(await fill.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')

  await engage(page)
  await expect(fill).toHaveAttribute('data-hero-progress', 'running')
  const running = await fill.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      name: s.animationName,
      duration: s.animationDuration,
      timing: s.animationTimingFunction,
      origin: s.transformOrigin,
    }
  })
  expect(running.name).toBe('hero-progress')
  expect(running.duration).toBe('5s')
  expect(running.timing).toBe('linear')
  // Grows from the right edge of the 30px bar, the inline start in RTL.
  expect(running.origin).toMatch(/^30px/)
  // And the bar under it is the idle grey, so the fill is visible against it.
  // Polled: the bar carries the dots' 200ms transition-all, so the first read
  // after the attribute flips is still mid-fade from the brand yellow.
  await expect
    .poll(() =>
      fill.evaluate((el) => getComputedStyle(el.parentElement as Element).backgroundColor),
    )
    .toBe('rgba(125, 125, 125, 0.5)')

  // Hovering the slider pauses the timer and the fill reads full again.
  const slider = page.locator('[data-hero-slider]')
  await slider.hover({ position: { x: 20, y: 20 } })
  await expect(fill).toHaveAttribute('data-hero-progress', 'idle')
})

test('the slide position is a visually hidden live status', async ({ page }) => {
  await page.goto('/')
  await settledSlider(page)
  const status = page.locator('[data-hero-slider] [data-hero-status]')
  await expect(status).toHaveText('שקופית 1 מתוך 5')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status).toHaveAttribute('aria-atomic', 'true')
  const box = await status.boundingBox()
  expect(box?.width ?? 0, 'the status is painted').toBeLessThanOrEqual(1)

  await page.locator('[data-hero-slider] button[aria-label="שקופית 3"]').click()
  await expect(status).toHaveText('שקופית 3 מתוך 5')
})

test('media mounts one slide ahead after engagement, not all at once', async ({ page }) => {
  await page.goto('/')
  await settledSlider(page)
  expect(await mountedSlides(page)).toBe(1)

  await engage(page)
  await expect.poll(() => mountedSlides(page)).toBe(2)

  // After the first tick slide 2 is active, slide 3 is next, slide 1 stays.
  await expect
    .poll(() => activeDot(page), { timeout: 8000, message: 'hero never rotated' })
    .toBe('שקופית 2')
  await expect.poll(() => mountedSlides(page)).toBe(3)
})

test('the hero holds its slide under prefers-reduced-motion and the dots still page', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await settledSlider(page)
  // Under reduced motion the fill never runs, so the sign the click took is
  // the next slide mounting its media (the lazy rule, one ahead on engagement).
  await engage(
    page,
    '[data-hero-slider] > [aria-hidden="true"]:nth-of-type(2) [data-awaiting-photography]',
  )
  const fill = page.locator('[data-hero-slider] button[aria-current="true"] [data-hero-progress]')
  await expect(fill).toHaveAttribute('data-hero-progress', 'idle')
  await page.waitForTimeout(6500)
  expect(await activeDot(page), 'rotated under reduced motion').toBe('שקופית 1')
  await page.locator('[data-hero-slider] button[aria-label="שקופית 2"]').click()
  await expect.poll(() => activeDot(page)).toBe('שקופית 2')
})
