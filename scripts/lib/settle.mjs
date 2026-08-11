// Bringing a page to the ONE state both the reference and the page scored
// against it are supposed to be photographed in.
//
// Shared by snapshot-live.mjs and compare.mjs for the same reason the computed
// walker is: a reference captured in a different state than the comparison
// expects is not a reference, and the difference between the two states gets
// reported as a difference between the two designs.
//
// MEASURED, which is why this file exists: refs/ke_live_home_1440.png came out
// 1440x4968 while refs/ke_live_computed.json said the same page was 5493px
// tall. Both were taken from one page load, seconds apart. The screenshot ran
// first, its own scroll-and-stitch pulled in another 525px of lazily loaded
// grid, and the style walk afterwards saw the taller page. Scoring the local
// homepage against that PNG read 13.87% where the live site read 9.83%, and
// none of those 4 points were the design.

/**
 * Scrolls to the bottom and back, so anything that loads on approach has
 * loaded before either the camera or the tape measure arrives. Runs in the
 * page; takes no arguments so it can be handed straight to page.evaluate.
 */
export async function loadLazyContent() {
  const step = Math.max(200, Math.round(window.innerHeight * 0.8))
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  let previousHeight = -1
  // Bounded: a page with an infinite scroll would otherwise never return, and
  // a reference is a fixed-length page by definition.
  for (let pass = 0; pass < 60; pass++) {
    const height = document.body.scrollHeight
    if (window.scrollY + window.innerHeight >= height - 1 && height === previousHeight) break
    previousHeight = height
    window.scrollTo(0, Math.min(window.scrollY + step, height))
    await wait(120)
  }
  window.scrollTo(0, 0)
  await wait(300)
}

/**
 * Stops the hero on slide 1.
 *
 * The live theme autoplays every 5s, which alone makes a screenshot of it
 * unreproducible. Pointer-enter is the component's own supported way to hold a
 * slide, so use that rather than reaching into anyone's state. Pause first and
 * then put slide 1 back: by the time this runs the live slider has usually
 * advanced once already, and pausing alone would just hold the wrong slide.
 * Pages with no hero match nothing and are untouched.
 */
export function freezeHero() {
  const hero = document.querySelector(
    '[data-hero-slider], .home-v1-slider, rs-module, [class*="hero"]',
  )
  hero?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, view: window }))
  const firstSlide =
    document.querySelector('rs-bullet') ?? document.querySelector('button[aria-label="שקופית 1"]')
  firstSlide?.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
  )
}
