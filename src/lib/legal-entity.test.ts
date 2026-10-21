import { describe, expect, it } from 'vitest'
import {
  BUSINESS_REGISTRATION_NUMBER,
  LEGAL_ENTITY_NAME,
  businessRegistrationLine,
  isValidIsraeliRegistrationNumber,
  legalEntityLine,
} from './legal-entity'

describe('legal entity', () => {
  it('pins the registration number', () => {
    expect(BUSINESS_REGISTRATION_NUMBER).toBe('033798513')
  })

  it('is a nine-digit number that passes the Israeli check digit', () => {
    // A transposed or mistyped digit fails here before it reaches an invoice.
    expect(isValidIsraeliRegistrationNumber(BUSINESS_REGISTRATION_NUMBER)).toBe(true)
    expect(isValidIsraeliRegistrationNumber('033798531')).toBe(false)
    expect(isValidIsraeliRegistrationNumber('33798513')).toBe(false)
    expect(isValidIsraeliRegistrationNumber('03379851a')).toBe(false)
  })

  it('prints the label and the number together', () => {
    expect(businessRegistrationLine()).toBe('מספר עוסק 033798513')
  })

  it('prints the trading name in front of the number', () => {
    expect(legalEntityLine()).toBe(`${LEGAL_ENTITY_NAME}, מספר עוסק 033798513`)
    expect(legalEntityLine()).toContain('קניון אקספרס')
  })
})
