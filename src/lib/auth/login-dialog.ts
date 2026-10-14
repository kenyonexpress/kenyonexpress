/**
 * The login dialog's open signal (UX23).
 *
 * WHY AN EVENT AND NOT A STORE. The dialog is mounted once, in the storefront
 * chrome, and the controls that open it are scattered: the top bar's account
 * link, the gift page's claim button, the gift-card redeem link, the search
 * page's save link. Every one of those is a real `<a href="/login?next=...">`
 * first, so without JavaScript, in a route group that has no dialog (the auth
 * pages, the supplier portal), or on a middle-click, it is a plain link to
 * the login page. With the dialog mounted, the link's click is CLAIMED: the
 * host calls `preventDefault()` on the cancelable event it receives, the
 * opener reads that back as "handled", and only then stops the navigation.
 * No host, no claim, the link navigates. That is progressive enhancement in
 * one boolean, with no context provider wrapped around a server layout.
 */

export const LOGIN_DIALOG_EVENT = 'ke:login-dialog'

export interface LoginDialogDetail {
  /**
   * Where to land after signing in: a same-site path with its query, the
   * same `next` the /login page takes. Absent means "where the shopper is
   * now", which the host reads off `location` at open time.
   */
  next?: string
}

/**
 * Asks the mounted dialog, if any, to open. Returns true when a host claimed
 * the request, in which case the caller must NOT navigate.
 */
export function openLoginDialog(detail: LoginDialogDetail = {}): boolean {
  if (typeof window === 'undefined') return false
  const event = new CustomEvent<LoginDialogDetail>(LOGIN_DIALOG_EVENT, {
    detail,
    cancelable: true,
  })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/**
 * The `next` a login link carries, or null when it has none. Reads the query
 * of a `/login?next=...` href so a link that already says where to go back to
 * keeps saying it through the dialog.
 */
export function nextFromLoginHref(href: string): string | null {
  const q = href.indexOf('?')
  if (q === -1) return null
  const next = new URLSearchParams(href.slice(q + 1)).get('next')
  return next && next.length > 0 ? next : null
}

/**
 * The page the shopper is on, as a `next`: path plus query, never the
 * fragment (browsers do not send it, and the server's redirect would drop it).
 */
export function currentLocationNext(loc: { pathname: string; search: string }): string {
  return `${loc.pathname}${loc.search}`
}

/**
 * A click that must stay a navigation: a modifier key asks for a new tab or
 * window, a non-primary button is a middle- or right-click, and a default
 * already prevented belongs to someone else.
 */
export function isPlainActivation(event: {
  button?: number
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  defaultPrevented?: boolean
}): boolean {
  if (event.defaultPrevented) return false
  if (typeof event.button === 'number' && event.button !== 0) return false
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
}
