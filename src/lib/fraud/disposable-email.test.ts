import {
  DISPOSABLE_DOMAIN_COUNT,
  canonicalEmail,
  emailDomain,
  isDisposableEmail,
  sameInbox,
} from '@/lib/fraud/disposable-email'
import { describe, expect, it } from 'vitest'

describe('isDisposableEmail', () => {
  it('finds the list at all, so a broken import cannot pass vacuously', () => {
    expect(DISPOSABLE_DOMAIN_COUNT).toBeGreaterThan(30)
  })

  it('blocks known throwaway providers', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true)
    expect(isDisposableEmail('a@guerrillamail.com')).toBe(true)
    expect(isDisposableEmail('a@yopmail.com')).toBe(true)
  })

  it('blocks subdomains, because these providers hand them out freely', () => {
    expect(isDisposableEmail('a@team.mailinator.com')).toBe(true)
  })

  it('does not block a domain that merely ENDS with a blocked one', () => {
    // `notmailinator.com` is somebody else's domain. A naive `endsWith` without
    // the dot would refuse it, and the person behind it is a customer.
    expect(isDisposableEmail('a@notmailinator.com')).toBe(false)
  })

  it('leaves real providers alone', () => {
    for (const address of ['a@gmail.com', 'a@walla.co.il', 'a@outlook.com', 'a@company.co.il']) {
      expect(isDisposableEmail(address), address).toBe(false)
    }
  })

  it('is case and whitespace insensitive, because a form is', () => {
    expect(isDisposableEmail('  A@MailInator.COM ')).toBe(true)
  })

  it('answers false rather than throwing on something that is not an address', () => {
    for (const value of ['', 'nope', '@', 'a@', '@b.com']) {
      expect(isDisposableEmail(value), value).toBe(false)
    }
  })
})

describe('emailDomain', () => {
  it('takes the LAST @, because a quoted local part may contain one', () => {
    expect(emailDomain('"a@b"@example.com')).toBe('example.com')
  })

  it('is null when there is no domain to name', () => {
    expect(emailDomain('a@')).toBeNull()
    expect(emailDomain('plain')).toBeNull()
  })
})

describe('canonicalEmail', () => {
  it('folds Gmail dots and plus tags to one inbox', () => {
    expect(canonicalEmail('a.b+promo@gmail.com')).toBe('ab@gmail.com')
    expect(canonicalEmail('ab@googlemail.com')).toBe('ab@googlemail.com')
  })

  it('strips plus tags everywhere but folds dots ONLY on Gmail', () => {
    // The distinction is the point: dots are significant at most hosts, so
    // folding them everywhere would declare two different people one person.
    expect(canonicalEmail('first.last+tag@outlook.com')).toBe('first.last@outlook.com')
  })

  it('never returns an empty local part', () => {
    expect(canonicalEmail('+tag@gmail.com')).toBe('+tag@gmail.com')
  })

  it('leaves an ordinary address alone apart from case', () => {
    expect(canonicalEmail('  Person@Company.co.il ')).toBe('person@company.co.il')
  })
})

describe('sameInbox', () => {
  it('sees through the aliasing a first-order discount is farmed with', () => {
    expect(sameInbox('shopper@gmail.com', 's.h.o.p.p.e.r+1@gmail.com')).toBe(true)
    expect(sameInbox('shopper@gmail.com', 'shopper2@gmail.com')).toBe(false)
  })

  it('does not conflate the same local part at different hosts', () => {
    expect(sameInbox('a@gmail.com', 'a@outlook.com')).toBe(false)
  })
})
