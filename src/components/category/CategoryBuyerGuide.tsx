import { parseGuideMarkdown } from '@/lib/category-guides/markdown'
import { getCategoryGuide } from '@/lib/category-guides/read'
import { guideHeading } from '@/lib/category-guides/rules'

/**
 * The buyer guide at the foot of a category page (STEP 65): a few hundred
 * words of Hebrew on how to choose in this category, under an H2, as
 * ordinary indexable text.
 *
 * BELOW THE GRID AND THE FILTERS, for the reason category-page.css gives
 * for the filter sidebar: live has zero gap between the control bar and
 * its first card, and anything inserted above the grid pushes every row of
 * the page down against live's. Below the fold it costs the parity gate
 * nothing and a crawler reads it all the same.
 *
 * A server component: the row (or the authored fallback) is read on the
 * anon key and never reaches the browser twice. The markdown-lite is parsed
 * into typed blocks and rendered as elements, never injected, so a row an
 * editor saves cannot carry markup into the page. Nothing at all when the
 * category has no guide, which is the state of a category added after this
 * step until an editor writes one.
 */
export default async function CategoryBuyerGuide({
  category,
}: {
  category: { id: string; slug: string; name_he: string }
}) {
  const guide = await getCategoryGuide(category)
  if (!guide) return null
  const blocks = parseGuideMarkdown(guide.body_md)
  if (blocks.length === 0) return null

  const headingId = 'category-guide-title'
  return (
    <section
      aria-labelledby={headingId}
      dir="rtl"
      data-testid="category-buyer-guide"
      data-guide-source={guide.source}
      className="category-guide mt-10 max-w-3xl border-t border-heading/10 pt-8"
    >
      <h2 id={headingId} className="m-0 text-2xl font-bold leading-tight text-heading">
        {guideHeading(guide, category.name_he)}
      </h2>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`
        switch (block.kind) {
          case 'heading':
            return (
              <h3 key={key} className="mt-6 text-lg font-semibold text-heading">
                {block.text}
              </h3>
            )
          case 'list':
            return (
              <ul
                key={key}
                className="mt-3 list-disc space-y-1 ps-6 text-base leading-relaxed text-heading/80"
              >
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )
          default:
            return (
              <p key={key} className="mt-3 text-base leading-relaxed text-heading/80">
                {block.text}
              </p>
            )
        }
      })}
    </section>
  )
}
