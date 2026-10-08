/**
 * The three-shape markdown a category buyer guide is written in (STEP 65).
 *
 * `## ` opens a heading, `- ` (or `* `) opens a bullet, a blank line ends a
 * paragraph, and every other line is paragraph text. Nothing else is
 * interpreted: no links, no emphasis, no HTML. The parser returns typed
 * blocks and the component builds React elements from them, so a row an
 * editor saves can never carry markup into the page, and the admin textarea
 * needs no toolbar. Three shapes are enough for a guide: a few headings, a
 * few paragraphs and a checklist.
 *
 * Pure, synchronous, dependency-free, and shared by the storefront, the
 * admin's word counter and the tests.
 */

export type GuideBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }

// A bare marker (`##`, `-`) is an empty heading or bullet and is dropped, not printed.
const HEADING = /^#{1,6}(?:\s+(.*))?$/
const BULLET = /^[-*](?:\s+(.*))?$/

export function parseGuideMarkdown(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (list.length === 0) return
    blocks.push({ kind: 'list', items: list })
    list = []
  }

  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      const text = heading[1]?.trim() ?? ''
      if (text) blocks.push({ kind: 'heading', text })
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      flushParagraph()
      const text = bullet[1]?.trim() ?? ''
      if (text) list.push(text)
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}

/** A token counts as a word when it carries a letter or a digit, in any script. */
const WORD = /[\p{L}\p{N}]/u

/**
 * Words in a guide, markers excluded. The admin shows this next to the
 * target so an editor can see "180 / 300" while typing, and the authored
 * guides are tested against the same count.
 */
export function countGuideWords(body: string): number {
  let count = 0
  for (const block of parseGuideMarkdown(body)) {
    const text = block.kind === 'list' ? block.items.join(' ') : block.text
    for (const token of text.split(/\s+/)) if (WORD.test(token)) count += 1
  }
  return count
}

/**
 * The first paragraph, cut to a meta-description length on a word boundary.
 * A category with no `description_he` (every live one but one) gets its
 * guide's opening line as the description instead of the generic fallback.
 */
export function guideExcerpt(body: string, maxLength = 155): string | null {
  const first = parseGuideMarkdown(body).find((block) => block.kind === 'paragraph')
  if (!first || first.kind !== 'paragraph') return null
  const text = first.text.replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  const cut = text.slice(0, maxLength)
  const atSpace = cut.lastIndexOf(' ')
  return `${(atSpace > maxLength / 2 ? cut.slice(0, atSpace) : cut).replace(/[,.;:]+$/, '')}…`
}
