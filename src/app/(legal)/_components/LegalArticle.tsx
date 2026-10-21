import Link from 'next/link'
import type { LegalBlock, LegalDoc } from '../_content/types'
import LegalFooterLinks from './LegalFooterLinks'
import '@/styles/legal-page.css'

/**
 * One renderer for every document in this route group, shaped 1:1 after the
 * Electro template's terms page (refs/electro_terms_computed.json): breadcrumb,
 * a centred title with the "last modified" line under it, then full-width
 * sections of heading plus numbered clauses. Electro has no table of contents
 * and none is rendered; every section keeps its stable `id`, so a support link
 * to `#coupon-terms` still lands on the clause.
 *
 * The numbering is derived, not typed. A section is "3." because it is third,
 * and its clauses are "3.1", "3.2" because of their order inside it, so
 * inserting a clause cannot leave the document with two clause 4.2s. The number
 * is written into the clause text (not a CSS counter) because a customer
 * quoting "סעיף 7.2" to support must be able to select and copy it.
 *
 * Every measurement lives in `src/styles/legal-page.css`; see the note there.
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
            <p key={key} className="legal-page__note">
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
              className="legal-page__table-wrap"
              aria-label={block.caption ?? 'טבלה'}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: scrolling IS the interaction here, which is the one case the rule's premise gets wrong.
              tabIndex={0}
            >
              <table className="legal-page__table">
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
              <li key={item}>
                <span className="legal-page__clause-number">
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
      <nav aria-label="נתיב ניווט" className="legal-page__breadcrumb">
        <Link href="/" className="hit-44">
          בית
        </Link>
        <span aria-hidden="true" className="legal-page__breadcrumb-delimiter">
          ›
        </span>
        <span aria-current="page">{doc.title}</span>
      </nav>

      <header className="legal-page__header">
        <h1 className="legal-page__title">{doc.title}</h1>
        <p className="legal-page__updated">
          עודכן לאחרונה: <time dateTime={doc.updatedAt}>{updated}</time>
        </p>
      </header>

      {doc.reviewNotice && (
        // Visible, not a comment. A page that looks final is treated as final.
        <p role="note" className="legal-page__notice">
          {doc.reviewNotice}
        </p>
      )}

      <div className="legal-page__intro">
        {doc.intro.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>

      <article>
        {doc.sections.map((section, index) => (
          // scroll-margin keeps the anchored heading clear of the sticky header
          // when support links straight into a clause.
          <section key={section.id} id={section.id} className="legal-page__section">
            <h2>
              {index + 1}. {section.title}
            </h2>
            <Blocks blocks={section.blocks} sectionNumber={index + 1} />
          </section>
        ))}
      </article>

      {children}

      <div className="legal-page__footer">
        <LegalFooterLinks current={doc.slug} />
      </div>
    </div>
  )
}
