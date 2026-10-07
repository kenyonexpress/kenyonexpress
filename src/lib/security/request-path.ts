/**
 * The path of the page a request was for, carried on a request header the
 * proxy sets and nothing else may.
 *
 * WHY A HEADER AND NOT THE REFERER
 *
 * `Referrer-Policy: strict-origin` (STEP 30) trims every Referer this site
 * sends to its origin, including the same-origin one a server action's POST
 * carries. The consent action used to read the page path off that header to
 * send the visitor back where they were; under `strict-origin` it would read
 * `https://kenyonexpress.co.il/` and bounce every Accept click to the home
 * page. The path has to travel some other way, and a hidden form field would
 * need the page to know its own path, which under cacheComponents means
 * runtime data in a banner that lives in the static shell.
 *
 * The proxy sees every request, including the action POST, which is made to
 * the URL of the page it was submitted from. It writes that path here. The
 * header is SET, not preserved: a client cannot inject it, because whatever a
 * client sends under this name is overwritten before the request is routed.
 */
export const REQUEST_PATH_HEADER = 'x-request-path'

/**
 * A path that is safe to `redirect()` to: relative, rooted, and not a
 * scheme-relative URL. `//evil.example` is a path to `new URL` and an
 * off-site navigation to a browser, which is the open redirect this refuses.
 * Anything else falls back to the home page.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/'
  }
  if (/[\r\n]/.test(value)) return '/'
  return value
}

/** The same rule applied to a full Referer URL: its path and query, or `/`. */
export function returnPathFromReferer(referer: string | null | undefined): string {
  if (!referer) return '/'
  try {
    const url = new URL(referer)
    return safeReturnPath(`${url.pathname}${url.search}`)
  } catch {
    return '/'
  }
}
