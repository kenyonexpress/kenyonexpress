/**
 * The comparison form of a URL path, for the legacy redirect map.
 *
 * Deliberately in its own module with NO `server-only` import. It is a pure
 * string function with no environment of its own, and keeping it out of the
 * server-only module is what lets it be unit tested directly. The contract it
 * encodes is worth more than the module boundary: it MUST behave identically
 * here, in scripts/wp-import/02-transform.mjs (which decides rows) and in
 * wp_import.fn_project_redirects (which projects them). When those three
 * drift, nothing errors and nothing logs. Rows are simply written that no
 * request can ever match, and every old URL 404s exactly as if no redirect had
 * been configured.
 *
 * Steps: drop fragment and query, percent-decode, NFC-normalise, lowercase,
 * strip trailing slashes.
 *
 * NFC is not optional here. Hebrew can arrive composed or decomposed depending
 * on the client that produced the link; those are different byte strings for
 * the same visible word, and without folding them they never compare equal.
 */
export function normalizePath(pathname: string): string {
  if (!pathname) return '/'
  // `noUncheckedIndexedAccess` is on, and split() is typed as possibly sparse
  // even though the first element always exists. Slicing at the delimiter
  // avoids the indexed access rather than asserting past it.
  const noFragment = pathname.split('#', 1).join('')
  let out = noFragment.split('?', 1).join('')
  try {
    out = decodeURIComponent(out)
  } catch {
    // A malformed percent sequence is left as-is. A bad legacy URL should
    // still get a chance to match rather than throwing inside middleware,
    // where an exception takes the page down for every visitor.
  }
  out = out.normalize('NFC').toLowerCase().replace(/\/+$/, '')
  return out || '/'
}
