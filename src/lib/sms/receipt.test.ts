import { describe, expect, it } from 'vitest'
import { priceToMicro, toCurrencyCode, toErrorCode, toSmsStatus } from './receipt'

/**
 * The two conversions in the delivery receipt that are easy to get wrong, and
 * expensive when they are: a status that the CHECK constraint refuses loses the
 * whole receipt including the price, and a price parsed through a float is
 * wrong in a way that only shows up in a total.
 */

describe('Twilio’s status vocabulary against the one the table accepts', () => {
  it.each(['accepted', 'scheduled', 'queued', 'sending'])('collapses %s to queued', (raw) => {
    expect(toSmsStatus(raw)).toBe('queued')
  })

  it('keeps sent and delivered apart', () => {
    // `sent` means it reached the CARRIER. It is not delivery, and treating it
    // as delivery is how a log comes to say every message arrived.
    expect(toSmsStatus('sent')).toBe('sent')
    expect(toSmsStatus('delivered')).toBe('delivered')
  })

  it.each(['failed', 'canceled', 'cancelled'])('reads %s as failed', (raw) => {
    expect(toSmsStatus(raw)).toBe('failed')
  })

  it('keeps undelivered distinct from failed', () => {
    // `undelivered` is the carrier rejecting it, which is usually the number.
    // `failed` is Twilio. They are triaged differently.
    expect(toSmsStatus('undelivered')).toBe('undelivered')
  })

  it('returns null for a status the constraint would refuse', () => {
    // Including `read`, which is a WhatsApp status that cannot occur on an SMS.
    // Writing it would be a 23514 that loses the price too.
    expect(toSmsStatus('read')).toBeNull()
    expect(toSmsStatus('something_new')).toBeNull()
    expect(toSmsStatus(null)).toBeNull()
    expect(toSmsStatus('')).toBeNull()
  })

  it('is case-insensitive, because the field is not contractually lowercase', () => {
    expect(toSmsStatus('DELIVERED')).toBe('delivered')
  })
})

describe('the price string', () => {
  it('flips the sign, because a negative in a cost column is a credit', () => {
    // Twilio's minus means "debited from your balance". Stored as-is it makes
    // every future SUM() read backwards.
    expect(priceToMicro('-0.00750')).toBe(7500)
    expect(priceToMicro('0.00750')).toBe(7500)
  })

  it('holds five decimal places exactly, which agorot cannot', () => {
    // $0.0075 rounds to 1 agora: a 30% error on the unit price, multiplied by
    // every message ever sent.
    expect(priceToMicro('-0.0075')).toBe(7500)
    expect(priceToMicro('-0.00001')).toBe(10)
    expect(priceToMicro('-0.000001')).toBe(1)
  })

  it('does not go through a float', () => {
    // `0.00750 * 1e6` is 7499.999999999999 in binary floating point. Parsing by
    // digits is the only way this is exact for every input rather than for the
    // ones somebody happened to test.
    expect(priceToMicro('-0.07')).toBe(70_000)
    expect(priceToMicro('-1.1')).toBe(1_100_000)
    expect(priceToMicro('-2.675')).toBe(2_675_000)
  })

  it('handles whole numbers and a bare fraction', () => {
    expect(priceToMicro('-3')).toBe(3_000_000)
    expect(priceToMicro('-.5')).toBe(500_000)
  })

  it('is null before the receipt arrives, and never zero', () => {
    // The POST response carries price: null. A zero would claim it was free.
    expect(priceToMicro(null)).toBeNull()
    expect(priceToMicro(undefined)).toBeNull()
    expect(priceToMicro('')).toBeNull()
    expect(priceToMicro('   ')).toBeNull()
  })

  it('refuses more precision than a millionth rather than truncating it', () => {
    // Silently dropping a digit from a number somebody will later add up is
    // the failure mode worth refusing over.
    expect(priceToMicro('-0.0000001')).toBeNull()
  })

  it('refuses something that is not a number', () => {
    expect(priceToMicro('free')).toBeNull()
    expect(priceToMicro('1.2.3')).toBeNull()
    expect(priceToMicro('1e-3')).toBeNull()
  })
})

describe('the currency and the error code', () => {
  it('normalises a three-letter code and refuses anything else', () => {
    // The column's CHECK is `^[A-Z]{3}$`; a value that fails it takes the whole
    // receipt down with a 23514.
    expect(toCurrencyCode('usd')).toBe('USD')
    expect(toCurrencyCode(' ILS ')).toBe('ILS')
    expect(toCurrencyCode('US')).toBeNull()
    expect(toCurrencyCode('DOLLAR')).toBeNull()
    expect(toCurrencyCode(null)).toBeNull()
  })

  it('reads an error code as the integer the column holds', () => {
    expect(toErrorCode('30003')).toBe(30003)
    expect(toErrorCode('21610')).toBe(21610)
  })

  it('is null for no error, rather than zero', () => {
    expect(toErrorCode(null)).toBeNull()
    expect(toErrorCode('')).toBeNull()
    expect(toErrorCode('0')).toBeNull()
    expect(toErrorCode('not-a-code')).toBeNull()
  })
})
