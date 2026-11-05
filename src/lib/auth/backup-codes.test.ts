import { describe, expect, it } from 'vitest'
import {
  BACKUP_CODE_COUNT,
  formatBackupCode,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
  parseBackupCodeStore,
  redeemFromStore,
} from './backup-codes'

describe('backup codes', () => {
  it('issues eight distinct ten-character codes from the safe alphabet, shown with a dash', () => {
    const { codes, store } = generateBackupCodes(new Date('2026-11-05T00:00:00Z'))
    expect(codes).toHaveLength(BACKUP_CODE_COUNT)
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT)
    for (const code of codes) {
      expect(code).toMatch(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/,
      )
    }
    expect(store.hashes).toHaveLength(BACKUP_CODE_COUNT)
    expect(store.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(store.issued_at).toBe('2026-11-05T00:00:00.000Z')
    // The plaintext never appears in the store.
    for (const code of codes) expect(JSON.stringify(store)).not.toContain(normalizeBackupCode(code))
  })

  it('hashes with the salt, so the same code hashes differently per user', () => {
    const a = hashBackupCode('ABCDE-FGHJK', '00'.repeat(16))
    const b = hashBackupCode('ABCDE-FGHJK', 'ff'.repeat(16))
    expect(a).not.toBe(b)
    expect(hashBackupCode('abcde fghjk', '00'.repeat(16))).toBe(a)
  })

  it('redeems a code once, in any case or spacing, and removes it from the store', () => {
    const { codes, store } = generateBackupCodes()
    const first = codes[0] as string
    const r1 = redeemFromStore(store, first.toLowerCase().replace('-', ' '))
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.remaining).toBe(BACKUP_CODE_COUNT - 1)
    const r2 = redeemFromStore(r1.store, first)
    expect(r2).toEqual({ ok: false, reason: 'no_match' })
    // The other seven still work.
    expect(redeemFromStore(r1.store, codes[1] as string).ok).toBe(true)
  })

  it('refuses when no codes were ever issued, and refuses a wrong code', () => {
    expect(redeemFromStore(null, 'ABCDE-FGHJK')).toEqual({ ok: false, reason: 'no_codes' })
    expect(
      redeemFromStore({ salt: '00'.repeat(16), hashes: [], issued_at: '' }, 'ABCDE-FGHJK'),
    ).toEqual({
      ok: false,
      reason: 'no_codes',
    })
    const { store } = generateBackupCodes()
    expect(redeemFromStore(store, 'ABCDE-FGHJK')).toEqual({ ok: false, reason: 'no_match' })
    expect(redeemFromStore(store, 'short')).toEqual({ ok: false, reason: 'no_match' })
  })

  it('parses only a well-formed store out of app_metadata', () => {
    const { store } = generateBackupCodes()
    expect(parseBackupCodeStore(store)).toEqual(store)
    expect(parseBackupCodeStore(null)).toBeNull()
    expect(parseBackupCodeStore({ salt: 'zz', hashes: [] })).toBeNull()
    expect(parseBackupCodeStore({ salt: '00'.repeat(16), hashes: [1] })).toBeNull()
    expect(parseBackupCodeStore({ salt: '00'.repeat(16), hashes: ['a'] })).toEqual({
      salt: '00'.repeat(16),
      hashes: ['a'],
      issued_at: '',
    })
  })

  it('formats and normalises symmetrically', () => {
    expect(formatBackupCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
    expect(normalizeBackupCode('abcde-fghjk')).toBe('ABCDEFGHJK')
  })
})
