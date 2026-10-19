import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminRpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (...a: unknown[]) => adminRpc(...a) }),
}))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { readScanContext, recordRefusedScan } from './scan-context'

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

/**
 * `recordRefusedScan` sat at 44% covered, and it is the half of the audit
 * trail that runs when the scan was refused BEFORE redeem_voucher could see
 * it: a QR whose HMAC did not verify, a malformed code, a token naming another
 * supplier's voucher. Those are precisely the attempts a dispute is about, and
 * the pre-085 function dropped the anonymous ones on the floor.
 */
describe('recordRefusedScan', () => {
  beforeEach(() => {
    adminRpc.mockReset().mockResolvedValue({ data: null, error: null })
    logError.mockReset()
  })

  const context = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0' }

  it('logs the refusal through log_voucher_scan with the outcome and the context', async () => {
    await recordRefusedScan({
      codeEntered: 'PRBE00000A',
      outcome: 'invalid_signature',
      scanMethod: 'camera',
      context,
    })

    expect(adminRpc).toHaveBeenCalledWith('log_voucher_scan', {
      p_code_entered: 'PRBE00000A',
      p_scan_method: 'camera',
      p_outcome: 'invalid_signature',
      p_ip: '203.0.113.7',
      p_user_agent: 'Mozilla/5.0',
    })
  })

  it('truncates the entered code to 32 characters', async () => {
    // The column is bounded and the value is attacker-supplied: a scanner can
    // send whatever it likes in the manual-entry field.
    await recordRefusedScan({
      codeEntered: 'X'.repeat(200),
      outcome: 'invalid_request',
      scanMethod: 'manual',
      context,
    })
    const args = adminRpc.mock.calls[0]?.[1] as { p_code_entered: string }
    expect(args.p_code_entered).toHaveLength(32)
  })

  it('uses the caller session client when one is passed, not the admin client', async () => {
    // The distinction the module header turns on: with a session the row is
    // attributed to the member through auth.uid(); without one it is the
    // anonymous forged-token case, which is the attempt most worth having.
    const scopedRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    await recordRefusedScan({
      codeEntered: 'PRBE00000A',
      outcome: 'not_found',
      scanMethod: 'manual',
      context,
      client: { rpc: scopedRpc } as never,
    })

    expect(scopedRpc).toHaveBeenCalledTimes(1)
    expect(adminRpc).not.toHaveBeenCalled()
  })

  it('never throws when the audit write fails, and says so in the log', async () => {
    // THE CONTRACT THAT MATTERS. This runs on a path that is already refusing
    // the request. An audit write that threw would turn a clean refusal into a
    // 500 for a cashier standing at a counter, and the caller has nothing
    // useful to do about it either way.
    adminRpc.mockRejectedValue(new Error('connection reset'))

    await expect(
      recordRefusedScan({
        codeEntered: 'PRBE00000A',
        outcome: 'invalid_signature',
        scanMethod: 'camera',
        context,
      }),
    ).resolves.toBeUndefined()

    expect(logError).toHaveBeenCalledWith('voucher.scan_log_failed', expect.anything())
  })

  it('records a null address rather than inventing one', async () => {
    await recordRefusedScan({
      codeEntered: 'PRBE00000A',
      outcome: 'not_found',
      scanMethod: 'manual',
      context: { ip: null, userAgent: null },
    })
    expect(adminRpc.mock.calls[0]?.[1]).toMatchObject({ p_ip: null, p_user_agent: null })
  })
})
