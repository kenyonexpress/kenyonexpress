import {
  decideEvent,
  firstRecipient,
  isPermanentBounce,
  templateFromTags,
} from '@/server/email/resend-events'
import { describe, expect, it } from 'vitest'

describe('isPermanentBounce', () => {
  it('is true for a permanent bounce', () => {
    expect(isPermanentBounce({ type: 'Permanent', subType: 'General' })).toBe(true)
  })

  it('is FALSE for a transient one, which is the line that matters most', () => {
    // A full mailbox, a greylisting deferral or a receiver having a bad
    // afternoon all arrive as `email.bounced`. Suppressing on those would
    // permanently stop mailing customers whose address is fine, including the
    // coupon they already paid for.
    expect(isPermanentBounce({ type: 'Transient', subType: 'MailboxFull' })).toBe(false)
    expect(isPermanentBounce({ type: 'Undetermined' })).toBe(false)
  })

  it('is true when SES says the address is already on its own suppression list', () => {
    expect(isPermanentBounce({ subType: 'Suppressed' })).toBe(true)
  })

  it('does not suppress on a shape it does not recognise', () => {
    // The default direction costs a bounce we mail again, not a customer we
    // silently stop mailing.
    expect(isPermanentBounce(undefined)).toBe(false)
    expect(isPermanentBounce(null)).toBe(false)
    expect(isPermanentBounce('Permanent')).toBe(false)
    expect(isPermanentBounce({})).toBe(false)
  })
})

describe('templateFromTags', () => {
  it('reads the array form Resend sends', () => {
    expect(templateFromTags([{ name: 'template', value: 'coupon-delivery' }])).toBe(
      'coupon-delivery',
    )
  })

  it('reads the object form', () => {
    expect(templateFromTags({ template: 'order-confirmation' })).toBe('order-confirmation')
  })

  it('reads `kind`, which is what the marketing sender tags with', () => {
    // Two senders, two tag names, and neither is renamed: a tag is attached to
    // mail already in flight, so renaming orphans events still to arrive.
    expect(templateFromTags([{ name: 'kind', value: 'weekly-digest' }])).toBe('weekly-digest')
  })

  it('falls back to unknown rather than throwing on anything else', () => {
    expect(templateFromTags(undefined)).toBe('unknown')
    expect(templateFromTags('coupon')).toBe('unknown')
    expect(templateFromTags([{ name: 'campaign', value: 'x' }])).toBe('unknown')
    expect(templateFromTags([null, 7, { name: 'template' }])).toBe('unknown')
  })
})

describe('firstRecipient', () => {
  it('reads the array Resend sends and normalises it', () => {
    expect(firstRecipient([' Person@Example.COM '])).toBe('person@example.com')
  })

  it('reads a bare string too', () => {
    expect(firstRecipient('A@B.com')).toBe('a@b.com')
  })

  it('is null when there is nobody', () => {
    expect(firstRecipient([])).toBeNull()
    expect(firstRecipient(undefined)).toBeNull()
    expect(firstRecipient([''])).toBeNull()
  })
})

describe('decideEvent', () => {
  const bounce = (bounceData: unknown) => ({
    type: 'email.bounced',
    data: {
      to: ['x@y.com'],
      tags: [{ name: 'template', value: 'coupon-delivery' }],
      bounce: bounceData,
    },
  })

  it('suppresses on a permanent bounce', () => {
    expect(decideEvent(bounce({ type: 'Permanent' }))).toEqual({
      counter: 'bounced',
      suppress: { email: 'x@y.com', reason: 'hard_bounce' },
      template: 'coupon-delivery',
    })
  })

  it('counts a soft bounce but does not suppress', () => {
    // Counted, because "this template bounces a lot" is exactly what the
    // counters are for, and dropping soft bounces would make a deliverability
    // problem look like the absence of one.
    expect(decideEvent(bounce({ type: 'Transient' }))).toEqual({
      counter: 'bounced',
      suppress: null,
      template: 'coupon-delivery',
    })
  })

  it('suppresses on a complaint regardless of anything else', () => {
    expect(decideEvent({ type: 'email.complained', data: { to: ['a@b.com'] } })).toEqual({
      counter: 'complained',
      suppress: { email: 'a@b.com', reason: 'complaint' },
      template: 'unknown',
    })
  })

  it('counts an open and a click without suppressing anything', () => {
    for (const [type, counter] of [
      ['email.opened', 'opened'],
      ['email.clicked', 'clicked'],
      ['email.delivered', 'delivered'],
      ['email.delivery_delayed', 'delivery_delayed'],
    ] as const) {
      expect(decideEvent({ type, data: { to: ['a@b.com'] } })).toEqual({
        counter,
        suppress: null,
        template: 'unknown',
      })
    }
  })

  it('counts nothing for an event kind it does not know', () => {
    expect(decideEvent({ type: 'email.teleported', data: { to: ['a@b.com'] } })).toEqual({
      counter: null,
      suppress: null,
      template: 'unknown',
    })
  })

  it('never suppresses when the event names no recipient', () => {
    expect(decideEvent({ type: 'email.complained', data: {} }).suppress).toBeNull()
    expect(decideEvent({ type: 'email.complained' }).suppress).toBeNull()
  })
})
