/**
 * The XML escaping both feeds depend on, in one place and tested on its own.
 *
 * This is the failure mode that makes a feed silently useless: a single `&` in
 * a Hebrew product name ("קפה & מאפה", which is an ordinary shop name here)
 * produces a document that is not well-formed, and a consumer that cannot parse
 * one item cannot parse the FILE. Google Merchant reports it as a fetch failure
 * with no item named, and an RSS reader shows nothing at all. Neither says
 * which product did it.
 *
 * The five predefined entities are escaped, `&` first so the ampersands the
 * other four introduce are not escaped twice. Control characters that XML 1.0
 * cannot represent AT ALL are dropped rather than escaped: `&#x0;` is not legal
 * either, so escaping them would produce the same unparseable file by a longer
 * route. Tab, newline and carriage return are the three that are legal and are
 * kept.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: that is precisely the set being removed.
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

export function escapeXml(value: string): string {
  return value
    .replace(ILLEGAL_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** `<tag>escaped</tag>`, or nothing at all when there is no value. */
export function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'number' ? String(value) : value.trim()
  if (text === '') return ''
  return `<${name}>${escapeXml(text)}</${name}>`
}

/**
 * `<tag><![CDATA[...]]></tag>`.
 *
 * Only for the two description fields, where a shop's own copy may legitimately
 * contain markup. `]]>` is the one sequence that can close the section early,
 * and it is split across two sections rather than escaped, because there is no
 * escape for it inside CDATA — a `&` in there is a literal ampersand.
 */
export function cdata(name: string, value: string | null | undefined): string {
  const text = value?.trim()
  if (!text) return ''
  const safe = text.replace(ILLEGAL_XML_CHARS, '').split(']]>').join(']]]]><![CDATA[>')
  return `<${name}><![CDATA[${safe}]]></${name}>`
}

/** RFC 822, which is what RSS 2.0 `pubDate` and `lastBuildDate` require. */
export function rfc822(date: Date): string {
  return date.toUTCString()
}
