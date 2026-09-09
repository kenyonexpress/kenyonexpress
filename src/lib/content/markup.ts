/**
 * The restricted markup that operator-authored page bodies are written in, and
 * the parser that turns it into a typed tree.
 *
 * WHY NOT HTML, WHICH IS WHAT A CMS NORMALLY STORES. Because a CMS body is
 * request-derived text that an operator types into a form, and rendering it
 * needs `dangerouslySetInnerHTML`. `scripts/raw-html-gate.mjs` fails the build
 * for exactly that, and its message is the argument: "Catalogue copy is
 * authored in the admin panel, so a template literal here is reachable from a
 * form." Storing HTML would mean either turning that gate off for this feature
 * or adding a sanitiser and trusting it -- a sanitiser being a denylist of the
 * attacks somebody thought of, kept current by nobody, in a repository with no
 * such dependency today.
 *
 * A parser inverts it. The output of this module is a tree of four block kinds
 * and three inline kinds and NOTHING ELSE, so the renderer emits React children
 * and there is no code path that turns operator text into markup. `<script>` in
 * a body is five literal characters that React escapes on the way out; it is
 * not a hole that a sanitiser happened to close.
 *
 * WHAT IS DELIBERATELY NOT SUPPORTED, and why each absence is a decision:
 *
 *   Images. An image is a URL, a size and an alt text, which is a form field
 *   and not a piece of punctuation. A body that can reference arbitrary remote
 *   images is also a body that can beacon a reader's IP to a third party.
 *
 *   Tables. They do not survive 380px, which every visual stage here is
 *   measured at, and a body language that can emit an unresponsive block hands
 *   the operator a way to break the page from a text box.
 *
 *   Raw HTML passthrough, `#` level-1 headings (the page title is a column, and
 *   a second `<h1>` is a document-outline defect the operator cannot see), and
 *   nested lists.
 *
 * ANYTHING UNRECOGNISED IS LITERAL TEXT. There is no parse error and no
 * rejected save: an operator who types an asterisk gets an asterisk. A markup
 * language that refuses the document is a markup language that loses the
 * document, and the person typing has no way to tell which of the fifty lines
 * offended it.
 */

/** A run of text inside a block. `text` is always the visible words. */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; href: string }

export type Block =
  | { kind: 'heading'; level: 2 | 3; spans: Inline[] }
  | { kind: 'paragraph'; spans: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'quote'; spans: Inline[] }

/**
 * Whether a link target may be rendered as a link.
 *
 * An allowlist of four shapes, not a denylist of `javascript:`. The denylist
 * form has to enumerate `javascript:`, `data:`, `vbscript:`, the same with a
 * tab or a newline inside the scheme, and the same percent-encoded -- and it is
 * wrong the first time one is forgotten. The allowlist is wrong only by
 * refusing something harmless, which shows up as a link that renders as plain
 * words and which somebody then reports.
 *
 * `//evil.example` is refused on purpose: it LOOKS site-relative in a text box
 * and is a protocol-relative URL to another host, which is the one link an
 * operator could paste believing it stays on this site.
 */
export function isRenderableHref(href: string): boolean {
  const value = href.trim()
  if (value.length === 0) return false
  if (value.startsWith('//')) return false
  if (value.startsWith('/')) return true
  return /^(https:\/\/|mailto:|tel:)/i.test(value)
}

const INLINE_PATTERN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g

/**
 * Bold and links inside one block's text.
 *
 * A link whose href fails `isRenderableHref` degrades to its LABEL as plain
 * text rather than disappearing. Dropping the whole construct would silently
 * delete a sentence's worth of words from a published page, and the operator
 * would be looking at a preview that is missing text with nothing saying so.
 */
export function parseInline(source: string): Inline[] {
  const spans: Inline[] = []
  let cursor = 0

  const pushText = (text: string) => {
    if (text.length === 0) return
    const previous = spans[spans.length - 1]
    if (previous?.kind === 'text') previous.text += text
    else spans.push({ kind: 'text', text })
  }

  INLINE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null = INLINE_PATTERN.exec(source)
  while (match !== null) {
    pushText(source.slice(cursor, match.index))
    const [whole, bold, label, href] = match
    if (bold !== undefined) {
      spans.push({ kind: 'strong', text: bold })
    } else if (label !== undefined && href !== undefined) {
      if (isRenderableHref(href)) spans.push({ kind: 'link', text: label, href: href.trim() })
      else pushText(label)
    }
    cursor = match.index + whole.length
    match = INLINE_PATTERN.exec(source)
  }
  pushText(source.slice(cursor))

  return spans
}

const HEADING = /^(#{2,3})\s+(.*)$/
const BULLET = /^[-*]\s+(.*)$/
const ORDERED = /^\d+[.)]\s+(.*)$/
const QUOTE = /^>\s?(.*)$/

/**
 * The block structure of a body.
 *
 * Line-based rather than character-based, because the thing being parsed is
 * typed into a `<textarea>` by a person, where the unit that exists is the
 * line. It also makes the failure mode legible: a line either matched a prefix
 * or is paragraph text, and there is no state in which half a document is
 * consumed by an unterminated construct.
 *
 * Consecutive list lines of the SAME kind join one list. A bullet line after an
 * ordered line starts a new list, so a body cannot produce an `<ol>` whose
 * markers are bullets.
 */
export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let quote: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join(' ')) })
    paragraph = []
  }
  const flushQuote = () => {
    if (quote.length === 0) return
    blocks.push({ kind: 'quote', spans: parseInline(quote.join(' ')) })
    quote = []
  }
  const flush = () => {
    flushParagraph()
    flushQuote()
  }

  const appendItem = (ordered: boolean, text: string) => {
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'list' && last.ordered === ordered) {
      last.items.push(parseInline(text))
      return
    }
    blocks.push({ kind: 'list', ordered, items: [parseInline(text)] })
  }

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()

    if (line.length === 0) {
      flush()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '').length === 2 ? 2 : 3,
        spans: parseInline((heading[2] ?? '').trim()),
      })
      continue
    }

    const quoted = QUOTE.exec(line)
    if (quoted) {
      flushParagraph()
      quote.push((quoted[1] ?? '').trim())
      continue
    }

    const bullet = BULLET.exec(line)
    if (bullet) {
      flush()
      appendItem(false, (bullet[1] ?? '').trim())
      continue
    }

    const ordered = ORDERED.exec(line)
    if (ordered) {
      flush()
      appendItem(true, (ordered[1] ?? '').trim())
      continue
    }

    flushQuote()
    paragraph.push(line)
  }

  flush()
  return blocks
}

/**
 * The body as one line of plain words.
 *
 * This is what a `<meta name="description">` falls back to when the operator
 * left the SEO field empty, and what the admin list shows as an excerpt. It is
 * derived rather than stored so it cannot disagree with the body.
 */
export function plainText(source: string): string {
  return parseBlocks(source)
    .flatMap((block) =>
      block.kind === 'list' ? block.items.map(spansText) : [spansText(block.spans)],
    )
    .filter((line) => line.length > 0)
    .join(' ')
}

function spansText(spans: Inline[]): string {
  return spans
    .map((span) => span.text)
    .join('')
    .trim()
}

/**
 * `plainText` cut to a meta-description length on a word boundary.
 *
 * 160 characters because that is where Google truncates, and cutting at a space
 * because a description that ends mid-word reads as broken rather than as
 * abbreviated. Hebrew counts the same: the limit is characters, not bytes.
 */
export function excerpt(source: string, limit = 160): string {
  const text = plainText(source)
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
