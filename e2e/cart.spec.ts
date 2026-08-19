import { type Page, expect, test } from '@playwright/test'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

/** Reads the item count the header badge advertises via its aria-label. */
async function navCartCount(page: Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /עגלת קניות, \d+ פריטים/ })
    .first()
    .getAttribute('aria-label')
  const match = /עגלת קניות, (\d+) פריטים/.exec(label ?? '')
  return match ? Number(match[1]) : 0
}

test.describe('shopping cart (guest)', () => {
  test('add to cart from product page then see it in the cart', async ({ page }) => {
    await openPurchasableProduct(page)
    const productName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim()
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    if (productName) {
      await expect(page.getByText(productName, { exact: false }).first()).toBeVisible()
    }
    // A link to /checkout, not a button that signs the shopper in first.
    // CartCheckoutButton stopped being a sign-in gate in GOAL 2: checkout takes
    // guests and the identity is demanded on the pay press. checkout.spec.ts
    // pins the destination; this only pins that the cart hands them on.
    await expect(page.getByRole('link', { name: /המשך לתשלום/ })).toBeVisible()
  })

  test('shows an order summary with an on-site total in shekels', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    const summary = page.getByRole('complementary', { name: 'סיכום הזמנה' })
    await expect(summary).toBeVisible()
    await expect(summary.getByText('לתשלום באתר')).toBeVisible()
    await expect(summary.getByText(/₪/).first()).toBeVisible()
  })

  test('raising the quantity updates the header badge', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)

    await page.getByRole('button', { name: 'הוסף כמות' }).first().click()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(2)
  })

  test('lowering the quantity puts the badge back', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await page.getByRole('button', { name: 'הוסף כמות' }).first().click()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(2)

    await page.getByRole('button', { name: 'הפחת כמות' }).first().click()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)
  })

  test('a guest cart survives a page reload', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)
  })

  test('emptying the cart shows the empty state again', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await page.getByRole('button', { name: 'רוקן עגלה' }).click()

    await expect(page.getByRole('button', { name: 'רוקן עגלה' })).toBeHidden({ timeout: 10_000 })
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(0)
  })

  // Desktop only, and it always was -- the comment inside already said so. The
  // panel that opens is chosen by CSS width: above the breakpoint it is
  // MiniCartDropdown, which has no close button and is dismissed by the header
  // control this test is named after; below it, it is CartDrawer, which has its
  // own "סגור". When `mobile-chrome` arrived this file started running at
  // 393px, where `headerCart.click()` reaches for an affordance that is not the
  // one on screen, and timed out.
  //
  // Scoped rather than made width-agnostic on purpose: the two panels are
  // different components with different dismissal, so one test asserting both
  // would assert neither. The phone panel needs its own spec, and does not have
  // one yet.
  test('adding to the cart opens the drawer, and the header badge reopens it', async ({
    page,
    viewport,
  }) => {
    // Inside the test, not at describe scope: at describe scope this skipped
    // all eight cart specs on a phone, which is eight fewer assertions for one
    // test's problem.
    test.skip(
      (viewport?.width ?? 0) < 1024,
      'mini-cart dropdown is the desktop panel; the phone gets CartDrawer',
    )
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    // Adding auto-opens the drawer; that is the confirmation the shopper sees.
    //
    // At this viewport the open panel is MiniCartDropdown, not CartDrawer. The
    // two share `drawerOpen` and the label "עגלת קניות", and CSS picks between
    // them by width, so `getByRole('dialog')` resolves to whichever one is
    // actually on screen — here the dropdown, because Desktop Chrome is 1280px
    // wide. The dropdown has no "סגור" button; it is closed by the header
    // control that opened it, which is what this spec is named after anyway.
    const drawer = page.getByRole('dialog', { name: 'עגלת קניות' })
    await expect(drawer).toBeVisible()

    const headerCart = page.getByRole('button', { name: /עגלת קניות, \d+ פריטים/ }).first()
    await headerCart.click()
    await expect(drawer).toBeHidden()

    await headerCart.click()
    await expect(drawer).toBeVisible()
  })

  /**
   * THE PHONE SHEET DISMISSED ITSELF ON CONTACT.
   *
   * `MiniCartDropdown` is `display: none` below 768px, but it still MOUNTS -
   * CSS hides the markup, it does not detach the document-level `pointerdown`
   * listener it uses to close itself on an outside click. Every point inside
   * the phone sheet is outside that hidden panel, so one tap anywhere in the
   * sheet closed it: "הוסף כמות", "המשך לתשלום", or its own title. The quantity
   * controls were unreachable on a phone.
   *
   * The title is what this taps on purpose. A quantity button would prove the
   * same thing but would leave the reading "the quantity control is broken";
   * the title is inert, so what it isolates is the dismissal.
   *
   * The desktop half is asserted in the same test, because the fix must not
   * simply delete the outside-click dismissal that the dropdown needs.
   */
  test('the phone sheet survives being touched, and the desktop dropdown still dismisses', async ({
    page,
    viewport,
  }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    const isPhone = (viewport?.width ?? 0) < 768
    if (isPhone) {
      const sheet = page.locator('.cart-drawer')
      await expect(sheet).toBeVisible()
      await sheet.locator('.cart-drawer__title').click()
      await expect(sheet, 'tapping inside the sheet must not close it').toBeVisible()

      // The controls the dismissal made unreachable.
      await sheet.getByRole('button', { name: 'הוסף כמות' }).first().click()
      await expect(sheet.locator('.cart-drawer__count')).toHaveText('(2)')
      await sheet.getByRole('button', { name: 'הפחת כמות' }).first().click()
      await expect(sheet.locator('.cart-drawer__count')).toHaveText('(1)')

      // And the dismissal that IS the sheet's own: the overlay behind it.
      await page.locator('.cart-drawer__overlay').click({ force: true })
      await expect(sheet).toBeHidden()
    } else {
      const panel = page.locator('.mini-cart__panel')
      await expect(panel).toBeVisible()
      // Top-left of the page, clear of the panel and of the cart trigger.
      await page.mouse.click(60, 500)
      await expect(panel, 'an outside click must still close the dropdown').toBeHidden()
    }
  })

  /**
   * A DROPDOWN MUST NOT FREEZE THE PAGE; A SHEET MUST.
   *
   * `CartDrawer` mounts whenever the cart is open, at EVERY width - above 767px
   * only its markup is hidden, by `display: none` on `.cart-drawer-root`. Its
   * effect ran regardless, so `body { overflow: hidden }` was applied on a
   * 1440px desktop where the visible surface is the little mini-cart dropdown,
   * and the whole page stopped scrolling behind it. Measured with a real wheel
   * gesture rather than `window.scrollBy`, which is not subject to the
   * propagated overflow and reported the page as scrollable while a user could
   * not move it.
   *
   * Both halves are asserted, because a fix that simply deleted the lock would
   * pass the desktop half and silently break the phone sheet.
   */
  test('the page scrolls behind the desktop dropdown and not behind the phone sheet', async ({
    page,
    viewport,
  }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await expect(page.getByRole('dialog', { name: 'עגלת קניות' })).toBeVisible()

    const isPhone = (viewport?.width ?? 0) < 768
    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.move((viewport?.width ?? 800) / 2, (viewport?.height ?? 600) / 2)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(400)
    const moved = (await page.evaluate(() => window.scrollY)) - before

    if (isPhone) expect(moved, 'the sheet must hold the page still').toBe(0)
    else expect(moved, 'a dropdown must not freeze the page').toBeGreaterThan(0)
  })

  // `button` here, matching the CTA's old shape, asserted the absence of
  // something that can no longer exist under any cart state, so it passed on an
  // empty cart and would have passed on a full one too. `link` is the role the
  // CTA has now, which makes the assertion mean what its name says.
  test('an empty cart offers no checkout CTA', async ({ page }) => {
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    await expect(page.getByRole('link', { name: /המשך לתשלום/ })).toBeHidden()
  })
})

/**
 * THE SHEET COVERS THE PHONE, AND THE KEYBOARD COULD NOT GET INTO IT.
 *
 * MEASURED on the built page before the fix: after add-to-cart, eight Tab
 * presses and six Shift+Tab presses landed on the buy button, the share buttons
 * and the related-products grid. Fourteen keypresses, not one inside the
 * drawer, while every one of those controls sat UNDER the overlay -- a sighted
 * keyboard user watching the focus ring vanish behind a sheet they cannot
 * reach, on the first cart anyone sees. Escape worked, and that was all.
 *
 * `<dialog open>` is not `showModal()`: no top layer, no focus trap, nothing
 * moves focus. The sheet already had the other two thirds of modal behaviour,
 * a full-screen overlay and a body scroll lock, so this is the missing third.
 *
 * The desktop half of this describe is not decoration. `CartDrawer` mounts at
 * EVERY width and CSS hides it above 767px, so the obvious version of the fix
 * would move focus into an invisible sheet on a 1440px desktop -- the same trap
 * the scroll lock is documented for, in a new spelling, and worse than the bug.
 */
test.describe('the cart sheet and the keyboard', () => {
  const inDrawer = (page: Page) =>
    page.evaluate(() => Boolean(document.activeElement?.closest('.cart-drawer')))

  test('the phone sheet takes focus, keeps it, and gives it back on Escape', async ({
    page,
    viewport,
  }) => {
    test.skip((viewport?.width ?? 0) > 767, 'above 767px the panel is MiniCartDropdown')

    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    const sheet = page.locator('.cart-drawer')
    await expect(sheet).toBeVisible()

    await expect(page.locator('.cart-drawer__close')).toBeFocused()

    // A full lap and one past it: the trap has to WRAP, not stop. Seven
    // controls today, so twelve presses crosses the end at least once.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await inDrawer(page), `Tab ${i + 1} left the sheet`).toBe(true)
    }
    // Backwards too: the wrap at the first control is a separate branch.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inDrawer(page), `Shift+Tab ${i + 1} left the sheet`).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  })

  test('the desktop dropdown does not steal focus into a sheet nobody can see', async ({
    page,
    viewport,
  }) => {
    test.skip((viewport?.width ?? 0) <= 767, 'below 768px the sheet is the visible surface')

    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await expect(page.locator('.mini-cart__panel')).toBeVisible()

    // `.cart-drawer-root` is `display: none` here and its markup is still in
    // the document. If focus is inside it, the width guard has broken and a
    // desktop shopper is typing into something off-screen.
    expect(await inDrawer(page), 'focus went into the hidden phone sheet').toBe(false)
  })
})
