import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CONTACT_FIELDS,
  CONTACT_FIELD_LABEL_HE,
  type ContactField,
  isContactField,
  isSameValue,
  validateContactValue,
} from './contact-fields'

describe('which fields a supplier may ask to change', () => {
  /**
   * The list is the security boundary: `field` becomes a COLUMN NAME in the
   * approval write (`admin.from('suppliers').update({ [row.field]: ... })`).
   * Anything that reaches that object key and is not a contact detail is a
   * supplier editing something they must not.
   */
  it.each(['name', 'business_id', 'min_payout_ils', 'payout_hold_business_days', 'status', 'id'])(
    'refuses %s, which is not a contact detail',
    (field) => {
      expect(isContactField(field)).toBe(false)
    },
  )

  it('refuses values that are not strings at all', () => {
    for (const value of [null, undefined, 42, {}, ['city']]) {
      expect(isContactField(value)).toBe(false)
    }
  })

  it('labels every field it allows', () => {
    for (const field of CONTACT_FIELDS) {
      expect(CONTACT_FIELD_LABEL_HE[field]).toBeTruthy()
    }
  })

  /**
   * The TypeScript list and the CHECK constraint in
   * `225_supplier_contact_requests.sql` have to name the same seven columns. If
   * they drift, one side refuses what the other accepts: a field added here but
   * not there is a 23514 the supplier reads as "the site is broken", and a
   * field added there but not here is a column this module never validates.
   */
  it('names exactly the fields the migration allows', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'migrations/pending/225_supplier_contact_requests.sql'),
      'utf8',
    )
    const check = sql.match(/CHECK \(field IN \(([^)]+)\)\)/)
    expect(check, 'the field allowlist CHECK is gone from 225').toBeTruthy()
    const inMigration = [...(check?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...inMigration].sort()).toEqual([...CONTACT_FIELDS].sort())
  })
})

describe('validating a requested value', () => {
  it('refuses a blank value rather than treating it as a deletion', () => {
    // The migration's `c_len` CHECK requires a non-empty `requested_value`, so
    // an empty one could not be stored anyway -- but the point is that the
    // table cannot express "make this blank" at all, so the form must not
    // pretend it can.
    const result = validateContactValue('city', '   ')
    expect(result.ok).toBe(false)
  })

  it('refuses a value past the length the migration allows', () => {
    expect(validateContactValue('address', 'x'.repeat(301)).ok).toBe(false)
    expect(validateContactValue('address', 'x'.repeat(300)).ok).toBe(true)
  })

  it('trims before storing, so an invisible space cannot survive approval', () => {
    const result = validateContactValue('city', '  תל אביב  ')
    expect(result).toEqual({ ok: true, value: 'תל אביב' })
  })

  it('lower-cases an email so one address cannot arrive twice looking different', () => {
    expect(validateContactValue('contact_email', 'Info@Example.COM')).toEqual({
      ok: true,
      value: 'info@example.com',
    })
  })

  it.each(['plain', 'no@domain', 'a b@example.com', '@example.com', 'x@y'])(
    'refuses %s as an email',
    (value) => {
      expect(validateContactValue('contact_email', value).ok).toBe(false)
    },
  )

  it('keeps a phone number in the local form the supplier typed', () => {
    // Not normalised to 972...: every existing row in this column is local, and
    // the approval queue must show an admin what was actually asked for.
    expect(validateContactValue('contact_phone', '03-1234567')).toEqual({
      ok: true,
      value: '03-1234567',
    })
  })

  it('refuses a landline for WhatsApp', () => {
    // A landline has no WhatsApp account, so storing one produces a link that
    // opens WhatsApp only to say the number is not on it.
    expect(validateContactValue('whatsapp', '03-1234567').ok).toBe(false)
    expect(validateContactValue('whatsapp', '052-4635550').ok).toBe(true)
  })

  it('adds a scheme to a bare host rather than storing a relative link', () => {
    // Stored bare, `example.co.il` rendered as an href resolves against our own
    // domain.
    expect(validateContactValue('website', 'example.co.il')).toEqual({
      ok: true,
      value: 'https://example.co.il',
    })
  })

  /**
   * `new URL` accepts these happily, and the scheme-prefixing branch only runs
   * when there was no scheme at all -- so a value arriving WITH one reaches the
   * protocol check unchanged. This value ends up in an href on an admin screen.
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'mailto:a@b.com', 'file:///etc'])(
    'refuses %s as a website',
    (value) => {
      expect(validateContactValue('website', value).ok).toBe(false)
    },
  )

  it('refuses a hostname with no dot', () => {
    expect(validateContactValue('website', 'https://localhost').ok).toBe(false)
  })

  /**
   * The regression this file caught. Prefixing `https://` onto anything not
   * starting with `http` turned `mailto:a@b.com` into `https://mailto:a@b.com`,
   * which parses as host `b.com` with `mailto:a` as userinfo and passed every
   * other check. Credentials in a URL are the shape of a phishing link, and no
   * business website address has them.
   */
  it.each([
    'https://real.co.il@evil.com',
    'http://user:pass@example.com',
    'https://mailto:a@b.com',
  ])('refuses %s, which navigates somewhere other than it reads', (value) => {
    expect(validateContactValue('website', value).ok).toBe(false)
  })

  it('accepts every allowed field for at least one value', () => {
    // A field added to CONTACT_FIELDS with no case in the switch would fall
    // through and return undefined, which reads as a crash rather than a
    // refusal.
    const samples: Record<ContactField, string> = {
      contact_name: 'דנה כהן',
      contact_email: 'a@b.com',
      contact_phone: '03-1234567',
      whatsapp: '052-4635550',
      address: 'הרצל 1',
      city: 'חיפה',
      website: 'https://example.com',
    }
    for (const field of CONTACT_FIELDS) {
      expect(validateContactValue(field, samples[field]).ok, field).toBe(true)
    }
  })
})

describe('a request that changes nothing', () => {
  it('is recognised across whitespace and a null current value', () => {
    expect(isSameValue('חיפה', ' חיפה ')).toBe(true)
    expect(isSameValue(null, 'חיפה')).toBe(false)
    expect(isSameValue(null, '')).toBe(true)
    expect(isSameValue('חיפה', 'תל אביב')).toBe(false)
  })
})
