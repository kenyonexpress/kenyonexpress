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

/**
 * One published version of a document.
 *
 * A legal page is quoted back later: "the terms in force when I bought". The
 * date a wording was PUBLISHED and the date it TOOK EFFECT are two different
 * facts, and a dispute turns on the second. Each entry carries both and a
 * one-line summary of what changed, so the page itself is the changelog and
 * nobody reconstructs it from git.
 */
export interface LegalVersion {
  /** `major.minor`. A new obligation on the reader is a major; wording is a minor. */
  version: string
  /** ISO date this version became binding. */
  effectiveAt: string
  /** What changed, in one sentence a customer can read. */
  summary: string
}

export type LegalSlug = 'terms' | 'privacy' | 'cookies' | 'returns' | 'shipping' | 'accessibility'

export interface LegalDoc {
  /** Stable identifier; also the key `getLegalDoc` is called with. */
  slug: LegalSlug
  /**
   * The public URL the document is served at. NOT derived from the slug: the
   * terms live at `/terms-and-conditions` and the cancellation policy at
   * `/refund_returns`, because those are the WordPress paths receipts print
   * and search engines hold, and `next.config.ts` 308s the short English
   * names onto them. One field here, read by the footer, the sitemap and the
   * page metadata, so the three cannot disagree about where a policy lives.
   */
  path: string
  title: string
  /** Sentence for `<meta name="description">` and for the footer link title. */
  description: string
  /** ISO date, shown to the reader. A wording change is a new date. */
  updatedAt: string
  /** The version currently in force. Equals the last entry of `history`. */
  version: string
  /** ISO date the current version became binding. Equals the last entry of `history`. */
  effectiveAt: string
  /** Every published version, oldest first. The last entry is the current one. */
  history: LegalVersion[]
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
