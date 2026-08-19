import { expect, test } from '@playwright/test'
import { firstCategorySlug } from './helpers'

/**
 * The result count once its boundary has resolved.
 *
 * Two things make the bare class ambiguous: the streaming placeholder carries
 * it so the box stays the same height, and the archive prints the count twice,
 * in the header and again under the grid as `--bottom`.
 */
const SETTLED_COUNT = '.category-page__count:not(.category-page__count--pending)'

test.describe('category archive', () => {
  test('renders the title, result count, breadcrumb and a product grid', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'נתיב ניווט' })).toBeVisible()

    // Either products, or the empty-state copy. Both are valid archive states;
    // a blank page with neither is the regression this guards against.
    const grid = page.locator('a[href^="/product/"]').first()
    const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
    await expect(grid.or(empty)).toBeVisible({ timeout: 15_000 })
  })

  test('sorting by price rewrites the URL and keeps the archive rendered', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)
    const sort = page.getByLabel('מיון מוצרים')
    await expect(sort).toBeVisible()

    // The select speaks WooCommerce orderby values ("price"); the URL speaks
    // our own sort keys ("price_asc"). The mapping between them is the thing
    // most likely to drift, so pin both ends.
    await sort.selectOption('price')
    await page.waitForURL(/[?&]sort=price_asc\b/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('keeps the sort selection when the page reloads', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}?sort=price_desc`)
    await expect(page.getByLabel('מיון מוצרים')).toHaveValue('price-desc')
  })

  test('an unrecognised sort key falls back to the default order', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}?sort=not-a-sort`)
    await expect(page.getByLabel('מיון מוצרים')).toHaveValue('menu_order')
  })

  /**
   * THIS ASSERTED `noindex` INSTEAD OF THE STATUS, BECAUSE THE STATUS WAS 200.
   *
   * The route sent a prerendered shell before it knew whether the slug existed,
   * so `notFound()` ran with the status line already on the wire and the
   * not-found page was served as `200 OK`. The test was rewritten around the
   * `noindex` tag Next injects to compensate, and the soft 404 stayed.
   *
   * It did not have to. The lookup moved OUT of the `<Suspense>` - see the note
   * above `CategoryPage` - and the twelve real slugs come from
   * `generateStaticParams`, so the shell is still prerendered and still
   * postponed on `searchParams` alone. Both assertions hold now, so the test
   * makes both: the status a crawler acts on, and the tag it reads.
   */
  test('an unknown category slug 404s, is noindex, and shows the not-found page', async ({
    page,
    request,
  }) => {
    const response = await request.get('/category/no-such-category-slug-12345')
    expect(response.status()).toBe(404)
    expect(await response.text()).toContain('<meta name="robots" content="noindex"/>')

    await page.goto('/category/no-such-category-slug-12345')
    await expect(page.getByRole('heading', { name: 'הדף שחיפשתם לא נמצא' })).toBeVisible()
  })

  /**
   * A REAL category must not pay for that: it keeps its postponed shell.
   *
   * This is the half of the change that could regress silently. Awaiting
   * `params` outside the boundary would make the page fully dynamic if the slug
   * were not build-time known, and nothing else in the suite would notice - the
   * page would simply render slower.
   */
  test('a real category still streams a prerendered shell', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    const response = await page.goto(`/category/${slug}`)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-nextjs-postponed']).toBe('1')
  })

  /**
   * THIS TEST HAD THIS NAME AND DID NOT CHECK IT.
   *
   * It asserted a 200 and a visible h1, both of which an out-of-range page
   * returned while showing nothing: `?page=9999` offset past the last row, the
   * grid printed "nothing matches your selection" - blaming filters the shopper
   * never set - and the count line printed nothing at all.
   *
   * The missing count is the tell. PostgREST answers an out-of-range `range()`
   * with no rows AND NO COUNT, so `total` came back 0 and the page could not
   * tell "past the end" from "nothing matched". Both boundaries go through
   * `categoryPageOrLast` now, which re-reads page 1 to recover the total.
   *
   * So the assertion is that the page shows the LAST page: cards present, the
   * count line present, and the empty state absent. A 200 was never the
   * question.
   */
  test('an out-of-range page number clamps to the last page', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    const response = await page.goto(`/category/${slug}?page=9999`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // A category with a single page clamps to page 1 and is still a pass; what
    // must never happen is the empty state on a category that has products.
    const firstCard = page.locator('a[href^="/product/"]').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    // `.first()` and `:not(--pending)` are both load-bearing. The streaming
    // placeholder carries the same class so it holds the same box open, and the
    // archive prints the count TWICE, once in the header and once under the
    // grid as `--bottom`. Either alone leaves strict mode with two matches.
    await expect(page.locator(SETTLED_COUNT).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')).toHaveCount(0)
  })

  test('the shop archive clamps an out-of-range page the same way', async ({ page }) => {
    // /products is the bigger archive and the one with more than one page, so
    // it is where the clamp is visible as a page NUMBER rather than a fallback
    // to page 1.
    await page.goto('/products?page=9999')
    const clampedCount = await page.locator(SETTLED_COUNT).first().textContent({ timeout: 15_000 })

    await page.goto('/products')
    const total = await page.locator(SETTLED_COUNT).first().textContent({ timeout: 15_000 })

    expect(clampedCount, 'the clamped page printed no count').toBeTruthy()
    expect(clampedCount, 'page=9999 rendered the first page instead of the last').not.toBe(total)
    await expect(page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')).toHaveCount(0)
  })

  test('a price filter narrows the archive without breaking it', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    const response = await page.goto(`/category/${slug}?min=0&max=1`)
    expect(response?.status()).toBe(200)

    const grid = page.locator('a[href^="/product/"]').first()
    const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
    await expect(grid.or(empty)).toBeVisible({ timeout: 15_000 })
  })

  /**
   * Two regressions in one assertion, both measured on the build before this
   * test existed.
   *
   * WEIGHT: the card served a raw <img>, so /products handed a phone 604KB of
   * 600x600 originals to paint 186px boxes - the optimizer was not bypassed by
   * configuration, it was never reached.
   *
   * VISIBILITY, which is the one that matters more: 45 of the catalog's image
   * rows are picsum.photos URLs, and picsum is NOT in the CSP img-src (only
   * self, data, blob, supabase and unsplash are). Every one of them was blocked
   * outright and rendered as a broken thumbnail. Routing through /_next/image
   * makes the request same-origin, which is why they draw at all now.
   *
   * Lives in E2E and not Vitest for the same reason as the deal-card guard:
   * jsdom has no layout engine, does not resolve srcset, and does not enforce
   * a CSP, so all three halves of this are invisible to it.
   */
  test('catalog thumbnails go through the image optimizer and decode', async ({ page }) => {
    await page.goto('/products')

    const thumbs = page.locator('.category-card__thumb img')
    const count = await thumbs.count()
    test.skip(count === 0, 'catalog exposes no product thumbnails')

    // The thumbs are lazy, so a page that has merely loaded has decoded none of
    // them. Bring the first one into view and wait for the bytes, or the decode
    // half of this test measures the scroll position instead of the image.
    await thumbs.first().scrollIntoViewIfNeeded()
    await expect
      .poll(() => thumbs.first().evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        message: 'first catalog thumbnail never decoded',
        timeout: 15_000,
      })
      .toBeGreaterThan(0)

    const rendered = await thumbs.evaluateAll((els) =>
      els.map((el) => {
        const img = el as HTMLImageElement
        return {
          src: img.currentSrc || img.src,
          naturalWidth: img.naturalWidth,
          width: Math.round(img.getBoundingClientRect().width),
        }
      }),
    )

    for (const img of rendered) {
      expect(img.src, 'thumbnail bypassed /_next/image').toContain('/_next/image')
    }

    // At least one has to have actually decoded. Asserting every one would make
    // the test hostage to a single dead remote URL in the catalog data, which
    // is a data defect and not this component's.
    expect(
      rendered.filter((i) => i.naturalWidth > 0 && i.width > 50).length,
      'no catalog thumbnail decoded into a real box',
    ).toBeGreaterThan(0)

    // The reservation the skeleton already promises. Every thumb box is the
    // same height whether its image arrived, failed, or is a 600x408 landscape
    // - otherwise the card shrinks under the bytes and everything below it
    // jumps, which measured as CLS 0.36 on this page.
    const boxes = await page
      .locator('.category-card__thumb')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
    for (const h of boxes) {
      expect(h, 'thumb box height depends on the image that loaded').toBe(186)
    }
  })
})

test.describe('catalogue on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  /**
   * The thumb is capped at 186px because that is the content box of the 234px
   * card measured on the live DESKTOP. Below 576px the column is half the row
   * and the content box is 143px on this viewport, so a flat 186px cap had the
   * image paint outside its own card: the two thumbs in a row met with no
   * gutter, the discount badge landed on the neighbour's image, and the
   * document came out 4px wider than the viewport.
   *
   * Two assertions because they fail for different reasons - a thumb wider than
   * its card is the cause, a document wider than the viewport is what the user
   * feels.
   */
  for (const path of ['/products', '/search?q=%D7%A6%D7%99%D7%9E%D7%A8']) {
    test(`no thumb paints outside its card on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('.category-card__thumb img').first()).toBeVisible({
        timeout: 15000,
      })

      const spills = await page.locator('.category-card').evaluateAll((cards) =>
        cards
          .map((card) => {
            const img = card.querySelector('.category-card__thumb img')
            if (!img) return null
            const cs = getComputedStyle(card)
            const content =
              card.getBoundingClientRect().width -
              Number.parseFloat(cs.paddingLeft) -
              Number.parseFloat(cs.paddingRight)
            const w = img.getBoundingClientRect().width
            return w > content + 0.5 ? { w: Math.round(w), content: Math.round(content) } : null
          })
          .filter(Boolean),
      )
      expect(spills, JSON.stringify(spills)).toEqual([])

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(0)
    })
  }
})
