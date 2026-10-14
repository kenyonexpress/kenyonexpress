/**
 * The payment method selector's options, as pure data (UX17).
 *
 * WHAT CAN ACTUALLY BE CHARGED. Two things, and this list is exactly those
 * two: a saved Cardcom token (`token_id` = the token row's id, charged
 * server-side by `beginCheckout`) and a fresh card on Cardcom's hosted page
 * (`token_id` = 'new', the value `submitCheckout` reads as "open the hosted
 * page"). Nothing here offers Bit, PayPal or a wallet button, because no code
 * in `src/lib/payments` can take money through one, and an option the server
 * cannot honour is a promise the shopper finds broken after typing an
 * address. The cashback wallet and a gift card are not methods either: they
 * reduce what the card is charged and sit under the selector as such.
 *
 * The brand names are Hebrew because every string a shopper reads here is
 * (scripts/copy-gate.mjs), and `card_brand` arrives from Cardcom in whatever
 * casing its webhook used, so the mapping is case-insensitive and falls back
 * to the plain word for a card.
 */

export type SavedCardLike = {
  id: string
  last4: string | null
  brand: string | null
  isDefault: boolean
}

export type PaymentMethodKind = 'saved-card' | 'hosted-card'

export type PaymentMethodOption = {
  /** The radio value posted as `token_id`. */
  id: string
  kind: PaymentMethodKind
  /** The option's name, one line. */
  label: string
  /** What picking it means, one short sentence. */
  detail: string
  /** The shopper's default card; at most one option carries it. */
  isDefault: boolean
}

/** The radio value `submitCheckout` reads as "charge a fresh card on the hosted page". */
export const NEW_CARD_METHOD_ID = 'new'

const BRAND_LABELS: readonly { match: RegExp; label: string }[] = [
  { match: /^visa/i, label: 'ויזה' },
  { match: /^master/i, label: 'מאסטרקארד' },
  { match: /^(amex|american)/i, label: 'אמריקן אקספרס' },
  { match: /^isra/i, label: 'ישראכרט' },
  { match: /^diners/i, label: 'דיינרס' },
  { match: /^discover/i, label: 'דיסקבר' },
]

/** 'visa' -> 'ויזה'; an unknown or missing brand is just 'כרטיס'. */
export function cardBrandLabel(brand: string | null | undefined): string {
  const value = (brand ?? '').trim()
  if (!value) return 'כרטיס'
  return BRAND_LABELS.find((row) => row.match.test(value))?.label ?? 'כרטיס'
}

/** "ויזה המסתיים ב-4242": the line a saved card is named by everywhere on the page. */
export function describeSavedCard(card: Pick<SavedCardLike, 'last4' | 'brand'>): string {
  return `${cardBrandLabel(card.brand)} המסתיים ב-${card.last4 ?? '****'}`
}

/**
 * The options in the order they are offered: the saved cards as the page
 * handed them (default first, newest next), then the hosted page. With no
 * saved card the hosted page is the only option and is named for what it is;
 * next to saved cards it is "another card".
 */
export function paymentMethodOptions(savedCards: readonly SavedCardLike[]): PaymentMethodOption[] {
  const saved: PaymentMethodOption[] = savedCards.map((card) => ({
    id: card.id,
    kind: 'saved-card',
    label: describeSavedCard(card),
    detail: 'חיוב מיידי של הכרטיס השמור, בלי להקליד שוב',
    isDefault: card.isDefault,
  }))
  const hosted: PaymentMethodOption = {
    id: NEW_CARD_METHOD_ID,
    kind: 'hosted-card',
    label: savedCards.length > 0 ? 'כרטיס אחר' : 'כרטיס אשראי',
    detail: 'פרטי הכרטיס מוקלדים בדף התשלום המאובטח של Cardcom',
    isDefault: false,
  }
  return [...saved, hosted]
}

/**
 * The option that is ticked when the page opens: the default card, else the
 * first saved one, else the hosted page. The same rule the form has always
 * applied, now in one place both the form and its tests read.
 */
export function defaultPaymentChoice(savedCards: readonly SavedCardLike[]): string {
  return savedCards.find((card) => card.isDefault)?.id ?? savedCards[0]?.id ?? NEW_CARD_METHOD_ID
}

/** True when the choice is a saved token rather than the hosted page. */
export function isSavedCardChoice(choice: string | null | undefined): boolean {
  return Boolean(choice) && choice !== NEW_CARD_METHOD_ID
}
