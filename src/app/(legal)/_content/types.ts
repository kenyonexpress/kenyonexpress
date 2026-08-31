/**
 * The shape the legal pages in this route group are written in.
 *
 * Blocks and sections rather than one HTML string, for the same reason the
 * older documents in `src/content/legal` are: a binding document that reaches
 * the reader through a browser's HTML error recovery is a different document in
 * a different browser. Here the structure carries two things that string does
 * not: every section has a stable `id`, so support can link a customer to the
 * exact clause instead of "see the terms", and the section list renders as a
 * table of contents without anybody maintaining a second copy of it.
 */
export type LegalBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'ordered'; items: string[] }
  | { type: 'unordered'; items: string[] }
  /** Set off visually. For the sentence in a section a reader must not miss. */
  | { type: 'note'; text: string }
  | { type: 'table'; caption?: string; head: string[]; rows: string[][] }

export interface LegalSection {
  /**
   * The URL fragment this section is linked by. Stable across edits: a support
   * macro or an email that points at `#coupon-redemption` must keep working
   * when the wording of the clause changes.
   */
  id: string
  title: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  /** Path segment under `/legal`. */
  slug: 'terms' | 'privacy' | 'returns' | 'accessibility'
  title: string
  /** Sentence for `<meta name="description">` and for the footer link title. */
  description: string
  /** ISO date, shown to the reader. A wording change is a new date. */
  updatedAt: string
  /** Opening paragraphs, before the numbered sections and the contents list. */
  intro: string[]
  sections: LegalSection[]
  /**
   * Says, visibly, that the text has not been through a lawyer yet. Never a
   * code comment: a page that looks final is read as final by the customer and
   * by the regulator, and this site's own spec (docs/ARCHITECTURE-LEGAL-PAGES.md
   * gate LP3) makes counsel approval a launch blocker.
   */
  reviewNotice?: string
}
