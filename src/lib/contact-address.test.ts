import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTACT_EMAIL, contactEmail, supportEmail } from './contact-address'

describe('contactEmail', () => {
  it('falls back to the published address when CONTACT_TO is unset or blank', () => {
    expect(contactEmail({})).toBe(DEFAULT_CONTACT_EMAIL)
    expect(contactEmail({ CONTACT_TO: '   ' })).toBe(DEFAULT_CONTACT_EMAIL)
  })

  it('uses CONTACT_TO, trimmed, when set', () => {
    expect(contactEmail({ CONTACT_TO: ' ops@example.com ' })).toBe('ops@example.com')
  })
})

describe('supportEmail', () => {
  it('is SUPPORT_TO when set', () => {
    expect(supportEmail({ SUPPORT_TO: 'ofir@example.com', CONTACT_TO: 'info@example.com' })).toBe(
      'ofir@example.com',
    )
  })

  it('falls through to CONTACT_TO, then to the published address, so nothing is dropped', () => {
    expect(supportEmail({ CONTACT_TO: 'info@example.com' })).toBe('info@example.com')
    expect(supportEmail({ SUPPORT_TO: '', CONTACT_TO: 'info@example.com' })).toBe(
      'info@example.com',
    )
    expect(supportEmail({})).toBe(DEFAULT_CONTACT_EMAIL)
  })
})
