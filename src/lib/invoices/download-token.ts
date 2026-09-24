import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A signed, expiring link to one order's tax document.
 *
 * WHY SIGNED. The thank-you page is reachable by a guest (there is no session to
 * check), and the stored document URL points at the provider, which anyone
 * holding the string can open. The link is minted server-side only when the page
 * is rendered for someone who already holds the order id, expires, and is
 * verified again on every download. Nothing here ever sends the link anywhere:
 * it is rendered into the page and that is the whole of its distribution. The
 * document is never emailed or messaged automatically.
 *
 * The MAC covers a fixed domain prefix, the order id and the expiry, so a
 * signature minted for one order cannot open another and the voucher-QR key is
 * not usable to forge this or the reverse.
 */

const DOMAIN = 'invoice-dl-v1'
/** 30 days: long enough to come back to the confirmation tab, short enough to age out. */
export const INVOICE_LINK_TTL_SECONDS = 30 * 24 * 60 * 60

export class InvoiceLinkSecretMissingError extends Error {
  constructor() {
    super('VOUCHER_QR_SECRET is not set; refusing to sign or verify invoice download links')
    this.name = 'InvoiceLinkSecretMissingError'
  }
}

function secretFrom(env: NodeJS.ProcessEnv): string {
  const secret = env.VOUCHER_QR_SECRET
  if (!secret || secret.length < 16) throw new InvoiceLinkSecretMissingError()
  return secret
}

function mac(orderId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${DOMAIN}.${orderId}.${exp}`).digest('base64url')
}

export interface InvoiceLinkParts {
  exp: number
  sig: string
}

export function signInvoiceLink(
  orderId: string,
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): InvoiceLinkParts {
  const exp = Math.floor(nowMs / 1000) + INVOICE_LINK_TTL_SECONDS
  return { exp, sig: mac(orderId, exp, secretFrom(env)) }
}

export type InvoiceLinkVerdict = 'ok' | 'expired' | 'invalid'

export function verifyInvoiceLink(
  orderId: string,
  exp: string | null | undefined,
  sig: string | null | undefined,
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): InvoiceLinkVerdict {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp)) return 'invalid'
  const expNum = Number(exp)
  const expected = Buffer.from(mac(orderId, expNum, secretFrom(env)))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid'
  return expNum * 1000 < nowMs ? 'expired' : 'ok'
}

/** The relative URL the page renders. */
export function invoiceDownloadPath(orderId: string, parts: InvoiceLinkParts): string {
  return `/api/invoices/${encodeURIComponent(orderId)}/download?exp=${parts.exp}&sig=${parts.sig}`
}
