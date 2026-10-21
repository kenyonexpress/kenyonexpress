/**
 * The legal identity behind the storefront.
 *
 * ONE PLACE FOR THE REGISTRATION NUMBER. The number is printed wherever a
 * customer or a supplier is told who they are contracting with: the order
 * confirmation mail, the tax document's remarks, the site footer, the three
 * binding legal pages and the supplier click-wrap. Six copies of a nine-digit
 * string would drift the way four phone numbers once did (`lib/whatsapp`), and
 * a tax document carrying a different number from the terms it was issued
 * under is a dispute waiting to be opened. Every surface imports from here.
 *
 * The value is an Israeli dealer number (מספר עוסק), which for a sole trader is
 * the owner's ID number and therefore passes the ID checksum. The test pins
 * that, so a typo in a future edit fails before it is printed on an invoice.
 */
export const BUSINESS_REGISTRATION_NUMBER = '033798513'

/** The trading name the number belongs to, as it appears in the legal pages. */
export const LEGAL_ENTITY_NAME = 'קניון אקספרס'

/** The label a reader expects in front of the number. */
export const BUSINESS_REGISTRATION_LABEL = 'מספר עוסק'

/**
 * `מספר עוסק 033798513`, the label and the number, for a footer or a remark.
 */
export function businessRegistrationLine(): string {
  return `${BUSINESS_REGISTRATION_LABEL} ${BUSINESS_REGISTRATION_NUMBER}`
}

/**
 * `קניון אקספרס, מספר עוסק 033798513`, the full identification line, for
 * anywhere the trading name is not already printed next to it.
 */
export function legalEntityLine(): string {
  return `${LEGAL_ENTITY_NAME}, ${businessRegistrationLine()}`
}

/**
 * The Israeli ID / dealer-number check digit (Luhn-style, weights 1,2,1,2...).
 * Exported so the test can prove the constant is a real number and not a
 * transposition.
 */
export function isValidIsraeliRegistrationNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 9; i += 1) {
    let digit = Number(value[i]) * ((i % 2) + 1)
    if (digit > 9) digit -= 9
    sum += digit
  }
  return sum % 10 === 0
}
