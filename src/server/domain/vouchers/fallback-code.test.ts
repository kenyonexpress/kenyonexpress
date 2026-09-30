import { luhnCheckDigit } from '@/lib/coupons/unit-codes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type FallbackResolveClient,
  __resetVoucherFallbackColumnCache,
  formatVoucherFallbackCode,
  generateVoucherFallbackCode,
  isValidVoucherFallbackCode,
  normalizeVoucherFallbackCode,
  resolveEnteredVoucherCode,
  resolveVoucherFallbackColumn,
} from './fallback-code'

/** A valid code: 7 digits and their Luhn check digit. */
function valid(body = '1234567'): string {
  return body + String(luhnCheckDigit(body))
}

/** In-memory `vouchers` keyed by fallback_code, with a switch for the column being absent. */
function fakeClient(
  rows: Record<string, string>,
  options: { columnMissing?: boolean; throwOnRead?: boolean } = {},
) {
  const reads: Array<{ column: string; value: string }> = []
  const client: FallbackResolveClient = {
    from() {
      return {
        select() {
          return {
            eq(column: string, value: string) {
              reads.push({ column, value })
              return {
                async maybeSingle() {
                  if (options.throwOnRead) throw new Error('boom')
                  if (options.columnMissing) {
                    return { data: null, error: { code: '42703', message: 'undefined column' } }
                  }
                  const code = rows[value]
                  return { data: code ? { code } : null, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
  return { client, reads }
}

describe('the fallback code', () => {
  it('is 8 digits with a Luhn check digit, the printed-coupon shape', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateVoucherFallbackCode()
      expect(code).toMatch(/^[0-9]{8}$/)
      expect(isValidVoucherFallbackCode(code)).toBe(true)
    }
  })

  it('refuses a mistyped digit locally', () => {
    const code = valid()
    const last = Number(code[7])
    const wrong = code.slice(0, 7) + String((last + 1) % 10)
    expect(isValidVoucherFallbackCode(wrong)).toBe(false)
  })

  it('normalises separators and formats 4-4 for reading aloud', () => {
    expect(normalizeVoucherFallbackCode('1234-5678')).toBe('12345678')
    expect(normalizeVoucherFallbackCode(' 1234 5678 ')).toBe('12345678')
    expect(formatVoucherFallbackCode('12345678')).toBe('1234-5678')
    expect(formatVoucherFallbackCode('1234567')).toBe('1234567')
  })
})

describe('resolveEnteredVoucherCode', () => {
  it('passes a ten-symbol code through untouched, without a read', async () => {
    const { client, reads } = fakeClient({})
    const resolved = await resolveEnteredVoucherCode('abcde-fghjk', () => client)
    expect(resolved).toEqual({ code: 'ABCDEFGHJK', via: 'code', entered: 'ABCDEFGHJK' })
    expect(reads).toEqual([])
  })

  it('treats ten digits as a code, not a fallback: length decides', async () => {
    const { client, reads } = fakeClient({})
    const resolved = await resolveEnteredVoucherCode('1234567890', () => client)
    expect(resolved.via).toBe('code')
    expect(reads).toEqual([])
  })

  it('resolves a valid 8-digit entry to the voucher code by fallback_code', async () => {
    const digits = valid()
    const { client, reads } = fakeClient({ [digits]: 'ABCDEFGHJK' })
    const resolved = await resolveEnteredVoucherCode(
      `${digits.slice(0, 4)}-${digits.slice(4)}`,
      () => client,
    )
    expect(resolved).toEqual({ code: 'ABCDEFGHJK', via: 'fallback', entered: digits })
    expect(reads).toEqual([{ column: 'fallback_code', value: digits }])
  })

  it('refuses an 8-digit entry with a bad check digit BEFORE the database', async () => {
    const code = valid()
    const wrong = code.slice(0, 7) + String((Number(code[7]) + 1) % 10)
    const { client, reads } = fakeClient({ [wrong]: 'ABCDEFGHJK' })
    const resolved = await resolveEnteredVoucherCode(wrong, () => client)
    expect(resolved).toEqual({ code: null, via: 'unknown_fallback', entered: wrong })
    expect(reads).toEqual([])
  })

  it('answers unknown for a fallback nobody holds, under the digits typed', async () => {
    const digits = valid('7654321')
    const { client } = fakeClient({})
    const resolved = await resolveEnteredVoucherCode(digits, () => client)
    expect(resolved).toEqual({ code: null, via: 'unknown_fallback', entered: digits })
  })

  it('answers unknown, never throws, when the column does not exist yet (42703)', async () => {
    const digits = valid()
    const { client } = fakeClient({ [digits]: 'ABCDEFGHJK' }, { columnMissing: true })
    const resolved = await resolveEnteredVoucherCode(digits, () => client)
    expect(resolved.code).toBeNull()
    expect(resolved.via).toBe('unknown_fallback')
  })

  it('answers unknown, never throws, when the read itself throws', async () => {
    const digits = valid()
    const { client } = fakeClient({}, { throwOnRead: true })
    await expect(resolveEnteredVoucherCode(digits, () => client)).resolves.toMatchObject({
      code: null,
    })
  })

  it('refuses anything that is neither shape, without a read', async () => {
    const { client, reads } = fakeClient({})
    for (const entry of ['', 'ABC', '1234567', '123456789', 'ABCDEFGHIJ']) {
      const resolved = await resolveEnteredVoucherCode(entry, () => client)
      expect(resolved.code).toBeNull()
      expect(resolved.via).toBe('invalid')
    }
    expect(reads).toEqual([])
  })

  it('never hands back a resolved code that is not itself a valid voucher code', async () => {
    const digits = valid()
    const { client } = fakeClient({ [digits]: 'not-a-code' })
    const resolved = await resolveEnteredVoucherCode(digits, () => client)
    expect(resolved.code).toBeNull()
  })
})

describe('resolveVoucherFallbackColumn', () => {
  afterEach(() => __resetVoucherFallbackColumnCache())

  it('answers present when the probe plans, and caches it', async () => {
    const probe = vi.fn().mockResolvedValue({ error: null })
    expect(await resolveVoucherFallbackColumn(probe)).toBe(true)
    expect(await resolveVoucherFallbackColumn(probe)).toBe(true)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith('fallback_code')
  })

  it('answers absent on 42703, and caches it', async () => {
    const probe = vi.fn().mockResolvedValue({ error: { code: '42703' } })
    expect(await resolveVoucherFallbackColumn(probe)).toBe(false)
    expect(await resolveVoucherFallbackColumn(probe)).toBe(false)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('answers absent on any other failure WITHOUT caching, so an outage cannot pin the process', async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: '57P01', message: 'terminating' } })
      .mockResolvedValueOnce({ error: null })
    expect(await resolveVoucherFallbackColumn(probe)).toBe(false)
    expect(await resolveVoucherFallbackColumn(probe)).toBe(true)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('answers absent when the probe throws', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await resolveVoucherFallbackColumn(probe)).toBe(false)
  })
})
