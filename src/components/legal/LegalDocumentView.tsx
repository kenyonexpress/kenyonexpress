import type { LegalDocument } from '@/content/legal/types'
import Link from 'next/link'

/**
 * One renderer for every legal document on the site.
 *
 * Blocks in, React out - no `dangerouslySetInnerHTML`. The migrated documents
 * come from a WordPress export whose markup carries stray closing tags and
 * empty sections, and a binding document reconstructed by a browser's error
 * recovery is a different document in a different browser.
 *
 * Headings are real `<h2>` elements so the two long documents (about 1,700 and
 * 2,300 words) can be navigated by heading with a screen reader instead of read
 * end to end.
 */
export default function LegalDocumentView({
  document,
  breadcrumb,
}: {
  document: LegalDocument
  breadcrumb: string
}) {
  const updated = new Date(document.updatedAt).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">{breadcrumb}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-heading">{document.title}</h1>
        <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>
      </header>

      {document.reviewNotice && (
        // Visible, not a comment. A page that looks final is read as final.
        <p
          role="note"
          className="mb-8 rounded-lg border border-heading/20 bg-heading/5 px-4 py-3 text-sm leading-relaxed text-heading/80"
        >
          {document.reviewNotice}
        </p>
      )}

      <article className="max-w-3xl space-y-4 text-base leading-relaxed text-heading/90">
        {document.blocks.map((block, index) => {
          // Legal text is static and ordered; the index IS the identity here.
          const key = `${block.type}-${index}`
          if (block.type === 'heading') {
            return (
              <h2 key={key} className="pt-4 text-xl font-bold text-heading">
                {block.text}
              </h2>
            )
          }
          if (block.type === 'paragraph') {
            return <p key={key}>{block.text}</p>
          }
          // Keyed by the text itself: these lists are static legal clauses,
          // never reordered and never appended to at runtime, and two identical
          // clauses in one list would be a bug in the document.
          const items = block.items.map((item) => (
            <li key={item} className="ps-1">
              {item}
            </li>
          ))
          return block.type === 'ordered' ? (
            <ol key={key} className="list-decimal space-y-2 pe-6">
              {items}
            </ol>
          ) : (
            <ul key={key} className="list-disc space-y-2 pe-6">
              {items}
            </ul>
          )
        })}
      </article>
    </main>
  )
}
