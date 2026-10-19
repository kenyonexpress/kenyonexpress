/**
 * Comment-stripping for guards that scan source text.
 *
 * WHY THIS IS A SHARED MODULE AND NOT A HELPER IN EACH TEST. Eight guards in
 * this repository have reported a wrong answer because they matched a literal
 * inside a COMMENT and read it as code. Several were written by the same work
 * that was removing the shape from elsewhere, and one was written in the same
 * pass that found the bug: privacy-processors.test.ts asserted that a vendor
 * appeared in a table, and stayed green with that table row deleted, because
 * the file's own header comment named the vendor while explaining why it had
 * been missing.
 *
 *   migration-lint.mjs          matched its own documentation
 *   audits-are-wired.test.ts    "measure-route-js is deliberately NOT wired"
 *   measure-live-vitals.test    the comment describing the arrayBuffer bug
 *   cache-policy (a grep)       three cacheLife mentions inside prose
 *   voucher-lifecycle.test.ts   a quotation of the stale warning it checked
 *   privacy-processors.test.ts  the paragraph about the missing processor
 *
 * Twenty-six files had grown their own version by then, in at least two
 * behaviours, and they did not agree. audits-are-wired.test.ts filtered lines
 * beginning with a slash-slash, a hash or a star, and never removed block
 * comments at all - so the opening line of a JSDoc block survived intact and
 * every literal on it stayed visible. That hole was latent rather than live,
 * which is the only reason it had not produced a ninth wrong answer.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. This is line-oriented and not a parser. It
 * does not know that a URL literal contains a slash-slash, and it does not need
 * to: the line filter is anchored to the START of a trimmed line, and a URL
 * inside a string never begins one. A real tokenizer would be more correct and
 * would also be a dependency, while every caller here is asking the same coarse
 * question - is this directive present in the code, or only described in prose.
 *
 * WHY .mjs AND NOT .ts. Four of the callers are gates that run under plain node
 * (hardcoded-gate.mjs, audit-hardcoded.mjs, measure-live-vitals.test.mjs), and
 * those cannot import TypeScript. A .ts module would have forced a second copy
 * for them, which is the duplication this file exists to end. allowJs is on, so
 * the TypeScript guards import this same file.
 *
 * @param {string} text
 * @returns {string}
 */

/**
 * Line-comment markers, per language family.
 *
 * These are NOT one list. Every copy this module replaces used a single set
 * containing `//`, `#` and `*`, which is wrong in both directions: `#` begins a
 * private class field in TypeScript and an id selector in CSS, and `//` begins
 * nothing in YAML or shell. A merged list therefore blanks real code. Same
 * cause as the block-comment note below - the language is not optional context.
 */
const C_LINE_MARKERS = ['//', '*']
const HASH_LINE_MARKERS = ['#']

/**
 * Extensions whose block-comment syntax is the C one.
 *
 * MEASURED, while migrating the first caller. Applying block-comment rules to
 * YAML silently destroys the file: `ci.yml` contains
 * `hashFiles('src/**', 'next.config.ts')`, and the glob reads as a block that
 * opens and never closes, so every line after it is blanked. That made
 * `audits-are-wired.test.ts` report two audit scripts as unwired that are wired
 * 120 lines further down. A shell script hits the same thing on any path glob.
 *
 * So the language is not guessable from the text and callers must say which
 * they have - `stripCommentsFor` reads it off the filename.
 */
const BLOCK_COMMENT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
])

/**
 * True when a file of this name uses C-style block comments.
 *
 * @param {string} filename
 * @returns {boolean}
 */
export function hasBlockComments(filename) {
  const dot = filename.lastIndexOf('.')
  return dot !== -1 && BLOCK_COMMENT_EXTENSIONS.has(filename.slice(dot))
}

/**
 * Every line, with comment text replaced by an empty string.
 *
 * Line-PRESERVING, because two callers report line numbers to a human and would
 * be lying if the numbering shifted: hardcoded-gate.mjs and audit-hardcoded.mjs
 * print `file:line` for every offending literal. They previously classified
 * comments one line at a time, which cannot see that a line sits INSIDE a block
 * that opened earlier, so a hex colour written under an unterminated opener was
 * still reported as hardcoded. That is the same class of error in the other
 * direction - prose read as code - and it is why this walks a state machine
 * rather than testing each line alone.
 *
 * Known limit, shared with every version this replaces: the markers are matched
 * as text, so a block-opening sequence inside a STRING literal would be read as
 * a comment. No caller writes one, and the alternative is a real tokenizer.
 *
 * @param {string} text
 * @param {{ block?: boolean }} [options] `block: false` for YAML, shell and any
 *   other language where a slash-star sequence is data rather than a comment.
 * @returns {string[]} one entry per input line
 */
export function blankCommentLines(text, options = {}) {
  const block = options.block !== false
  const markers = block ? C_LINE_MARKERS : HASH_LINE_MARKERS
  const out = []
  let inBlock = false

  for (const line of text.split('\n')) {
    if (inBlock) {
      const close = line.indexOf('*/')
      if (close === -1) {
        out.push('')
        continue
      }
      inBlock = false
      out.push(
        stripOpenBlock(line.slice(close + 2), () => {
          inBlock = true
        }),
      )
      continue
    }

    const trimmed = line.trim()
    if (markers.some((marker) => trimmed.startsWith(marker))) {
      out.push('')
      continue
    }

    out.push(
      block
        ? stripOpenBlock(line, () => {
            inBlock = true
          })
        : line,
    )
  }

  return out
}

/**
 * One line with any block comments removed, calling `onOpen` if one is still open
 * at the end of it.
 *
 * @param {string} line
 * @param {() => void} onOpen
 * @returns {string}
 */
function stripOpenBlock(line, onOpen) {
  let rest = line
  let kept = ''

  for (;;) {
    const open = rest.indexOf('/*')
    if (open === -1) return kept + rest

    kept += rest.slice(0, open)
    const close = rest.indexOf('*/', open + 2)
    if (close === -1) {
      onOpen()
      return kept
    }
    rest = rest.slice(close + 2)
  }
}

/**
 * Source with comments removed.
 *
 * Block comments go first, so a JSDoc opening line cannot survive by failing the
 * per-line test - that is the exact hole one of the copies had.
 *
 * @param {string} text
 * @param {{ block?: boolean }} [options]
 * @returns {string}
 */
export function stripComments(text, options) {
  return blankCommentLines(text, options)
    .filter((line) => line.trim() !== '')
    .join('\n')
}

/**
 * Comments removed, with the language chosen by the file's own name.
 *
 * The right entry point for any scanner that reads more than one kind of file.
 *
 * @param {string} filename
 * @param {string} text
 * @returns {string}
 */
export function stripCommentsFor(filename, text) {
  return stripComments(text, { block: hasBlockComments(filename) })
}

/**
 * True when `needle` appears in the CODE of `text` rather than in its prose.
 *
 * This is the question all eight of the wrong guards were actually asking.
 *
 * @param {string} text
 * @param {string} needle
 * @returns {boolean}
 */
export function codeContains(text, needle) {
  return stripComments(text).includes(needle)
}
