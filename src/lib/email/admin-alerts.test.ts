import { DEFAULT_CONTACT_EMAIL } from '@/lib/contact-address'
import { describe, expect, it } from 'vitest'
import { adminAlertDedupeKey, adminAlertRecipient } from './admin-alerts'

/**
 * Operator alerts (marathon step 7; the module had no tests). Small on
 * purpose -- what is worth pinning is the dedupe key SHAPE, because the whole
 * point of the module is that one problem mails an operator once, not every
 * ten minutes for as long as the cron keeps rediscovering it.
 */

describe('adminAlertRecipient', () => {
  it('reads CONTACT_TO from the given env, the same variable the contact form uses', () => {
    const env = { CONTACT_TO: 'ops@example.test' } as unknown as NodeJS.ProcessEnv
    expect(adminAlertRecipient(env)).toBe('ops@example.test')
  })

  it('falls back to the published address rather than an empty To:', () => {
    expect(adminAlertRecipient({} as unknown as NodeJS.ProcessEnv)).toBe(DEFAULT_CONTACT_EMAIL)
  })
})

describe('adminAlertDedupeKey', () => {
  it('keys by the thing that is wrong, never by the moment it was noticed', () => {
    // The invoice cron runs every ten minutes and keeps finding the same dead
    // row; a stable key is what turns that into ONE email.
    expect(adminAlertDedupeKey('invoice_dead', 'inv-42')).toBe('admin:invoice_dead:inv-42')
    expect(adminAlertDedupeKey('invoice_dead', 'inv-42')).toBe(
      adminAlertDedupeKey('invoice_dead', 'inv-42'),
    )
  })

  it('distinguishes kinds for the same subject', () => {
    expect(adminAlertDedupeKey('low_stock', 'x')).not.toBe(
      adminAlertDedupeKey('reconciliation_gap', 'x'),
    )
  })

  it('lets low_stock re-alert daily by carrying the date in the subject id', () => {
    // Not a contradiction of the rule above: an ongoing situation is worth
    // one mail a day, and the CALLER opts into that by dating the subject.
    expect(adminAlertDedupeKey('low_stock', 'prod-7:2026-09-04')).toBe(
      'admin:low_stock:prod-7:2026-09-04',
    )
  })
})
