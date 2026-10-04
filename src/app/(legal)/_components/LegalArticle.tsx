import { t } from '@/lib/i18n/messages'
import Link from 'next/link'
import type { LegalBlock, LegalDoc } from '../_content/types'
import LegalFooterLinks from './LegalFooterLinks'

/**
 * One renderer for every document in this route group, in the layout of
 * Electro's terms-and-conditions page.
 *
 * THE SHAPE IS ELECTRO'S, MEASURED (W02, 05.10.2026, refs/electro-terms.json):
 * a breadcrumb, a centred title block with the "last modified" line under it,
 * then one full-width column of h2 + paragraphs/lists, 25px headings on 14px
 * body, every element in the heading ink. Until W02 this page used the site's
 * own reading-measure frame (`max-w-3xl`, bold 3xl title, 20px headings),
 * which was a third rhythm nothing else on the site had. The numbers live in
 * `src/styles/legal-page.css`, not here, because the token gate reads .tsx
 * for raw values and because a measured length belongs next to its source.
 *
 * THE CONTENT IS OURS. Electro's own body text is lorem ipsum, and nothing
 * from it ships; only the geometry does.
 *
 * The numbering is derived, not typed. A section is "3." because it is third,
 * and its clauses are "3.1", "3.2" because of their order inside it, so
 * inserting a clause cannot leave the document with two clause 4.2s. The number
 * is written into the heading text (not a CSS counter) because a customer
 * quoting "סעיף 7.2" to support must be able to select and copy it, and because
 * support links to `#coupon-terms` and the reader has to see they landed right.
 *
 * Kept from the old frame, because they are contracts rather than styling: the
 * review notice (gate LP3), the table of contents (the anchors support links
 * to), and the scrolling table box with its own tab stop.
 */
function Blocks({ blocks, sectionNumber }: { blocks: LegalBlock[]; sectionNumber: number }) {
  return (
    <>
      {blocks.map((block, index) => {
        // Legal text is static and ordered; the position IS the identity.
        const key = `${block.type}-${index}`

        if (block.type === 'paragraph') {
          return <p key={key}>{block.text}</p>
        }

        if (block.type === 'note') {
          return (
            <p key={key} className="legal-note">
              {block.text}
            </p>
          )
        }

        if (block.type === 'table') {
          return (
            // WIDE TABLES SCROLL INSIDE THEIR OWN BOX, AND THE BOX MUST BE
            // REACHABLE WITHOUT A MOUSE.
            //
            // The page body must not scroll sideways on a phone, so the table
            // gets its own scroller. axe then reports
            // `scrollable-region-focusable` on the phone viewport and only
            // there, because the box overflows only once the screen is narrower
            // than the table's 36rem minimum: a keyboard user could see half a
            // table of consumer-law figures with no way to reach the rest.
            //
            // A <section> with a name rather than a bare div, so the extra tab
            // stop announces what it is.
            <section
              key={key}
              className="legal-table-scroller"
              aria-label={block.caption ?? t('legal.article.table')}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: scrolling IS the interaction here, which is the one case the rule's premise gets wrong.
              tabIndex={0}
            >
              <table className="legal-table">
                {block.caption && <caption>{block.caption}</caption>}
                <thead>
                  <tr>
                    {block.head.map((cell) => (
                      <th key={cell} scope="col">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row) => (
                    <tr key={row.join('|')}>
                      {/* Cells are keyed by their COLUMN, not by position, and
                          are read out of the row by the column's index. A
                          short row therefore renders an empty cell in the
                          right column instead of shifting the rest of the row
                          one column over, which in a table of cancellation
                          windows would silently state the wrong rule. */}
                      {block.head.map((column, columnIndex) => (
                        <td key={column}>{row[columnIndex] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        }

        if (block.type === 'unordered') {
          return (
            <ul key={key}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )
        }

        return (
          <ol key={key}>
            {block.items.map((item, itemIndex) => (
              <li key={item} className="legal-clause">
                <span className="legal-clause__number">
                  {sectionNumber}.{itemIndex + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        )
      })}
    </>
  )
}

/** Electro's breadcrumb delimiter: a thin chevron along the reading direction. */
function Delimiter() {
  return (
    <svg
      className="legal-breadcrumb__delimiter"
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 1l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function LegalArticle({
  doc,
  children,
}: {
  doc: LegalDoc
  /** Rendered after the last section: the contact block each page supplies. */
  children?: React.ReactNode
}) {
  const updated = new Date(doc.updatedAt).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="legal-page">
      <nav aria-label={t('legal.article.breadcrumbLabel')} className="legal-breadcrumb">
        <Link href="/">{t('legal.article.home')}</Link>
        <Delimiter />
        <span>{doc.title}</span>
      </nav>

      <header className="legal-header">
        <h1 className="legal-header__title">{doc.title}</h1>
        <p className="legal-header__updated">
          {t('legal.article.updated')} <time dateTime={doc.updatedAt}>{updated}</time>
        </p>
      </header>

      {doc.reviewNotice && (
        // Visible, not a comment. A page that looks final is treated as final.
        <p role="note" className="legal-review-notice">
          {doc.reviewNotice}
        </p>
      )}

      <div className="legal-intro">
        {doc.intro.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>

      <nav aria-labelledby="legal-toc" className="legal-toc">
        <h2 id="legal-toc" className="legal-toc__title">
          {t('legal.article.toc')}
        </h2>
        <ol className="legal-toc__list">
          {doc.sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="legal-body">
        {doc.sections.map((section, index) => (
          // scroll-margin on the heading keeps an anchored clause clear of the
          // sticky header when support links straight into it.
          <section key={section.id} id={section.id} className="legal-section">
            <h2 className="legal-section__title">
              {index + 1}. {section.title}
            </h2>
            <Blocks blocks={section.blocks} sectionNumber={index + 1} />
          </section>
        ))}
      </article>

      {children}

      <div className="legal-footer">
        <LegalFooterLinks current={doc.slug} />
      </div>
    </div>
  )
}
