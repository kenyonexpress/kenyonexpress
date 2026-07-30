import {
  DOKAN_BOOKKEEPING_SLUG,
  readCatalog,
  readProductCategories,
  recycledSlugs,
} from '@/lib/wp/wxr'
import { describe, expect, it } from 'vitest'

/**
 * The fixture reproduces, in miniature, every defect the 2026-07-29 dry run
 * found in the older reader. Each of these tests fails if that behaviour comes
 * back.
 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8" ?>
<rss>
<channel>
  <wp:category>
    <wp:term_id>16</wp:term_id>
    <wp:category_nicename><![CDATA[aside]]></wp:category_nicename>
    <wp:cat_name><![CDATA[Aside]]></wp:cat_name>
  </wp:category>
  <wp:category>
    <wp:term_id>1</wp:term_id>
    <wp:category_nicename><![CDATA[uncategorized]]></wp:category_nicename>
    <wp:cat_name><![CDATA[Uncategorized]]></wp:cat_name>
  </wp:category>

  <wp:term>
    <wp:term_id>45</wp:term_id>
    <wp:term_taxonomy><![CDATA[pa_brands]]></wp:term_taxonomy>
    <wp:term_slug><![CDATA[acer]]></wp:term_slug>
    <wp:term_name><![CDATA[Acer]]></wp:term_name>
  </wp:term>
  <wp:term>
    <wp:term_id>90</wp:term_id>
    <wp:term_taxonomy><![CDATA[product_cat]]></wp:term_taxonomy>
    <wp:term_slug><![CDATA[uncategorized]]></wp:term_slug>
    <wp:term_parent><![CDATA[]]></wp:term_parent>
    <wp:term_name><![CDATA[כללי]]></wp:term_name>
  </wp:term>
  <wp:term>
    <wp:term_id>91</wp:term_id>
    <wp:term_taxonomy><![CDATA[product_cat]]></wp:term_taxonomy>
    <wp:term_slug><![CDATA[restaurants]]></wp:term_slug>
    <wp:term_parent><![CDATA[uncategorized]]></wp:term_parent>
    <wp:term_name><![CDATA[מסעדות]]></wp:term_name>
  </wp:term>

  <item>
    <title><![CDATA[ארוחת בוקר זוגית]]></title>
    <link>https://kenyonexpress.co.il/product/breakfast/</link>
    <wp:post_id>6166</wp:post_id>
    <wp:post_name><![CDATA[breakfast]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_type><![CDATA[product]]></wp:post_type>
    <category domain="product_cat" nicename="restaurants"><![CDATA[מסעדות]]></category>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_thumbnail_id]]></wp:meta_key>
      <wp:meta_value><![CDATA[100]]></wp:meta_value>
    </wp:postmeta>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_product_image_gallery]]></wp:meta_key>
      <wp:meta_value><![CDATA[101,102]]></wp:meta_value>
    </wp:postmeta>
  </item>

  <item>
    <title><![CDATA[Reverse Withdrawal Payment]]></title>
    <wp:post_id>7000</wp:post_id>
    <wp:post_name><![CDATA[${DOKAN_BOOKKEEPING_SLUG}]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_type><![CDATA[product]]></wp:post_type>
  </item>

  <item>
    <title><![CDATA[מוצר פרטי]]></title>
    <wp:post_id>8000</wp:post_id>
    <wp:post_name><![CDATA[private-one]]></wp:post_name>
    <wp:status><![CDATA[private]]></wp:status>
    <wp:post_type><![CDATA[product]]></wp:post_type>
    <wp:postmeta>
      <wp:meta_key><![CDATA[_thumbnail_id]]></wp:meta_key>
      <wp:meta_value><![CDATA[5324]]></wp:meta_value>
    </wp:postmeta>
  </item>

  <item>
    <title><![CDATA[image one]]></title>
    <wp:post_id>100</wp:post_id>
    <wp:post_type><![CDATA[attachment]]></wp:post_type>
    <wp:post_parent>6166</wp:post_parent>
    <wp:attachment_url>https://kenyonexpress.co.il/wp-content/uploads/a.jpg</wp:attachment_url>
  </item>
  <item>
    <title><![CDATA[image two]]></title>
    <wp:post_id>101</wp:post_id>
    <wp:post_type><![CDATA[attachment]]></wp:post_type>
    <wp:post_parent>6166</wp:post_parent>
    <wp:attachment_url>https://kenyonexpress.co.il/wp-content/uploads/b.jpg</wp:attachment_url>
  </item>
  <item>
    <title><![CDATA[image three]]></title>
    <wp:post_id>102</wp:post_id>
    <wp:post_type><![CDATA[attachment]]></wp:post_type>
    <wp:post_parent>6166</wp:post_parent>
    <wp:attachment_url>https://kenyonexpress.co.il/wp-content/uploads/c.jpg</wp:attachment_url>
  </item>
  <item>
    <title><![CDATA[private image]]></title>
    <wp:post_id>5324</wp:post_id>
    <wp:post_type><![CDATA[attachment]]></wp:post_type>
    <wp:post_parent>8000</wp:post_parent>
    <wp:attachment_url>https://kenyonexpress.co.il/wp-content/uploads/private.jpg</wp:attachment_url>
  </item>
</channel>
</rss>`

describe('readProductCategories', () => {
  // The top migration blocker of the 2026-07-29 dry run.
  it('never reads the blog taxonomy', () => {
    const { categories, blogTermsIgnored } = readProductCategories(FIXTURE)
    expect(categories.map((c) => c.slug).sort()).toEqual(['restaurants', 'uncategorized'])
    expect(blogTermsIgnored).toBe(2)
    expect(categories.some((c) => c.slug === 'aside')).toBe(false)
  })

  it('keeps the real category on its own slug, not on a suffixed one', () => {
    const { categories } = readProductCategories(FIXTURE)
    const real = categories.find((c) => c.name === 'כללי')
    expect(real?.slug).toBe('uncategorized')
    expect(categories.some((c) => c.slug === 'uncategorized-2')).toBe(false)
  })

  it('ignores taxonomies that are not product_cat', () => {
    const { categories } = readProductCategories(FIXTURE)
    expect(categories.some((c) => c.slug === 'acer')).toBe(false)
  })

  it('preserves the tree rather than flattening it', () => {
    const { categories } = readProductCategories(FIXTURE)
    expect(categories.find((c) => c.slug === 'restaurants')?.parentSlug).toBe('uncategorized')
    expect(categories.find((c) => c.slug === 'uncategorized')?.parentSlug).toBeNull()
  })
})

describe('readCatalog', () => {
  it("excludes Dokan's bookkeeping row and says why", () => {
    const catalog = readCatalog(FIXTURE)
    expect(catalog.products.some((p) => p.slug === DOKAN_BOOKKEEPING_SLUG)).toBe(false)
    expect(catalog.warnings.join(' ')).toContain(DOKAN_BOOKKEEPING_SLUG)
  })

  it('excludes a private product', () => {
    const catalog = readCatalog(FIXTURE)
    expect(catalog.products.map((p) => p.slug)).toEqual(['breakfast'])
    expect(catalog.counts.productsSkipped).toBe(2)
  })

  // The third disagreement: an image of an excluded product was uploaded anyway.
  it('collects images only from products that survived filtering', () => {
    const catalog = readCatalog(FIXTURE)
    expect(catalog.attachments.map((a) => a.postId).sort()).toEqual(['100', '101', '102'])
    expect(catalog.attachments.some((a) => a.postId === '5324')).toBe(false)
  })

  it('takes the thumbnail and the whole gallery, without duplicates', () => {
    const catalog = readCatalog(FIXTURE)
    expect(catalog.products[0]?.attachmentIds).toEqual(['100', '101', '102'])
  })

  it('reads the product_cat slugs off the item', () => {
    expect(readCatalog(FIXTURE).products[0]?.categorySlugs).toEqual(['restaurants'])
  })

  it('warns about an image the export does not contain', () => {
    const missing = FIXTURE.replace(
      '<wp:meta_value><![CDATA[101,102]]></wp:meta_value>',
      '<wp:meta_value><![CDATA[101,999]]></wp:meta_value>',
    )
    expect(readCatalog(missing).warnings.join(' ')).toContain('999')
  })

  it('warns about a category the export does not contain', () => {
    const dangling = FIXTURE.replace('nicename="restaurants"', 'nicename="ghost-category"')
    expect(readCatalog(dangling).warnings.join(' ')).toContain('ghost-category')
  })

  // Renaming silently is what produced /category/uncategorized-2.
  it('reports a duplicate slug instead of renaming it', () => {
    const duplicated = FIXTURE.replace(
      '<wp:term_slug><![CDATA[restaurants]]></wp:term_slug>',
      '<wp:term_slug><![CDATA[uncategorized]]></wp:term_slug>',
    )
    const catalog = readCatalog(duplicated)
    expect(catalog.warnings.join(' ')).toContain('appears 2 times')
    expect(catalog.categories.filter((c) => c.slug === 'uncategorized')).toHaveLength(2)
  })

  it('keeps the URL the product was served at', () => {
    expect(readCatalog(FIXTURE).products[0]?.link).toContain('/product/breakfast/')
  })
})

describe('recycledSlugs', () => {
  it('flags a slug that has nothing to do with its title', () => {
    const flagged = recycledSlugs([
      {
        postId: '1',
        slug: 'apple-watch-series-7',
        title: 'ארוחת בוקר זוגית',
        status: 'publish',
        link: '',
        categorySlugs: [],
        attachmentIds: [],
      },
      {
        postId: '2',
        slug: 'ארוחת-בוקר-זוגית',
        title: 'ארוחת בוקר זוגית',
        status: 'publish',
        link: '',
        categorySlugs: [],
        attachmentIds: [],
      },
    ])
    expect(flagged.map((p) => p.postId)).toEqual(['1'])
  })

  it('flags a bare numeric slug', () => {
    const flagged = recycledSlugs([
      {
        postId: '3',
        slug: '6253',
        title: 'עיסוי',
        status: 'publish',
        link: '',
        categorySlugs: [],
        attachmentIds: [],
      },
    ])
    expect(flagged).toHaveLength(1)
  })
})
