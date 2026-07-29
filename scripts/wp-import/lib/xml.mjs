// A small XML pull parser, sized for WordPress eXtended RSS (WXR).
//
// WHY NOT A LIBRARY
//
// The pipeline has zero runtime dependencies by design (lib/http.mjs uses fetch,
// lib/db.mjs uses the Supabase client the app already ships). Adding an XML
// parser for one stage would put a transitive tree into the migration path, and
// the migration path is the code that decides what the catalogue looks like
// forever. WXR is RSS 2.0 with four namespaces and no mixed content that
// matters, which is small enough to parse honestly in 200 lines.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// No DTD, no entity declarations, no namespace resolution (prefixes are kept
// verbatim, so `wp:post_id` is the key), no XPath. A WXR file that needs any of
// those is malformed, and guessing at malformed input is how a catalogue picks
// up silent corruption.

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Decode XML character references and the five predefined entities.
 *
 * `&amp;` is decoded LAST in effect because we do a single pass: decoding
 * `&amp;lt;` in two passes would produce `<` where the document said the
 * literal text `&lt;`. A single regex pass cannot make that mistake.
 */
export function decodeEntities(text) {
  if (!text || text.indexOf('&') === -1) return text
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      // Reject surrogates and out-of-range: String.fromCodePoint throws on them
      // and a throw here would abort a whole import over one bad character.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      if (code >= 0xd800 && code <= 0xdfff) return match
      return String.fromCodePoint(code)
    }
    const named = NAMED_ENTITIES[body]
    return named === undefined ? match : named
  })
}

/**
 * Parse one XML element (and its descendants) into a plain object.
 *
 * Shape, chosen to keep WXR access readable:
 *   { name, attrs: {}, text: '', children: [node], child: { name: [node] } }
 *
 * `child` is the by-name index. Repeated elements (every `wp:postmeta`, every
 * `category`) land in the array under their name, so callers never have to
 * filter `children` themselves.
 */
function makeNode(name, attrs) {
  return { name, attrs, text: '', children: [], child: Object.create(null) }
}

function appendChild(parent, node) {
  parent.children.push(node)
  const bucket = parent.child[node.name]
  if (bucket) bucket.push(node)
  else parent.child[node.name] = [node]
}

const TAG_NAME = /[^\s/>]+/y
const ATTR = /\s*([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/y

/**
 * Parse the fragment in `source` starting at `start`, which must be the `<` of
 * the opening tag. Returns { node, end } where `end` is the index just past the
 * closing tag.
 */
export function parseElement(source, start = 0) {
  let i = source.indexOf('<', start)
  if (i === -1) throw new Error('parseElement: no element found')

  TAG_NAME.lastIndex = i + 1
  const nameMatch = TAG_NAME.exec(source)
  if (!nameMatch) throw new Error(`parseElement: unnamed tag at ${i}`)
  const node = makeNode(nameMatch[0], Object.create(null))
  i = TAG_NAME.lastIndex

  // Attributes
  for (;;) {
    ATTR.lastIndex = i
    const attr = ATTR.exec(source)
    if (!attr) break
    node.attrs[attr[1]] = decodeEntities(attr[3] ?? attr[4] ?? '')
    i = ATTR.lastIndex
  }

  // Skip to the end of the opening tag
  while (i < source.length && source[i] !== '>') {
    if (source[i] === '/' && source[i + 1] === '>') return { node, end: i + 2 } // self-closing
    i += 1
  }
  i += 1 // past '>'

  const closing = `</${node.name}`
  let text = ''

  while (i < source.length) {
    const next = source.indexOf('<', i)
    if (next === -1) {
      text += source.slice(i)
      break
    }
    text += source.slice(i, next)

    // CDATA: taken verbatim, no entity decoding. This is where WooCommerce puts
    // post_content, and its markup is full of ampersands that are NOT entities.
    if (source.startsWith('<![CDATA[', next)) {
      const close = source.indexOf(']]>', next + 9)
      const stop = close === -1 ? source.length : close
      text += source.slice(next + 9, stop)
      i = close === -1 ? source.length : close + 3
      continue
    }
    if (source.startsWith('<!--', next)) {
      const close = source.indexOf('-->', next + 4)
      i = close === -1 ? source.length : close + 3
      continue
    }
    if (source.startsWith('<?', next)) {
      const close = source.indexOf('?>', next + 2)
      i = close === -1 ? source.length : close + 2
      continue
    }
    // <!DOCTYPE ...>, <!ENTITY ...>: skipped, not parsed. See the header note.
    if (source.startsWith('<!', next)) {
      const close = source.indexOf('>', next)
      i = close === -1 ? source.length : close + 1
      continue
    }
    if (source.startsWith(closing, next)) {
      const close = source.indexOf('>', next)
      i = close === -1 ? source.length : close + 1
      break
    }
    // A closing tag that is not ours. Real exports contain these: a fragment
    // sliced out of a larger document carries the parent's `</channel>`, and
    // hand-edited WXR carries unbalanced markup. Recursing here would try to
    // parse `/channel` as an element name and throw, taking the whole import
    // down over a tag we did not need. Skip it and keep reading.
    if (source[next + 1] === '/') {
      const close = source.indexOf('>', next)
      i = close === -1 ? source.length : close + 1
      continue
    }

    const { node: kid, end } = parseElement(source, next)
    appendChild(node, kid)
    i = end
  }

  node.text = decodeEntities(text)
  return { node, end: i }
}

/** Text of the first child with this name, or null. */
export function childText(node, name) {
  const found = node?.child?.[name]
  if (!found || found.length === 0) return null
  const value = found[0].text
  return value === '' ? '' : value
}

/** Text of every child with this name. */
export function childTexts(node, name) {
  return (node?.child?.[name] ?? []).map((n) => n.text)
}

/**
 * Stream `<item>` elements out of a WXR file without holding it in memory.
 *
 * A WooCommerce export of a real catalogue runs to hundreds of megabytes once
 * attachments and orders are included, and `readFileSync` on that either throws
 * or pushes the process into swap. This keeps a sliding window: read a chunk,
 * emit every complete <item> in it, retain the tail that might be a partial one.
 *
 * The window is capped. An <item> larger than the cap means the file is not
 * WXR (or is truncated), and failing loudly there beats silently importing a
 * catalogue that is missing whatever came after the corruption.
 */
export async function* streamItems(
  readable,
  { tag = 'item', maxItemBytes = 64 * 1024 * 1024 } = {},
) {
  const open = `<${tag}`
  const close = `</${tag}>`
  let buffer = ''

  for await (const chunk of readable) {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')

    for (;;) {
      const start = buffer.indexOf(open)
      if (start === -1) break
      const end = buffer.indexOf(close, start)
      if (end === -1) break

      const fragment = buffer.slice(start, end + close.length)
      buffer = buffer.slice(end + close.length)
      yield parseElement(fragment, 0).node
    }

    // Retain only what could still be the head of an item. Everything before
    // the first `<item` is channel-level preamble we have already handled.
    const keepFrom = buffer.indexOf(open)
    if (keepFrom > 0) buffer = buffer.slice(keepFrom)

    if (buffer.length > maxItemBytes) {
      throw new Error(
        `xml: no </${tag}> within ${maxItemBytes} bytes - the export is truncated or is not WXR`,
      )
    }
  }
}

/**
 * Read the channel-level preamble: everything before the first <item>.
 *
 * `wp:term` / `wp:category` live here, and they are the authoritative taxonomy
 * (an <item> only names the terms it belongs to, and only by nicename). Parsing
 * them from the preamble is what lets the category tree be built parents-first.
 */
export async function readPreamble(readable, { limitBytes = 8 * 1024 * 1024 } = {}) {
  let buffer = ''
  for await (const chunk of readable) {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    const firstItem = buffer.indexOf('<item')
    if (firstItem !== -1) return `${buffer.slice(0, firstItem)}</channel></rss>`
    if (buffer.length > limitBytes) break
  }
  // No <item> at all: a taxonomy-only export is legal and useful.
  return buffer
}
