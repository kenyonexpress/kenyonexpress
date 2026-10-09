import { describe, expect, it } from 'vitest'
import { measureSms, smsEncodingOf, smsSegments } from './segments'

/**
 * THE ARITHMETIC THAT DECIDES WHAT AN SMS PROGRAMME COSTS.
 *
 * Getting this wrong does not produce a bug anybody can see. It produces an
 * invoice two to three times the estimate, months later, with no way to tell
 * which message was responsible.
 */

describe('which alphabet a message forces', () => {
  it('keeps a pure-Latin message in GSM-7', () => {
    expect(smsEncodingOf('Your code is 123456')).toBe('GSM-7')
  })

  it('switches the WHOLE message to UCS-2 for one Hebrew letter', () => {
    // Not "the Hebrew part". The encoding is a property of the message.
    expect(smsEncodingOf('Your code is 123456 א')).toBe('UCS-2')
  })

  it('switches for an emoji and for a curly apostrophe', () => {
    // The curly apostrophe is the one that catches people: it arrives by
    // copy-paste from a document and looks identical to the straight one.
    expect(smsEncodingOf('Your order shipped 🚚')).toBe('UCS-2')
    expect(smsEncodingOf('Your order’s on its way')).toBe('UCS-2')
    expect(smsEncodingOf("Your order's on its way")).toBe('GSM-7')
  })

  it('stays GSM-7 for the extension characters, which are still in the alphabet', () => {
    expect(smsEncodingOf('50% off [today] {only}')).toBe('GSM-7')
  })
})

describe('how many segments that is', () => {
  it('gives an empty message one segment, not zero', () => {
    // Twilio bills a minimum of one. Zero would understate every total.
    expect(smsSegments('')).toBe(1)
  })

  it('fits 160 GSM-7 characters in one and 161 in two', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1)
    expect(smsSegments('a'.repeat(161))).toBe(2)
  })

  it('counts an extension character as two septets', () => {
    // 159 plain + one `€` is 161 septets, which is two segments even though it
    // is 160 characters. This is the off-by-one that a `.length` check misses.
    expect(smsSegments(`${'a'.repeat(159)}€`)).toBe(2)
  })

  it('fits only 70 Hebrew characters in one segment', () => {
    // The number that matters for everything this system sends.
    expect(smsSegments('א'.repeat(70))).toBe(1)
    expect(smsSegments('א'.repeat(71))).toBe(2)
  })

  it('drops to 67 per part once a Hebrew message is multipart', () => {
    // The 6-byte User Data Header costs three UCS-2 characters in EVERY part,
    // so 134 is not two segments.
    expect(smsSegments('א'.repeat(134))).toBe(2)
    expect(smsSegments('א'.repeat(135))).toBe(3)
  })

  it('makes a 140-character Hebrew message THREE segments, not one', () => {
    // The headline number. 140 characters reads as "well under 160" and is
    // billed as three messages.
    expect(smsSegments('א'.repeat(140))).toBe(3)
  })

  it('counts an astral emoji as the two code units it occupies on the wire', () => {
    const size = measureSms('🚚')
    expect(size.encoding).toBe('UCS-2')
    expect(size.units).toBe(2)
  })
})
