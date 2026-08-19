import Link from 'next/link'
import type { LegalBlock, LegalDoc } from '../_content/types'
import LegalFooterLinks from './LegalFooterLinks'

/**
 * One renderer for every document in this route group.
 *
 * The numbering is derived, not typed. A section is "3." because it is third,
 * and its clauses are "3.1", "3.2" because of their order inside it, so
 * inserting a clause cannot leave the document with two clause 4.2s. The number
 * is written into the heading text (not a CSS counter) because a customer
 * quoting "סעיף 7.2" to support must be able to select and copy it, and because
 * support links to `#coupon-terms` and the reader has to see they landed right.
 *
 * Page frame is the site's measured one (`max-w-page` = 1320px container,
 * `max-w-3xl` reading measure), the same pair `/faq`, `/about` and the older
 * legal pages use, so a legal page does not invent a third rhythm.
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
            <p
              key={key}
              className="rounded-lg border-s-4 border-heading/40 bg-heading/5 px-4 py-3 font-medium"
            >
              {block.text}
            </p>
          )
        }

        if (block.type === 'table') {
          return (
            // Wide tables scroll inside their own box; the page body must not
            // scroll sideways on a phone.
            <div key={key} className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-start text-sm">
                {block.caption && (
                  <caption className="mb-2 text-start text-sm text-heading/70">
                    {block.caption}
                  </caption>
                )}
                <thead>
                  <tr>
                    {block.head.map((cell) => (
                      <th
                        key={cell}
                        scope="col"
                        className="border border-heading/15 bg-heading/5 px-3 py-2 text-start font-semibold text-heading"
                      >
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
                        <td key={column} className="border border-heading/15 px-3 py-2 align-top">
                          {row[columnIndex] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        if (block.type === 'unordered') {
          return (
            <ul key={key} className="list-disc space-y-2 pe-6">
              {block.items.map((item) => (
                <li key={item} className="ps-1">
                  {item}
                </li>
              ))}
            </ul>
          )
        }

        return (
          <ol key={key} className="space-y-2">
            {block.items.map((item, itemIndex) => (
              <li key={item} className="flex gap-2">
                <span className="shrink-0 font-semibold text-heading tabular-nums">
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
    <div className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">{doc.title}</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">{doc.title}</h1>
        <p className="mt-2 text-sm text-heading/70">
          עודכן לאחרונה: <time dateTime={doc.updatedAt}>{updated}</time>
        </p>
      </header>

      {doc.reviewNotice && (
        // Visible, not a comment. A page that looks final is treated as final.
        <p
          role="note"
          className="mb-8 max-w-3xl rounded-lg border border-heading/20 bg-heading/5 px-4 py-3 text-sm leading-relaxed text-heading/80"
        >
          {doc.reviewNotice}
        </p>
      )}

      <div className="max-w-3xl space-y-4 text-base leading-relaxed text-heading/90">
        {doc.intro.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>

      <nav
        aria-labelledby="legal-toc"
        className="mt-8 max-w-3xl rounded-xl border border-heading/15 p-5"
      >
        <h2 id="legal-toc" className="text-lg font-bold text-heading">
          תוכן העניינים
        </h2>
        <ol className="mt-3 space-y-1 text-base">
          {doc.sections.map((section, index) => (
            <li key={section.id} className="flex gap-2">
              <span className="shrink-0 text-heading/70 tabular-nums">{index + 1}.</span>
              <a
                href={`#${section.id}`}
                className="text-heading/85 underline underline-offset-4 hover:text-heading"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="mt-10 max-w-3xl space-y-10 text-base leading-relaxed text-heading/90">
        {doc.sections.map((section, index) => (
          // scroll-mt keeps the anchored heading clear of the sticky header
          // when support links straight into a clause.
          <section key={section.id} id={section.id} className="scroll-mt-28 space-y-4">
            <h2 className="text-xl font-bold text-heading">
              {index + 1}. {section.title}
            </h2>
            <Blocks blocks={section.blocks} sectionNumber={index + 1} />
          </section>
        ))}
      </article>

      <div className="max-w-3xl">{children}</div>

      <div className="mt-10 max-w-3xl border-t border-heading/15 pt-6">
        <LegalFooterLinks current={doc.slug} />
      </div>
    </div>
  )
}
