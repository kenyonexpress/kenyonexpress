/**
 * The shape every legal page on this site is written in.
 *
 * Blocks rather than an HTML string, and that is a decision about a legal
 * document specifically: the WordPress export these were lifted from carries
 * stray `</p>` tags with no opener and empty `<section>` pairs, so piping it
 * into `dangerouslySetInnerHTML` would mean a binding document rendered through
 * a browser's error recovery, differently per browser. It also means every
 * document here is searchable, testable and renderable RTL by one component.
 */
export type LegalBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ordered'; items: string[] }
  | { type: 'unordered'; items: string[] }

export interface LegalDocument {
  title: string
  /** Shown under the title so a reader knows how current the text is. ISO date. */
  updatedAt: string
  /** One paragraph for `<meta name="description">`. */
  description: string
  blocks: LegalBlock[]
  /**
   * Set when the text on the page has NOT been through a lawyer, and says what
   * it is instead. Rendered as a visible notice, never hidden in a comment: a
   * page that looks final is treated as final by whoever reads it.
   */
  reviewNotice?: string
}
