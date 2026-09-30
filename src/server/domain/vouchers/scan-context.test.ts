import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The audit row is what a voucher dispute is settled with, so the two fields
 * 085 added have to survive the trip from the request. These are the parsing
 * rules only; that the values reach the database is asserted against real
 * Postgres in tests/sql/voucher_redemption_lifecycle.sql section 5.
 */

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
vi.mock('@/lib/observability/log', () => ({ log }))

const scenario = {
  rpcRejection: null as Error | null,
}

const adminRpc = vi.fn(() => {
  if (scenario.rpcRejection) return Promise.reject(scenario.rpcRejection)
  return Promise.resolve({ data: null, error: null })
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: adminRpc }),
}))

const { readScanContext, recordRefusedScan } = await import('./scan-context')

beforeEach(() => {
  vi.clearAllMocks()
  scenario.rpcRejection = null
})

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

describe('recordRefusedScan', () => {
  const context = { ip: '203.0.113.7', userAgent: 'test-agent' }

  it('logs the refusal through the caller-scoped client when one is passed', async () => {
    const callerRpc = vi.fn(() => Promise.resolve({ data: null, error: null }))
    const callerClient = { rpc: callerRpc } as unknown as Parameters<
      typeof recordRefusedScan
    >[0]['client']

    await recordRefusedScan({
      codeEntered: 'ABC123',
      outcome: 'not_found',
      scanMethod: 'manual',
      context,
      client: callerClient,
    })

    expect(callerRpc).toHaveBeenCalledWith('log_voucher_scan', {
      p_code_entered: 'ABC123',
      p_scan_method: 'manual',
      p_outcome: 'not_found',
      p_ip: context.ip,
      p_user_agent: context.userAgent,
    })
    expect(adminRpc).not.toHaveBeenCalled()
  })

  it('falls back to the admin client when no caller-scoped client is given', async () => {
    await recordRefusedScan({
      codeEntered: 'ABC123',
      outcome: 'invalid_signature',
      scanMethod: 'camera',
      context,
    })

    expect(adminRpc).toHaveBeenCalledWith('log_voucher_scan', {
      p_code_entered: 'ABC123',
      p_scan_method: 'camera',
      p_outcome: 'invalid_signature',
      p_ip: context.ip,
      p_user_agent: context.userAgent,
    })
  })

  it('truncates a code entered longer than 32 characters before logging it', async () => {
    const longCode = 'x'.repeat(50)

    await recordRefusedScan({
      codeEntered: longCode,
      outcome: 'invalid_request',
      scanMethod: 'manual',
      context,
    })

    expect(adminRpc).toHaveBeenCalledWith(
      'log_voucher_scan',
      expect.objectContaining({ p_code_entered: 'x'.repeat(32) }),
    )
  })

  it('swallows an RPC rejection rather than throwing, and logs it', async () => {
    scenario.rpcRejection = new Error('db unreachable')

    await expect(
      recordRefusedScan({
        codeEntered: 'ABC123',
        outcome: 'not_found',
        scanMethod: 'manual',
        context,
      }),
    ).resolves.toBeUndefined()

    expect(log.error).toHaveBeenCalledWith(
      'voucher.scan_log_failed',
      expect.objectContaining({ err: expect.anything() }),
    )
  })
})
