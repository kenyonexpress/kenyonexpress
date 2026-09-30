import { describe, expect, it } from 'vitest'
import {
  addressMatches,
  adminAllowlistDecision,
  isAdminPerimeterPath,
  isAllowedAddress,
  isAllowlistConfigured,
  parseAddress,
  parseAllowlist,
  parseAllowlistEntry,
} from './ip-allowlist'

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

describe('parseAddress', () => {
  it('reads a dotted quad', () => {
    const parsed = parseAddress('203.0.113.7')
    expect(parsed?.family).toBe(4)
    expect(hex(parsed?.bytes ?? new Uint8Array())).toBe('cb007107')
  })

  it.each(['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.-4', 'a.b.c.d', ''])(
    'rejects the malformed IPv4 %j',
    (raw) => {
      expect(parseAddress(raw)).toBeNull()
    },
  )

  it('reads full, compressed and trailing-dotted IPv6', () => {
    expect(hex(parseAddress('2001:db8::1')?.bytes ?? new Uint8Array())).toBe(
      '20010db8000000000000000000000001',
    )
    expect(hex(parseAddress('::')?.bytes ?? new Uint8Array())).toBe('0'.repeat(32))
    expect(hex(parseAddress('2001:DB8:0:0:0:0:0:1')?.bytes ?? new Uint8Array())).toBe(
      '20010db8000000000000000000000001',
    )
    expect(hex(parseAddress('64:ff9b::203.0.113.7')?.bytes ?? new Uint8Array())).toBe(
      '0064ff9b0000000000000000cb007107',
    )
  })

  it('folds an IPv4-mapped IPv6 address back to IPv4', () => {
    const parsed = parseAddress('::ffff:203.0.113.7')
    expect(parsed?.family).toBe(4)
    expect(hex(parsed?.bytes ?? new Uint8Array())).toBe('cb007107')
  })

  it.each([
    '2001:db8:::1',
    '2001:db8::1::2',
    '1:2:3:4:5:6:7:8:9',
    '12345::1',
    'fe80::1%eth0',
    ':::',
  ])('rejects the malformed IPv6 %j', (raw) => {
    expect(parseAddress(raw)).toBeNull()
  })

  it('trims and treats blank as absent', () => {
    expect(parseAddress('  10.0.0.1 ')?.family).toBe(4)
    expect(parseAddress('   ')).toBeNull()
    expect(parseAddress(null)).toBeNull()
    expect(parseAddress(undefined)).toBeNull()
  })
})

describe('parseAllowlistEntry', () => {
  it('defaults a bare address to a host prefix', () => {
    expect(parseAllowlistEntry('203.0.113.7')?.prefix).toBe(32)
    expect(parseAllowlistEntry('2001:db8::1')?.prefix).toBe(128)
  })

  it('reads a CIDR prefix inside the family range', () => {
    expect(parseAllowlistEntry('10.0.0.0/8')?.prefix).toBe(8)
    expect(parseAllowlistEntry('2001:db8::/32')?.prefix).toBe(32)
    expect(parseAllowlistEntry('0.0.0.0/0')?.prefix).toBe(0)
  })

  it.each(['10.0.0.0/33', '2001:db8::/129', '10.0.0.0/', '10.0.0.0/-1', '10.0.0.0/8/8', '/8'])(
    'rejects the malformed entry %j',
    (raw) => {
      expect(parseAllowlistEntry(raw)).toBeNull()
    },
  )
})

describe('parseAllowlist', () => {
  it('splits on commas, spaces and newlines and keeps the rejects by name', () => {
    const { entries, rejected } = parseAllowlist(' 203.0.113.7, 10.0.0.0/8\n2001:db8::/32 bogus ,,')
    expect(entries.map((e) => e.source)).toEqual(['203.0.113.7', '10.0.0.0/8', '2001:db8::/32'])
    expect(rejected).toEqual(['bogus'])
  })

  it('is empty for an unset variable', () => {
    expect(parseAllowlist(undefined)).toEqual({ entries: [], rejected: [] })
    expect(parseAllowlist('')).toEqual({ entries: [], rejected: [] })
  })
})

describe('addressMatches / isAllowedAddress', () => {
  const entries = parseAllowlist('10.0.0.0/8, 203.0.113.7, 2001:db8::/32, 192.168.1.0/25').entries

  it('matches a host entry exactly', () => {
    expect(isAllowedAddress('203.0.113.7', entries)).toBe(true)
    expect(isAllowedAddress('203.0.113.8', entries)).toBe(false)
  })

  it('matches on the prefix, including a prefix that is not byte aligned', () => {
    expect(isAllowedAddress('10.255.255.255', entries)).toBe(true)
    expect(isAllowedAddress('11.0.0.0', entries)).toBe(false)
    expect(isAllowedAddress('192.168.1.127', entries)).toBe(true)
    expect(isAllowedAddress('192.168.1.128', entries)).toBe(false)
  })

  it('matches IPv6 on its prefix and never across families', () => {
    expect(isAllowedAddress('2001:db8:ffff::1', entries)).toBe(true)
    expect(isAllowedAddress('2001:db9::1', entries)).toBe(false)
    // A v6 entry does not admit the v4 with the same leading bytes, and vice versa.
    const v6Host = parseAllowlistEntry('::203.0.113.7')
    const v4 = parseAddress('203.0.113.7')
    expect(v6Host && v4 && addressMatches(v4, v6Host)).toBe(false)
  })

  it('admits an IPv4-mapped client on a v4 entry', () => {
    expect(isAllowedAddress('::ffff:10.1.2.3', entries)).toBe(true)
  })

  it('a /0 admits everything in its family', () => {
    const any4 = parseAllowlist('0.0.0.0/0').entries
    expect(isAllowedAddress('198.51.100.1', any4)).toBe(true)
    expect(isAllowedAddress('2001:db8::1', any4)).toBe(false)
  })

  it('refuses an unreadable or missing address', () => {
    expect(isAllowedAddress(null, entries)).toBe(false)
    expect(isAllowedAddress('unknown', entries)).toBe(false)
    expect(isAllowedAddress('', entries)).toBe(false)
  })
})

describe('adminAllowlistDecision', () => {
  it('is open when the variable is unset or blank', () => {
    expect(adminAllowlistDecision('203.0.113.7', undefined)).toBe('open')
    expect(adminAllowlistDecision('203.0.113.7', '')).toBe('open')
    expect(adminAllowlistDecision(null, '  \n')).toBe('open')
    expect(isAllowlistConfigured('  ')).toBe(false)
  })

  it('allows a listed address and denies an unlisted one', () => {
    expect(adminAllowlistDecision('203.0.113.7', '203.0.113.0/24')).toBe('allow')
    expect(adminAllowlistDecision('203.0.114.7', '203.0.113.0/24')).toBe('deny')
  })

  it('fails closed on a missing address', () => {
    expect(adminAllowlistDecision(null, '203.0.113.0/24')).toBe('deny')
    expect(adminAllowlistDecision('unknown', '203.0.113.0/24')).toBe('deny')
  })

  it('fails closed when the list is set but parses to nothing', () => {
    // A typo must not switch the perimeter off.
    expect(adminAllowlistDecision('203.0.113.7', 'office-ip')).toBe('deny')
    expect(isAllowlistConfigured('office-ip')).toBe(true)
  })

  it('ignores a bad token beside a good one', () => {
    expect(adminAllowlistDecision('203.0.113.7', 'bogus, 203.0.113.7')).toBe('allow')
  })
})

describe('isAdminPerimeterPath', () => {
  it('covers the panel, the MFA page and the admin API', () => {
    expect(isAdminPerimeterPath('/admin')).toBe(true)
    expect(isAdminPerimeterPath('/admin/orders/1')).toBe(true)
    expect(isAdminPerimeterPath('/admin-mfa')).toBe(true)
    expect(isAdminPerimeterPath('/api/admin/coupon-qr/redeem')).toBe(true)
  })

  it('leaves the storefront, the account and the other APIs alone', () => {
    expect(isAdminPerimeterPath('/')).toBe(false)
    expect(isAdminPerimeterPath('/account')).toBe(false)
    expect(isAdminPerimeterPath('/api/cart')).toBe(false)
    expect(isAdminPerimeterPath('/api/admins')).toBe(false)
  })
})
