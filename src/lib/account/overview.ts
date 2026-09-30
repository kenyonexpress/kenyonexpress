import {
  CHANNELS,
  OPTIONAL_KINDS,
  type PreferenceRow,
  mayNotify,
} from '@/lib/notifications/preferences'
import type { AccountAddress, AccountPaymentToken } from '@/server/queries/account'

/**
 * The pure half of the /account overview and of the two managers it summarises.
 *
 * Every tile on the dashboard used to compute its own sentence inline, and the
 * two that were missing (addresses, saved cards) would have grown a third copy
 * of the card-expiry rule already living in TokenManager. The rule moves here,
 * once, and both the tile and the manager read it.
 *
 * NOTHING HERE SEES A TOKEN. `AccountPaymentToken` carries last4, brand and
 * expiry only; the query that builds it never selects `cardcom_token`
 * (pinned by src/lib/account/saved-cards.test.ts). The label this file builds
 * is therefore masked by construction, and `cardLabel` still slices the last
 * four characters so a wider value could never widen the label.
 */

/** "הרצל 12, תל אביב": street and number, then city. Blanks are dropped. */
export function addressLine(address: Pick<AccountAddress, 'street' | 'streetNumber' | 'city'>) {
  const street = [address.street, address.streetNumber].filter(Boolean).join(' ')
  return [street, address.city].filter(Boolean).join(', ')
}

export interface AddressSummary {
  count: number
  /** The default address, else the first one, else null. */
  primary: AccountAddress | null
}

export function summarizeAddresses(addresses: readonly AccountAddress[]): AddressSummary {
  const primary = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null
  return { count: addresses.length, primary }
}

/** "Visa ···· 1234". The brand falls back to a generic Hebrew label. */
export function cardLabel(card: Pick<AccountPaymentToken, 'cardBrand' | 'last4'>): string {
  const last4 = card.last4 ? card.last4.slice(-4) : '****'
  return `${card.cardBrand ?? 'כרטיס אשראי'} ···· ${last4}`
}

/** "תוקף 03/27", or an empty string when the card carries no expiry. */
export function expiryLabel(month: number | null, year: number | null): string {
  if (!month || !year) return ''
  return `תוקף ${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

/**
 * A card is valid through the last day of its expiry month, so it expires the
 * moment `now` enters the month after. Unknown expiry counts as live: the
 * charge attempt is the authority, not a missing column.
 */
export function isCardExpired(month: number | null, year: number | null, now = new Date()) {
  if (!month || !year) return false
  const firstMonthAfter = new Date(year, month, 1)
  return firstMonthAfter <= new Date(now.getFullYear(), now.getMonth(), 1)
}

export interface PaymentMethodSummary {
  count: number
  /** Live (unexpired) cards. */
  live: number
  /** The default card, else the newest, else null. */
  primary: AccountPaymentToken | null
  primaryExpired: boolean
}

export function summarizePaymentMethods(
  tokens: readonly AccountPaymentToken[],
  now = new Date(),
): PaymentMethodSummary {
  const live = tokens.filter((t) => !isCardExpired(t.expiryMonth, t.expiryYear, now)).length
  const primary = tokens.find((t) => t.isDefault) ?? tokens[0] ?? null
  return {
    count: tokens.length,
    live,
    primary,
    primaryExpired: primary ? isCardExpired(primary.expiryMonth, primary.expiryYear, now) : false,
  }
}

export interface PreferenceSummary {
  /** Every switch the settings page offers: optional kinds times channels. */
  total: number
  /** Switches the customer has turned off. */
  off: number
}

/**
 * Counted through `mayNotify`, the same resolver the senders consult, so the
 * tile cannot disagree with what actually goes out. A stray row for a required
 * kind is not a switch and is not counted.
 */
export function summarizePreferences(rows: readonly PreferenceRow[]): PreferenceSummary {
  let off = 0
  for (const kind of OPTIONAL_KINDS) {
    for (const channel of CHANNELS) {
      if (!mayNotify(kind, channel, rows)) off += 1
    }
  }
  return { total: OPTIONAL_KINDS.length * CHANNELS.length, off }
}

export function preferenceSummaryLine(summary: PreferenceSummary): string {
  if (summary.off === 0) return 'כל ההתראות פועלות'
  if (summary.off === 1) return 'התראה אחת כבויה'
  return `${summary.off} התראות כבויות מתוך ${summary.total}`
}
