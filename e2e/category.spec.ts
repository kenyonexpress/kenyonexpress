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
/**
 * The category archive's count, printed inside its H1 (XD17). `.last()` at
 * every use: while the streamed body replaces the shell the H1 can briefly be
 * in the DOM twice, and strict mode then failed on two matches (C142).
 */
const TITLE_COUNT = '.category-page__title-count'

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
    // The visible one: until the streamed body replaces the shell, the
    // control bar can be in the DOM twice (seen on WebKit at 380, C142).
    const sort = page.getByLabel('מיון מוצרים').locator('visible=true').first()
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

    // POSTPONED **OR** PRERENDER, because those are the two shapes of "not
    // dynamic" and this route legitimately answers with either.
    //
    // MEASURED 2026-08-20, after this failed three times in one night and
    // passed every time it ran alone. The failing responses were not missing a
    // shell: they carried `x-nextjs-cache: HIT` and `x-nextjs-prerender: 1`
    // and no `x-nextjs-postponed` - the whole route came out of the full-route
    // cache as a COMPLETED prerender rather than as a shell to resume. That is
    // the stronger of the two outcomes, and the old assertion read it as the
    // regression it was written to catch. Which one arrives depends on whether
    // that cache entry is warm, so at two workers it moved run to run. A first
    // theory - that the header was missing only from the first request after
    // boot - was measured and abandoned: twenty concurrent cookie-less curls
    // to a nine-second-old server all carried it.
    //
    // The regression is still caught. A route that has gone fully dynamic
    // carries NEITHER header: verified on the same build against
    // `/account/orders`, which carries neither, while `/category/[slug]`,
    // `/cart`, `/checkout`, `/search` and `/coupons` each carry at least one.
    const headers = response?.headers() ?? {}
    expect(
      `${headers['x-nextjs-postponed'] ?? ''}${headers['x-nextjs-prerender'] ?? ''}`,
      `neither postponed nor prerendered, so the archive is rendering dynamically (cache=${headers['x-nextjs-cache'] ?? 'none'})`,
    ).not.toBe('')
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
    // The category archive prints its count inside the H1 ("N מבצעים זמינים",
    // XD17), not as a separate count line the way /products and /search do.
    await expect(page.locator(TITLE_COUNT).last()).toHaveText(/\d+ מבצעים זמינים/, {
      timeout: 15_000,
    })
    await expect(page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')).toHaveCount(0)
  })

  test('the shop archive answers an out-of-range page with the catalogue, never the empty state', async ({
    page,
  }) => {
    // /products stopped paginating with UX43 (2026-10-17): the grid loads the
    // catalogue from its first page and appends with infinite scroll, so there
    // is no page number to clamp TO and the count line prints the whole total
    // on every URL. This used to require page=9999 to print a DIFFERENT count
    // from page 1, which the archive can no longer do. What still matters is
    // what the category test above pins: a stale or out-of-range page number
    // in a bookmark must land on products and a count, not on the "nothing
    // matches your selection" state that blames filters the shopper never set.
    const response = await page.goto('/products?page=9999')
    expect(response?.status()).toBe(200)
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 15_000 })
    const count = await page.locator(SETTLED_COUNT).first().textContent({ timeout: 15_000 })
    expect(count, 'the out-of-range page printed no count').toBeTruthy()
    await expect(page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')).toHaveCount(0)

    await page.goto('/products')
    const total = await page.locator(SETTLED_COUNT).first().textContent({ timeout: 15_000 })
    expect(count, 'the count is the catalogue total on every page number').toBe(total)
  })

  test('a price filter narrows the archive without breaking it', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    const response = await page.goto(`/category/${slug}?min=0&max=1`)
    expect(response?.status()).toBe(200)

    const grid = page.locator('.category-page__main a[href^="/product/"]').first()
    const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
    // A narrow range can leave the grid empty while a card elsewhere on the
    // page still links to a product, so the grid is scoped and the union
    // takes its first match.
    await expect(grid.or(empty).first()).toBeVisible({ timeout: 15_000 })
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
    // Retried: the archive streams and the infinite grid re-renders, so the
    // first handle can detach between the query and the scroll.
    await expect(async () => {
      await thumbs.first().scrollIntoViewIfNeeded({ timeout: 2_000 })
    }).toPass({ timeout: 15_000 })
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

/**
 * The listing contract of 2026-09-16: eight cards a page, and the one typing
 * field on the site, scoped to the archive it sits on.
 */
test.describe('category listing: page size and autocomplete', () => {
  test('never renders more than one page of cards, and ?paginate=1 links page 2 when there are more', async ({
    page,
  }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    // The archive's default is infinite scroll (UX22): the first response holds
    // one page of CATEGORY_PAGE_SIZE (24) cards and appends from there.
    // `?paginate=1` is the numbered-pages variant and still carries the links.
    await page.goto(`/category/${slug}?paginate=1`)
    await expect(page.locator(TITLE_COUNT).last()).toHaveText(/\d+ מבצעים זמינים/, {
      timeout: 15_000,
    })
    const countText = (await page.locator(TITLE_COUNT).last().textContent()) ?? ''
    const total = Number(/(\d+)/.exec(countText)?.[1] ?? '0')

    // Real cards only: the streaming skeleton reuses the item class.
    const cards = page.locator(
      '.category-page__main .category-products__item:has(a[href^="/product/"])',
    )
    await expect(cards.first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.category-page__main [aria-label="טוען מוצרים"]')).toHaveCount(0)
    const count = await cards.count()
    expect(count).toBeLessThanOrEqual(24)

    if (total > 24) {
      expect(count).toBe(24)
      await expect(page.getByRole('link', { name: 'העמוד הבא' })).toHaveAttribute(
        'href',
        new RegExp(`/category/${slug}\\?.*page=2`),
      )
    }
  })

  test('the sidebar combobox asks the suggest route with this category as scope', async ({
    page,
  }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)

    // The sidebar is open by default now (CategoryFilterSidebar); there is no
    // summary to expand first.
    const box = page.locator('.category-autocomplete').getByRole('combobox')
    await expect(box).toBeVisible()
    await expect(box).toHaveAttribute('type', 'text')

    const request = page.waitForRequest(
      (r) => r.url().includes('/api/search/suggest') && r.url().includes(`category=${slug}`),
    )
    await box.fill('אב')
    const seen = await request
    expect(new URL(seen.url()).searchParams.get('q')).toBe('אב')
  })

  test('the shell still carries no search field', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)
    await expect(
      page.locator('header input, nav input, footer input:not([type="email"])'),
    ).toHaveCount(0)
    await expect(page.locator('input[type="search"], [role="search"]')).toHaveCount(0)
  })
})
