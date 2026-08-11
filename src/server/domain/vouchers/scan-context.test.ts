import { describe, expect, it } from 'vitest'
import { readScanContext } from './scan-context'

/**
 * The audit row is what a voucher dispute is settled with, so the two fields
 * 085 added have to survive the trip from the request. These are the parsing
 * rules only; that the values reach the database is asserted against real
 * Postgres in tests/sql/voucher_redemption_lifecycle.sql section 5.
 */

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('readScanContext', () => {
  it('takes the leftmost entry of x-forwarded-for', () => {
    const context = readScanContext(
      headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' }),
    )
    expect(context.ip).toBe('203.0.113.7')
  })

  it('trims the whitespace proxies add after each comma', () => {
    expect(readScanContext(headers({ 'x-forwarded-for': '  203.0.113.7  ,10.0.0.1' })).ip).toBe(
      '203.0.113.7',
    )
  })

  it('falls back to x-real-ip when there is no forwarded-for', () => {
    expect(readScanContext(headers({ 'x-real-ip': '198.51.100.4' })).ip).toBe('198.51.100.4')
  })

  it('prefers x-forwarded-for over x-real-ip when both are present', () => {
    const context = readScanContext(
      headers({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '198.51.100.4' }),
    )
    expect(context.ip).toBe('203.0.113.7')
  })

  it('reports null rather than a placeholder when no address is present', () => {
    // 'unknown' would be stored as an address and read later as one. NULL is
    // the only honest answer, and public.voucher_scan_ip stores it as NULL too.
    expect(readScanContext(headers({})).ip).toBeNull()
  })

  it('treats an empty or whitespace-only header as absent', () => {
    expect(readScanContext(headers({ 'x-forwarded-for': '   ' })).ip).toBeNull()
    expect(readScanContext(headers({ 'x-forwarded-for': '' })).ip).toBeNull()
  })

  it('passes a malformed address through for the database to reject', () => {
    // Deliberate: parsing is not this function's job, and silently dropping a
    // value an attacker chose would hide what they sent. voucher_scan_ip()
    // turns anything unparseable into NULL without failing the redemption.
    expect(readScanContext(headers({ 'x-forwarded-for': 'not-an-ip' })).ip).toBe('not-an-ip')
  })

  it('caps the user agent so one client cannot dictate the row size', () => {
    const context = readScanContext(headers({ 'user-agent': 'x'.repeat(5000) }))
    expect(context.userAgent).toHaveLength(512)
  })

  it('reports a missing user agent as null', () => {
    expect(readScanContext(headers({})).userAgent).toBeNull()
  })
})
